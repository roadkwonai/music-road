# 앱과 CLI 업데이트

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

Road Music 앱과 CLI는 별도 버전과 별도 GitHub Release를 사용한다. 앱 정식 버전은 `package.json`과 `vX.Y.Z` 태그를 따르며, 현재 기준은 1.4.0이다. CLI 정식 버전은 `cli/package.json`과 `cli-vX.Y.Z` 태그를 따르며, 현재 기준은 0.1.0이다. 앱 최신 Release와 CLI 최신 Release를 서로 대체하지 않는다.

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

<a id="cli"></a>

## CLI 업데이트

CLI는 `cli-v*` 정식 Release만 조회한다. `cli:update:*`는 앱을 시작·교체·재시작하지 않으며, GUI·모델·곡·기존 Git 작업 폴더를 변경하지 않는다.

```bash
node cli/road-music.js cli:version
node cli/road-music.js cli:update:check
node cli/road-music.js cli:update:install \
  --json '{"targetDir":"/absolute/path/road-music-cli-0.1.0"}' \
  --timeout 1800000
```

`cli:update:check`은 읽기 전용이며 `cli-v*` 태그 중 현재 CLI보다 높은 정식 버전과 노트를 반환한다. 앱의 `/releases/latest` 결과를 CLI 최신 버전으로 사용하지 않는다. 조회 오류는 “최신”으로 바꾸지 않으며, 현재 CLI를 계속 사용하고 오류를 보고한다.

`cli:update:install`은 새 빈 폴더에 `RoadMusic-CLI-X.Y.Z.zip`을 설치한다. `targetDir`를 생략하면 사용자 CLI 저장소의 `X.Y.Z` 폴더를 사용한다. 기존 폴더를 덮어쓰지 않으며 `sudo`도 사용하지 않는다. 설치 뒤 반환된 `cliPath`에서 `--version`, `schema`, `prompt:knowledge`를 실행해 설치본을 검증한다. 새 AI 세션은 `ROADMUSIC_CLI_HOME`이 있으면 그 아래의 `current.json`, 없으면 `~/.local/share/road-music/cli/current.json`을 먼저 확인해 이 경로를 찾는다.

`cli:update:install`이 반환한 새 경로로 이후 명령을 실행한다. 전역 `road-music` 링크가 예전 키트를 가리키면 자동으로 바꾸지 않는다.

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

앱 릴리스는 앱 버전만 올리고 `release.yml`로 DMG와 앱 소스 ZIP을 게시한다. CLI 릴리스는 CLI 버전만 올리고 `release-cli.yml`로 CLI ZIP을 게시한다. 두 제품은 같은 GitHub 저장소를 쓰지만, 태그·노트·체크섬·asset을 공유하지 않는다. 이미 공개한 태그·Release·asset은 변경하거나 재사용하지 않는다.

<a id="limits"></a>

## 제한과 복구

앱 자동 업데이트는 macOS에서 검증했다. Windows 앱 업데이트와 Linux 소스 설치는 별도 검증 대상이다. 앱은 현재 애드혹 서명이며 Apple 공증을 받지 않았다.

CLI 설치가 실패하면 기존 CLI·앱·데이터는 그대로 둔다. 새 폴더에 설치했으므로 해당 폴더와 오류를 확인한 뒤 다시 시도한다. 실제 앱 업데이트의 설치 실패와 복구 규칙은 앱 상태 응답과 [CLI 검수 결과](cli-qa-report.md)를 따른다.
