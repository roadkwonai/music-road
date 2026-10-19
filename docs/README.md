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
> 이미 설치했다면 설치 프롬프트를 반복하지 마세요. [README의 새 세션 프롬프트](../README.md#이미-설치된-cli로-새-ai-세션-시작)를 그대로 복사하면 AI가 기존 CLI 설치 폴더를 자동으로 찾습니다.

<a id="create"></a>

## AI로 음악 만들기

| 만들고 싶은 것 | 문서 | 핵심 내용 |
| --- | --- | --- |
| 공식 ACE 가이드에 맞춘 곡 | [ACE 프롬프트 최적화](ace-prompt-guide.md) | caption·가사·엔진별 옵션·실효 길이 검증 |
| 공식 YuE·YuE2 가이드에 맞춘 곡 | [YuE 제작 적용 가이드](yue-prompt-guide.md) | 세대·MLX 구분, style·가사·cot·ABC·EOS·길이·검수·권리 근거 |
| YuE 옵션·편성·악보·단계 재사용 | [YuE CLI 고급 제작](yue-cli-workflow.md) | 입력 사전검사, 샘플링 14개·CFG·ODE, runtime·전사·검수 |
| YuE 확장 실측 결과 | [YuE CLI 실기 검증](yue-cli-validation.md) | 8개 비교 음원·가사 전사·속도·메모리와 청취 한계 |
| 모델별 제작·최적화·비교 | [모델별 제작·비교](model-production-guide.md) | 기본 CLI와 별도 런타임, 프롬프트 실험·길이·ASR·복구 한계 |
| Apple Silicon에서 YuE2 설치·생성 | [YuE2 Apple Silicon](yue-mlx.md) | `yue-mlx` 설치·선택, 메모리·라이선스·검증 한계 |
| Verse·Chorus·간주를 갖춘 가사 | [구간 태그](lyrics-tags.md) | 역할·배치 시점·실제 변환/삭제 결과 |
| 보컬·악기·템포·길이를 세밀하게 지정 | [음악 생성 옵션](music-options.md) | 지원 값·우선순위·완전한 JSON 예시 |
| K-POP·트로트·락발라드·BGM | [장르별 프롬프트](genre-prompts.md) | 간단 요청·상세 레시피·여러 곡 비교 |
| 장르·옵션·명령을 조합해 응용 | [공개 명령 조합 활용](command-recipes.md) | 장르·스타일·목적·태그로 찾는 43개 조합과 응용 예시 |
| YuE를 주 모델로 고급 활용 | [YuE 전용 고급 프롬프트](yue-advanced-prompts.md) | 16옵션·공식 동작 경계·계획/음원·단계 재사용·대표12예시 |
| ACE·YuE CCM 고급 제작 | [CCM 고급 활용](ccm-advanced.md) | 엔진별 CCM 조합·계획·가사/선율 보존·검수, HTML 전문 페이지 |
| CCM·워십을 주로 제작 | [CCM 상세 가이드](ccm-prompts.md) | 과거·최근 근거, 48개 스타일, 세부 옵션, 요청문·가사·JSON 예시 |
| 옛 찬송을 현대 CCM으로 리메이크 | [원전·권리·리메이크 가이드](hymn-remake-guide.md) | 원전 후보 20곡·편곡 16가지, 번역·녹음 구분, 입력 원문 보존 |
| 최근 인기 스타일을 조사해서 제작 | [리서치 기반 음악 만들기](music-research.md) | 날짜·출처·지표 → 창작 가사·설정 → 생성 |
| 검토 후 생성하거나 전부 자동 위임 | [검토와 자동 생성](music-review.md) | 승인 범위·부분 위임·수정·결과 자료 |
| 반복 작업을 AI에게 맡김 | [작업 프롬프트](../prompts/cli-workflows.md) | 생성·앨범·자막·영상·오류 진단 |

| AI가 읽는 동봉 자료 | 역할 |
| --- | --- |
| [AGENTS.md](../AGENTS.md) · [CLAUDE.md](../CLAUDE.md) | 공통 실행 규칙과 같은 지침을 읽는 진입점 |
| [작사·생성 스킬](../skills/road-music/SKILL.md) | 공식 근거·태그 선택·입력 검증·검토·생성 흐름 |
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
| [저장공간 운영 스킬](../skills/road-music-storage/SKILL.md) | 완성본 전용 Output, 작업 캐시·버전·diff·안전한 정리 절차 |

실제 설치 버전의 `node cli/road-music.js schema`가 명령·허용값의 최종 기준입니다. 자연어 프롬프트의 보컬·분위기·구성 지시와 엔진이 강제하는 옵션은 구분합니다.

<a id="release"></a>

## 업데이트와 릴리스

| 작업 | 문서 |
| --- | --- |
| 설치된 앱·CLI 업데이트 | [업데이트 가이드](updates.md): 앱 Latest와 `cli-v*` Release를 구분 |
| 날짜 기반 릴리스 노트 작성·GitHub Release 연결 | [릴리스 노트](../releases/README.md) |
| DMG·CLI 키트 빌드·서명·배포 준비 | [패키징](packaging.md) |
| 앱 asset과 독립 CLI 키트 | `RoadMusic-X.Y.Z-source.zip` · `RoadMusic-CLI-X.Y.Z.zip` |
| 최신 지식 조회·찬송가 리메이크 | [CCM 상세 가이드](ccm-prompts.md) · [찬송가 리메이크 가이드](hymn-remake-guide.md) |

앱과 CLI는 각각 0.1.0부터 번호를 시작합니다. 앱 Release만 Latest이며 CLI Release는 `cli-v*` 태그로 조회합니다. 공통 초기 번호라도 manifest·태그·asset·체크섬·설치 경로는 분리합니다. 이전 앱·스킬 0.1.1, CLI 0.1.1·0.1.2, 1.4.x와 같은 번호의 옛 0.1.0은 새 배포로 자동 전환되지 않으므로 새 위치에 한 번 수동 설치한 뒤 해당 제품의 0.1.1 이상 알림을 받습니다. 이후 CI는 제품별 바로 다음 버전과 같은 manifest·노트만 허용합니다. 날짜 노트와 실제 GitHub Release 발행은 별개의 단계입니다.

<a id="verification"></a>

## 검증과 지원 범위

| 자료 | 확인 범위 |
| --- | --- |
| [CLI 검수 결과](cli-qa-report.md) | 테스트·실제 ACE·음원/영상 검증과 미검증 항목 |
| [첫 CLI 독립 업데이트 검증](cli-update-qa-report.md) | 초기화 전 첫 CLI 0.1.0 배포의 감지·설치·앱 보존 기록 |
| [0.1.0 재배포 안내](version-republish-20261020.md) | 버전 상태 보완·동일 번호 재배포·새 체크섬 확인 |
| [앱·CLI 0.1.0 최초 초기화 검증](version-reset-20261020-qa-report.md) | 교체 전 배포 파일의 실제 설치·이전 키트 전환·해시 기록 |
| [업데이트 전 과정 검증](update-e2e-report.md) | 실제 GUI·CLI·소스 업데이트·재시작·복구 결과 |
| [업데이트 검증 원시 결과](update-e2e-results.json) | 위 보고서가 참조하는 구조화된 실행 결과 |

각 검증 문서의 날짜·버전·환경을 함께 읽으세요. 과거 테스트 통과가 모든 OS·모델·마이크·새 버전의 검증을 뜻하지는 않습니다.

<a id="sources"></a>

## 공식 원문과 작성 원칙

[ACE 공식 문서 보관본](vendor/ace-step-1.5/README.md)에는 고정 커밋의 영어 원문·공식 한국어 번역·LICENSE·파일 해시가 있습니다. 공식 원문은 내용과 해시를 그대로 보존하고, 로드뮤직 적용 설명을 별도 문서에 둡니다.

[YuE·YuE2 공식·MLX 보관본](vendor/yue2/README.md)에는 고정판과 현재 공식 문서·스킬·모델 카드·라이선스, 커뮤니티 MLX 계약, 이전 YuE-v1 비교 자료와 해시가 있습니다. 제작에는 선택한 모델의 적용 가이드와 해당 버전의 원문만 읽습니다.

이 문서들의 탐색 방식은 다음을 따릅니다.

- 상단의 목적·탐색 링크와 목차로 필요한 부분부터 읽습니다.
- 값 비교는 표, 절차는 번호 목록, 실제 입력은 코드 블록으로 제시합니다.
- 긴 선택 사항은 접기 블록으로 나누고, 필수 조건은 경고·안내 블록으로 먼저 알립니다.
- 기존 문서의 제목·앵커와 검증 사실은 보존합니다. 공개 릴리스 노트의 링크는 GitHub Release 본문에서도 열 수 있게 작성합니다.

## 프로젝트 저장공간 관리

프로젝트별 캐시·중간본·히스토리의 보존 정책과 선택 정리는 [저장공간 운영 스킬](../skills/road-music-storage/SKILL.md), [CLI 사용법](cli.md), [공개 명령](cli-reference.md)을 참고한다. HTML은 내 작업물의 저장공간 관리에서 디스크 전체와 작업 폴더를 구분한 그래프, 음악별 용량·보호 사유·정리 계획·감사 이력을 확인한다. 프로필 `storage.sqlite3`는 프로젝트·그룹·경로 소유권·최소 이벤트·스캔 메타데이터를, 작업 폴더 `.roadmusic/history.sqlite3`는 검증된 납품 버전·diff 원장을 보관한다. 실제 미디어·원가사·엔진 JSON은 파일로 유지한다. 프로그램·모델·원음·등록 완성본·활성 작업은 보호하며, 관리/도구 영역은 미연결 제작물로 오인하지 않는다. 실제 소유권 미확인 자료도 숨기지 않고 보호된 검토 대상으로 표시하며, 구조 전환 또는 명시 선택한 계획에서만 정리한다.

- [주요 화면 UI/UX 검수와 개선](ui-ux-review.md): 화면별 개선계획, 공통화 경계와 실제 검증 결과.

- [관리 스킬과 모션그래픽 CLI](cli-motion-graphics.md): 동봉 스킬 설치·업데이트, 기존 음악의 영상 제작실 연결.
