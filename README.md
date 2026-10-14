# Road Music

[GitHub 저장소](https://github.com/roadkwonai/music-road) · [최신 버전 다운로드](https://github.com/roadkwonai/music-road/releases/latest)

## 목차

- [AI에게 설치 맡기기](#toc-1)
- [CLI 빠른 시작](#toc-2)
- [AI에서 사용](#toc-3)
- [GUI 실행과 패키징](#toc-4)
- [문서](#toc-5)
- [개발과 라이선스](#toc-6)

<a id="toc-1"></a>

## AI에게 설치 맡기기

### 처음부터 설치하고 음악 생성까지 준비

**로컬 터미널을 실행할 수 있는 Codex·Claude Code 등의 AI**에게 아래 프롬프트를 주세요. 엔진·모델 다운로드에 수 GB의 공간과 시간이 필요합니다.

```text
https://github.com/roadkwonai/music-road 의 AGENTS.md와 설치 지침을 따라
로드뮤직 CLI와 엔진·모델까지 설치하고 한국어 음악 생성이 가능하도록 준비해줘.
설치 검증 후에는 내가 요청하는 음악 작업을 이 CLI로 실행해줘.
```

### 로드뮤직이 이미 설치되어 있을 때 CLI만 추가

기존 로드뮤직에 CLI만 추가하려면 아래 프롬프트를 사용하세요.

```text
https://github.com/roadkwonai/music-road 의 AGENTS.md와 설치 지침을 따라
이미 설치된 로드뮤직에 CLI만 추가하고 연결을 확인해줘.
이후 내가 요청하는 음악 작업을 이 CLI로 실행해줘.
```

로컬에서 AI 음악을 만들고 MP3·WAV·가사 자막·플레이리스트 영상으로 내보내는 데스크톱 앱입니다. GUI와 JSON CLI가 같은 엔진·라이브러리·대기열을 사용합니다. Apple Silicon 맥에서 ACE-Step 생성과 CPU/GPU 영상 렌더를 검증했습니다.

<a id="toc-2"></a>

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

<a id="toc-3"></a>

## AI에서 사용

이 폴더에서 Codex 또는 Claude Code를 시작하고 다음처럼 요청하세요. CLI를 실행할 수 있는 로컬 셸 도구가 필요하며 MCP 서버는 포함하지 않습니다. AI는 `AGENTS.md`의 공통 지침을 따릅니다.

기본은 **가사·프롬프트 검토 후 생성**입니다. 가사와 프롬프트까지 모두 자동으로 맡기면 검토를 생략하고 생성한 뒤 음악·가사·최종 옵션·참고 근거를 제공합니다. 공식 가이드·참고 문서·작사 스킬·검수 역할은 CLI 키트에 함께 들어 있습니다.

```text
한국어 가사로 K-POP·트로트·애절한 락발라드를 각각 1곡씩 만들어줘.
완료된 음원과 가사, 적용 옵션을 보여줘.
```

```text
여성 보컬의 락발라드와 애절한 발라드를 한국어 창작 가사로 각각 1곡 만들어줘.
150초 안팎으로 만들고 여기서 들을 수 있게 가져와줘.
```

```text
docs/music-research.md를 따라 최근 인기 있는 AI 플레이리스트 음악을 조사해서
스타일 하나를 고르고 한국어 가사·프롬프트를 작성해 CLI로 1곡 만들어줘.
```

```text
가사와 프롬프트까지 모두 자동으로 정해 한국어 여성 락발라드 1곡을 생성해줘.
완료 후 음악·가사·최종 옵션과 참고 자료·선택 이유도 보여줘.
```

| 원하는 작업 | 상세 가이드 |
| --- | --- |
| ACE 공식 문서 기반 프롬프트·가사·옵션 점검 | [ACE 최적화 가이드](docs/ace-prompt-guide.md) |
| Verse·Chorus 등 태그의 의미·배치·실제 처리 | [가사 태그 가이드](docs/lyrics-tags.md) |
| 기본 검토와 전체 자동 위임, AI 작사·생성 | [검토 규칙](docs/music-review.md) · [동봉 스킬](skills/road-music-ace/SKILL.md) |
| 보컬·악기·BPM·길이·seed·고급 설정, 실행 가능한 JSON | [음악 생성 옵션](docs/music-options.md) |
| K-POP·트로트·여성 락발라드·카페 BGM 등 간단/상세 요청 | [장르별 프롬프트](docs/genre-prompts.md) |
| 최신 차트·AI 플레이리스트 조사 → 가사·옵션 → 곡 생성 | [리서치 기반 음악 만들기](docs/music-research.md) |

[AGENTS.md](AGENTS.md)에 공통 규칙을 두고 [CLAUDE.md](CLAUDE.md)가 같은 규칙을 가져옵니다. 다른 프로젝트에서 호출할 때는 설치 폴더의 절대 경로를 알려주고 그 안의 지침을 읽도록 요청하세요. 자세한 절차는 [AI 사용 가이드](docs/ai-cli.md), 내보내기·오류 진단은 [작업 프롬프트](prompts/cli-workflows.md)에 있습니다. 채팅의 오디오 첨부가 지원되지 않으면 실제 파일 링크로 받습니다.

<a id="toc-4"></a>

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

<a id="toc-5"></a>

## 문서

| 필요한 내용 | 문서 |
| --- | --- |
| 설치 → 엔진 준비 → 첫 곡 → 내보내기 | [빠른 시작](docs/quickstart.md) |
| DMG·소스 키트·전역 CLI 설치 | [CLI 설치](docs/cli-install.md) |
| AI 지침 적용과 작업 프롬프트 | [AI 사용](docs/ai-cli.md) · [프롬프트](prompts/cli-workflows.md) |
| 생성 옵션·JSON 예시·보컬·악기·가사 | [음악 생성 옵션](docs/music-options.md) |
| ACE 생성 전 필수 참고·공식 문서 원문 | [ACE 최적화](docs/ace-prompt-guide.md) · [공식 보관본](docs/vendor/ace-step-1.5/README.md) |
| 가사 구간 태그·검토와 자동 생성·동봉 스킬 | [태그](docs/lyrics-tags.md) · [검토](docs/music-review.md) · [스킬](skills/road-music-ace/SKILL.md) |
| 장르별 한 줄 요청·상세 레시피·여러 곡 비교 | [장르별 프롬프트](docs/genre-prompts.md) |
| 최신 스타일 조사·출처·창작 가사·생성 | [리서치 기반 음악 만들기](docs/music-research.md) |
| 새 버전 알림·GUI/CLI 업데이트·Release 배포 | [업데이트](docs/updates.md) |
| 명령 실행 순서·JSON 응답·오류 | [CLI 사용법](docs/cli.md) |
| 공개 명령과 모든 입력 필드 | [CLI 레퍼런스](docs/cli-reference.md) |
| 앱 기능·엔진·구조·외부 통신 | [프로젝트 안내](docs/project-guide.md) · [상세 사용법](docs/guide.md) |
| 테스트 결과와 미검증 범위 | [검수 결과](docs/cli-qa-report.md) |

<a id="toc-6"></a>

## 개발과 라이선스

`npm test`로 테스트합니다. 별도 프런트엔드 빌드 단계는 없습니다. `cli/`는 클라이언트, `electron/`는 앱·CLI 서비스, `renderer/`는 화면, `python/`는 음악 워커입니다.

ssokMusic Free 1.3.0을 바탕으로 개발했습니다. 원저작자 고지를 포함한 [MIT LICENSE](LICENSE)를 유지하며, 다운로드하는 엔진·모델에는 각각의 라이선스가 적용됩니다. Windows/Linux·YuE 실제 실행과 마이크 장치 검증 범위는 [검수 결과](docs/cli-qa-report.md#미검증과-남은-한계)를 확인하세요.
