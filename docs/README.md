# Road Music 문서 지도

[Road Music](../README.md) · [릴리스 노트](../releases/README.md) · [최신 다운로드](https://github.com/roadkwonai/music-road/releases/latest)

원하는 작업부터 고르세요. **처음 설치 → AI 세션 연결 → 음악 설계 → 생성·내보내기** 순서로 읽을 수 있습니다.

## 목차

- [시작과 설치](#start)
- [AI로 음악 만들기](#create)
- [CLI와 앱 레퍼런스](#reference)
- [업데이트와 릴리스](#release)
- [검증과 지원 범위](#verification)
- [공식 원문과 작성 원칙](#sources)

<a id="start"></a>

## 시작과 설치

| 현재 상황 | 읽을 문서 | 얻게 되는 것 |
| --- | --- | --- |
| 처음 설치하거나 CLI를 추가함 | [CLI 설치](cli-install.md) | 앱·소스 키트·전역 명령의 차이와 설치 순서 |
| 앱·CLI는 있고 새 AI에서 사용함 | [새 AI 세션 연결](ai-cli.md#new-session) | 재설치 없이 기존 CLI·엔진·라이브러리에 연결 |
| CLI로 첫 곡을 완성하고 싶음 | [빠른 시작](quickstart.md) | 상태 점검 → 가사·프로젝트 → 생성 → 저장 |
| GUI로 먼저 사용하고 싶음 | [시작하기](getting-started.md) | DMG 설치·엔진 준비·첫 곡·영상 |

> [!TIP]
> 이미 설치했다면 설치 프롬프트를 반복하지 마세요. [README의 새 세션 프롬프트](../README.md#이미-설치된-cli로-새-ai-세션-시작)에 설치 폴더의 절대 경로만 넣으면 됩니다.

<a id="create"></a>

## AI로 음악 만들기

| 만들고 싶은 것 | 문서 | 핵심 내용 |
| --- | --- | --- |
| 공식 ACE 가이드에 맞춘 곡 | [ACE 프롬프트 최적화](ace-prompt-guide.md) | caption·가사·엔진별 옵션·실효 길이 검증 |
| Verse·Chorus·간주를 갖춘 가사 | [구간 태그](lyrics-tags.md) | 역할·배치 시점·실제 변환/삭제 결과 |
| 보컬·악기·템포·길이를 세밀하게 지정 | [음악 생성 옵션](music-options.md) | 지원 값·우선순위·완전한 JSON 예시 |
| K-POP·트로트·락발라드·BGM | [장르별 프롬프트](genre-prompts.md) | 간단 요청·상세 레시피·여러 곡 비교 |
| 최근 인기 스타일을 조사해서 제작 | [리서치 기반 음악 만들기](music-research.md) | 날짜·출처·지표 → 창작 가사·설정 → 생성 |
| 검토 후 생성하거나 전부 자동 위임 | [검토와 자동 생성](music-review.md) | 승인 범위·부분 위임·수정·결과 자료 |
| 반복 작업을 AI에게 맡김 | [작업 프롬프트](../prompts/cli-workflows.md) | 생성·앨범·자막·영상·오류 진단 |

| AI가 읽는 동봉 자료 | 역할 |
| --- | --- |
| [AGENTS.md](../AGENTS.md) · [CLAUDE.md](../CLAUDE.md) | 공통 실행 규칙과 같은 지침을 읽는 진입점 |
| [작사·생성 스킬](../skills/road-music-ace/SKILL.md) | 공식 근거·태그 선택·입력 검증·검토·생성 흐름 |
| [검수 에이전트 역할](../prompts/ace-review.md) | 별도 에이전트가 있을 때 읽기 전용 독립 검수 |

> [!IMPORTANT]
> 기본은 검증한 가사·프롬프트를 요청자에게 먼저 보여줍니다. 가사와 프롬프트부터 생성까지 모두 자동으로 맡긴 경우에는 자체 검증 후 생성하고 음악·가사·최종 옵션·근거를 제공합니다.

<a id="reference"></a>

## CLI와 앱 레퍼런스

| 문서 | 필요할 때 |
| --- | --- |
| [CLI 사용법](cli.md) | 실행 순서·JSON 출력·이벤트·대기·재시도 |
| [CLI 레퍼런스](cli-reference.md) | 공개 명령과 중첩 입력 필드를 정확히 확인 |
| [CLI 설계](cli-design.md) | 로컬 서비스·전송·renderer 경계 이해 |
| [프로젝트 안내](project-guide.md) | 기능·엔진·코드 구조·외부 통신 파악 |
| [상세 가이드](guide.md) | GUI의 생성·관리·녹음·영상 설정 확인 |

실제 설치 버전의 `node cli/road-music.js schema`가 명령·허용값의 최종 기준입니다. 자연어 프롬프트의 보컬·분위기·구성 지시와 엔진이 강제하는 옵션은 구분합니다.

<a id="release"></a>

## 업데이트와 릴리스

| 작업 | 문서 |
| --- | --- |
| 설치된 앱·CLI 업데이트 | [업데이트 가이드](updates.md) |
| 날짜 기반 릴리스 노트 작성·GitHub Release 연결 | [릴리스 노트](../releases/README.md) |
| DMG·CLI 키트 빌드·서명·배포 준비 | [패키징](packaging.md) |
| 이미 공개한 버전 기록 | [기존 버전 노트](releases/v1.4.0.md) · [전체 GitHub Releases](https://github.com/roadkwonai/music-road/releases) |

이미 공개된 태그·파일을 교체하지 않고 다음 버전에 수정 내용을 기록합니다. 날짜 노트와 실제 GitHub Release 발행은 별개의 단계입니다.

<a id="verification"></a>

## 검증과 지원 범위

| 자료 | 확인 범위 |
| --- | --- |
| [CLI 검수 결과](cli-qa-report.md) | 테스트·실제 ACE·음원/영상 검증과 미검증 항목 |
| [업데이트 전 과정 검증](update-e2e-report.md) | 실제 GUI·CLI·소스 업데이트·재시작·복구 결과 |
| [업데이트 검증 원시 결과](update-e2e-results.json) | 위 보고서가 참조하는 구조화된 실행 결과 |

각 검증 문서의 날짜·버전·환경을 함께 읽으세요. 과거 테스트 통과가 모든 OS·모델·마이크·새 버전의 검증을 뜻하지는 않습니다.

<a id="sources"></a>

## 공식 원문과 작성 원칙

[ACE 공식 문서 보관본](vendor/ace-step-1.5/README.md)에는 고정 커밋의 영어 원문·공식 한국어 번역·LICENSE·파일 해시가 있습니다. 공식 원문은 내용과 해시를 그대로 보존하고, 로드뮤직 적용 설명을 별도 문서에 둡니다.

이 문서들의 탐색 방식은 다음을 따릅니다.

- 상단의 목적·탐색 링크와 목차로 필요한 부분부터 읽습니다.
- 값 비교는 표, 절차는 번호 목록, 실제 입력은 코드 블록으로 제시합니다.
- 긴 선택 사항은 접기 블록으로 나누고, 필수 조건은 경고·안내 블록으로 먼저 알립니다.
- 기존 문서의 제목·앵커와 검증 사실은 보존합니다. 공개 릴리스 노트의 링크는 GitHub Release 본문에서도 열 수 있게 작성합니다.
