# 공개 명령 조합 활용 가이드

이 문서는 [`command-recipes.json`](command-recipes.json)의 43개 일반 제작 레시피를 설명합니다. 제작실의 **공개 명령 상세 활용 가이드**에서는 이 데이터를 장르·스타일·목적·태그로 필터링하고, 각 프롬프트를 복사할 수 있습니다. CCM 전문 레시피는 별도 CCM 페이지에서 다룹니다.

## 먼저 보는 기준

레시피 문장은 복사해 쓸 수 있는 기본 예시입니다. 상세 활용·CCM 페이지의 엔진 버튼은 **ACE와 YuE 중 하나만** 선택합니다. 기본값은 YuE이며, 초기화해도 YuE로 돌아갑니다. `공통` 레시피는 생성 엔진을 고르는 카드가 아니라 조회·검토·기록 흐름 카드입니다. 실제 입력 계약은 실행 중인 다음 명령 결과가 최종 기준입니다.

```bash
node cli/road-music.js schema --json '{"command":"song:generate"}'
```

문서에 있는 업스트림 기능, 특정 모델의 예시, 또는 자연어의 요청이 현재 `schema`에 없는 JSON 키를 추가할 권한은 아닙니다. `prompt:knowledge`는 제작 지식, `prompt:compose`는 style 조합, `song:prepare`는 생성 전 전달본 검토이며 셋 모두 음악을 생성하지 않습니다.

## 레시피를 읽는 방법

- **목적**은 `새 음악 제작`, `가사 수정`, `편곡 비교`, `영상 연결`, `검수·복구`의 짧은 필터입니다.
- **스타일**은 장르 분류입니다. 레시피 안의 `prompt`와 `ingredients`가 실제 편성·보컬·구성 의도를 설명합니다.
- **조합 요소**는 왜 가사, style, 악기, BPM, 구조, seed, 악보를 함께 쓰는지 알려줍니다.
- **명령 순서**는 실행 순서와 이유입니다. 생성은 검토·승인 뒤에만 제출하고, jobId를 돌려주는 명령의 결과는 `job:wait`으로 확인합니다.
- **응용 변형**은 한 번에 한 요소만 바꾸는 방식입니다. 서로 다른 장르를 `count` 한 번에 섞지 않습니다.

## 장르·스타일 레시피

| 스타일 | 추천 조합 | 잘 맞는 경우 | 주의 |
| --- | --- | --- | --- |
| 발라드 | piano + cello, 68 BPM, restrained verse / wider chorus | 가사와 보컬을 앞세울 때 | 정확한 보컬 음색을 보장하지 않음 |
| 어쿠스틱 포크 | acoustic guitar + cello, 느린 서사 | 일상·이야기 가사 | 기타·현악을 너무 많이 나열하지 않음 |
| 록 발라드 | electric guitar + bass guitar + drums, 후렴 상승 | 밴드 에너지와 후렴 대비 | 리듬 악기와 `strict:true`를 충돌시키지 않음 |
| 재즈 라운지 | Rhodes electric piano + upright bass + brushed drums | 낮은 밀도·늦은 밤 감정 | 특정 재즈 표준곡·연주 복제를 요청하지 않음 |
| 전자 팝 | synthesizer + synth pads + drums, pre-chorus 빌드업 | 현대적 리듬 팝 | 전용 신스 프리셋·스템 제어를 가정하지 않음 |
| 로파이 | Rhodes + soft drums, `instrumental:true`, `loop` | 공부·독서 배경 | 무한 루프·정확한 길이를 보장하지 않음 |
| 시네마틱 | piano + french horn + orchestra, `theme` | 영상 전 단계 테마 | 영상 타임코드 싱크는 별도 작업 |
| 트로트 | accordion + bass guitar + drums | 분명한 박자·후렴 | 특정 가수 창법·선율을 재현하지 않음 |
| 체임버 팝 | classical guitar + violin + cello | 섬세한 작은 편성 | 파트별 분리 트랙을 보장하지 않음 |

각 항목은 JSON 레시피의 완결된 한국어 요청, 두 가지 응용 변형, 검토 순서를 제공합니다. 장르명만 바꾸는 것보다 가사·악기·BPM은 유지하고 한 요소만 바꿔 비교해야 선택 이유를 남길 수 있습니다.

## 옵션을 안전하게 조합하는 법

### 가사와 style

실제로 부를 문장과 `Verse`·`Chorus` 같은 섹션 표기는 `lyrics`에 둡니다. 보컬 성향, 편곡, 믹스, 구간 에너지 같은 지시는 `style`에 둡니다. `lyrics:clean`은 점검본이지 사용자 원문을 덮어쓰는 명령이 아닙니다. 의미가 바뀌거나 중요한 반복이 사라지면 생성 전에 해당 차이만 다시 검토합니다.

### 악기와 BPM

`parts.instruments`에는 현재 schema가 허용한 정확한 악기명만 사용합니다. `guitar`, `strings`, `808`처럼 허용 목록에 없는 단어는 악기 배열에 넣지 않고, 정말 필요한 질감이라면 style의 자연어로 한계를 밝힌 채 요청합니다. BPM은 리듬 목표이고 실제 측정값은 아닙니다.

### structure·instrumental·targetSeconds

`structure`는 허용된 `pop`, `short`, `theme`, `loop` 중 하나로 골격을 요청하는 값입니다. 가사를 자동 작성하거나 정확한 마디 수를 고정하지 않습니다. `instrumental:true`이면 가사는 입력에 쓰이지 않습니다. `targetSeconds`는 목표 길이·기록값이며 완료 파일의 실제 길이와 별도로 확인합니다.

### 후보와 seed

`count`는 같은 사양의 후보 수입니다. 후보 비교에서는 가사·style·악기·BPM을 고정하고 seed만 바꿉니다. 같은 seed가 모든 환경에서 같은 파일을 보장하지 않으며, 채택은 실제 청취 메모까지 포함해 결정합니다.

### 지원하지 않는 negative 요청

`negativePrompt`, stems, 믹서 제어처럼 현재 schema에 없는 키는 넣지 않습니다. “강한 드롭은 피하고 싶다”는 요청은 `sparse arrangement`, `restrained rhythm`처럼 style의 긍정 방향으로 바꾸고, 절대 배제 기능이 아니라는 한계를 표시합니다.

## ACE와 YuE의 경계

ACE는 최종 caption 512자·정리 가사 4,096자 한계를 확인합니다. YuE·`yue-mlx`에는 이 ACE 한계를 옮기지 않습니다. YuE에서는 `yue:capabilities`와 `song:prepare`로 실효 고급 옵션·원생 요청을 확인하고, 목표 길이·자연 EOS·실제 길이·잘림을 따로 기록합니다.

YuE의 `advanced`, seed, ABC는 기준선을 먼저 남긴 다음 한 번에 하나만 바꿉니다. 가사 수정에서 기존 ABC를 유지할지 새 악보를 쓸지는 “가사 전달 우선”과 “선율 보존 우선” 중 어느 쪽인지 먼저 선택합니다. `score:inspect`는 source와 candidate 각각에, `score:compare`는 둘의 불변조건 비교에 사용합니다. 가사/style을 바꾸면 변경한 전체 lyrics·style·선택 engine·검증한 abc를 담아 새 `song:prepare`→`song:generate`로 전체 새 음원을 만듭니다. `song:render`는 기존 가사/style을 재사용하는 악보만의 수정에 한정합니다. 두 경로 모두 부분 파형 수정이 아니며 반환된 jobId는 `job:wait`으로 확인합니다. 이 두 score 명령은 악보 차이 검사이지 음질·가창 품질 검사가 아닙니다.

## 표준 제작 흐름

1. `cli:schema`, 필요하면 `prompt:knowledge`로 현재 계약과 근거를 확인합니다.
2. 가사가 있으면 `lyrics:sections`, `lyrics:clean`, `lyrics:check`로 원문과 점검본을 구분합니다.
3. 같은 가사·악기·BPM으로 `prompt:compose`를 실행합니다. YuE면 `yue:capabilities`, `song:prepare`를 더 확인합니다.
4. 최종 제목·가사·style·입력 JSON과 변경 notes를 검토합니다. 자동 위임이 아닌 경우 승인 전에는 생성하지 않습니다.
5. `song:generate`·`song:render`·`song:replay`처럼 jobId를 돌려주는 명령은 `job:wait`으로 확인하고, `song:detail`에서 실제 절대 경로·파일·길이를 확인합니다. 동기 명령에는 `job:wait`을 덧붙이지 않습니다.
6. 생성·렌더가 자동으로 남긴 이력은 `production:prompts`, `production:tasks`, `production:files`로 조회합니다. 별도의 실제 검수 작업을 수행할 때만 그 작업을 `production:request` → `production:task-start` → `production:task-finish` 순서로 기록합니다.

연결 오류가 `uncertain:true`면 같은 요청을 자동 재제출하지 않습니다. `app:state`, `queue:list`, `songs:list`, 기존 `jobId`를 먼저 확인합니다.

## 영상과 저장공간 연결

음원이 실제 완료된 뒤 `song:detail`이 반환한 경로를 사용해 `presets:list` → `video:preview` → `video:render` 순서로 연결합니다. 입력 음원·스타일 예시·중간 파일은 완성본으로 표시하지 않습니다.

완료 뒤 정리는 `storage:list` → `storage:preview` 또는 `storage:project-finish-preview`로 계획과 보호 사유·예상 확보량을 먼저 확인합니다. 정리는 확인한 `planId`와 명시적 `--confirm`이 있어야 합니다. 원음·모델·미등록 경로를 추측해 삭제하지 않습니다.

## 기록과 재사용

생성·수정·영상 작업이 자동으로 남긴 프롬프트·작업·파일 메타데이터는 재등록하거나 재종료하지 않습니다. 프로젝트 상세와 대시보드에서는 `production:prompts`, `production:tasks`, `production:files`, `production:dashboard`로 조회합니다. 사람이 실제로 수행한 별도 검수·리뷰만 새 `production:request`를 먼저 만들고 `task-start`·`task-finish` 순서로 남깁니다.

좋아요는 보관함에서 다시 찾기 위한 선택 표시입니다. 파일 보존·삭제 방지·최종 납품 지정은 아니므로, 버전 비교와 정리 전에는 `storage:versions`, `storage:version-diff`, `storage:file-remove-preview`의 보호 상태를 별도로 확인합니다.
