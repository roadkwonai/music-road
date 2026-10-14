# Road Music 빠른 시작

AI나 터미널에서 설치부터 첫 곡 저장까지 진행하는 순서다. 전체 명령은 [CLI 레퍼런스](cli-reference.md), GUI 사용은 [시작하기](getting-started.md)를 참고한다.

## 1. 설치와 지침 읽기

Node.js 24를 준비하고 저장소를 받는다. 배포 CLI ZIP을 쓰는 경우에는 압축을 푼 폴더에서 `npm ci` 단계부터 진행한다.

```bash
git clone https://github.com/roadkwonai/music-road.git
cd music-road
npm ci --include=dev
node cli/road-music.js schema
```

Electron이 개발 의존성으로 선언되어 있어 실행 시에도 `--include=dev`가 필요하다. 처음 설치할 때는 인터넷이 필요하다. macOS의 음원 변환·영상 도구는 `brew install ffmpeg`로 준비한다. 이 패키지는 `ffprobe`도 제공한다.

AI는 먼저 [AGENTS.md](../AGENTS.md)를 읽고 [CLI 사용법](cli.md)을 따른다. Claude Code는 [CLAUDE.md](../CLAUDE.md)의 공통 지침 가져오기를 사용한다. 외부 프로젝트에서 실행할 때는 키트의 절대 경로를 알려야 한다. [AI 사용 가이드](ai-cli.md)에 예시가 있다.

## 2. 상태와 엔진 확인

```bash
node cli/road-music.js setup:check
node cli/road-music.js engines:list
node cli/road-music.js app:state
node cli/road-music.js projects:list
node cli/road-music.js songs:list
```

첫 상태 요청은 숨겨진 서비스를 시작하고 데이터 폴더를 초기화할 수 있다. macOS 기본 폴더는 `~/Library/Application Support/Road Music`이다. GUI와 CLI는 같은 데이터 폴더를 쓰면 곡과 대기열을 공유한다.

Apple Silicon에서는 ACE-Step을 사용한다. 이미 설치됐다면 다음 다운로드 명령을 건너뛴다. 설치되지 않았고 엔진 설치를 진행하려는 경우에만 실행한다. 모델 다운로드에는 시간과 디스크 공간이 필요하다.

```bash
node cli/road-music.js engines:install --events --json '{"id":"ace"}'
```

AI는 사용자가 설치를 요청하지 않았다면 미설치 상태를 보고하고 자동 다운로드하지 않는다. 자세한 준비물은 [CLI 설치](cli-install.md)와 [엔진 설치 안내](getting-started.md)에 있다.

## 3. 프로젝트와 첫 곡

프로젝트 목록에 같은 이름이 있으면 생성 대신 `projects:select`를 사용한다.

```bash
node cli/road-music.js projects:create --json '{"name":"첫 CLI 음악"}'
node cli/road-music.js song:generate --events --wait --json '{"title":"따뜻한 피아노","engine":"ace","style":"warm ambient piano, gentle and calm","instrumental":true,"targetSeconds":15,"seed":42}'
```

`--wait`은 생성 완료까지 기다린다. 성공 응답의 `result.songs[0].song`에 실제 `jobId`, `dir`, `audio`가 있다. 실패 응답의 작업별 결과는 `error.details.songs`에서 확인한다.

대기 없이 제출했다면 반환된 작업 ID로 조회한다. 아래 `JOB_ID`는 실제 응답으로 바꾼다.

```bash
node cli/road-music.js job:wait --events --json '{"jobId":"JOB_ID","timeoutMs":3600000}'
```

시간 초과는 생성 자체를 취소하지 않는다. 연결 오류에 `uncertain:true`가 있으면 중복 제출하지 말고 `service:status`, `queue:list`, `songs:list`과 작업 결과를 먼저 확인한다.

## 4. MP3와 영상 저장

아래 예시의 `/absolute/path/from/songs-list`는 완료 곡 응답의 `dir`로 바꾸고, 출력 파일도 실제 절대 경로로 지정한다. 출력은 곡 라이브러리 밖에 저장한다.

```bash
node cli/road-music.js song:export --json '{"dir":"/absolute/path/from/songs-list","format":"mp3"}' --output "/Users/me/Music/exports/piano.mp3"
node cli/road-music.js video:render --events --json '{"tracks":["/absolute/path/from/songs-list"],"name":"피아노 영상","video":{"resolution":"720p","fps":30,"renderer":"cpu","background":{"kind":"none"},"spectrum":{"visible":true,"kind":"bars","barCount":32},"length":{"mode":"once"}}}' --output "/Users/me/Music/exports/piano.mp4"
```

영상 명령은 자체적으로 렌더 완료를 반환하므로 `--wait`을 붙이지 않는다. 기존 출력 파일은 기본적으로 덮어쓰지 않는다. 결과 파일 경로와 성공 JSON을 확인한다. 여러 곡의 앨범·SRT·영상 작업은 [작업 프롬프트](../prompts/cli-workflows.md)를 참고한다.

## 5. 계속 사용하거나 문제 진단

- 공개된 모든 입력 필드는 `schema`, `명령 --help`, [레퍼런스](cli-reference.md)로 확인한다.
- 같은 renderer 작업은 한 번에 하나만 실행한다. 렌더 중 프로젝트·언어·곡 상태를 변경하지 않는다.
- 삭제·대기열 비우기·데이터 이동·강제 종료의 `--confirm`은 그 작업이 요청된 경우에만 사용한다.
- 외부 피드백 전송과 브라우저 열기는 별도 요청이 있을 때만 실행한다.
- 설치 문제는 [CLI 설치의 문제 해결](cli-install.md#문제가-생겼을-때), 오류 JSON과 배치는 [CLI 사용법](cli.md)을 따른다.

실제 검증 환경과 기능별 제한은 [검수 결과](cli-qa-report.md)에 있다. DMG·CLI ZIP을 직접 만들려면 [패키징](packaging.md)을 참고한다.
