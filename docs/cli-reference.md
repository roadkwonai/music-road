# Road Music CLI 레퍼런스

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

이 문서는 `electron/cli-catalog.js`와 `electron/cli-transport.js`의 공개 스키마를 사람이 읽기 좋게 정리한 목록이다. 실행 중인 버전에서 `node cli/road-music.js schema`를 실행한 결과가 최종 기준이다. 내부 프레임·픽셀 전송 명령은 공개 API가 아니므로 포함하지 않는다.

## 목차

- [표기](#toc-1)
- [공통 입력 모양](#toc-2)
- [서비스·설치·프로젝트](#toc-3)
- [제작 프롬프트·성능·버전 기록](#toc-production)
- [저장공간 관리](#toc-storage)
- [곡·생성·악보·내보내기](#toc-4)
- [대기열·프리셋·자산·설정](#toc-5)
- [가사·프롬프트·재생·영상](#toc-6)
- [녹음·창·외부 동작](#toc-7)
- [배치 요청](#toc-8)
- [시간 제한·재시도·출력 안전성](#toc-9)

<a id="toc-1"></a>

## 표기

- **필수**는 JSON 객체에서 반드시 넣어야 하는 필드다. 나머지는 선택 사항이다. 카탈로그 명령의 객체는 표에 적힌 필드 외의 키를 허용하지 않는다. 전송 계층의 `job:wait` 같은 보조 명령은 스키마의 별도 규칙을 따른다.
- `str`은 문자열, `int`는 정수, `num`은 유한 숫자, `bool`은 불리언이다. `null` 표기가 있는 값만 `null`을 받는다.
- `path`는 비어 있지 않은 문자열이다. `abs-path`는 `/` 또는 Windows 드라이브 문자로 시작하는 절대 경로다.
- `†`는 `--confirm`이 필요하다. `입력`과 `출력`은 JSON이 아니라 각각 `--input`, `--output` 플래그다.
- `곡`은 `songs:list`가 돌려준 절대 `dir`을 뜻한다. `song:*`의 곡 경로, 커버 곡, 영상 트랙은 현재 라이브러리 안의 실제 곡 폴더여야 한다.

<a id="toc-2"></a>

## 공통 입력 모양

### `parts`

`genre:str≤2000`, `instruments:instrument[]≤16`, `bpm:int 40..220 | null`, `strict:bool`, `strong:bool`, `instrumental:bool`, `structure:"" | "pop" | "short" | "theme" | "loop"`.

### `advanced`

`temperature/abcTemperature:0..5`, `topP/abcTopP:(0,1]`, `topK/abcTopK:int≥1`, `repetitionPenalty/abcRepetitionPenalty:>0`, `penaltyWindow/abcPenaltyWindow:int 1..100`, `minTokens/abcMinTokens:int 0..24576`, `maxTokens/abcMaxTokens:int 1..24576`, `cfgScale:0..20`, `odeSteps:int≥1`. JS 안전 정수·유한 수치 및 기본값을 포함한 각 min≤max를 검사한다.

### `video`

모든 하위 필드는 선택 사항이며 부분 객체도 허용한다.

| 필드 | 형식 |
| --- | --- |
| `source` | `selected`, `checked`, `project` |
| `background` | `kind: none/image/video`, `path:path|null`, `url:file: URL|null`, `name:str≤200` |
| `length` | `mode: once/repeat/minutes`, `count:int 1..1000`, `minutes:int 1..600` |
| `resolution`, `fps`, `renderer` | `720p/1080p/1440p/2160p`, `30/60`, `gpu/cpu` |
| `spectrum` | `visible:bool`, `kind: bars/mirror/line/circle/cd`, `cover:{path:path|null,url:file: URL|null,name:str≤200}|null`, `symmetric:bool`, `layout:left/center/right|null`, `barCount:8/16/24/32/48/64/96/128`, `position:bottom/center/free`, `cx`,`cy:num -0.5..1.5|null`, `size:0.03..0.9`, `width:0.05..1.5`, `color1`,`color2:#RRGGBB`, `glow:0..1`, `gain:0.3..3`, `dim:0..1` |
| `eq` | `on:bool`, `preset:flat/bass/vocal/treble/warm/clear/dance/lofi/custom`, `gains:num -10..10[7]`(순서: 60, 150, 400, 1,000, 3,000, 8,000, 16,000 Hz) |
| `overlays` | `id:str≤200`, `path:path`, `name:str≤200`, `url:file: URL|null`, `x`,`y:num -0.5..1.5`, `w:0.02..2`, `ar:0.01..100`(height/width), `opacity:0..1`, `start:num≥0`, `end:num≥0|null` |
| `tracklist` | `visible:bool`, `cx`,`cy:num -0.5..1.5|null`, `w`,`h:num 0..1|null`, `title:str≤100`, `color`,`accent:#RRGGBB`, `bg:0..1` |

`background.url`도 `file:` URL 또는 `null`만 허용한다. `file:` URL의 호스트는 없거나 `localhost`여야 하며, Windows UNC 경로와 원격 URL은 허용하지 않는다. `path`가 있으면 로컬 파일 URL로 변환해 사용한다.

`spectrum.kind:"cd"`는 표지를 원형으로 잘라 약 12초마다 회전하되 반복 경계에서 끊기지 않도록 재생목록 한 회차에 정수 번 회전시키고 오디오 분석값으로 외곽 링과 펄스를 움직인다. `size`는 화면 높이에 대한 원판 지름이며 `width`는 사용하지 않는다. `cover`는 로컬 `path` 또는 `file:` URL 중 하나가 필요하고 배경과 같은 네트워크 경로 제한을 적용한다. `cover:null`이면 금속 CD를 그린다. 표지 이미지는 미리보기와 최종 영상에 같은 캔버스 경로로 들어가며, 일시정지·탐색 시에도 영상 시각에 맞춰 회전한다. AI 표지 생성은 에이전트의 이미지 생성 도구에서 수행하고, 이 CLI에는 생성된 이미지 경로를 전달한다.

### `preset`

`name:str 1..40` **필수**, `style:str≤2000`, `instrumental:bool`, `parts:parts`, `folder:str≤30`.

### `instrument`

`piano`, `acoustic guitar`, `classical guitar`, `electric guitar`, `bass guitar`, `upright bass`, `drums`, `brushed drums`, `percussion`, `violin`, `viola`, `cello`, `string ensemble`, `harp`, `flute`, `clarinet`, `oboe`, `saxophone`, `trumpet`, `trombone`, `french horn`, `brass section`, `pipe organ`, `Rhodes electric piano`, `synthesizer`, `synth pads`, `celesta`, `glockenspiel`, `sleigh bells`, `music box`, `marimba`, `vibraphone`, `ukulele`, `mandolin`, `harmonica`, `accordion`, `orchestra`.

<a id="toc-3"></a>

## 서비스·설치·프로젝트

| 명령 | 필수 | 선택 | 입력/출력·효과 |
| --- | --- | --- | --- |
| `app:state` | — | — | 앱 상태 |
| `app:capabilities` | — | — | 실행 중인 서비스의 실제 명령·버전·플랫폼·엔진 설치·renderer/ffmpeg 준비 상태. 로컬 `schema`와 구분 |
| `app:screenshot` | — | — | `--output FILE.png` 필수. 현재 앱 창의 실제 프레임 캡처. 전체 데스크톱을 촬영하지 않음 |
| `app:language` | — | — | 현재 언어 |
| `app:set-language` | `lang:ko/en/ja` | — | 표시 언어 저장 |
| `cli:schema` | — | `command:str` | 공개 스키마 또는 지정 명령의 스키마 |
| `cli:version`, `version`, `--version` | — | — | 로컬 `cliVersion`, `appVersion`, `protocolVersion` 반환. 앱·서비스를 시작하지 않음 |
| `cli:update:check` | — | — | `cli-v*` 정식 Release만 읽기 전용으로 조회. 앱 Release·서비스는 조회·시작하지 않음 |
| `cli:update:install` | — | `targetDir:abs-path` | 새 빈 폴더에 CLI ZIP 설치. 생략 시 사용자 CLI 저장소의 버전 폴더를 사용하며 새 `cliPath` 반환 |
| `cli:status` | — | — | 서비스 PID·화면·대기열 |
| `cli:show` | — | — | GUI 표시 |
| `cli:stop` | — | — | 활성 작업 중이면 `--confirm` 필요 |
| `schema`, `help` | — | `command:str`(schema만) | `cli:schema`의 CLI 별칭 |
| `service:start`, `service:status`, `service:show`, `service:stop` | — | — | 각각 `cli:status`, `cli:status`(자동 시작 없음), `cli:show`, `cli:stop`의 CLI 별칭 |
| `setup:check`, `setup:location`, `setup:run` | — | — | 초기 설정 조회/실행. `setup:check.runtime`은 Python 3 표준 `sqlite3`를 검사하며, `setup:run`은 별도 SQLite를 설치하지 않음 |
| `setup:test-profile` | `directory:abs-path` | — | 기존 runtime을 읽기 전용으로 재사용하는 새 격리 프로필 준비. 대상은 존재하지 않아야 하며 기존 프로필·runtime·엔진·모델·symlink 내부는 거부. 서비스·설치·모델 복사 없음 |
| `setup:pick-location` | — | — | 출력 폴더 선택: `--output DIR` |
| `engines:list`, `engines:skip` | — | — | 엔진 상태/건너뛰기 |
| `engines:install` | `id:ace/yue/yue-mlx` | — | 모델 설치. `yue`는 Windows NVIDIA, `yue-mlx`는 Apple Silicon용 |
| `system:stats` | — | — | RAM·GPU 메모리·생성 상태 |
| `projects:list` | — | — | 프로젝트 목록 |
| `projects:select`, `projects:create` | `name:path` | — | 프로젝트 선택/생성 |
| `projects:rename` | `from:path`, `to:path` | — | 이름에는 경로 구분자 불가 |

<a id="toc-production"></a>

## 음악 그룹과 좋아요

| 명령 | 필수 | 선택 | 입력/출력·효과 |
| --- | --- | --- | --- |
| `works:list` | — | `favoritesOnly:bool` | 등록한 음악 그룹과 SQLite 좋아요 상태를 조회. true면 좋아요 그룹만 반환 |
| `works:favorite` | `groupId:SHA256`, `favorite:bool` | — | 목록에서 반환한 그룹에 좋아요를 저장·해제. 파일·보존 핀은 변경하지 않음 |

두 명령은 서비스 시작 없이 로컬에서 실행한다. 그룹별 프롬프트·결과는 `production:prompts/tasks/files`에 같은 `groupId`를 전달해 조회한다.

## 제작 프롬프트·성능·버전 기록

`production:*`는 현재 프로필 SQLite에서 동작하는 로컬 명령이다. 생성·설치·외부 전송을 시작하지 않는다. 프로젝트는 실제 작업 절대 경로를 사용하며 응답의 ID를 이후 작업에 전달한다. 최초 `source:user` 요청이 해당 프로젝트/분야의 메인 프롬프트이며 엔진 입력은 `source:engine`으로 구분한다.

| 명령 | 필수 | 선택 | 입력/출력·효과 |
| --- | --- | --- | --- |
| `production:request` | `project:abs-path`, `domain:music/motion`, `prompt:str 1..65536` | `intent:str≤80`, `source:user/engine`, `requestId:48hex`, `title:str≤200`, `groupId:SHA256` | 요청 원문·시각 기록. 동일 ID의 재제출은 중복 요청으로 계산하지 않음. 원문은 64KiB 이내 |
| `production:task-start` | `project:abs-path`, `domain:music/motion`, `taskType:str≤80` | `engine/model:str≤200`, `taskId/requestId/engineRequestId/parentTaskId:48hex`, `status:queued/running`, `title`, `groupId`, `expectedMediaSeconds:num≥0`, `expectedFrameCount:int≥0` | 대기·실제 시작을 구분하고, 이미 확인한 미디어 길이·프레임 수를 예상 기준으로 연결 |
| `production:task-progress` | `taskId:48hex` | `progress:0..1`, `currentStage:str≤240`, `summary:str≤4000` 중 하나 이상 | 실제 producer 단계 경계에서만 현재 상태를 저빈도로 기록. 추정 진행률은 기록하지 않음 |
| `production:task-finish` | `taskId:48hex`, `status:succeeded/failed/cancelled` | `elapsedMs:num≥0`, `mediaSeconds:num≥0`, `frameCount:int≥0`, `aiSummary/resultSummary/errorSummary:str≤4000`, `files:[{path:abs-path,role:input/intermediate/final/cache/artifact}]≤10000` | 종료와 실측·요약·파일 메타데이터를 기록. 실제 미디어 내용은 저장하지 않음 |
| `production:projects` | — | 조회 필터, `search:str≤200`, `limit:int 1..100`, `cursor:int≥1` | 프로젝트별 요청·생성·수정 횟수와 다음 페이지 커서 |
| `production:prompts` | — | `projectId/groupId/domain/since/until`, `limit`, `cursor` | 메인/이력 프롬프트 원문·응답·작업 결과 조회 |
| `production:tasks` | — | 조회 필터, `taskId:48hex`, `limit`, `cursor` | 작업별 실제 시작·종료·소요시간·상태 조회 |
| `production:files-record` | `taskId:48hex`, `files:[{path:abs-path,role}]≤10000` | — | 정리 전에 생성 파일을 배치로 누적. 같은 작업·경로는 중복 등록하지 않음 |
| `production:files` | — | `projectId/groupId`, `taskId:48hex`, `limit`, `cursor` | 생성 파일 경로·역할·기록 크기 조회 |
| `production:dashboard` | — | 조회 필터, `limit:int 1..100` | 전체·조건별 평균/중앙값/p95·일별 추이·느린 작업을 SQL 집계 |
| `production:activity` | — | `projectId/groupId:SHA256`, `domain:music/motion`, `limit:int 1..100`, `offset:int 0..10000` | 진행·대기 작업과 과거 실측 평균을 이용한 건별·대기열 예상 시간을 읽기 전용으로 조회. 음악 앱이 꺼져 있으면 런타임 대기열은 오프라인으로 표시 |
| `production:components` | — | — | 관찰한 앱·CLI·스킬 설치 버전과 최신 버전 확인 상태 |
| `production:component-record` | `componentId:str≤160`, `kind:app/cli/skill`, `name:str≤200`, `installedVersion:str≤100` | `latestVersion:str≤100`, `status:str≤80`, `sourceUrl:https`, `checkedAt:epoch밀리초` | 검증한 설치·기존 업데이트 결과만 기록. 업데이트 설치를 수행하지 않음 |

조회 필터는 `projectId/groupId:SHA256`, `domain:music/motion`, `engine/model`, `taskType`, `status:queued/running/succeeded/failed/cancelled`, `since/until:epoch밀리초`다. 목록은 커서 페이지를 사용하며 대시보드는 커서를 받지 않는다. 측정이 없으면 미측정으로 남긴다. 각 수치의 정의와 화면 사용법은 [제작 기록·성능 대시보드](production-records.md)를 참고한다.

음악 생성·재개·악보 렌더·부분 재실행·제목/가사/음원 변경과 `video:render`는 선택 `requestPrompt:str≤65536`, `requestId:48hex`로 원본 사용자 요청을 받을 수 있다. `requestPrompt`는 엔진용 `style`·가사·영상 설정을 대체하지 않는다. 이미 기록한 ID를 재사용할 때는 같은 원문을 유지한다.

<a id="toc-storage"></a>

## 저장공간 관리

저장공간 명령은 동봉된 Python 도구를 현재 `ROADMUSIC_DATA_DIR`로 직접 실행한다. Electron 서비스가 없어도 동작한다. `projectId`, `entryId`, `planId`는 이전 응답에서 받은 불투명 식별자이며, 임의 경로나 ID를 추측해 바꾸지 않는다.

| 명령 | 필수 | 선택 | 입력/출력·효과 |
| --- | --- | --- | --- |
| `storage:list` | — | `projectId:str≤128` | 등록 프로젝트, 항목별 보호·회수 가능량, 합계·디스크·예산 초과와 경고 반환 |
| `storage:status` | — | — | 기존 capability·압축 스캔 캐시·SQLite 경로 상태를 읽기 전용으로 반환. 활성화는 삭제 가능 판정이 아니며 Electron·Git 심층 검사·전체 재스캔 없음 |
| `storage:migrate` | — | — | 기존 레지스트리·보관함을 검증하고 백업한 뒤 프로필 SQLite로 한 번 이전. 재실행은 중복 이전 없이 등록·납품 파일의 소유권 연결을 복구하며 실제 음악·영상 파일은 이동하지 않음 |
| `storage:tracking` | — | `refreshWorkspace:bool=false` | 검사 항목별 `status[].id`, `label`, `enabled`, `reason`, `required`, `available`과 프로필 `storage.sqlite3`의 cached ownership·경로·통계·보호된 소유권 미확인 요약을 반환. `true`일 때만 trusted 작업 폴더를 일괄 색인하며 파일 삭제·해시 재계산·Git 분석은 하지 않음 |
| `storage:events` | — | `projectId:SHA-256`, `groupId:SHA-256`, `limit:int 1..100`, `cursor:int≥1` | 프로젝트/음악 그룹의 생성·변경·게시·정리 최소 이력을 페이지 단위로 반환. 실제 미디어·프레임·상세 로그는 반환하거나 DB에 중복 저장하지 않음 |
| `storage:register` | `project:abs-path` | — | 검증된 제작 표식 또는 현재 Road Music 저장소의 패키지 검증 범위 등록. 저장소는 관리 폴더만 집계 |
| `storage:track` | `projectId:str≤128`, `path:str`, `kind:cache/intermediate/history` | `description:str≤400`, `reproducible:bool` | 분류별 `.roadmusic/cache`, `intermediate`, `history` 안의 명시 항목만 등록. cache는 재생성 가능 표시가 필요 |
| `storage:policy` | `projectId:str≤128` | `state:editing/completed/archived`, `preserveHistory:bool`, `autoCleanup:bool`, `retainDays:int≥0`, `maxCacheBytes:int≥0`, `maxCacheFiles:int≥0` | 정책·예산 갱신. 완료 상태의 TTL cache만 자동 정리 후보 |
| `storage:pin` | `projectId:str≤128`, `entryId:str≤128`, `pinned:bool` | — | 항목 보존 설정 |
| `storage:preview` | — | `projectId:str≤128`, `entryIds:str[]`, `kinds:cache/intermediate/history[]` | 불변 `planId`, 대상·차단 항목, 파일 수·용량·만료 시각 반환 |
| `storage:cleanup` † | `planId:str≤128` | — | `--confirm` 필수. 계획·보호·lease·파일 변경을 재확인한 뒤 삭제하고 감사 경로 반환 |
| `storage:history` | `projectId:str≤128` | — | 프로젝트 감사 이력 반환 |
| `storage:versions` | `groupId:SHA-256` | `projectId:SHA-256`, `limit:int 1..100`, `offset:int≥0` | 같은 음악의 검증된 완성본 시간 버전과 기록된 수정 사유·파일 요약 조회 |
| `storage:version-diff` | `fromId:SHA-256`, `toId:SHA-256` | — | 같은 음악·프로젝트 두 버전만 비교. 파일 added/removed/changed와 기록된 텍스트·설정 차이 반환 |
| `storage:file-remove-preview` | `groupId:SHA-256`, `fileId:SHA-256` | — | 등록된 canonical 완성 파일 하나의 참조·해시·보호 상태를 재검증한 일회용 정리 계획. 원음·현재 입력은 보호 |
| `storage:file-remove` † | `planId:48자리 hex` | — | `--confirm` 필수. 같은 계획의 파일 하나만 제거하고 연결된 버전 이력에는 tombstone을 남김 |
| `storage:project-finish-preview` | `projectId:str≤128` | — | 완료·보관·유휴 private work 프로젝트의 canonical 납품·핀·최소 이력을 확인한 일회용 작업 자료 정리 계획 |
| `storage:project-finish` † | `planId:48자리 hex` | — | `--confirm` 필수. 검증된 canonical Output과 최소 이력을 남기고 private work 프로젝트를 정리 |
| `storage:reconcile-preview` | — | — | 확인된 관리 잔재만 대상으로 한 일회용 계획. 현재 기본 후보는 `.DS_Store`이며 소유권 미확인·외부 도구 상태는 보호 |
| `storage:reconcile-cleanup` † | `planId:48자리 hex` | — | `--confirm` 필수. 파일 변경을 다시 확인한 뒤 reconcile 계획만 실행 |
| `storage:project-remove-preview` | `projectId:str≤128` | — | 선택 프로젝트의 파일·SQLite live 행·공유/활성/핀 보호 상태와 영향을 확인하는 일회용 제거 계획 |
| `storage:group-remove-preview` | `groupId:SHA-256` | — | 선택 음악 그룹의 프로젝트·canonical 완성 파일을 포함할 수 있는 제거 범위와 보호 상태를 확인하는 일회용 계획 |
| `storage:entity-remove` † | `planId:48자리 hex` | — | `--confirm` 필수. 검증된 프로젝트/그룹 계획만 실행하고 해당 live 소유권·경로·이벤트를 프로필 SQLite에서 제거. 공유·활성·핀한 자산과 외부 원음은 거부 |
| `storage:entity-recover` † | `planId:48자리 hex` | — | `--confirm` 필수. 중단된 프로젝트/그룹 제거 계획의 격리 파일·경로·SQLite 상태를 다시 검증해 원래 상태로 복구. 변조나 불일치가 있으면 격리를 유지하고 실패 처리 |
| `storage:lease` | `projectId:str≤128`, `operation:acquire`이면 `pid:int≥1`, `operation:release`이면 `token:str≤128` | — | 제작 작업 잠금 획득·해제. acquire의 pid는 실제 제작 프로세스 PID. release 후 완료 프로젝트 TTL 정리 결과는 cleanup, 보조 경고는 cleanupWarning |
| `storage:maintenance-list` | — | `includeRetirement:bool=false`, `scope:retirement/git` | 현재 trusted 작업 폴더의 메타데이터와 비Git 후보 조회. `scope:retirement`은 이전 제작 자료만 빠르게 점검. `scope:git`은 capability가 활성인 Git 개발 환경에서 명시할 때만 Git 보호 상태를 검사하며 자동 prune·fsck를 실행하지 않음 |
| `storage:maintenance-preview` | `scanId:str≤128`, `scope:git/verification/artifacts/retirement` | `candidateIds:str[]` | Git 또는 명시 선택한 설치 검증 복제본/과거 제작·참조 자료/최종본 외 제작 자료의 15분 일회용 계획. 임의 root·Git 옵션·파일 경로는 입력 불가 |
| `storage:maintenance-cleanup` † | `planId:str≤128` | — | `--confirm` 필수. 실제 할당 감소·디스크 여유 변화·보호 검사·최소 감사 이력 반환 |
| `storage:maintenance-history` | — | — | 작업 폴더 유지보수 감사 이력 조회 |
| `storage:restructure-status` | — | — | 완성본 전용 Output 구조 전환의 준비 상태·차단 사유 조회 |
| `storage:restructure-preview` | — | — | 검증된 원음·등록 완성본·활성 작업을 보존하고 이전 미연결 제작 자료를 정리할 일회용 계획 |
| `storage:restructure-cleanup` † | `planId:str≤128` | — | `--confirm` 필수. 구조 전환 계획을 재검증한 뒤 실행하고 실제 확보량·감사 이력 반환 |
| `storage:overview` | — | `refreshWorkspace:bool=false` | 실제 원음 해시로 음악별 프로젝트·AI M/V를 묶고, 음악별 작업 폴더·관리 cache·미관리 용량과 기타 자료를 분리해 조회. `true`는 메타데이터 전수 집계를 새로 고치며 삭제·재생성·임의 미디어 해시는 하지 않음 |
| `storage:mv-list` | — | — | 검증된 AI M/V 루트·음악·용량·전체 정리 차단 사유 조회 |
| `storage:mv-preview` | `scanId:str≤128`, `projectIds:str[]` | — | 최신 전체 스캔 뒤 선택한 AI M/V의 최종 영상·애니매틱까지 포함한 전체 삭제 계획 |
| `storage:mv-cleanup` † | `planId:str≤128` | — | `--confirm` 필수. 프로젝트 루트 전체 정리, 외부 원음·모델과 최소 감사 보존 |
| `storage:sweep-preview` | — | `mvProjectIds:str[]` | 전체 스캔 후 캐시·잔재 일괄 계획. mvProjectIds를 지정하면 선택 AI M/V만 통째 정리하는 별도 계획 |
| `storage:sweep-cleanup` † | `planId:str≤128` | — | `--confirm` 필수. 세부 계획 재검증·일회용 실행·실제 확보 용량과 부분 실패 반환 |
| `storage:legacy` | `projectId:str≤128` | — | 지원되는 제작 형식의 레거시 picture/parts 및 사전 검수된 저장소 ZIP 후보 반환. `candidates`의 ID만 다음 단계에 사용 |
| `storage:adopt-preview` | `projectId:str≤128`, `candidateIds:str[1..400]` | — | 선택 후보를 관리 cache로 옮길 일회성 계획과 보호·차단 사유 반환 |
| `storage:adopt` † | `planId:str≤128` | — | `--confirm` 필수. 만료 전 계획을 재검증해 이동·관리 cache 등록·감사 이력 기록 |

`†`의 `--confirm`은 JSON 매개변수가 아니다. `storage:cleanup`과 `storage:adopt`는 계획 ID만 받으며, `{"confirm":true}`는 알 수 없는 매개변수로 거부한다. 모든 명령은 표준 출력에 한 줄 JSON envelope만 쓴다.

<a id="toc-4"></a>

## 곡·생성·악보·내보내기

| 명령 | 필수 | 선택 | 입력/출력·효과 |
| --- | --- | --- | --- |
| `songs:list`, `songs:hidden` | — | — | 곡 목록/숨김 목록 |
| `songs:import` | — | — | 입력 파일: `--input FILE` 반복 |
| `songs:reorder` | `folders:path[]` | — | 프로젝트 내 순서 |
| `songs:hide` | `folder:path` | `hide:bool` | 생략 시 숨김 |
| `songs:compact` † | — | — | 라이브러리 정리 |
| `song:generate` | — | 아래 표 | 작업 시작; `--wait` 가능 |
| `song:prepare` | — | `song:generate`와 같은 생성 입력 | 서비스·모델 설치·생성 없이 정리된 입력, 변경 notes, 실효 옵션과 원생 요청을 검수 |
| `song:resume` | `dir:path` | — | 작업 시작; `--wait` 가능 |
| `song:replay` | `dir:abs-path`, `stage:plan/synthesize/decode` | `title:str≤200`, `advanced`, `runtime` | 기존 YuE 산출물의 해시·단계 artifact를 검증한 뒤 지정 단계만 새 작업으로 재현; `--wait` 가능 |
| `song:cancel` | `jobId:path` | — | 현재 생성 작업만 취소 |
| `song:detail`, `song:clone`, `song:srt` | — | `dir:path`, `id:path`, `folder:path`; clone은 `apply:bool`, srt는 `save:bool` | 셋 중 하나가 실제로 필요. `save:true`이면 `--output FILE` |
| `song:lrc`, `song:score` | `dir:path` | — | LRC/ABC 반환 |
| `song:render` | `dir:path`, `abc:str 1..100000` | `title:str≤200` | 작업 시작; `--wait` 가능 |
| `score:check` | `text:str≤100000` | — | ABC 검사 |
| `score:open` | — | — | 입력 파일: `--input FILE` |
| `score:convert` | `choice` | — | `choice.vocal:str≤200`, `choice.ins:str≤200`, `choice.chords:bool` |
| `score:inspect` | — | `text:str≤100000` 또는 `file:abs-path` | YuE2 ABC의 선율·박자·템포·화성을 읽기 전용 검사 |
| `score:strip-chords` | — | `text:str≤100000` 또는 `file:abs-path`, `voice:Vocal/Ins` | YuE2 ABC의 화성 기호를 제거하고 필요하면 선율 선택 |
| `score:compare` | `source:{text/file}`, `candidate:{text/file}` | `invariants.melody/harmony/allowTempoChange/form:bool` | 두 YuE2 ABC의 지정 불변조건·차이를 비교 |
| `score:transcribe` | `audio:abs-path`, `output:abs-path`, `python:abs-path`, `modelDir:abs-path` | `melodyOnly:bool`, `task:full/melody-full/melody-vocal` | 명시한 기존 SheetSage2 환경으로 로컬 오디오의 음악 ABC/MIDI를 추정; 설치·다운로드 없음 |
| `song:delete` † | `dir:path` | — | 곡 삭제 |
| `song:rename` | `dir:path`, `title:path` | — | 제목 변경 |
| `song:lyrics` | `dir:path`, `lyrics:str≤20000` | — | 곡 정보의 가사 원문 저장. 빈 문자열은 명시적 비우기. 음원·내장 태그·생성 입력은 변경하지 않음. Windows는 백업 후 교체·실패 복구 |
| `song:replace` | `dir:abs-path` | — | `--input FILE` 1개. 같은 곡 폴더·순서를 유지하며 교체하고 이전 버전 백업. 재생 중인 대상은 거부 |
| `song:backups` | `dir:abs-path` | — | 해당 곡에 속한 백업 경로·제목·시각 조회. 교체 중단으로 원래 폴더가 없어진 경우도 조회 가능 |
| `song:restore` | `dir:abs-path`, `backup:abs-path` | — | 현재 버전을 추가 백업하고 같은 곡의 백업 복원. 원래 폴더가 사라진 경우도 복구 가능 |
| `song:info` | `dir:abs-path` | `open:bool=true` | 전체 가사 창 열기/닫기와 실제 DOM 표시 텍스트·원문 일치 여부·복사 버튼 상태 조회. 재생하지 않음 |
| `song:reveal` | `dir:path` | — | 파일 관리자 열기 |
| `song:background` | `dir:path` | — | 입력 파일: `--input FILE` |
| `song:background-clear` | `dir:path` | — | 곡별 배경 제거 |
| `song:save-srt` | `title:str≤200`, `text:str≤200000` | `save:bool` | `--output FILE` 필수 |
| `song:export` | `dir:path` | `title:str≤200`, `format:mp3/wav` | `--output FILE` 필수 |
| `album:export` | — | `format:mp3/wav`, `minRating:int 0..5`, `numbered:bool`, `dirs:abs-path[]` | `--output DIR`; `dirs`를 주면 그 곡만, 없으면 현재 프로젝트의 완료 곡 |

### `song:generate` 필드

필드별 실제 효과·우선순위·엔진 차이와 복사 가능한 JSON은 [음악 생성 옵션](music-options.md), 장르별 요청은 [프롬프트 모음](genre-prompts.md)을 참고한다.

`title:str≤200`, `style:str≤2000`, `lyrics:str≤20000`, `engine:ace/yue/yue-mlx`(기본 `ace`), `count:int 1..8`, `instrumental:bool`, `soundEffect:bool`, `targetSeconds:num 1..600|null`, `seed:JS 안전 정수|정확한 10진 문자열|null`, `mode:song/plan`, `cot:full/melody/off`, `abc:str≤100000`, `advanced:advanced`, `parts:parts`, `coverAudio:{dir:abs-path, title:str≤200, strength:0.1..1}|null`, `recording:{path:abs-path, strength:0.1..1, targetSeconds:int 0..600}|null`, `bpm:int 40..220`.

`yue`는 Windows NVIDIA CUDA용, `yue-mlx`는 Apple Silicon MLX용이다. 두 경로의 설치와 제한은 [YuE2 Apple Silicon](yue-mlx.md) 및 실행본 `schema`를 따른다.

`yue:capabilities`는 `engine:yue/yue-mlx`와 선택 `transcription:{python:abs-path,modelDir:abs-path}`를 받아 엔진별 허용 단계·실효 기본값·runtime 지원 범위를 읽기 전용으로 돌려준다. 실행 환경이 없으면 전사 가능 여부만 `available:false`로 알리며 설치하지 않는다.

`style` 또는 `parts.genre`는 스타일 설명에 쓴다. 효과음은 ACE에서만 가능하며 가사·악보·커버·녹음·계획 모드와 함께 쓸 수 없다. 커버와 녹음도 ACE만 가능하다. 유효성 검사는 스키마 다음에 생성 규칙을 추가로 적용한다.

<a id="toc-5"></a>

## 대기열·프리셋·자산·설정

| 명령 | 필수 | 선택 | 입력/출력·효과 |
| --- | --- | --- | --- |
| `job:wait` | `jobId:str` | `timeoutMs:int 1..3600000` | 완료·실패까지 대기 |
| `queue:list` | — | — | 현재·대기·실패 작업 |
| `queue:remove` †, `queue:retry`, `queue:dismiss` | `jobId:path` | — | 대기 작업 제거/실패 재시도·숨김 |
| `queue:move` | `jobId:path`, `delta:int -1000..1000` | — | 순서 이동 |
| `queue:reorder` | `ids:path[]` | — | 전체 순서 변경 |
| `queue:pause` | `value:bool` | — | 일시정지 전환 |
| `queue:clear` † | — | — | 대기열 비우기 |
| `presets:list` | — | — | 사용자 프리셋 목록 |
| `presets:save` | `preset:preset` | — | 사용자 프리셋 저장 |
| `presets:delete` † | `name:path` | — | 프리셋 삭제 |
| `presets:move` | `name:path`, `folder:str≤30` | — | 프리셋 폴더 이동 |
| `assets:list` | — | — | 앱 에셋 목록 |
| `assets:import` | — | — | 입력 파일: `--input FILE` 반복 |
| `assets:remove` † | `file:abs-path` | — | 앱 에셋 안의 파일만 제거 |
| `settings:get` | — | — | 현재 설정 |
| `settings:set` | `patch` | — | `patch.autoMp3:bool`, `patch.dropWav:bool` |
| `settings:pick-export` | — | — | 출력 폴더: `--output DIR` |
| `settings:move-models` † | — | — | 대상 폴더: `--output DIR`; YuE2가 쓰는 모델 저장소만 검증·복사해 이동 |
| `settings:move-songs` † | — | — | 대상 폴더: `--output DIR`; 검증 후 라이브러리 이동 |

<a id="toc-6"></a>

## 가사·프롬프트·재생·영상

| 명령 | 필수 | 선택 | 입력/출력·효과 |
| --- | --- | --- | --- |
| `renderer:catalog`, `prompt:catalog` | — | — | 화면/프롬프트의 현재 허용값 |
| `prompt:knowledge` | — | `topic:genres\|ccm\|ccm-advanced\|ccm-recipes\|reference-recipes\|hymn-remake\|ace\|yue\|yue-advanced\|models\|lyrics\|review` | 생략 시 번들 지식 목록, 지정 시 UTF-8 원문·출처·호환 `version`(앱 버전)·`appVersion`·`cliVersion`·보존 정책. `yue`는 YuE 공식·MLX 제작 가이드, `models`는 모델별 제작·비교 가이드. 로컬 CLI는 앱을 시작하지 않음 |
| `lyrics:clean`, `lyrics:sections`, `lyrics:numbers` | — | `text:str≤20000` | 가사 변환 |
| `lyrics:check` | — | `text:str≤20000`, `targetSeconds:num 1..3600|null` | 가사 검사 |
| `prompt:compose` | — | `parts`의 모든 필드, `lyrics:str≤20000`, `soundEffect:bool` | 스타일 문장 생성 |
| `player:play` | — | `dir:path`, `id:path`, `folder:path` | 완료 곡 재생 |
| `player:pause`, `player:next`, `player:previous`, `player:state`, `player:stop` | — | — | 미니 플레이어 제어 |
| `player:seek` | `seconds:num 0..86400` | — | 재생 위치 |
| `video:cache` | — | — | 현재 앱 데이터의 과거 공용 영상 캐시 검증과 15분 일회용 계획. idle 앱에서만 실행 |
| `video:cache-clear` † | `planId:str≤128` | — | 같은 앱에서 받은 계획과 `--confirm` 필요. 검증된 과거 영상 캐시만 제거하고 감사 JSONL 보존 |
| `video:settings`, `video:state`, `video:chapters`, `video:play`, `video:pause` | — | — | 영상 설정/미리보기 상태 |
| `video:save-settings` | `video:video` | — | 설정 저장 |
| `video:configure` | `video:video` | `save:bool` | 부분 병합, 선택 저장 |
| `video:preview` | — | `tracks:(path or {dir:path})[]`, `video:video` | 미리보기 준비 |
| `video:render` | — | `tracks:(path or {dir:path})[]`, `video:video`, `name:str≤200` | `--output FILE` 필수 |
| `video:seek` | `seconds:num 0..86400` | — | 미리보기 위치 |
| `video:cancel` | — | `jobId:path` | 현재 렌더 취소 요청 |
| `video:background` | `kind:image/video` | — | 입력 파일: `--input FILE` |
| `editor:state`, `editor:open`, `editor:close` | — | — | 영상 편집기 |

<a id="toc-7"></a>

## 녹음·창·외부 동작

| 명령 | 필수 | 선택 | 효과 |
| --- | --- | --- | --- |
| `recording:start`, `recording:state` | — | — | OS 마이크 권한과 입력 장치 필요 |
| `recording:stop` | — | `discard:bool` | 녹음 저장 또는 폐기 |
| `recording:pick` | — | — | 입력 파일: `--input FILE`, 앱 관리 녹음으로 변환 |
| `window:fullscreen` | `on:bool` | — | 창 전체 화면 |
| `shell:open` | `target:abs-path` | — | OS에서 절대 경로 열기 |
| `log:open` | — | — | 로그 위치 열기 |
| `ui:log` | `text:str≤10000` | — | 앱 로그 기록 |
| `update:check` | — | `manual:bool` | 업데이트 조회 |
| `update:status` | — | — | 확인·다운로드·설치 상태와 대상 조회 |
| `update:download` | — | — | 최신 정식 버전 다운로드·해시 검증 |
| `update:install` | — | — | 필요 시 다운로드 후 설치 도우미에 인계·재시작 |
| `update:watch` | — | `timeoutMs:int=3600000`, 1..3600000 | 새 버전 알림 대기; 변화 없으면 `timedOut:true` |
| `update:quiet-week` | — | — | 업데이트 알림 일주일 숨김 |
| `update:open-page` | `page:https://github.com/roadkwonai/music-road/releases/...` | — | Release 페이지 열기 |
| `about:info` | — | — | 버전·라이선스 |
| `about:open` | `where:site/apps/privacy/feedback/store` | — | 브라우저 열기 |
| `about:feedback` | `form` | — | `form.email`(3..320, 이메일), `message`(1..19500), `kind:question/report`, `withSystem:bool`, `withLog:bool`; 외부 전송 |
| `notices:latest` | — | — | 공지 조회 |
| `notices:open` | `url:https://roadkwon.dev/...` | — | 브라우저 열기 |

<a id="toc-8"></a>

## 배치 요청

`batch`는 stdin JSONL만 받으며 `--events`, `--no-start` 외의 공통 플래그를 받지 않는다. 각 줄은 `{ "command": "group:action", "params": {}, "id"?: "...", "input"?: ["/absolute/path"], "output"?: "/absolute/path", "confirm"?: true, "overwrite"?: true, "timeout"?: 1000 }` 형식이다. 오류·성공 모두 줄 단위 JSON으로 반환한다.

<a id="toc-9"></a>

## 시간 제한·재시도·출력 안전성

일반 명령의 `--timeout` 기본·최대는 30,000 ms다. 긴 명령(`job:wait`, 설치, 생성, `song:render`, 앨범 내보내기, 영상 미리보기 등)은 기본·최대 3,600,000 ms다. `video:render`만 기본 86,400,000 ms, 최대 2,147,483,647 ms다. `job:wait.timeoutMs`는 1–3,600,000의 정수이며 서비스 연결·시작 전에 검증되고, 실제 대기 시간은 `--timeout`과 더 짧은 값을 쓴다.

`job:wait`만 일시적 연결 끊김에 재연결한다. 생성·재개·악보 렌더·영상 렌더의 연결 끊김 오류는 `uncertain:true`가 될 수 있으므로, 재제출 전에 `service:status`, `queue:list`, 결과를 확인한다. 명시적 중지 이벤트 뒤에는 `SERVICE_STOPPED`, `retry:false`가 반환되고 자동 재시작하지 않는다.

CLI 제어 요청은 Unix 소켓 또는 named pipe를 사용한다. 영상 렌더의 프레임 전달은 성능을 위해 렌더 중에만 `127.0.0.1`의 임시 HTTP 서버를 쓰며, 렌더별 무작위 토큰이 일치해야 한다. 서버를 만들 수 없으면 IPC 전송으로 대체한다.

저장 명령은 같은 대상 폴더의 스테이징 파일을 성공 뒤 최종 경로로 반영한다. 실패 시 기존 파일을 보존한다. 일반 파일 출력은 `--overwrite` 없이는 기존 파일을 덮어쓰지 않고, 심볼릭 링크 출력도 거부한다. 명령이 받지 않는 `--input`·`--output`·`--overwrite`와 형식에 맞지 않는 출력 확장자는 오류다.


## YuE2 고급 제작과 단계 재사용

[고급 제작 워크플로](yue-cli-workflow.md)는 공식 샘플링 14개와 CFG·ODE, 상세 편성, 모델별 runtime과 실제 검수 절차를 설명한다. 최신 필드/범위는 실행본 schema를 따른다.

| 명령 | 입력 | 실행 계약 |
| --- | --- | --- |
| `song:prepare` | `song:generate`와 같은 JSON | 서비스·생성 없이 `valid`, `errors`, 최종 `requests`, 원문 변경, `effective`, `nativeRequest` 반환. context는 실제 tokenizer 확인 전 상태 |
| `yue:capabilities` | 선택 `engine:yue/yue-mlx`, `transcription:{python,modelDir}` | 공개 지원과 파일 탐지/전사 가용성을 구분. 모델·전사 환경 다운로드 없음 |
| `song:replay` | 실제 `dir`, `stage:plan/synthesize/decode`, 선택 `title`, `advanced`, `runtime` | 원본을 보존한 새 queue job. `jobId`를 `job:wait`으로 확인. 현재 MLX만 지원 |
| `score:inspect` | `text` 또는 절대 `file` 정확히 하나 | 공식 native ABC의 선율·화성·시간격자 검사. Python 필요, 엔진은 불필요 |
| `score:compare` | `source:{text/file}`, `candidate:{text/file}`, 선택 `invariants:{melody,harmony,form,allowTempoChange}` | 기본 선율·형식·템포 보존, 화성 변경 허용. 음질 검사 아님 |
| `score:strip-chords` | `text` 또는 `file`, 선택 `voice:Vocal/Ins` | 원본 무수정, 코드 제거·선택 선율 ABC 문자열 반환 |
| `score:transcribe` | `audio`, 새 출력 디렉터리 `output`, 별도 `python`, 로컬 `modelDir`, 선택 `task:full/melody-full/melody-vocal`, `melodyOnly` | 기설치 SheetSage2로 음악 전사. 가사 ASR 아님. melody-vocal은 원본 전사 뒤 공식 ABC 후처리 사본 생성 |

`parts`에는 `instrumentation:[{instrument,role,technique?,section?}]`, `vocal:string[]`, `dynamics:string[]`, `mix:string[]`를 추가할 수 있다. `instruments`와 `instrumentation`은 동시에 주지 않는다. role은 `accompaniment/lead/bass/rhythm/texture/response/solo`, section은 `All/Intro/Verse/Pre-Chorus/Chorus/Bridge/Interlude/Outro`다. 모두 style 의도이며 악기별 믹서가 아니다.

`advanced`는 semantic의 `temperature/topP/topK/repetitionPenalty/penaltyWindow/minTokens/maxTokens`, ABC의 `abcTemperature/abcTopP/abcTopK/abcRepetitionPenalty/abcPenaltyWindow/abcMinTokens/abcMaxTokens`, `cfgScale/odeSteps`다. temperature 0·CFG 0을 허용하고 두 min/max 조합을 기본값까지 대조한다. 원생 고정 context 24576을 넘는 예산은 거부한다. 더 큰 값이 고음질을 보장하지 않는다.

`runtime`은 MLX의 `precision:8bit/bf16/4bit`, `memoryBudgetGiB`, `vaeCoreFrames`, `queryChunkSize:16..8192`, `requireAc`, 로컬 `vaePath/loraPath`, `loraScale`이다. Windows는 미지원 runtime을 거부한다. 단계별 허용 키는 capabilities의 `replayControls`를 읽는다. YuE seed 전체 범위는 0 이상 2^63 미만이며 JS 안전 정수를 넘으면 정확한 10진 문자열로 입력한다.

### 제작 성능 비교 응답

`production:projects`는 cursor 페이지의 각 프로젝트에 `performance`를 추가한다. `totalElapsedMs`, `avgElapsedMs`, `measuredTaskCount`, `missingElapsedCount`, 상태별 작업 수와 `music`·`motion`별 같은 지표를 제공한다. 상위 작업만 합산하고 종료 작업의 실측 누적과 성공 작업의 평균을 구분한다.

`production:dashboard`의 `groupSummaries`는 음악 그룹별 같은 성능 요약이다. `groupIds`에는 SHA-256 그룹 ID를 1~100개 지정할 수 있으며 같은 필터 범위로 조회한다. 명시한 단일 그룹에서는 `stageBreakdown`으로 제작 영역·작업 유형별 실측 시간과 측정/미측정 수를 받는다. HTML의 그룹 상세 시간 파이는 이 값을 사용하며 하위 모델 단계 시간을 다시 합산하지 않는다.

## 관리 스킬·모션그래픽 연결

| 명령 | 역할 |
| --- | --- |
| `skills:status` | 선택한 호스트의 관리 설치 상태 조회 |
| `skills:check` | 스킬 새 Release 확인 |
| `skills:install` | 명시한 대상에 동봉 스킬 설치 |
| `skills:update` | 로컬 수정 보호와 체크섬 확인 후 스킬 업데이트 |
| `skills:watch` | 지정한 시간 동안 업데이트 상태 관찰 |
| `motion:handoff` | 기존 음원을 영상 프로젝트에 연결하고 실제 작업 경로 반환 |
| `motion:studio` | 반환된 프로젝트의 제작실·검수 HTML 실행 |

상세 입력의 최종 기준은 현재 `schema`입니다. [설치·사용 예시](cli-motion-graphics.md)를 따르며 정리·모델 설치·음악 생성으로 해석하지 않습니다.
