# 작업 폴더 유지보수·실제 HTML 정리 계획

요청 범위: Git 미참조 객체와 과거 설치 검증 복제본을 우선 안전 정리하는 CLI·스킬·HTML 기능을 만들고 실제 실행해 회수량을 측정한다. 프로그램·모델·최종 결과물·필요 이력과 현재 수정/스테이징/모든 worktree·refs·reflog는 보존한다.

## 기능 경계

- 선행 전체 스캔→분류/보호/후보 검증→미리보기→실행→재스캔 비교를 적용한다. 전체 스캔 완료·무오류·15분 scanId 없이 계획/실행 불가. 모든 숨김 폴더와 파일을 포함하고 외부 symlink는 따라가지 않으며 미확인 파일은 보호한다.
- source CLI의 현재 trusted Road Music workspace만 허용하며 사용자 임의 삭제 경로/Git 옵션은 받지 않는다.
- 기존 프로젝트 cache와 workspace 유지보수는 별도 범위로 표시한다. 명령: storage:maintenance-list, maintenance-preview, maintenance-cleanup, maintenance-history.
- preview scope는 git 또는 verification 하나. 후보 ID만 선택, 실행은 불변 만료 일회용 planId + 명시 확인. preview 뒤 변화나 활성 사용은 거부한다.
- Git은 현재 refs+복구 reflog+모든 worktree index/작업파일을 보호한다. 최근24시간 객체는 보존한다. GC/repack은 Git 공식 도구만, reflog/worktree prune과 hooks 비활성. 진행 중 writer·잠금·지원 외 저장소구조는 차단. pack 직접 삭제/prune=now/강제 이력재작성 금지.
- 검증복제본은 감사한7개 확장 키트·5개 과거 다운로드 캐시만 지원. 현재 프로그램/모델/곡/영상/실제 제작 프로젝트/원본ZIP/검증 receipt는 제외한다. 증거·재현 출처·current-use를 먼저 검사한다.
- 작업 의도·대상 manifest/hash·조건·작업 결과·보호 검사·정리 수량/용량 요약을 최소 이력으로 남긴다. 실패·부분 성공을 실제값으로 표시한다.
- 예상 논리량·실제 할당 감소·디스크 전체 여유 변화는 별도로 표시한다.

## 순서와 검증

1. 모듈별 fixture 회귀 테스트로 보호 경계·상태 변경·부분 실패·실행 권한을 고정한 뒤 구현한다.
2. 공통 CLI/catalog/packaging/docs/skill과 session-token/Origin/plan-bound HTML을 연결한다. dependencies 추가 없음.
3. 독립 안전 리뷰와 npm/구문/HTTP/스킬 테스트, 별도 tmp source repo에서 실제 유지보수 흐름을 검증한다.
4. 현재 workspace의 refs/reflog/index·작업 파일·모델·최종본/이력 기준선을 기록한다. 실제 HTML의 preview를 검수한 뒤 승인된 범위를 실행한다. 기존 사용자 앱/서버는 종료하지 않는다.
5. Git 유효 객체/현재파일/최종본/모델/필요이력 보존과 실제 회수량·잔여후보를 확인하고 문제를 수정해 재검수한다.

과거 프레임 증거·애니매틱·렌더 중간본·동일 내용 완성본은 근거 없는 이름기반 삭제로 확장하지 않는다. 삭제 입증이 없는 나머지는 보호 사유와 사용량을 보여준다.
