# AI 에이전트에서 Road Music CLI 사용하기

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

> 앱·CLI가 설치된 컴퓨터에서 새 AI 세션을 연결하거나, 다른 프로젝트에서 기존 CLI를 사용할 때 읽습니다.

Road Music에는 MCP 서버가 없다. AI 에이전트는 로컬 셸에서 `node cli/road-music.js`를 실행하고 stdout JSON 한 줄과 stderr 이벤트 JSONL을 분리해 읽는다. CLI는 실행 중인 GUI와 같은 로컬 서비스·대기열을 쓸 수 있으므로, 에이전트는 먼저 상태를 읽고 생성·이동·삭제·외부 열기 명령을 요청 범위로 제한해야 한다.

## 목차

- [이미 설치된 CLI로 새 세션 시작](#new-session)
- [필요한 파일](#toc-1)
- [실행 계약](#toc-2)
- [음악 요청 예시 찾기](#toc-3)

<a id="new-session"></a>

## 이미 설치된 CLI로 새 세션 시작

### 복사할 프롬프트

사용자는 설치 경로를 입력하지 않고 아래 프롬프트를 그대로 사용한다. AI가 활성 CLI 기록과 기존 CLI를 탐색하고 `cli/road-music.js`, `AGENTS.md`, 이 문서가 함께 있는 키트 루트를 확인한다. 저장소·앱·CLI는 이미 설치된 상태이므로 새로 clone하거나 설치하지 않는다.

```text
로드뮤직 앱과 CLI는 이미 설치돼 있어. 이 컴퓨터에서 기존 CLI 설치 폴더를 자동으로 찾아줘.
찾은 폴더의 AGENTS.md와 docs/ai-cli.md에 따라 재설치 없이 연결·ACE 준비 상태를 확인해줘.
이후 음악 요청은 동봉 스킬과 공식 가이드로 처리하고, 완성 음원은 docs/cli-motion-graphics.md에 따라 HTML 모션그래픽 작업으로 이어줘.
```

### AI가 준비할 내용

| 순서 | 수행할 일 | 완료 기준 |
| --- | --- | --- |
| 1. 기존 CLI 찾기 | 아래 [자동 탐색 순서](#find-cli)에 따라 활성 CLI 기록·전역 명령·현재 작업 폴더·기존 설치 파일 탐색 | 사용자의 경로 입력 없이 실제 키트 루트와 실행 명령 확보 |
| 2. 지침 연결 | 그 루트의 `AGENTS.md`, 이 문서와 동봉 스킬을 읽고 가사·태그·검토·공식 원문의 위치를 확인 | 다른 프로젝트의 지침을 덮어쓰지 않고 참고 경로 연결 |
| 3. 실행 계약 확인 | `cli:version`, `cli:update:check`, `schema`, `service:status --no-start`로 공개 명령·CLI 버전·현재 서비스 설치본·데이터 폴더 확인 | 실행 파일과 연결 대상이 의도한 설치본인지 확인 |
| 4. 현재 상태 조회 | `app:state`, `engines:list`, `projects:list`, `songs:list`, `setup:check` 순으로 조회 | 엔진 준비 여부·현재 프로젝트·대기 작업과 플랫폼 제외 항목 파악 |
| 5. 준비 결과 보고 | 설치 루트·절대 경로 호출 명령·실제 앱/서비스 버전·엔진 상태·기본 검토 정책 요약 | 새 세션에서 곧바로 음악 요청을 받을 수 있음 |
| 6. 모션그래픽 연결 확인 | `skills:status`로 스킬 설치 상태를 읽고, 음원 생성 뒤 `motion:handoff`로 넘길 경로를 확인 | 이미지·자막·영상 검수를 HTML 스튜디오에서 시작할 수 있음 |

<a id="find-cli"></a>

<details>
<summary><strong>설치 폴더 자동 탐색 순서 — AI용</strong></summary>

1. **활성 CLI 기록:** `ROADMUSIC_CLI_HOME`이 있으면 그 경로의 `current.json`, 없으면 `~/.local/share/road-music/cli/current.json`을 먼저 읽는다. 기록의 `cliPath`가 존재하고 키트 검증을 통과하면 이 경로를 사용한다.
2. **전역 명령:** `road-music`의 실행 위치를 확인한다. macOS·Linux는 `command -v road-music`, Windows는 `Get-Command road-music`을 사용한다. 심볼릭 링크의 실제 경로를 따라가며 npm 실행 래퍼인 경우 `npm root -g` 아래의 `road-music-cli`와 과거 `road-music` 패키지도 확인한다.
3. **현재 작업 폴더:** 작업 폴더와 상위 프로젝트에서 `cli/road-music.js`를 찾는다. `music-road` 저장소나 `RoadMusic-CLI-X.Y.Z` 키트가 후보이며, 폴더 이름만으로 확정하지 않는다.
4. **기존 설치 파일:** macOS는 `mdfind 'kMDItemFSName == "road-music.js"'`로 먼저 찾는다. 검색 결과가 없거나 다른 OS라면 사용자 홈의 프로젝트·다운로드 폴더부터 파일명 `road-music.js`를 검색한다. 필요하면 홈 범위로 넓히되 `.git`, `node_modules`, 가상환경, 캐시·모델·음원 라이브러리는 제외한다. 전역 npm 패키지는 2단계에서 별도로 확인한다.
5. **후보 검증:** 실제 경로 기준으로 중복을 제거하고 `package.json`의 이름 `road-music`, `cli/road-music.js`, `AGENTS.md`, `docs/ai-cli.md`가 함께 있는지 확인한다. 활성 기록이 가리키는 설치본을 우선하고, 지침을 읽은 뒤 `cli:version`, `schema`, `service:status --no-start`로 실행 버전·연결 대상도 점검한다. GUI의 `.app`이나 곡·모델 데이터 폴더를 CLI 키트로 선택하지 않는다.

찾은 절대 경로는 AI가 현재 대화에서 기억하고 후속 명령에 사용한다. 여러 설치본 중 안전하게 선택할 수 없거나 끝내 찾지 못한 경우에만 검색 범위·후보·부족한 파일을 보고한다. 검색 실패를 이유로 설치·업데이트·전역 스킬 등록을 시작하지 않는다.

</details>

렌더·미리보기 등 진행 작업이 있으면 화면 상태를 바꾸는 조회를 섞지 않고 해당 항목을 보류한다. 서비스를 공유 중인 설치본이 예상과 다르거나 필수 실행 환경이 없으면 확인한 상태와 부족한 항목을 보고한다. 연결 실패를 이유로 앱·모델을 재설치하거나 기존 서비스를 강제로 종료하지 않는다.

다른 디렉터리에서는 AI가 자동 탐색으로 찾은 절대 경로로 호출한다. 아래는 호출 구조의 예시이며, 사용자에게 이 경로를 작성하도록 요구하지 않는다.

```bash
node "/absolute/path/to/music-road/cli/road-music.js" schema
node "/absolute/path/to/music-road/cli/road-music.js" service:status --no-start
```

> [!IMPORTANT]
> 세션 준비에는 **음악 생성·테스트 곡·모델 다운로드·업데이트를 포함하지 않는다.** 음악을 요청받은 뒤 공식 가이드와 스킬로 입력을 검증하고, 기본 검토 또는 명시적 전체 자동 위임을 적용한다.

AI는 설치 루트와 실행 명령을 **현재 대화의 문맥**으로 유지한다. 전역 스킬 등록이나 `AGENTS.md`·`CLAUDE.md` 복사를 전제하지 않는다. CLI를 찾지 못했다면 임의의 새 설치 대신 실제 설치 경로만 확인한다.

<a id="toc-1"></a>

## 필요한 파일

| 파일 | 용도 | 자동 적용 |
| --- | --- | --- |
| [`AGENTS.md`](../AGENTS.md) | Codex 등 에이전트의 공통 작업 순서·안전 경계 | 현재 작업 디렉터리 또는 상위 경로에서 세션을 시작할 때 Codex가 읽는다. |
| [`CLAUDE.md`](../CLAUDE.md) | Claude Code가 같은 지침을 재사용하는 진입점 | Claude Code가 프로젝트 메모리를 읽을 때 `@AGENTS.md`를 가져온다. |
| [동봉 작사·생성 스킬](../skills/road-music/SKILL.md) | 태그 선택·프롬프트·기술 검증·요청자 검토·자동 생성 | `AGENTS.md`를 읽은 AI가 요청마다 파일을 읽어 적용한다. 전역 스킬 등록은 전제하지 않는다. |
| [검수 에이전트 역할](../prompts/ace-review.md) | 별도 에이전트가 있을 때 독립 입력 검수 | 선택적 사용. 없으면 동일 항목을 직접 검수한다. |
| [`prompts/cli-workflows.md`](../prompts/cli-workflows.md) | 반복 작업용 프롬프트 5개 | 자동 로드하지 않는다. 작업 시작 전에 명시적으로 읽는다. |
| [CLI 사용법](cli.md)·[레퍼런스](cli-reference.md) | 명령 순서·입력 스키마 | 자동 로드하지 않는다. 실제 요청 전 필요한 부분을 읽는다. |

Codex는 세션 시작 시 프로젝트 루트부터 현재 디렉터리까지 지침을 읽는다. Git 프로젝트가 아니면 현재 디렉터리를 기준으로 한다. 외부 프로젝트에서 Road Music을 제어할 때는 [자동 탐색](#find-cli)으로 확정한 루트의 지침·스킬·필요한 공식 문서를 AI가 절대 경로로 읽는다. 다른 프로젝트의 `AGENTS.md`를 덮어쓰거나 복사하지 않으며, 사용자가 설치 경로를 찾아 입력할 필요도 없다.

Claude Code는 `CLAUDE.md`에서 코드 펜스 밖의 상대 가져오기 문법 `@AGENTS.md`를 지원한다. 이 키트의 `CLAUDE.md`는 그 한 줄만 두어 지침이 서로 어긋나지 않게 한다. 근거: [Codex AGENTS.md 구성](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude Code 메모리와 가져오기](https://code.claude.com/docs/en/memory).

<a id="toc-2"></a>

## 실행 계약

```bash
# AI가 자동 탐색으로 찾은 CLI 폴더에서 실행
node cli/road-music.js schema
node cli/road-music.js app:state
```

- 표준 출력은 최종 JSON 한 줄이다. 진행 상황이 필요하면 `--events`를 주고 표준 오류의 JSONL만 추가로 읽는다.
- `song:generate`, `song:resume`, `song:render` 뒤에는 받은 `jobId`로 `job:wait`을 호출한다. `video:render`는 명령 자체가 렌더 완료를 반환한다.
- `uncertain:true` 오류는 요청이 실제로 접수됐는지 알 수 없다는 뜻이다. 자동 재제출하지 말고 `service:status`, `queue:list`, `songs:list` 또는 `job:wait`을 조회한다.
- `--confirm`, `--overwrite`, `--input`, `--output`은 JSON 안이 아닌 CLI 최상위 플래그다. 경로는 사용자가 고른 절대 경로를 쓴다.
- 음악 생성 뒤 HTML 모션그래픽 작업은 [`skills:*`, `motion:*`](cli-motion-graphics.md)로 연결한다. 스튜디오는 선택·청취·검수 화면을 제공하며, AI 이미지·영상 도구 자체를 CLI가 설치하거나 호출하는 기능은 아니다.
- `about:feedback`, `shell:open`, `about:open`, `update:open-page`, `notices:open`, `song:reveal`, `log:open`은 외부 전송·앱·브라우저 동작을 할 수 있으므로 명시적 요청이 있을 때만 쓴다.
- 세션 첫 연결에서 `cli:version`, `cli:update:check`을 읽기 전용으로 실행한다. 새 CLI가 있으면 현재·최신 버전과 노트·설치 대상만 알린다. 사용자가 업데이트를 요청하거나 자동 업데이트를 명시적으로 위임할 때만 `cli:update:install`을 실행하고, 반환된 `cliPath`에서 버전·스키마·지식 조회를 확인한다. 앱 `update:*`는 앱 업데이트 요청에만 사용한다. [업데이트 가이드](updates.md)를 따른다.

CLI 설치와 환경 점검은 [CLI 설치](cli-install.md), 명령별 상세 계약은 [CLI 레퍼런스](cli-reference.md), 검증된 범위는 [CLI 검수 결과](cli-qa-report.md)를 참고한다.

<a id="toc-3"></a>

## 음악 요청 예시 찾기

CLI가 `prompt:knowledge`를 지원하면 앱을 시작하지 않고 장르 지식을 읽을 수 있다. 우선 목록을 읽고 CCM은 `ccm`, 옛 찬송 리메이크는 `hymn-remake`, 원문 보존·추천은 `review`, 모델별 제작·비교는 `models`를 조회한다. [명령 사용법](cli.md#knowledge)을 따른다. 사용자 가사·프롬프트가 이미 있으면 문서 예시로 바꾸지 않고 미지정 부분만 제안한다. 전처리가 원문과 충돌하면 차이와 근거를 보여주고 승인 없이 수정하지 않는다.

```bash
node cli/road-music.js prompt:knowledge --json '{"topic":"genres"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"hymn-remake"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"models"}'
```

| 필요한 내용 | 문서 |
| --- | --- |
| ACE 생성 전 필수 참고, 공식 원문·프롬프트 최적화 | [ACE 최적화 가이드](ace-prompt-guide.md) · [공식 보관본](vendor/ace-step-1.5/README.md) |
| 모델별 입력·FLOW 조정과 비교, 시험값·길이·ASR·복구 한계 | [모델별 제작·비교](model-production-guide.md) |
| Apple Silicon YuE2 설치·선택·생성, 메모리·라이선스 | [YuE2 Apple Silicon](yue-mlx.md) |
| Verse·Chorus 등 구간 태그, 기본 검토·전체 자동 위임 | [태그 가이드](lyrics-tags.md) · [검토 규칙](music-review.md) |
| 자연어 요청을 지원 옵션으로 바꾸기, JSON 파일 실행 | [음악 생성 옵션](music-options.md) |
| 장르별 상세 요청·한 줄 요청·여성 보컬·여러 곡 | [장르별 프롬프트](genre-prompts.md) |
| 최신 차트·AI 플레이리스트 조사와 창작 가사 | [리서치 기반 음악 만들기](music-research.md) |
| 내보내기·자막·영상·오류 진단 | [작업 프롬프트](../prompts/cli-workflows.md) |

에이전트가 공통 지침과 스킬을 읽은 뒤에는 “한국어 여성 락발라드 1곡, 150초, 피아노와 기타 중심으로 만들어줘”처럼 요청해도 된다. 기본은 검증한 가사·프롬프트를 제시한 뒤 승인받아 생성한다. “가사와 프롬프트까지 전부 자동으로 정해 생성해줘”라고 위임하면 승인 질문 없이 검증·생성하고 음악·사용 가사·최종 옵션·참고 자료·선택 이유를 제공한다. 조사·설정만 요청했다면 생성하지 않는다.

이전 `skills/road-music-ace/SKILL.md` 경로는 공용 `road-music` 스킬로 연결한다. 새 연동은 공용 경로를 사용하며 공식 원문은 선택한 엔진에 맞춰 읽는다.
