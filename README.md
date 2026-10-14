# Road Music

[GitHub 저장소](https://github.com/roadkwonai/music-road) · [최신 버전 다운로드](https://github.com/roadkwonai/music-road/releases/latest)

## AI에게 설치 맡기기

### 처음부터 설치하고 음악 생성까지 준비

아래 프롬프트 전체를 복사해 **로컬 터미널을 실행할 수 있는 Codex·Claude Code 등의 AI**에게 주세요. 음악 생성까지 준비하며, 엔진·모델 다운로드에 수 GB의 공간과 시간이 필요합니다.

```text
https://github.com/roadkwonai/music-road 의 Road Music CLI를 이 컴퓨터에 설치하고
한국어 가사로 음악을 만들 수 있도록 설정해줘.

1. OS·CPU·GPU·여유 공간과 기존 Road Music 설치·진행 작업부터 확인해줘.
   저장소의 README.md, AGENTS.md, docs/quickstart.md, docs/cli-install.md를 읽고 따라줘.
2. 기존 설치가 있으면 재사용하고, 없으면 쓰기 가능한 사용자 폴더에 Git으로 설치해줘.
   GitHub Releases의 최신 정식 버전을 기준으로 하고 설치 경로를 기억해줘.
   Node.js 24 LTS·Git·ffmpeg·ffprobe가 없으면 OS에 맞게 설치하고,
   npm ci --include=dev로 CLI 실행에 필요한 Electron까지 준비해줘. sudo는 사용하지 마.
3. CLI schema, setup:check, app:state, engines:list를 실행해 실제 상태를 확인해줘.
   이 요청은 지원되는 ACE 엔진과 모델의 다운로드·설치도 포함해.
   Apple Silicon에서는 ACE를 사용하고, 지원하지 않는 환경이나 용량 부족은 정확히 알려줘.
4. 기존 곡·모델·설정·대기 작업을 보존해줘. 새 테스트 프로젝트에서 10초 피아노 연주곡을
   한 곡 생성하고 완료까지 기다린 뒤 MP3로 내보내 실제 파일과 길이를 검증해줘.
5. docs/updates.md를 읽고 최신 업데이트 확인 방법도 설정해줘.
   설치 폴더 절대 경로, 실행 명령, 생성한 MP3와 이후 음악 요청 예시를 간단히 알려줘.
   다른 프로젝트의 AGENTS.md나 CLAUDE.md는 덮어쓰지 마.

설치 후에는 내가 원하는 장르·분위기·가사·보컬·길이를 말하면 이 CLI로 곡을 만들어줘.
```

### 로드뮤직이 이미 설치되어 있을 때 CLI만 추가

로드뮤직 앱을 이미 사용 중이라면 아래 프롬프트를 복사하세요. 기존 앱·엔진·모델·곡을 유지하고, AI가 CLI로 제어할 수 있도록 준비합니다. CLI 실행에 필요한 Node.js와 Electron 의존성은 별도로 설치할 수 있습니다.

```text
이 컴퓨터에는 Road Music이 이미 설치되어 있어.
https://github.com/roadkwonai/music-road 의 CLI만 설치해서 기존 로드뮤직을 사용할 수 있게 해줘.

1. OS와 기존 Road Music 앱·CLI 소스 폴더·실행 중인 작업부터 확인해줘.
   저장소의 AGENTS.md, docs/cli-install.md, docs/cli.md,
   docs/cli-reference.md, docs/cli-qa-report.md를 읽고 따라줘.
2. 기존 CLI 소스 폴더가 있으면 재사용하고, 없으면 설치된 앱 버전에 맞는
   GitHub Release의 CLI 소스 키트를 쓰기 가능한 사용자 폴더에 받아줘.
   맞는 키트가 없으면 앱을 임의로 업데이트하지 말고 필요한 조치를 알려줘.
   Node.js 24 LTS가 없으면 설치하고, 키트 폴더에서 npm ci --include=dev로
   CLI 실행에 필요한 Electron까지 준비해줘. sudo는 사용하지 마.
3. node cli/road-music.js schema로 실제 명령을 확인하고,
   app:state, engines:list, projects:list, songs:list, setup:check를 순서대로 조회해줘.
   기존 GUI와 같은 데이터 폴더를 사용해 기존 엔진·모델·곡을 재사용하고,
   기존 설정과 진행·대기 작업은 보존해줘.
4. 앱 재설치·업데이트, 엔진·모델 다운로드, 라이브러리 이동, 작업 중단은 하지 마.
   테스트 곡 생성·내보내기도 하지 말고 조회만으로 연결을 확인해줘.
   ffmpeg·ffprobe나 엔진 등 부족한 항목이 있으면 설치하지 말고 알려줘.
5. CLI 설치 폴더의 절대 경로, 어디서든 호출할 수 있는 절대 경로 실행 명령,
   기존 엔진 준비 상태와 이후 음악 요청 예시를 간단히 알려줘.
   다른 프로젝트의 AGENTS.md나 CLAUDE.md는 덮어쓰지 마.

설치 후에는 내가 음악 작업을 요청할 때 이 CLI와 기존 설치된 엔진을 사용해줘.
```

로컬에서 AI 음악을 만들고 MP3·WAV·가사 자막·플레이리스트 영상으로 내보내는 데스크톱 앱입니다. GUI와 JSON CLI가 같은 엔진·라이브러리·대기열을 사용합니다. Apple Silicon 맥에서 ACE-Step 생성과 CPU/GPU 영상 렌더를 검증했습니다.

## CLI 빠른 시작

Node.js 24와 Git이 필요합니다. 음원 변환·영상에는 `ffmpeg`와 `ffprobe`, 음악 생성에는 별도 엔진 설치가 필요합니다.

```bash
git clone https://github.com/roadkwonai/music-road.git
cd music-road
npm ci --include=dev
node cli/road-music.js schema
node cli/road-music.js setup:check
node cli/road-music.js engines:list
```

`--include=dev`는 CLI 실행에 필요한 Electron을 설치합니다. macOS에서 ffmpeg는 `brew install ffmpeg`로 설치할 수 있습니다. 엔진 준비와 첫 곡 생성은 [빠른 시작 가이드](docs/quickstart.md)를 따르세요.

첫 서비스 요청은 앱을 숨겨진 창으로 시작할 수 있습니다. 실행 중인 GUI가 있으면 공유합니다. 정상 결과는 stdout JSON 한 줄, `--events` 진행 이벤트는 stderr JSONL입니다. 선택적으로 `npm link`를 실행하면 `road-music` 명령을 사용할 수 있습니다.

## AI에서 사용

이 폴더에서 Codex 또는 Claude Code를 시작하고 다음처럼 요청하세요. CLI를 실행할 수 있는 로컬 셸 도구가 필요하며 MCP 서버는 포함하지 않습니다.

```text
AGENTS.md와 docs/quickstart.md, docs/cli.md를 읽어줘.
먼저 CLI 설치와 현재 엔진·프로젝트 상태를 확인해줘.
설치된 ACE로 15초 피아노 연주곡 한 곡을 만들고 완료 결과와 실제 파일 경로를 알려줘.
모델이 없으면 다운로드하지 말고 알려줘. 기존 곡과 대기 작업은 제거하지 마.
```

[AGENTS.md](AGENTS.md)에 공통 규칙을 두고 [CLAUDE.md](CLAUDE.md)가 같은 규칙을 가져옵니다. 다른 프로젝트에서 호출할 때는 지침을 자동으로 읽는다고 가정하지 말고, 설치 폴더의 절대 경로를 알려주세요. 자세한 절차는 [AI 사용 가이드](docs/ai-cli.md), 반복 작업은 [프롬프트 5개](prompts/cli-workflows.md)에 있습니다.

## GUI 실행과 패키징

```bash
npm start          # 소스로 GUI 실행
npm run dist:mac   # Apple Silicon용 DMG
npm run dist:cli   # CLI 소스·지침·문서 ZIP
```

DMG의 앱을 `Applications`로 복사하면 GUI를 사용할 수 있습니다. DMG는 전역 CLI를 설치하지 않습니다. 현재 DMG는 애드혹 서명이며 Apple 공증을 받지 않았습니다. [설치 안내](docs/getting-started.md)와 [패키징 가이드](docs/packaging.md)를 참고하세요.

앱과 CLI 서비스는 GitHub Release의 최신 정식 버전을 시작 시와 15분마다 확인합니다. 새 버전은 앱 우측 상단에 표시됩니다. AI에게 “로드 뮤직 업데이트해줘”라고 요청하거나 CLI로 실행하세요. 자세한 동작과 복구는 [업데이트 가이드](docs/updates.md)에 있습니다.

```bash
node cli/road-music.js update:check --json '{"manual":true}'
node cli/road-music.js update:install --events --timeout 1800000
```

## 문서

| 필요한 내용 | 문서 |
| --- | --- |
| 설치 → 엔진 준비 → 첫 곡 → 내보내기 | [빠른 시작](docs/quickstart.md) |
| DMG·소스 키트·전역 CLI 설치 | [CLI 설치](docs/cli-install.md) |
| AI 지침 적용과 작업 프롬프트 | [AI 사용](docs/ai-cli.md) · [프롬프트](prompts/cli-workflows.md) |
| 새 버전 알림·GUI/CLI 업데이트·Release 배포 | [업데이트](docs/updates.md) |
| 명령 실행 순서·JSON 응답·오류 | [CLI 사용법](docs/cli.md) |
| 공개 명령과 모든 입력 필드 | [CLI 레퍼런스](docs/cli-reference.md) |
| 앱 기능·엔진·구조·외부 통신 | [프로젝트 안내](docs/project-guide.md) · [상세 사용법](docs/guide.md) |
| 테스트 결과와 미검증 범위 | [검수 결과](docs/cli-qa-report.md) |

## 개발과 라이선스

`npm test`로 테스트합니다. 별도 프런트엔드 빌드 단계는 없습니다. `cli/`는 클라이언트, `electron/`는 앱·CLI 서비스, `renderer/`는 화면, `python/`는 음악 워커입니다.

ssokMusic Free 1.3.0을 바탕으로 개발했습니다. 원저작자 고지를 포함한 [MIT LICENSE](LICENSE)를 유지하며, 다운로드하는 엔진·모델에는 각각의 라이선스가 적용됩니다. Windows/Linux·YuE 실제 실행과 마이크 장치 검증 범위는 [검수 결과](docs/cli-qa-report.md#미검증과-남은-한계)를 확인하세요.
