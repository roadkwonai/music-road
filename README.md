# Road Music

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

## 문서

| 필요한 내용 | 문서 |
| --- | --- |
| 설치 → 엔진 준비 → 첫 곡 → 내보내기 | [빠른 시작](docs/quickstart.md) |
| DMG·소스 키트·전역 CLI 설치 | [CLI 설치](docs/cli-install.md) |
| AI 지침 적용과 작업 프롬프트 | [AI 사용](docs/ai-cli.md) · [프롬프트](prompts/cli-workflows.md) |
| 명령 실행 순서·JSON 응답·오류 | [CLI 사용법](docs/cli.md) |
| 공개 명령과 모든 입력 필드 | [CLI 레퍼런스](docs/cli-reference.md) |
| 앱 기능·엔진·구조·외부 통신 | [프로젝트 안내](docs/project-guide.md) · [상세 사용법](docs/guide.md) |
| 테스트 결과와 미검증 범위 | [검수 결과](docs/cli-qa-report.md) |

## 개발과 라이선스

`npm test`로 테스트합니다. 별도 프런트엔드 빌드 단계는 없습니다. `cli/`는 클라이언트, `electron/`는 앱·CLI 서비스, `renderer/`는 화면, `python/`는 음악 워커입니다.

ssokMusic Free 1.3.0을 바탕으로 개발했습니다. 원저작자 고지를 포함한 [MIT LICENSE](LICENSE)를 유지하며, 다운로드하는 엔진·모델에는 각각의 라이선스가 적용됩니다. Windows/Linux·YuE 실제 실행과 마이크 장치 검증 범위는 [검수 결과](docs/cli-qa-report.md#미검증과-남은-한계)를 확인하세요.
