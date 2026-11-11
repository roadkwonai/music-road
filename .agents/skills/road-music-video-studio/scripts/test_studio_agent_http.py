"""The browser may submit requests for registered projects, never bind or ACK them."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import types
import unittest
from unittest.mock import Mock, patch
from http.server import ThreadingHTTPServer

from studio import Session, init_project, make_handler, serve


class AgentHTTPTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name).resolve()
        self.environment = patch.dict(os.environ, {'ROADMUSIC_DATA_DIR': str(self.root / 'profile'), 'ROADMUSIC_DELIVERY_ROOT': str(self.root)})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.project = Path(init_project(str(self.root / 'desk'))['project'])
        self.project_id = hashlib.sha256(str(self.project).encode()).hexdigest()
        self.agent = Mock()
        self.agent.context.return_value = {'projectId': self.project_id, 'projectName': '테스트 제작실', 'baseVersionId': 'b' * 64, 'connection': {'connected': False}, 'media': []}
        self.agent.requests.return_value = {'requests': []}
        self.agent.history.return_value = {'threadId': '12345678-1234-1234-1234-123456789abc', 'turns': [], 'nextCursor': None}
        self.agent.draft_get.return_value = {'projectId': self.project_id, 'scope': 'detail', 'draft': None}
        self.agent.draft_set.return_value = {'projectId': self.project_id, 'scope': 'detail', 'draft': {'target': 'lyrics'}, 'savedAt': '2026-10-21T00:00:00Z'}
        self.agent.submit.return_value = {'requestId': 'a' * 48, 'status': 'queued'}
        self.module = patch.dict('sys.modules', {'studio_agent': types.SimpleNamespace(StudioAgent=Mock(return_value=self.agent))})
        self.module.start()
        self.addCleanup(self.module.stop)
        self.session = Session(self.project, review=True)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.session))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, method, path, value=None, headers=None, token=True):
        origin = f'http://127.0.0.1:{self.server.server_port}'
        if token:
            path += ('&' if '?' in path else '?') + 'token=' + self.session.token
        supplied = {'Content-Type': 'application/json', 'Origin': origin, 'X-Studio-Token': self.session.token}
        supplied.update(headers or {})
        client = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        client.request(method, path, body=json.dumps(value).encode() if value is not None else None, headers=supplied)
        response = client.getresponse()
        status, body = response.status, response.read()
        client.close()
        return status, json.loads(body)

    def test_context_is_scoped_to_current_project(self):
        status, result = self.request('GET', '/api/agent/context')
        self.assertEqual(status, 200)
        self.assertEqual(result['projects'][0]['projectId'], self.project_id)
        self.agent.context.assert_called_once_with(self.project)
        self.assertEqual(self.request('GET', '/api/agent/context?project=/tmp/other')[0], 422)
        self.assertEqual(self.request('GET', '/api/agent/context?projectId=' + 'f' * 64)[0], 422)

    def test_request_uses_server_project_and_cannot_choose_thread_or_path(self):
        params = {'projectId': self.project_id, 'requestId': 'a' * 48, 'baseVersionId': 'b' * 64, 'prompt': '후렴을 검토해 주세요', 'target': 'music', 'intent': 'review'}
        status, saved = self.request('POST', '/api/agent/requests', params)
        self.assertEqual(status, 201)
        self.assertEqual(saved['status'], 'queued')
        self.agent.submit.assert_called_once_with(self.project, {key: value for key, value in params.items() if key != 'projectId'})
        self.assertEqual(self.request('POST', '/api/agent/requests', {**params, 'threadId': 'other'})[0], 422)
        self.assertEqual(self.request('POST', '/api/agent/requests', {**params, 'project': '/tmp/other'})[0], 422)
        self.assertEqual(self.request('POST', '/api/agent/bind', params)[0], 404)
        self.assertEqual(self.request('POST', '/api/agent/update', params)[0], 404)
        self.assertEqual(self.agent.submit.call_count, 1)

    def test_origin_token_and_unknown_project_are_rejected(self):
        params = {'projectId': self.project_id, 'requestId': 'a' * 48}
        self.assertEqual(self.request('GET', '/api/agent/context', token=False)[0], 403)
        self.assertEqual(self.request('POST', '/api/agent/requests', params, headers={'Origin': 'https://example.com'})[0], 403)
        self.assertEqual(self.request('POST', '/api/agent/requests', {**params, 'projectId': 'f' * 64})[0], 422)
        self.agent.submit.assert_not_called()

    def test_request_status_is_scoped_and_query_is_strict(self):
        status, result = self.request('GET', '/api/agent/requests?projectId=' + self.project_id + '&requestId=' + 'a' * 48)
        self.assertEqual(status, 200)
        self.assertEqual(result, {'requests': []})
        self.agent.requests.assert_called_once_with(self.project, 'a' * 48)
        self.assertEqual(self.request('GET', '/api/agent/requests?projectId=' + self.project_id + '&requestId=bad')[0], 422)
        self.assertEqual(self.request('GET', '/api/agent/context?groupId=bad')[0], 422)
        self.assertEqual(self.request('GET', '/api/agent/context?projectId=' + self.project_id + '&projectId=' + self.project_id)[0], 422)

    def test_history_is_scoped_and_browser_cannot_choose_thread_or_rpc(self):
        status, result = self.request('GET', '/api/agent/history?projectId=' + self.project_id + '&cursor=older&limit=2')
        self.assertEqual(status, 200)
        self.assertEqual(result['turns'], [])
        self.agent.history.assert_called_once_with(self.project, {'cursor': 'older', 'limit': 2})
        self.assertEqual(self.request('GET', '/api/agent/history?projectId=' + self.project_id + '&threadId=other')[0], 422)
        self.assertEqual(self.request('GET', '/api/agent/history?projectId=' + self.project_id + '&method=turn%2Fstart')[0], 422)
        self.assertEqual(self.request('GET', '/api/agent/history?projectId=' + 'f' * 64)[0], 422)

    def test_draft_is_scoped_and_cannot_inject_project_or_origin(self):
        path = '/api/agent/draft?projectId=' + self.project_id + '&scope=detail'
        status, result = self.request('GET', path)
        self.assertEqual((status, result['draft']), (200, None))
        self.agent.draft_get.assert_called_once_with(self.project, {'scope': 'detail'})
        value = {'projectId': self.project_id, 'scope': 'detail', 'draft': {'target': 'lyrics', 'intent': 'review', 'prompt': '초안'}}
        status, result = self.request('POST', '/api/agent/draft', value)
        self.assertEqual((status, result['draft']['target']), (200, 'lyrics'))
        self.agent.draft_set.assert_called_once_with(self.project, {'scope': 'detail', 'draft': value['draft']})
        self.assertEqual(self.request('GET', '/api/agent/draft?projectId=' + self.project_id + '&scope=bad')[0], 422)
        self.assertEqual(self.request('POST', '/api/agent/draft', {**value, 'scope': []})[0], 422)
        self.assertEqual(self.request('POST', '/api/agent/draft', {**value, 'groupId': 'f' * 64})[0], 422)
        self.assertEqual(self.request('POST', '/api/agent/draft', value, headers={'Origin': 'https://example.com'})[0], 403)
        self.assertEqual(self.agent.draft_set.call_count, 1)

    def test_group_project_must_still_belong_to_source(self):
        group_id = 'c' * 64
        data = json.loads((self.project / 'studio-project.json').read_text())
        data['media'] = [{'id': 'music', 'sha256': group_id}]
        (self.project / 'studio-project.json').write_text(json.dumps(data))
        self.session.library.group = Mock(return_value={'groupId': group_id, 'files': [{'project': str(self.project)}]})
        status, result = self.request('GET', '/api/agent/context?groupId=' + group_id)
        self.assertEqual(status, 200)
        self.assertEqual(len(result['projects']), 1)
        data['media'][0]['sha256'] = 'd' * 64
        (self.project / 'studio-project.json').write_text(json.dumps(data))
        self.assertEqual(self.request('GET', '/api/agent/requests?groupId=' + group_id + '&projectId=' + self.project_id)[0], 422)

    def test_start_binds_only_projects_without_a_previous_conversation(self):
        self.session.done.set()
        with patch('studio.Session', return_value=self.session), patch.dict(os.environ, {'CODEX_THREAD_ID': '11111111-1111-4111-8111-111111111111'}), patch('studio.print'):
            self.agent.connection.return_value = {'threadId': None, 'connected': False}
            serve(self.project, timeout=1, review=True, session_file=self.root / 'serve.json')
            self.agent.bind.assert_called_once_with(self.project)
            self.agent.bind.reset_mock()
            self.agent.connection.return_value = {'threadId': '22222222-2222-4222-8222-222222222222', 'connected': True}
            serve(self.project, timeout=1, review=True, session_file=self.root / 'serve.json')
            self.agent.bind.assert_not_called()

    def test_group_context_distinguishes_original_and_finished_audio_players(self):
        group_id = 'c' * 64
        data = json.loads((self.project / 'studio-project.json').read_text())
        data['media'] = [{'id': 'music', 'sha256': group_id}]
        (self.project / 'studio-project.json').write_text(json.dumps(data))
        self.session.library.group = Mock(return_value={'groupId': group_id, 'source': {'kind': 'source', 'sha256': group_id, 'id': 'e' * 64, 'available': True}, 'files': [{'project': str(self.project), 'kind': 'music', 'sha256': group_id, 'id': 'f' * 64, 'available': True}]})
        self.agent.context.return_value['media'] = [{'id': 'music', 'kind': 'music', 'sha256': group_id}, {'id': 'music-0', 'kind': 'music', 'sha256': group_id}]
        status, result = self.request('GET', '/api/agent/context?groupId=' + group_id)
        self.assertEqual(status, 200)
        source, finished = result['projects'][0]['media']
        self.assertIn('/files/' + 'e' * 64, source['url'])
        self.assertIn('/files/' + 'f' * 64, finished['url'])


if __name__ == '__main__':
    unittest.main()
