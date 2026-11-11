import hashlib
from contextlib import closing
import json
from pathlib import Path
import subprocess
import sqlite3
import shlex
import tempfile
import threading
import unittest

from studio_agent import StudioAgent, StudioAgentError
from unittest.mock import patch


THREAD = "12345678-1234-1234-1234-123456789abc"
OTHER_THREAD = "abcdefab-cdef-cdef-cdef-abcdefabcdef"


class StudioAgentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve(); self.profile = self.root / "profile"; self.project = self.root / "project"; self.project.mkdir()
        self.music = self.root / "source.mp3"; self.music.write_bytes(b"music")
        self.lyrics = self.root / "lyrics.txt"; self.lyrics.write_text("원래 가사", encoding="utf-8")
        self.write_project()
        self.codex = self.root / "codex"; self.codex.write_text("#!/bin/sh\n", encoding="utf-8"); self.codex.chmod(0o700)
        self.calls = []

    @staticmethod
    def digest(path):
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()

    def write_project(self, media=None):
        if media is None:
            media = [
                {"id": "music", "kind": "music", "path": str(self.music), "name": "source.mp3", "sha256": self.digest(self.music), "technical": {"durationSeconds": 12.0}},
                {"id": "lyrics", "kind": "lyrics", "path": str(self.lyrics), "name": "lyrics.txt", "sha256": self.digest(self.lyrics)},
            ]
        (self.project / "studio-project.json").write_text(json.dumps({"schemaVersion": 1, "name": "테스트", "media": media}, ensure_ascii=False), encoding="utf-8")
        (self.project / "selection.json").write_text(json.dumps({"styleId": "clean"}), encoding="utf-8")

    def runner(self, args, **kwargs):
        self.calls.append(args)
        return subprocess.CompletedProcess(args, 0, f"Queued message aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa for thread {THREAD}\n", "")

    def agent(self, thread=THREAD, runner=None):
        return StudioAgent(self.profile, env={"CODEX_THREAD_ID": thread, "CODEX_CLI_PATH": str(self.codex), "ROADMUSIC_CLI_ROOT": str(Path(__file__).resolve().parents[5])}, runner=runner or self.runner)

    def bind(self, agent=None):
        return (agent or self.agent()).bind(str(self.project))

    def params(self, request_id="a" * 48, **extra):
        context = self.agent().context(str(self.project))
        return {"requestId": request_id, "target": "music", "intent": "review", "prompt": "후렴을 검토해 주세요", "baseVersionId": context["baseVersionId"], **extra}

    def test_context_bind_and_queue_submission_are_idempotent(self):
        agent = self.agent(); context = agent.context(str(self.project))
        self.assertFalse(context["connection"]["connected"])
        self.bind(agent); first = agent.submit(str(self.project), self.params())
        second = agent.submit(str(self.project), self.params())
        self.assertEqual((first["status"], second["status"], len(self.calls)), ("queued", "queued", 1))
        self.assertEqual(agent.context(str(self.project))["originalLyrics"], "원래 가사")
        with self.assertRaisesRegex(StudioAgentError, "같은 requestId"):
            agent.submit(str(self.project), self.params(prompt="다른 내용"))

    def test_nul_text_is_rejected_before_dispatch(self):
        agent = self.agent(); self.bind(agent)
        with self.assertRaisesRegex(StudioAgentError, 'prompt'):
            agent.submit(self.project, self.params(prompt='검토\x00요청'))
        self.assertFalse(self.calls)
        self.assertEqual(agent.requests(self.project)['requests'], [])

    def test_ack_instruction_quotes_profile_and_cli_paths(self):
        self.profile = self.root / '프로필 공백'
        cli = self.root / 'CLI 공백' / 'cli' / 'road-music.js'
        agent = self.agent(); self.bind(agent)
        with patch('studio.road_music_cli', return_value=cli):
            agent.submit(self.project, self.params())
        message = self.calls[0][-1]
        command = 'ROADMUSIC_DATA_DIR=' + message.split('ROADMUSIC_DATA_DIR=', 1)[1].split(' studio:request:update', 1)[0]
        self.assertEqual(shlex.split(command), ['ROADMUSIC_DATA_DIR=' + str(self.profile), 'node', str(cli)])

    def test_music_revision_keeps_group_and_is_not_an_original_prompt(self):
        agent = self.agent(); self.bind(agent)
        agent.submit(self.project, self.params(intent='produce'))
        context = agent.context(self.project)
        record = agent.ledger.prompts({'projectId': context['projectId']})['prompts'][0]
        self.assertEqual(record['intent'], 'revision')
        self.assertFalse(record['main'])
        self.assertEqual(record['groupId'], context['sourceSha256'])
        message = json.loads(self.calls[0][-1].rsplit('\n\n', 1)[1])
        self.assertEqual(message['groupId'], context['sourceSha256'])
        self.assertEqual(message['intent'], 'produce')

    def test_first_video_is_creation_and_existing_video_is_revision(self):
        agent = self.agent(); self.bind(agent)
        agent.submit(self.project, self.params(target='video', intent='produce'))
        context = agent.context(self.project)
        first = agent.ledger.prompts({'projectId': context['projectId']})['prompts'][0]
        self.assertEqual((first['intent'], first['main']), ('create', True))
        video = self.root / 'final.mp4'; video.write_bytes(b'video')
        media = json.loads((self.project / 'studio-project.json').read_text())['media']
        media.append({'id': 'video-0', 'kind': 'video', 'path': str(video), 'sha256': self.digest(video), 'technical': {'durationSeconds': 12}})
        self.write_project(media)
        agent.submit(self.project, self.params(request_id='b' * 48, target='video', intent='produce'))
        revised = agent.ledger.prompts({'projectId': context['projectId']})['prompts'][0]
        self.assertEqual((revised['intent'], revised['main']), ('revision', False))

    def test_timeout_and_restart_do_not_resubmit(self):
        def timeout(*args, **kwargs): raise subprocess.TimeoutExpired(args[0], 25)
        agent = self.agent(runner=timeout); self.bind(agent)
        item = agent.submit(str(self.project), self.params())
        self.assertEqual(item["status"], "uncertain")
        restarted = self.agent(); saved = restarted.requests(str(self.project))["requests"][0]
        self.assertEqual(saved["status"], "uncertain")

    def test_fast_ack_is_not_overwritten_by_queue_receipt(self):
        agent = self.agent(); self.bind(agent)
        def fast_ack(args, **kwargs):
            agent.update(str(self.project), {"requestId": "a" * 48, "status": "accepted", "note": "수신"})
            return subprocess.CompletedProcess(args, 0, f"Queued message aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa for thread {THREAD}", "")
        agent.runner = fast_ack
        result = agent.submit(str(self.project), self.params())
        self.assertEqual((result["status"], result["note"]), ("accepted", "수신"))

    def test_ack_requires_bound_thread_and_valid_transition(self):
        agent = self.agent(); self.bind(agent); agent.submit(str(self.project), self.params())
        with self.assertRaisesRegex(StudioAgentError, "연결된 Codex"):
            self.agent(OTHER_THREAD).update(str(self.project), {"requestId": "a" * 48, "status": "accepted"})
        accepted = agent.update(str(self.project), {"requestId": "a" * 48, "status": "accepted", "note": "수신 확인"})
        self.assertEqual(accepted["status"], "accepted")
        with self.assertRaisesRegex(StudioAgentError, "상태 전환"):
            agent.update(str(self.project), {"requestId": "a" * 48, "status": "accepted"})

    def test_stale_file_and_bad_ranges_are_rejected(self):
        agent = self.agent(); self.bind(agent); context = agent.context(str(self.project))
        self.music.write_bytes(b"changed")
        with self.assertRaisesRegex(StudioAgentError, "스냅샷"):
            agent.submit(str(self.project), {"requestId": "a" * 48, "target": "music", "intent": "review", "prompt": "x", "baseVersionId": context["baseVersionId"]})
        self.write_project(); fresh = self.params(range={"start": float("nan"), "end": 1})
        with self.assertRaisesRegex(StudioAgentError, "range"):
            agent.submit(str(self.project), fresh)
        with self.assertRaisesRegex(StudioAgentError, "검토 구간"):
            agent.submit(str(self.project), self.params(range={"start": 11, "end": 13}))

    def test_limits_and_missing_audio_produce_are_rejected(self):
        agent = self.agent(); self.bind(agent)
        with self.assertRaisesRegex(StudioAgentError, "prompt"):
            agent.submit(str(self.project), self.params(prompt="x" * 12001))
        self.write_project(media=[])
        with self.assertRaisesRegex(StudioAgentError, "등록된 원음"):
            agent.submit(str(self.project), self.params(intent="produce"))

    def test_concurrent_submit_starts_one_queue_process(self):
        agent = self.agent(); self.bind(agent); lock = threading.Lock(); calls = []
        def runner(args, **kwargs):
            with lock: calls.append(args)
            return subprocess.CompletedProcess(args, 0, f"Queued message aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa for thread {THREAD}", "")
        env = {"CODEX_THREAD_ID": THREAD, "CODEX_CLI_PATH": str(self.codex), "ROADMUSIC_CLI_ROOT": str(Path(__file__).resolve().parents[5])}
        first = StudioAgent(self.profile, env=env, runner=runner)
        second = StudioAgent(self.profile, env=env, runner=runner)
        values = []
        threads = [threading.Thread(target=lambda instance: values.append(instance.submit(str(self.project), self.params())), args=(instance,)) for instance in (first, second)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(len(calls), 1); self.assertTrue({item["status"] for item in values} <= {"queued", "uncertain"})

    def test_status_reads_existing_profile_without_schema_mutation(self):
        self.profile.mkdir()
        database = self.profile / "storage.sqlite3"
        with closing(sqlite3.connect(database)) as connection:
            connection.execute("CREATE TABLE legacy_marker (value TEXT)")
            connection.commit()
        before = (database.stat().st_size, database.stat().st_mtime_ns)
        result = self.agent().requests(str(self.project))
        self.assertEqual(result, {"requests": []})
        self.assertEqual((database.stat().st_size, database.stat().st_mtime_ns), before)

    def test_history_reads_only_public_text_without_rehashing_media(self):
        calls = []
        long_answer = "가" * 5001
        def reader(thread_id, cursor, limit):
            calls.append((thread_id, cursor, limit))
            return {
                "thread": {"id": THREAD, "cwd": "/private/path"},
                "page": {"nextCursor": "older", "data": [{
                    "id": "turn-1", "status": "completed", "startedAt": None, "completedAt": 12, "itemsView": "full",
                    "error": {"message": "숨겨야 할 오류"}, "items": [
                        {"id": "u1", "type": "userMessage", "content": [{"type": "text", "text": "후렴을 보강해 주세요"}, {"type": "image", "url": "secret://image"}]},
                        {"id": "a1", "type": "agentMessage", "text": long_answer, "phase": "final_answer", "metadata": {"path": "/hidden"}},
                        {"id": "a2", "type": "agentMessage", "text": "분석 비공개", "phase": "analysis"},
                        {"id": "r1", "type": "reasoning", "text": "비공개 추론"},
                        {"id": "t1", "type": "toolCall", "arguments": {"path": "/hidden"}},
                        {"id": "s1", "type": "systemMessage", "text": "비공개 시스템"},
                    ],
                }]},
            }
        agent = StudioAgent(self.profile, env={"CODEX_THREAD_ID": THREAD, "CODEX_CLI_PATH": str(self.codex)}, history_reader=reader)
        self.bind(agent)
        agent._file = lambda item: self.fail("이력 조회에서 미디어 해시를 읽으면 안 됩니다")
        first = agent.history(self.project, {"limit": 20})
        second = agent.history(self.project, {"limit": 20})
        self.assertEqual(calls, [(THREAD, None, 20)])
        self.assertEqual(first, second)
        turn = first["turns"][0]
        self.assertEqual((turn["startedAt"], turn["completedAt"]), (None, 12))
        self.assertEqual(turn["messages"][0], {"id": "u1", "role": "user", "text": "후렴을 보강해 주세요", "attachments": 1})
        self.assertEqual(turn["messages"][1]["text"], long_answer)
        self.assertEqual(turn["messages"][1]["phase"], "final_answer")
        self.assertNotIn("비공개", json.dumps(first, ensure_ascii=False))
        self.assertNotIn("/hidden", json.dumps(first, ensure_ascii=False))

    def test_history_cache_discards_expired_pages_after_acquiring_the_lock(self):
        reader = lambda *_: {"thread": {"id": THREAD}, "page": {"data": [], "nextCursor": None}}
        agent = StudioAgent(self.profile, env={"CODEX_THREAD_ID": THREAD, "CODEX_CLI_PATH": str(self.codex)}, history_reader=reader)
        self.bind(agent)
        with patch('studio_agent.time.monotonic', side_effect=[100, 100, 103, 103]):
            agent.history(self.project, {"cursor": "old"})
            agent.history(self.project, {"cursor": "new"})
        self.assertEqual(len(agent._history_cache), 1)
        self.assertEqual(next(iter(agent._history_cache))[2], "new")

    def test_history_rejects_other_thread_and_invalid_page_arguments(self):
        agent = StudioAgent(self.profile, env={"CODEX_THREAD_ID": THREAD, "CODEX_CLI_PATH": str(self.codex)}, history_reader=lambda *_: {"thread": {"id": OTHER_THREAD}, "page": {"data": []}})
        self.bind(agent)
        with self.assertRaisesRegex(StudioAgentError, "다른 Codex"):
            agent.history(self.project)
        with self.assertRaisesRegex(StudioAgentError, "페이지 크기"):
            agent.history(self.project, {"limit": 21})
        with self.assertRaisesRegex(StudioAgentError, "조회 조건"):
            agent.history(self.project, {"method": "turn/start"})

    def test_chat_is_review_only_and_keeps_structured_revision_text(self):
        agent = self.agent(); self.bind(agent)
        with self.assertRaisesRegex(StudioAgentError, "target"):
            agent.submit(self.project, self.params(target="chat", intent="produce"))
        chat = agent.submit(self.project, self.params(request_id="b" * 48, target="chat", prompt="가사 수정 가능 여부를 설명해 주세요"))
        self.assertEqual(chat["status"], "queued")
        self.assertIn("대화·질문 전용", self.calls[-1][-1])
        self.assertIn("succeeded", self.calls[-1][-1])
        record = agent.ledger.prompts({"projectId": agent.context(self.project)["projectId"]})["prompts"][0]
        self.assertEqual((record["intent"], record["prompt"]), ("review", "가사 수정 가능 여부를 설명해 주세요"))
        lyrics = "첫 줄은 유지\n후렴 마지막 줄만 또렷하게\n"
        revision = agent.submit(self.project, self.params(request_id="c" * 48, target="lyrics", prompt="후렴 발음을 검토해 주세요", revisedLyrics=lyrics))
        self.assertEqual(revision["status"], "queued")
        payload = json.loads(self.calls[-1][-1].rsplit("\n\n", 1)[1])
        self.assertEqual((payload["target"], payload["prompt"], payload["revisedLyrics"]), ("lyrics", "후렴 발음을 검토해 주세요", lyrics))

    def test_draft_survives_agent_restart_without_binding_or_queue(self):
        draft = {
            "target": "lyrics", "intent": "review", "prompt": "첫 줄만 검토해 주세요",
            "preserve": "원본은 보존", "revisedLyrics": "바꿀 가사", "mediaId": "music-0",
            "mediaSha256": "a" * 64, "rangeStart": "", "rangeEnd": "30",
            "requestId": "", "status": "", "submittedFingerprint": "", "previousRequestId": "",
        }
        saved = self.agent().draft_set(self.project, {"scope": "detail", "draft": draft})
        self.assertEqual(saved["draft"], draft)
        self.assertTrue(saved["savedAt"])
        restored = self.agent().draft_get(self.project, {"scope": "detail"})
        self.assertEqual(restored["draft"], draft)
        self.assertFalse(self.calls)

    def test_draft_is_project_scoped_and_preserves_untrusted_media_sha(self):
        other = self.root / "other"; other.mkdir(); self.project = other
        self.write_project()
        second = self.agent()
        second.draft_set(self.project, {"scope": "studio", "draft": {"target": "video", "intent": "review", "prompt": "x", "mediaId": "unmapped", "mediaSha256": "b" * 64, "status": ""}})
        self.assertIsNone(second.draft_get(self.root / "project", {"scope": "studio"})["draft"])
        self.assertEqual(second.draft_get(self.project, {"scope": "studio"})["draft"]["mediaSha256"], "b" * 64)

    def test_draft_rejects_invalid_fields_and_uses_existing_delivery_status(self):
        agent = self.agent(); self.bind(agent); agent.submit(self.project, self.params())
        base = {"target": "music", "intent": "review", "prompt": "x", "requestId": "a" * 48, "status": "succeeded"}
        stored = agent.draft_set(self.project, {"scope": "studio", "draft": base})
        self.assertEqual(stored["draft"]["status"], "queued")
        original = self.project
        self.project = self.root / "foreign"; self.project.mkdir(); self.write_project()
        agent.bind(self.project); agent.submit(self.project, self.params(request_id="b" * 48))
        self.project = original
        self.assertEqual(agent.draft_set(self.project, {"scope": "studio", "draft": {**base, "requestId": "b" * 48}})["draft"]["status"], "uncertain")
        self.assertEqual(agent.draft_set(self.project, {"scope": "studio", "draft": {**base, "requestId": ""}})["draft"]["status"], "uncertain")
        for invalid in (
            {"target": "bad"}, {"rangeStart": "x" * 81}, {"requestId": "bad"},
            {"unknown": "x"}, {"prompt": ["not text"]}, {"preserve": None},
            {"target": []}, {"status": {}}, None,
        ):
            with self.assertRaises(StudioAgentError):
                agent.draft_set(self.project, {"scope": "studio", "draft": invalid})
        with self.assertRaises(StudioAgentError):
            agent.draft_set(self.project, {"scope": [], "draft": {}})
        self.assertEqual(len(self.calls), 2)


if __name__ == "__main__":
    unittest.main()
