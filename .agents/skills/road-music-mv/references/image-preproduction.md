# 이미지 선행 제작과 일관성

새 MV를 실제 제작할 때는 기획에 필요한 이미지 자산을 먼저 확보·검수한 뒤 LTX 샷을 생성한다. 기획-only 요청이면 이미지 계획과 프롬프트까지만 작성한다. 이미지까지 맡겼으면 이미지를 만들고, 영상까지 맡겼으면 같은 위임 범위 안에서 영상으로 이어간다. 특정 곡·캐릭터가 없는 하네스 수정 요청을 임의 인물/장르의 실제 생성으로 확대하지 않는다.

## 산출물과 담당

| 산출물 | 작성자 | 내용 |
|---|---|---|
| direction/bible.json | 감독 | 상세 cast·세계관일 때의 멤버·장소·의상·시대 불변 계약 |
| direction/image-plan.json | 감독 | 선택 profile, cast·location ID, 모든 필요한 이미지·참조 관계·프롬프트·고정 조건 |
| visuals/asset-manifest.json | 이미지 아트디렉터 | 실제 이미지 파일, SHA-256·크기·사용 도구·버전 |
| review/images.json | 독립 검수자 | 실제 본 이미지별 해시·pass/fail·관찰 근거 |
| direction/shot-plan.json | 감독 | 각 샷의 cast/location·시작/선택적 끝 이미지 ID와 LTX/편집 계획 |
| direction/production-design.json | 감독 | source audio·16개 연출 결정·음악 구간/beat·소품 연속성 |
| direction/storyboard.json | 감독 | 단일 shot 기준 이미지 panel과 실제 compose 보드 page의 순서 |

이 경로는 `.harness/work/<run-id>/` 아래다. 감독은 이미지 계획을, 아트디렉터는 이미지 산출물을 소유하고 같은 파일을 함께 수정하지 않는다. 생성 결과 때문에 계획을 바꿔야 하면 감독에게 변경을 요청하고 영향받는 산출물을 새 버전으로 검증한다.

## 이미지 계획

[image-plan.example.json](../assets/image-plan.example.json)과 [shot-plan.example.json](../assets/shot-plan.example.json)은 가상 인물의 형식 예시이며 생성·검수 결과가 아니다. 실제 선택한 장르/형식/look·인계 음원·캐릭터로 구체화한다. 다른 장르 조합의 이미지를 전부 한꺼번에 만들지 않는다. 상세 cast·세계관은 [group-world-planning.md](group-world-planning.md)의 `bible.json`부터 만든다.

새 제작은 [음악 맞춤 미술 조사와 실사 프롬프트](music-led-lookdev.md)를 먼저 적용한다. 의상·장소/스튜디오·소품과 실제 화보 구도의 출처/사진 관찰·곡과의 연결·선택 이유를 남긴다. 새 의상은 기존 정체성→해당 의상 master→고정 원문 시트로 연결하고, 배경의 여러 시점과 실제 쓰는 소품을 먼저 제작·검수한다. 기존 의상이 승인됐다는 이유로 새 음악·장소에도 같은 의상을 자동 재사용하지 않는다. 사용자가 기존 자산 유지를 선택했다면 그 선택을 따른다.

1. **인물 master**: 등장인물마다 단일 인물의 얼굴/체형 기준을 정한다. 얼굴형·눈·코·피부·헤어·나이 범위·신체 비율을 고정한다. 실사와 애니메이션은 각각의 표현 규칙을 쓴다. 사용자 참조가 있으면 그 정체성을 보존한다.
2. **캐릭터시트**: 같은 master를 참조해 정면·3/4·측면·후면, 필요한 전신/표정·고유 실루엣을 계획한다. 여러 인물이 있으면 인물별로 만든다. 다중 패널 시트는 제작 참고용이며 그대로 I2V 첫 프레임에 넣지 않는다.

캐릭터시트는 인물별 공통 정체성 자료다. 다른 인물의 identity master를 참조 계보에 섞지 않는다. 시트는 본인 identity master 또는 본인 의상 master 하나만 직접 참조한다. 의상 master의 전이 계보에는 본인 identity master만 있어야 하며 다른 인물/identity master를 섞지 않는다. 공간·그룹 배치는 별도 배경/단일 샷 이미지로 연결한다.
3. **의상·소품**: 필요한 장면의 look을 버전 ID로 고정한다. 기본 master에서 얼굴이 바뀌면 의상 버전으로 승인하지 않는다. 같은 마이크·악기·반지·핵심 소품의 형태·색·위치를 추적한다.
4. **배경**: 장소별 인물 없는 기준 이미지로 구조·출입구·창·주요 가구·빛 방향·시간대를 정한다. 필요한 각도/역방향/시간대만 같은 장소 anchor를 참조해 확장한다. 무대는 멤버·악기·객석/카메라 방향도 계획한다.
5. **샷 기준 이미지**: 실제 cast master·의상·배경을 참조해 샷의 구도·앵글·빛·피사체 배치를 하나의 단일 프레임으로 만든다. 끝 프레임은 연출과 확인한 백엔드에 필요할 때만 만든다. 인물 없는 풍경은 캐릭터 자산을 만들 필요가 없다.
   시작 프롬프트에는 `action_start`의 최초 상태에서 추출한 포즈·시선·소품 보유자와 위치를 정적으로 쓴다. 창을 보다가 실내로 고개를 돌리는 샷이면 첫 이미지는 창쪽 응시이며, 정면 master의 카메라 응시를 그대로 따르지 않는다. 첫 실제 결과에서 이 시선을 대조한다. 이후 움직임은 I2V 지시로 분리한다. 동일 기준 이미지를 여러 샷에 재사용할 때는 각각의 시작 상태가 그 프레임과 맞아야 한다. 서로 다른 시작 자세에는 별도 자산을 배정한다. 보여줄 소품과 자세가 실제 프레이밍에 들어가는지 확인하고, 화면 밖 소품은 가시 소품 사용과 구분한다.
6. **스토리보드 시트**: 각 샷의 검수한 단일 기준 이미지를 바꾸지 않고 panel로 배치한다. page는 `kind:"storyboard-sheet"`, `method:"compose"`, manifest `tool:"local-composite"`로 기록하는 실제 PNG 검수 보드다. 이는 I2V 첫 프레임·콜라주 입력이 아니다.

보드에는 기존 panel caption과 shot ID·프레임/시간을 읽을 수 있게 표시한다. 캡션은 각 패널 폭 안에서 줄바꿈하고 실제 필요한 높이를 확보한다. 최종 PNG를 직접 열어 이웃 열의 글자 겹침·잘림·과도한 빈 영역이 없는지 확인한 뒤 manifest의 최종 해시·치수를 기록한다.

보드 조립 도구가 기본 Python에 없으면 기존 제작 venv나 제공된 workspace runtime에서 필요한 라이브러리를 먼저 확인한다. 한 인터프리터의 import 실패만으로 전체 환경이 미설치라고 판단하지 않는다. 이미 있는 Pillow 등으로 조립할 수 있으면 새 의존성 없이 정확한 실행 경로와 버전을 기록한다.

의존 순서는 대체로 master → 캐릭터시트/의상, 장소 anchor → 장소 변형, 이들의 결합 → 샷 기준 이미지다. 독립 장소/소품과, 동일한 승인 키만 읽고 서로의 결과를 참조하지 않는 샷 기준 이미지는 비중첩 경로에서 병렬 제작할 수 있다. 공통 manifest는 한 작성자가 성공 파일을 모아 기록하며 미완료 항목을 완료로 올리지 않는다. 아직 생성·검수하지 않은 master를 가상 참조로 삼아 downstream을 만들지 않는다.

## 캐릭터시트 고정 원문

새로 생성하는 `kind:"character-sheet"`의 기본 `prompt`는 [사용자가 선택한 현재 프롬프트](../assets/character-sheet.prompt.txt)를 그대로 복사한다. 모델·장르·의상별 정보는 해당 master에 담으며, 별도 수정 위임이 없으면 제출 문장을 수정·번역·확장하거나 앞뒤 설명을 덧붙이지 않는다. 승인된 해당 인물의 단일 identity/의상 master를 이미지 참조로 제공하며, 이름·API 옵션·경로·모델명은 프롬프트 밖의 입력·기록에서 관리한다. API에서는 기존 runner의 `edit --image MASTER`, 내장 도구에서는 해당 master 한 장의 `referenced_image_paths`를 사용한다.

현재 기본 구도는 왼쪽 정면 얼굴 확대와 얇은 세로 구분선, 중앙의 독립된 목~발 정면 크롭, 오른쪽 머리~발 전체 후면이다. 중앙 목 크롭은 캔버스 높이 약20%, 양쪽 발은 약94%, 후면 정수리는 약5%를 목표로 한다. 중앙 머리가 있던 자리는 중립 배경 여백으로 두며 중앙 몸을 위쪽까지 늘리지 않는다. 양쪽 목·어깨·허리·무릎·발의 신체 축척을 맞춘다. 이 비율은 생성 구도 목표이며 픽셀 단위 결과 보장이 아니다. 실제 얼굴·헤어·옷·액세서리·비율과 글자·장식 부재를 독립 검수하고 실제 제출 원문 및 SHA를 보존한다.

중앙과 후면의 머리 조건을 따로 관찰하고, 정체성/의상 참조 적합성과 목표 구도 충족을 분리해 기록한다. 사용자가 턱 잔여·후면 머리 잘림 등 특정 오차를 허용하고 기존 시트 사용을 지시하면 그 범위는 차단·재생성 사유에서 제외한다. 실제 잘린 부위를 완전 전신이라고 보고하거나, 구도 허용을 다른 인물·의상 변경이나 심각한 신체 오류의 허용으로 확대하지 않는다. 기존 자산을 재사용할 때는 당시의 실제 프롬프트·SHA를 보존하며 새 기본 프롬프트로 생성됐다고 소급 기록하지 않는다.

반복되는 구도 오류를 교정할 때 도구가 다중 입력을 지원하면, 해당 master를 유일한 정체성 입력으로 유지하면서 인물이 없는 기술적 배치도를 별도 제어 입력으로 사용할 수 있다. 제출 원문은 바꾸지 않고, 배치도의 제작 방식·용도·전달 순서·SHA를 실제 생성 기록에 함께 보존한다. 배치도를 완성 캐릭터·의상·배경 자산으로 분류하지 않는다. 고정 프롬프트에는 입력 역할 설명도 덧붙이지 않는다.

## 이미지 도구 선택과 호출

도구 선택은 [SKILL.md의 규칙](../SKILL.md#이미지-도구-선택)을 따른다. 기본은 `gpt-image-api`의 GPT Image 2.5 API(`gpt-image-2.5-sunburst`)다. `OPENAI_API_KEY`가 없거나 사용자가 `image_gen`을 선택하면 설치된 `imagegen` 스킬의 내장 도구를 사용한다. 키 값은 출력·인수·로그에 남기지 않고 `.envrc`를 읽어 찾지 않는다. API 오류·불확실 응답은 키 부재가 아니므로 자동 재시도/전환하지 않는다. 기존 비용 위임과 요청 범위를 보존한다. 사진·시트·배경·소품은 선택한 이미지 도구로 생성하고, 원본 보존 복사·검수용 보드 배치는 `provided`/`local-composite`로 구분한다.

새 API 자산은 계획 `method:"openai-images-api"`, `model:"gpt-image-2.5-sunburst"`로 기록하고 manifest도 `tool:"openai-images-api"`와 같은 `model`을 기록한다. 실제 요청/응답 설정·usage·saved 경로·raw SHA·치수를 보존한다. 응답이 요청 모델을 되돌려 준 것과 내부 가중치를 독립 입증한 것은 구별한다. 내장 도구를 선택한 자산은 `method/tool:image_gen`으로 기록하며 API 모델명을 붙이지 않는다. 모델을 도구가 반환하지 않으면 미확인으로 남긴다.

각 자산의 `prompt`는 선택한 도구의 한 번의 호출에 사용할 완성 프롬프트다. 별개의 자산은 별개의 요청으로 만든다. 기본 문법은 용도, 피사체/공간, 구도, 빛/색/재질, 고정할 속성, 바꿀 속성, 제외할 요소다. character ID는 파일/메타데이터의 식별자이며 이미지 안에 글자로 찍으라는 지시가 아니다.

로컬 참조는 먼저 `view_image`로 실제 내용을 확인한다. API는 기존 runner의 반복 `--image`, 내장 도구는 `referenced_image_paths`로 전달한다. 로컬 경로 없는 대화 이미지는 필요한 최소 `num_last_images_to_include`를 쓰고 두 참조 방식을 동시에 쓰지 않는다. prompt 안에서 Image 1=정체성, Image 2=의상, Image 3=배경, Image 4=소품처럼 실제 전달 순서와 역할을 적는다. 역할 순서는 자산 종류에 맞춰 정하고 기록한다. 고정 캐릭터시트에는 역할 설명을 덧붙이지 않는다.

다인 단일 샷은 참조 번호별 인물의 이름과 실제 헤어·의상을 짧게 연결한다. 이름만 나열해 모델이 각 얼굴을 알아서 구분한다고 가정하지 않는다. 정체성·의상 보존과 새 샷의 자세·시선·구도 변경을 구분하고, 필요한 손은 해부학적 좌우와 화면 좌우를 명확히 적는다. 실행 중 이 의미만 명료화했다면 계획 원문과 실제 제출문·변경 이유·참조 순서를 함께 보존하고 실제 결과를 재검수한다. 이는 캐릭터시트 고정 원문에 설명을 덧붙이는 허가가 아니다.

실제 장소에 인물을 배치하는 샷은 사용 범위가 확인된 로케이션 사진 또는 먼저 생성·검수한 real-inspired 공간 anchor를 공간 기준으로 전달하고, 인물 master는 얼굴·헤어·신체·의상 기준으로 구분한다. 배경의 지평선·소실점·광원과 인물의 시점·크기·발 접지·그림자·반사·전경 가림을 맞춘다. 장소의 실물 난간·계단·벤치·길과 상호작용하는 행동을 우선하고 인물을 균일한 크기의 오려 붙인 전신처럼 만들지 않는다. 새 실제 장소 사진과 샷 결과의 대응을 대표 컷에서 먼저 검수하며 사진의 실제 촬영 시점·렌즈를 모르면 생성 프롬프트의 수치만으로 입증하지 않는다. 새 샷의 자세 때문에 기존 시트를 재생성하지 않는다. 사용자가 새 의상을 요청했다면 새 의상 master와 그 룩의 시트를 별도로 만든다.

직접 참조 수·크기는 선택한 도구/runner에서 확인한 한도와 대조한다. 과거 내장 도구의 5장 제한을 API 한도로 재사용하지 않는다. 한도를 넘으면 승인된 인물/의상·소품으로 필요한 단일 상호작용 키를 먼저 제작·검수하고 전이 계보를 유지하는 등 실제 지원 방식으로 줄인다. 같은 바이트의 master/의상을 중복 입력하지 않는다. 소품 참조를 몰래 빼거나 여러 얼굴의 콜라주를 I2V 첫 프레임으로 쓰지 않는다.

선택한 도구/runner에 없는 seed·identity lock 같은 파라미터를 발명하지 않는다. 같은 문장만으로 인물 일관성을 보장하지 않는다. 매 샷을 직전 샷에서 계속 파생시키기보다 검수한 공통 master를 다시 연결해 누적 drift를 줄인다. 여러 인물을 참조할 때 각 이미지의 소유자를 구분하고 얼굴·옷이 서로 섞이지 않도록 검사한다.

API는 runner의 실제 `saved[].path`와 응답·usage를 확보하고 파일 존재·형식·치수·SHA 및 실제 픽셀을 확인한다. 배정된 `visuals/` 아래 새 출력 경로를 사용하고 기존 파일을 덮어쓰지 않는다. 응답/파일이 불확실하면 이미 저장된 결과부터 확인하며 경로를 추측하거나 전체 호출을 중복 제출하지 않는다. 생성 성공과 파일 저장 성공은 구분한다. base64나 키를 출력하지 않는다.

내장 도구는 실제 반환 이미지와 반환 경로/output_hint를 확인해 배정 visuals 경로에 원본 바이트를 보존한다. 로컬 파일 없이 data URL만 오면 결과를 먼저 보존한 뒤 원본 데이터를 안전하게 저장하고 실제 파일/치수/SHA를 검사한다. base64를 채팅·로그·셸 인수로 출력하지 않는다. 도구에 없는 모델/seed/identity-lock/출력 경로 옵션을 발명하지 않는다. 저장 실패 때문에 같은 생성을 다시 제출하거나 API로 바꾸지 않는다.

여러 자산을 만드는 동안에는 각 성공 파일을 확보할 때마다 실제 해시·치수·프롬프트·전달한 참조 순서와 도구 결과를 checkpoint에 남긴다. 재개할 때는 이 실물과 참조 지문을 재확인해 충족된 자산을 재사용한다. 실패 또는 응답 불확실 항목을 생성 완료로 올리거나, 전체 배치를 무조건 다시 제출하지 않는다. checkpoint는 제작 진행 기록이며 독립 검수를 대신하지 않는다.

기존 배치 도우미를 재사용할 때는 계획·재사용 목록·출력·최종 manifest·누적 provenance·제출 중지 파일이 현재 배정 경로를 가리키는지 dry-run으로 확인한다. 성공 기록을 새 배치 결과로 교체하지 말고 누적한 뒤 실제 필수 ID 집합과 대조한다.

긴 배치는 계획 ID 집합과 실제 성공 자산 ID 집합의 차이로 남은 작업을 관리한다. 일부 이미지의 native 최종 메시지는 그 범위의 checkpoint로 기록하고, 실제 차단 원인이 없으면 같은 작업에서 나머지 이미지·보드·manifest·계보를 계속 완성한다. 전체 완료 조건과 실물이 충족된 뒤 제작 노드 결과를 등록한다.

전체 샷 전에는 [대표 샷의 연출 검수](creative-direction.md)를 먼저 거친다. API 실행은 한 번에 최대2개 요청의 유한 배치로 나누고, 다음 배치 전 메인 지시와 배정된 제출 중지 파일을 확인한다. 긴 단일 코디네이터가 다음 요청을 계속 예약하도록 두지 않는다. 대기 도구는 30초 이하로 반환되게 해 새 지시를 읽는다. 중지 요청 뒤에는 새 호출을 내지 않고 진행 중 응답·PNG·usage를 보존한 뒤 본인 코디네이터를 종료한다. 동결된 프로세스를 남겨 과거 계획이 재개될 위험을 만들지 않는다. 이 제어는 이미지 제출에 한정되며 다른 사용자 작업을 중단하는 권한이 아니다.

첫 자산부터 기존 검증기로 부분 manifest를 검사해 스키마 오류를 조기에 잡는다. `width`·`height`는 최상위 정수 필드, `tool`은 정확한 enum, `path`는 run-root 내부 상대 경로다. 아직 없는 자산·독립 검수 때문에 생긴 `ready:false`와 잘못된 manifest의 invalid를 구분한다.

## 일관성 검수

master를 만든 직후, 시트·의상으로 확장하기 전에 좌우 기준을 인물의 해부학적 방향으로 명시해 Bible과 대조한다. 사용자 고정 조건이 아닌 초안의 방향·장식만 실제 master/배경과 다르고 결과 자체가 일관되면, 감독이 새 계획 버전에서 그 결과를 채택할 수 있다. 원래 프롬프트·불일치·채택 이유를 보존하고 계획과 downstream을 재검수한다. 기존 승인을 유지한 채 텍스트를 몰래 바꾸거나 얼굴 변형·신체 오류를 채택으로 덮지 않는다.

각 실제 이미지를 master와 나란히 확인한다. 얼굴 윤곽·눈/코·피부·헤어·나이·체형, 의상/액세서리, 인원·악기·손/손가락, 공간 구조·주요 가구·소품, 빛 방향·색·시간대, 화면축·구도를 검사한다. 의도된 변화는 bible/버전과 맞춰 보고, 신체 오류나 다른 얼굴을 스타일 변화로 승인하지 않는다.

keys 검수자는 `review/keys.json.keys`에 pass/fail, 서로 다른 reviewer/producer, 관찰 근거와 현재 네 계획 JSON의 canonical `input_sha256`를 기록한다. 이 digest가 바뀌면 key 승인은 stale다. `keys` 단계는 master/sheet/wardrobe/background/prop 같은 실제 key만 검사하며 미래 shot-start/end·panel/page는 요구하지 않는다. 보드 단계에서는 `review/images.json.storyboard`에 pass/fail, 서로 다른 reviewer/producer, 전체 panel ID, 같은 canonical `input_sha256`, 실제 관찰 근거를 기록한다. full storyboard 검수는 전역 storyboard 결속을 쓰므로 keys 객체를 복사할 필요가 없다. 검수 뒤 파일이나 입력 JSON이 달라지면 해당 승인과 소비 샷은 stale다. fail 또는 누락이 있으면 LTX 생산에 넘기지 않는다. 같은 오류의 추가 시도 최대1회, 전체 검토 수정 최대2회와 사용자 예산을 함께 지킨다.

## 오프라인 검증

보드의 사진 경로는 최종 manifest의 전체 자산 매핑으로 해석한다. 이번 배치의 신규 API 성공 목록만 사용하면 재사용한 표본이 누락될 수 있다. `undefined`·없는 파일·이미지 decode 실패는 조립 오류로 처리하고 회색 대체 칸을 성공 산출물로 남기지 않는다. HTML로 렌더링하면 모든 `img`의 decode 성공과 `naturalWidth > 0`을 캡처 전에 확인한다. 파일 개수·SHA 통과와 별개로, 실제 페이지의 모든 패널에 올바른 사진이 보이는지 원본과 대조한다.

검증기에 전달하는 manifest는 `schema_version`, `assets`만 두고, 각 자산은 `id`, `path`, `sha256`, `width`, `height`, `tool`과 API 방식일 때의 `model`만 사용한다. 실제 제출 프롬프트·참조 순서·응답·usage·원응답 해시 등 상세 생성 기록은 별도 provenance JSON에 보존한다. 임의 메타데이터를 manifest에 섞거나 `sha256`을 다른 이름으로 바꾸면 엄격한 계약 검사에서 거부된다. 파일 개수·자체 해시 검사뿐 아니라 해당 manifest를 실제 `validate_preproduction.py`에 입력해 확인한다.

```bash
python3 -B .agents/skills/road-music-mv/scripts/validate_preproduction.py \
  --root /absolute/run-root \
  --plan /absolute/run-root/direction/image-plan.json \
  --shots /absolute/run-root/direction/shot-plan.json \
  --bible /absolute/run-root/direction/bible.json
python3 -B .agents/skills/road-music-mv/scripts/validate_preproduction.py \
  --root /absolute/run-root \
  --plan /absolute/run-root/direction/image-plan.json \
  --shots /absolute/run-root/direction/shot-plan.json \
  --bible /absolute/run-root/direction/bible.json \
  --manifest /absolute/run-root/visuals/asset-manifest.json \
  --review /absolute/run-root/review/images.json --require-ready
```

새 전체 연출 모드는 production design과 storyboard를 함께 주고 단계를 명시한다. `keys`는 실제 소비되는 key만, `storyboard`는 모든 keyframe과 실제 compose page를, `animatic`은 실제 원곡이 들어간 독립 검수 미디어까지 요구한다. storyboard panel의 `at_frame`은 전역으로 엄격히 증가하고, page는 그 panel 순서를 바꾸지 않는다.

```bash
python3 -B .agents/skills/road-music-mv/scripts/validate_preproduction.py \
  --root /absolute/run-root \
  --plan /absolute/run-root/direction/image-plan.json \
  --shots /absolute/run-root/direction/shot-plan.json \
  --production-design /absolute/run-root/direction/production-design.json \
  --storyboard /absolute/run-root/direction/storyboard.json \
  --stage storyboard \
  --manifest /absolute/run-root/visuals/asset-manifest.json \
  --review /absolute/run-root/review/images.json --require-ready
```

Bible은 상세 cast·세계관에만 추가한다. 새 production-design 모드에서 둘 이상의 인물·상세 세계관을 소비하면 Bible의 연령/성인 여부·정체성·의상·장소·시대 규칙이 필요하며, 없으면 `keys`부터 ready:false다. 기존 단일 솔로·라이브 계획과 이 예시의 `hero`는 `--bible` 없이 동일한 기존 게이트를 사용한다. 계획-only는 ready:false로 정상이다. `--require-ready`는 필수 이미지/검수 누락이면 exit3, 잘못된 참조·파일 변조·잘못된 이미지 등은 exit2다. 이 도구는 이미지 API를 호출하거나 얼굴 동일성을 자동 인식하지 않는다. 실제 이미지 관찰·독립 검수와 함께 사용한다.

## 최소 JSON 계약

- plan: `schema_version:1`, `profile:{music_genre,visual_format,visual_look}`, `characters:[{id,identity_asset_id}]`, `locations:[{id,background_asset_id}]`, `assets:[{id,kind,required,method,character_ids,location_id,references,prompt,invariants}]`.
- kind: `identity-master`, `character-sheet`, `wardrobe`, `background`, `prop`, `shot-start`, `shot-end`, `storyboard-sheet`. 새 생성 method는 선택한 `openai-images-api` 또는 `image_gen`, 기존 자산은 `reuse`; `compose`는 `storyboard-sheet`에서만 사용한다. compose된 manifest asset만 `tool:local-composite`을 쓴다.
- shots: `{shots:[{id,character_ids,location_id,start_image_asset_id,end_image_asset_id?}]}`. 인물/공간과 시작·끝 이미지가 일치해야 한다. LTX의 다른 생성/편집 필드는 이 객체에 함께 기록한다.
- Bible을 쓰는 shots에는 `wardrobe_by_character:{member_id:wardrobe_id}`가 cast 전체에 필요하다. 해당 keyframe의 전이 참조에는 각 멤버의 Bible 의상 asset이 있어야 한다.
- manifest: `{schema_version:1,assets:[{id,path,sha256,width,height,tool}]}`. path는 run-root 내부 상대 경로, 새 생성 tool은 선택한 `openai-images-api` 또는 `image_gen`, 제공 자산은 `provided`다. API 자산의 `model`은 계획과 같아야 한다.
- keys review: `review/keys.json`의 `keys:{verdict,reviewer_id,producer_id,evidence,input_sha256}`. reviewer와 producer는 달라야 하고 digest는 현재 4개 계획 JSON과 일치해야 한다.
- image review: `{schema_version:1,assets:[{id,sha256,verdict,evidence}]}`. storyboard/animatic 단계의 `storyboard:{verdict,reviewer_id,producer_id,evidence,panel_ids,input_sha256}`는 모든 panel과 현재 digest를 전역 결속한다. verdict는 pass/fail이며 검수 결과는 실제 파일 해시에 결속한다.

장르/형식/look 문자열은 사용자 조합을 제한하지 않는다. cast master·시트·장소 anchor와 필수 이미지, 각 샷이 소비하는 이미지 및 참조 선행 자산은 모두 준비해야 한다. 사용하지 않는 optional 자산은 필수로 승격하지 않는다. 실사 원본이나 이미 충족된 승인 자산은 원본을 보존하면서 필요한 범위에서 재사용한다.

부분 성공을 인계할 때는 실제 PNG·요청 기록과 현재 manifest의 ID 집합·행수를 직접 읽어 기록한다. 재사용하기로 한 파일이 아직 부분 manifest에 병합되지 않았을 수 있으므로 계획한 총수를 실제 수량으로 쓰지 않는다. 기존 통과 파일은 새 요청 없이 병합하고 최종 필수 집합을 검증한다.

전체 연출의 16개 음악 근거, compose 금지 경계, `input_sha256`, 정규화 PCM 애니매틱 원곡 대조는 [creative-direction.md](creative-direction.md)를 따른다.
