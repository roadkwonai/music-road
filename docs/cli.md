# Road Music CLI

Road Music CLI는 실행 중인 Road Music 앱의 기능과 생성 대기열을 로컬 JSON 요청으로 호출한다. 독립 음악 엔진이나 네트워크 API가 아니다. 현재 설치 버전의 `schema`가 명령·필드의 기준이며, 전체 표는 [CLI 레퍼런스](cli-reference.md)에 있다.

## 목차

- [시작하기](#toc-1)
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

CLI는 소스 체크아웃 또는 배포된 `RoadMusic-1.4.0-cli` 소스 키트에서 Node.js로 실행한다. 패키지된 dmg가 전역 `road-music` 명령을 설치하지는 않는다. GUI만 쓸 때는 Node.js가 필요 없지만, CLI에는 Node.js 24 LTS와 `npm ci --include=dev`가 필요하다. dmg·소스 키트·전역 링크의 설치 차이는 [CLI 설치](cli-install.md)를 따른다.

```bash
npm ci --include=dev
node cli/road-music.js schema
node cli/road-music.js app:state
```

원하면 소스 키트에서만 `npm link`로 `road-music` 전역 링크를 만들 수 있다. 권한 오류가 나도 `sudo`를 쓰지 말고 계속 `node cli/road-music.js`를 사용한다.

명령은 `group:action` 또는 `group action` 형식이다. `schema`와 `help`는 서비스에 연결하지 않고 로컬 스키마를 출력한다. 그 밖의 첫 요청은 서비스가 없을 때 숨겨진 Electron 창을 시작한다. 이미 GUI가 실행 중이면 같은 데이터 폴더·곡 라이브러리·대기열을 공유한다.

```bash
node cli/road-music.js schema --json '{"command":"song:generate"}'
node cli/road-music.js service:status --no-start
node cli/road-music.js service:show
```

`service:status`와 `service:stop`은 자동 시작하지 않는다. `service:start`는 상태 요청으로 서비스를 시작한다. 활성 요청·생성·설치·렌더·대기열이 있을 때 `service:stop`은 `--confirm` 없이는 실패하며, `--confirm`은 진행 중인 작업을 중단할 수 있다.

앱·서비스가 실행 중이면 GitHub 최신 정식 버전을 주기적으로 확인한다. `update:check`로 수동 확인, `update:status`로 상태 조회, `update:watch`로 알림 대기, `update:install`로 다운로드·설치·재시작을 요청한다. 지원되는 설치 방식·진행 작업 보호·재시작 후 확인은 [업데이트 가이드](updates.md)를 따른다.

기본 데이터 폴더는 macOS에서 `~/Library/Application Support/Road Music`이다. 개발·자동화는 실제 라이브러리와 분리한 절대 경로를 지정한다.

```bash
ROADMUSIC_DATA_DIR="/tmp/road-music-cli" node cli/road-music.js service:start
```

CLI 제어 요청은 macOS/Linux의 사용자 전용 Unix 소켓 또는 Windows named pipe를 쓴다. 원격 제어 TCP 포트는 열지 않는다. 다만 영상 렌더링 중 프레임 전달을 빠르게 하기 위해서만 임시 HTTP 서버를 `127.0.0.1`에 열며, 렌더마다 만든 토큰이 맞는 요청만 받는다. 사용할 수 없으면 IPC 전송으로 돌아간다.

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

<a id="toc-4"></a>

## 권장 작업 순서

먼저 상태와 실제 허용값을 읽고, 이후 작업에는 앞선 응답의 `dir`, `jobId`, `path`를 그대로 넣는다. 아래의 `/absolute/path/from/...` 값은 형식 검증용 절대 경로 예시이며, 실제 호출에서는 앞선 응답의 값을 사용한다. `JOB_ID`도 실제 응답의 작업 ID로 교체한다.

`setup:check`는 현재 플랫폼에서 지원하는 엔진을 모두 점검하며, 플랫폼 미지원 엔진은 `skipped`에 이유를 남긴다. 엔진별 상세 결과는 `engines`에서 확인한다.

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
| `engine` | `ace`(기본) 또는 `yue`. `engines:list` 결과를 먼저 따른다. |
| `style` / `parts.genre` | 스타일 설명에 쓰는 문자열이며 각 최대 2,000자다. |
| `parts.instruments` | 최대 3개이며 [레퍼런스의 악기 목록](cli-reference.md#parts)을 따른다. |
| `bpm` | 최상위 또는 `parts.bpm`, 정수 40–220. 최상위 값은 `parts.bpm`으로 합쳐진다. |
| `targetSeconds` | 숫자 1–600 또는 `null`; 엔진별 추가 제한은 생성 검증이 적용한다. |
| `seed` | 0–2,147,483,647 정수 또는 `null`. |
| `soundEffect` | ACE만 가능하다. 가사·악보·커버·녹음·`mode:"plan"`과 함께 쓸 수 없고 길이는 1–30초다. |
| `coverAudio` | ACE만 가능하다. `dir`은 현재 곡 라이브러리 안의 실제 곡 폴더, `strength`는 0.1–1이다. |
| `recording` | ACE만 가능하다. `recording:pick`이 반환한 앱 녹음 경로만 허용한다. |
| YuE 입력 | `mode`, `cot`, `abc`, `advanced`는 레퍼런스의 범위대로 쓴다. macOS Apple Silicon에서는 YuE를 지원하지 않는다. |

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
node cli/road-music.js song:export --json '{"dir":"/absolute/path/from/songs-list","format":"mp3"}' --output "/Users/me/Desktop/song.mp3"
node cli/road-music.js song:srt --json '{"dir":"/absolute/path/from/songs-list"}'
node cli/road-music.js song:save-srt --json '{"title":"비가 그친 골목","text":"1\n00:00:00,000 --> 00:00:01,000\n가사"}' --output "/Users/me/Desktop/song.srt"
node cli/road-music.js album:export --json '{"format":"mp3","minRating":0,"numbered":true}' --output "/Users/me/Desktop/가을 앨범"
```

`song:srt`에서 `save:true`이면 `--output`도 필요하다. `song:export`는 `mp3` 또는 `wav` 파일을, `album:export`는 폴더를 쓴다. 파일 출력은 곡 라이브러리 밖이어야 한다. 이미 있는 파일은 `--overwrite`가 필요하다. 저장 명령은 대상 폴더의 임시 파일에 먼저 만든 뒤 최종 경로로 반영하므로, 실패하면 기존 출력 파일을 보존한다. 명령이 받지 않는 `--input`, `--output`, `--overwrite`와 저장 형식에 맞지 않는 출력 확장자는 오류가 된다.

<a id="toc-7"></a>

## 영상

완성 영상에는 저수준 프레임 명령이 아니라 `video:render`를 쓴다. `tracks`에는 `songs:list`에서 얻은 완료 곡 `dir`을 전달하고 `--output`에는 MP4 파일을 준다.

```bash
node cli/road-music.js video:render --events --json '{"tracks":["/absolute/path/from/songs-list"],"name":"가을 플레이리스트","video":{"resolution":"1080p","fps":30,"renderer":"cpu","background":{"kind":"none"},"spectrum":{"visible":true,"kind":"bars","barCount":32},"eq":{"on":true,"preset":"warm","gains":[3,2,1,0,-1,-2,-3]},"length":{"mode":"once"},"tracklist":{"visible":true},"overlays":[]}}' --output "/Users/me/Desktop/playlist.mp4"
```

`video:preview`는 미리보기를 준비하고, `video:state`, `video:seek`, `video:play`, `video:pause`, `video:chapters`로 제어한다. `video:configure`는 현재 화면 설정을 부분 병합하며 `save:true`일 때 저장한다. `video:cancel`은 준비 단계 또는 렌더 단계에서 보류 상태를 반환할 수 있다. 배경·오버레이는 로컬 `path` 또는 호스트가 없거나 `localhost`인 `file:` URL만 받으며 원격 URL과 Windows UNC 경로는 거부한다. 위치와 크기는 화면 비율 좌표이고 허용 범위는 [레퍼런스](cli-reference.md#video)에 있다. GPU 인코더(`renderer:"gpu"`)의 가용성과 결과는 드라이버·하드웨어에 달려 있다.

<a id="toc-8"></a>

## 연결 끊김과 재시작

`job:wait`은 일시적인 연결 끊김 또는 서비스 재시작 후 남은 대기 시간 안에서만 재연결한다. 생성·재개·악보 렌더·영상 렌더 요청은 중복 실행을 막기 위해 자동 재제출하지 않는다. 이 요청 중 연결이 끊기면 오류에 `uncertain:true`가 붙을 수 있으므로 `service:status`, `queue:list`, `job:wait` 또는 결과 곡 목록으로 처리 여부를 확인한 뒤 사용자가 재시도한다.

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
