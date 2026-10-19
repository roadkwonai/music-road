# 2026-10-20 앱·CLI·스킬 0.1.0 배포 검증

> 이 문서는 2026-10-20 최초 공개한 교체 전 0.1.0 파일의 과거 검증 기록입니다. 사용자 요청으로 다시 배포하는 수정본에는 아래 최초 해시를 적용하지 마세요. [재배포 안내](version-republish-20261020.md)와 현재 Release의 체크섬을 확인하세요.

이 문서는 최초 공개한 0.1.0 파일의 검증 기록입니다. 같은 번호의 이전 0.1.0 파일과 구분하려면 아래 커밋·체크섬을 확인하세요. 이후 로컬 소스를 수정했다면 그 변경이 이 배포에 포함됐다고 해석하지 않습니다.

| 제품 | 버전 | 태그·공개 파일 | 소스 기준 |
| --- | --- | --- | --- |
| 앱 | 0.1.0 | [v0.1.0](https://github.com/roadkwonai/music-road/releases/tag/v0.1.0) · DMG·소스 ZIP | `7f906055677fd2c1625a96315223860ca6501bfa` |
| CLI | 0.1.0 | [cli-v0.1.0](https://github.com/roadkwonai/music-road/releases/tag/cli-v0.1.0) · CLI ZIP | 앱과 같은 커밋 |
| 스킬 | 0.1.0 | [v0.1.0](https://github.com/roadkwonai/music-road-skills/releases/tag/v0.1.0) · 스킬 ZIP | `5000f61d14394d6dca535ae8e3b9d05b960f622e` |

앱과 스킬은 각 저장소의 Latest입니다. CLI는 앱 저장소의 `cli-v*` 채널만 사용하며 앱 Latest를 대체하지 않습니다. 세 제품의 버전은 이후 독립적으로 증가합니다.

## 확인한 결과

- 새 원격 clone에서 저장소별 main 최초 커밋 1개와 부모 커밋 없음, 0.1.0 태그·main 일치를 확인했습니다.
- 앱·CLI·스킬의 최종 배포 워크플로가 성공했습니다. 로컬 Node 381건, 스킬 Node 18건·Python 471건·제작실 18건 및 변경 JavaScript 13개 구문 검사를 통과했습니다.
- 공개 CLI를 실제로 내려받아 격리된 새 폴더에 npm 설치했습니다. CLI·동봉 앱 소스 0.1.0, 공개 명령 199개, CCM 스타일 48개와 스킬 묶음 0.1.0을 확인했습니다. 스킬 묶음에는 관리 스킬 8개가 포함됩니다.
- 공개 DMG·앱 소스 ZIP·스킬 ZIP의 체크섬과 버전을 확인했습니다. DMG 무결성 검사와 실제 설치한 CLI의 archive SHA 비교도 통과했습니다.
- ZIP은 설치기와 같은 경로·심볼릭 링크 거부 규칙으로 검사합니다. 큰 목록은 16MiB 한도 안에서 전체를 확인하고 초과 시 중단합니다. 관리 자산은 중복 복사하지 않으며 원문 바이트 일치도 확인했습니다.
- 사용자 설치본·전역 CLI 경로·모델·작업물을 교체하지 않았습니다. 기존 샘플 최종 파일 5개의 해시가 일치하며, 검증용 설치·중간 파일은 제거했습니다.

[앱 배포 검증](https://github.com/roadkwonai/music-road/actions/runs/39291981661) · [CLI 배포 검증](https://github.com/roadkwonai/music-road/actions/runs/39291982822) · [스킬 배포 검증](https://github.com/roadkwonai/music-road-skills/actions/runs/39288208000)

## 배포 파일 SHA-256

| 파일 | SHA-256 |
| --- | --- |
| `RoadMusic-0.1.0-mac-arm64.dmg` | `b4fb217a16b5b25162a03ee9bc7ebc7a30f7d7f03b096658b535308e2043b11e` |
| `RoadMusic-0.1.0-source.zip` | `6e8dc4cd04dc3f540b74c0fe70eab54f70695cb2ea9603eac12ef7f7eec15ef7` |
| `RoadMusic-CLI-0.1.0.zip` | `07d01bb1cda81d41cc339fbaea1c3c288b35cfd57721dccd047121a6a3f86874` |
| `MusicRoad-Skills-0.1.0.zip` | `5d8b125777154eb2b0ab6dd8ec04819efa99b91e07f9ac3948cf522114d77d6e` |

## 설치·표시에서 구분할 점

설치 버전은 실제 실행 파일·manifest에서 읽고, 최신 배포 버전은 해당 제품의 Release에서 읽습니다. 스킬 소스 버전·CLI에 동봉한 앱 소스 버전·실제 실행 중 GUI 버전은 서로 다른 정보입니다. 과거 SQLite 관찰값도 그 확인 시각의 이력이며 현재 설치 증거를 대신하지 않습니다.

이전 0.1.1·0.1.2·1.4.x 설치본은 0.1.0보다 높은 번호이고, 같은 번호의 옛 0.1.0도 자동 알림만으로 구분되지 않습니다. 기존 수정과 작업물을 보존하고 [수동 전환 안내](updates.md#2026-10-20-전체-배포-기준-초기화)를 따르세요. 이전 CLI의 큰 ZIP 검사가 실패하면 검증을 우회하지 말고 ZIP·체크섬을 직접 확인해 새 폴더에 설치합니다.

새 음악·영상 생성, GUI 실제 재설치, Windows·Linux 실제 설치는 이 기록의 검증 범위가 아닙니다. [10월 15일 검증](version-reset-qa-report.md)과 [첫 CLI 검증](cli-update-qa-report.md)은 당시 버전·수치·해시를 보존한 과거 기록입니다.
