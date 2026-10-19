# MV 하네스 설계 기록

2026-10-16. 신규 구축. 기존에는 ACE 작사 스킬, 공개 배경·스펙트럼 영상 CLI와 별도 LTX 실험 출력이 있었고 프로젝트 MV 하네스는 없었다. 사용자 요청은 재사용 가능한 연구·분석·제작 시스템이며 현재 특정 곡의 생성 실행은 아니다.

## 선택

파이프라인+독립 검수. 원곡/레퍼런스 분석→감독 통합→사전 검수→proof/제작/편집→최종 검수. 레퍼런스별 독립 작업만 선택적으로 병렬화한다. 인물·미술·샷은 하나의 bible로 통합하고 다수 작가의 동시 수정을 허용하지 않는다. 스킬 하나, 안정적 도메인 역할 넷, 결정적 도구 둘을 만들었다.

## 실제 사용한 기반

요청된 revfactory/codex-harness를 임시 경로에 clone하고 HEAD `80f8217b5b6d3f220a31f05f9c0adaf09dac40f4`의 skill bundle을 변경 없이 동봉했다. LICENSE/NOTICE와 revision 기록을 추가했다. upstream create_agent로 역할을 생성하고 run.py/validate.py로 독립 검증 장부를 사용했다. 기본 seed 역할·전역 config·모델·서비스·자동 업데이트는 추가하지 않았다.

로컬에 이미 설치된 별도 harness 스킬의 artifact JSON 계약은 `harness-spec.json`의 구조 점검에 사용했다. 해당 설치본 project validator는 자기 scaffold의 canonical English sections/TOML rendering만 허용하므로 이 upstream의 handwritten-domain 형식에는 호환되지 않는다. 두 생성기를 혼합해 source를 바꾸지 않았으며, 프로젝트 검증 기준은 요청된 upstream의 validate.py다. 이 호환성 차이를 검증 통과로 위장하지 않는다.

## 범위와 변경

신규 `.agents/skills/harness`, `road-music-mv`, `.codex/agents/mv_*.toml`, 프로젝트 `.codex/skills` 호환 링크, 도구 테스트, 사용자 안내와 이 설계·검증 기록만 추가했다. AGENTS.md에는 짧은 스킬 포인터만 병합했다. 시작 시 존재한 앱·CLI·renderer·기존 문서·테스트의 사용자 변경은 수정하지 않았다. 새 패키지 의존성은 없다.

## 완료 기준

스킬 frontmatter/링크/역할과 DAG 검사, 실제 ffmpeg 입력의 프레임·PTS·컷 후보·coverage·실패 경계, 독립 realistic forward-test, 기존 npm test가 근거다. 실제 작품의 예술적 품질·가창 립싱크·군무는 별도의 제작 실행에서 검증한다. 전수 분석은 추출과 관찰 coverage를 모두 요구한다.

## 보존한 제한

초기 코퍼스의 수상·크레딧과 감독 방법론은 조사했지만 전 프레임 관찰 여부는 작품별 상태다. 동작 기준선도 입력 부재·완벽 보장 회피를 이미 잘 처리했으므로 스킬이 모든 판단을 새로 가능하게 했다는 개선 수치는 주장하지 않는다. 스킬의 구체적 추가 가치는 반복 분석의 PTS/원본 바인딩, 검토 coverage 검증, 실제 LTX/앱 경계, 재사용할 제작 산출물·검수·재개 계약이다.
