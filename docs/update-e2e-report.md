# 업데이트 전 과정 검증

> 과거 검증 기록: 아래 1.4.1~1.4.4 공유 버전 태그·릴리스는 제품 버전 분리 과정에서 철회했습니다. 결과의 실제 버전·날짜는 바꾸지 않았으며, 옛 공개 다운로드를 사용하는 재현 명령은 현재 그대로 실행할 수 없습니다. 현재 설치는 [앱 1.4.0 / CLI 0.1.0 안내](../releases/README.md), 고정 커밋 기반 소스 복구 검사는 `scripts/verify-source-update.js`를 따릅니다.

검증일: 2026-10-15. 환경: macOS Apple Silicon, Node.js 24, 실제 GitHub 정식 Release.

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

> [!NOTE]
> 이 문서는 2026-10-15에 수행한 업데이트 시험 기록이다. 이후 릴리스와 다른 운영체제에서 같은 결과를 보장하지 않는다.

이전 119개 모듈 테스트와 설치 도우미 단독 교체만으로 GUI·CLI 전체 업데이트를 완료했다고 판단하지 않는다. 이 보고서는 알림부터 설치 인계, 새 앱 실행, 데이터 보존과 실제 사용까지 별도 설치본에서 확인한 결과다.

## 목차

- [정식 배포본 1.4.0 → 1.4.2](#release-140-142)
- [발견한 문제와 수정](#fixed-issues)
- [실패·복구 검증](#recovery)
- [정식 최신 1.4.3의 설치 검증](#release-143)
- [재현과 증거](#evidence)
- [검증 범위](#scope)

<a id="release-140-142"></a>

## 정식 배포본 1.4.0 → 1.4.2

| 시나리오 | 결과 | 확인 내용 |
| --- | --- | --- |
| GUI 자동 알림 → 업데이트 버튼 | 통과 | 실제 상단 알림과 DOM 버튼 클릭, 다운로드·교체, 보이는 새 앱·새 PID·1.4.2 |
| CLI 알림 → `update:install` | 통과 | 공개 CLI 명령, 숨겨진 새 서비스·새 PID·1.4.2 |
| 실제 15분 주기 → CLI 알림 → 설치 | 통과 | 수동 조회 없이 899,954ms 후 자동 확인·JSONL 상태 이벤트, 새 앱 1.4.2 |
| 공식 Git 소스 → 새 서비스 | 통과 | 실제 공개 저장소·정식 태그 fetch, npm ci, 소스·의존성 교체, 새 서비스 1.4.2 |
| 영상 렌더 중 설치 | 통과 | 설치 거부, 기존 PID 유지, 진행 중 렌더 완료 후 설치 |
| 기존 데이터와 업데이트 후 사용 | 위 경로 모두 통과 | 가져온 곡·프로젝트 및 설정·곡·모델 폴더 센티널 보존, 새 앱에서 WAV 가져오기·MP3 내보내기·전체 디코드 |

15분 검증은 최초 GitHub API HTTP 403을 오류로 표시한 뒤 다음 자동 주기에 정상 조회·알림·설치로 회복했다. 1.4.0의 도우미로 완료된 위 시험은 이후 추가된 준비 완료 확인을 검증한 시험과 구분한다.

<a id="fixed-issues"></a>

## 발견한 문제와 수정

- Git 주석 태그의 객체 SHA를 이전 커밋과 비교하던 문제: 태그를 실제 커밋으로 해석해 소스·의존성 복구를 수정했다. 1.4.1 도우미의 실패를 재현한 뒤 수정본의 복구를 확인했다.
- 실패 뒤 이전 앱을 중복 실행하던 문제: 복구 재시작을 한 곳에서 한 번만 수행한다. 위 두 수정은 1.4.2에 포함됐다.
- 새 프로세스가 1.5초 살아 있기만 하면 성공으로 간주하던 문제: 실제 서명된 즉시 종료 앱으로 조기 성공을 재현했다. 1.4.3 도우미는 공개 CLI 상태의 새 PID·목표 버전을 확인하고 준비 상태가 1.5초 유지된 뒤 성공을 기록한다.
- 검증 도구가 상태 조회에 허용 범위를 넘는 timeout을 넣어 시작 실패로 오인하던 문제를 수정했다. 설치 중 조회 연결 손실은 읽기 재시도로 처리하며 설치 명령은 자동 재제출하지 않는다. 과거 성공 결과가 남아 있어도 이번 목표 버전의 설치 결과를 기다린다.

<a id="recovery"></a>

## 실패·복구 검증

실제 Git 저장소·npm 의존성을 사용하는 `scripts/verify-source-update.js`에서 정상 전진, 로컬 수정 거부, 이력 분기 거부, 새 앱 시작 실패 후 HEAD·node_modules 복구와 이전 버전 단일 재시작이 통과했다. 이 시험은 Release CI에서도 수행한다.

`scripts/verify-mac-update-rollback.js`는 별도 정식 1.4.0 앱과 서명된 실패 후보 DMG를 사용했다. 새 후보가 종료 코드 71로 종료되자 이전 번들을 복원하고 실제 CLI가 1.4.0으로 응답했으며 이전 앱 실행은 1회였다. 서명됐지만 번들 ID가 다른 DMG도 교체 전 거부했다. 두 경우 모두 설정·곡·모델 센티널을 보존했다.

<a id="release-143"></a>

## 정식 최신 1.4.3의 설치 검증

정식 1.4.0 앱에서 최신 정식 1.4.3으로의 GUI·CLI 업데이트가 통과했다. 추가로 준비 완료 수정을 포함하고 실제 패키지 버전이 1.4.2인 시험용 기준 앱·소스에서 공개 정식 1.4.3으로 업데이트했다. 버전 응답이나 네트워크를 가짜로 바꾸지 않았으며, 새 설치 결과의 `appReady: true`와 PID가 실제 새 서비스와 일치했다. 이 시험용 기준 앱은 공개 v1.4.2 DMG와 구분한다. 소스 기준 커밋은 `e2515d2936f29dbdd26966cb0e232c10f166aa2d`다.

| 경로 | 결과 |
| --- | --- |
| 정식 1.4.0 GUI 버튼 → 정식 1.4.3 | 통과 |
| 정식 1.4.0 CLI → 정식 1.4.3 | 통과 |
| 새 도우미 GUI 버튼 → 정식 1.4.3 | 준비 완료·PID 일치 통과 |
| 새 도우미 CLI → 정식 1.4.3 | 준비 완료·PID 일치 통과 |
| 새 도우미 Git 소스 → 정식 1.4.3 | 준비 완료·PID 일치 통과 |

다섯 경로 모두 기존 곡·프로젝트·설정·모델 폴더 센티널을 보존하고 새 앱의 WAV 가져오기·MP3 내보내기·전체 디코드를 통과했다. 과거 버전의 성공 결과를 미리 남긴 상태에서도 이번 목표 버전의 결과를 기다려 검증했다. 공개 [v1.4.3 Release](https://github.com/roadkwonai/music-road/releases/tag/v1.4.3)와 [CI의 테스트·실제 Git 복구·빌드·서명·DMG·해시 검사](https://github.com/roadkwonai/music-road/actions/runs/38652302553)가 모두 성공했다. 호스트 경로를 제외한 [실행 결과 JSON](update-e2e-results.json)도 함께 보관한다.

<a id="evidence"></a>

## 재현과 증거

```bash
node scripts/verify-update-e2e.js --mode gui --baseline-app /absolute/path/to/1.4.0/Road\ Music.app --expected-version 1.4.2
node scripts/verify-update-e2e.js --mode cli --baseline-app /absolute/path/to/1.4.0/Road\ Music.app --expected-version 1.4.2 --busy-check true
node scripts/verify-update-e2e.js --mode source --expected-version 1.4.2
node scripts/verify-source-update.js
node scripts/verify-mac-update-rollback.js --baseline-app /absolute/path/to/1.4.0/Road\ Music.app
```

최신 Release가 예시보다 높아지면 `--expected-version`도 실제 목표 버전에 맞춘다. 실제 주기 시험은 `--mode cli --notification periodic`으로 실행한다. 수동 업데이트 조회 없이 최대 15분 자동 확인을 기다린다. 새 도우미를 포함한 기준 설치본은 `--baseline-version 1.4.2 --expected-version 1.4.3 --require-ready true`로 검사한다. 소스 기준 커밋은 `--baseline-ref`로 지정한다.

원본 증거는 각 `dist/update-e2e/<시나리오>/result.json`, 앱 로그와 GUI 알림 스크린샷, `dist/verify-mac-update-rollback.json`에 저장한다. 시험은 별도 앱 복사본과 `ROADMUSIC_DATA_DIR`를 사용하며 사용자의 실행 앱·라이브러리를 교체하지 않는다. 모델 폴더 보존은 센티널로 확인했으며 모델 전체 재설치·재생성은 이 업데이트 시험에 포함하지 않았다.

<a id="scope"></a>

## 검증 범위

전체 회귀 테스트 121/121, 변경 JavaScript 구문과 diff 검사가 통과했다. 별도 lint·TypeScript 설정은 없다.

Windows 자동 설치와 비-Git ZIP 소스 자동 교체는 지원하지 않는다. Linux의 실제 실행, 다른 Mac의 Gatekeeper·관리자 권한 설치·디스크 부족·전원 중단은 검증하지 않았다. 현재 앱은 애드혹 서명이며 Apple 미공증이다. 이전 버전 도우미의 제한은 [업데이트 가이드](updates.md)를 따른다. 모든 OS·환경에서의 무결함을 뜻하는 결과는 아니다.

## 2026-10-20 이후 소스 업데이트 회귀 검증

Git 이력 초기화 이후 `scripts/verify-source-update.js`는 공개 과거 커밋 대신 임시 로컬 bare 원격과 0.1.0→0.1.1 두 커밋·주석 태그를 자체 구성합니다. 실제 npm 설치, fast-forward, 로컬 수정·분기 거부, 시작 실패 시 HEAD·의존성 롤백을 검증합니다. 로컬 원격 허용은 테스트용 helper 복사본에만 적용하며 제품의 공식 원격 제한은 유지합니다. 앞선 공개 커밋·실제 설치 수치는 당시 검증 기록으로 남깁니다.
