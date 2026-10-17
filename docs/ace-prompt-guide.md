# ACE 프롬프트 최적화 가이드

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

ACE로 음악을 만들거나 가사·생성 옵션을 설계할 때 **작업 요청마다 먼저 읽는 가이드**다. 공식 권장사항을 로드뮤직의 실제 입력 처리에 맞게 적용한다. 품질은 가사 전달력·장르 적합성·편곡·음원 결함을 들어서 판단하며, 문서를 따랐다는 이유만으로 보장하지 않는다.

기준: ACE-Step 1.5 `acestep-v15-turbo` + `acestep-5Hz-lm-0.6B`. **확인일: 2026-10-15 KST.** 공식 원문은 [로컬 보관본](vendor/ace-step-1.5/README.md)에 있다. 이 문서는 공식 문서의 전문 번역이 아니라 로드뮤직 적용 가이드다.

작업 스킬은 [road-music-ace](../skills/road-music-ace/SKILL.md), 태그 선택은 [구간 태그 가이드](lyrics-tags.md)를 따른다. **기본은 가사·프롬프트 검토 후 생성**이며, 두 항목부터 생성까지 전부 자동 위임한 경우의 예외와 결과 자료는 [검토 규칙](music-review.md)에 정리했다.

사용자가 준 가사·프롬프트는 아래 최적화 예시보다 우선한다. 전처리·편곡 개선이 필요해도 원문을 덮어쓰지 말고 [원문·전달본과 추천](music-review.md#preserve-input)을 구분한다. 찬송가 원형을 유지하는 작업은 [참조 기반 리메이크](hymn-remake-guide.md#modes)도 확인한다.

> [!IMPORTANT]
> 이 문서는 현재 공개 CLI와 ACE Turbo·0.6B에 맞춘 적용 가이드다. 실제 입력 필드와 범위는 실행 버전의 `schema`가 우선한다.

1.7B LM·네이티브 XL·YuE2 MLX 비교나 모델별 FLOW 조정을 요청받았다면 [모델별 제작·비교 가이드](model-production-guide.md)를 함께 읽는다. 2026-10-16 비교의 입력 보존·실패 복구 절차와 실험 결과를 구분해 기록했다. CoT 비활성화·CFG·샘플링 조정은 보편적 가사 개선 설정으로 확인되지 않았으며, 이 문서의 기본 공개 CLI 옵션을 추가하거나 변경하지 않는다. `prompt:knowledge`의 `models` topic에서 별도로 조회할 수 있다.

## 목차

- [매 요청의 필수 절차](#workflow)
- [공식 문서에서 적용할 원칙](#principles)
- [로드뮤직과 공식 옵션의 차이](#compatibility)
- [캡션과 가사 길이 확인](#limits)
- [최적화 예시](#example)
- [청취 후 수정](#review)
- [근거와 갱신](#sources)

<a id="workflow"></a>

## 매 요청의 필수 절차

1. 이 가이드와 요청에 해당하는 공식 원문 부분을 읽는다. 일반 생성은 [Tutorial의 caption·가사](vendor/ace-step-1.5/en/Tutorial.md#about-caption-the-most-important-input), 옵션 판단은 [INFERENCE의 Turbo 처리](vendor/ace-step-1.5/en/INFERENCE.md#generation-parameters), 반복 비교는 [Musician's Guide](vendor/ace-step-1.5/en/ace_step_musicians_guide.md#tips-from-experience)를 참고한다.
2. [AGENTS.md](../AGENTS.md)의 상태 조회를 수행하고 `schema`로 실제 지원 옵션을 확인한다. 엔진·곡·대기 작업을 보존한다.
3. 사용자의 곡 수·언어·장르·보컬·길이·가사 보존 조건을 먼저 정한다. 장르·보컬·주악기·분위기·전개를 일관되게 설계한다.
4. 가사와 스타일을 분리해 작성한다. 아래 [입력 매핑](#limits)에 따라 스타일 원문을 `genre`로 옮겨 `prompt:compose`에 **동일한 가사·parts 값**을 전달한다. `lyrics:clean`으로 정리 결과를, `lyrics:check`로 분량을 확인한다. renderer 작업 중에는 다른 renderer 요청을 섞지 않는다.
5. 정리된 가사와 최종 caption이 [실효 길이](#limits)를 넘지 않는지 확인한다. 초과하면 먼저 작성 내용을 줄이거나 요청 범위에 맞게 재구성한다. 원문 가사의 정확한 보존이 요청됐다면 임의 삭제하지 말고 길이 문제를 보고한다.
6. 기술 검증한 전체 가사·최종 caption·JSON·근거를 보여주고 요청자의 검토를 기다린다. 두 항목과 생성까지 전부 자동 위임한 경우나 같은 완성안을 이미 승인받은 경우는 다시 묻지 않는다. [검토 규칙](music-review.md)을 따른다.
7. 승인 또는 자동 위임 범위의 JSON으로 요청한 곡 수만 생성하고 `--wait` 또는 `job:wait`으로 완료를 확인한다. 실제 파일·가사·최종 옵션·확인 가능한 seed·참고 자료와 선택 이유를 제공한다.
8. 청취할 수 있으면 아래 [청취 기준](#review)으로 점검한다. 청취할 수 없으면 파일·옵션 검증과 청취 평가를 구분해 보고한다.

공식 문서의 “2~4개 후보를 만들어 고르기”는 **비교 생성을 요청받았거나 허용된 경우**에 적용한다. 1곡 요청을 임의로 여러 곡 생성으로 바꾸지 않는다. 실행 가능한 JSON 준비까지만 요청했다면 5단계까지 검증하고 안을 제공한다. 단순 텍스트 초안만 요청한 경우는 [초안의 정적 점검 범위](music-review.md#validation)를 따르며 서비스를 시작하지 않는다.

<a id="principles"></a>

## 공식 문서에서 적용할 원칙

| 원칙 | 로드뮤직에 적용하는 방법 |
| --- | --- |
| 모호한 감정보다 구체적인 음악 요소 | “슬프게”에 장르·보컬 음색·주악기·편곡 질감을 더한다 |
| 핵심 방향을 정한 뒤 필요한 세부만 추가 | 우선 한 장르와 주악기 1~3개를 선택하고 상충하는 표현을 줄인다 |
| caption은 전체 분위기, lyrics는 시간에 따른 전개 | 스타일에는 편성·음색, 가사에는 섹션과 실제 부를 말을 배치한다 |
| 캡션·가사 간 일관성 | 피아노 독주 요청과 기타 솔로 지시, 연주곡과 보컬 가사를 동시에 넣지 않는다 |
| 짧고 명확한 섹션 태그 | 기본 섹션과 실제 가사를 쓰고, 복잡한 연출 수식어는 스타일로 옮긴다 |
| 가사 리듬과 호흡 | 대응하는 벌스의 줄 길이를 비슷하게 하고 빽빽한 구절을 줄인다 |
| 반복 비교 | 같은 조건의 seed 비교와, seed를 유지한 한 요소 변경을 구분해 기록한다 |

공식 가이드는 한 줄 6~10음절을 초안 작성의 팁으로 제안한다. 한국어 가사의 필수 규칙으로 강제하지 않는다. 한글 음절 수·실제 발음·템포·쉼을 함께 보며, 사용자가 준 문장을 기계적으로 잘라 맞추지 않는다. [공식 가사 작성 원칙](vendor/ace-step-1.5/en/Tutorial.md#about-lyrics-the-temporal-script)

공식 ACE는 쉼표 태그와 자연어 설명을 모두 지원한다. **로드뮤직은 자체 정리 로직 때문에 짧은 쉼표 태그가 적합하다.** 공백 기준 10단어가 넘는 개별 태그는 삭제되며 대괄호·줄바꿈·중복 태그도 정리된다. 이는 ACE 모델 자체의 “영어 태그만 지원” 제약이 아니다.

권장 배치 순서:

```text
Korean rock ballad, female rock vocal, warm piano, melodic guitar,
restrained verse, soaring chorus, spacious mix
```

필요 이상의 `best quality`, `masterpiece` 같은 평가어를 쌓기보다 실제 원하는 음색·편곡·보컬 전달을 적는다. 장르를 섞을 때도 핵심 방향과 변화 구간을 구분한다.

<a id="compatibility"></a>

## 로드뮤직과 공식 옵션의 차이

| 공식 ACE 개념 | 현재 로드뮤직에서의 적용 | 생성 전에 확인할 것 |
| --- | --- | --- |
| `caption` | `style` 또는 `parts.genre`를 조합해 전달 | `parts.genre`가 있으면 `style`을 대체한다 |
| 자연어 caption | 짧은 태그로 정리 후 전달 | 긴 설명문이 그대로 엔진에 전달된다고 가정하지 않는다 |
| `lyrics`·세부 연출 태그 | 로드뮤직이 가사를 정리한다 | `[Verse 1]`은 `[Verse]`, `[Chorus - anthemic]`은 `[Chorus]`로 정리된다. `[Pre-Chorus]`는 보존. [전체 태그 대응표](lyrics-tags.md#official) 참고 |
| 보컬 언어 | 한글 가사에서 `ko` 감지 | `vocal_language`·`language`를 CLI JSON에 임의 추가하지 않는다 |
| BPM | `bpm` 또는 `parts.bpm`, 40~220 | ACE 공식 범위 30~300을 CLI에 그대로 넣지 않는다 |
| 조성·박자 | 현재는 style 요청 태그로 표현 | `keyscale`·`timesignature` 전용 CLI 입력은 없다 |
| `duration` | `targetSeconds`, ACE 1~600초 | 10초 미만은 최소 10초 생성 후 잘라낸다 |
| Turbo 추론 | `inference_steps=8`, `shift=3.0` 고정 | 사용자가 조절할 CLI 옵션으로 안내하지 않는다 |
| CFG | 공식 Turbo는 CFG를 쓰지 않고 `guidance_scale=1.0`으로 교정 | Base/SFT용 CFG 증대 조언을 적용하지 않는다 |
| LM thinking | 일반 음악 생성은 켜짐, 커버·효과음은 꺼짐 | `thinking`을 CLI에 추가하지 않는다 |
| LM sampling·`advanced` | Road Music의 `advanced`는 YuE 전용 | ACE 품질을 높인다며 temperature·CFG·ODE 값을 넣지 않는다 |
| 여러 후보 | `count:1..8`로 별도 작업 제출 | ACE 내부 `batch_size`는 1이며 `count`는 내부 병렬 배치와 다르다 |
| Repaint·LoRA·XL·Base·SFT | 현재 공개 CLI에서 직접 선택하지 못함 | 공식 원문의 명령을 우회 실행하거나 모델을 자동 설치하지 않는다 |

문서끼리 기본값 설명이 다르면 모델별 영어 INFERENCE와 실제 워커를 먼저 비교한다. 로드뮤직 JSON의 허용값은 실행 버전 `schema`를 따른다. “공식 기능이 존재한다”와 “로드뮤직 CLI가 노출한다”를 구분한다.

<a id="limits"></a>

## 캡션과 가사 길이 확인

| 항목 | CLI 입력 상한 | ACE에 실제 전달되는 내용 |
| --- | --- | --- |
| 스타일 | `style`·`parts.genre` 각각 2,000자 | 조합된 caption의 앞 512자 |
| 가사 | `lyrics` 20,000자 | 정리된 가사의 앞 4,096자 |

**512자·4,096자는 Road Music 워커의 현재 처리 한계이며 ACE 모델의 일반 한도가 아니다.** Python 문자열의 문자 수를 기준으로 한다. 스타일은 입력 원문이 아니라 악기·BPM·연주곡/strict 문구까지 붙은 **최종 문자열**을 확인한다. `instrumental`과 `strict`를 함께 켜면 자동 추가 문구만으로도 여유가 줄어든다.

`prompt:compose`에는 생성 JSON의 `parts` 필드를 최상위로 풀어 넣는다. `parts.genre`가 없으면 `style`을 `genre`로 옮기고, 최상위 `bpm`·연주곡 여부도 동일하게 맞춘다. 반환된 스타일의 길이와 notes를 확인한다. 결과를 다시 원문 `style`에 넣고 같은 parts를 중복 조합하지 말고, 검증한 **원래 입력**으로 생성한다.

```bash
node cli/road-music.js prompt:compose --json '{"genre":"Korean rock ballad, female rock vocal, restrained verse, soaring chorus, spacious mix","instruments":["piano","electric guitar","drums"],"bpm":72,"lyrics":"[Verse]\n창문 너머 아침이 와"}'
```

최종 caption이 512자를 넘으면 덜 중요한 태그를 줄이고 다시 조합한다. 끝부분이 잘리도록 두거나, 사용자 핵심 요구와 자동 보컬 억제 문구를 임의로 누락하지 않는다. 효과음은 별도 접미사 `sound effect, no music, no vocals`를 붙이므로 설명 길이에 더 여유를 둔다.

가사 4,096자 초과 시 후반 절·마지막 후렴이 엔진에 전달되지 않을 수 있다. 새 창작 가사는 길이 안에서 작성하고, 정확한 원문 보존 요청은 조용히 축약하지 않는다. 현재 CLI는 이 실효 상한을 별도 오류로 거부하지 않으므로 에이전트가 사전에 확인해야 한다.

<a id="example"></a>

## 최적화 예시

### 짧게 요청하기

```text
ACE 가이드를 따라 한국어 여성 락발라드 1곡을 만들어줘.
150초, 피아노·일렉기타·드럼 중심으로 첫 절은 절제하고 마지막 후렴은 넓게 펼쳐줘.
가사와 최종 caption이 잘리지 않는지 확인하고 완료된 음원을 가져와줘.
```

### 요청을 JSON으로 구체화하기

아래는 일관된 방향·간결한 caption·직접 구성한 한국어 가사를 보여주는 예시다. 수치는 청취로 입증한 최적값이 아니다. 승인받거나 자동 위임 범위에서 검증한 입력을 `song.json`으로 저장해 `song:generate --file song.json --events --wait`에 전달한다.

```json
{
  "title": "문을 여는 아침",
  "engine": "ace",
  "style": "Korean rock ballad, female rock vocal, restrained verse, soaring chorus, spacious mix",
  "lyrics": "[Verse]\n창문 너머 아침이 와\n어제 접은 편지를 덮어\n가만히 내 이름을 불러\n오래 잊은 나를 깨워\n[Chorus]\n나는 이 문을 열고 갈게\n아직 떨리는 마음을 안고\n너를 기다리던 시간 너머\n나를 기다리는 빛으로\n[Verse]\n익숙했던 거리 끝에도\n처음 보는 꽃들이 피어\n혼자 걷는 느린 걸음이\n조금씩 내 노래가 돼\n[Chorus]\n나는 이 문을 열고 갈게\n아직 떨리는 마음을 안고\n너를 기다리던 시간 너머\n나를 기다리는 빛으로\n[Bridge]\n지나온 날을 지우지 않아\n그 안에 나를 두진 않을게\n[Chorus]\n나는 이 문을 열고 갈게\n내가 나의 손을 잡고서\n끝이라 부른 자리 너머\n새로운 아침을 만나러",
  "targetSeconds": 150,
  "count": 1,
  "seed": 42,
  "parts": {"instruments": ["piano", "electric guitar", "drums"], "bpm": 72, "strict": false}
}
```

이 예시에는 ACE에 적용되지 않는 `advanced`나 존재하지 않는 보컬 전용 필드가 없다. 보컬·전개는 태그와 가사로 유도하며 실제 준수 여부는 청취한다. 다른 장르에도 같은 절차를 적용한다. [장르별 출발점](genre-prompts.md)과 [전체 옵션](music-options.md)을 함께 참고한다.

<a id="review"></a>

## 청취 후 수정

| 확인 항목 | 문제가 들릴 때 수정 방향 |
| --- | --- |
| 한국어 발음·호흡 | 빽빽한 줄을 줄이고 같은 위치의 줄 길이를 맞춘다 |
| 후렴의 인상 | 짧은 창작 훅을 가사에 실제로 반복하고 불필요한 장면을 덜어낸다 |
| 악기·보컬 충돌 | 주요 편성을 좁히고 상충하는 장르·음색 태그를 제거한다 |
| 전개·마무리 | 가사 섹션과 목표 길이를 함께 조절한다. 마지막 후렴이 잘렸는지도 확인한다 |
| 허밍·불필요한 보컬 | 연주곡 설정·최종 caption 잘림 여부를 먼저 확인한다 |
| 노이즈·클리핑·갑작스러운 전환 | 실제 파일 결함과 취향 차이를 구분하고, 승인된 범위에서 새 후보를 비교한다 |

같은 가사·스타일의 seed 비교는 서로 다른 멜로디를 탐색하는 과정이다. 한 요소의 효과를 비교할 때는 seed와 나머지 입력을 고정한다. 다만 환경·모델·계획 단계 때문에 완전히 같은 보컬이나 멜로디가 유지된다고 약속하지 않는다.

수정 생성은 사용자의 요청 범위에서만 수행한다. 기존 곡을 삭제하거나 교체하지 않는다. `song:resume`을 스타일 수정 기능으로 쓰거나, 로드뮤직에서 노출하지 않는 Repaint 기능을 우회 호출하지 않는다.

<a id="sources"></a>

## 근거와 갱신

| 근거 | 확인한 범위 |
| --- | --- |
| [공식 Tutorial 보관본](vendor/ace-step-1.5/en/Tutorial.md) | caption 구체화, 가사 구조, 일관성, 모델별 차이 |
| [공식 INFERENCE 보관본](vendor/ace-step-1.5/en/INFERENCE.md) | Turbo 8 steps·shift 3·CFG 처리, 언어·길이·BPM |
| [공식 음악가 가이드](vendor/ace-step-1.5/en/ace_step_musicians_guide.md) | 짧은 caption부터 시작, 반복 비교와 seed |
| [로드뮤직 ACE 워커](../python/ace_worker.py) | 실제 모델·고정값·caption/lyrics 슬라이스 |
| [로드뮤직 입력 정리](../electron/cli-generation.js)·[스타일/가사 정리](../renderer/prompt.js) | `parts` 우선순위·caption 조합·태그 정리 |

원문은 [고정 커밋의 공식 저장소](https://github.com/ace-step/ACE-Step-1.5/tree/ca1e85fe9430179831e6bc6be790c332190a3866)에서 가져왔다. 출처·저작권·해시·갱신 절차는 [보관본 안내](vendor/ace-step-1.5/README.md)를 따른다. 엔진 버전이나 로드뮤직 워커가 바뀌면 이 적용표와 예시도 다시 검증한다.
