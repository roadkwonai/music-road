# YuE 중심 CCM·모델별 사용 가이드 공식 대조 (2026-10-20)

공식 고정판 YuE2, 조회한 현행 main, 실제 고정 커뮤니티 MLX와 현재 공개 CLI를 대조했습니다. 원문 vendor·설치 모델·VAE는 바꾸지 않았습니다.

## 바로잡은 동작

- YuE 직접 참조 오디오 입력 금지: 권리·로컬 전사 가용성→검수 ABC→새 요청 경로를 안내합니다.
- 가사/style 변경은 새 prepare→generate입니다. 기존 song:render는 원곡 metadata의 가사/style을 재사용하므로 악보만 바꿀 때 사용합니다.
- prepare는 무추론 검증, mode:plan은 실제 악보 추론, mode:song은 음원 생성입니다. 승인 계획은 abc를 명시하거나 온전한 MLX plan을 재사용해야 보존됩니다.
- targetSeconds는 목표 기록이며 값만 바꾼 계획을 음악적 비교로 보지 않습니다.
- CFG는 semantic, ODE는 acoustic입니다. synthesize replay의 advanced는 odeSteps만, decode에는 advanced가 없습니다. artifact 무결성을 확인합니다.
- instrumental flag는 현재 무보컬 의도입니다. 보컬성부 이동·누출 제거를 보장하지 않습니다. 새 ABC 검사는 실제 계획 job 완료 뒤에 배치합니다.

## 내용과 사용 화면

YuE 고급 기본 사례34개를 추가해 CCM37개·일반20개로 확장했습니다. 전용 고급 문서에는16개 제어의 단계/기본값/주의, 계획과 음원화·가사/악보 변경·단계 재사용, 대표12프롬프트가 있습니다. 기존 CCM 상세 문서도 모델별12요청과 ACE8/YuE4 JSON 절로 구분했습니다.

사용 가이드는 YuE 기본이며 ACE와 하나씩 선택합니다. 본문·예시·목차·복사·다운로드·내부 링크까지 같은 모델로 분리합니다. 휴대형 HTML은 YuE 기본20개·ACE 전용19개로 총39개이며 동일한39개 Markdown과 모델별 파일 전환을 제공합니다. /ccm/의 반대모델 설명도 선택에 맞게 숨깁니다. HTML에서는 사용 가이드의 YuE 고급 활용으로 이동합니다.

## 검증

- 전체 npm369/369; source/canonical 관련Python 각각51/51; 가이드19·전용동작7회귀·구문/스킬 검증 통과. 일부 중복이므로 합산하지 않습니다.
- 공개 song:prepare로 YuE JSON4개를 실제 검증했습니다. native/effective/원문 전달과 synthesis:not-run, context:requires-runtime-tokenizer를 확인했습니다.
- 실제 Ego에서 YuE JSON4개/ACE JSON8개 분리, 상대모델 절·YuE-only sidebar 제거, 모델유지 문서 이동, ACE Markdown 다운로드, YuE-only 수동 복사, CCM37개·고급12예시 진입,390px 넘침0·Paperlogy를 확인했습니다.
- 최종 독립 검수의 잔여(승인ABC 명시·계획완료 전 검사 순서·오래된 render 설명)는 복사 단위와 회귀 테스트로 추가 수정했습니다.
- source/canonical16파일 일치, 기존 샘플최종5개 SHA변화0. 테스트용 임시파일은 제거하고 이 기록과 화면만 남깁니다.

## 확인 범위

새 모델 추론·실제 가창 청취·다른OS·릴리스/배포는 수행하지 않았습니다. 준비 통과는 실제 tokenizer 예산/완주/한국어 가창 품질 인증이 아닙니다.

공식 근거: [고정 generation](https://raw.githubusercontent.com/multimodal-art-projection/YuE/9c6c4b349be978b06a9d0d958471a07a6cdeff4d/docs/generation.md), [입력·수정·재사용](https://raw.githubusercontent.com/multimodal-art-projection/YuE/9c6c4b349be978b06a9d0d958471a07a6cdeff4d/skills/yue2-music/references/generation-and-covers.md), [실행 MLX usage](https://raw.githubusercontent.com/vanch007/mlx-Yue/c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8/docs/usage.md).
