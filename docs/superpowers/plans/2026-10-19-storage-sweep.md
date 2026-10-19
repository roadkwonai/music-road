# 현재 Road Music 저장공간 전면 정리

목표는 현재 프로그램·모델·원음·완성 결과·필요한 수정 이력을 유지하며, 공개 CLI와 운영 스킬로 검증 가능한 재생성 캐시와 중복 검증 잔재를 정리하는 것이다. 현재 등록33프로젝트의 관리 cache는0B다.

1. 기존 CLI preview와 실제 디스크 인벤토리를 대조한다. 등록 밖 legacy renderer·packaging 검증·공용 분석 cache를 독립 조사한다.
2. 기능이 놓치는 실제 producer 형식을 찾으면 가장 좁은 origin 계약과 실패 회귀를 먼저 추가한다. 이름만 tmp/draft/cache라는 이유로 삭제 경계를 넓히지 않는다.
3. 추가 origin도 기존 목록→일회 미리보기→확인 이전→정리 계획→확인 정리 흐름과 HTML/스킬 계약을 유지한다. 자체 API가 필요한 공용 자료는 별도 계획과 사용 중 보호를 갖춘다.
4. 실제 계획을 검토하고 공개 CLI로만 실행한다. 원음·완성·승인·제작 설정의 해시를 전후 대조하며 프로젝트 정책을 임의 완료 처리하지 않는다. 다른 사용자 서비스를 중단하지 않는다.
5. 적격 cache0, 추가 생성 없음, 보존 검사·변경 회귀와 전체 테스트 통과를 종료 기준으로 삼는다. 보존해야 할 자료는 남긴 근거와 크기를 보고한다.

## 현장 조사로 확정한 보완

- 1MiB 초과라는 이유만으로 참조없음 판단이 불가능했던 실제2.1MiB JSON·1.14MiB JS는 최대16MiB/file·64MiB/project의 streaming검색으로 검증한다. 한도와읽기오류보호유지.
- production+preset CD 무음picture, complete+delivery해시가검증된oldnative parts를추가producer profile로지원한다. 기존일반draft/qa/모델보호는유지.
- explicitlocal-only receipt와ZIPsha가일치하는packaging검증ZIP3개만추가profile로지원한다. 실제배포ZIP·expandedprogram·엔진·모델·node_modules는보존한다. workspace표지는실제RoadMusicpackage/bin/CLI/AGENTS/Git이다. workspace사용량은관리폴더만계산해하위제작프로젝트와이중집계하지않는다.
- 공용video-cache약262MiB는열린파일은없지만defaultsource service와기존서비스가살아있어보존한다. 원본capture/remux와11.74GBanimatic도보존한다.

## 완료

공개CLI로media427파일443412276B+ZIP2파일488517908B=429파일931930184B추가정리. 승인source13경로부재와관리cache0/최종preview0확인. 보존파일2936sha불변(원본snapshot2937중승인parts설정1개중복수집은기록분리). npm281/281, storagePython58/58, CLI/구문/스킬/UI검증통과. 독립안전APPROVE. 공용앱cache262MiB·원본/완성/모델/프로그램/필수중간이력은보존. 자체Ego22와검수서버종료; 기존서비스유지.
