# 그룹·세계관 Bible 기획

이 문서는 확정된 음원·가사를 받은 뒤, 다인 캐스트·반복 장소·의상 변형이 있는 MV의 화면 연속성을 기획하는 계약이다. 작곡, 음악 제작을 위한 후보 청취/평가, 후보 비교, 곡 선정은 다루지 않는다. 확정 음원의 구간·비트·감정 파악과 소리/영상 동기 검수는 MV 단계에 남는다. 단일 인물 라이브·인물 없는 풍경처럼 상세 cast/세계관이 없는 기존 MV에는 선택 사항이다.

## 언제 Bible을 만드는가

그룹 멤버를 반복해서 보이거나, 캐릭터의 나이·외형·의상·장소·시대가 샷을 넘어 유지되어야 하면 `direction/bible.json`을 만든다. 다인 아이돌 퍼포먼스, 서사형 캐스트, 실존/가상 장소를 오가는 영상이 대표적이다. Bible을 만들었다면 이후 image plan과 shot plan은 이를 벗어나지 않고 `--bible` 검사를 사용한다.

4인 성인 가상 그룹은 [group-world-bible.example.json](../assets/group-world-bible.example.json)의 **2026 현실 기반** 예시다. 멤버별 얼굴 불변 조건·색 포인트는 공유해도, 그룹 전원이 같은 룩을 입는다는 뜻은 아니다. 모든 장르·그룹에 성인 설정이나 같은 인원 수·시대·장소를 요구하지 않는다. 사용 인물의 실제 나이·권리·공개 범위는 별도로 확인하며, `adult_cast`는 18세 기준의 기획 일관성 플래그일 뿐 법률 판단이나 임의의 성인 설정으로 제약을 피하는 수단이 아니다.

이전 2032/우주 정원 예시는 과거 기획 기록으로 보존하며 기본값으로 쓰지 않는다. K-pop의 기본 시작점은 사용자 레퍼런스를 우선해 채광 스튜디오, 도심 옥상, 거리·카페, 해안도로 같은 현실적인 허구 공간과 멤버별 패션·단체/솔로·일상/감성 구성을 검토하는 것이다. 몽환적 장면은 곡과 레퍼런스에 맞을 때 선택하고, 우주·비인간 변형·강한 SF는 사용자 선택 또는 확정곡·지정 레퍼런스의 근거가 있을 때 선택한다.

## 최소 기획 결정

`group`에는 ID·이름·허구 여부·인원·나이 기준 연도·성인 캐스트 여부, 음악 정체성(영상 연출을 위한 맥락)·보컬 의도·의상 스타일·무드와 멤버를 기록한다. 멤버마다 역할·보컬 의도·헤어·얼굴/체형 불변 조건·본인 의상 ID·identity master ID를 정한다. 이 항목은 모델의 멤버별 고정 음색·인원별 보컬 분리 또는 실제 가창 성능을 보장하지 않는다.

`world`에는 시대/연도·계절·무드·세계 규칙을 쓴다. `world.year`가 정수면 `group.age_reference_year`와 각 비null `location.year`가 같아야 한다. 혼합 시대나 시대를 특정하지 않는 판타지라면 `year:null`과 장소별 연도·전환·시간성 규칙을 명시한다. `locations`에는 다음을 서로 분리해 기록한다.

- 촬영 성격: `studio`, `on-location`, `virtual-set`, `mixed`; 실내/실외/혼합
- 존재 근거: `real`, `real-inspired`, `fictional`; 실존 또는 실존 영감은 장소명과 최소 한 개의 출처
- 표현 방식: 현실적·양식화·우주·판타지 등의 `realism`과 `environment`
- 연속성: 연도·계절·시간·날씨, 지리, 카메라 축과 출입구·무대·랜드마크 상대 위치 같은 고정 레이아웃

`wardrobes`에는 본인 멤버 ID·팔레트·설명·시대·허용 장소 ID를 기록한다. 한 멤버의 `wardrobe_ids`는 그 멤버가 소유한 의상만 가리킨다. 그룹의 통일도와 공통 소재·재단·장식·신발을 [미술 지침](music-led-lookdev.md)에 따라 먼저 정하고, 같은 컬렉션 안의 멤버별 차이를 각각 기록한다. 동일한 옷을 선택해도 인물별 wardrobe ID와 본인 참조 계보는 유지한다. 장소와 의상은 반복에 필요한 범위만 만든다. 선택곡에서 쓰지 않을 판타지 장소는 Bible에 남겨도 image plan에 강제로 넣지 않는다.

인원·연령대·컨셉을 고른 음악적 이유와 촬영/필름룩·효과·스토리라인은 [production-design 계약](creative-direction.md)에 둔다. Bible은 인물·의상·세계/장소의 기준을, production-design의 `props`는 소품 asset·허용 인물/장소·연속성 규칙을 소유한다. shot의 소품 상태·소유자·화면 위치와 keyframe 참조를 이 계약에 연결한다. 같은 결정을 여러 문서에서 서로 다르게 확정하지 않는다. 전체 MV의 새 모드는 Bible 검사에 더해 keys/storyboard/animatic 단계별 준비·독립 검수와 현재 계획 digest 결속을 적용한다. 아래 기존 이미지-only 명령이 전체 애니매틱 준비까지 보증하는 것은 아니다.

새 의상/장소를 설계할 때는 [미술 조사와 실사 촬영 지침](music-led-lookdev.md)을 먼저 적용한다. 같은 멤버의 여러 룩은 각각 본인 wardrobe ID와 그 룩의 master/시트를 갖고, 시트→해당 의상 master→공통 identity master 계보를 남긴다. 새로운 의상 디자인은 기존 얼굴/헤어의 재디자인 권한이 아니다.

## 이미지와 샷 연결

`image-plan.json`의 전체 `characters`는 Bible 멤버와 같고 identity master ID도 일치해야 한다. image plan의 `locations`는 Bible 장소의 부분집합이며 배경 asset ID가 같아야 한다. identity master·배경·의상 ID는 image plan의 전역 asset namespace에서 서로 겹치지 않는다. plan의 `kind:"wardrobe"` asset은 Bible의 의상 ID이며 본인 단일 `character_ids`여야 한다. Bible에 기록한 선택 후보·미사용 look은 부분 제작 plan에서 생략할 수 있지만, shot이 선택한 의상은 반드시 plan asset으로 만들어야 한다.

Bible을 쓰는 `shot-plan.json`의 각 캐스트 샷에는 다음처럼 `wardrobe_by_character`를 둔다. mapping은 그 샷 cast 전체를 포함하고, 본인 의상이며 해당 location에 허용된 것만 쓴다.

```json
{
  "id": "chorus-01",
  "character_ids": ["noa", "miru"],
  "location_id": "prism-studio",
  "wardrobe_by_character": {"noa": "noa-stage-a", "miru": "miru-stage-a"},
  "start_image_asset_id": "chorus-01-start"
}
```

start/end keyframe의 `references` 전이 폐쇄에는 각 cast의 identity master, 해당 의상 asset, 배경 asset이 들어가야 한다. 따라서 master → 시트/의상, 장소 배경, 이들을 참조하는 단일 샷 기준 이미지의 계보가 보존된다. 구조 검증은 얼굴·공간의 시각적 동일성을 보장하지 않으므로, 이미지 검수는 실제 파일을 나란히 본 별도 증거가 필요하다.

## 검사

```bash
python3 -B .agents/skills/road-music-mv/scripts/validate_mv_context.py \
  --bible /absolute/run-root/direction/bible.json

python3 -B .agents/skills/road-music-mv/scripts/validate_preproduction.py \
  --root /absolute/run-root \
  --plan /absolute/run-root/direction/image-plan.json \
  --shots /absolute/run-root/direction/shot-plan.json \
  --bible /absolute/run-root/direction/bible.json \
  --manifest /absolute/run-root/visuals/asset-manifest.json \
  --review /absolute/run-root/review/images.json --require-ready
```

첫 명령은 Bible 구조만, 두 번째는 Bible과 실제 image/shot 자산의 연결까지 검사한다. 둘 다 음원 품질, 캐릭터 유사성, 립싱크 또는 생성 성공을 판단하지 않는다.
