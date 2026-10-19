# CLI 0.1.0 독립 업데이트 검증

> **초기화 전 검증 기록입니다.** 아래 ZIP 해시와 앱 소스 `1.4.0`은 철회된 첫 CLI 0.1.0 배포물의 증거이며, 새 0.1.0 설치 파일의 해시가 아닙니다. 현재 파일은 [제품별 Release](https://github.com/roadkwonai/music-road/releases)와 각 Release의 `SHA256SUMS.txt`를 기준으로 확인하세요. 당시 소스 기준은 `3f2542fc5ad0f2f9f92cbbdc7535af3bef598d71`입니다. Git 이력 초기화 뒤에는 해당 커밋의 공개 조회를 보장하지 않으며, 이 검증을 새 설치 재현 절차로 사용하지 않습니다.

검증일: 2026-10-15 · 환경: macOS Apple Silicon, Node.js 24 · 배포 커밋: `3f2542fc5ad0f2f9f92cbbdc7535af3bef598d71`

[사용 방법](updates.md#cli) · [AI 확인 순서](updates.md#ai) · [CLI Release](https://github.com/roadkwonai/music-road/releases/tag/cli-v0.1.0)

| 검증 | 결과 |
| --- | --- |
| 자동 회귀 테스트 | 164/164 통과. CLI 전용 테스트는 제품 구분·페이지네이션·CDN·ZIP 경로/심볼릭 링크·설치 완료 표식·기존 폴더와 Git 작업 폴더 보호를 확인 |
| 정적 검사 | 변경 JavaScript 21개 구문 검사와 `git diff --check` 통과 |
| GitHub 배포 | [CLI 전용 워크플로](https://github.com/roadkwonai/music-road/actions/runs/38667244821) 성공. `cli-v0.1.0`에 CLI ZIP과 체크섬만 게시 |
| 새 CLI 감지 | 공개 ZIP을 푼 격리 복사본의 CLI 버전만 `0.0.0`으로 바꾼 시험 환경에서 실제 GitHub의 `0.1.0`을 감지. `0.0.0`은 공개한 버전이 아님 |
| 실제 설치 | `cli:update:install`로 공개 ZIP·SHA-256 다운로드, npm 의존성 설치, 새 폴더 배치와 `current.json` 기록까지 통과 |
| 설치 후 확인 | 새 경로의 CLI `0.1.0`·동봉 앱 소스 `1.4.0`·프로토콜 `2`, 공개 명령 119개, 찬송가 지식 조회, 재확인 시 업데이트 없음 확인 |
| 선택적 전역 명령 | 격리 npm prefix에서 `cli` 폴더의 `npm link` 후 `road-music --version` 확인. 사용자 전역 링크는 변경하지 않음 |
| 앱·기존 환경 보존 | 앱 Latest는 `v1.4.0`. 기존 앱 PID와 기본 CLI 활성 기록이 그대로이며, 격리 앱 데이터 폴더가 생성되지 않고 원본 Git 작업 폴더도 깨끗한 상태 유지 |

검증한 공개 `RoadMusic-CLI-0.1.0.zip`의 SHA-256:

```text
97fc6833f4852aac36fbed2175bf8d92b1e67f946ec2d91149f85eaa2186bfee
```

앱 `v1.4.0` 태그와 기존 DMG는 그대로 보존했다. 잘못된 공유 버전 Release `v1.4.4`와 `v1.4.1`~`v1.4.4` 태그는 백업 후 철회했다. 이후 앱과 CLI는 각각 `vX.Y.Z`, `cli-vX.Y.Z`로 배포한다.

이번에는 실제 사용자 설치본·전역 링크를 바꾸거나 앱 DMG를 새로 만들지 않았다. Linux 실제 설치와 Windows 자동 설치, 음악 생성·마이크·청취 품질은 이번 검증 범위에 포함하지 않는다. Windows CLI 자동 설치는 지원하지 않는다. 이미 설치한 앱 1.4.4를 1.4.0으로 내리는 작업은 별도 수동 설치이며 CLI 업데이트가 수행하지 않는다.
