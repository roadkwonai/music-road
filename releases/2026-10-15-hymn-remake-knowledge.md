<!-- road-music-release: {"date":"2026-10-15","slug":"hymn-remake-knowledge","version":"1.4.4","title":"찬송가 리메이크 지식과 원문 보존"} -->

# Road Music 1.4.4 — 찬송가 리메이크 지식과 원문 보존

## 사용자 변경

- 옛 찬송의 원어 가사·지정 고전 선율에서 PD 표기를 확인한 후보 20곡과 현대 CCM 편곡 16가지를 추가했습니다. 한국어 번역·현대 후렴·편곡·녹음의 권리를 따로 확인하도록 출처와 절차를 제공합니다.
- 앱 스타일 패널의 **가이드 보기**와 CLI의 `prompt:knowledge`에서 장르·CCM·리메이크·ACE·태그·검토 문서를 읽을 수 있습니다. CLI 조회는 앱·엔진을 시작하지 않습니다.
- 사용자 가사·프롬프트를 보존하고, 근거 있는 개선안만 제안한 뒤 요청받은 변경만 적용하도록 AI 운영 지침을 보강했습니다. 가이드 조회는 입력을 자동 변경하지 않습니다.

## 설치 영향

새 기능과 문서를 DMG 앱 및 CLI 키트에 함께 넣었습니다. 기존 곡·모델·설정은 유지합니다. 1.4.0~1.4.3보다 높은 버전이므로 기존 업데이트 지원 설치본에서 확인할 수 있습니다. 1.3.1 등 업데이트 기능이 없는 설치본은 최신 DMG 또는 CLI 설치로 이전합니다.

## 검증

- 전체 테스트 145개, 변경 JavaScript 구문·문서 링크·스키마·예제 검사를 통과했습니다.
- 별도 데이터 폴더의 실제 macOS 앱에서 가이드 열기·주제 전환·UTF-8 원문 일치·가사/스타일 보존·키보드 포커스·닫기를 확인했습니다. 생성 대기열과 곡 목록은 비어 있었으며 모델 다운로드나 음원 생성을 하지 않았습니다.
- 허용된 문서 목록과 읽기 전용 정책, 미지원 입력 거부, CLI 무기동 조회를 검증했습니다.

## 제한과 참고

원전 목록은 세계 모든 국가·모든 번역판의 이용허락 인증이 아닙니다. 실제 사용할 판본·지역과 한국어 가사·참조 녹음의 이용 근거를 따로 확정해야 합니다. AI 안내도 법적 권리 확인을 자동 완료하지 않습니다. 원선율·가창·보컬·음질은 실제 음원을 생성한 뒤 청취해야 합니다.

검증한 앱 환경은 macOS Apple Silicon입니다. 앱은 애드혹 서명이며 Apple 공증을 받지 않았습니다.

[원전 20곡·리메이크 16가지](https://github.com/roadkwonai/music-road/blob/v1.4.4/docs/hymn-remake-guide.md) · [CCM 상세 가이드](https://github.com/roadkwonai/music-road/blob/v1.4.4/docs/ccm-prompts.md) · [원문 보존·추천 규칙](https://github.com/roadkwonai/music-road/blob/v1.4.4/docs/music-review.md#preserve-input) · [CLI 지식 조회](https://github.com/roadkwonai/music-road/blob/v1.4.4/docs/cli.md#knowledge)
