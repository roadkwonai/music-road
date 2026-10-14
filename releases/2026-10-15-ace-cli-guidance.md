<!-- road-music-release: {"date":"2026-10-15","slug":"ace-cli-guidance","version":"unreleased","title":"ACE 작사·CLI 가이드와 플랫폼 점검"} -->

# ACE 작사·CLI 가이드와 플랫폼 점검

> **상태:** 공개 전 초안 · 이 변경은 공개된 v1.4.3 Release에 포함됐다는 뜻이 아닙니다.

## 사용자 변경

- AI가 Road Music CLI로 곡을 만들 때 ACE 공식 가이드, 가사 구간 태그, 장르·옵션 예시를 참고해 caption·가사·입력을 구성하는 흐름을 정리했습니다.
- 기본 생성은 가사와 프롬프트·옵션을 먼저 검토하고, 요청자가 전부 자동으로 맡긴 경우에만 검토 없이 생성한 뒤 결과와 근거를 제공합니다.
- 신규 AI 세션에서도 CLI 설치 폴더의 가이드와 스킬을 읽어 같은 제작 흐름을 사용할 수 있도록 안내를 보강했습니다.
- README에 설치 상태별 복사 프롬프트·배너·빠른 탐색을 두고, 문서 지도와 공통 탐색·목차로 상세 가이드를 연결했습니다.
- 날짜형 릴리스 노트의 버전·제목·본문을 검사한 뒤 GitHub Release 배포에 사용하는 구조를 추가했습니다.

## 설치 영향

- CLI 소스 키트와 npm 패키지에 ACE 공식 문서 보관본, 프롬프트·가사 태그·검토 가이드, 작사 스킬, 이 릴리스 노트 구조를 함께 포함합니다.
- macOS에서 지원하지 않는 YuE 엔진은 플랫폼 점검 결과에서 `skipped`로 분리하고, 지원되는 ACE 점검 결과는 그대로 실패 처리합니다.

## 검증

- 공개 CLI 스키마 기준으로 ACE caption·가사 길이와 생성 JSON 예시를 점검합니다.
- macOS 지원 엔진 판별과 CLI 문서·키트 포함 여부를 자동 검사합니다.

## 제한과 참고

- 생성물의 보컬 성별·가창 정확도·주관적 음질은 실제 청취 또는 별도 분석 없이는 확정하지 않습니다.
- [ACE 최적화 가이드](https://github.com/roadkwonai/music-road/blob/main/docs/ace-prompt-guide.md) · [가사 태그 가이드](https://github.com/roadkwonai/music-road/blob/main/docs/lyrics-tags.md) · [검토 규칙](https://github.com/roadkwonai/music-road/blob/main/docs/music-review.md)
