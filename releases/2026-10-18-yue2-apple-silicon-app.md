<!-- road-music-release: {"date":"2026-10-18","slug":"yue2-apple-silicon-app","version":"0.1.1","title":"YuE2 Apple Silicon 설치와 음악 생성"} -->

# Road Music 0.1.1

Apple Silicon 맥에서 YuE2를 설치하고 선택해 음악을 만들 수 있는 앱 업데이트입니다. 기존 Windows NVIDIA용 YuE2와 구분하며, ACE·YuE 공용 제작 가이드도 함께 제공합니다.

## 달라진 점

- 엔진 선택과 설치 화면에 **YuE2 (Apple Silicon)**를 추가했습니다. 기존 **YuE2 (Windows · NVIDIA)**와 ACE 경로는 유지합니다.
- 미설치 엔진을 선택하면 설치 화면으로 안내합니다. 설치 버튼과 확인 후 Python 환경·패키지·고정 모델·변환·검증을 순서대로 진행하며, 음악 모델 설치를 사용자가 요청하지 않았는데 자동으로 시작하지 않습니다.
- 설치한 YuE2 Apple Silicon을 선택해 음악 생성, ABC 계획·악보 렌더, 생성 결과의 WAV·MP3 저장을 사용할 수 있습니다. 곡에 실제 엔진을 기록해 재시도·악보 렌더에서도 해당 경로를 유지합니다.
- YuE2 MLX의 목표 길이는 기록·비교용임을 안내합니다. 실제 길이는 자연 종료에 따르며, 중단된 생성의 재시도는 새 생성 시도가 될 수 있습니다.
- ACE·YuE 공용 작사·프롬프트·검수 스킬과 모델별 공식 근거를 동봉합니다. 승인 원문 보존, 한국어 검수, 긴 스타일 태그의 삭제·입력 잘림 점검을 보완했습니다.

## 설치와 호환성

- 배포 파일은 `RoadMusic-0.1.1-mac-arm64.dmg`, `RoadMusic-0.1.1-source.zip`, `SHA256SUMS.txt`입니다. 이 앱 릴리스가 GitHub Latest가 됩니다.
- 기존 0.1.0 앱은 앱 업데이트 채널에서 0.1.1을 확인할 수 있습니다. DMG로 설치할 때는 앱을 `/Applications`로 복사합니다. CLI는 별도 정식 버전 0.1.2를 유지하며 CLI 릴리스를 다시 게시하지 않습니다.
- YuE2 Apple Silicon은 macOS 14.2 이상, Apple Silicon, 메모리 최소 32GB·권장 64GB, 여유 디스크 30GB 기준입니다. M5는 macOS 26.2 이상이 필요합니다. 모델은 DMG에 포함하지 않고 사용자가 설치할 때 별도로 준비합니다.
- 기존 프로젝트·곡·모델을 자동 이동하거나 대체하지 않습니다. 모델과 포트의 고정 리비전·라이선스·실제 지원 범위는 [YuE2 Apple Silicon 안내](https://github.com/roadkwonai/music-road/blob/v0.1.1/docs/yue-mlx.md)를 확인합니다.

## 검증과 한계

- 전체 소스 테스트, 앱 버전·태그·릴리스 노트 정합성, DMG와 앱 소스 ZIP·체크섬을 검증합니다. 배포 파이프라인에서 Git 소스 업데이트와 시작 실패 복구, 앱 번들 서명·DMG 무결성을 확인합니다.
- YuE2 Apple Silicon 설치·렌더 경로의 기존 격리 검증과 이번 버전 배포 검증은 구분합니다. 이번 릴리스에서 모델을 다시 다운로드하거나 새 음악을 생성·직접 청취하지 않습니다. M1 Max 32GB의 실제 속도와 음질은 보장하지 않습니다.
- macOS arm64 앱은 애드혹 서명이며 Apple 공증을 받지 않았습니다. Windows·Linux용 설치 파일은 이번 배포 자산에 포함하지 않습니다.

[앱 설치](https://github.com/roadkwonai/music-road/blob/v0.1.1/docs/getting-started.md) · [YuE 제작 가이드](https://github.com/roadkwonai/music-road/blob/v0.1.1/docs/yue-prompt-guide.md) · [업데이트 안내](https://github.com/roadkwonai/music-road/blob/v0.1.1/docs/updates.md) · [전체 변경](https://github.com/roadkwonai/music-road/compare/v0.1.0...v0.1.1)
