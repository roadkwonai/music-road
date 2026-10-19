# 음악 근거에서 전체 연출로

이 문서는 확정 음원을 받은 뒤 감독이 `direction/production-design.json`에 기록할 판단과, 그 판단을 이미지·스토리보드·애니매틱으로 잃지 않고 전달하는 방법을 정한다. 기획 문서나 예시 JSON은 실제 이미지, 독립 검수, 애니매틱, LTX 결과가 아니다. 원곡과 원문 가사는 별도 음악 작업의 인계물이며 이 과정에서 바꾸지 않는다.

## 먼저 고정할 것

인계받은 절대 음원 경로·raw SHA-256·실측 길이·가사와 타임코드·목표 화면 비율/FPS를 입력으로 남긴다. 감독이 실제로 확인한 구간·가사와 사용자/별도 음악 작업이 제공한 구간·가사 맵은 근거 주체를 구분해 `music_sections[].musical_event`에 쓴다. 가사나 비트가 아직 확인되지 않았다면 추측한 사건을 확정처럼 쓰지 않고, 계획을 `ready:false` 상태로 둔다. `delivery.total_frames`는 실제 음원 길이와 한 프레임 이내여야 한다.

장르, 영상 형식, 시대, 현실성, 캐스트 수·성별·연령은 노래와 브리프가 결정한다. 솔로 라이브가 맞으면 한 명으로, 인물이 불필요하면 cast 없이, 현실 공간이 맞으면 허구 또는 허락된 실제 장소로 설계한다. 네 명의 성인 그룹, 특정 성별, 현대 무대, 판타지는 기본값이 아니다. 새 가상 캐스트를 설계할 때 특정 원작 멤버의 얼굴이나 작품의 정확한 세트·샷 배열을 복제하지 않는다. 사용자가 제공했고 사용 권한이 확인된 실존 인물 참조는 그 정체성과 권한 범위를 보존한다.

둘 이상의 인물 또는 상세 세계관을 실제로 쓸 때는 `direction/bible.json`을 먼저 만들고, 각 멤버의 성인 여부/연령, 정체성 anchor, 의상 소유권, 허용 장소·시대·현실성, 화면축을 production design의 선택 이유와 일치시킨다. 이 Bible이 없는 새 다인 모드는 `keys`부터 `ready:false`이며, 단일 `hero` 예시는 기존 솔로·라이브 호환 경로로 Bible 없이 둘 수 있다. ID나 서술만으로 신체·연령·실존 장소·이미지의 일치를 보증하지 않으며, 실제 이미지와 독립 관찰 기록으로 확인한다.

의상·촬영지/대형 세트·소품은 [음악 맞춤 미술 조사](music-led-lookdev.md)를 거쳐 선택한다. 조사 URL/날짜·실제 본 사진·음악에 적용할 이유를 references에 남기고, 새 의상 master/시트·배경 각도·소품 key를 image plan과 연결한다. 실사형은 동기 있는 빛·정확한 크롭·원근/접촉·재질을 프롬프트와 독립 검수에 함께 쓴다.

## 16개 결정 영역

`production_design.decisions`의 모든 항목에는 구체적인 `choice`와 그 선택을 실제 구간·가사·정서·행동에 연결하는 `music_reason`이 필요하다. “시네마틱하게” 같은 형용사만으로는 결정이 아니다.

| 영역 | 기록할 선택 | 음악으로 설명할 이유 |
|---|---|---|
| `cast` | 인물 수·관계·등장/부재 | 화자, 응답, 고립 또는 앙상블의 필요 |
| `age_range` | 연령대 또는 해당 없음 | 가사 화자와 연기 가능한 행동의 범위 |
| `concept` | 공연·서사·혼합·추상과 핵심 모티프 | 곡의 구조가 요구하는 시각적 변화 |
| `wardrobe` | 실루엣·소재·팔레트·버전 | 구간의 온도·에너지와 인물 읽기 |
| `hair_makeup` | 헤어·메이크업의 연속성 규칙 | 가까운 샷에서 유지할 정체성과 정서 |
| `locations_sets` | 공간·시대·현실성·화면축 | 가사의 장소감과 반복할 모티프 |
| `props` | 소품의 형태·상태·사용자 | 행동을 가사/감정으로 보이게 하는 물체 |
| `performance_choreography` | 동작·시선·대형·연기 | 리듬에서 읽혀야 할 에너지와 호흡 |
| `camera_lenses` | 크기·앵글·이동·초점 의도 | 관객 거리와 구간별 긴장 변화 |
| `lighting_color` | 보이는 광원·방향·색·질감 | 도입/상승/후렴/결말의 감정 온도 |
| `film_look` | 실제 필름 촬영인지, 디지털/AI 룩인지 | 재질감이 감정과 시점에 주는 기능 |
| `vfx` | 합성/후반 효과와 실행 위치 | 기본 컷 뒤에만 남는 음악적 목적 |
| `transitions` | 컷·디졸브·그래픽 전환과 handle | 구간 사이의 연결 또는 단절의 이유 |
| `visual_sfx` | 비·연무·바람·먼지처럼 화면에 보이는 현상 | 장면의 공기와 리듬을 돕는 목적 |
| `sound_policy` | 원곡 보존과 sound SFX 사용 여부 | 추가 소리가 음악을 가리지 않는 근거 |
| `typography_graphics` | 제목/자막/그래픽의 유무·시점·가독성 | 가사 전달 또는 브랜딩 필요 여부 |

`visual_sfx`는 화면에 보이는 비·연무·바람·종이·먼지이며 `sound_policy`의 sound SFX와 다르다. 원곡 변경이나 임의의 효과음 추가는 허용하지 않는다. `film_look`에는 “실제 16mm 촬영”처럼 촬영 사실을 주장하지 말고, AI 디지털 생성물에 적용할 노출·그레인·색의 **룩 계획**인지 구분한다. 자연어 렌즈 초점거리·필름명은 모델의 정밀 제어값이 아니다.

## 필름·카메라 룩 결정

룩은 실제 필름 촬영, 일반 디지털 촬영, AI 디지털 룩 중 무엇인지 먼저 고른 뒤 화면비, 피부톤, 노출과 하이라이트 롤오프, 블랙 대비, 색온도, 그레인 크기, 할레이션, 흔들림, 모션 블러를 한 세트로 정한다. 각 특성이 생성 단계인지 후반 단계인지도 적는다. 실제 필름 stock·카메라 기종은 실제 촬영을 요청했고 공식 근거가 있을 때만 선택한다. AI에서는 이름만으로 물리적 필름 성능·렌즈·셔터를 보증하지 않는다.

카메라 결정은 읽혀야 할 동작, 인물 크기, 시선축, 전경/중경/배경, 관객과의 거리·시차·초점, 다음 샷과 연결하는 이유를 함께 적는다. 주요 룩은 같은 cast와 background로 만든 단일 테스트 프레임에서 피부·의상·공간 연속성을 대조한 뒤 확정한다. 이 비교는 실제 이미지가 있을 때의 검수 절차이며, 프롬프트나 계획만으로 통과를 주장하지 않는다.

## 이야기·카메라·색의 연결

`story.mode`, `theme`, `logline`, `arc`는 시작→변화→결말을 한 영상 안의 행동으로 쓴다. `music_sections`는 0부터 `total_frames`까지 틈·겹침 없이 덮고, `story_beats`는 하나 이상의 구간을 묶어 욕구·행동·변화를 설명한다. 각 shot은 자신이 겹치는 `music_section_ids`, 하나의 `story_beat_id`, 감정 목적, 시작/끝 행동, 카메라, 빛, 룩, 소품 상태, 효과, 다음 전환을 가져야 한다.

기획 preflight에서 실제 shot-size·angle·movement 분포를 집계하고 상위 연출안이 약속한 구도가 개별 샷에도 있는지 대조한다. 다양한 컷을 쓰는 아이돌 혼합형에서 얼굴 MCU를 선언하고 실제 샷은 전부 전신/와이드인 상태를 통과시키지 않는다. 특정 개수나 비율을 모든 장르에 강제하지 않으며 고정 카메라 라이브·원테이크의 의도적 반복은 근거로 구분한다.

### 인물 중심 형식의 공간 컷

아이돌·인물 중심 드라마에서 군무를 빼더라도 그 구간의 인물 감정·관계·행동을 이어 간다. 생성하기 어려운 동작을 빈 배경이나 반복 스틸로 대체하고 완료 처리하지 않는다. 적합한 인물 샷이 없으면 새 샷 이미지가 필요한 미준비 구간으로 남긴다. 빈 배경에서 LTX가 인물을 자동 추가할 것이라고 가정하지 않는다.

기획과 실제 보드·애니매틱에서 다음을 함께 검수한다.

- 인물 장면, 장소 소개, 상징 디테일 등 컷의 역할과 앞뒤 연결 이유를 적는다. “여운·숨 고르기”라는 명칭만으로 빈 컷의 필요를 인정하지 않는다.
- frame/FPS로 빈 공간의 개수·개별 길이·총 길이·전체 비중을 계산하고, 음악 구간별 비중·연속 빈 컷·후반/엔딩 집중도도 확인한다. 전체 비중만으로 특정 구간의 공백을 놓치지 않는다.
- 실제 화면에서 인물의 행동이나 관계가 읽히는지 본다. `character_ids`가 있다는 이유만으로 식별 불가능한 작은 인물을 충분한 인물 노출로 집계하지 않는다. 인물 없는 풍경과 인물이 자연스럽게 배치된 환경 와이드를 구분한다.
- 보컬·감정 상승·엔딩의 음악적 근거와 화면의 인물 복귀를 대조한다. 청취하지 않은 음악적 필연성은 확정하지 않는다. 사용자 지적은 해당 타임코드뿐 아니라 같은 원인의 다른 구간까지 점검한다.

빈 컷의 고정 허용 개수·초·비율을 모든 장르에 강제하지 않는다. 자연·앰비언트·실험 영상의 의도적 공간 중심 구성은 선택한 형식에 맞춰 판단한다. 인물 중심 요청에서 빈 공간이 감정 흐름을 끊으면 기술 게이트 통과와 별개로 미해결 연출 문제이며, 해당 배치의 일괄 생성을 진행하지 않는다. 교정 시 적합한 기존 샷·원곡·타임라인은 보존하고 변경된 계획·이미지·보드·애니매틱만 다시 검수한다.

각 샷의 `eyeline_target`, `body_orientation`, `screen_position`, `start_pose`, `end_pose`를 보이는 상태로 구체화하고 이미지 프롬프트·패널 설명·I2V 동작을 같은 내용으로 연결한다. `observation`, `turn`, `resolves` 같은 이름만 쓰지 않는다. 예를 들어 시작은 정면 직시, 끝은 화면 왼쪽 창으로 눈과 고개 약15도 회전이며 손은 허리에 고정하는 식이다. 고정 촬영은 `locked`라고 확정하고, 움직일 때는 한 경로의 방향·대략적 양·멈출 시점을 적는다. `locked or near-locked with one controlled move`를 실행자의 선택으로 남기지 않는다.

전체 샷을 일괄 생성하기 전에 이번 기획의 서로 다른 핵심 구도·시선·다인 배치를 대표하는 소수의 실제 샷 이미지를 만든다. 독립 검수자가 최초 자세와 시선, 이야기의 읽힘을 확인한 뒤 나머지를 생성한다. 이 이미지는 최종 샷 집합에 포함해 중복 생성하지 않고, 표본 통과를 전체 스토리보드 승인으로 확대하지 않는다. 문제가 보이면 적합한 원본과 키는 보존하고 샷 계획과 영향을 받는 이미지만 새 버전에서 보완한다.

실제 로케이션을 요청받으면 출처가 확인된 실제 장소 사진과 서로 다른 실제 시점부터 확보한다. 장소명·시점별 원본·사용 범위와 실제 관찰한 지형·광원·지평선·전경/중경/배경을 연결하며, 생성한 가상 배경을 실사 촬영 장소 사진으로 표시하지 않는다. 인물의 발 위치·깊이·주변 사물과의 크기·접촉·가림·행동을 샷별로 설계한다. 전원을 같은 바닥선의 정면 일렬 포즈에 놓거나, 얼굴 일관성을 이유로 공간과 무관한 정면 master 자세를 반복하지 않는다. 소품 고정이 행동을 부자연스럽게 만들면 사용자 고정 조건인지 감독의 초안 선택인지 구분해 새 계획에서 수정한다.

새 전체 연출 모드에서 `transition_out.type:"match-cut"`을 쓰면 `target_shot_id`, `from_location_id`, `to_location_id`, `visual_match`를 기록한다. 앞의 세 값은 실제 다음 shot ID와 현재/다음 장소 ID에 맞아야 하며, `visual_match`에는 연결할 형태·동작·방향·색의 대응을 적는다. handle을 잘라내는 작업만으로 매치 컷이 되지는 않는다. 구조 검사는 연결 ID·장소·설명 누락을 검출하며, 실제 화면의 매치와 서사적 필요는 독립 시각 검수로 판단한다. 일반 컷과 기존 이미지-only 모드에는 이 필드를 새로 강제하지 않는다.

다음 원리는 [director-research.md](director-research.md)의 확인된 인터뷰/관찰을 새 기획에 적용하는 방식이다. 특정 감독이나 작품을 복제하는 지시가 아니다.

| 근거 | 새 기획에 적용할 판단 |
|---|---|
| 신우석·돌고래유괴단 | 감정 블록마다 누가 누구를 왜 보는지 적고, POV·기록 질감·흔들림은 정보와 관계를 드러낼 때만 쓴다. |
| 범진·VM Project | 고비용 생성 전에 실제 음원 위에서 애니매틱으로 길이·순서·대표 스틸의 색을 점검하고, 인접 컷의 톤을 연결한다. |
| RIGEND | 음악과 동작을 먼저 읽고 화면 크기·각도·이동을 고른다. 전경·중경·배경 깊이와 관찰자 시점을 정하며 효과는 에너지를 가리지 않는다. |
| 손승희·HIGHQUALITYFISH | 구간 감정을 세트·의상·빛의 색과 재질로 옮긴다. 기본 컷과 싱크가 먼저 성립한 뒤 필요한 후반 효과만 추가한다. |

이 적용은 `directing_methods[]`에 근거 경로, 원리, 이번 영상의 판단, 영향을 받는 shot ID로 남긴다. 관찰하지 않은 장면을 근거로 인용하지 않는다.

## 자산에서 실제 보드까지

감독은 계획을, 아트디렉터는 실제 자산을, 독립 검수자는 실제 결과 검수를 소유한다. 순서는 다음과 같다.

1. 기본 GPT Image 2.5 API 또는 선택 규칙에 따른 내장 image_gen으로 필요한 identity master를 만들거나 검수한 기존 정체성을 재사용한다. 음악·장소별 새 의상 master→해당 룩의 고정 원문 시트, 장소별 background/필요 각도와 실제 사용하는 `prop`을 선행 제작한다.
   캐릭터시트 prompt는 `assets/character-sheet.prompt.txt`의 사용자 원문을 그대로 복사하고 각 승인 master를 별도 참조로 연결한다. 프롬프트에 추가 스타일/이름 지시를 붙이지 않는다.
2. 검수한 key asset을 참조 순서대로 전달해 shot마다 **한 장의** `shot-start` 또는 필요한 `shot-end` 기준 이미지를 만든다. 캐릭터시트와 보드 페이지는 I2V 기준 프레임이 아니다.
3. 독립 검수자가 실제 파일·해시·관찰 근거를 `review/keys.json`/`review/images.json`에 기록한다. `review/keys.json.keys`에는 `verdict`, 서로 다른 `producer_id`/`reviewer_id`, `evidence`, 현재 네 계획 JSON의 canonical `input_sha256`를 함께 기록한다. 계획이 바뀌면 digest가 달라져 이전 key 승인은 stale이며 다시 검수한다. 실패·누락은 다음 단계로 넘기지 않는다.
4. `storyboard.panels`는 이미 검수한 단일 shot 이미지만 가리킨다. `storyboard.pages`는 그 패널을 바꾸지 않고 배치한 실제 PNG 보드 파일을 가리킨다. 보드 asset은 `kind:"storyboard-sheet"`, `method:"compose"`, manifest의 `tool:"local-composite"`이며 page의 패널 이미지 ID를 순서대로 참조한다.
5. compose는 `kind=storyboard-sheet`에서만 쓰는 로컬 레이아웃 작업이다. collage를 I2V 입력으로 쓰지 않으며, 새 생성 API·builder·의존성을 추가하지 않는다. compose된 보드도 독립 검수한다.

`prop`과 `storyboard-sheet`는 예시에서 `required:false`로 시작해 기존 계획을 깨지 않는다. 새 모드에서 shot 또는 page가 소비하면 validator가 필요한 key/페이지로 승격한다. 사용한 소품은 모든 해당 shot 시작/끝 이미지의 참조 closure에 있어야 하며, 허용한 인물·장소·상태와 맞아야 한다.

## 키·스토리보드·애니매틱 게이트

`validate_preproduction.py`의 기존 호출은 그대로 이미지 게이트만 검사한다. production design과 storyboard를 함께 주는 새 호출은 다음 CLI 단계를 명시한다.

```bash
python3 -B .agents/skills/road-music-mv/scripts/validate_preproduction.py \
  --root /absolute/run-root \
  --plan /absolute/run-root/direction/image-plan.json \
  --shots /absolute/run-root/direction/shot-plan.json \
  --production-design /absolute/run-root/direction/production-design.json \
  --storyboard /absolute/run-root/direction/storyboard.json \
  --stage keys
```

- `keys`: 실제 소비되는 master/sheet/wardrobe/background/prop과 기존 required key만 준비·독립검수됐는지 본다. 미래의 `shot-start`/`shot-end`와 storyboard panel/page·compose sheet는 요구하지 않는다.
- `storyboard`: keys와 모든 샷 keyframe, 실제 page PNG와 독립 보드 검수를 요구한다.
- `animatic`: storyboard가 준비된 뒤에만 실행한다. 실제 원곡을 바꾸지 않고, 검수한 보드/정지 프레임을 시간상 배치한 미디어의 치수·FPS·프레임수·길이·단일 내장 오디오를 검사하고 독립 재생 검수 근거를 요구한다.

`review/images.json.storyboard`는 `verdict`, `reviewer_id`, `producer_id`, `evidence`, 전체 패널과 같은 `panel_ids`, `input_sha256`를 가져야 하며 producer와 reviewer는 달라야 한다. 이는 storyboard/animatic 단계의 전역 검수 결속이며 `review/keys.json.keys` 객체를 복사할 필요는 없다. `input_sha256`는 아래 네 JSON 값의 canonical digest 묶음이다.

```json
{"production_design":"…","image_plan":"…","shot_plan":"…","storyboard":"…"}
```

각 digest는 `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")`의 SHA-256이다. 이는 source audio와 실제 파일의 raw SHA-256과 다르다. `review/animatic.json`에는 `path`, `sha256`, `source_audio_sha256`, 같은 `input_sha256`, `verdict`, 서로 다른 reviewer/producer ID, 재생 관찰 `evidence`가 필요하다. 구조·변조·결속 오류는 invalid, 아직 없는 파일·검수는 `ready:false`다. 검증기는 음악적 적합성·얼굴 일관성·독립 관찰의 진실성을 보증하지 않는다.

하네스 패킷의 `Version evidence.inputs`는 세 번째 지문 영역이다. 동봉 `harness/scripts/run_support.py`의 `snapshot_inputs`가 파일에 `b"file\0"` 접두사를 붙여 계산하므로 raw 파일 SHA와 직접 비교하면 변경되지 않은 입력도 stale로 오판한다. 패킷은 같은 `snapshot_inputs`로, 음원/이미지는 raw SHA로, 네 계획 JSON은 위 canonical digest로 각각 대조한다. 패킷 상단 `Contract`는 작업 계약 전체의 지문이며 개별 스킬 파일의 지문이 아니다.

애니매틱의 내장 오디오는 source와 같은 sample rate/channel 수로 `pcm_s32le` interleaved PCM에 정규화해 sample count와 raw PCM SHA-256을 비교한다. 단순 stream 존재·선언 hash·인지적 유사도는 충분하지 않다. 권장 산출물은 `preproduction/animatic.mov` 안의 lossless PCM-s32 원곡이며, MP4/ALAC 또는 원본 AAC stream copy도 정규화 PCM이 실제로 일치하면 통과할 수 있다. 손실 AAC 재인코딩은 자동 수용하지 않는다. 이 검사는 preproduction gate이며 최종 master는 MP4를 유지하고, 실제 재생 검수도 대체하지 않는다.

storyboard panel의 `at_frame`은 전체 배열에서 엄격히 증가하고 중복될 수 없다. page의 `panel_ids`는 모든 panel을 정확히 한 번씩 그 전역 순서대로 담아야 한다.

## LTX로 넘기는 조건

선택한 이미지 도구의 실제 결과와 독립 keys/storyboard 검수를 통과하고, 실제 원곡을 포함한 애니매틱이 검수된 뒤에만 LTX proof와 제작을 시작한다. 각 생성은 단일 shot image를 입력으로 쓰며, 콜라주 보드는 입력으로 쓰지 않는다. 이미지·애니매틱·LTX가 실제로 생성되지 않은 계획은 그 상태를 그대로 보고한다.
