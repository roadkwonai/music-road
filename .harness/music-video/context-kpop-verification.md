# MV 음악 작업 분리·그룹 세계관·K-POP 연구 보완 검증

2026-10-16. 음악 제작·후보 청취/평가·곡 선정은 별도 작업이며, MV는 확정된 원본 음원·가사·길이·SHA-256 인계부터 시작한다. 확정 음원의 구간·리듬·감정 해석과 완성 MV 소리/영상 동기 검수는 유지한다.

추가/보완: `validate_mv_context.py`, 선택적 `validate_preproduction.py --bible`, 캐스트·세계관 예시와 문서, 7노드 DAG·역할·품질 게이트 연결, 감독 직접 인터뷰·세 작품 관찰 기반 K-POP 제작 지침. 새 의존성·음악 제작 노드·사용자 앱 기능은 추가하지 않았다.

| 검증 | 근거 |
|---|---|
| MV Python | `python3 -B -m unittest discover -s tests -p 'test_mv_*.py'` 37/37 OK, `/tmp/mv-context-python-final-v2.log` |
| 기존 저장소 테스트 | `npm test` 183 pass, fail/skipped 0, `/tmp/mv-context-npm-final-v2.log` |
| 구조·문법 | upstream harness PASS, spec OK, skill-creator valid, AST/JSON/TOML/스킬 링크·diff check PASS |
| 독립 코드 검토 | builtin code-reviewer APPROVE, 20개 입력 snapshot 일치, 27개 targeted tests 통과, 미해결 critical/high/medium 0 |
| 독립 현실 시나리오 | builtin verifier APPROVE, 20개 입력 일치, 7개 targeted cases 및 그룹/록 라이브/무인 풍경/혼합 시대/optional 자산 계약 확인 |
| 실행 장부 | `mv-context-audit-20261016-v2 --complete` 0 completion errors. 실제 native ID와 완료·idle 관찰 기록 |
| 실제 기획 Bible | LUMI:4 제안과 동봉 예시 모두 `validate_mv_context.py --bible` 통과 |
| 영상 관찰 무결성·범위 | 세 작품 총13,602프레임 타일 관찰·누락0, 확대21장. `playback_reviewed:false`로 full-complete 감사는 세 건 모두 exit3 |

독립 검토에서 JSON 참조 중첩 타입 오류, 의상 역방향 목록 누락, 고정 세계 연도 불일치, 종류 내부 및 종류 간 asset ID 중복을 발견해 회귀로 고정했다. 미사용 후보 의상·장소는 생략할 수 있고, 실제 선택한 의상만 소유자·장소·자산·키프레임 참조까지 연결한다. 기존 Bible 없는 솔로·라이브·무인 계획과 missing images의 ready=false를 보존한다.

첫 검토 중 수정된 3개 입력을 stale 상태의 승인으로 쓰지 않았다. 이전 실행은 보존하고 새 고정 실행에서 재검토했다. upstream의 `file\0` prefix 해시를 일반 파일 SHA와 비교했던 검토 계산 방식도 정정했고, 최종 두 검토는 공식 `snapshot_inputs`/`validate_context`를 사용했다. 최종 역할은 현재 노출된 built-in 대체 역할이며 새 `mv_*` 이름의 네이티브 동적 로딩을 검증한 것이 아니다.

K-POP 결과는 `Output/kpop-mv-directing-research-20261016/research-report.md`, 실제 범위/해시는 각 작품의 manifest·merged-review·coverage 및 `context-source-hashes.json`에 있다. 현재 차트와 과거 수상·대표작, 감독 증언과 개별 장면 관찰·생성용 추론을 구분했다. 자동 분석은 오류·길이 불일치로 근거에서 제외했다.

미실행: 최종 음원 인계 뒤의 실제 MV 구간 분석·가창/연주 동기, image_gen 자산·시각적 인물 동일성, LTX proof·생성·렌더, 정상속도 전체 재생 및 정밀 전체 EDL. 기획·파일·계보 검증은 실제 얼굴 일관성·완성 영상 품질의 증거가 아니다. LUMI:4의 4인·2032년·장소·의상은 확정 제작물이 아니라 제안이다.

기존 앱·CLI·renderer·사용자의 다른 변경·원곡·모델·전역 설정을 보존했다. 브라우저 TaskSpace 8은 finish 완료했으며 Ego Lite 업데이트는 실행하지 않았다.
