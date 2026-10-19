# 음악에서 완성 MV까지

별도 음악 작업이 인계한 확정 음원·가사·hash와 구간/가사 타임스탬프를 사용한다. 이 MV 워크플로는 작곡·음악 제작을 위한 후보 청취/평가·후보 비교·곡 선정을 하지 않는다. 확정 음원의 재생은 구간·비트·감정 파악과 소리/영상 동기 검수에 사용하며, 인계 음원을 바꾸거나 품질을 판정하는 단계가 아니다. 일정 BPM의 초안 간격은 `60/BPM`이지만 변화·pickup·라이브 타이밍은 측정한다. 모든 박마다 컷을 넣는 공식을 쓰지 않는다.

먼저 [장르×형식 가이드](genre-style-guide.md)로 music_genre·visual_format·visual_look·performance_source를 분리한다. 같은 록발라드도 밴드 라이브형과 서사형의 노출 대상·샷·빛·이미지 자산이 다르다. 실제 곡·사용자 선택·레퍼런스 근거와 함께 treatment에 기록한다.

후보 선정까지 함께 요청받으면 별도 음악 작업의 선정 보고서를 인계받는다. 선정 근거, 실제 청취 여부, 미판정 항목을 보존하고, 가사·기획에 따른 MV 적합성 선택을 청취 음질·가창·멜로디의 최고 평가로 바꾸지 않는다. 측정 onset/RMS와 원문 가사도 서로 다른 근거다. 가사 정렬이 확인되지 않았다면 측정 블록을 실제 절·후렴 시점이나 정확한 립싱크로 부르지 않는다.

## 실행 기록과 제작 중 개선

실행에 사용하는 스킬·역할·계약은 고정한 입력 지문으로 추적한다. 제작 중 스킬을 개선할 때는 현재 실행의 스냅샷과 새 버전을 구분하고, 변경을 적용할 소비 단계만 새 패킷으로 재검수한다. 진행 중인 입력 파일을 조용히 덮어써 이전 승인을 유지하지 않는다. 완료 등록한 실행 스크립트도 불변 입력이다. 실행 계측을 보완해야 하면 담당 출력 폴더에 사본을 만들고 새 입력 지문으로 재결속하며, 기존 준비 스크립트를 수정하지 않는다. 실제 도구 세션 ID·PID·argv와 프로세스 종료 코드를 해당 실행의 출력 로그에 저장하고, 회수하지 못한 종료 코드는 `unobserved`로 남겨 미디어 디코드 통과와 구분한다.

긴 모델 작업의 stdout/stderr는 수신 핸들이 사라질 수 있는 중간 `PIPE`보다 실행별 일반 로그 파일에 직접 기록하고, 실제 종료 코드는 상태 출력보다 먼저 별도 파일에 저장한다. 터미널 출력은 짧은 시작·종료 상태로 제한하며, 로그 전달 방식을 바꾸면 모델을 실행하지 않는 대량 출력 검사로 누락·교착 여부를 확인한다. 로그 정지나 PID 생존만으로 연산 단계·GPU 대기·성공을 추정하지 않는다. `write()` 대기만으로 stdout이 막혔다고 단정하지 말고 실제 FD·파이프 상대·하위 프로세스를 연결한다.

`production-journal.jsonl` 등에 실제 문제·재현 또는 관찰 근거·처리 결과·영향받는 자산/단계·남은 한계를 남긴다. 작업자의 중간 추정은 실측 결과와 구분하고 프레임 수·시간·관찰 합계는 원자료에서 검산한다. 최종 보완 목록은 이 기록에서 도출하며, 아직 겪지 않은 가정적 실패를 새 필수 게이트로 늘리지 않는다.

행동·소품·전환을 수정하면 상위 `decisions`, `music_sections[].visual_goal`, treatment, shot의 camera/effects/verification·I2V 프롬프트, image prompt, storyboard caption을 함께 대조한다. 변경 전 표현을 검색한 뒤 실제 지시인지 금지/참조 설명인지 문맥으로 확인한다. 샷의 전환만 일반 컷으로 바꾸고 상위 문서에 매치컷 요구를 남기는 식의 의미 충돌도 독립 재검수 대상이다.

## 연출 산출물

`direction/treatment.md`: 주제 한 문장, 인물의 욕구·관계·변화, 도입/상승/후렴/브리지/결말의 시각 변화, 공연/서사 비중, 참조 원리와 바꾼 요소.

`direction/bible.json`: 상세 cast·세계관이 있을 때 인물·의상·소품·공간·팔레트·빛·화면축·금지 drift, 사용 가능한 이미지 anchor를 기록한다. [group-world-planning.md](group-world-planning.md)의 그룹·나이 기준·시대·실존성·장소·의상 계약을 따르고 `validate_mv_context.py`로 구조를 확인한다. 음악의 감정을 화면의 행동과 물체로 번역한다. 새로운 공간을 나열하기보다 모티프를 반복·변주한다.

`direction/production-design.json`: source audio의 절대 경로·raw SHA-256·실측 길이와 delivery를 기록하고, 이야기·음악 구간·story beat·연출 근거·소품을 하나로 결속한다. [전체 연출 판단](creative-direction.md)의 16개 결정 영역은 각 `choice`를 실제 음악 구간과 `music_reason`으로 설명한다. 실제 필름 촬영과 AI 디지털 룩을 구분하고, visual SFX와 sound SFX 정책을 분리하며 원곡을 바꾸지 않는다.

`direction/image-plan.json`: 캐릭터별 master·시트·의상, 장소별 배경, 필요한 소품·샷별 기준 이미지의 ID·참조 순서·완성 GPT Image 2.5 API 프롬프트·고정 조건. [이미지 선행 제작](image-preproduction.md)을 따른다. 모든 필요한 이미지는 visuals/asset-manifest.json의 실제 파일과 review/images.json의 독립 검수에 연결한다.

`direction/shot-plan.json` 각 샷:

- ID, 음악 구간·사건·의도, 납품 `start_frame`, `end_frame_exclusive`, `delivery_fps`.
- `character_ids`, `location_id`, `start_image_asset_id`, 필요한 경우 `end_image_asset_id`. 인물 master/의상·장소 anchor에 연결된 검수한 단일 프레임을 쓴다.
- 피사체·시점·시선·시작/중간/끝 동작, 프레이밍·앵글·이동·빛·색·공간 깊이·identity anchor.
- backend, `generation_defaults` 또는 사용자 지정의 실제 모델 버전·로컬 model path/revision·양자화·dev/distilled·텍스트 인코더, prompt, 참조 파일, seed, width/height, 생성 frames/FPS, 실제 argv. 새 기본은 LTX 2.5 Distilled Q8이며 2.3 재현은 당시 선택을 보존한다.
- source in/out, 리타이밍·크롭·색, 전환과 겹침·handle, 위험·대체 샷·검수 기준·근거.

새 production-design 모드에서는 위 호환 필드에 `music_section_ids`, `story_beat_id`, `emotional_purpose`, `action_start`, `action_end`, `camera`, `lighting`, `film_look`, `props`, `effects`, `transition_out`을 더한다. 각 소품은 production design의 ID·허용 인물/장소·연속성 규칙과 맞고, 시작/끝 단일 이미지의 참조 closure에 있어야 한다. effects의 `visual-sfx`/`vfx`는 화면 효과만 적으며 sound SFX는 `sound_policy`에서 원곡 보존과 함께 결정한다.

`direction/storyboard.json`은 shot의 실제 `shot-start`/`shot-end` 단일 이미지로 만든 panel과 그 panel들을 빠짐없이 같은 순서로 담은 page를 기록한다. `panels[].at_frame`은 전체 배열에서 엄격히 증가하고 중복될 수 없으며, page의 `panel_ids`도 그 전역 순서를 보존한다. page는 조립한 PNG 자산 `kind=storyboard-sheet`, `method=compose`, manifest `tool=local-composite`에 연결한다. 이 compose 보드는 검수용 레이아웃이며 I2V 입력 콜라주가 아니다.

생성 프레임 격자와 납품 컷 길이는 별개다. 자연어 카메라 숫자를 정밀 제어값으로 보고하지 않는다.

일어서기처럼 몸 높이가 크게 달라지는 동작은 실제 시작 이미지의 인물 크기·머리 위 여백·발 위치로 프레이밍을 대조한다. 기획 문구에 headroom이 있다고 써도 실제 이미지가 이를 보장하지 않는다. 교정 예산 뒤에도 맞지 않으면 사용자가 고정한 촬영 조건을 보존하는 범위에서 구도·동작·단일 카메라 이동 중 필요한 연출을 새 계획 버전으로 정합하고 재검수한다. 기립 중 얼굴·발·소품의 가시성은 실제 움직임 proof에서 확인한다.

## 단계

| 단계 | 다음 단계로 넘길 조건 |
|---|---|
| 레퍼런스 | 요청 범위의 프레임·샷·전환 근거와 coverage. 누락은 표시. |
| 트리트먼트·bible | 음악·시점·동작·미술의 연결과 원문 보존. |
| production design·샷·편집 계획 | 16개 연출 판단, 음악 section/beat, 의도하지 않은 gap/overlap 없음, source와 transition handles 충분. |
| 키 이미지 제작 | 기본 GPT Image 2.5 API 또는 선택 규칙에 따른 image_gen으로 master→시트/의상·배경·소품을 참조 순서대로 만들고, `keys` 단계에서는 미래 shot-start/end·보드 page 없이 실제 key만 준비한다. |
| 독립 이미지·보드 검수 | `review/keys.json.keys`의 독립 verdict와 현재 4문서 digest를 먼저 결속하고, 이후 실제 master/bible/샷/보드와 파일 해시를 대조해 `storyboard` 전역 검수를 한다. |
| 애니매틱 | 검수된 단일 이미지와 실제 음악으로 만든 미디어에서 감정·길이·반복·전환·소리 동기를 독립 재생 검수한다. 내장 audio는 source와 같은 rate/channel의 정규화 `pcm_s32le` sample count·raw PCM SHA까지 일치해야 한다. 권장 경로는 `preproduction/animatic.mov`의 lossless PCM-s32이며, 최종 master는 MP4를 유지한다. 계획·프롬프트만으로 완료라고 하지 않는다. |
| 기술·시각 proof | 가장 어려운 인물·손·군무·회전·립싱크 샷을 짧게 검증. 풍경 성공으로 대체하지 않음. |
| 샷 생성 | 확인한 조합만 확장, argv·모델·입출력 hash·시간·실패 보존. |
| 편집·마스터 | 기본 컷·싱크→목적 있는 효과→색·화면축·속도→원곡 연결. |
| 요청된 가사 자막 | [가사 자막 지침](lyric-subtitles.md)의 원문·단어 정렬→현재 단어 강조 합성→독립 싱크/가독성 검수. 클린 master도 보존한다. |
| 독립 검수 | 실제 재생·원본 크기·프레임 경계·음향·메타데이터·잔여 결함. |

애니매틱의 무손실 조건은 원곡 PCM 신호의 보존이다. 원본 PNG를 따로 보존하므로 검수 영상까지 매 프레임 PNG 코덱으로 만들 필요는 없다. MOV의 비디오는 재생 환경이 지원하는 H.264 등으로 만들 수 있으며, 선택한 코덱·용량·실제 재생 결과를 기록한다. 원곡 PCM sample count와 SHA 대조는 그대로 수행한다.

브라우저 전체 화면 캡처가 실패해도 동일 출처 `video`의 실제 디코드 프레임을 canvas로 읽을 수 있는지 확인할 수 있다. 이를 화면 전체 스크린샷과 구분하고 실제 `mediaTime`·재생 속도·음소거·종료 상태를 기록한다. 정해진 시점의 표본은 모델 응답 사이의 대기로 맞추지 말고 페이지 안의 `requestVideoFrameCallback` 등으로 확보한다. 현재 검수 영상의 URL을 확인하고 다른 콘텐츠로 바뀌면 관찰을 멈춘다. 재생 메트릭과 실제 본 프레임·청취 범위는 별도 근거이며 일부 표본을 전 프레임 연속 시각 검수로 확대하지 않는다.

사용자가 제작 형식을 바꾸면 이전 기술 통과를 새 형식의 미학적 승인으로 재사용하지 않는다. 예를 들어 군무를 제외한 드라마형으로 바꿀 때는 동작 문구뿐 아니라 실제 시작 이미지의 무대 포즈·일렬 배치, 인물의 시선·접촉, 컷의 앞뒤 관계도 대조한다. 새 동작이 시작 프레임에 없는 대형 해체나 공간을 발명해야 한다면 맞는 기존 자산으로 교체하거나 해당 컷을 재기획한다. 원곡·정체성·승인 룩과 맞는 기존 자산은 보존하고, 변경된 계획·실제 보드·애니매틱을 새 실행에서 검증한다. 군무 자체를 다른 형식에서도 금지하는 일반 규칙으로 확대하지 않는다.

## 가상 샷의 프롬프트 예

특정 작품의 관찰 기록이 아닌 독창적인 예시다. 정체성은 검수한 이미지 anchor·bible로 연결하고 결과를 확인한다.

> A medium eye-level shot of an adult singer in a charcoal coat beside a rain-streaked window. Warm light from a table lamp catches the left side of her face while cool evening light outlines her shoulders. She lowers a folded letter and slowly looks toward an empty chair. The camera gently tracks to the right, revealing the chair behind the foreground window frame. Her appearance, coat, and room remain consistent throughout this continuous take.

피사체·동작·환경·빛·카메라의 시간 관계를 현재형 한 문단에 쓴다. I2V는 보이는 정적 묘사보다 다음 행동·카메라·유지 조건에 집중한다. 상충하는 여러 이동과 정밀 컷을 한 생성에 몰아넣지 않는다. 전환·타이틀·정밀 그래픽은 후반 계획으로 분리한다.

## 편집 연결

원곡을 임의로 자르거나 반복·시간 늘리기 하지 않는다. 음악 길이에 시각 길이를 맞춘다. FPS 변환의 중복/삭제·보간 방법을 기록하고 입·손·빠른 동작을 검수한다. 24→30 변환이 새 움직임의 생성은 아니다.

외부 ffmpeg는 확인된 영상의 컷·합성에 쓴다. Road Music 내부 IPC·임의 JavaScript로 앱 기능을 우회하지 않는다. 공개 `video:render`로 완성 배경·원곡을 연결할 수 있지만, 앱 시각화가 불필요하면 외부 MV master를 납품하고 통합 여부를 명시한다.

`keys`, `storyboard`, `animatic` 단계와 review digest 결속의 정확한 입력·상태 규칙은 [creative-direction.md](creative-direction.md)를 따른다. 기존 솔로·라이브 계획은 새 파일·옵션 없이 기존 이미지 게이트를 유지한다.
