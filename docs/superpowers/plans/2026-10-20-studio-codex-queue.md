# 제작실 Codex 대기열 연결 구현 계획

> **For agentic workers:** 구현은 독립 담당 범위로 나누고 통합 후 독립 검수한다. 기존 사용자 수정은 보존한다.

**Goal:** 제작 설정과 음악 상세에서 수정 요청을 원래 Codex 대화에 보내고 실제 수신·처리 상태를 확인한다.

**Architecture:** 실제 수신에 성공한 공식 `codex queue`를 사용한다. 기존 프로필 SQLite에 연결·요청 전달 상태를 기록하고 기존 ProductionLedger 원문 기록과 연결한다. 브라우저는 등록 프로젝트·파일 ID만 제출하며, 수신한 Codex는 공개 CLI로 ACK와 진행 상태를 기록한다.

**Tech Stack:** Node.js 기존 CLI, Python 표준 sqlite3/subprocess, 기존 HTML/JavaScript·Paperlogy. 새 의존성 없음.

**Spec:** [설계](../../studio-codex-editing-design.md), [연결 실측](../../studio-codex-connection-qa.md). `rm-queue-20261020-c`가 같은 대화의 다음 턴으로 실제 수신되어 큐 경로를 승인했다.

## 공통 제약

- 즉시 steer를 구현했다고 표시하지 않는다. 현재 작업이 끝난 뒤 같은 대화에서 처리한다.
- saved/sending/queued/accepted/진행/완료/불명 상태를 구분한다. 타임아웃·응답 유실을 자동 재전송하지 않는다.
- 원본 음원·가사·기존 완성본과 기존 선택·검수 의견을 보존한다.
- bind와 ACK는 로컬 CLI에서만 가능하며 현재 CODEX_THREAD_ID와 연결 대화를 대조한다.
- 실제 음악 생성은 사용자가 HTML에서 명시한 승인 범위에 따른다. 검증 때문에 모델·곡을 생성하지 않는다.

## 검수 초점

- 중복 클릭·동시 POST·재시작으로 같은 요청이 두 번 큐에 들어가지 않는가.
- 잘못된 프로젝트·오래된 스냅샷·변조된 파일·다른 대화 ACK가 거부되는가.
- 타임아웃 뒤 입력과 요청 ID가 보존되고 불명 상태를 성공으로 바꾸지 않는가.
- 구간이 실제 선택한 미디어에 연결되고 원가사와 수정 가사가 구분되는가.
- 320px·키보드·복사 거절·오프라인에서도 기존 재생과 검수 기능이 유지되는가.

## 작업

### 1. 연결·전달 상태와 단위 검증

파일: 새 `scripts/studio_agent.py`, `scripts/test_studio_agent.py`, 기존 `management_db.py`, `production_ledger.py`.

- [x] 실패 테스트 작성: 동시·중복 ID, 바뀐 본문, 불명 전송, 원본 해시/스냅샷, 다른 대화 ACK, 기존 DB 보존.
- [x] `StudioAgent.bind/connection/context/submit/requests/update` 구현. 큐 호출은 고정 실행파일·인자 배열·25초 제한을 사용한다.
- [x] 기존 원문 원장과 sending 레코드를 트랜잭션으로 기록하고 큐 응답의 메시지 ID·대화 ID를 대조한다.
- [x] 실제 큐 제출 없는 주입 runner 단위 검사를 통과한다.

### 2. 공개 CLI와 초기 연결

파일: `electron/cli-catalog.js`, `cli/client.js`, `cli/storage.js`, 관련 Node 테스트. 초기 바인딩은 기존 Python `serve`에서 실행한다.

- [x] studio:agent:status/bind, studio:request:submit/status/update schema와 단일·batch 로컬 실행을 추가한다.
- [x] 기존 Python runner를 재사용하고 서비스·브라우저 자동 시작 없이 호출한다.
- [x] 제작실 신규 시작에서 현재 CODEX_THREAD_ID가 있고 기존 연결이 없는 경우에만 해당 프로젝트를 현재 대화에 연결한다. 다른 작업의 프로젝트는 자동 재연결하지 않는다. 재사용 중 미연결 프로젝트는 명시 bind로 연결한다.
- [x] schema·로컬 실행·없는 도구·실패 격리와 기존 초기 구동 회귀 검사를 통과한다.

### 3. 토큰 보호 HTTP와 화면

파일: `scripts/studio.py`, 새 HTTP 테스트, `assets/studio.html`, `work-detail.html`, `agent-ui.js`, UI 테스트, 가이드.

- [x] `/api/agent/context`, `/api/agent/requests` 조회/제출을 기존 인증·Host·Origin·크기 검증 안에 추가한다.
- [x] 그룹에 등록된 프로젝트만 선택하며 snapshot/media ID/해시를 재검증한다. 브라우저 bind·ACK는 제공하지 않는다.
- [x] 공통 요청 폼: 프로젝트·미디어·검토 구간·보존 조건·수정 가사·검토/제작 의사와 요청 상태를 제공한다.
- [x] 복사 복구·초안 보존·중복 클릭·불명 전송 상태와 좁은 화면을 검증한다.

### 4. 통합·실제 전달 검증

- [x] canonical 스킬과 `.agents` 실행 사본을 동기화한다.
- [x] 전체 npm test, 변경 JS 구문 검사, Python·HTTP·VM 회귀와 diff 검사를 통과한다.
- [x] 기존 프로젝트·의견을 보존하여 제작실 서버만 새 코드로 갱신하고 Ego에서 재생·폼·글꼴·320px을 확인한다.
- [x] HTML에서 검토 전용 진단 한 건을 현재 대화 큐에 제출한다. 다음 턴 수신 시 공개 CLI ACK를 기록하고 UI 상태 조회로 확인한다.
- [x] 설계·연결 검증·CLI 레퍼런스·가이드에 실제 지원과 남은 제한을 반영한다. 배포·음원 재생성은 수행하지 않는다.
