# Road Music CLI 설치

Road Music의 dmg와 CLI는 용도가 다르다. dmg는 Finder에서 쓰는 GUI 앱이고, CLI는 소스 키트 안의 Node.js 명령이다. dmg를 설치해도 전역 `road-music` 명령은 생기지 않는다.

## GUI(dmg) 설치

1. `RoadMusic-1.3.1-mac-arm64.dmg`를 연다.
2. `Road Music.app`을 `Applications`로 끌어 놓는다.
3. `/Applications/Road Music.app`을 실행한다.

GUI만 쓸 때는 Node.js가 필요 없다. AI 엔진과 `ffmpeg`/`ffprobe`는 별도이며, 첫 곡 생성 또는 영상 작업 전에 앱의 설치 화면과 `setup:check`로 준비 상태를 확인한다. Apple Silicon용 dmg이며, 서명·공증 상태와 Gatekeeper 안내는 [dmg 패키징](packaging.md)을 따른다.

## CLI 소스 키트 설치

배포된 `RoadMusic-1.3.1-cli.zip`을 원하는 작업 폴더에 풀면 `RoadMusic-1.3.1-cli` 폴더가 생긴다. 이 키트에는 CLI·Electron·renderer·Python 소스와 `package-lock.json`이 들어 있으며 `node_modules`, AI 모델, 곡 라이브러리, 실행 상태 파일은 넣지 않는다.

```bash
cd "/사용자가 선택한 경로/RoadMusic-1.3.1-cli"
node --version
npm ci --include=dev
node cli/road-music.js schema
node cli/road-music.js setup:check
node cli/road-music.js engines:list
```

- 검증한 CLI 런타임은 Node.js 24 LTS다.
- `npm ci --include=dev`는 키트의 잠금 파일대로 Electron을 포함한 의존성을 설치한다. Electron이 개발 의존성으로 선언되어 있으므로 `NODE_ENV=production` 환경에서도 `--include=dev`를 유지한다. 개발 중이 아니어도 CLI를 쓸 때 한 번 필요하다.
- 첫 설치는 npm 패키지와 Electron 다운로드를 위해 인터넷이 필요하다. 이미 받은 캐시가 있으면 재사용할 수 있다.
- `ffmpeg`와 `ffprobe`는 영상·변환에 필요하다. macOS에서는 `brew install ffmpeg` 후 `setup:check`으로 확인한다.
- ACE 엔진 모델은 별도 설치다. `engines:list`에 준비 상태가 나오며, 설치를 요청하는 명령은 실제 다운로드와 디스크 사용이 발생하므로 사용자의 요청 범위에서만 쓴다.

CLI의 첫 서비스 요청은 이 소스 키트의 Electron을 숨겨진 창으로 시작할 수 있다. 설치된 dmg GUI가 같은 기본 데이터 폴더로 이미 실행 중이면 프로젝트·곡 라이브러리·대기열을 공유한다. 실제 작업과 테스트를 섞지 않는다.

```bash
ROADMUSIC_DATA_DIR="/사용자가 선택한 임시 절대 경로/road-music-test" \
  node cli/road-music.js app:state
```

테스트에서는 `ROADMUSIC_DATA_DIR`로 데이터 폴더를 분리한다. 별도 프로필 운영에도 사용할 수 있다. 비어 있는 새 폴더에는 엔진 설정과 곡이 없으므로 자동으로 기존 라이브러리를 공유하지 않는다.

## 선택: 전역 명령 만들기

소스 키트 안에서만 다음 명령을 실행하면 현재 사용자 계정의 npm 전역 경로에 `road-music` 링크를 만들 수 있다.

```bash
cd "/사용자가 선택한 경로/RoadMusic-1.3.1-cli"
npm link
road-music schema
```

권한 또는 PATH 오류가 나면 `sudo npm link`를 사용하지 않는다. 링크 없이 `node cli/road-music.js schema`를 실행하면 같은 기능을 쓸 수 있다. 전역 링크는 키트를 이동하거나 지우기 전에 `npm unlink -g road-music`으로 해제한다.

## 첫 확인과 사용

아래 명령은 상태만 읽고, 새 곡·파일·모델을 만들거나 지우지 않는다.

```bash
node cli/road-music.js app:state
node cli/road-music.js projects:list
node cli/road-music.js songs:list
node cli/road-music.js renderer:catalog
```

생성과 내보내기, 대기열, 재시도, JSON 출력 형식은 [CLI 사용법](cli.md)을 따른다. 모든 공개 필드·허용값은 [CLI 레퍼런스](cli-reference.md)의 `schema` 결과를 기준으로 한다. 실제 검증 범위와 환경별 제한은 [CLI 검수 결과](cli-qa-report.md)에 있다.

## 문제가 생겼을 때

| 증상 | 확인 순서 |
| --- | --- |
| `electron_unavailable` | 키트 루트에서 `npm ci --include=dev`를 실행했는지 확인한다. |
| 서비스에 연결할 수 없음 | `node cli/road-music.js service:status --no-start` 후 `service:start`를 실행한다. |
| 영상·변환 실패 | `setup:check`에서 `ffmpeg`, `ffprobe` 경로를 확인한다. |
| 엔진 없음·생성 실패 | `engines:list`과 `setup:check`을 읽고, 설치가 필요한지 판단한다. |
| 작업의 실행 여부를 알 수 없음 | 오류의 `uncertain:true`를 확인하고 `service:status`, `queue:list`, `songs:list`, `job:wait`으로 먼저 조회한다. |

`service:stop --confirm`은 진행 중인 생성·설치·렌더를 중단할 수 있다. 정상 종료나 문제 해결을 위해 자동으로 실행하지 않는다.
