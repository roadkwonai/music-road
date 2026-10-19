> 철회 기록: 이 파일은 최초 공개 CLI 0.1.0의 본문과 당시 공개 ZIP·체크섬·검증 기록을 보존합니다. 이전 Release·태그는 백업 뒤 철회되며, 고정 소스는 [커밋 3f2542fc5ad0f2f9f92cbbdc7535af3bef598d71](https://github.com/roadkwonai/music-road/tree/3f2542fc5ad0f2f9f92cbbdc7535af3bef598d71)에서 확인할 수 있습니다. 당시 공개 CLI 0.1.0은 앱 소스 1.4.0을 동봉했으며 현재 설치·업데이트 안내가 아닙니다. 새 CLI 0.1.0은 앱 소스 0.1.0을 동봉하므로 같은 버전 숫자로 자동 전환되지 않으며 새 폴더에 수동 설치해야 합니다.

CLI 제품 버전을 **0.1.0부터 독립적으로 시작**합니다. 로드뮤직 앱의 정식 버전은 **1.4.0을 유지**하며 이 CLI 배포로 앱 DMG를 갱신하지 않습니다.

## 포함한 기능

- CLI 명령·문서·작사 스킬과 CCM 48개 스타일, 찬송가 원전 후보 20곡·리메이크 편곡 16가지를 제공합니다. `prompt:knowledge`는 입력을 바꾸지 않고 자료만 읽습니다.
- `--version` 또는 `cli:version`으로 CLI 버전·소스에 포함된 앱 버전·프로토콜 버전을 구분합니다. 실행 중인 앱은 별도로 `service:status`와 `app:state`로 확인합니다.
- `cli:update:check`는 앱을 실행하지 않고 CLI 전용 `cli-v*` 정식 버전을 확인합니다. `cli:update:install`은 검증된 새 CLI를 별도 경로에 설치하고 버전·의존성을 점검합니다. 기존 앱·모델·곡·작업 폴더를 덮거나 실행 중인 GUI를 종료하지 않습니다.
- AI는 연결한 세션에서 CLI 업데이트를 확인하고 새 버전이 있으면 알립니다. 사용자가 업데이트를 요청하거나 명시적으로 자동 업데이트를 맡긴 경우에만 설치하고 새 CLI 경로로 검증을 이어갑니다.
- 기존 `update:*` 명령은 로드뮤직 **앱** 업데이트용입니다. CLI 버전 업데이트와 공유하지 않습니다.

## 설치와 버전 정책

CLI 배포 파일은 `RoadMusic-CLI-0.1.0.zip`과 `SHA256SUMS.txt`, 태그는 `cli-v0.1.0`입니다. Node.js 24와 CLI 의존성을 사용합니다. 앱은 기존 `v1.4.0` DMG를 사용합니다.

앞서 공유 번호로 잘못 배포한 1.4.4와 과거 1.4.1~1.4.3 태그는 철회 기록으로 옮겼습니다. 이미 받은 파일을 회수하거나 이미 설치된 앱을 자동으로 내리지는 않습니다. 1.4.4 앱을 설치했다면 공식 앱 1.4.0으로 돌아가는 것은 수동 설치 작업이며 이번 CLI 업데이트가 대신 수행하지 않습니다.

CLI 소스 키트의 화면에는 향후 앱용 가이드 보기 변경이 포함돼 있으나, 현재 배포된 앱 1.4.0 DMG의 변경을 뜻하지 않습니다. 앱의 다음 변경은 앱 태그와 앱 릴리스 노트로 따로 배포합니다.

## 검증과 제한

제품별 버전·태그·자산·워크플로 분리, 앱 무기동 CLI 조회, 다운로드·설치 경계와 원문 보존을 테스트합니다. 실제 공개 ZIP 설치와 앱 Latest 유지 여부도 배포 후 확인합니다.

CLI 자동 설치는 macOS·Linux의 표준 ZIP 도구와 npm을 사용하며 Windows 자동 설치는 지원하지 않습니다. 원전 가사·선율의 만료 표기와 한국어 번역·현대 편곡·녹음의 권리는 구분해야 합니다. 이번 릴리스 검증은 CCM 음원의 생성·청취 품질 인증이 아닙니다.

[CLI 설치](https://github.com/roadkwonai/music-road/blob/cli-v0.1.0/docs/cli-install.md) · [업데이트·버전 구분](https://github.com/roadkwonai/music-road/blob/cli-v0.1.0/docs/updates.md) · [CCM 가이드](https://github.com/roadkwonai/music-road/blob/cli-v0.1.0/docs/ccm-prompts.md) · [찬송가 리메이크](https://github.com/roadkwonai/music-road/blob/cli-v0.1.0/docs/hymn-remake-guide.md)
