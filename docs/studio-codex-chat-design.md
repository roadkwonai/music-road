# HTML 안의 Codex 대화 전문·이력

2026-10-20. 기존 동일 대화 큐 연결에 저장된 대화 전문 조회와 후속 질문을 추가했다. 실제 음악·영상 생성 없이 [모의·실기 검수](studio-codex-chat-qa.md)를 마쳤다.

## 동작

- 송신은 검증된 `codex queue`를 유지한다. HTML의 대화·질문은 `target:chat`, `intent:review`로만 전달하며 음악·영상 생성, 설치, 파일 변경을 실행하지 않는다.
- 기존 음악·가사·영상 요청의 검토/제작, 수정 가사·미디어 SHA·구간·보존 조건은 유지한다. 전송 불명 상태는 같은 본문/ID를 보존하고 자동 재전송하지 않는다.
- 조회는 연결된 프로젝트의 threadId로만 한다. 공식 `codex app-server --stdio` reader에서 initialize → thread/read(includeTurns:false) → thread/turns/list(itemsView:full)만 사용한다. 대화 재개·새 turn 시작·모델 실행은 하지 않는다.
- 사용자 메시지의 텍스트와 공개 assistant 메시지의 텍스트만 전문으로 보여 준다. 시스템·개발자 메시지, 숨은 추론, 도구 호출·결과, raw 프로토콜은 반환하지 않는다.
- 최신 페이지 자동 갱신, 이전 대화 더 보기, 메시지별 원문 복사와 수동 복사를 제공한다. 읽던 과거 위치와 작성 중 초안을 보존한다.

## 읽기 계약

공개 CLI `studio:conversation:history`는 `project`, 선택 `cursor`, `limit:1..20`을 받는다. 브라우저는 `/api/agent/history`에 등록 projectId/groupId와 cursor/limit만 보낸다. 임의 threadId, 파일 경로, RPC method를 받지 않는다. 기존 loopback·token·Host·Origin 검증을 적용한다.

응답은 연결 threadId, `source:codex-app-server`, `mode:persisted`, 조회 시각, 최신순 turns, nextCursor다. 각 turn은 공개 텍스트 메시지·저장된 turn 상태·기록된 시작/완료 시각을 담는다. 메시지 ID와 turn ID로 페이지를 병합한다. 전문을 4,000자 요약으로 바꾸지 않는다.

assistant phase의 commentary/partial_answer/final_answer/null을 구분하며 null을 완료 응답으로 추정하지 않는다. 누락 시각을 생성하지 않는다. 별도 reader의 thread.status=notLoaded를 실제 데스크톱 작업 종료로 해석하지 않는다.

## 반영 시점과 보존 범위

이력 창은 공식 저장 이력을 주기적으로 읽는다. 토큰 단위 스트리밍을 보장하지 않으며 저장 전 메시지의 반영은 지연될 수 있다. 현재 작업이 끝난 뒤 같은 대화의 다음 turn에서 큐 요청을 처리한다. 삭제·압축으로 원본 저장소에서 제공하지 않는 과거 텍스트를 복원했다고 주장하지 않는다.

Codex 이력 DB/rollout을 직접 읽거나 대화 전문을 Road Music SQLite에 복제하지 않는다. 일시 reader는 기한·응답 크기를 제한하고 자신의 자식만 종료한다. 최신 페이지의 짧은 메모리 캐시로 중복 실행을 줄인다.

## 서버 재시작과 작성 중 초안

입력 초안은 프로젝트 ID와 화면 범위(`studio`/`detail`)로 로컬 관리 SQLite에 보관한다. 기존 `management_documents`를 재사용하며 대화 전문을 복제하지 않는다. `studio:draft:get/set`과 인증된 `/api/agent/draft`는 초안 조회·저장만 수행하고 queue·ACK·음원/영상 작업을 실행하지 않는다. 서버의 포트·토큰이 바뀌어도 같은 프로젝트의 저장된 초안을 읽는다.

브라우저의 즉시 임시 보관과 서버 저장 상태를 구분한다. 서버가 저장을 확인한 내용이 재시작 복원 대상이다. 늦은 조회·저장 응답이 새 입력이나 다른 프로젝트를 덮지 않게 하고 저장 요청은 순서대로 보낸다. 저장 실패에는 입력을 유지하고 상태를 표시한다. 실제 요청 원장의 상태를 초안 필드로 바꾸지 않으며, 완료 뒤 새로 편집한 내용도 완료 본문으로 오인해 비우지 않는다. 프로젝트를 바꿀 때 현재 초안 저장 응답을 먼저 확인하며 실패하면 전환을 취소한다. 프로젝트·음악 그룹을 명시적으로 정리할 때 해당 초안 문서도 함께 제거하고 다른 프로젝트 초안은 유지한다.

## 검증

- 설치된 Codex 0.163.0의 공식 schema를 생성해 계약을 확인하고, 현재 threadId의 사용자/assistant 이력을 읽는 실기 probe가 성공했다. 대화 재개/모델 실행은 없었다.
- 새 구현의 단위·HTTP·VM 검증은 고정 fake queue/JSON-RPC 응답을 사용한다. 음악 보완·수정 가사 원문, 구간·미디어 SHA·보존 조건, 장문 전문과 이력 페이지를 확인한다.
- 실제 HTML 모의 서버는 격리 프로필과 기존 검증용 파일을 사용한다. fake 실행파일은 서버의 신뢰된 환경에서만 지정하며 브라우저가 모의 모드나 실행파일을 지정하지 않는다.
- 실제 제작실에서는 읽기 전용으로 현재 대화의 전문·이력을 확인한다. 이번 검증을 위해 실제 음악/영상 제작 요청을 제출하지 않는다.

## 공식 근거

- [읽기 전용 thread 조회](https://learn.chatgpt.com/docs/app-server#read-a-stored-thread-without-resuming)
- [대화 turn 페이지](https://learn.chatgpt.com/docs/app-server#list-thread-turns)
- [메시지 항목](https://learn.chatgpt.com/docs/app-server#items)
- [실행 버전과 일치하는 schema](https://learn.chatgpt.com/docs/app-server#message-schema)
