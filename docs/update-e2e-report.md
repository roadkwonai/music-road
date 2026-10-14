# 업데이트 전 과정 검증

검증일: 2026-10-15. 대상: macOS Apple Silicon, 실제 GitHub Release의 1.4.0 → 1.4.1.

이 보고서는 개별 모듈 테스트와 실제 앱 전체 실행을 구분한다. 이전 119개 테스트와 설치 도우미의 1.3.1 → 1.4.0 교체 성공만으로 GUI·CLI 전체 인계를 완료했다고 판단하지 않는다.

## 검증 기준

1. 기존 설치본이 현재 버전과 더 높은 정식 Release를 정확히 구분한다.
2. GUI 상단 배지와 CLI 알림으로 새 버전을 확인한다.
3. GUI 설치 버튼 또는 공개 `update:install` 명령으로 다운로드·검증·설치를 시작한다.
4. 기존 프로세스가 종료되고 설치 도우미가 새 파일을 반영한다.
5. 새 PID와 실제 앱·패키지 버전, 설치 결과를 확인한다.
6. 곡·모델·설정이 유지되며 새 앱에서 음원 가져오기·MP3 내보내기가 동작한다.
7. 오류를 성공으로 표시하거나 불확실한 설치 명령을 자동 재제출하지 않는다.

## 실행 중인 검증

| 경로 | 상태 |
| --- | --- |
| GUI 시작 시 알림 → 버튼 → 새 앱 | 검증 예정 |
| CLI 시작 시 알림 → 설치 → 새 앱 | 검증 예정 |
| 실제 15분 주기 → CLI 대기 알림 → 새 앱 | 검증 중 |
| 공식 Git 설치본 → 새 소스·의존성·서비스 | 검증 예정 |
| 실패·복구 및 기존 데이터 보존 | 검증 중 |

실행 증거는 각 `dist/update-e2e/<시나리오>/result.json`과 앱 로그에 저장한다. GUI 시나리오에는 실제 버튼을 누르기 전 알림 화면을 포함한다. 테스트는 별도 앱 복사본과 `ROADMUSIC_DATA_DIR`를 사용하며 실제 사용자의 앱·라이브러리를 교체하지 않는다.

## 재현

```bash
node scripts/verify-update-e2e.js --mode gui --baseline-app /absolute/path/to/1.4.0/Road\ Music.app --expected-version 1.4.1
node scripts/verify-update-e2e.js --mode cli --baseline-app /absolute/path/to/1.4.0/Road\ Music.app --expected-version 1.4.1
node scripts/verify-update-e2e.js --mode source --expected-version 1.4.1
```

실제 주기 검증은 새 Release가 나오기 전에 `--mode cli --notification periodic`으로 시작한다. 업데이트 조회를 수동 호출하지 않고 15분 타이머가 알림을 발생시키는지 확인한다.

다른 OS·다른 Mac의 Gatekeeper·관리자 권한이 필요한 설치·전원 중단은 별도 검증 범위다. 현재 앱은 Apple 미공증이다.
