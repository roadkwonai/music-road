#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from codex_history import CodexHistory, CodexHistoryError


THREAD = "12345678-1234-1234-1234-123456789abc"


class CodexHistoryTests(unittest.TestCase):
    def run_fake_reader(self, source):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'fake-codex.py'
            executable.write_text(source, encoding='utf-8')
            launch = subprocess.Popen
            def spawn(arguments, **kwargs):
                self.assertEqual(arguments[1:], ['app-server', '--stdio'])
                return launch([sys.executable, str(executable), *arguments[1:]], **kwargs)
            with patch('codex_history.subprocess.Popen', side_effect=spawn):
                return CodexHistory(str(executable)).read(THREAD, None, 2)

    def test_stdio_reader_uses_only_read_methods_and_accepts_wire_responses_without_jsonrpc(self):
        result = self.run_fake_reader("""
import json, sys
for raw in sys.stdin:
    item = json.loads(raw)
    method = item.get('method')
    if method == 'initialize':
        print(json.dumps({'id': item['id'], 'result': {}}), flush=True)
    elif method == 'thread/read':
        print(json.dumps({'id': item['id'], 'result': {'thread': {'id': item['params']['threadId']}}}), flush=True)
    elif method == 'thread/turns/list':
        print(json.dumps({'id': item['id'], 'result': {'data': [], 'nextCursor': None}}), flush=True)
    elif method != 'initialized':
        raise SystemExit(3)
""")
        self.assertEqual((result["threadId"], result["turns"], result["nextCursor"]), (THREAD, [], None))

    def test_process_failures_are_bounded_and_do_not_expose_raw_errors(self):
        cases = [
            ('pass', '종료'),
            ("print('not-json', flush=True)", 'JSON'),
            ("print('x' * 4096, flush=True)", '너무 큽니다'),
            ('import time; time.sleep(5)', '시간'),
            ("import json,sys; item=json.loads(input()); print(json.dumps({'id':item['id'],'error':{'code':-32001,'message':'PRIVATE_API_KEY_SUPER_SECRET'}}),flush=True)", '이력'),
        ]
        for source, message in cases:
            with self.subTest(message=message), patch('codex_history.TIMEOUT_SECONDS', .3), patch('codex_history.MAX_OUTPUT', 1024):
                with self.assertRaisesRegex(CodexHistoryError, message) as error:
                    self.run_fake_reader(source)
                self.assertNotIn('PRIVATE_API_KEY_SUPER_SECRET', str(error.exception))

    def test_runner_response_keeps_user_and_public_agent_text_only(self):
        def reader(thread_id, cursor, limit):
            self.assertEqual((thread_id, cursor, limit), (THREAD, "cursor-1", 3))
            return {"thread": {"thread": {"id": THREAD}, "path": "/private"}, "page": {"nextCursor": None, "data": [{
                "id": "turn", "status": "inProgress", "startedAt": 1, "completedAt": "bad", "itemsView": "full", "items": [
                    {"id": "user", "type": "userMessage", "content": [{"type": "text", "text": "첫 문장"}, {"type": "text", "text": " 둘째 문장"}]},
                    {"id": "assistant", "type": "agentMessage", "text": "공개 답변", "phase": None},
                    {"id": "tool", "type": "functionCall", "output": "비공개"},
                ],
            }]}}
        result = CodexHistory("unused", runner=reader).read(THREAD, "cursor-1", 3)
        self.assertEqual(result["turns"][0], {"id": "turn", "status": "inProgress", "startedAt": 1, "completedAt": None, "messages": [
            {"id": "user", "role": "user", "text": "첫 문장 둘째 문장"},
            {"id": "assistant", "role": "assistant", "text": "공개 답변", "phase": None},
        ]})

    def test_rejects_malformed_or_other_thread_response(self):
        with self.assertRaises(CodexHistoryError):
            CodexHistory("unused", runner=lambda *_: {"thread": {"id": THREAD}, "page": {"data": "bad"}}).read(THREAD)
        with self.assertRaises(CodexHistoryError):
            CodexHistory("unused", runner=lambda *_: {"thread": {"id": "other"}, "page": {"data": []}}).read(THREAD)
        def timeout(*_):
            raise TimeoutError
        with self.assertRaisesRegex(CodexHistoryError, "시간"):
            CodexHistory("unused", runner=timeout).read(THREAD)

    def test_summary_or_unloaded_items_are_not_presented_as_full_text(self):
        for view in ('summary', 'notLoaded'):
            response = {"thread": {"id": THREAD}, "page": {"data": [{"id": "turn", "status": "completed", "itemsView": view, "items": []}]}}
            with self.assertRaisesRegex(CodexHistoryError, "전문"):
                CodexHistory("unused", runner=lambda *_: response).read(THREAD)


if __name__ == "__main__":
    unittest.main()
