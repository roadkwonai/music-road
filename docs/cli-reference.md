# Road Music CLI 레퍼런스

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

이 문서는 `electron/cli-catalog.js`와 `electron/cli-transport.js`의 공개 스키마를 사람이 읽기 좋게 정리한 목록이다. 실행 중인 버전에서 `node cli/road-music.js schema`를 실행한 결과가 최종 기준이다. 내부 프레임·픽셀 전송 명령은 공개 API가 아니므로 포함하지 않는다.

## 목차

- [표기](#toc-1)
- [공통 입력 모양](#toc-2)
- [서비스·설치·프로젝트](#toc-3)
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

`genre:str≤2000`, `instruments:instrument[]≤3`, `bpm:int 40..220 | null`, `strict:bool`, `strong:bool`, `instrumental:bool`, `structure:"" | "pop" | "short" | "theme" | "loop"`.

### `advanced`

`temperature:0.05..5`, `topP:0.05..1`, `topK:int 1..500`, `repetitionPenalty:1..2`, `cfgScale:1..20`, `abcTemperature:0.05..5`, `abcMaxTokens:int 256..4096`, `odeSteps:int 8..64`, `maxTokens:int 500..9000`, `minTokens:int 0..8800`.

### `video`

모든 하위 필드는 선택 사항이며 부분 객체도 허용한다.

| 필드 | 형식 |
| --- | --- |
| `source` | `selected`, `checked`, `project` |
| `background` | `kind: none/image/video`, `path:path|null`, `url:file: URL|null`, `name:str≤200` |
| `length` | `mode: once/repeat/minutes`, `count:int 1..1000`, `minutes:int 1..600` |
| `resolution`, `fps`, `renderer` | `720p/1080p/1440p/2160p`, `30/60`, `gpu/cpu` |
| `spectrum` | `visible:bool`, `kind: bars/mirror/line/circle`, `symmetric:bool`, `layout:left/center/right|null`, `barCount:8/16/24/32/48/64/96/128`, `position:bottom/center/free`, `cx`,`cy:num -0.5..1.5|null`, `size:0.03..0.9`, `width:0.05..1.5`, `color1`,`color2:#RRGGBB`, `glow:0..1`, `gain:0.3..3`, `dim:0..1` |
| `eq` | `on:bool`, `preset:flat/bass/vocal/treble/warm/clear/dance/lofi/custom`, `gains:num -10..10[7]`(순서: 60, 150, 400, 1,000, 3,000, 8,000, 16,000 Hz) |
| `overlays` | `id:str≤200`, `path:path`, `name:str≤200`, `url:file: URL|null`, `x`,`y:num -0.5..1.5`, `w:0.02..2`, `ar:0.01..100`(height/width), `opacity:0..1`, `start:num≥0`, `end:num≥0|null` |
| `tracklist` | `visible:bool`, `cx`,`cy:num -0.5..1.5|null`, `w`,`h:num 0..1|null`, `title:str≤100`, `color`,`accent:#RRGGBB`, `bg:0..1` |

`background.url`도 `file:` URL 또는 `null`만 허용한다. `file:` URL의 호스트는 없거나 `localhost`여야 하며, Windows UNC 경로와 원격 URL은 허용하지 않는다. `path`가 있으면 로컬 파일 URL로 변환해 사용한다.

### `preset`

`name:str 1..40` **필수**, `style:str≤2000`, `instrumental:bool`, `parts:parts`, `folder:str≤30`.

### `instrument`

`piano`, `acoustic guitar`, `classical guitar`, `electric guitar`, `bass guitar`, `upright bass`, `drums`, `brushed drums`, `percussion`, `violin`, `viola`, `cello`, `string ensemble`, `harp`, `flute`, `clarinet`, `oboe`, `saxophone`, `trumpet`, `trombone`, `french horn`, `brass section`, `pipe organ`, `Rhodes electric piano`, `synthesizer`, `synth pads`, `celesta`, `glockenspiel`, `sleigh bells`, `music box`, `marimba`, `vibraphone`, `ukulele`, `mandolin`, `harmonica`, `accordion`, `orchestra`.

<a id="toc-3"></a>

## 서비스·설치·프로젝트

| 명령 | 필수 | 선택 | 입력/출력·효과 |
| --- | --- | --- | --- |
| `app:state` | — | — | 앱 상태 |
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
| `setup:check`, `setup:location`, `setup:run` | — | — | 초기 설정 조회/실행 |
| `setup:pick-location` | — | — | 출력 폴더 선택: `--output DIR` |
| `engines:list`, `engines:skip` | — | — | 엔진 상태/건너뛰기 |
| `engines:install` | `id:ace/yue` | — | 모델 설치 |
| `system:stats` | — | — | RAM·GPU 메모리·생성 상태 |
| `projects:list` | — | — | 프로젝트 목록 |
| `projects:select`, `projects:create` | `name:path` | — | 프로젝트 선택/생성 |
| `projects:rename` | `from:path`, `to:path` | — | 이름에는 경로 구분자 불가 |

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
| `song:resume` | `dir:path` | — | 작업 시작; `--wait` 가능 |
| `song:cancel` | `jobId:path` | — | 현재 생성 작업만 취소 |
| `song:detail`, `song:clone`, `song:srt` | — | `dir:path`, `id:path`, `folder:path`; clone은 `apply:bool`, srt는 `save:bool` | 셋 중 하나가 실제로 필요. `save:true`이면 `--output FILE` |
| `song:lrc`, `song:score` | `dir:path` | — | LRC/ABC 반환 |
| `song:render` | `dir:path`, `abc:str 1..100000` | `title:str≤200` | 작업 시작; `--wait` 가능 |
| `score:check` | `text:str≤100000` | — | ABC 검사 |
| `score:open` | — | — | 입력 파일: `--input FILE` |
| `score:convert` | `choice` | — | `choice.vocal:str≤200`, `choice.ins:str≤200`, `choice.chords:bool` |
| `song:delete` † | `dir:path` | — | 곡 삭제 |
| `song:rename` | `dir:path`, `title:path` | — | 제목 변경 |
| `song:reveal` | `dir:path` | — | 파일 관리자 열기 |
| `song:background` | `dir:path` | — | 입력 파일: `--input FILE` |
| `song:background-clear` | `dir:path` | — | 곡별 배경 제거 |
| `song:save-srt` | `title:str≤200`, `text:str≤200000` | `save:bool` | `--output FILE` 필수 |
| `song:export` | `dir:path` | `title:str≤200`, `format:mp3/wav` | `--output FILE` 필수 |
| `album:export` | — | `format:mp3/wav`, `minRating:int 0..5`, `numbered:bool`, `dirs:abs-path[]` | `--output DIR`; `dirs`를 주면 그 곡만, 없으면 현재 프로젝트의 완료 곡 |

### `song:generate` 필드

필드별 실제 효과·우선순위·엔진 차이와 복사 가능한 JSON은 [음악 생성 옵션](music-options.md), 장르별 요청은 [프롬프트 모음](genre-prompts.md)을 참고한다.

`title:str≤200`, `style:str≤2000`, `lyrics:str≤20000`, `engine:ace/yue`(기본 `ace`), `count:int 1..8`, `instrumental:bool`, `soundEffect:bool`, `targetSeconds:num 1..600|null`, `seed:int 0..2147483647|null`, `mode:song/plan`, `cot:full/melody/off`, `abc:str≤100000`, `advanced:advanced`, `parts:parts`, `coverAudio:{dir:abs-path, title:str≤200, strength:0.1..1}|null`, `recording:{path:abs-path, strength:0.1..1, targetSeconds:int 0..600}|null`, `bpm:int 40..220`.

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
| `prompt:knowledge` | — | `topic:genres\|ccm\|hymn-remake\|ace\|lyrics\|review` | 생략 시 번들 지식 목록, 지정 시 UTF-8 원문·출처·호환 `version`(앱 버전)·`appVersion`·`cliVersion`·보존 정책. 로컬 CLI는 앱을 시작하지 않음 |
| `lyrics:clean`, `lyrics:sections`, `lyrics:numbers` | — | `text:str≤20000` | 가사 변환 |
| `lyrics:check` | — | `text:str≤20000`, `targetSeconds:num 1..3600|null` | 가사 검사 |
| `prompt:compose` | — | `parts`의 모든 필드, `lyrics:str≤20000`, `soundEffect:bool` | 스타일 문장 생성 |
| `player:play` | — | `dir:path`, `id:path`, `folder:path` | 완료 곡 재생 |
| `player:pause`, `player:next`, `player:previous`, `player:state`, `player:stop` | — | — | 미니 플레이어 제어 |
| `player:seek` | `seconds:num 0..86400` | — | 재생 위치 |
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
