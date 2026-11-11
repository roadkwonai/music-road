"""Read the public text history of one persisted Codex thread."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time


MAX_OUTPUT = 16 * 1024 * 1024
TIMEOUT_SECONDS = 12


class CodexHistoryError(ValueError):
    pass


def _iso_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _json_line(identifier, method, params=None):
    value = {"id": identifier, "method": method}
    if params is not None:
        value["params"] = params
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"


def _error_message(error):
    return "Codex 대화 이력을 읽을 수 없습니다."


class CodexHistory:
    """Small read-only app-server client; it never resumes or steers a thread."""

    def __init__(self, executable, runner=None):
        self.executable = executable
        self.runner = runner

    def read(self, thread_id, cursor=None, limit=20):
        try:
            if self.runner is not None:
                response = self.runner(thread_id, cursor, limit)
            else:
                response = self._read_app_server(thread_id, cursor, limit)
        except TimeoutError as error:
            raise CodexHistoryError("Codex 대화 이력 조회 시간이 초과되었습니다.") from error
        if not isinstance(response, dict):
            raise CodexHistoryError("Codex 대화 이력 응답 형식이 올바르지 않습니다.")
        return self._public(thread_id, response)

    def _read_app_server(self, thread_id, cursor, limit):
        try:
            child = subprocess.Popen([self.executable, "app-server", "--stdio"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False)
        except OSError as error:
            raise CodexHistoryError("Codex 대화 이력 읽기를 시작하지 못했습니다.") from error
        chunks = queue.Queue()
        budget, budget_lock = [0], threading.Lock()
        line_buffer = bytearray()
        def pump(name, stream):
            try:
                while chunk := os.read(stream.fileno(), 65536):
                    with budget_lock:
                        budget[0] += len(chunk)
                        too_large = budget[0] > MAX_OUTPUT
                    if too_large:
                        chunks.put((name, OverflowError()))
                        return
                    chunks.put((name, chunk))
            finally:
                chunks.put((name, None))
        readers = [threading.Thread(target=pump, args=(name, stream), daemon=True) for name, stream in (("stdout", child.stdout), ("stderr", child.stderr))]
        for reader in readers:
            reader.start()
        try:
            deadline = time.monotonic() + TIMEOUT_SECONDS
            def send(identifier, method, params=None):
                child.stdin.write(_json_line(identifier, method, params).encode("utf-8"))
                child.stdin.flush()
            def response(identifier):
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError
                    name, chunk = chunks.get(timeout=remaining)
                    if isinstance(chunk, OverflowError):
                        raise chunk
                    if chunk is None:
                        if name == "stdout":
                            raise CodexHistoryError("Codex 대화 이력 읽기가 응답 전에 종료되었습니다.")
                        continue
                    if name != "stdout":
                        continue
                    line_buffer.extend(chunk)
                    while b"\n" in line_buffer:
                        line, _, rest = line_buffer.partition(b"\n")
                        line_buffer[:] = rest
                        try:
                            item = json.loads(line)
                        except (UnicodeDecodeError, json.JSONDecodeError) as error:
                            raise CodexHistoryError("Codex 대화 이력 응답 JSON이 올바르지 않습니다.") from error
                        if isinstance(item, dict) and item.get("id") == identifier:
                            return item
            send(1, "initialize", {"clientInfo": {"name": "road-music-studio", "version": "1"}, "capabilities": {"experimentalApi": True, "explicitGatewayOauth": True}})
            initialize = response(1)
            if "error" in initialize or "result" not in initialize:
                raise CodexHistoryError(_error_message(initialize.get("error")))
            child.stdin.write((json.dumps({"method": "initialized", "params": {}}, separators=(",", ":")) + "\n").encode("utf-8")); child.stdin.flush()
            send(2, "thread/read", {"threadId": thread_id, "includeTurns": False})
            read = response(2)
            send(3, "thread/turns/list", {"threadId": thread_id, "cursor": cursor, "limit": limit, "itemsView": "full", "sortDirection": "desc"})
            turns = response(3)
            child.stdin.close()
            child.wait(timeout=max(0.1, deadline - time.monotonic()))
        except (TimeoutError, queue.Empty) as error:
            if child.poll() is None:
                child.kill()
            child.wait()
            raise CodexHistoryError("Codex 대화 이력 조회 시간이 초과되었습니다.") from error
        except OverflowError as error:
            if child.poll() is None:
                child.kill()
            child.wait()
            raise CodexHistoryError("Codex 대화 이력 응답이 너무 큽니다. 더 작은 페이지를 요청하세요.") from error
        except CodexHistoryError:
            if child.poll() is None:
                child.kill()
            child.wait()
            raise
        except (OSError, subprocess.SubprocessError) as error:
            if child.poll() is None:
                child.kill()
            child.wait()
            raise CodexHistoryError("Codex 대화 이력을 읽을 수 없습니다.") from error
        finally:
            for reader in readers:
                reader.join(timeout=0.1)
            for stream in (child.stdin, child.stdout, child.stderr):
                try:
                    stream.close()
                except (OSError, ValueError):
                    pass
        for item in (read, turns):
            if "error" in item:
                raise CodexHistoryError(_error_message(item["error"]))
            if "result" not in item:
                raise CodexHistoryError("Codex 대화 이력 응답 형식이 올바르지 않습니다.")
        return {"thread": read["result"], "page": turns["result"]}

    @staticmethod
    def _thread_id(value):
        if isinstance(value, dict):
            if isinstance(value.get("id"), str):
                return value["id"]
            if isinstance(value.get("thread"), dict) and isinstance(value["thread"].get("id"), str):
                return value["thread"]["id"]
        return None

    @classmethod
    def _public(cls, expected_thread, response):
        if cls._thread_id(response.get("thread")) != expected_thread:
            raise CodexHistoryError("다른 Codex 대화의 이력은 읽을 수 없습니다.")
        page = response.get("page")
        if not isinstance(page, dict) or not isinstance(page.get("data"), list):
            raise CodexHistoryError("Codex 대화 이력 응답 형식이 올바르지 않습니다.")
        turns = []
        for turn in page["data"]:
            public = cls._turn(turn)
            if public is not None:
                turns.append(public)
        cursor = page.get("nextCursor")
        if cursor is not None and (not isinstance(cursor, str) or not cursor):
            raise CodexHistoryError("Codex 대화 이력 커서가 올바르지 않습니다.")
        return {"threadId": expected_thread, "source": "codex-app-server", "mode": "persisted", "fetchedAt": _iso_now(), "turns": turns, "nextCursor": cursor}

    @staticmethod
    def _time(value):
        return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None

    @classmethod
    def _turn(cls, value):
        if not isinstance(value, dict) or not isinstance(value.get("id"), str) or not isinstance(value.get("status"), str) or not isinstance(value.get("items"), list):
            return None
        if value.get("itemsView") != "full":
            raise CodexHistoryError("Codex가 대화 전문을 반환하지 않았습니다. 지원되는 CLI 버전을 확인하세요.")
        messages = []
        for item in value["items"]:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                continue
            if item.get("type") == "userMessage" and isinstance(item.get("content"), list):
                text = "".join(part["text"] for part in item["content"] if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str))
                attachments = sum(1 for part in item["content"] if isinstance(part, dict) and part.get("type") != "text")
                if text or attachments:
                    message = {"id": item["id"], "role": "user", "text": text}
                    if attachments:
                        message["attachments"] = attachments
                    messages.append(message)
            elif item.get("type") == "agentMessage" and isinstance(item.get("text"), str):
                phase = item.get("phase")
                if phase is not None and phase not in {"commentary", "partial_answer", "final_answer"}:
                    continue
                messages.append({"id": item["id"], "role": "assistant", "text": item["text"], "phase": phase})
        return {"id": value["id"], "status": value["status"], "startedAt": cls._time(value.get("startedAt")), "completedAt": cls._time(value.get("completedAt")), "messages": messages}
