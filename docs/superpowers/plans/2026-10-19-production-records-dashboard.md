# 제작 요청·성능·버전 원장과 대시보드

## 목표와 범위
음악·모션그래픽의 최초 사용자 요청과 모든 수정 요청을 정확한 원문으로 보관하고, 작업·생성 파일·응답 요약·소요시간을 프로필 SQLite에 연결한다. 프로젝트/음악 그룹 제거와 복구도 함께 처리한다. 기존 제작 엔진·원음·완성본은 변경하지 않는다. 버전은 현재 설치와 기존 업데이트 확인 결과만 기록하며 자동 설치·상주 검사를 새로 만들지 않는다.

## 데이터 계약
- 기존 `storage.sqlite3`에 전용 관계형 production 테이블을 추가한다. 실제 미디어/프레임/로그는 BLOB으로 저장하지 않는다. 기존 납품 버전/diff 원장은 유지한다.
- projectId는 절대 작업 경로의 SHA256, groupId는 원음 SHA256이다. 아직 원음이 없는 작업도 프로젝트로 시작하고 후속 게시 시 그룹을 연결한다.
- `ProductionLedger(data_dir)`는 `request(params)`, `start_task(params)`, `finish_task(params)`, `projects(params)`, `prompts(params)`, `tasks(params)`, `files(params)`, `dashboard(params)`, `components(params)`, `record_component(params)`, `dispatch(action,params)`를 제공한다. 공개키는 camelCase다. 자체 write시에만 schema를 만들고 읽기는 기존 DB를 read-only로 연다.
- 요청: project 절대경로, domain music|motion, intent(최대80자), prompt(원문 최대64KiB), source user|engine(기본user), requestId(선택48hex), title/groupId(선택). 프로젝트/domain별 첫 user 요청을 메인으로 유지하며 engine caption은 원문 요청과 구분한다. requestedAt은 UTC ISO초+epoch ms로 기록하고 화면은 사용자 지역 년월일시분초로 표시한다.
- 작업 시작: project, domain, taskType(최대80자), engine/model(선택), requestId/taskId(선택48hex), status queued|running(기본running). 같은taskId 재호출은 중복 생성하지 않고 queued→running만 갱신한다.
- 작업 완료: taskId48hex, status succeeded|failed|cancelled, elapsedMs/mediaSeconds/frameCount(측정값만 선택), aiSummary/resultSummary/errorSummary(각최대4000자), files[{path 절대경로,role input|intermediate|final|cache|artifact}]. 파일은 메타데이터만 등록하고 바뀌거나 정리돼도 생성 이력은 남긴다. 종료 재시도는 idempotent, 상충 재기록은 거절한다. 상위 작업과 단계 작업은 합계에서 구분한다.
- 조회: projectId/groupId/domain/filter(선택), limit1..100(기본30), cursor keyset. projects/prompts/tasks/files 모두 bounded page+nextCursor. mainPrompts와 총 요청/생성/수정 횟수는 SQL로 집계한다.
- 성능: 성공/실패/진행 수, 실제 elapsed/wait, 같은 domain/taskType/engine/model별 성공 평균·중앙값·p95·미디어 길이당 처리시간/렌더fps, 일별 처리량, 비교 가능한 느린 작업을 표시한다. 표본수/단위와 기준을 명시하고 무자료는0초나정상으로 가정하지 않는다. 총 경과합계는 단계 중복합산을 피하며 모든평균은필터전체로계산한다.
- 버전: componentId/kind/name/installedVersion/latestVersion/check status/time/source URL. 기존 app/CLI/skills updater 결과를 기록한다. DB기록만으로실제설치성공을추정하지않고신뢰할수있는기존manifest/버전조회가실제설치기준이다.

## 구현 경로
1. 기존 callers/fixtures 파악 후 core+회귀를 먼저 구성한다. 새 의존성 없이 Python sqlite3/브라우저SVG를 재사용한다.
2. CLI production:* 로컬명령과 음악 lifecycle, Showreel lifecycle를 연결한다. 자동수집은 engine 입력/실측만 저장하고 자연어 원문·AI요약은 스킬이 명시 기록한다.
3. 별도 /dashboard/ 페이지에 요약·필터·추이/작업별비교·느린작업·프로젝트목록·버전알림을 표시한다. 프로젝트 세부에서 메인/이력프롬프트복사,요청연결결과파일·작업시간을 제공한다. keyset+IntersectionObserver/더보기대체로무한스크롤하며DOM도상한을둔다.
4. 현재 skill 원본 music-road-skills에 제작기록 스킬과 제작/업데이트스킬 연결, Markdown/HTML 가이드를 보완한다.
5. 삭제/복구와 SQL남는행, XSS/입력오류/중복/실패·취소/동시기록/페이징·무표본을 회귀검증한다. 격리프로필 실제 CLI+Ego HTML을 검수하고 생성테스트찌꺼기는정리한다. 새 AI모델추론은이작업의필수가아니다.

## 소유권과 검증
core, Node연결, Python제작연결, HTML, skill/docs는 파일소유권을 나눠 구현하고 루트가 통합·최종검증한다. 독립검토와 현실적인스킬 forward-test를 별도패스로 수행한다. 사용자기존자료/모델/완성본과 다른세션 변경을 되돌리지 않는다. 검증후에만완료를보고한다.
