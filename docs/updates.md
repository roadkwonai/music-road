# 앱·CLI·스킬 버전 확인과 업데이트

[Road Music](../README.md) · [문서 지도](README.md) · [제품별 릴리스](../releases/README.md)

2026-10-20 배포 기준은 앱·CLI·music-road-skills 모두 **0.1.0**입니다. 이후 버전은 제품별로 독립적으로 증가합니다. 문서에 적힌 번호보다 실제 설치본의 버전과 해당 제품의 공개 Release를 우선 확인하세요.

| 제품 | 소스 버전 원본 | 공개 채널 | 현재 배포 |
| --- | --- | --- | --- |
| 앱 | `package.json` | 앱 저장소 Latest · `vX.Y.Z` | [v0.1.0](https://github.com/roadkwonai/music-road/releases/tag/v0.1.0) |
| CLI | `cli/package.json` | 앱 저장소의 `cli-v*` 정식 Release | [cli-v0.1.0](https://github.com/roadkwonai/music-road/releases/tag/cli-v0.1.0) |
| 스킬 묶음 | 해당 묶음의 `VERSION`·`manifest.json` | 별도 music-road-skills 저장소 Latest | [v0.1.0](https://github.com/roadkwonai/music-road-skills/releases/tag/v0.1.0) |

같은 초기 번호라도 태그·파일·체크섬·설치 경로를 서로 바꿔 사용하지 않습니다. CLI의 `appVersion`은 동봉 앱 **소스** 버전이며 현재 실행 중인 GUI 버전이 아닙니다. 소스 체크아웃 버전, 실제 설치 버전, 마지막 확인한 최신 배포 버전도 구분합니다.

<a id="consolidated-140"></a>

## 목차

- [앱 업데이트](#app)
- [CLI 업데이트](#cli)
- [스킬 묶음](#skills)
- [AI의 확인과 설치 순서](#ai)
- [배포 규칙](#release)
- [HTML에서 확인](#html)
- [제한과 복구](#limits)
- [초기화 이전 설치본의 전환](#2026-10-20-전체-배포-기준-초기화)

<a id="app"></a>

## 앱 업데이트

앱은 앱 저장소의 Latest 정식 Release를 사용하며 시작 시와 15분마다 확인합니다. `update:*`는 앱 DMG 또는 지원하는 공식 Git 소스 설치가 대상입니다.

```bash
node cli/road-music.js update:status
node cli/road-music.js update:check --json '{"manual":true}'
node cli/road-music.js update:watch --events --json '{"timeoutMs":60000}' --timeout 65000
node cli/road-music.js update:install --events --timeout 1800000
```

설치는 사용자가 요청했을 때만 실행합니다. `update:install`은 앱 교체·재시작을 수행할 수 있으므로 진행 중인 생성·렌더·설치·대기 작업과 로컬 수정을 먼저 확인합니다. 설치 전 PID·목표 버전을 기록하고, 인계 응답 뒤 `service:status --no-start`, `update:status --no-start`, `app:state --no-start`로 새 PID·실제 버전·이번 설치 결과를 대조합니다.

공개 버전이 현재 앱보다 높을 때만 자동 업데이트 후보입니다. 같거나 낮으면 자동으로 설치하지 않으며, 낮은 공개 버전으로 초기화된 경우에는 아래 수동 전환 안내를 따릅니다. 다운로드된 구버전 캐시나 이전 설치 성공 기록만으로 새 설치 완료를 표시하지 않습니다.

<a id="cli"></a>

## CLI 업데이트

CLI는 `cli-v*` 정식 Release만 조회합니다. 앱 Latest나 스킬 Release를 CLI 버전으로 사용하지 않으며 앱·서비스·모델을 시작하거나 교체하지 않습니다.

```bash
node cli/road-music.js cli:version
node cli/road-music.js cli:update:check
```

`cli:update:check`은 최신 정식 CLI의 `version`, 노트와 배포 파일 정보를 반환하고, 현재 설치본보다 높은지는 `available`로 따로 표시합니다. 따라서 최신 배포가 0.1.0이고 현재 CLI도 0.1.0이면 `version:0.1.0`, `available:false`가 정상입니다. 조회 실패를 ‘최신’으로 바꾸지 않으며 오류를 보고합니다.

명시적인 설치·업데이트 요청에는 다음 명령을 사용합니다. 대상은 존재하지 않는 새 빈 폴더로 지정합니다.

```bash
node cli/road-music.js cli:update:install \
  --json '{"targetDir":"/absolute/path/road-music-cli-new"}' \
  --timeout 1800000
```

기본 대상은 사용자 CLI 저장소의 버전별 폴더입니다. 기존 기본 폴더는 현재 공개 체크섬과 설치 표식 `archiveSha256`이 일치할 때만 재사용하며, 다르면 기존 파일을 보존하고 새 `targetDir`을 요구합니다. 현재보다 낮은 CLI 버전의 자동 설치는 차단합니다.

반환된 `cliPath`에서 `--version`, `schema`, `prompt:knowledge`를 확인하고 이후 명령도 그 경로에서 실행합니다. 새 세션은 `ROADMUSIC_CLI_HOME` 아래 `current.json`, 변수가 없으면 `~/.local/share/road-music/cli/current.json`을 확인합니다. 기존 Git 작업 폴더나 전역 `road-music` 링크를 자동으로 덮어쓰지 않습니다.

<a id="skills"></a>

## 스킬 묶음

스킬은 별도 저장소의 `VERSION`·`manifest.json`과 Release를 기준으로 확인합니다. CLI에 동봉한 묶음과 사용자의 관리 설치 대상은 경로가 다를 수 있습니다.

```bash
node cli/road-music.js skills:status
node cli/road-music.js skills:check
```

설치·업데이트는 사용자가 요청한 경우에만 `skills:install`·`skills:update`로 진행하며, 기존 로컬 수정·다른 스킬·음악 엔진·모델·작업물을 보존합니다. 개별 제작 스킬의 업데이트도 같은 관리 묶음 전체에 적용됩니다. 소스 체크아웃은 버전 확인 대상으로 표시하고 설치 완료로 위장하지 않습니다. 상세 절차는 [스킬 업데이트 가이드](../skills/music-road-skills/docs/updates.md)를 따릅니다.

<a id="ai"></a>

## AI의 확인과 설치 순서

AI는 CLI 세션 첫 연결에서 `cli:version`, `cli:update:check`을 한 번 확인합니다. 새 버전이 있으면 현재·최신 버전·노트·설치 대상만 알리고, 음악 요청을 업데이트·재설치·상시 감시 권한으로 확대하지 않습니다. 매 명령·매 곡마다 네트워크를 조회하지 않습니다.

업데이트를 요청받으면 앱은 `update:status`·`update:check`, CLI는 `cli:update:check`, 스킬은 `skills:status`·`skills:check`로 제품과 실제 대상을 확인합니다. 앱 업데이트 명령으로 CLI나 스킬을 대신 설치하지 않습니다. 성공은 실제 새 버전·manifest·체크섬·실행 상태로 확인하며 응답 유실 시 기존 작업을 먼저 재조회합니다.

<a id="release"></a>

## 배포 규칙

| 제품 | 태그 | 배포 파일 | Latest |
| --- | --- | --- | --- |
| 앱 | `vX.Y.Z` | `RoadMusic-X.Y.Z-mac-arm64.dmg`·`RoadMusic-X.Y.Z-source.zip` | 앱 저장소 Latest |
| CLI | `cli-vX.Y.Z` | `RoadMusic-CLI-X.Y.Z.zip` | 앱 Latest 아님 |
| 스킬 | `vX.Y.Z` | `MusicRoad-Skills-X.Y.Z.zip` | 스킬 저장소 Latest |

각 Release의 `SHA256SUMS.txt`를 사용합니다. 앱은 `release.yml`, CLI는 `release-cli.yml`, 스킬은 별도 저장소의 Release workflow를 따릅니다. 2026-10-20 사용자 요청 초기화와 뒤이은 버전 상태 검수 보완의 동일 0.1.0 재배포는 명시적 예외이며, 이후 같은 버전 재발행·역행·번호 건너뛰기를 허용하지 않습니다. 제품별 다음 패치, 다음 마이너의 `.0`, 다음 메이저의 `.0.0`과 manifest·노트 일치를 검사합니다. 현재 기준에서 다음 패치는 해당 제품의 0.1.1이며 아직 공개됐다는 뜻이 아닙니다.

<a id="html"></a>

## HTML에서 확인

제작 분석 → **프로그램·스킬 버전 상태**에서 설치 또는 소스 버전, 최신 배포와 확인 시각을 함께 읽습니다. SQLite의 이전 관찰값은 그때의 기록이며, 새 확인이나 실제 설치 증거 없이 현재 버전으로 바꾸지 않습니다.

**업데이트 확인** 뒤 새 버전이 있으면 대상과 범위를 확인하고 **업데이트**로 실행합니다. 실제 진행량을 모르면 불확정 막대를 사용하며 완료·실패·재시작 필요·설치 확인 필요를 구분합니다. CLI는 새 설치 경로를 안내하고 현재 서버 경로를 자동 변경하지 않습니다. 소스 체크아웃 스킬은 확인만 지원합니다. 기존 설치에서 별도 작업 폴더를 사용했다면 프로필의 `deliveryRoot`를 보존합니다. 검증된 완성본 전용 작업 폴더만 새 설치에서 다시 연결하며, 이력 DB를 새 설치 폴더로 복제하지 않습니다. 작업 폴더나 납품 이력을 확인할 수 없으면 기존 파일 연결을 지우지 않고 경로를 먼저 확인합니다.

연결이 끊기면 **진행 상태 다시 확인**으로 기존 요청을 조회합니다. 설치가 미확정인 상태에서 자동으로 재제출하지 않으며 앱은 재시작 후 실제 실행 버전까지 확인해야 적용 완료입니다.

<a id="limits"></a>

## 제한과 복구

이번 재배포의 변경 범위와 확인 방법은 [0.1.0 재배포 안내](version-republish-20261020.md)를 확인합니다. [최초 2026-10-20 배포 검증](version-reset-20261020-qa-report.md)은 교체 전 파일의 해시·검증 기록입니다. [10월 15일 초기화 검증](version-reset-qa-report.md), [첫 CLI 설치](cli-update-qa-report.md), [이전 앱 업데이트](update-e2e-report.md)는 당시 버전·해시를 남긴 과거 기록입니다.

앱은 애드혹 서명이며 Apple 공증을 받지 않았습니다. Windows CLI 자동 설치와 Linux 실제 설치 등 미검증 범위는 각 검수 기록에 구분합니다. 설치 실패 시 기존 앱·CLI·데이터를 보존하며 오류와 새 설치 폴더를 확인합니다.

## 2026-10-20 전체 배포 기준 초기화

현재 새 기준은 앱·CLI·스킬 각각 0.1.0입니다. 이전 앱·스킬 0.1.1, CLI 0.1.1·0.1.2, 1.4.x 앱은 숫자상 더 높고 같은 번호의 옛 0.1.0도 있으므로 자동 업데이트 알림만으로 새 파일을 구분할 수 없습니다.

Release의 파일·체크섬을 확인하고 앱은 수동 설치, CLI·스킬은 기존 수정본을 보존한 새 경로로 전환합니다. 이전 Git clone도 새 clone으로 전환하고 필요한 로컬 수정을 비교해 옮깁니다. 실제 옛 설치본의 버전 표시를 문서 기준 0.1.0으로 강제로 바꾸지 않습니다. 전환한 뒤에는 해당 제품의 더 높은 정식 버전만 자동 업데이트 대상으로 삼습니다. 이전에 내려받은 파일·캐시와 외부 clone은 회수되지 않습니다.

### 이전 CLI의 큰 ZIP 검사 오류

일부 이전 CLI는 ZIP 검사 출력이 64KiB를 넘으면 목록을 잘라 읽어 `UPDATE_VERIFY` 오류가 날 수 있습니다. 안전 검사를 끄지 말고 새 ZIP·체크섬을 직접 확인해 새 폴더에 풀고 `npm run setup:cli`로 설치하세요. 새 0.1.0은 전체 목록을 제한 안에서 검사하고 경로·링크가 안전하지 않거나 한도를 넘으면 중단합니다. 관리 스킬 자산을 중복 복사하거나 심볼릭 링크로 연결하지 않습니다.
