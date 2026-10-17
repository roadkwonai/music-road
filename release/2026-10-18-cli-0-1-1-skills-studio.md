<!-- road-music-release: {"date":"2026-10-18","slug":"cli-0-1-1-skills-studio","version":"0.1.1","title":"CLI 0.1.1 스킬과 HTML 제작실"} -->

# CLI 0.1.1 스킬과 HTML 제작실

> CLI `cli-v0.1.1` 변경 기록 · GitHub Release 본문은 [CLI 전용 노트](../releases/cli/v0.1.1.md)를 사용합니다.

## 사용자 변경

- Apple Silicon용 `yue-mlx` YuE2 경로를 별도 엔진으로 선택·설치·생성할 수 있습니다. 기존 Windows NVIDIA `yue` 경로와 모델·캐시를 공유하지 않습니다.
- `music-road-skills`의 6개 스킬을 CLI 키트에 동봉하고 `skills:status/check/install/update/watch`으로 설치·업데이트 상태를 관리합니다.
- 스킬 사용 시 한 번만 업데이트를 확인하며 정기 알림·감시·자동 설치는 등록하지 않습니다.
- `motion:handoff`와 `motion:studio`가 음악 생성 뒤 공통 HTML 제작실로 연결합니다. 제작실에서는 CD, Showreel Motion, Showreel MV, JIZURA의 실제 샘플 4개를 비교하고 선택·청취·검수를 진행합니다.
- Codex·Antigravity App/IDE·Antigravity CLI의 스킬 설치 경로를 지원합니다. 기본 이미지 작업은 현재 호스트가 제공하는 이미지 도구를 사용하며, 유료 `gpt-image-2.5` API는 명시적으로 요청한 경우에만 별도 사용합니다.

## 설치 영향

- CLI 버전만 0.1.1로 올립니다. Road Music 앱은 0.1.0을 유지하며 GitHub Latest도 변경하지 않습니다.
- 개발 소스는 `music-road-skills`의 고정 커밋 submodule을 사용하고, CLI ZIP/npm 배포물은 실제 스킬 파일을 동봉합니다. 사용자 CLI 설치에 추가 Git·submodule 작업은 필요하지 않습니다.
- `yue-mlx` 설치는 모델·런타임 다운로드와 디스크 사용을 수반하므로 사용자가 설치를 요청할 때만 실행합니다.

## 검증

- `npm test` 201개, 변경 JavaScript의 `node --check`, CLI 스키마·스킬 설치 fixture·HTML 제작실 이벤트·문서 링크·릴리스 노트 검증을 통과했습니다.
- `npm run dist:cli` 후 ZIP의 고정 스킬 manifest·업데이터·HTML studio 파일·체크섬과 격리 설치를 확인했습니다.

## 제한과 참고

- 모델 설치·음악 생성·이미지 생성·실제 영상 렌더와 외부 유료 API 호출은 이 릴리스 준비에서 실행하지 않습니다.
- [CLI 설치](https://github.com/roadkwonai/music-road/blob/cli-v0.1.1/docs/cli-install.md) · [YuE2 Apple Silicon](https://github.com/roadkwonai/music-road/blob/cli-v0.1.1/docs/yue-mlx.md) · [HTML 제작실](https://github.com/roadkwonai/music-road/blob/cli-v0.1.1/docs/cli-motion-graphics.md)
