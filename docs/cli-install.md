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
- 전체 설치: 앱은 GitHub Releases의 Latest 정식 버전, CLI는 `cli-v*` 정식 Release 중 최고 버전을 각각 확인한다. Node.js 24 LTS, 소스 설치에 필요한 Git, `ffmpeg`·`ffprobe`, CLI 의존성과 지원되는 엔진·모델을 준비한다. 저장공간 관리는 Python 3 표준 `sqlite3`만 사용한다. 첫 등록·게시·추적 시 프로필 데이터 폴더에 `storage.sqlite3`를 만들며, 별도 SQLite 서버·npm 모듈·모델 다운로드가 필요 없다. 작업 폴더의 `.roadmusic/history.sqlite3`는 납품 버전 원장으로 별도로 유지한다. 키트에 동봉된 Road Music 스킬과 지원하는 호스트용 agent 정의도 함께 확인한다. Apple Silicon에서는 ACE와 별도 선택 설치인 `yue-mlx`를 지원한다. YuE2 MLX는 macOS 14.2 이상·32GB 이상 메모리가 필요하고 64GB 이상을 권장하며, M5는 macOS 26.2 이상과 전원 연결이 필요하다. 상세 과정은 [빠른 시작](quickstart.md)과 [YuE2 Apple Silicon](yue-mlx.md)을 따른다.
- CLI만 추가: 기존 CLI 폴더가 없으면 `cli-v*` Release의 `RoadMusic-CLI-X.Y.Z.zip`을 설치한다. 앱의 `/releases/latest` asset을 CLI 키트로 사용하지 않는다. Node.js 24 LTS와 `npm ci --include=dev`로 CLI 실행에 필요한 의존성만 준비한다. `setup:check`가 Python과 표준 `sqlite3`를 확인한다. 기존 GUI와 같은 데이터 폴더를 사용하고, 앱 재설치·업데이트, 엔진·모델 다운로드, 라이브러리 이동, 작업 중단은 하지 않는다. 부족한 엔진·변환 도구는 보고한다.

설치 후 `cli:version`, `cli:update:check`, `schema`, `app:state`, `engines:list`, `projects:list`, `songs:list`, `setup:check`를 순서대로 조회한다. CLI만 추가하는 경우 여기까지로 연결을 검증하며, 새 곡 생성·내보내기는 하지 않는다. 전체 설치의 생성 검증은 새 테스트 프로젝트의 10초 피아노 연주곡으로 하되, **[프롬프트 검토 규칙](music-review.md)에 따라 안을 제시해 승인받거나 전체 자동 위임이 있을 때만 제출**한다. 완료를 기다린 뒤 MP3 파일과 길이를 검증한다. 생성 없이 설치만 요청했다면 상태 조회까지만 한다. 기존 모델로 격리 검증이 필요하면 아래 `setup:test-profile`로 새 프로필을 먼저 만들며, 기존 라이브러리는 공유하지 않는다.

마지막으로 설치 폴더 절대 경로, 어디서든 호출할 수 있는 절대 경로 실행 명령, 준비 상태와 음악 요청 예시를 보고한다. 생성했다면 MP3 경로도 포함하고, 업데이트 확인 방법은 [업데이트 가이드](updates.md)를 안내한다. 다른 프로젝트의 `AGENTS.md`나 `CLAUDE.md`는 덮어쓰지 않는다.

<a id="toc-2"></a>

## GUI(dmg) 설치

1. 받은 `RoadMusic-버전-mac-arm64.dmg`를 연다.
2. `Road Music.app`을 `Applications`로 끌어 놓는다.
3. `/Applications/Road Music.app`을 실행한다.

GUI만 쓸 때는 Node.js가 필요 없다. AI 엔진과 `ffmpeg`/`ffprobe`는 별도이며, 첫 곡 생성 또는 영상 작업 전에 앱의 설치 화면과 `setup:check`로 준비 상태를 확인한다. Apple Silicon용 dmg이며, 서명·공증 상태와 Gatekeeper 안내는 [dmg 패키징](packaging.md)을 따른다.

<a id="toc-3"></a>

## CLI 소스 키트 설치

배포된 `RoadMusic-CLI-X.Y.Z.zip`을 원하는 작업 폴더에 풀면 `RoadMusic-CLI-X.Y.Z` 폴더가 생긴다. `X.Y.Z`는 앱 버전과 다른 CLI 버전이다. 이 키트에는 CLI·Electron·renderer·Python 소스와 `package-lock.json`이 들어 있으며 `node_modules`, AI 모델, 곡 라이브러리, 실행 상태 파일은 넣지 않는다.

현재 소스에서 만드는 CLI 키트와 npm 패키지에는 다음 AI 제작 자료도 함께 들어간다. 과거 버전의 ZIP에는 없을 수 있으므로 실제로 푼 폴더에서 확인한다.

| 함께 설치되는 자료 | 용도 |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md` | 공통 작업 순서, 검토·자동 위임 규칙과 스킬 진입점 |
| `skills/road-music/SKILL.md` | ACE·YuE 공통 작사·검수·생성 절차와 모델별 가이드 선택 |
| `skills/road-music-ace/SKILL.md` | 이전 이름의 호출을 공용 스킬로 연결하는 호환 진입점 |
| `docs/ace-prompt-guide.md`, `docs/vendor/ace-step-1.5/` | ACE 적용 가이드, 공식 원문·LICENSE·해시 |
| `docs/yue-mlx.md` | Apple Silicon YuE2 설치·선택·생성, 메모리·라이선스·검증 한계 |
| `docs/yue-prompt-guide.md`, `docs/vendor/yue2/` | YuE2 공식·MLX 고정 원문, 모델별 입력·EOS·악보·검수·라이선스 근거 |
| `docs/yue-cli-workflow.md` | 고급 샘플링·상세 편성·단계 재사용·악보 전사의 공개 CLI 절차 |
| `docs/lyrics-tags.md`, `docs/music-options.md` | 태그 의미·변환·배치와 실제 CLI 옵션 |
| `docs/genre-prompts.md`, `docs/music-research.md`, `docs/music-review.md` | 장르 예시, 최신 근거 조사, 요청자 검토·결과 자료 |
| `prompts/ace-review.md`, `prompts/cli-workflows.md` | 선택적 검수 에이전트 역할과 실행·내보내기 예시 |
| `skills/road-music-storage/` | 완성본 전용 Output, 프로젝트별 캐시·버전·정리 운영 절차와 지원 host용 agent 정의 |
| `skills/road-music-video-studio/` | HTML 제작실, 음악별 버전·diff·저장공간 화면과 가이드 원문 |

압축을 풀면 위 자료도 같은 키트 루트에 배치된다. `npm ci --include=dev`는 실행 의존성을 준비하는 단계이며 문서를 별도로 다운로드하지 않는다. 키트 내부 상대 경로를 유지해 폴더 전체를 설치한다. 일부 파일만 복사하면 스킬의 참고 링크가 끊어진다.

AI는 `AGENTS.md`가 연결한 **동봉 스킬을 파일로 읽어 사용**한다. 전역 스킬 자동 등록이나 특정 제품의 슬래시 명령 지원을 가정하지 않는다. 외부 프로젝트에서 요청할 때는 [AI 사용 가이드](ai-cli.md)의 절대 경로 읽기를 적용하며, 다른 프로젝트의 지침이나 사용자 전역 스킬을 덮어쓰지 않는다.

```bash
cd "/사용자가 선택한 경로/RoadMusic-CLI-X.Y.Z"
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
- `setup:check`의 `runtime.python`과 `runtime.sqlite`가 모두 `ok:true`여야 버전 이력과 정리 계획을 기록할 수 있다. CLI가 먼저 관리하는 Python을 확인하고, 없으면 시스템 `python3`/Windows `python`을 확인한다. `sqlite3`는 Python 표준 라이브러리이므로 이 검사는 설치를 수행하지 않는다.
- ACE와 YuE2 엔진 모델은 별도 설치다. `engines:list`에 준비 상태가 나오며, 설치를 요청하는 명령은 실제 다운로드와 디스크 사용이 발생하므로 사용자의 요청 범위에서만 쓴다. Apple Silicon YuE2는 `engines:install`의 `id:"yue-mlx"`이며, 기존 `yue`는 Windows NVIDIA용이다.

CLI의 첫 서비스 요청은 이 소스 키트의 Electron을 숨겨진 창으로 시작할 수 있다. 설치된 dmg GUI가 같은 기본 데이터 폴더로 이미 실행 중이면 프로젝트·곡 라이브러리·대기열을 공유한다. 실제 작업과 테스트를 섞지 않는다.

```bash
node cli/road-music.js setup:test-profile \
  --json '{"directory":"/사용자가 선택한 새 절대 경로/road-music-test"}'
```

이 명령은 존재하지 않는 새 폴더에 분리된 `Songs`와 설정만 만듭니다. 기존 runtime·모델은 복사하거나 심볼릭 링크하지 않고 읽기 전용 경로만 고정하며, 서비스 시작·중지, 엔진 설치, 모델 다운로드를 하지 않습니다. 반환된 `env.ROADMUSIC_DATA_DIR`를 다음 테스트 명령에 적용하세요. 기존 앱 데이터, 기존 라이브러리, runtime·엔진·모델 폴더 내부와 symlink 경로는 대상이 될 수 없습니다.

<a id="toc-4"></a>

## 선택: 전역 명령 만들기

소스 키트의 `cli` 하위 폴더에서 연결하면 독립 패키지 `road-music-cli@0.1.0`의 `road-music` 전역 명령을 만들 수 있다.

```bash
cd "/사용자가 선택한 경로/RoadMusic-CLI-X.Y.Z"
cd cli
npm link
cd ..
road-music schema
```

권한 또는 PATH 오류가 나면 `sudo npm link`를 사용하지 않는다. 링크 없이 키트 루트의 `node cli/road-music.js schema`를 실행하면 같은 기능을 쓸 수 있다. 전역 링크는 키트를 이동하거나 지우기 전에 `npm unlink -g road-music-cli`로 해제한다. 과거 루트 패키지로 연결한 `road-music` 링크는 그 패키지의 `npm unlink -g road-music` 절차를 사용한다.

<a id="toc-5"></a>

## 첫 확인과 사용

아래 명령은 상태만 읽고, 새 곡·파일·모델을 만들거나 지우지 않는다.

```bash
node cli/road-music.js app:state
node cli/road-music.js projects:list
node cli/road-music.js songs:list
node cli/road-music.js renderer:catalog
node cli/road-music.js cli:version
node cli/road-music.js cli:update:check
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

## 함께 제공되는 관리 스킬

CLI ZIP은 `skills/music-road-skills`에 같은 배포 기준의 관리 스킬을 포함합니다. Git 소스에서는 `.gitmodules`에 고정한 커밋을 사용합니다. 새 설치는 Node.js 24에서 `npm run setup:cli`로 의존성과 스킬을 준비하고 `skills:status`, `skills:check`로 확인합니다. 기존 CLI를 유지하는 작업에서 설치를 다시 실행하거나 모델을 추가하지 마세요. 앱용 source.zip은 CLI 설치 키트를 대신하지 않으므로 CLI가 필요하면 별도 CLI ZIP을 사용하세요.
