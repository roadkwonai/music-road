# 제품별 릴리스

[Road Music README](../README.md) · [앱·CLI 업데이트](../docs/updates.md) · [패키징](../docs/packaging.md)

앱과 CLI는 **서로 다른 제품 버전**을 사용합니다. 앱의 GUI·엔진·실행 기능을 배포할 때만 앱 버전을 올리고, CLI·AI 지침·키트를 배포할 때는 CLI 버전만 올립니다. 전체 Git 태그의 가장 큰 숫자로 다음 버전을 추측하지 않습니다.

| 항목 | 로드뮤직 앱 | Road Music CLI |
| --- | --- | --- |
| 현재 정식 버전 | 0.1.0 | 0.1.0 |
| 버전 원본 | 루트 `package.json`·`package-lock.json` | `cli/package.json` |
| 태그 | `v0.1.0` | `cli-v0.1.0` |
| 노트 | [앱 0.1.0](2026-10-20-road-music-0-1-0.md) | [CLI 0.1.0](cli/v0.1.0.md) |
| 자산 | `RoadMusic-0.1.0-mac-arm64.dmg`, `RoadMusic-0.1.0-source.zip` | `RoadMusic-CLI-0.1.0.zip` |
| 체크섬 | 해당 앱 Release의 `SHA256SUMS.txt` | 해당 CLI Release의 `SHA256SUMS.txt` |
| GitHub Latest | 앱 Release에만 지정 | 항상 `--latest=false` |
| 업데이트 | `update:check`·`update:install` | `cli:update:check`·`cli:update:install` |

## 다음 버전을 정하는 순서

1. 먼저 **앱 또는 CLI**를 선택합니다. CLI만 바꿨다면 앱 버전을 올리지 않습니다.
2. 선택한 제품의 manifest 버전만 변경합니다. 다음 CLI 패치와 다음 앱 패치는 각각 `0.1.1`입니다. 과거 철회 기록이나 다른 제품 태그 때문에 번호를 건너뛰지 않습니다.
3. 해당 제품의 릴리스 노트를 작성하고 아래 검증 명령을 실행합니다. 태그·manifest·노트·파일명의 제품과 버전이 일치해야 합니다.
4. 이미 존재하는 대상 태그·Release는 덮어쓰지 않습니다. 잘못된 배포를 철회해야 한다면 명시적인 사용자 요청, 원본·자산·태그 백업과 정리 기록을 남긴 뒤 수행합니다.
5. 공개된 앱·CLI 각각을 조회하고 실제 파일·해시·버전을 확인합니다. CLI 배포 뒤 앱 Latest가 바뀌지 않았는지도 확인합니다.

## 앱 배포

```bash
npm run release:note -- create --slug app-feature --title "앱 변경 사항"
```

날짜 노트는 `releases/YYYY-MM-DD-kebab-title.md` 형식과 기존 메타데이터를 유지합니다. `unreleased` 초안을 실제 앱 버전으로 확정한 뒤 검증합니다.

```bash
node scripts/release-notes.js resolve --version 0.1.0 --output /absolute/path/app-release-note.md
npm run dist:mac
npm run dist:source
node scripts/release-assets.js --product app
```

위 버전은 작성할 대상 앱 버전으로 바꿉니다. `dist:source`는 현재 HEAD와 manifest의 앱 버전이 같아야 하며, 추적된 소스만 담습니다. 앱 워크플로는 `v*` 태그만 받아 DMG·앱 소스 ZIP·체크섬을 발행합니다. CLI ZIP을 앱 번호로 배포하지 않습니다.

## CLI 배포

`cli/package.json`을 원하는 CLI 버전으로 바꾸고 `releases/cli/vX.Y.Z.md`를 작성합니다. [CLI 0.1.0 노트](cli/v0.1.0.md)를 형식의 출발점으로 삼되 실제 변경·검증 결과를 기록합니다.

```bash
node scripts/release-notes.js resolve-cli --version 0.1.0 --output /absolute/path/cli-release-note.md
npm run dist:cli
node scripts/release-assets.js --product cli
```

CLI 워크플로는 `cli-v*`만 받아 ZIP·체크섬을 발행합니다. 앱 DMG를 빌드하거나 앱 버전을 바꾸지 않고, CLI 릴리스를 앱의 Latest로 지정하지 않습니다. `/releases/latest`는 앱용이며 CLI 최신 버전은 `cli:update:check`로 조회합니다. 이번 명시적 초기화에서만 새 CLI 0.1.0은 앱 0.1.0 소스를 동봉하도록 기존 공개 CLI 0.1.0을 백업·철회 후 교체합니다. 이후 동일 CLI 버전을 재발행하지 않습니다.

## 과거 공유 버전 철회 기록

앱은 0.1.0부터 독립 버전을 다시 시작합니다. 1.4.x 앱 Release·태그는 철회 기록으로 보존하며 현재 설치·업데이트 대상으로 쓰지 않습니다. 1.4.x 설치본은 0.1.0으로 자동 업데이트되지 않으므로 사용자가 0.1.0 DMG를 한 번 수동 설치해야 합니다. 전환 후에는 0.1.1 이상의 앱 Release만 알립니다. 철회 전 자산·릴리스 메타데이터·Git 태그 번들은 로컬 정리 백업으로 보존합니다.

- [철회된 앱 1.4.0 노트](withdrawn/2026-10-15-road-music-1-4-0.md)
- [이전 1.4.1~1.4.3 기록](../docs/releases/README.md)
- [철회된 공유 1.4.4 노트](withdrawn/2026-10-15-hymn-remake-knowledge.md)
- [과거 업데이트 전 과정 검증](../docs/update-e2e-report.md)

이번 0.1.0 재초기화 뒤 CI는 `scripts/release-version.js --product app|cli --tag TAG --releases-json FILE`로 각 제품의 최신 정식 Release를 검증합니다. 해당 제품의 바로 다음 패치, 다음 마이너의 `.0`, 또는 다음 메이저의 `.0.0`만 허용하고 같은 버전 재배포·역행·번호 건너뛰기·다른 제품 태그를 거부하며 manifest·노트 일치도 확인합니다.

앱과 CLI 워크플로는 제품별 고정 concurrency group으로 직렬화하여 같은 제품의 배포가 겹치지 않게 합니다.

기록 안의 버전·검증 결과를 새 버전으로 바꾸지 않았습니다. 이미 받은 파일·설치본·캐시는 삭제로 회수되지 않으며, 1.4.x 앱과 이전 CLI 0.1.0 키트에서 새 0.1.0으로의 전환은 별도 수동 설치입니다. 최신 공개 상태는 [GitHub Releases](https://github.com/roadkwonai/music-road/releases)에서 확인합니다.
