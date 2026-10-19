# 구축 검증 결과

2026-10-16. 구축한 스킬·에이전트·분석 도구·워크플로우의 검증이며 완성 MV의 품질 검증은 아니다.

| 검사 | 실제 결과 |
|---|---|
| 요청된 upstream 하네스 | 18개 원본 파일 bytes 일치, revision 80f8217b5b6d3f220a31f05f9c0adaf09dac40f4 |
| upstream validate.py --project . | PASS, 4 agents·2 skills·0 errors |
| skill-creator quick_validate.py | Skill is valid. 기본 Python에 yaml이 없어 기존 LTX venv의 PyYAML로 실행; 설치 추가 없음 |
| harness-spec JSON 구조 | 설치된 별도 harness의 --spec validator OK. 해당 도구의 --project canonical-render 계약은 다른 생성기용이므로 호환되지 않음; [설계 기록](design.md)에 구분 |
| Python 구문 | 새 도구·테스트와 동봉 runtime 11개 AST 검사 통과 |
| 새 동작 테스트 | python3 -B -m unittest discover -s tests -p test_mv_tools.py → 10/10 OK |
| 기존 저장소 테스트 | npm test → 182/182 pass, fail0, skipped0 |
| diff 공백 검사 | git diff --check 통과 |
| 독립 행동 검증 | URL만 있는 요청의 정상 차단, 기획-only DAG, 단순 CD nontrigger, 추출과 의미/재생 coverage 구분 PASS |
| 독립 코드 검토 | 초기 2HIGH·2MEDIUM 발견 → 회귀 추가·수정 → 재검토 APPROVE, 잔여0 |
| 실제 상용 영상 | Armageddon 4,891/4,891, Manchild 5,669/5,669, format_version2 패키지 추출·hash 검사 |
| 실제 표본 의미 검토 | 각144프레임. 두 작품 audit --require-complete는 의도대로 exit3·complete:false·누락 범위를 반환 |

수정한 오류: JPEG·sheet·색인·HTML 변조 통과, 로컬 HLS의 종속 영상 미결속, 실패 패키지 용량 잔류, argparse 비JSON 오류. 단일 파일 demuxer·프로토콜 제한, source/package 해시, 실패 정리와 JSON 오류를 실제 fixture로 검증했다. OS hard quota를 구현한 것은 아니며 생성 중 순간 사용량은 제한을 넘을 수 있다.

실제 네이티브 호출은 현재 노출된 researcher/explore/executor/verifier/code-reviewer를 사용했다. 생성한 mv_* 역할은 TOML·연결 계약을 검사했지만 현재 세션에서 새 이름으로 로딩됐다고 주장하지 않는다. 다음 프로젝트 세션에서 발견할 수 있는 파일을 만들었다. 전역 모델·권한 설정은 변경하지 않았다.

하네스 장부는 `.harness/runs/mv-harness-smoke-20261016`의 실제 실패와 `mv-harness-smoke-20261016-v2`의 수정 재검토를 보존한다. v2에서 입력 계약이 동일한 행동 검증은 재사용하고 실패한 코드 검토만 재실행했다. 로컬 장부의 agent ID는 실제 native 도구 반환값이며 결과 수신과 유휴 확인을 구분했다. 코드 검토는 최신 실제 파일을 확인하고 hash를 재확인했으며, 최종 파일 지문은 final-source-hashes.json에 기록했다.

검증 범위 밖: 작품 전수 의미·정상속도/오디오 재생, 실제 신규 LTX 생성·한국어 가창 립싱크·군무·최종 Road Music 렌더, Windows/Linux, 새 custom-role 네이티브 로딩. Python LSP는 reviewer 환경에서 transport 종료로 사용할 수 없어 AST·실제 실행으로 보완했다.

현재 코퍼스 5편은 후보·수상·제작 크레딧 조사 상태와 원본 확보/프레임 관찰 상태를 각각 표시한다. 둘 중 하나를 다른 하나의 완료 증거로 대체하지 않는다. [실제 표본 분석](pilot-analysis.md)과 [환경 스냅샷](environment.json)을 함께 확인한다.
