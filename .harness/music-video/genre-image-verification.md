# 장르·형식과 이미지 선행 제작 검증

2026-10-16. 이번 변경은 재사용 MV 하네스 확장이다. 실제 새 곡·캐릭터·영상의 생성 결과가 아니다.

| 검사 | 결과 |
|---|---|
| upstream 구조 검사 | PASS: 5 agents, 2 skills, 0 errors |
| skill-creator frontmatter/설명 | Skill is valid. 기존 LTX venv의 PyYAML 사용, 새 패키지 설치 없음 |
| full-production harness-spec | --spec 구조 검사 OK |
| 새 preproduction gate | 17개 회귀 테스트 통과 |
| 기존 frame tools와 합산 | python3 -B -m unittest discover -s tests -p 'test_mv_*.py' → 27/27 OK |
| 기존 저장소 | npm test → 182/182 pass, fail/skipped0 |
| 독립 코드 검토 | APPROVE, 잔여 이슈0 |
| 독립 forward-test | 발라드 솔로 라이브, 3인 아이돌 록발라드 혼합, 수채화 트로트, 인물 없는 풍경·custom 장르·미사용 optional PASS |
| 이미지 없는 계획 | 구조 검증은 ok:true/ready:false, --require-ready는 exit3. 프롬프트만으로 영상 생성 진입 불가 |
| 요청 범위별 DAG | 기획3노드, 이미지 제작5노드, 전체 MV7노드의 초기화·의존성 검사 통과 |
| 최종 실행 장부 | mv-genre-image-20261016-final --complete 통과. 실제 builtin 대체 역할 ID·수신 결과·idle 관찰 기록 |

독립 검토 중 공집합 shots의 허위 ready, 다중 인물 시트, 개인 시트의 타 인물 identity 참조를 발견해 회귀로 고정했다. 캐릭터시트는 자신의 master 하나만 참조하며 의상·공간·그룹 단일 프레임은 별도 자산이다. enum/버전 타입 오류·손상 파일·경로 이탈·심볼릭 링크·검수 hash 불일치도 차단한다. 기존 shot-plan의 프레임/카메라/생성 메타데이터와 사용자 custom 장르는 허용한다.

수정 중 입력이 바뀐 초기 run은 stale 상태를 완료로 위장하지 않고 blocked 기록으로 보존했다. 소스 고정 뒤 새 run으로 재개하고 두 검토자가 최종 패킷·지문과 현재 소스를 다시 확인했다. 최종 소스 지문은 genre-image-source-hashes.json에 있다. 검증기 SHA-256은 f72e211b2e973260a25d70283bdc0336ce7a777ee39e6a1c6e23ced00e5cc50a다.

장르별 9건은 공식 MV/라이브/아티스트 영상의 분석 후보이며 실제 프레임을 이번에 관찰한 결과가 아니다. 현재 MV 인기 순위를 확인한 것도 아니다. 과거 음원 차트와 대표작·장르 적합 후보를 구분했다.

미실행: 실제 image_gen 이미지·LTX 생성·음악 청취·인물/공간 시각 동일성·새 custom-role 이름의 네이티브 로딩. 독립 검토는 노출된 builtin code-reviewer/verifier로 수행했다. 이미지 의미 품질은 파일·해시·검수 선언만으로 증명되지 않으며 실제 제작에서 master와 나란히 시각 비교해야 한다. Python LSP backend는 reviewer 환경에 없었고 AST/컴파일·실행 회귀로 확인했다.

기존 앱·CLI·renderer와 다른 사용자 변경, 원곡·가사·모델·전역 설정은 수정하지 않았다. 이미지 API wrapper·새 의존성·GUI 옵션은 추가하지 않았으며 선택값을 기획·프롬프트·자산·샷에 연결했다.
