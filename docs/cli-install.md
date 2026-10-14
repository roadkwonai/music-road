# Road Music CLI 설치

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

Road Music의 dmg와 CLI는 용도가 다르다. dmg는 Finder에서 쓰는 GUI 앱이고, CLI는 소스 키트 안의 Node.js 명령이다. dmg를 설치해도 전역 `road-music` 명령은 생기지 않는다.

> [!IMPORTANT]
> CLI만 추가할 때는 앱·엔진·모델·기존 곡을 바꾸지 않는다. 설치 범위는 아래 “AI에게 설치를 맡길 때” 절을 따른다.

## 목차

- [AI에게 설치를 맡길 때](#toc-1)
- [GUI(dmg) 설치](#toc-2)
- [CLI 소스 키트 설치](#toc-3)
- [선택: 전역 명령 만들기](#toc-4)
- [첫 확인과 사용](#toc-5)
- [문제가 생겼을 때](#toc-6)

<a id="toc-1"></a>

## AI에게 설치를 맡길 때

먼저 [AGENTS.md](../AGENTS.md)를 읽고, 요청 범위에 따라 아래 절차를 적용한다.

- 공통: OS·CPU·GPU·여유 공간, 기존 앱·CLI·진행 작업을 확인한다. 기존 설치를 우선 재사용하고 곡·모델·설정·대기 작업과 로컬 수정을 보존한다. 필요한 파일은 쓰기 가능한 사용자 폴더에 설치하고 `sudo`는 사용하지 않는다.
- 전체 설치: 새 설치는 GitHub Releases의 최신 정식 버전을 기준으로 한다. Node.js 24 LTS, 소스 설치에 필요한 Git, `ffmpeg`·`ffprobe`, CLI 의존성과 지원되는 엔진·모델을 준비한다. Apple Silicon에서는 ACE를 사용하며, 지원하지 않는 환경이나 공간 부족은 보고한다. 상세 과정은 [빠른 시작](quickstart.md)을 따른다.
- CLI만 추가: 기존 CLI 폴더가 없으면 설치된 앱 버전에 맞는 Release의 CLI 소스 키트를 받는다. 호환되는 키트가 없으면 앱을 임의로 업데이트하지 말고 필요한 조치를 보고한다. Node.js 24 LTS와 `npm ci --include=dev`로 CLI 실행에 필요한 의존성만 준비한다. 기존 GUI와 같은 데이터 폴더를 사용하고, 앱 재설치·업데이트, 엔진·모델 다운로드, 라이브러리 이동, 작업 중단은 하지 않는다. 부족한 엔진·변환 도구는 보고한다.

설치 후 `schema`로 실제 명령을 확인하고 `app:state`, `engines:list`, `projects:list`, `songs:list`, `setup:check`를 순서대로 조회한다. CLI만 추가하는 경우 여기까지로 연결을 검증하며, 새 곡 생성·내보내기는 하지 않는다. 전체 설치의 생성 검증은 새 테스트 프로젝트의 10초 피아노 연주곡으로 하되, **[프롬프트 검토 규칙](music-review.md)에 따라 안을 제시해 승인받거나 전체 자동 위임이 있을 때만 제출**한다. 완료를 기다린 뒤 MP3 파일과 길이를 검증한다. 생성 없이 설치만 요청했다면 상태 조회까지만 한다. 기존 라이브러리와 분리한 테스트는 `ROADMUSIC_DATA_DIR`로 임시 데이터 폴더를 지정하고 기존 모델을 재사용한다.

마지막으로 설치 폴더 절대 경로, 어디서든 호출할 수 있는 절대 경로 실행 명령, 준비 상태와 음악 요청 예시를 보고한다. 생성했다면 MP3 경로도 포함하고, 업데이트 확인 방법은 [업데이트 가이드](updates.md)를 안내한다. 다른 프로젝트의 `AGENTS.md`나 `CLAUDE.md`는 덮어쓰지 않는다.

<a id="toc-2"></a>

## GUI(dmg) 설치

1. 받은 `RoadMusic-버전-mac-arm64.dmg`를 연다.
2. `Road Music.app`을 `Applications`로 끌어 놓는다.
3. `/Applications/Road Music.app`을 실행한다.

GUI만 쓸 때는 Node.js가 필요 없다. AI 엔진과 `ffmpeg`/`ffprobe`는 별도이며, 첫 곡 생성 또는 영상 작업 전에 앱의 설치 화면과 `setup:check`로 준비 상태를 확인한다. Apple Silicon용 dmg이며, 서명·공증 상태와 Gatekeeper 안내는 [dmg 패키징](packaging.md)을 따른다.

<a id="toc-3"></a>

## CLI 소스 키트 설치

배포된 `RoadMusic-버전-cli.zip`을 원하는 작업 폴더에 풀면 `RoadMusic-버전-cli` 폴더가 생긴다. `버전`은 실제 받은 Release의 버전으로 바꾼다. 이 키트에는 CLI·Electron·renderer·Python 소스와 `package-lock.json`이 들어 있으며 `node_modules`, AI 모델, 곡 라이브러리, 실행 상태 파일은 넣지 않는다.

현재 소스에서 만드는 CLI 키트와 npm 패키지에는 다음 AI 제작 자료도 함께 들어간다. 과거 버전의 ZIP에는 없을 수 있으므로 실제로 푼 폴더에서 확인한다.

| 함께 설치되는 자료 | 용도 |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md` | 공통 작업 순서, 검토·자동 위임 규칙과 스킬 진입점 |
| `skills/road-music-ace/SKILL.md` | 작사·프롬프트·검증·검토·생성·근거 보고 워크플로 |
| `docs/ace-prompt-guide.md`, `docs/vendor/ace-step-1.5/` | ACE 적용 가이드, 공식 원문·LICENSE·해시 |
| `docs/lyrics-tags.md`, `docs/music-options.md` | 태그 의미·변환·배치와 실제 CLI 옵션 |
| `docs/genre-prompts.md`, `docs/music-research.md`, `docs/music-review.md` | 장르 예시, 최신 근거 조사, 요청자 검토·결과 자료 |
| `prompts/ace-review.md`, `prompts/cli-workflows.md` | 선택적 검수 에이전트 역할과 실행·내보내기 예시 |

압축을 풀면 위 자료도 같은 키트 루트에 배치된다. `npm ci --include=dev`는 실행 의존성을 준비하는 단계이며 문서를 별도로 다운로드하지 않는다. 키트 내부 상대 경로를 유지해 폴더 전체를 설치한다. 일부 파일만 복사하면 스킬의 참고 링크가 끊어진다.

AI는 `AGENTS.md`가 연결한 **동봉 스킬을 파일로 읽어 사용**한다. 전역 스킬 자동 등록이나 특정 제품의 슬래시 명령 지원을 가정하지 않는다. 외부 프로젝트에서 요청할 때는 [AI 사용 가이드](ai-cli.md)의 절대 경로 읽기를 적용하며, 다른 프로젝트의 지침이나 사용자 전역 스킬을 덮어쓰지 않는다.

```bash
cd "/사용자가 선택한 경로/RoadMusic-버전-cli"
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

<a id="toc-4"></a>

## 선택: 전역 명령 만들기

소스 키트 안에서만 다음 명령을 실행하면 현재 사용자 계정의 npm 전역 경로에 `road-music` 링크를 만들 수 있다.

```bash
cd "/사용자가 선택한 경로/RoadMusic-버전-cli"
npm link
road-music schema
```

권한 또는 PATH 오류가 나면 `sudo npm link`를 사용하지 않는다. 링크 없이 `node cli/road-music.js schema`를 실행하면 같은 기능을 쓸 수 있다. 전역 링크는 키트를 이동하거나 지우기 전에 `npm unlink -g road-music`으로 해제한다.

<a id="toc-5"></a>

## 첫 확인과 사용

아래 명령은 상태만 읽고, 새 곡·파일·모델을 만들거나 지우지 않는다.

```bash
node cli/road-music.js app:state
node cli/road-music.js projects:list
node cli/road-music.js songs:list
node cli/road-music.js renderer:catalog
```

생성과 내보내기, 대기열, 재시도, JSON 출력 형식은 [CLI 사용법](cli.md)을 따른다. 모든 공개 필드·허용값은 [CLI 레퍼런스](cli-reference.md)의 `schema` 결과를 기준으로 한다. 실제 검증 범위와 환경별 제한은 [CLI 검수 결과](cli-qa-report.md)에 있다.

<a id="toc-6"></a>

## 문제가 생겼을 때

| 증상 | 확인 순서 |
| --- | --- |
| `electron_unavailable` | 키트 루트에서 `npm ci --include=dev`를 실행했는지 확인한다. |
| 서비스에 연결할 수 없음 | `node cli/road-music.js service:status --no-start` 후 `service:start`를 실행한다. |
| 영상·변환 실패 | `setup:check`에서 `ffmpeg`, `ffprobe` 경로를 확인한다. |
| 엔진 없음·생성 실패 | `engines:list`과 `setup:check`을 읽고, 설치가 필요한지 판단한다. |
| 작업의 실행 여부를 알 수 없음 | 오류의 `uncertain:true`를 확인하고 `service:status`, `queue:list`, `songs:list`, `job:wait`으로 먼저 조회한다. |

`service:stop --confirm`은 진행 중인 생성·설치·렌더를 중단할 수 있다. 정상 종료나 문제 해결을 위해 자동으로 실행하지 않는다.
