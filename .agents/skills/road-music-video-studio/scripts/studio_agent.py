#!/usr/bin/env python3
"""Queue verified Studio revision requests to the Codex thread bound by its CLI."""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import shlex
import subprocess
import sys
import threading
import time

from codex_history import CodexHistory, CodexHistoryError
from management_db import ManagementDB, ManagementDBError
from production_ledger import ProductionLedger, ProductionLedgerError
from work_library import _technical


SHA256 = re.compile(r"[0-9a-f]{64}\Z")
PUBLIC_ID = re.compile(r"[0-9a-f]{48}\Z")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z", re.I)
QUEUE_RECEIPT = re.compile(r"Queued message ([0-9a-f-]{36}) for thread ([0-9a-f-]{36})", re.I)
MAX_MARKER = 16 * 1024 * 1024
MAX_LYRICS = 256 * 1024
MAX_MESSAGE = 120 * 1024
MAX_DRAFT = 512 * 1024
TERMINAL = frozenset(("succeeded", "failed"))
UPDATE_STATUS = frozenset(("accepted", "reviewing", "running", "needs-user-input", "succeeded", "failed"))
DRAFT_SCOPE = frozenset(("studio", "detail"))
DRAFT_STATUS = frozenset(("", "queued", "sending", "uncertain", "accepted", "reviewing", "running", "needs-user-input", "succeeded", "failed"))
DRAFT_FIELDS = frozenset(("target", "intent", "prompt", "preserve", "revisedLyrics", "mediaId", "mediaSha256", "rangeStart", "rangeEnd", "requestId", "status", "submittedFingerprint", "previousRequestId", "baseVersionId"))


class StudioAgentError(ValueError):
    pass


def _now_ms():
    return time.time_ns() // 1_000_000


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _json(value):
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as error:
        raise StudioAgentError("요청은 유효한 JSON이어야 합니다") from error


def _sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _thread(value):
    if not isinstance(value, str) or not UUID.fullmatch(value):
        raise StudioAgentError("CODEX_THREAD_ID는 UUID여야 합니다")
    return value.lower()


def _text(value, name, maximum, required=False):
    if value is None and not required:
        return None
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > maximum or '\x00' in value:
        raise StudioAgentError(f"{name} 값이 올바르지 않습니다")
    return value


class StudioAgent:
    """Persist one trusted Codex thread binding per local Studio project."""

    def __init__(self, data_dir=None, env=None, runner=None, history_reader=None):
        if data_dir is None:
            raise StudioAgentError("관리 데이터 경로가 필요합니다")
        self.db = ManagementDB(data_dir)
        self.ledger = ProductionLedger(data_dir)
        self.env = dict(os.environ if env is None else env)
        self.runner = subprocess.run if runner is None else runner
        self.history_reader = history_reader
        self._history_cache = {}
        self._history_lock = threading.Lock()

    @staticmethod
    def _project(project):
        if not isinstance(project, (str, os.PathLike)) or not str(project):
            raise StudioAgentError("프로젝트는 절대 경로여야 합니다")
        raw = Path(project)
        if not raw.is_absolute() or raw.is_symlink():
            raise StudioAgentError("프로젝트는 symlink가 아닌 절대 경로여야 합니다")
        try:
            path = raw.resolve(strict=True)
        except OSError as error:
            raise StudioAgentError("프로젝트 폴더를 찾을 수 없습니다") from error
        if not path.is_dir() or path.is_symlink():
            raise StudioAgentError("프로젝트 폴더가 필요합니다")
        return path

    @staticmethod
    def _read_json(path, maximum, label, default=None):
        if not path.exists() and default is not None:
            return deepcopy(default)
        if path.is_symlink() or not path.is_file() or path.stat().st_size > maximum:
            raise StudioAgentError(f"{label} 파일이 안전하지 않습니다")
        try:
            return json.loads(path.read_text(encoding="utf-8-sig"), parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            raise StudioAgentError(f"{label} 파일을 읽을 수 없습니다") from error

    @staticmethod
    def _file(item):
        if not isinstance(item, dict):
            return None
        identifier, kind, expected = item.get("id"), item.get("kind"), item.get("sha256")
        raw_path = item.get("path")
        if not isinstance(identifier, str) or not identifier or len(identifier) > 160 or "\x00" in identifier:
            return None
        if not isinstance(kind, str) or kind not in {"music", "video", "lyrics", "captions", "storyboard", "artifact"}:
            return None
        if not isinstance(expected, str) or not SHA256.fullmatch(expected.lower()) or not isinstance(raw_path, str):
            return None
        raw = Path(raw_path)
        if not raw.is_absolute() or raw.is_symlink():
            return None
        try:
            path = raw.resolve(strict=True)
            if path.is_symlink() or not path.is_file():
                return None
            before = path.stat()
            actual = _sha256(path)
            after = path.stat()
        except OSError:
            return None
        if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns or actual != expected.lower():
            return None
        duration = None
        technical = item.get("technical")
        if isinstance(technical, dict):
            candidate = technical.get("durationSeconds")
            if isinstance(candidate, (int, float)) and not isinstance(candidate, bool) and math.isfinite(candidate) and candidate >= 0:
                duration = candidate
        if duration is None and kind in {"music", "video"}:
            candidate = _technical(path, after).get("durationSeconds")
            if isinstance(candidate, (int, float)) and math.isfinite(candidate) and candidate >= 0:
                duration = candidate
        text = None
        if kind == "lyrics":
            try:
                if after.st_size <= MAX_LYRICS:
                    text = path.read_text(encoding="utf-8-sig")
            except (OSError, UnicodeDecodeError):
                return None
        return {
            "id": identifier, "kind": kind, "name": item.get("name") if isinstance(item.get("name"), str) else path.name,
            "sha256": actual, "duration": duration, "text": text, "path": str(path),
        }

    def _snapshot(self, project):
        path = self._project(project)
        marker = path / "studio-project.json"
        raw = marker.read_bytes() if marker.exists() and marker.is_file() and not marker.is_symlink() and marker.stat().st_size <= MAX_MARKER else None
        if raw is None:
            raise StudioAgentError("studio-project.json 파일이 안전하지 않습니다")
        try:
            data = json.loads(raw.decode("utf-8-sig"), parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            raise StudioAgentError("studio-project.json 파일을 읽을 수 없습니다") from error
        if not isinstance(data, dict) or data.get("schemaVersion") != 1 or not isinstance(data.get("media"), list):
            raise StudioAgentError("지원하지 않는 제작실 프로젝트입니다")
        selection = self._read_json(path / "selection.json", 1024 * 1024, "selection", {})
        if not isinstance(selection, dict):
            selection = {}
        media, invalid = [], []
        for item in data["media"]:
            valid = self._file(item)
            if valid is None:
                if isinstance(item, dict) and isinstance(item.get("id"), str):
                    invalid.append(item["id"])
                continue
            media.append(valid)
        source = next((item for item in media if item["id"] == "music" and item["kind"] == "music"), None)
        original = next((item["text"] for item in media if item["kind"] == "lyrics" and item["text"] is not None), None)
        public_media = []
        for item in media:
            result = {key: item[key] for key in ("id", "kind", "name", "sha256", "duration")}
            if item["text"] is not None:
                result["text"] = item["text"]
            public_media.append(result)
        return {
            "project": str(path), "projectId": hashlib.sha256(str(path).encode("utf-8")).hexdigest(),
            "projectName": data.get("name") if isinstance(data.get("name"), str) else path.name,
            "baseVersionId": hashlib.sha256(raw).hexdigest(), "sourceSha256": source["sha256"] if source else None,
            "selection": selection, "media": public_media, "privateMedia": media, "invalidMedia": invalid,
            "originalLyrics": original,
        }

    def _binding(self, project_id):
        with self.db.transaction() as connection:
            if connection is None or not self.db._has_table(connection, "studio_agent_bindings"):
                return None
            row = connection.execute("SELECT project_path,thread_id,bound_at FROM studio_agent_bindings WHERE project_id=?", (project_id,)).fetchone()
        return {"projectPath": row[0], "threadId": row[1], "boundAt": _iso(row[2]), "boundAtMs": row[2]} if row else None

    def _executable(self):
        raw = self.env.get("CODEX_CLI_PATH") or shutil.which("codex")
        if not raw:
            return None
        path = Path(raw)
        try:
            resolved = path.resolve(strict=True)
        except OSError:
            return None
        return str(resolved) if resolved.is_file() and os.access(resolved, os.X_OK) else None

    def connection(self, project):
        path = self._project(project)
        project_id = hashlib.sha256(str(path).encode("utf-8")).hexdigest()
        binding = self._binding(project_id)
        if binding is None:
            return {"connected": False, "transport": "codex-queue", "threadId": None, "reason": "Codex 대화가 아직 연결되지 않았습니다."}
        if binding["projectPath"] != str(path):
            return {"connected": False, "transport": "codex-queue", "threadId": binding["threadId"], "reason": "저장된 프로젝트 경로가 현재 프로젝트와 다릅니다."}
        if self._executable() is None:
            return {"connected": False, "transport": "codex-queue", "threadId": binding["threadId"], "reason": "codex queue 실행 파일을 찾을 수 없습니다."}
        return {"connected": True, "transport": "codex-queue", "threadId": binding["threadId"], "reason": None}

    def context(self, project):
        snapshot = self._snapshot(project)
        result = {key: snapshot[key] for key in ("projectId", "projectName", "baseVersionId", "sourceSha256", "selection", "media")}
        if snapshot["originalLyrics"] is not None:
            result["originalLyrics"] = snapshot["originalLyrics"]
        result["connection"] = self.connection(snapshot["project"])
        return result

    def _history_binding(self, project):
        """Validate only the marker and binding; history must not rehash media files."""
        path = self._project(project)
        marker = path / "studio-project.json"
        raw = marker.read_bytes() if marker.exists() and marker.is_file() and not marker.is_symlink() and marker.stat().st_size <= MAX_MARKER else None
        if raw is None:
            raise StudioAgentError("studio-project.json 파일이 안전하지 않습니다")
        try:
            value = json.loads(raw.decode("utf-8-sig"), parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            raise StudioAgentError("studio-project.json 파일을 읽을 수 없습니다") from error
        if not isinstance(value, dict) or value.get("schemaVersion") != 1:
            raise StudioAgentError("지원하지 않는 제작실 프로젝트입니다")
        project_id = hashlib.sha256(str(path).encode("utf-8")).hexdigest()
        binding = self._binding(project_id)
        if binding is None or binding["projectPath"] != str(path):
            raise StudioAgentError("Codex 대화 연결이 필요합니다")
        return path, project_id, binding

    @staticmethod
    def _history_params(params):
        if params is None:
            params = {}
        if not isinstance(params, dict) or set(params) - {"cursor", "limit"}:
            raise StudioAgentError("Codex 대화 이력 조회 조건이 올바르지 않습니다")
        cursor = params.get("cursor")
        if cursor is not None and (not isinstance(cursor, str) or not cursor or len(cursor) > 4096 or "\x00" in cursor):
            raise StudioAgentError("Codex 대화 이력 커서가 올바르지 않습니다")
        limit = params.get("limit", 20)
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 20:
            raise StudioAgentError("Codex 대화 이력 페이지 크기는 1~20이어야 합니다")
        return {"cursor": cursor, "limit": limit}

    def history(self, project, params=None):
        path, project_id, binding = self._history_binding(project)
        params = self._history_params(params)
        key = (project_id, binding["threadId"], params["cursor"], params["limit"])
        with self._history_lock:
            now = time.monotonic()
            self._history_cache = {entry: value for entry, value in self._history_cache.items() if now - value[0] <= 2}
            cached = self._history_cache.get(key)
            if cached is not None and now - cached[0] <= 2:
                return deepcopy(cached[1])
            executable = self._executable()
            if executable is None:
                raise StudioAgentError("codex app-server 실행 파일을 찾을 수 없습니다")
            try:
                result = CodexHistory(executable, runner=self.history_reader).read(binding["threadId"], params["cursor"], params["limit"])
            except CodexHistoryError as error:
                raise StudioAgentError(str(error)) from error
            if len(self._history_cache) >= 8:
                self._history_cache.pop(next(iter(self._history_cache)))
            self._history_cache[key] = (time.monotonic(), result)
            return deepcopy(result)

    def _draft_project(self, project):
        """Validate project identity without touching media bytes while typing."""
        path = self._project(project)
        marker = path / "studio-project.json"
        raw = marker.read_bytes() if marker.exists() and marker.is_file() and not marker.is_symlink() and marker.stat().st_size <= MAX_MARKER else None
        if raw is None:
            raise StudioAgentError("studio-project.json 파일이 안전하지 않습니다")
        try:
            value = json.loads(raw.decode("utf-8-sig"), parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            raise StudioAgentError("studio-project.json 파일을 읽을 수 없습니다") from error
        if not isinstance(value, dict) or value.get("schemaVersion") != 1:
            raise StudioAgentError("지원하지 않는 제작실 프로젝트입니다")
        return path, hashlib.sha256(str(path).encode("utf-8")).hexdigest()

    @staticmethod
    def _draft_scope(params, *, writable=False):
        expected = {"scope", "draft"} if writable else {"scope"}
        if not isinstance(params, dict) or set(params) - expected or (writable and "draft" not in params):
            raise StudioAgentError("작성 중 초안 조건이 올바르지 않습니다")
        scope = params.get("scope")
        if not isinstance(scope, str) or scope not in DRAFT_SCOPE:
            raise StudioAgentError("작성 중 초안 범위가 올바르지 않습니다")
        return scope

    @staticmethod
    def _draft_value(value):
        if not isinstance(value, dict) or set(value) - DRAFT_FIELDS:
            raise StudioAgentError("작성 중 초안 항목이 올바르지 않습니다")
        result = {}
        choices = {"target": {"chat", "music", "lyrics", "video"}, "intent": {"review", "produce"}, "status": DRAFT_STATUS}
        limits = {"prompt": 12000, "preserve": 4000, "revisedLyrics": 20000, "mediaId": 100, "rangeStart": 80, "rangeEnd": 80, "submittedFingerprint": 160000}
        for key, values in choices.items():
            if key in value:
                if not isinstance(value[key], str) or value[key] not in values:
                    raise StudioAgentError(f"초안 {key} 값이 올바르지 않습니다")
                result[key] = value[key]
        for key, maximum in limits.items():
            if key in value:
                if not isinstance(value[key], str):
                    raise StudioAgentError(f"초안 {key} 값이 올바르지 않습니다")
                result[key] = _text(value[key], f"초안 {key}", maximum)
        for key in ("requestId", "previousRequestId"):
            if key in value:
                item = value[key]
                if not isinstance(item, str) or (item and not PUBLIC_ID.fullmatch(item)):
                    raise StudioAgentError(f"초안 {key} 값이 올바르지 않습니다")
                result[key] = item
        for key in ("mediaSha256", "baseVersionId"):
            if key in value:
                item = value[key]
                if not isinstance(item, str) or not SHA256.fullmatch(item):
                    raise StudioAgentError(f"초안 {key} 값이 올바르지 않습니다")
                result[key] = item
        if len(_json(result).encode("utf-8")) > MAX_DRAFT:
            raise StudioAgentError("작성 중 초안이 안전 한도를 초과했습니다")
        return result

    @staticmethod
    def _draft_name(scope, project_id):
        return f"studio-agent-draft:{scope}:{project_id}"

    def _draft_delivery_status(self, project_id, request_id):
        if not request_id:
            return None
        with self.db.transaction() as connection:
            if connection is None or not self.db._has_table(connection, "studio_agent_deliveries"):
                return None
            row = connection.execute("SELECT status FROM studio_agent_deliveries WHERE request_id=? AND project_id=?", (request_id, project_id)).fetchone()
        return "uncertain" if row and row[0] == "sending" else (row[0] if row else None)

    def _draft_response(self, project_id, scope, stored):
        if stored is None:
            return {"projectId": project_id, "scope": scope, "draft": None}
        draft = deepcopy(stored["draft"])
        actual = self._draft_delivery_status(project_id, draft.get("requestId", ""))
        if actual is not None:
            draft["status"] = actual
        elif draft.get("status", "") not in {"", "failed"}:
            draft["status"] = "uncertain"
        result = {"projectId": project_id, "scope": scope, "draft": draft}
        if stored.get("savedAt") is not None:
            result["savedAt"] = _iso(stored["savedAt"])
        return result

    @staticmethod
    def _stored_draft(value):
        if not isinstance(value, dict) or set(value) != {"draft", "savedAt"} or type(value["savedAt"]) is not int or value["savedAt"] < 0:
            raise StudioAgentError("저장된 작성 중 초안이 올바르지 않습니다")
        StudioAgent._draft_value(value["draft"])

    def draft_get(self, project, params):
        _, project_id = self._draft_project(project)
        scope = self._draft_scope(params)
        stored = self.db.read_document(self._draft_name(scope, project_id), fallback=None)
        if stored is not None:
            self._stored_draft(stored)
        return self._draft_response(project_id, scope, stored)

    def draft_set(self, project, params):
        _, project_id = self._draft_project(project)
        scope = self._draft_scope(params, writable=True)
        draft = self._draft_value(params["draft"])
        name = self._draft_name(scope, project_id)
        stored = {"draft": draft, "savedAt": _now_ms()}
        self.db.write_document(name, stored, validate=self._stored_draft)
        return self._draft_response(project_id, scope, stored)

    def bind(self, project):
        snapshot = self._snapshot(project)
        thread = _thread(self.env.get("CODEX_THREAD_ID"))
        now = _now_ms()
        with self.db.transaction(write=True) as connection:
            connection.execute(
                "INSERT INTO studio_agent_bindings(project_id,project_path,thread_id,bound_at) VALUES(?,?,?,?) "
                "ON CONFLICT(project_id) DO UPDATE SET project_path=excluded.project_path,thread_id=excluded.thread_id,bound_at=excluded.bound_at",
                (snapshot["projectId"], snapshot["project"], thread, now),
            )
        return {"projectId": snapshot["projectId"], "threadId": thread, "boundAt": _iso(now), "connection": self.connection(snapshot["project"])}

    @staticmethod
    def _params(params):
        if not isinstance(params, dict):
            raise StudioAgentError("요청은 JSON 객체여야 합니다")
        allowed = {"requestId", "target", "intent", "prompt", "preserve", "revisedLyrics", "mediaId", "mediaSha256", "baseVersionId", "range"}
        if set(params) - allowed:
            raise StudioAgentError("지원하지 않는 제작 요청 입력입니다")
        request_id = params.get("requestId")
        if not isinstance(request_id, str) or not PUBLIC_ID.fullmatch(request_id):
            raise StudioAgentError("requestId는 48자리 소문자 16진수여야 합니다")
        target, intent = params.get("target"), params.get("intent")
        if target not in {"music", "lyrics", "video", "chat"} or intent not in {"review", "produce"} or (target == "chat" and intent != "review"):
            raise StudioAgentError("target 또는 intent가 올바르지 않습니다")
        value = {"requestId": request_id, "target": target, "intent": intent,
                 "prompt": _text(params.get("prompt"), "prompt", 12000, required=True)}
        for key, maximum in (("preserve", 4000), ("revisedLyrics", 20000)):
            if params.get(key) is not None:
                value[key] = _text(params[key], key, maximum)
        media_id, media_sha = params.get("mediaId"), params.get("mediaSha256")
        if (media_id is None) != (media_sha is None):
            raise StudioAgentError("mediaId와 mediaSha256은 함께 필요합니다")
        if media_id is not None:
            if not isinstance(media_id, str) or not media_id or len(media_id) > 160 or not isinstance(media_sha, str) or not SHA256.fullmatch(media_sha):
                raise StudioAgentError("선택한 미디어 정보가 올바르지 않습니다")
            value.update({"mediaId": media_id, "mediaSha256": media_sha})
        base = params.get("baseVersionId")
        if not isinstance(base, str) or not SHA256.fullmatch(base):
            raise StudioAgentError("baseVersionId가 올바르지 않습니다")
        value["baseVersionId"] = base
        if params.get("range") is not None:
            span = params["range"]
            if not isinstance(span, dict) or set(span) != {"start", "end"}:
                raise StudioAgentError("range가 올바르지 않습니다")
            start, end = span["start"], span["end"]
            if any(isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item) or item < 0 for item in (start, end)) or not start < end:
                raise StudioAgentError("range가 올바르지 않습니다")
            value["range"] = {"start": start, "end": end}
        return value

    @staticmethod
    def _delivery(row):
        payload = json.loads(row[4])
        stored_status = row[5]
        return {
            "requestId": row[0], "projectId": row[1], "threadId": row[2], "fingerprint": row[3], "payload": payload,
            "status": "uncertain" if stored_status == "sending" else stored_status, "storedStatus": stored_status,
            "note": row[6], "queueMessageId": row[7], "createdAt": _iso(row[8]), "updatedAt": _iso(row[9]),
        }

    def _message(self, snapshot, binding, params, selected):
        try:
            # studio.road_music_cli() validates the installed/public CLI root and
            # remains correct for both canonical and mirrored skill locations.
            from studio import road_music_cli
            cli = road_music_cli()
        except (ImportError, ValueError, OSError) as error:
            raise StudioAgentError("현재 설치의 Road Music 공개 CLI를 찾을 수 없습니다") from error
        content = {
            "requestId": params["requestId"], "threadId": binding["threadId"], "project": snapshot["project"], "projectId": snapshot["projectId"],
            "baseVersionId": snapshot["baseVersionId"], "sourceSha256": snapshot["sourceSha256"], "groupId": snapshot["sourceSha256"],
            "selection": snapshot["selection"], "target": params["target"], "intent": params["intent"],
            "prompt": params["prompt"], "preserve": params.get("preserve"), "revisedLyrics": params.get("revisedLyrics"),
            "range": params.get("range"), "media": [{key: item[key] for key in ("id", "kind", "name", "sha256", "duration", "path")} for item in snapshot["privateMedia"]],
            "selectedMedia": selected,
        }
        if params["target"] == "chat":
            instructions = (
                "[Road Music 제작실 대화] studioRequestId=" + params["requestId"] + "\n"
                "다음 JSON은 등록된 제작실에서 같은 Codex 대화로 보낸 후속 질문입니다. "
                "첫 동작으로 현재 CODEX_THREAD_ID가 저장된 threadId와 일치하는지 확인한 뒤, "
                "ROADMUSIC_DATA_DIR=" + shlex.quote(str(self.db.data_dir)) + " node " + shlex.quote(str(cli)) +
                " studio:request:update --stdin 공개 명령으로 status:'accepted' ACK를 기록하세요. "
                "이 요청은 대화·질문 전용입니다. 음원·영상 생성, 설치, 파일 변경은 하지 마세요. 요청 상태 원장 갱신만 허용합니다. "
                "답변을 준비한 뒤 같은 공개 명령으로 status:'succeeded'와 간결한 note를 기록하고, 공개 assistant 최종 응답에는 요약으로 자르지 않은 답변 전문을 작성하세요. "
                "succeeded는 질문의 답변 준비 완료이며 음원·영상 제작 완료가 아닙니다. 추가 정보가 필요하면 needs-user-input으로 기록하세요.\n\n" + _json(content)
            )
        else:
            instructions = (
            "[Road Music 제작실 요청] studioRequestId=" + params["requestId"] + "\n"
            "다음 JSON은 등록·해시 검증된 로컬 제작실 요청입니다. "
            "첫 동작으로 현재 CODEX_THREAD_ID가 저장된 threadId와 일치하는지 확인한 뒤, "
            "ROADMUSIC_DATA_DIR=" + shlex.quote(str(self.db.data_dir)) + " node " + shlex.quote(str(cli)) +
            " studio:request:update --stdin 공개 명령으로 status:'accepted' ACK를 기록하세요. accepted는 음원 완성이 아닙니다. "
            "처리 전에 studio:agent:status로 현재 baseVersionId·원음과 선택 미디어 SHA를 아래 요청과 다시 대조하세요. 변경·누락되었으면 needs-user-input으로 기록하고 생성하지 마세요. "
            "review는 공식 가이드·가능성·한계만 검토하고 생성하지 마세요. produce만 승인 범위에서 생성합니다. "
            "review 요청의 succeeded는 검토 완료일 뿐 음원·영상 완성이 아닙니다. "
            "매 요청에 skills/road-music/SKILL.md, docs/yue-prompt-guide.md, docs/vendor/yue2/README.md 및 고정 공식 YuE 자료를 읽고 실행 schema를 확인하세요. "
            "YuE는 waveform inpainting·음소 단위 교정이 없으므로 가사/style 변경은 prepare→generate로 새 전체 녹음을 만들며, ABC-only render를 가사 편집에 사용하거나 replay를 가사 편집에 쓰지 마세요. "
            "원본과 승인 원문을 보존하고 공개 Road Music CLI만 사용하세요.\n\n" + _json(content)
            )
        if len(instructions.encode("utf-8")) > MAX_MESSAGE:
            raise StudioAgentError("Codex 대기열 메시지가 120KiB를 초과했습니다")
        return instructions

    def _save_status(self, request_id, status, note=None, queue_message_id=None):
        now = _now_ms()
        with self.db.transaction(write=True) as connection:
            # A fast idle Codex thread can ACK while queue still waits for stdout.
            # Only the dispatch's own transient row may be finalized here.
            connection.execute("UPDATE studio_agent_deliveries SET status=?,note=?,queue_message_id=coalesce(?,queue_message_id),updated_at=? WHERE request_id=? AND status='sending'", (status, note, queue_message_id, now, request_id))
            row = connection.execute("SELECT request_id,project_id,thread_id,fingerprint,payload_json,status,note,queue_message_id,created_at,updated_at FROM studio_agent_deliveries WHERE request_id=?", (request_id,)).fetchone()
        return self._delivery(row)

    def submit(self, project, params):
        snapshot, params = self._snapshot(project), self._params(params)
        if params["baseVersionId"] != snapshot["baseVersionId"] or snapshot["invalidMedia"]:
            raise StudioAgentError("프로젝트 스냅샷 또는 등록 파일이 변경되었습니다. 다시 불러오세요.")
        binding = self._binding(snapshot["projectId"])
        if binding is None or binding["projectPath"] != snapshot["project"]:
            raise StudioAgentError("Codex 대화 연결이 필요합니다")
        executable = self._executable()
        if executable is None:
            raise StudioAgentError("codex queue 실행 파일을 찾을 수 없습니다")
        selected = None
        if "mediaId" in params:
            selected = next((item for item in snapshot["privateMedia"] if item["id"] == params["mediaId"] and item["sha256"] == params["mediaSha256"]), None)
            if selected is None:
                raise StudioAgentError("선택한 미디어가 현재 등록 버전과 다릅니다")
        if params.get("range") is not None:
            target = selected or next((item for item in snapshot["privateMedia"] if item["id"] == "music" and item["kind"] == "music"), None)
            if target is None or target["duration"] is None or params["range"]["end"] > target["duration"]:
                raise StudioAgentError("검토 구간은 길이가 확인된 등록 미디어 안에서 지정해야 합니다")
        if params["intent"] == "produce" and snapshot["sourceSha256"] is None:
            raise StudioAgentError("제작에는 등록된 원음이 필요합니다")
        fingerprint = hashlib.sha256(_json({"params": params, "baseVersionId": snapshot["baseVersionId"], "sourceSha256": snapshot["sourceSha256"]}).encode()).hexdigest()
        message = self._message(snapshot, binding, params, selected)
        with self.db.transaction(write=True) as connection:
            row = connection.execute("SELECT request_id,project_id,thread_id,fingerprint,payload_json,status,note,queue_message_id,created_at,updated_at FROM studio_agent_deliveries WHERE request_id=?", (params["requestId"],)).fetchone()
            if row is not None:
                delivery = self._delivery(row)
                if delivery["fingerprint"] != fingerprint:
                    raise StudioAgentError("같은 requestId에 다른 요청을 보낼 수 없습니다")
                return delivery
            domain = "motion" if params["target"] == "video" else "music"
            ledger_intent = "review" if params["intent"] == "review" else "revision"
            if params["intent"] == "produce" and params["target"] == "video" and not any(item["kind"] == "video" for item in snapshot["privateMedia"]):
                ledger_intent = "create"
            self.ledger.request({"project": snapshot["project"], "groupId": snapshot["sourceSha256"], "domain": domain, "intent": ledger_intent, "prompt": params["prompt"], "source": "user", "requestId": params["requestId"], "title": snapshot["projectName"]}, connection=connection)
            now = _now_ms()
            connection.execute("INSERT INTO studio_agent_deliveries(request_id,project_id,thread_id,fingerprint,payload_json,status,note,queue_message_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (params["requestId"], snapshot["projectId"], binding["threadId"], fingerprint, _json(params), "sending", None, None, now, now))
        args = [executable, "queue", "--thread", binding["threadId"], "--message", message]
        try:
            completed = self.runner(args, check=False, capture_output=True, text=True, timeout=25)
        except (OSError, FileNotFoundError) as error:
            return self._save_status(params["requestId"], "failed", f"Codex 대기열을 시작하지 못했습니다: {error}")
        except subprocess.TimeoutExpired:
            return self._save_status(params["requestId"], "uncertain", "Codex 대기열 응답이 시간 안에 확인되지 않았습니다. 자동 재전송하지 마세요.")
        stdout = completed.stdout if isinstance(completed.stdout, str) else ""
        receipt = QUEUE_RECEIPT.search(stdout)
        if completed.returncode == 0 and receipt is not None and receipt.group(2).lower() == binding["threadId"]:
            return self._save_status(params["requestId"], "queued", "Codex 대화 수신 ACK를 기다립니다.", receipt.group(1).lower())
        return self._save_status(params["requestId"], "uncertain", "Codex 대기열 제출 결과를 확인할 수 없습니다. 자동 재전송하지 마세요.")

    def requests(self, project, request_id=None):
        snapshot = self._snapshot(project)
        if request_id is not None and (not isinstance(request_id, str) or not PUBLIC_ID.fullmatch(request_id)):
            raise StudioAgentError("requestId는 48자리 소문자 16진수여야 합니다")
        where, values = ["project_id=?"], [snapshot["projectId"]]
        if request_id is not None:
            where.append("request_id=?"); values.append(request_id)
        with self.db.transaction() as connection:
            if connection is None or not self.db._has_table(connection, "studio_agent_deliveries"):
                rows = []
            else:
                rows = connection.execute("SELECT request_id,project_id,thread_id,fingerprint,payload_json,status,note,queue_message_id,created_at,updated_at FROM studio_agent_deliveries WHERE " + " AND ".join(where) + " ORDER BY updated_at DESC LIMIT 50", values).fetchall()
        return {"requests": [self._delivery(row) for row in rows]}

    def update(self, project, params):
        if not isinstance(params, dict) or set(params) - {"requestId", "status", "note"}:
            raise StudioAgentError("지원하지 않는 요청 상태 입력입니다")
        snapshot = self._snapshot(project)
        request_id, status = params.get("requestId"), params.get("status")
        if not isinstance(request_id, str) or not PUBLIC_ID.fullmatch(request_id) or status not in UPDATE_STATUS:
            raise StudioAgentError("requestId 또는 status가 올바르지 않습니다")
        note = _text(params.get("note"), "note", 4000)
        current_thread = _thread(self.env.get("CODEX_THREAD_ID"))
        with self.db.transaction(write=True) as connection:
            row = connection.execute("SELECT request_id,project_id,thread_id,fingerprint,payload_json,status,note,queue_message_id,created_at,updated_at FROM studio_agent_deliveries WHERE request_id=? AND project_id=?", (request_id, snapshot["projectId"])).fetchone()
            if row is None:
                raise StudioAgentError("제작 요청을 찾을 수 없습니다")
            delivery = self._delivery(row)
            if delivery["threadId"] != current_thread:
                raise StudioAgentError("연결된 Codex 대화만 요청 상태를 바꿀 수 있습니다")
            previous = delivery["storedStatus"]
            allowed = {
                "sending": {"accepted"}, "queued": {"accepted"}, "uncertain": {"accepted"}, "accepted": {"reviewing", "running", "needs-user-input", "succeeded", "failed"},
                "reviewing": {"running", "needs-user-input", "succeeded", "failed"}, "running": {"needs-user-input", "succeeded", "failed"},
                "needs-user-input": {"reviewing", "running", "failed"},
            }
            if previous in TERMINAL or status not in allowed.get(previous, set()):
                raise StudioAgentError("요청 상태 전환이 올바르지 않습니다")
            now = _now_ms()
            connection.execute("UPDATE studio_agent_deliveries SET status=?,note=?,updated_at=? WHERE request_id=?", (status, note, now, request_id))
            row = connection.execute("SELECT request_id,project_id,thread_id,fingerprint,payload_json,status,note,queue_message_id,created_at,updated_at FROM studio_agent_deliveries WHERE request_id=?", (request_id,)).fetchone()
        return self._delivery(row)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("agent-status", "agent-bind", "request-submit", "request-status", "request-update", "conversation-history", "draft-get", "draft-set"))
    parser.add_argument("--data-dir", required=True)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--json")
    source.add_argument("--stdin", action="store_true")
    args = parser.parse_args(argv)
    try:
        raw = sys.stdin.buffer.read(MAX_MESSAGE + MAX_LYRICS + 1).decode("utf-8") if args.stdin else args.json
        if len(raw.encode("utf-8")) > MAX_MESSAGE + MAX_LYRICS:
            raise StudioAgentError("요청 본문이 너무 큽니다")
        payload = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        if not isinstance(payload, dict) or not isinstance(payload.get("project"), str):
            raise StudioAgentError("project가 필요합니다")
        agent = StudioAgent(args.data_dir)
        if args.action == "agent-status": result = agent.context(payload["project"])
        elif args.action == "agent-bind": result = agent.bind(payload["project"])
        elif args.action == "request-submit": result = agent.submit(payload["project"], {key: value for key, value in payload.items() if key != "project"})
        elif args.action == "request-status": result = agent.requests(payload["project"], payload.get("requestId"))
        elif args.action == "conversation-history": result = agent.history(payload["project"], {key: value for key, value in payload.items() if key != "project"})
        elif args.action == "draft-get": result = agent.draft_get(payload["project"], {key: value for key, value in payload.items() if key != "project"})
        elif args.action == "draft-set": result = agent.draft_set(payload["project"], {key: value for key, value in payload.items() if key != "project"})
        else: result = agent.update(payload["project"], {key: value for key, value in payload.items() if key != "project"})
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False, allow_nan=False))
        return 0
    except (StudioAgentError, ManagementDBError, ProductionLedgerError, ValueError, TypeError) as error:
        print(json.dumps({"ok": False, "error": {"code": "studio_agent_error", "message": str(error)}}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
