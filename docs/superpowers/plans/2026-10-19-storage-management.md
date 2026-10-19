# 프로젝트 저장공간 관리 구현 계약

사용자 목표: 현재 프로그램·모델·원음·완성파일·작업 중 히스토리 보존, 프로젝트/음악별 캐시 격리, 완료 후 안전한 자동 정리, CLI·HTML에서 미리 보고 선택/전체 정리, 최소한의 제작·삭제 이력과 운영 스킬.

## 구현 경계
- 하나의 Python 저장공간 엔진 `.agents/skills/road-music-video-studio/scripts/storage_manager.py`를 CLI 브리지와 HTML 서버가 공유한다. 새 패키지 없음.
- `StorageManager(data_dir=None)`는 기본 ROADMUSIC_DATA_DIR/WorkLibrary의 기본 데이터 경로 사용. 등록 프로젝트만 접근, `studio-project.json` 또는 production.json+playlist.json, 검증된 MV input/plan 표지가 있는 실제 절대 프로젝트 폴더를 register. registry는 앱 데이터 `storage-registry.json`. 프로젝트 ID = canonical absolute path SHA256. 경로를 HTTP에서 받지 않고 등록 ID로만 조작한다.
- 프로젝트 `.roadmusic/{cache,intermediate,history}`를 처음부터 분리한다. 모든 미등록·알 수 없는 파일은 보호. `track`은 프로젝트 내부 실제 파일/폴더를 cache/intermediate/history로 명시 등록. 프로그램·모델·원본·publish 결과·library 결과·선택·피드백·설정·manifest·승인 자산·보존핀과 그 상위 경로는 삭제 금지. symlink·root·경로이탈 금지. 삭제에서 등록된 폴더도 자식 전체를 다시 검증한다.
- 상태 editing/completed/archived. 기본 editing + preserveHistory=true. editing/history보존 정책에서 중간본·히스토리는 자동정리 금지. autoCleanup 기본 true라도 완료 후 TTL(기본7일)이 지난 명시 cache만 삭제, 실제 production lease(pid/token)가 있으면 모두 거부. 임의 타이머/상주 감시 생성 안 함. state completed 전환 및 publish 성공시 maybe_cleanup 호출. 실패 cleanup은 publish성공을 뒤집지 않고 경고한다.
- cleanup preview는 선택된 opaque entry ID 또는 모든 등록 프로젝트 범위를 받음. preview 반환 planId(저장된 불변 계획), 총 파일수/용량/분류·보호사유. execute는 planId+confirm:true 필요, 경로/정책/보호/lease/파일inode·size·mtime를 재검증, 변경된 항목은 삭제하지 않음. 모델·음원·최종본을 삭제하는 옵션 없음. 감사 이력은 원본 요청·완성manifest·검수의견을 남기고 작업/정리별 짧은 요약을 `.roadmusic/history.jsonl`에 누적(캐시정리 대상 아님). 디스크 회수 추정은 하드링크 공유를 반영.

## 공통 API (Python)
`StorageManager(...).dispatch(action, params)` -> JSON dict. actions:
- `list {projectId?}` -> `{projects:[{id,name,path,state,preserveHistory,autoCleanup,retainDays,busy,totalBytes,reclaimableBytes,entries:[{id,path,relativePath,kind,description,bytes,fileCount,protected,reason}]}], totals:{totalBytes,reclaimableBytes}, disk:{totalBytes,freeBytes}}`
- `register {project}` -> project 요약. CLI만 project 절대경로 입력 허용, HTTP에서는 세션 currentproject만 자동등록.
- `track {projectId,path,kind,description?,reproducible?}` -> 등록정보(상대경로 path). cache reproducible=true 필요, 기록/중간본 기본수동.
- `policy {projectId,state?,preserveHistory?,autoCleanup?,retainDays?}` -> 갱신 project. 수정중기본보존. 완료전환은maybe_cleanup도실행.
- `pin {projectId,entryId,pinned}` -> 보존 설정.
- `preview {projectId?,entryIds?,kinds?}` -> `{planId,entries:[...],fileCount,bytes,blocked:[...],expiresAt}`. projectId없음=등록전체, entryIds없음=해당범위정리가능항목전체. kinds 기본cache, 선택 intermediate/history는 정책허용/명시수동만.
- `cleanup {planId,confirm}` -> `{removedFiles,freedBytes,skipped:[...],auditPath}`.
- `history {projectId}` -> `{events:[...]}`.
- `lease {projectId,operation:'acquire'|'release',pid?,token?}` -> 작업잠금. 살아있는 PID+토큰 연계. lease 생성은 명시제작 시작, 완료/실패finally해제. 죽은PID만재검증후해제.
`maybe_cleanup(projectId)` -> 완료프로젝트만TTL지난재생성cache대상.
모듈직접실행: python storage_manager.py ACTION --json JSON [--confirm] => `{ok:true,result:...}` 또는 `{ok:false,error:{code,message}}` stdout한줄, 오류exit1.

## CLI
`storage:list/register/track/policy/pin/preview/cleanup/history/lease` 공개카탈로그, 클라이언트가로컬Python모듈dispatch(앱재시작불필요), batch·schema·confirm·timeout기존계약유지. 삭제는 --confirm필수. 입력엄격검증. 배포CLI에 제작실과운영skill포함, 현재설치모델·출력데이터패키징금지.

## HTML
전역기존4메뉴유지, 내작업물→저장공간관리링크 + 음악별상세프로젝트선택연결. `/storage/` 새역할화면. 세션토큰·Host·Origin·Content-Type검증그대로. GET `/api/storage` list, POST `/api/storage/{track,policy,pin,preview,cleanup,lease}` 는projectId등록범위만(임의register/pathroot금지), GET `/api/storage/history?projectId=...`. project별상태·보존설정·분류/용도/크기·보호사유·핀·체크박스·프로젝트/전체미리보기·삭제확인dialog·감사이력. 실제값없으면0과빈상태, 가짜cache제거수표시금지. Paperlogy·공통CSS·Heroicons·모바일/키보드·오류/로딩보존. 설명원문Markdown가이드와연결.

## 검증/분담
- core 작성자: storage_manager.py + 안전/TTL/lease/변조/하드링크/진행중/원본보호/프로세스잠금 테스트.
- HTML 작성자: studio.py통합+assets/storage.html/js+works연결+guide등록+HTTP테스트/화면테스트. core모듈수정금지.
- CLI 작성자: cli/storage.js·client/catalog/transport필요분·배포포함·CLI테스트·CLI docs. studio.py/core수정금지.
- 메인: 프로젝트운영skill 생성·기존제작skill에연결·가이드/설계정합성·전체검증·격리UI실사용검수·통합. 기존음원/영상/모델/라이브러리삭제없음.
- 독립검수: 보존데이터안전경계와skill현실시나리오 forward-test를격리환경에서실행.

## 독립 설계 검토 반영
- registry/plan/history의 프로세스 잠금·원자 갱신, execute의 leaf·parent no-follow 재검증, plan 일회 소비와 만료를 적용한다.
- HTML은 lease 획득/해제 API를 노출하지 않고 busy 상태만 읽는다.
- intermediate/history는 정확한 ID의 명시 수동 선택 + preserveHistory=false + 무잠금일 때만, editing 상태의 사용자 선택도 지원한다. 최소 요약·현재 revision은 항상 보호한다.
- 실제 Showreel native/CD prepare/render에 등록/관리 cache 배치/lease/finally해제와 maybe_cleanup 연동을 추가하고 render --keep에 의한 청크 중복을 방지한다.
- cache 예산 maxCacheBytes=2GiB·maxCacheFiles=20000은 경고로 제공하고 원본/히스토리를 강제 삭제하지 않는다. TTL은 core의 lastUsedAt/completedAt을 기준으로 계산한다.

## 최종 보존 경계 보강
- track는 종류별 프로젝트 `.roadmusic/cache|intermediate|history` 안만 허용한다. 레거시 밖의 파일은 읽기 전용으로 유지한다.
- 앱 번들 경로 suffix/모델/소스·원본·완성파일 보호를 강제하고, 삭제 전 감사 기록 대상의 nofollow 검사와 durable intent를 먼저 기록한다.
- 누락/오프라인 프로젝트는 등록을 지우지 않고 조회·자동 정리를 다른 프로젝트와 격리한다.
- 만료/사용 완료 plan 및 대상 없는 자동 plan을 정리해 관리 기능 자체가 불필요한 파일을 누적하지 않게 한다.

## 완료 검증 (2026-10-19)
공유 core·CLI 9명령·HTML/가이드/음악별 링크·native/CD producer cache/lease·보존 스킬과 discovery 연결을 구현했다. 독립 리뷰 APPROVE, 스킬 forward-test PASS. npm 269/269, storage Python 36, native 28, playlist 12, JS/Python 문법·스킬 validator·npm packaging dry-run 통과. 실제 Ego 전체/선택 정리와 390px Paperlogy/가로 넘침/카드 레이아웃을 확인했다. 현재 사용자 프로그램·모델·원음·완성 파일 삭제는 실행하지 않았다.

## 실사용 반복 검수·정리 보완 (2026-10-19)

완료 기준은 설치된 엔진으로 짧은 음악 2곡과 영상 생성·디코딩, 실제 producer 캐시 정리 전후 원본/결과 해시 보존, 두 차례 정리 뒤 설명되지 않는 캐시 증가 없음, CLI·HTML·스킬의 동일 계약 및 독립 안전 검수 통과다. 다른 실행 중인 서비스와 사용자 작품은 종료/변경하지 않는다.

- 기존 out 렌더 캐시는 임의 track 허용으로 해결하지 않는다. 알려진 Showreel production+playlist와 대응 완성 MP4를 검증한 picture/parts만 inventory → 변경 불가 이전 미리보기 → 명시 확인 → 관리 cache로 이전 → 기존 정리 미리보기/실행을 적용한다. 외부 concat/QA 참조와 열린 파일, symlink, 진행 중 lease는 보존한다.
- 대규모 디렉터리 스냅샷은 탐색/파일 수 상한을 적용해 관리 기능 자체의 과도한 registry·메모리 증가를 막는다.
- 실제 정리 전 원본·완성본·제작 설정/검수 파일의 해시를 기록하고 정리 후 대조한다. 삭제 가능한 용량과 실제 회수 추정을 구분한다.
- 생성 검증은 설치된 ACE와 렌더 환경을 재사용하고 격리 프로필/출력만 사용한다. 모델 다운로드·앱 복제·사용자 라이브러리 변경은 하지 않는다.

## 실사용 반복 검수 최종 결과

공개 저장공간 CLI12개·HTML·운영 스킬을 실제로 사용해19프로젝트의272캐시파일/1,489,118,831B를 정리했다. 원본·완성·승인·제작/검수556파일sha256불변,23프로젝트editing/히스토리보존유지,관리cache0. 계약 밖33항목보호. 실제ACE10초2곡,스펙트럼720p30/60fps·정리후재렌더,Showreel12초final/preview두cycle통과. 완료정책0일실측에서는추가cleanup명령없이렌더끝4파일/3,859,626B자동정리. own프로필서비스/브라우저/서버종료. 새로운앱/모델/의존성복제없음. npm281/281,storagePython49/49,native28,playlist12,skillforward/validator,패키징,문서링크,JS/Python구문통과;독립검수APPROVE. 기존실행중사용자앱/서버는재시작하지않았고새코드는다음시작시적용된다.
