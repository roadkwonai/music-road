# Road Music CLI

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

Road Music CLI는 실행 중인 Road Music 앱의 기능과 생성 대기열을 로컬 JSON 요청으로 호출한다. 독립 음악 엔진이나 네트워크 API가 아니다. 현재 설치 버전의 `schema`가 명령·필드의 기준이며, 전체 표는 [CLI 레퍼런스](cli-reference.md)에 있다. 자동화 환경은 실제 CLI 루트를 `ROADMUSIC_CLI_ROOT`로 전달할 수 있으며, 설정되어 있으면 `node "$ROADMUSIC_CLI_ROOT/cli/road-music.js" schema`로 같은 설치본을 확인한다.

## 목차

- [시작하기](#toc-1)
- [내장 가이드 조회](#knowledge)
- [입출력 계약](#toc-2)
- [공통 플래그](#toc-3)
- [권장 작업 순서](#toc-4)
- [생성 입력의 핵심 제약](#toc-5)
- [곡 저장과 관리](#toc-6)
- [영상](#toc-7)
- [연결 끊김과 재시작](#toc-8)
- [JSONL 배치](#toc-9)
- [사용 경계](#toc-10)

<a id="toc-1"></a>

## 시작하기

CLI는 소스 체크아웃 또는 배포된 `RoadMusic-CLI-X.Y.Z` 키트에서 Node.js로 실행한다. CLI 버전은 앱 버전과 별개이며 `cli-vX.Y.Z` Release를 따른다. 패키지된 dmg가 전역 `road-music` 명령을 설치하지는 않는다. GUI만 쓸 때는 Node.js가 필요 없지만, CLI에는 Node.js 24 LTS와 `npm ci --include=dev`가 필요하다. dmg·소스 키트·전역 링크의 설치 차이는 [CLI 설치](cli-install.md)를 따른다.

```bash
npm ci --include=dev
node cli/road-music.js schema
node cli/road-music.js app:state
```

원하면 소스 키트에서만 `npm link`로 `road-music` 전역 링크를 만들 수 있다. 권한 오류가 나도 `sudo`를 쓰지 말고 계속 `node cli/road-music.js`를 사용한다.

명령은 `group:action` 또는 `group action` 형식이다. `schema`, `help`, `cli:*`, `prompt:knowledge`, `storage:*`, `song:prepare`, `yue:capabilities`, `score:inspect/compare/strip-chords/transcribe`는 서비스에 연결하지 않고 로컬에서 실행한다. 그 밖의 첫 요청은 서비스가 없을 때 숨겨진 Electron 창을 시작한다. 이미 GUI가 실행 중이면 같은 데이터 폴더·곡 라이브러리·대기열을 공유한다.

```bash
node cli/road-music.js schema --json '{"command":"song:generate"}'
node cli/road-music.js service:status --no-start
node cli/road-music.js service:show
```

`service:status`와 `service:stop`은 자동 시작하지 않는다. `service:start`는 상태 요청으로 서비스를 시작한다. 활성 요청·생성·설치·렌더·대기열이 있을 때 `service:stop`은 `--confirm` 없이는 실패하며, `--confirm`은 진행 중인 작업을 중단할 수 있다.

`service:start`가 성공하면 로컬 **영상 제작실**을 열어 완성 음원·가사·영상 확인으로 이어진다. 이미 유효한 제작실 서버가 있으면 새 서버를 만들지 않고 기존 Ego 페이지 한 개를 재사용하고, 같은 주소는 재로드하지 않으며 필요한 화면으로만 이동한다. 자동 열기가 필요 없는 headless 실행은 `ROADMUSIC_STUDIO_AUTO_OPEN=0`을 설정한다. `schema`, 조회 명령, `batch`는 제작실을 열지 않으며, 제작실 준비 실패도 서비스 시작 결과는 그대로 유지하고 경고 JSON만 stderr에 남긴다.

앱·서비스가 실행 중이면 GitHub 최신 앱 Release를 주기적으로 확인한다. `update:check`로 수동 확인, `update:status`로 상태 조회, `update:watch`로 알림 대기, `update:install`로 앱 다운로드·설치·재시작을 요청한다. CLI 릴리스는 자동 감시하지 않으며 `cli:update:check`으로만 확인한다. 두 흐름의 대상과 제한은 [업데이트 가이드](updates.md)를 따른다.

```bash
node cli/road-music.js cli:version
node cli/road-music.js cli:update:check
```

사용자가 CLI 업데이트를 요청했거나 자동 업데이트를 명시적으로 위임한 경우에만 `cli:update:install`을 실행한다. 설치 결과의 `cliPath`에서 `--version`, `schema`, `prompt:knowledge`를 확인하고, 이후 명령은 그 경로의 CLI로 실행한다. CLI 설치는 앱·GUI 서비스·모델·곡·기존 Git 작업 폴더를 바꾸지 않는다.

기본 데이터 폴더는 macOS에서 `~/Library/Application Support/Road Music`이다. 개발·자동화는 실제 라이브러리와 분리한 절대 경로를 지정한다.

```bash
ROADMUSIC_DATA_DIR="/tmp/road-music-cli" node cli/road-music.js service:start
```

CLI 제어 요청은 macOS/Linux의 사용자 전용 Unix 소켓 또는 Windows named pipe를 쓴다. 원격 제어 TCP 포트는 열지 않는다. 다만 영상 렌더링 중 프레임 전달을 빠르게 하기 위해서만 임시 HTTP 서버를 `127.0.0.1`에 열며, 렌더마다 만든 토큰이 맞는 요청만 받는다. 사용할 수 없으면 IPC 전송으로 돌아간다.

<a id="knowledge"></a>

## 내장 가이드 조회

`prompt:knowledge`는 번들된 장르 지식을 읽기 전용으로 조회한다. 로컬 CLI에서 처리하므로 앱·엔진을 시작하지 않는다. 목록을 읽고 해당 장르를 만들 때 필요한 topic을 고른다.

```bash
node cli/road-music.js prompt:knowledge
node cli/road-music.js prompt:knowledge --json '{"topic":"ccm"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"ccm-advanced"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"ccm-recipes"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"reference-recipes"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"hymn-remake"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"review"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"models"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"yue"}'
```

topic은 `genres`, `ccm`, `ccm-advanced`, `ccm-recipes`, `reference-recipes`, `hymn-remake`, `ace`, `yue`, `yue-advanced`, `models`, `lyrics`, `review` 중 하나다. `ace`는 [ACE 가이드](ace-prompt-guide.md), `yue`는 [공식·MLX 원문 기반 YuE 제작 가이드](yue-prompt-guide.md), `models`는 [모델별 제작·비교](model-production-guide.md)의 실험 기록을 읽는다. Apple Silicon YuE2 설치·생성은 [YuE2 Apple Silicon](yue-mlx.md)을 따른다. 생략하면 `topics` 목록, 지정하면 `topic`, `title`, 상대 `source`, 기존 호환 필드 `version`(앱 버전), `appVersion`, `cliVersion`, 원문 `content`를 반환한다. `policy`의 `preserveUserInput:true`, `autoApply:false`, `suggestionsRequireApproval:true`는 지식을 읽어도 제공 가사·프롬프트를 임의 변경하지 않는 사용 계약이다.

`yue-advanced`는 공식·MLX·현재 CLI를 대조한 YuE 전용16옵션·단계 재사용·대표12프롬프트이고, `ccm-advanced`는 엔진별 CCM 고급 활용 Markdown, `ccm-recipes`는 CCM53개 조합·106개 응용과 기존48스타일의 JSON 원문, `reference-recipes`는 일반43개 조합·86개 응용의 JSON 원문입니다. HTML 제작실 상단 **CCM 전문 가이드**와 공개 명령의 **상세 활용 가이드**에서 같은 자료를 찾습니다. ACE·YuE 전용 버튼은 하나씩 선택하며 HTML 기본·초기화는 YuE입니다. 이 선택은 모델 설치나 생성 승인이 아닙니다.

이 명령은 가사·style 입력을 받거나 생성에 자동 반영하지 않는다. 더 나은 안은 [근거 기반 제안](music-review.md#preserve-input)으로 제시한다. 앱에서는 스타일 패널의 **가이드 보기**에서 같은 문서를 읽으며 입력창은 그대로 유지된다. 오래된 CLI의 `schema`에 이 명령이 없으면 동봉 문서를 직접 읽고 미지원 상태를 알린다. 조회를 이유로 자동 재설치하지 않는다.

<a id="toc-2"></a>

## 입출력 계약

정상 응답은 stdout의 JSON 한 줄이다.

```json
{"ok":true,"result":{"jobId":"JOB_ID","position":0}}
```

실패도 stdout JSON 한 줄이다. 인수·스키마 오류는 종료 코드 `2`, 연결·실행 오류는 `1`이다.

```json
{"ok":false,"error":{"code":"INVALID_ARGUMENT","message":"..."}}
```

`--events`는 진행 이벤트만 stderr JSON Lines로 보낸다. stdout의 최종 한 줄은 변하지 않는다.

```json
{"type":"event","channel":"job:started","payload":{"jobId":"JOB_ID","title":"..."}}
```

<a id="toc-3"></a>

## 공통 플래그

| 플래그 | 동작 |
| --- | --- |
| `--json '{...}'` | 요청 매개변수 JSON 객체. 배열·문자열·숫자 단독 값은 안 된다. |
| `--help` | 명령이 없으면 사용법, 명령 뒤이면 해당 명령의 로컬 스키마를 JSON으로 출력한다. |
| `--file PATH` | UTF-8 JSON 객체 파일을 읽는다. |
| `--stdin` | 표준 입력 전체에서 JSON 객체 하나를 읽는다. `--json`, `--file`과 함께 쓸 수 없다. |
| `--input PATH` | 파일/폴더 열기 대화상자를 대체한다. 여러 파일은 플래그를 반복한다. |
| `--output PATH` | 저장 대화상자 또는 폴더 선택을 대체한다. 기존 일반 파일은 `--overwrite`가 필요하다. |
| `--overwrite` | 기존 일반 출력 파일 덮어쓰기를 허용한다. |
| `--confirm` | 삭제, 대기열 비우기, 데이터 이동처럼 파괴적인 명령 또는 확인 대화상자에 필요하다. |
| `--wait` | `song:generate`, `song:resume`, `song:render`에서만 작업 완료를 기다린다. |
| `--timeout MS` | 일반 명령은 기본·최대 30,000 ms, 긴 명령은 기본·최대 3,600,000 ms다. `video:render`만 기본 86,400,000 ms(24시간), 최대 2,147,483,647 ms다. |
| `--events` | 이벤트 JSONL을 stderr에 쓴다. |
| `--no-start` | 서비스가 없을 때 자동 시작하지 않는다. |

`--wait`의 반대 플래그는 없다. 기본값은 즉시 반환이다. `--input`, `--output`, `--confirm`, `--overwrite`는 `--json` 안이 아닌 최상위 플래그다.

<a id="toc-storage"></a>

## 저장공간 관리

`storage:*`는 동봉된 제작실의 저장공간 도구를 직접 실행하므로 앱·서비스를 시작하거나 재시작하지 않는다. 등록된 제작 프로젝트만 다루며, 프로젝트를 처음 등록할 때는 실제 절대 경로와 제작실 프로젝트 표식이 필요하다. 목록과 미리보기 결과가 돌려준 `projectId`, `entryId`, `planId`만 후속 요청에 사용한다.

```bash
node cli/road-music.js storage:register --json '{"project":"/absolute/path/to/studio-project"}'
node cli/road-music.js storage:list
node cli/road-music.js storage:preview --json '{"projectId":"PROJECT_ID","kinds":["cache"]}'
node cli/road-music.js storage:cleanup --json '{"planId":"PLAN_ID"}' --confirm
```

`storage:track`은 프로젝트 내부의 명시적 `cache`, `intermediate`, `history` 항목만 등록한다. 재생성 가능한 cache는 `reproducible:true`가 필요하다. `storage:policy`의 `state`는 `editing`, `completed`, `archived`이고, `retainDays`, `maxCacheBytes`, `maxCacheFiles`는 0 이상 정수다. 목록은 총량·회수 가능량과 예산 초과 여부·경고를 함께 반환한다. 일반 명령과 같은 기본 30초 시간 제한을 적용하며 `--timeout MS`로 줄이거나 늘릴 수 있다.

`storage:preview`는 실제 삭제 전에 불변 `planId`, 대상·제외 항목·파일 수·예상 회수 용량을 반환한다. `storage:cleanup`은 그 `planId`와 별도 `--confirm`을 반드시 요구하고, 실행 시에도 정책·보호·활성 lease·파일 변경을 다시 확인한다. 원음·완성 결과·모델·미등록 파일은 이 명령으로 삭제할 수 없다. `storage:lease`는 명시적인 제작 작업 잠금을 획득·해제하고, `storage:history`는 프로젝트별 감사 이력을 읽는다. `lease acquire`에는 짧게 실행되는 CLI/Python 브리지 PID가 아닌 실제 제작 프로세스의 살아 있는 `pid`를 반드시 넣고, `lease release`에는 acquire가 반환한 `token`만 넣는다.

잠금 해제가 성공하면 완료·보관 프로젝트의 보존 기간이 지난 캐시를 기존 정책으로 정리한다. 편집 중 프로젝트는 유지한다. 결과의 `cleanup`과 `cleanupWarning`을 확인하며, 보조 정리 경고를 제작 실패나 잠금 해제 실패로 해석하지 않는다. 새 스펙트럼 캐시는 곡별 `.roadmusic/cache/video/`에 등록되고, 여러 곡은 원음 경로만 기록한 전용 프로젝트로 관리한다. 원음과 모델은 복사하지 않는다.

`storage:cleanup`의 `confirm`을 `--json`에 넣어 우회할 수 없다. JSONL `batch`에서도 각 행의 최상위 `confirm:true`가 필요하다.

기존 프로젝트의 `out`, `picture`, `parts`처럼 관리 밖에 남은 결과는 `storage:legacy`로 먼저 읽는다. 이 명령이 반환한 `candidates[].id`만 `storage:adopt-preview`의 `candidateIds`에 넣고, 여기서 받은 `planId`만 `storage:adopt --confirm`에 넣는다. 명령에 경로를 직접 넣거나, 목록에 없는 후보를 추측해 채택할 수 없다. 채택은 파일을 관리 cache로 옮기고 등록한 뒤 기존 `storage:preview`와 `storage:cleanup` 흐름으로 이어진다. 추가 제작 형식은 preset ID·해시가 일치하는 CD 무음 영상과, 완료·납품 해시를 검증한 과거 native parts로 제한한다. 현재 Road Music 저장소를 등록하면 사전 검수된 과거 로컬 검증 ZIP 두 개도 같은 절차를 사용한다. 저장소의 `usageScope:managed-cache`는 관리 폴더만 집계하며 하위 작품과 소스를 다시 합산하지 않는다. 일반 ZIP·펼친 프로그램·실행 환경은 대상이 아니다.

<a id="toc-4"></a>

## 권장 작업 순서

먼저 상태와 실제 허용값을 읽고, 이후 작업에는 앞선 응답의 `dir`, `jobId`, `path`를 그대로 넣는다. 아래의 `/absolute/path/from/...` 값은 형식 검증용 절대 경로 예시이며, 실제 호출에서는 앞선 응답의 값을 사용한다. `JOB_ID`도 실제 응답의 작업 ID로 교체한다.

`setup:check`는 현재 플랫폼에서 지원하는 엔진을 모두 점검하며, 플랫폼 미지원 엔진은 `skipped`에 이유를 남긴다. 엔진별 상세 결과는 `engines`에서 확인한다. `runtime.python`과 `runtime.sqlite`는 완성본 버전·diff·저장공간 감사에 쓰는 Python 3 표준 `sqlite3`의 실행 가능 여부다. 별도 SQLite 서버나 패키지를 설치하지 않으며, 이 값이 실패하면 엔진 상태와 별도로 저장공간 이력 기능만 막는다. 준비가 되면 프로필 데이터 폴더의 `storage.sqlite3`가 프로젝트·그룹·경로 소유권·최소 이벤트와 스캔 메타데이터를 관리하고, `.roadmusic/history.sqlite3`는 납품 버전·diff 원장을 유지한다. 실제 음원·영상·원가사·엔진 JSON은 DB에 복사하지 않고 파일로 남긴다.

기존 모델로 분리 검증이 필요하면 `setup:test-profile`에 존재하지 않는 새 절대 `directory`를 전달한다. 이 로컬 명령은 기존 앱 프로필을 읽기 전용으로 확인해 실제 공유 runtime의 ACE 설치 표지와 파일이 모두 맞을 때만 상태를 옮기고, 새 프로필의 Songs·자동 MP3 정책만 만든다. 모델·라이브러리·로그인 정보·deliveryRoot를 복사하지 않으며 서비스나 설치를 시작하지 않는다.

완성 결과를 게시하면 `Output/<음악--원음SHA12>/<프로젝트--ID12>/<YYYYMMDD-HHMMSS>/`에 검증된 완성 파일만 남기고, 제작 중 자료는 `.roadmusic/work/`에 둔다. 현재 설치본이 제공하면 `storage:versions`와 `storage:version-diff`로 같은 음악·프로젝트의 초 단위 버전, 기록된 수정 사유와 파일 차이를 조회할 수 있다. 정확한 입력값은 `schema`를 확인한다.

```bash
node cli/road-music.js engines:list
node cli/road-music.js projects:list
node cli/road-music.js songs:list
node cli/road-music.js renderer:catalog
node cli/road-music.js prompt:catalog
```

프로젝트와 가사·스타일을 만든 뒤 생성 요청을 보낸다. `song:generate`는 기본적으로 `ace`를 선택하며 제목이 없으면 첫 가사 줄 또는 `무제`를 사용한다.

```bash
node cli/road-music.js projects:create --json '{"name":"CLI 예제"}'
node cli/road-music.js prompt:compose --json '{"genre":"warm Korean indie pop","instruments":["piano","acoustic guitar"],"bpm":92,"structure":"pop","lyrics":"[Verse]\n비가 그친 골목을 걸어요"}'
node cli/road-music.js song:generate --events --wait --json '{"title":"비가 그친 골목","engine":"ace","lyrics":"[Verse]\n비가 그친 골목을 걸어요\n[Chorus]\n다시 빛나는 길을 찾아","style":"warm Korean indie pop","targetSeconds":90,"seed":42,"parts":{"genre":"warm Korean indie pop","instruments":["piano","acoustic guitar"],"bpm":92,"strict":false,"strong":false,"instrumental":false,"structure":"pop"}}'
```

대기하지 않는 생성의 결과는 보통 `{ "ok": true, "result": { "jobId", "position" } }`다. `--wait`은 반환된 `jobId` 또는 `jobs[*].jobId`를 각각 `job:wait`으로 기다린다.

```json
{"ok":true,"result":{"ok":true,"songs":[{"ok":true,"song":{"jobId":"JOB_ID","dir":"SONG_DIR","audio":"..."}}]}}
```

한 작업이라도 실패하면 `--wait`의 최상위 CLI 응답은 실패가 되고, 작업별 결과는 `error.details.songs`에 남는다. `--timeout`은 각 대기 작업에 따로 적용된다. `job:wait.timeoutMs`는 1–3,600,000의 정수여야 하며, 연결하거나 서비스를 시작하기 전에 검증한다. 실제 대기 한도는 CLI `--timeout`과 `timeoutMs` 중 더 짧은 값이다.

```json
{"ok":false,"error":{"code":"operation_failed","message":"작업 대기중단/실패","details":{"ok":false,"songs":[{"ok":false,"jobId":"JOB_ID","error":{"code":"TIMEOUT","message":"..."}}]}}}
```

```bash
node cli/road-music.js song:generate --json '{"title":"아이디어","engine":"ace","style":"minimal piano sketch","instrumental":true,"targetSeconds":30,"count":3}'
node cli/road-music.js job:wait --events --json '{"jobId":"JOB_ID","timeoutMs":3600000}'
```

`job:wait`은 성공 시 `{ "ok": true, "song": { ... } }`, 작업 실패 시 `{ "ok": false, ... }`를 반환한다. 대기 시간이 끝나면 `TIMEOUT` 오류를 반환하지만 작업 자체는 계속 실행된다.

<a id="toc-5"></a>

## 생성 입력의 핵심 제약

| 필드 | 제약 |
| --- | --- |
| `engine` | `ace`(기본), Windows NVIDIA용 `yue`, Apple Silicon용 `yue-mlx`. `engines:list` 결과를 먼저 따른다. |
| `style` / `parts.genre` | 스타일 설명에 쓰는 문자열이며 각 최대 2,000자다. |
| `parts.instruments` | 최대 3개이며 [레퍼런스의 악기 목록](cli-reference.md#parts)을 따른다. |
| `bpm` | 최상위 또는 `parts.bpm`, 정수 40–220. 최상위 값은 `parts.bpm`으로 합쳐진다. |
| `targetSeconds` | 숫자 1–600 또는 `null`; 엔진별 추가 제한은 생성 검증이 적용한다. |
| `seed` | 0–2,147,483,647 정수 또는 `null`. |
| `soundEffect` | ACE만 가능하다. 가사·악보·커버·녹음·`mode:"plan"`과 함께 쓸 수 없고 길이는 1–30초다. |
| `coverAudio` | ACE만 가능하다. `dir`은 현재 곡 라이브러리 안의 실제 곡 폴더, `strength`는 0.1–1이다. |
| `recording` | ACE만 가능하다. `recording:pick`이 반환한 앱 녹음 경로만 허용한다. |
| YuE 입력 | `mode`, `cot`, `abc`, `advanced`는 레퍼런스의 범위대로 쓴다. `yue`는 Windows NVIDIA 전용이고, Apple Silicon에서는 `yue-mlx`를 사용한다. |

녹음 파일은 직접 `recording.path`에 넣지 않는다. 먼저 앱 관리 녹음으로 가져온다.

```bash
node cli/road-music.js recording:pick --input "/Users/me/Music/humming.m4a"
node cli/road-music.js song:generate --json '{"title":"허밍에서 만든 곡","engine":"ace","style":"gentle acoustic folk","lyrics":"[Verse]\n멜로디를 따라 걸어요","recording":{"path":"/absolute/path/from/recording-pick.wav","strength":0.8,"targetSeconds":90}}'
```

`recording:start`/`recording:stop`은 OS 마이크 권한과 실제 입력 장치가 필요하다. 권한 요청을 처리하려면 `service:show`가 필요할 수 있다.

<a id="toc-6"></a>

## 곡 저장과 관리

목록 응답의 절대 `dir`을 곡 식별자로 사용한다. `song:detail`, `song:clone`, `song:srt`, `player:play`은 `dir`, `id`, `folder` 중 하나를 받지만 `id`가 중복될 수 있으므로 `dir`이 안전하다.

```bash
node cli/road-music.js song:detail --json '{"dir":"/absolute/path/from/songs-list"}'
node cli/road-music.js song:lyrics --json '{"dir":"/absolute/path/from/songs-list","lyrics":"[Verse]\n확정한 가사 원문"}'
node cli/road-music.js song:export --json '{"dir":"/absolute/path/from/songs-list","format":"mp3"}' --output "/Users/me/Desktop/song.mp3"
node cli/road-music.js song:srt --json '{"dir":"/absolute/path/from/songs-list"}'
node cli/road-music.js song:save-srt --json '{"title":"비가 그친 골목","text":"1\n00:00:00,000 --> 00:00:01,000\n가사"}' --output "/Users/me/Desktop/song.srt"
node cli/road-music.js album:export --json '{"format":"mp3","minRating":0,"numbered":true}' --output "/Users/me/Desktop/가을 앨범"
```

`song:srt`에서 `save:true`이면 `--output`도 필요하다. `song:export`는 `mp3` 또는 `wav` 파일을, `album:export`는 폴더를 쓴다. 파일 출력은 곡 라이브러리 밖이어야 한다. 이미 있는 파일은 `--overwrite`가 필요하다. 저장 명령은 대상 폴더의 임시 파일에 먼저 만든 뒤 최종 경로로 반영하므로, 실패하면 기존 출력 파일을 보존한다. 명령이 받지 않는 `--input`, `--output`, `--overwrite`와 저장 형식에 맞지 않는 출력 확장자는 오류가 된다.

`song:lyrics`는 곡 정보의 `lyrics`만 갱신하며 태그·줄바꿈·공백을 그대로 저장한다(최대 20,000자). 음원·내장 태그·악보·과거 생성 입력을 바꾸거나 새로 생성하지 않는다. 빈 문자열은 명시적으로 가사 칸을 비운다. 현재 생성·대기 중인 곡은 저장을 거부하며, 파일 저장 실패 시 기존 곡 정보를 보존한다. 앱의 선택 곡 정보와 열려 있는 전체 가사 창도 갱신한다. 긴 가사는 `{ "dir": "목록의 절대 경로", "lyrics": "가사 원문" }` JSON 파일을 만들어 `--file`로 전달할 수 있다. 저장 후 `song:detail`의 `lyrics`를 원문과 비교해 확인한다.

Windows에서는 기존 숨김 메타데이터를 먼저 별도 파일로 보존한 뒤 새 정보를 반영한다. 실패하면 이전 정보를 복구하며, 자동 복구마저 실패하면 응답의 `backupPath`에 보존 경로를 제공한다. 중단 후 `meta.json`이 없으면 `songs:list`가 정상 백업을 찾아 복구한다. 실제 Windows 파일 잠금·숨김 속성은 별도 실기 검증 대상이다.

### 원본 보존과 최종본 교체

`songs:import`는 음원의 내장 제목·아티스트·앨범·장르·트랙 번호·가사를 곡 정보로 가져온다. WAV·MP3는 바이트 그대로 복사한다. FLAC 등 다른 형식은 `.source`에 원본과 SHA-256을 보존하고 재생용 32비트 PCM WAV를 만든다. 원본을 16비트로 양자화하지 않는다. 메타데이터를 읽고 형식을 변환하려면 FFmpeg가 필요하다.

```bash
node cli/road-music.js app:capabilities
node cli/road-music.js songs:import --input "/Users/me/Music/확정 음원.flac"
node cli/road-music.js song:replace --json '{"dir":"/absolute/path/from/songs-list"}' --input "/Users/me/Music/최종본.mp3"
node cli/road-music.js song:backups --json '{"dir":"/absolute/path/from/songs-list"}'
node cli/road-music.js song:restore --json '{"dir":"/absolute/path/from/songs-list","backup":"/absolute/path/from/song-backups"}'
```

`song:replace`는 곡 폴더 식별자와 프로젝트의 곡 순서를 유지한다. 이전 버전은 같은 프로젝트의 `.roadmusic-backups`에 보존하며 자동 삭제하지 않는다. 새 파일의 태그를 우선하고 태그가 없는 항목은 기존 제목·아티스트·가사 등을 유지한다. 이전 악보·가사 시각·생성 설정을 새 음원에 잘못 적용하지 않도록 백업과 이전 제작 이력으로 분리한다. 기존 배경 이미지는 유지한다. 연결은 고정된 `dir`을 사용하고 교체 후 `songs:list`/`song:detail`에서 현재 `audio`·`audioUrl`을 다시 읽는다. 서로 다른 형식으로 교체하면 실제 음원 파일 경로는 바뀔 수 있다.

생성·대기 중이거나 재생 중인 대상 곡은 교체를 거부한다. 실패하면 이전 폴더로 복구하고, 복구 실패 시에도 백업을 남긴다. 원래 폴더가 없어진 경우 `song:backups`로 같은 곡의 백업을 찾아 `song:restore`로 복구할 수 있다. 다른 곡의 백업·라이브러리 밖 경로·심볼릭 링크는 거부한다.

### 전체 가사 창 검수

```bash
node cli/road-music.js song:info --json '{"dir":"/absolute/path/from/songs-list"}'
node cli/road-music.js app:screenshot --output "/Users/me/Desktop/전체 가사 확인.png"
node cli/road-music.js song:info --json '{"dir":"/absolute/path/from/songs-list","open":false}'
```

`song:info`는 실제 전체 가사 창의 `displayedLyrics`와 저장된 `lyrics`, `lyricsMatch`를 반환한다. `app:screenshot`은 해당 앱 창의 렌더링 결과만 PNG로 저장한다. 숨김 서비스에서도 동작하며, 결과의 `visible`로 실제 창이 보이는 상태인지 구분한다. 원문 비교와 화면 표시 검수는 가창·발음 검수와 별개다.

`app:capabilities`는 연결된 서비스가 직접 응답하는 지원 정보다. `schema`·`cli:version`은 로컬 키트 기준이므로 실행 서비스와 다른 소스를 사용할 때는 두 결과를 대조한다. 명령의 플랫폼 지원과 renderer·FFmpeg 준비, 엔진 모델 설치, 현재 작업 중 상태를 구분하며, 준비 상태를 실제 GPU 성능·모든 옵션 조합의 실기 통과로 해석하지 않는다.

<a id="toc-7"></a>

## 영상

과거 공용 `video-cache`는 새 프로젝트별 캐시와 별도다. 앱 재시작 후 진행 작업이 없을 때 `video:cache`로 실제 대상과 보호 항목을 확인하고, 반환한 `planId`로 `video:cache-clear --json '{"planId":"반환된 값"}' --confirm`을 실행한다. 현재 실행 코드에서 검증한 과거 오디오·스펙트럼 생성물만 정리하며 임의 파일·모델·완성본·필요 이력은 제외한다. 계획은 같은 앱 프로세스에서 15분간 한 번 유효하고 파일 변경 시 거부한다. `video-cache-cleanup.jsonl`에 정리 의도와 결과를 보존한다.


완성 영상에는 저수준 프레임 명령이 아니라 `video:render`를 쓴다. `tracks`에는 `songs:list`에서 얻은 완료 곡 `dir`을 전달하고 `--output`에는 MP4 파일을 준다.

```bash
node cli/road-music.js video:render --events --json '{"tracks":["/absolute/path/from/songs-list"],"name":"가을 플레이리스트","video":{"resolution":"1080p","fps":30,"renderer":"cpu","background":{"kind":"none"},"spectrum":{"visible":true,"kind":"bars","barCount":32},"eq":{"on":true,"preset":"warm","gains":[3,2,1,0,-1,-2,-3]},"length":{"mode":"once"},"tracklist":{"visible":true},"overlays":[]}}' --output "/Users/me/Desktop/playlist.mp4"
```

`video:preview`는 미리보기를 준비하고, `video:state`, `video:seek`, `video:play`, `video:pause`, `video:chapters`로 제어한다. `video:configure`는 현재 화면 설정을 부분 병합하며 `save:true`일 때 저장한다. `video:cancel`은 준비 단계 또는 렌더 단계에서 보류 상태를 반환할 수 있다. 배경·CD 표지·오버레이는 로컬 `path` 또는 호스트가 없거나 `localhost`인 `file:` URL만 받으며 원격 URL과 Windows UNC 경로는 거부한다. 위치와 크기는 화면 비율 좌표이고 허용 범위는 [레퍼런스](cli-reference.md#video)에 있다. GPU 인코더(`renderer:"gpu"`)의 가용성과 결과는 드라이버·하드웨어에 달려 있다.

회전 CD는 `spectrum.kind:"cd"`와 표지 경로로 만든다. AI 에이전트는 곡의 장르·분위기를 참고해 이미지 생성 도구로 표지만 만든 뒤 아래 입력으로 연결한다. 표지 생성 API나 LTX 영상 모델은 CD 회전 자체에 필요하지 않다. 회전은 영상 시각을 따르고 테두리는 실제 음악 분석값에 반응한다. `cover:null`로 표지를 빼면 금속 CD가 나온다.

```bash
node cli/road-music.js video:render --events --json '{"tracks":["/absolute/path/from/songs-list"],"name":"회전 CD 플레이리스트","video":{"resolution":"1080p","fps":30,"renderer":"cpu","background":{"kind":"none"},"spectrum":{"visible":true,"kind":"cd","cover":{"path":"/Users/me/Pictures/album-cover.png"},"position":"center","size":0.55,"color1":"#dfba86","color2":"#6fb7b5","glow":0.3},"length":{"mode":"once"},"tracklist":{"visible":true},"overlays":[]}}' --output "/Users/me/Desktop/cd-playlist.mp4"
```

<a id="toc-8"></a>

## 연결 끊김과 재시작

`job:wait`은 일시적인 연결 끊김 또는 서비스 재시작 후 남은 대기 시간 안에서만 재연결한다. 생성·재개·악보 렌더·영상 렌더 요청은 중복 실행을 막기 위해 자동 재제출하지 않는다. 이 요청 중 연결이 끊기면 오류에 `uncertain:true`가 붙을 수 있으므로 `service:status`, `queue:list`, `job:wait` 또는 결과 곡 목록으로 처리 여부를 확인한 뒤 사용자가 재시도한다.

`video:render`가 `uncertain:true`로 끝났다면 같은 렌더 JSON을 바로 다시 제출하지 않는다. 먼저 `service:status`, `queue:list`, `video:state`를 읽고, 처음 지정한 `--output` 절대 경로에 MP4가 생겼는지 확인한다. 상태가 진행 중이거나 출력이 만들어졌다면 기존 렌더를 유지한다. 상태가 끝났고 출력이 없을 때만 실패 원인과 기존 출력 덮어쓰기 여부를 확인한 뒤 사용자가 재시도를 결정한다.

명시적인 `service:stop`이 이벤트로 확인되면 대기 중인 작업은 `SERVICE_STOPPED`, `uncertain:true`, `retry:false`로 끝나며 CLI가 서비스를 자동으로 다시 시작하지 않는다. 다시 시작하려면 작업 상태를 확인한 뒤 별도로 `service:start`을 호출한다.

대기열과 최근 작업 결과는 데이터 폴더의 `queue.json`에 저장된다. 재시작 시 대기·실패 작업과 최근 완료/실패 결과를 복원하며, 보존 한도는 실패 작업 8개와 결과 64개다. 커버·녹음 원본은 재시도할 작업이 참조하는 동안 정리 대상에서 제외된다.

<a id="toc-9"></a>

## JSONL 배치

`batch`는 stdin의 각 JSON 객체를 한 요청으로 실행하고, 요청마다 stdout JSON 한 줄을 쓴다. `batch`에는 `--events`, `--no-start`만 붙일 수 있다. 줄별 `input`과 `output`은 처음부터 절대 경로여야 하며, `id`는 있으면 비어 있지 않은 문자열이다.

```json
{"id":"state","command":"app:state","params":{}}
{"id":"project","command":"projects:list","params":{}}
```

```bash
node cli/road-music.js batch --no-start < requests.jsonl
```

성공 행은 `{ "id": "state", "ok": true, "result": ... }`, 실패 행은 `{ "id": "state", "ok": false, "error": { "code", "message", "details" } }`이다. 실행 오류가 있는 행은 종료 코드 `1`, 인수·스키마 오류가 한 행이라도 있으면 `2`다.

<a id="toc-10"></a>

## 사용 경계

- 파일 선택 명령에는 `--input`, 저장 명령에는 `--output`을 제공한다. 폴더 선택 명령은 `--output`을 폴더로 받을 수 있다.
- `assets:remove`은 앱 에셋 내부 파일만, `recording.path`는 앱 녹음 내부 파일만 허용한다.
- `about:feedback`은 외부 문의 전송이고 `shell:open`, `about:open`, `update:open-page`, `notices:open`, `song:reveal`, `log:open`은 OS/브라우저를 연다.
- 모델 설치·음악 생성·마이크 권한·GPU/CPU 렌더는 환경 의존적이다. 항상 응답 JSON과 `--events`를 확인한다.

설계·안전 경계는 [CLI 설계](cli-design.md), 필드별 전체 목록은 [CLI 레퍼런스](cli-reference.md), 검증 범위는 [CLI QA 리포트](cli-qa-report.md)를 참고한다.

## 제작실·완성 결과·사용 가이드

명시적인 서비스 시작은 기존 Ego 탭을 재사용합니다. 제작 설정은 **제작실**, 제작 이후의 정보는 **내 작업물**에서 음악별 상세를 열어 확인합니다. 상세 내부 메뉴에서 음원·영상·원가사·SRT·스토리보드·검수 의견을 확인하고 개별 또는 음악 그룹 ZIP으로 받습니다. 자세한 기능 설명은 **사용 가이드**에서 제공합니다. 이전 완성 결과·검수 URL도 호환용으로 유지합니다.

가이드는 설치된 `road-music-video-studio/assets/guides/cli.md`를 원본으로 관리합니다. HTML의 **사용 가이드 → CLI**에서 실제 명령·절대 경로·완료 대기·원가사/SRT와 publish 구분을 읽고 Markdown으로 복사할 수 있습니다. 설치본 schema에 없는 `motion:*`·`skills:*` 예시는 실행하지 말고, 현재 스킬의 `scripts/studio.py`·updater helper를 사용합니다. 사용자 가사·SRT의 내용과 싱크는 UI 개편으로 변경하지 않습니다.

### 음악별 내 작업물

영상 제작실의 전역 메뉴는 제작실·내 작업물·스타일·사용 가이드입니다. 제작 이후의 음악·스타일 영상·원가사·SRT·스토리보드·검수 기록은 내 작업물의 음악별 상세에 모입니다. 목록의 제작 날짜는 한국 시간으로 초까지 표시하며, 과거 파일은 생성/수정 시각을 사용합니다. 같은 음악은 원음 SHA-256으로 그룹화하고 그룹 ZIP은 음악과 모든 등록 결과를 원본 그대로 담습니다. 공통 제작실 스킬의 `publish`·`serve`·`library-register`는 해당 스킬의 Python 도구 명령이며 공개 Road Music CLI에 임의의 `works:*` 명령을 만들어 실행하지 않습니다.


## 작업 폴더의 Git·과거 설치 검증·제작 자료 정리

등록된 프로젝트 캐시와 작업 폴더 전체의 과거 잔재는 범위가 다르다. `storage:maintenance-list`는 현재 소스 작업 폴더의 숨김 폴더를 포함한 전체 폴더·파일·캐시를 먼저 스캔하고, 지원하는 설치 검증 복제본·과거 다운로드 캐시·검증 가능한 제작/참조 자료를 점검한다. `includeRetirement:true`를 주면 최종본 외 제작 자료도 후보와 보호 용량을 함께 검토한다. 완료된 스캔의 `scanId` 없이 정리 계획을 만들거나 실행할 수 없다. 오류·권한 문제·한도 초과가 있으면 전체 스캔 미완료로 표시하고 정리하지 않는다. 외부 symlink는 따라가지 않고 보호하며 알 수 없는 파일도 보호한다. 전체 메타데이터 인벤토리는 프로필 `storage.sqlite3`에 재사용 가능한 경로·통계·소유권 메타데이터로 보관하고 HTML에는 폴더·대용량 파일·종류별 요약을 제공한다. 실제 미디어나 엔진 JSON을 DB에 복제하지 않는다. 임의 폴더나 모델·앱·완성 음악/영상 삭제 명령은 아니다. 모델 제거는 이 정리와 별도인 명시 작업이다. 다운로드한 독립 CLI에 작업 저장소가 없으면 기능 미지원으로 표시한다.

일반 `storage:maintenance-list`와 음악별 이전 제작 자료 점검은 Git 객체를 분석하거나 Git 명령을 실행하지 않는다. Git 저장소가 있는 개발 환경에서만 `storage:maintenance-list --json '{"scope":"git"}'`를 명시해 Git 보호 상태를 점검할 수 있으며, 그 뒤에도 별도 미리보기와 `--confirm`이 필요하다. 설치형 CLI에서 Git 저장소가 없으면 Git 공간 관리는 비활성화된다.

Git은 현재 버전·태그·복구 reflog와 모든 정상 worktree의 스테이징을 유지하고 최소 최근24시간 객체를 보존한다. `storage:maintenance-preview --json '{"scanId":"전체스캔에서 받은 ID","scope":"git"}'`의 정리 조건과 보호 상태를 확인한다. 변경된 작업 상태·잠금·진행 중 Git 작업·지원하지 않는 저장소 구조는 거부한다. 정리 중에는 다른 Git 작업을 실행하지 않는다. Git 객체의 논리 합계는 압축된 pack의 확정 회수량이 아니며 실행 결과의 `freedAllocatedBytes`와 별도 `diskFreeDeltaBytes`로 실제 변화를 확인한다. Git pack 파일 직접 삭제·이력 강제 재작성·즉시 전량 prune은 제공하지 않는다.

과거 설치 검증 복제본은 목록에서 받은 후보 ID만 `storage:maintenance-preview`의 `scanId`, `scope:verification`, `candidateIds`로 선택한다. 현재 실행 프로그램·모델·입력·최종 결과물·필요한 검수/복구 기록·배포 원본은 보존한다. 이름만 test/cache/draft인 자료를 자동 후보로 삼지 않는다.

HTML **저장공간 관리 → 기타 관리 → 과거 제작·참조 자료**에서는 같은 전체 스캔의 후보만 펼쳐 본 뒤, `storage:maintenance-preview --json '{"scanId":"전체스캔에서 받은 ID","scope":"artifacts","candidateIds":["선택 후보 ID"]}'`로 개별 계획을 만든다. 이 범위는 자동 일괄 정리에 넣지 않는다. 원본 참조 영상·모델·최종 납품물·필요한 코드/JSON 보고서·전체 contact sheet·처음/중간/끝 대표 프레임은 보존한다. 원본 SHA와 추출 색인이 일치한 조밀 분석 프레임, 최종 해시와 일치한 QA runtime/style 세부 PNG, 보존 ZIP과 바이트까지 같은 이전 버전 binary 복제본(복구 ZIP 멤버 매핑 포함), 모든 미디어 스트림 해시가 원본과 같은 capture-remux 복제본만 수동 선택 후보가 된다. `qa`·`before`라는 이름만으로는 후보가 되지 않는다.

음악별 모션그래픽을 포함한 각 제작 폴더의 전체·관리 cache·미관리 용량은 `storage:overview --json '{"refreshWorkspace":true}'`로 메타데이터 전수 집계해 확인한다. 이 새로 고침은 파일의 크기·경로·검증된 제작 메타데이터를 읽어 음악 원음 SHA별로 연결할 뿐, 미디어를 새로 해시하거나 생성·삭제·현재 런타임 자동 정리 설정을 바꾸지 않는다. 원음 SHA가 하나로 확인된 제작 폴더는 그 음악 그룹에, 여러 음악 또는 근거가 없는 폴더는 기타 관리의 미관리 용량으로 남긴다.

등록된 음악 그룹의 개별 완성 파일은 `storage:file-remove-preview`에서 원음·현재 입력·버전 이력과 해시를 확인한 뒤 받은 `planId`만 `storage:file-remove --confirm`으로 실행한다. 마지막 완성 파일도 명시 선택으로만 검토하며 자동 일괄 정리에는 포함하지 않는다. 완료·보관·유휴 상태의 `.roadmusic/work` 프로젝트는 `storage:project-finish-preview`과 `storage:project-finish --confirm`으로 canonical Output·최소 이력을 보존한 채 작업 자료만 정리할 수 있다.

완성한 음악별로 예전 렌더·검수 세부 이미지·명시 소유 파생 WAV·검증된 참조 분석 자료를 정리하려면 **내 작업물 → 해당 음악 → 이전 제작 자료 선택** 또는 기타 관리의 `retirement` 후보를 사용한다. `storage:maintenance-list --json '{"includeRetirement":true}'`의 최신 `scanId`와 목록 `candidateIds`만 `storage:maintenance-preview --json '{"scanId":"전체스캔에서 받은 ID","scope":"retirement","candidateIds":["선택 후보 ID"]}'`에 넣는다. 이 범위도 자동 일괄 정리에 포함되지 않으며, 원음·등록 최종본·현재 프로그램/모델·제작 입력/자산·필요한 JSON/문서 판정·최소 이력은 보존한다.

과거 배포 ZIP은 컨테이너 바이트가 같다는 이유로만 지우지 않는다. 현재 canonical 보관본과 일치하는 멤버는 그 보관본을 근거로 하고, 고유 멤버는 content history에 별도 보존·검증한 뒤에만 원래 ZIP 컨테이너를 후보로 만든다. 그래서 원본 ZIP과 바이트까지 같은 재생성은 보장하지 않는다.

미리보기에서 반환한 `planId`는 `storage:maintenance-cleanup --json '{"planId":"반환된 계획"}' --confirm`으로 한 번 실행한다. Git·설치 검증 복제본·과거 제작/참조 자료·최종본 외 제작 자료는 각각 별도 계획이다. 실행 전 파일·보존 근거·사용 중 상태·hardlink/symlink가 바뀌면 계획은 거부된다. 작업 폴더 `.roadmusic` 아래에는 조건·선택·파일 지문을 압축한 감사 목록과 결과의 최소 이력이 남으며 `storage:maintenance-history`로 조회한다. HTML도 같은 공개 명령과 보호 조건을 사용한다. 보고할 때는 후보의 논리 바이트, 실제 `freedAllocatedBytes`, 전체 디스크 `diskFreeDeltaBytes`를 구분한다. Git 정리는 최대15분, 점검은 최대3분으로 제한한다.

Git 보존과 prune 날짜의 의미는 [Git GC 공식 문서](https://git-scm.com/docs/git-gc), [Git repack 공식 문서](https://git-scm.com/docs/git-repack)를 따른다. 이 기능은 복구 reflog를 만료시키거나 사용자 커밋을 삭제하는 기능이 아니다.


### 음악별 저장공간과 AI M/V 전체 정리

`storage:status`는 Electron·Git 심층 검사·전체 재스캔 없이 현재 작업 폴더의 검사 capability를 읽습니다. `workspaceScan`, `retirement`, `verification`, `artifacts`, `git`의 `enabled`가 true인 범위만 검사하고, false이면 `reason`을 표시합니다. 일반 `storage:maintenance-list`는 메타데이터와 비Git 후보만 보며, Git 보호 상태는 개발 저장소에서 `scope:"git"`을 명시한 경우에만 검사합니다.

`storage:tracking`은 프로필 `storage.sqlite3`의 소유권 색인을 읽습니다. 기본 호출은 저장된 색인만 반환하고 파일을 다시 훑지 않습니다. `{"refreshWorkspace":true}`일 때만 현재 trusted 작업 폴더의 경로·크기·수정 시각을 일괄 색인합니다. 결과는 알려진 소유권과 실제 **소유권 미확인·보호** 폴더를 함께 보여 줍니다. `.roadmusic`, `.harness`, `.omx`, `_workspace` 같은 관리·검수·실행 영역은 제작물 미연결 항목이 아니라 관리 영역으로 표기합니다.

검증된 재생성 잔재만 `storage:reconcile-preview`로 일회용 계획을 만들고 `storage:reconcile-cleanup --confirm`으로 실행합니다. 현재 기본 후보는 `.DS_Store`뿐입니다. 미확인 폴더·외부 도구 상태·모델·프로그램·원음·완성본·활성 작업은 후보에 넣지 않습니다. 프로젝트나 음악 그룹 자체를 삭제해야 하면 `storage:project-remove-preview` 또는 `storage:group-remove-preview`의 명시적 범위·경고를 확인한 뒤 `storage:entity-remove --confirm`을 사용합니다. 이 흐름은 해당 live 소유권·경로·이벤트를 `storage.sqlite3`에서도 제거하지만 공유·활성·핀한 자산과 외부 원음은 차단합니다.

프로젝트/그룹 제거가 적용 중 중단되면 같은 계획 ID로 `storage:entity-recover --confirm`을 실행해 격리 파일·원래 경로·SQLite 상태를 다시 대조하고 복구할 수 있습니다. 도구는 격리 파일의 지문과 SQL 상태가 모두 맞을 때만 복구합니다. 파일이 바뀌었거나 상태가 일치하지 않으면 복구하지 않고 격리를 유지해 더 큰 손상을 막습니다.

`storage:overview`는 같은 원음 SHA의 제작 프로젝트를 한 음악으로 묶고 테스트·미연결 자료를 분리합니다. HTML 저장공간 관리의 기본 목록은 이 음악 그룹이며, 기타 관리에서 원시 프로젝트·작업 폴더 스캔·Git·과거 검증 자료를 펼쳐 확인합니다.

우측 상단 **자동 일괄 정리**는 `storage:sweep-preview`로 전체 스캔과 미리보기를 먼저 만들고 확인 시 `storage:sweep-cleanup --confirm`을 실행합니다. 기본은 등록된 재생성 캐시와 검증된 과거 설치 복제본이며, 과거 제작·참조 자료와 최종본 외 제작 자료는 포함하지 않습니다. 원음·음악 완성본·AI M/V 최종 영상도 임의로 포함하지 않습니다.

사용자가 AI M/V 작업을 통째 삭제하려면 `storage:mv-list`의 검증된 ID를 선택합니다. `storage:maintenance-list`의 최신 완료 `scanId`와 `projectIds`로 `storage:mv-preview`를 호출하고 받은 `planId`를 `storage:mv-cleanup --confirm`으로 실행합니다. 또는 `storage:sweep-preview`에 `mvProjectIds`를 명시합니다. 이 범위에는 해당 프로젝트의 애니매틱·최종 영상·샷·검수·중간본이 포함됩니다. 외부 원본 음악·가사·현재 프로그램·설치 모델은 유지하고 최소 요약을 프로젝트 밖에 남깁니다.

일회용 계획은 15분 뒤 만료됩니다. 루트·파일·잠금·원음 상태가 바뀌면 다시 점검하며 임의 경로나 Git 옵션을 받지 않습니다. 확보 용량은 논리 크기와 실제 파일 할당량·디스크 여유 변화를 구분합니다.

상태의 `scanCache`, `tracking`, `history`는 각각 압축 인벤토리, 프로필 소유권 SQLite, 납품 버전 SQLite의 현재 경로·읽기 전용 상태를 알립니다. 조회마다 전체 파일 해시·전체 재스캔·SQLite `VACUUM`을 실행하지 않으며, 미리보기·확인 실행에서 필요한 파일만 다시 검증합니다. 관리 DB에는 생성·수정·게시·정리의 최소 이벤트와 경로·통계만 기록하며 프레임, 미디어 BLOB, 상세 로그 덤프는 기록하지 않습니다.


## 제작 프롬프트와 성능 기록

음악·모션그래픽 작업은 `production:request`로 최초 요청과 수정 요청을 기록하고 응답의 `requestId`로 제작 작업을 연결한다. 최초 사용자 요청은 메인 프롬프트로 보존하고 엔진 caption/style은 별도 입력으로 표시한다. 작업의 실제 시작·종료·성공/실패/취소와 생성 파일 메타데이터를 SQLite로 관리한다. HTML **제작 성능**에서 프로젝트별 요청/결과 횟수, 메인·이력 프롬프트 복사, 같은 조건의 평균·느린 작업과 버전 확인 상태를 본다. 많은 프로젝트와 요청은 커서 기반 무한 스크롤로 읽는다.

`production:projects`, `production:prompts`, `production:tasks`, `production:files`, `production:dashboard`, `production:activity`, `production:components`는 앱을 시작하지 않는 조회 명령이다. `production:activity`는 SQLite의 실제 완료 이력으로 예상 시간을 계산하고, 실행 중 음악 큐는 `queue:list --no-start`로만 읽어 합친다. 앱이 꺼져 있으면 대기열은 오프라인으로 표시하며 시작하지 않는다. 기존 작업의 프롬프트·시간을 추측해 만들지 않는다. 기록의 정의와 예시는 [제작 기록·성능 대시보드](production-records.md)를 참고한다.

### 그룹별 요청 기록과 좋아요

`works:list`로 받은 `groupId`를 `production:prompts`, `production:tasks`, `production:files`의 조회 조건으로 전달하면 해당 음악 그룹의 기록만 읽습니다. `works:favorite`에 같은 `groupId`와 `favorite:true/false`를 보내 좋아요를 저장·해제하고, `works:list`의 `favoritesOnly:true`로 좋아요 목록만 확인합니다. 두 작업물 명령은 SQLite 메타데이터만 사용하며 Electron을 시작하지 않습니다.

### 제작 기록과 HTML 검수 보완

내 작업물의 `전체 제작 분석·업데이트`와 음악 상세의 `제작 기록`에서 CLI와 동일한 SQLite 원장을 확인합니다. 상세는 최초 요청·추가 요청·작업·생성 파일을 해당 음악으로 제한하고 버전 비교·변경·검수 자료를 펼쳐 봅니다. 복사 거절 시 원문을 직접 복사할 수 있습니다. 스킬 업데이트는 개별 카드에서 시작해도 관리 스킬 전체 묶음 범위이며 확인창에 이를 표시합니다.

`storage:maintenance-history`의 기본/최대 대기 시간은 유지보수 목록과 같은 180초입니다. 정리는 기존 공개 명령의 미리보기·확인 실행을 사용하며 HTML 확인창도 표시 중인 계획 하나만 실행합니다.

## 관리 스킬과 영상 제작실 연결

`skills:status`, `skills:check`, `skills:install`, `skills:update`, `skills:watch`와 `motion:handoff`, `motion:studio`는 동봉한 music-road-skills를 통해 로컬에서 처리합니다. 기존 음악 엔진을 시작하거나 모델을 설치하지 않습니다. 설치·업데이트와 브라우저 열기는 사용자가 요청한 범위에서만 실행합니다. `--host`·`--skills-target`과 입력·응답 예시는 [모션그래픽 CLI 가이드](cli-motion-graphics.md)를 확인하세요. 제작실이 반환한 실제 `project` 절대 경로를 다음 명령에서 재사용합니다.
