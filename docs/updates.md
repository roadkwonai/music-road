# 앱과 CLI 업데이트

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

Road Music 앱과 CLI는 별도 버전과 별도 GitHub Release를 사용한다. 앱 정식 버전은 `package.json`과 `vX.Y.Z` 태그를 따르며, 현재 기준은 0.1.0이다. CLI 정식 버전은 `cli/package.json`과 `cli-vX.Y.Z` 태그를 따르며, 현재 기준은 0.1.0이다. 같은 초기 번호라도 앱 최신 Release와 CLI 최신 Release를 서로 대체하지 않는다.

<a id="consolidated-140"></a>

## 목차

- [앱 업데이트](#app)
- [CLI 업데이트](#cli)
- [AI의 확인과 설치 순서](#ai)
- [배포 규칙](#release)
- [제한과 복구](#limits)

<a id="app"></a>

## 앱 업데이트

앱은 GitHub의 [최신 정식 Release](https://github.com/roadkwonai/music-road/releases/latest)만 조회한다. 앱 서비스가 시작할 때와 15분마다 확인하며, `update:*` 명령은 앱 DMG 또는 공식 Git 소스 설치만 대상으로 한다.

```bash
node cli/road-music.js update:status
node cli/road-music.js update:check --json '{"manual":true}'
node cli/road-music.js update:watch --events --json '{"timeoutMs":60000}' --timeout 65000
node cli/road-music.js update:install --events --timeout 1800000
```

`update:install`은 앱을 내려받아 교체하고 서비스를 재시작할 수 있다. 설치 전 PID와 목표 앱 버전을 기록한다. 설치 인계 응답 뒤에는 `service:status --no-start`, `update:status --no-start`, `app:state --no-start`로 새 PID·목표 버전·이번 설치 결과를 확인한다. 진행 중인 생성·렌더·대기열·로컬 수정은 취소하거나 덮어쓰지 않는다.

### 1.4.x에서 0.1.0으로 전환

앱 버전은 0.1.0부터 다시 시작한다. 이미 설치된 1.4.x는 0.1.0보다 숫자상 높으므로 자동 업데이트 후보가 아니다. 사용자가 앱 0.1.0 DMG를 한 번 수동으로 설치해 전환해야 하며, 설치된 앱·곡·모델·설정을 자동으로 내리거나 교체하지 않는다. 전환한 앱은 0.1.1 이상의 앱 Release만 업데이트 알림 대상으로 삼는다.

<a id="cli"></a>

## CLI 업데이트

CLI는 `cli-v*` 정식 Release만 조회한다. `cli:update:*`는 앱을 시작·교체·재시작하지 않으며, GUI·모델·곡·기존 Git 작업 폴더를 변경하지 않는다.

```bash
node cli/road-music.js cli:version
node cli/road-music.js cli:update:check
node cli/road-music.js cli:update:install \
  --json '{"targetDir":"/absolute/path/road-music-cli-0.1.0-reset"}' \
  --timeout 1800000
```

`cli:update:check`은 읽기 전용이며 `cli-v*` 태그 중 현재 CLI보다 높은 정식 버전과 노트를 반환한다. 앱의 `/releases/latest` 결과를 CLI 최신 버전으로 사용하지 않는다. 조회 오류는 “최신”으로 바꾸지 않으며, 현재 CLI를 계속 사용하고 오류를 보고한다.

`cli:update:install`은 새 빈 폴더에 `RoadMusic-CLI-X.Y.Z.zip`을 설치한다. `targetDir`를 생략하면 사용자 CLI 저장소의 `X.Y.Z` 폴더를 사용한다. 기존 폴더를 덮어쓰지 않으며 `sudo`도 사용하지 않는다. 설치 뒤 반환된 `cliPath`에서 `--version`, `schema`, `prompt:knowledge`를 실행해 설치본을 검증한다. 새 AI 세션은 `ROADMUSIC_CLI_HOME`이 있으면 그 아래의 `current.json`, 없으면 `~/.local/share/road-music/cli/current.json`을 먼저 확인해 이 경로를 찾는다.

### CLI 0.1.0 재초기화 전환

이번 CLI 0.1.0 재초기화만 같은 버전을 다시 배포하는 명시적 예외다. 이전 공개 0.1.0 키트에는 앱 소스 `1.4.0`이 동봉되어 있어 버전 숫자만으로 새 0.1.0을 알릴 수 없다. 이전 키트는 `cli:update:check`으로 새 버전을 받지 못하므로, 새 0.1.0 ZIP을 새 빈 폴더에 수동 설치하거나 `cli:update:install --json '{"targetDir":"/새/빈/절대/경로"}'`을 사용한다. 기본 설치 폴더가 이미 있으면 현재 Release의 `SHA256SUMS.txt`와 설치 표식의 `archiveSha256`이 일치할 때만 재사용하며, 표식이 없거나 다르면 기존 폴더를 보존하고 새 `targetDir`을 요구한다.

`cli:update:install`이 반환한 새 경로로 이후 명령을 실행한다. 전역 `road-music` 링크가 예전 키트를 가리키면 자동으로 바꾸지 않는다.

새 공개 파일의 전환·다운로드·설치 결과는 [앱·CLI 0.1.0 초기화 검증](version-reset-qa-report.md)에 기록했다. [첫 CLI 배포 검증](cli-update-qa-report.md)은 초기화 전의 역사 기록이다.

<a id="ai"></a>

## AI의 확인과 설치 순서

AI는 CLI에 처음 연결하는 세션에서 다음 읽기 전용 명령을 한 번 실행한다.

```bash
node cli/road-music.js cli:version
node cli/road-music.js cli:update:check
```

새 CLI가 있으면 현재·최신 버전, 릴리스 노트, 설치 대상 경로를 알린다. 사용자가 업데이트를 요청했거나 자동 업데이트를 명시적으로 맡긴 경우에만 설치하고, 새 CLI의 버전·스키마·지식 조회까지 검증한다. “곡 만들어줘” 같은 음악 요청은 업데이트나 재설치를 뜻하지 않는다. 매 명령·매 곡마다 네트워크를 조회하거나 상시 감시 프로세스를 만들지 않는다.

앱 업데이트 요청은 먼저 앱의 `update:status`와 `update:check`으로 대상 버전과 작업 상태를 확인한 뒤 처리한다. CLI 업데이트 요청에 앱 `update:*`를 사용하지 않는다.

<a id="release"></a>

## 배포 규칙

| 제품 | 버전 원본 | 태그 | Release 상태 | 배포 asset |
| --- | --- | --- | --- | --- |
| 앱 | `package.json` | `vX.Y.Z` | Latest | `RoadMusic-X.Y.Z-mac-arm64.dmg`, `RoadMusic-X.Y.Z-source.zip` |
| CLI | `cli/package.json` | `cli-vX.Y.Z` | Latest 아님 | `RoadMusic-CLI-X.Y.Z.zip` |

앱 릴리스는 앱 버전만 올리고 `release.yml`로 DMG와 앱 소스 ZIP을 게시한다. CLI 릴리스는 CLI 버전만 올리고 `release-cli.yml`로 CLI ZIP을 게시한다. 두 제품은 같은 GitHub 저장소를 쓰지만, 태그·노트·체크섬·asset을 공유하지 않는다.

이번 앱·CLI 0.1.0 초기화만 사용자 요청에 따른 예외다. 그 뒤 CI는 `scripts/release-version.js --product app|cli --tag TAG --releases-json FILE`로 제품별 최신 정식 Release를 확인하고, 해당 제품의 바로 다음 패치, 다음 마이너의 `.0`, 또는 다음 메이저의 `.0.0`만 허용한다. 같은 버전 재배포, 역행, 번호 건너뛰기, 다른 제품 태그는 거부하며, 각 제품의 manifest와 릴리스 노트도 같은 버전이어야 한다.

<a id="limits"></a>

## 제한과 복구

앱 자동 업데이트는 macOS에서 검증했다. Windows 앱 업데이트와 Linux 소스 설치는 별도 검증 대상이다. 앱은 현재 애드혹 서명이며 Apple 공증을 받지 않았다.

CLI 설치가 실패하면 기존 CLI·앱·데이터는 그대로 둔다. 새 폴더에 설치했으므로 해당 폴더와 오류를 확인한 뒤 다시 시도한다. 실제 앱 업데이트의 설치 실패와 복구 규칙은 앱 상태 응답과 [CLI 검수 결과](cli-qa-report.md)를 따른다.

이전 공유 번호의 CLI에는 독립 업데이트 명령이 없을 수 있다. 공개 CLI 0.1.0의 이전 키트는 당시 동봉 앱 소스 `1.4.0`을 보존하는 역사 배포이고, 새 CLI 0.1.0은 앱 0.1.0 소스를 동봉한다. 둘은 같은 CLI 버전이라 자동 알림으로 구분되지 않으므로 위의 새 폴더 수동 전환 절차를 쓴다. 이후 CLI 0.1.1 이상은 CLI 채널에서 독립적으로 알린다.

## HTML에서 확인하고 업데이트하기

제작 분석 → 프로그램·스킬 버전 상태에서 업데이트 확인을 누르고, 새 버전의 업데이트 버튼으로 대상과 범위를 확인한 뒤 실행한다. 진행 막대는 실제 처리 단계 또는 도구가 제공한 진행량을 표시한다. 모르는 진행량은 불확정으로 남긴다. 성공·실패·재시작/설치 확인 필요를 구분하며 확인된 버전으로 화면을 갱신한다.

앱은 기존 공개 `update:check`·`update:download`·`update:install`을, CLI는 `cli:update:check`·`cli:update:install`을 사용한다. CLI는 새 폴더의 검증된 `cliPath`를 제공하고 현재 실행 소스를 덮어쓰지 않는다. 스킬은 관리 설치된 묶음에 한해 기존 updater의 check/update를 호출한다. 소스 체크아웃은 버전 확인만 지원한다. 브라우저에서 명령이나 설치 경로를 임의 지정할 수 없다.

연결이 끊겨도 설치가 진행 중일 수 있다. 기존 작업 ID 또는 최근 요청으로 상태를 재조회하고 자동으로 재제출하지 않는다. 중단된 다운로드·설치는 확인 필요 상태로 남기며 같은 항목의 재설치를 막는다. 앱은 재시작 후 실제 실행 버전이 목표 이상임이 확인될 때만 적용 완료로 바뀐다.

## 2026-10-20 전체 배포 기준 초기화

사용자 요청으로 현재 소스의 Git main·정식 태그·Release를 0.1.0 기준으로 재구성합니다. 앱 `v0.1.0`, CLI `cli-v0.1.0`, 별도 music-road-skills `v0.1.0`을 사용합니다. 기존 공개 0.1.0과 같은 번호이고 과거 0.1.1·0.1.2보다 낮으므로 자동 업데이트 알림으로 새 기준을 식별할 수 없습니다. Release 체크섬을 확인하고 앱은 수동 설치, CLI·스킬은 기존 로컬 수정을 보존한 새 경로에 설치하세요. 이전 clone은 새 clone으로 전환합니다. 이전 설치·모델·작업물은 이번 초기화에서 변경하지 않습니다. 이 문서의 2026-10-15 검증은 당시 기록이며 새 배포 검증과 구분합니다.

### 이전 CLI의 큰 ZIP 검사 오류

일부 이전 CLI는 ZIP 검사 출력이 64KiB를 넘으면 목록을 잘라 읽어 `UPDATE_VERIFY` 오류가 발생할 수 있습니다. 새 관리 스킬 묶음으로 전환할 때 이 오류가 나면 안전 검사를 끄지 말고, Release의 CLI ZIP과 체크섬을 직접 확인한 뒤 새 빈 폴더에 풀고 `npm run setup:cli`로 설치하세요. 이번 새 0.1.0은 전체 목록을 제한된 크기 안에서 검사하고, 경로가 안전하지 않거나 한도를 넘으면 중단합니다. 관리 스킬 자산은 한 번만 담으며 설치기에서 금지한 심볼릭 링크를 사용하지 않습니다.
