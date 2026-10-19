# 음악 생성 옵션 가이드

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

원하는 소리를 CLI 입력으로 바꾸는 실전 가이드다. 바로 요청하려면 [장르별 프롬프트](genre-prompts.md), 최근 흐름을 조사하려면 [리서치 기반 음악 만들기](music-research.md)를 사용한다. 설치·작업 보존·오류 대응은 [AGENTS.md](../AGENTS.md)를 따른다.

ACE 작업은 요청마다 먼저 [공식 가이드 적용 절차](ace-prompt-guide.md)를 읽는다. [공식 원문 보관본](vendor/ace-step-1.5/README.md)을 근거로 caption·가사·지원 옵션을 점검한다.

`[Verse]`·`[Chorus]` 등의 뜻과 실제 전달 결과는 [구간 태그 가이드](lyrics-tags.md), 생성 전 승인과 전부 자동 위임의 차이는 [검토 규칙](music-review.md)을 따른다. 아래 자연어 요청 예시도 기본 검토 절차를 적용한다.

## 목차

- [시작 방법](#start)
- [요청과 옵션의 대응](#mapping)
- [기본 생성 옵션](#basic)
- [스타일·악기·템포·구성](#parts)
- [가사와 보컬](#lyrics)
- [복사해서 쓰는 JSON 예시](#examples)
- [YuE 전용 고급 옵션](#advanced)
- [커버·허밍·악보](#reference-audio)
- [저장·재생·플레이리스트](#output)
- [결과를 개선하는 순서](#improve)

<a id="start"></a>

## 시작 방법

AI에게 자연어로 요청하거나 직접 JSON 파일을 만들어 실행한다. 자연어 요청을 해석하고 가사를 쓰는 주체는 AI 에이전트다. CLI 자체에는 웹 검색·대화형 작사 기능이 없다.

```text
AGENTS.md와 docs/music-options.md를 따라 한국어 여성 보컬의 애절한 락발라드 1곡을 만들어줘.
150초, 72 BPM, 피아노·일렉기타 중심, 마지막 후렴에서 감정이 커지는 창작 가사로 부탁해.
```

직접 사용할 때는 먼저 현재 설치 버전을 확인한다. `schema`는 서비스 없이 읽을 수 있고, 나머지 조회는 로컬 서비스를 시작할 수 있다.

```bash
node cli/road-music.js schema --json '{"command":"song:generate"}'
node cli/road-music.js app:state
node cli/road-music.js engines:list
node cli/road-music.js projects:list
node cli/road-music.js songs:list
node cli/road-music.js setup:check
node cli/road-music.js prompt:catalog
```

아래 JSON 예시를 검토·승인한 뒤 `song.json`으로 저장하고 키트 폴더에서 실행한다. 전체 자동 위임이라면 기술 검증 후 바로 실행할 수 있다. 이 명령은 실제 곡을 생성한다. 모델이 준비되지 않았다면 설치를 별도로 요청한다.

```bash
node cli/road-music.js song:generate --file song.json --events --wait
```

`--wait`은 반환된 각 `jobId`에 대해 `job:wait`을 수행한다. stdout의 최종 JSON과 실제 오디오 경로를 확인한다. 입력 스키마 통과는 음질 검증과 다르다.

<a id="mapping"></a>

## 요청과 옵션의 대응

| 원하는 것 | 전달하는 곳 | 적용 방식 |
| --- | --- | --- |
| 장르·분위기·편곡 | `style` 또는 `parts.genre` | 짧은 쉼표 태그로 엔진에 요청 |
| 한국어 가사 | `lyrics`에 직접 한글 입력 | ACE는 가사에서 언어를 감지한다 |
| 여성·남성·듀엣·보컬 음색 | `style`에 `female vocal` 등 | 모델에 대한 요청이며 결과를 보장하지 않는다 |
| 주악기 최대 16개 | `parts.instruments` | 지원 악기 목록으로 스타일을 조합한다 |
| BPM | 최상위 `bpm` 또는 `parts.bpm` | ACE는 생성 인수에도 전달, YuE는 스타일 태그로 요청 |
| 보컬 없는 연주곡 | `instrumental:true` | 가사를 연주곡용 골격으로 교체하고 보컬 억제 태그 추가 |
| 곡 길이 | `targetSeconds` | ACE는 생성 길이에 사용한다. `yue-mlx`는 기록·비교용 목표값이며, 최종 길이는 파일로 확인 |
| 비교 후보 | `count`, `seed` | 여러 작업을 제출하고 seed를 달리한다 |
| 후렴 위치·반복 | `lyrics`의 섹션과 가사 | 보컬곡은 직접 구성해야 한다 |
| 조성·박자 | `style`의 `A minor`, `six eight time` 등 | 독립 옵션이 아니므로 정확한 준수는 확인이 필요하다. `/`는 태그 구분자로 정리되므로 박자는 슬래시 없는 표현 사용 |
| MP3·WAV | 완료 후 `song:export` | 생성 JSON에 `format`을 넣지 않는다 |
| 최신 인기 스타일 조사 | AI에게 검색 요청 | CLI 옵션이 아니며 출처·집계 기간을 별도 기록한다 |

`language`, `vocalGender`, `voice`, `key`, `negativePrompt`, `quality` 같은 임의 필드를 `song:generate`에 추가하면 안 된다. 지원되지 않는 키는 거부된다. API는 [전체 레퍼런스](cli-reference.md), 최신 허용값은 실행 버전의 `schema`가 기준이다.

CCM을 주로 만든다면 [CCM 세부 옵션](ccm-prompts.md#options)과 [완전한 JSON 8개](ccm-prompts.md#json)를 참고한다. 회중·콰이어·기도·절기 표현도 위의 같은 공개 필드로 구성한다.

<a id="basic"></a>

## 기본 생성 옵션

| 옵션 | 허용값·범위 | 사용할 때 |
| --- | --- | --- |
| `title` | 최대 200자 | 결과를 구분할 제목. 비교 후보는 A·B 등 접미사가 붙는다 |
| `engine` | `ace` 기본, Windows NVIDIA용 `yue`, Apple Silicon용 `yue-mlx` | 설치 상태 우선. 두 YuE2 경로의 런타임은 다르다 |
| `style` | CLI 최대 2,000자 | ACE는 조합된 최종 caption의 앞 512자만 전달 |
| `lyrics` | CLI 최대 20,000자 | 보컬곡의 실제 가사. ACE는 정리 후 앞 4,096자만 전달 |
| `targetSeconds` | ACE 1~600, YuE2 20~360, 또는 `null` | `yue-mlx`는 유효 범위만 검사하고 모델 생성 길이에 직접 전달하지 않는다. 자연 EOS의 실제 길이를 기록·보고한다 |
| `count` | 정수 1~8, 생략 시 1 | 같은 사양의 후보 수. 서로 다른 장르 3곡은 별도 요청 3개로 나눈다 |
| `seed` | JavaScript 안전 정수 또는 `"0"`~`"9223372036854775807"` 정확한 십진 문자열, 또는 `null` | 비교 조건 기록. 큰 YuE seed는 문자열로 쓴다. 생략/`null`이면 무작위; 같은 seed도 환경 간 동일 음원을 보장하지 않는다 |
| `instrumental` | `true` / `false` | `true`면 입력 가사를 버린다. `parts.instrumental:true`도 같은 효과 |
| `bpm` | 정수 40~220 | 최상위 값이 `parts.bpm`보다 우선한다 |
| `parts` | [구조화 옵션](#parts) | 악기·템포·연주곡 구조를 나눠 작성 |
| `soundEffect` | `true` / `false` | ACE 효과음. 명시적 `style`, 1~30초 길이 필요 |
| `coverAudio` | `dir`, 선택 `title`, `strength` | [기존 곡 커버](#reference-audio), ACE 전용 |
| `recording` | `path`, 선택 `strength`, `targetSeconds` | [녹음 기반 생성](#reference-audio), ACE 전용 |
| `mode` | `song` / `plan` | `plan`은 YuE 악보 계획 모드 |
| `cot` | `full` / `melody` / `off` | YuE 작곡 방식. ACE 품질 옵션으로 사용하지 않는다 |
| `abc` | 최대 100,000자 | YuE ABC 악보 입력 |
| `advanced` | [고급 옵션](#advanced) | YuE 전용. ACE에는 적용되지 않는다 |

ACE는 짧은 요청도 내부적으로 최소 10초를 생성한 뒤 길이를 처리한다. `targetSeconds:1`이라고 생성 비용도 1초분이 되는 것은 아니다. 커버·녹음은 일반 `targetSeconds`와 다른 경로를 사용한다.

ACE의 512자·4,096자 한계는 로드뮤직 워커의 현재 구현이다. 입력 원문이 아니라 악기·BPM·strict·연주곡 문구까지 조합한 결과를 확인해야 한다. [길이 점검 절차](ace-prompt-guide.md#limits)를 따르고, 후반 가사나 보컬 억제 지시가 조용히 잘리게 두지 않는다.

`count:3, seed:42`는 42·43·44의 세 후보를 만든다. 상한을 넘으면 순환한다. `count:3`은 K-pop·트로트·발라드를 하나씩 만드는 기능이 아니다.

효과음은 가사·ABC·계획 모드·커버·녹음과 혼합하지 않는다. 음악 예시는 기본적으로 `soundEffect`를 생략한다.

<a id="parts"></a>

## 스타일·악기·템포·구성

### 스타일 작성법과 우선순위

```text
Korean emotional rock ballad, female vocal, restrained verse,
soaring chorus, warm piano, melodic electric guitar, spacious mix
```

위처럼 한 태그를 짧게 쓴다. 실제 `style` 문자열에는 쉼표로 이어 넣는다. CLI는 중복 태그와 라벨을 정리하며, 공백으로 나눠 10단어를 초과하는 긴 태그는 제거한다. 한 문단으로 곡 전체의 서사를 쓰기보다 장르·보컬·악기·다이내믹을 나눈다.

`parts.genre`가 있으면 `style` 대신 사용한다. 둘에 서로 다른 내용을 넣으면 합쳐지지 않는다. 다음 중 한 방식으로 통일한다.

- 빠른 작성: `style`에 음악적 태그, `parts`에는 악기와 BPM만 지정.
- 구조화 작성: `parts.genre`에 음악적 태그를 지정하고 `style`은 생략.

### 구조화 옵션

| 옵션 | 허용값 | 실제 의미 |
| --- | --- | --- |
| `parts.genre` | 최대 2,000자 | `style`보다 우선하는 장르·스타일 원문 |
| `parts.instruments` | 지원 악기 배열, 최대 16개 | 1개면 독주/단일 반주 문구, 여러 개면 합주 문구를 추가 |
| `parts.instrumentation` | `{instrument, role, technique?, section?}` 배열 | 자유 악기명과 역할을 짧은 style 태그로 조합. 멀티트랙·개별 믹서 제어는 아님 |
| `parts.vocal` | 짧은 태그 배열 | 성별·발성·발음·구간별 에너지의 보컬 요청. 특정 가수 고정 아님 |
| `parts.dynamics` | 짧은 태그 배열 | 전주·벌스·후렴·브리지의 에너지 흐름 요청 |
| `parts.mix` | 짧은 태그 배열 | 보컬 전면·공간감·저역 등 음향 의도 요청. 자동 마스터링 값은 아님 |
| `parts.bpm` | 40~220 정수 또는 `null` | 스타일의 기존 BPM 태그를 정리해 하나로 만든다 |
| `parts.strict` | 불리언 | 지정 악기 중심의 제한 문구. 실제 음색 혼입을 완전히 막지는 못한다 |
| `parts.strong` | 불리언 | `strict`와 함께 켜면 YuE `cfgScale` 기본값 1.5를 추가. ACE 강화 옵션이 아니다 |
| `parts.instrumental` | 불리언 | 최상위 `instrumental`과 OR 조건. 한쪽이 참이면 연주곡 |
| `parts.structure` | `""`, `pop`, `short`, `theme`, `loop` | CLI에서는 **연주곡 가사 골격**에 적용. 보컬 가사를 재배열하지 않는다 |

`strict` 문구에는 드럼·퍼커션·신스를 억제하는 표현도 들어간다. 드럼이 중요한 K-pop·트로트·록 예시에서는 기본적으로 끄고, 솔로 피아노 같은 편성에 사용한다. 사용자가 준 `advanced.cfgScale`은 `strong`의 기본값보다 우선한다.

| 구조 값 | CLI가 연주곡에 넣는 순서 |
| --- | --- |
| `""` | Intro → Verse → Chorus → Bridge → Outro |
| `pop` | Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro |
| `short` | Intro → Verse → Chorus → Outro |
| `theme` | Intro → Verse → Verse → Interlude → Chorus → Verse → Outro |
| `loop` | Intro → Verse → Chorus → Verse → Chorus → Outro |

`loop`는 A·B 반복형 구성을 요청하는 값이다. 파일의 시작과 끝이 완벽히 연결되는 오디오 루프를 보장하지 않는다.

### 선택할 수 있는 악기

| 분류 | `parts.instruments`에 넣는 정확한 값 |
| --- | --- |
| 건반 | `piano`, `Rhodes electric piano`, `pipe organ`, `celesta`, `music box` |
| 기타·베이스 | `acoustic guitar`, `classical guitar`, `electric guitar`, `bass guitar`, `upright bass`, `ukulele`, `mandolin` |
| 현악 | `violin`, `viola`, `cello`, `string ensemble`, `harp` |
| 목관·금관 | `flute`, `clarinet`, `oboe`, `saxophone`, `trumpet`, `trombone`, `french horn`, `brass section`, `harmonica`, `accordion` |
| 리듬·타악 | `drums`, `brushed drums`, `percussion`, `glockenspiel`, `sleigh bells`, `marimba`, `vibraphone` |
| 전자·합주 | `synthesizer`, `synth pads`, `orchestra` |

예를 들어 `guitar`, `strings`, `808`을 악기 배열에 넣으면 거부될 수 있다. `electric guitar`, `string ensemble`처럼 목록 값을 사용한다. `808 bass`, `haegeum`, `gayageum`처럼 목록에 없는 질감은 `parts.instrumentation` 또는 `style`의 요청 태그로 쓸 수 있지만 독립 악기 슬롯처럼 검증되지는 않는다. 많은 악기를 나열하는 일은 실제 편성 준수율을 높이지 않으므로 핵심 악기부터 적고 `song:prepare`의 전달 style을 확인한다.

<a id="lyrics"></a>

## 가사와 보컬

한국어 가사는 `lyrics`, 보컬 음색은 `style`에 쓴다. 가사에 제목·BPM·키·믹싱 지시를 섞지 않는다. CLI가 제목·설명 줄을 정리하더라도, 처음부터 가사와 제작 지시를 분리하는 편이 명확하다.

| 요청 | 스타일 태그 예시 | 가사 방향 |
| --- | --- | --- |
| 여성 락발라드 | `female rock vocal, restrained verse, soaring chorus` | 짧은 벌스, 길게 뻗는 후렴 모음 |
| 남성 애절한 발라드 | `warm male vocal, intimate delivery, emotional build` | 구체적인 이별 장면과 반복 후렴 |
| 여성 트로트 | `mature female trot vocal, kkeokgi, wide vibrato` | 말맛·반복·회상, 자연스러운 한국어 |
| 혼성 듀엣 | `male and female duet, call and response` | 주고받는 구절. 파트 분배는 보장되지 않는다 |
| 허스키한 저음 | `husky female vocal, low register, close vocal` | 과도하게 긴 고음 지시 대신 편한 음역 요청 |

기본 섹션은 `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`다. 구간의 역할에 맞게 필요한 것만 선택한다. 연주 구간에는 `[instrumental]`을 쓸 수 있다. 일부 변형 태그는 정리·정규화되므로 [태그별 실제 처리](lyrics-tags.md)를 확인한다.

```text
[Verse]
문을 닫고 돌아선 골목에
아직 너의 웃음이 남아서

[Chorus]
한 번만 더 내 이름을 불러줘
밤이 끝나도 널 찾지 않도록
```

위 가사는 형식 예시다. 장곡에는 분량에 맞는 벌스·후렴·브리지를 직접 작성한다. 고정된 글자 수가 최적이라고 단정하기보다 실제 노래의 발음 밀도와 쉼을 비교한다.

```bash
node cli/road-music.js lyrics:clean --json '{"text":"[Verse]\n골목에 남은 작은 불빛"}'
node cli/road-music.js lyrics:check --json '{"text":"[Verse]\n골목에 남은 작은 불빛","targetSeconds":30}'
node cli/road-music.js prompt:compose --json '{"genre":"Korean ballad, female vocal, intimate mood","instruments":["piano","cello"],"bpm":68,"lyrics":"[Verse]\n골목에 남은 작은 불빛"}'
```

`lyrics:check`는 분량 등의 점검이며 가창 품질·저작권·흥행을 보증하지 않는다. `prompt:compose`는 스타일을 조합하며 곡을 생성하지 않는다. 두 명령은 renderer 기반이므로 영상 렌더 중에는 섞지 않는다.

<a id="examples"></a>

## 복사해서 쓰는 JSON 예시

아래 `json` 블록은 모두 `song:generate`의 완전한 입력 객체다. 각각 파일로 저장해 `--file`로 전달한다. seed·제목·가사는 필요에 맞게 바꾼다. 수치는 청취 비교를 시작하기 위한 예시이며 장르별 최적값을 실험으로 입증한 것은 아니다.

### 1. 여성 보컬 락발라드 스케치

```json
{
  "title": "끝나지 않은 안녕",
  "engine": "ace",
  "style": "Korean emotional rock ballad, female rock vocal, restrained verse, soaring chorus, melodic guitar, spacious mix",
  "lyrics": "[Verse]\n문을 닫고 돌아선 골목에\n아직 너의 웃음이 남아서\n괜찮다는 말은 접어 두고\n발끝만 바라보며 걸었어\n[Chorus]\n한 번만 더 내 이름을 불러줘\n밤이 끝나도 널 찾지 않도록\n내 안에 남은 마지막 인사가\n너에게 닿을 때까지\n[Outro]\n이제는 나를 데리고 갈게",
  "targetSeconds": 60,
  "count": 1,
  "seed": 42,
  "parts": {"instruments": ["piano", "electric guitar", "drums"], "bpm": 72, "strict": false}
}
```

상세 요청으로 바꾸기: “이 사양을 150초 곡으로 확장하고 2절·브리지·마지막 후렴을 새로 써줘. 첫 후렴보다 마지막 후렴의 감정이 커지도록 편곡해줘.”

### 2. 트로트 스케치와 후보 3개

```json
{
  "title": "막차의 약속",
  "engine": "ace",
  "style": "Korean trot, ppongjjak, mature female trot vocal, kkeokgi, wide vibrato, bright brass fills, shuffle rhythm",
  "lyrics": "[Verse]\n시장 끝에 불이 켜지면\n그대 오던 길을 보네요\n식어 버린 찻잔 하나에\n못다 한 말을 띄워요\n[Chorus]\n막차야 조금만 천천히 가라\n내 님의 마음도 태우고 가라\n돌아온다는 그 한마디를\n오늘도 내일도 기다린다",
  "targetSeconds": 60,
  "count": 3,
  "seed": 200,
  "parts": {"instruments": ["accordion", "saxophone", "drums"], "bpm": 126, "strict": false}
}
```

세 후보는 같은 가사와 스타일로 생성된다. 200·201·202 seed의 발음·꺾기·후렴을 비교해 고른다.

### 3. 한국어 K-POP 훅 스케치

```json
{
  "title": "나의 신호",
  "engine": "ace",
  "style": "Korean dance pop, bright female vocal, catchy chorus, clean synth bass, punchy drums, confident mood",
  "lyrics": "[Verse]\n조금 느린 걸음도 좋아\n내가 고른 길이니까\n숨겨 두던 마음을 켜면\n작은 빛이 길이 돼\n[Chorus]\n나의 신호를 켜\n지금 여기서 시작해\n나의 신호를 켜\n내가 나를 믿을 때\n[Bridge]\n멀리 가지 않아도 돼\n오늘의 나를 넘어가",
  "targetSeconds": 60,
  "seed": 240,
  "parts": {"instruments": ["synthesizer", "bass guitar", "drums"], "bpm": 124}
}
```

핵심은 가사에 반복할 후렴을 직접 적는 것이다. 후렴 위치나 길이를 초 단위로 고정하는 입력은 없다.

### 4. 여성 보컬 피아노 발라드

```json
{
  "title": "접어 둔 편지",
  "engine": "ace",
  "style": "Korean emotional ballad, tender female vocal, intimate verses, warm strings, restrained dynamics",
  "lyrics": "[Verse]\n책장 사이 접어 둔 편지\n이제 펴지 않아도 알아\n너의 이름 대신 적어 둔\n내일이라는 작은 두 글자\n[Chorus]\n보고 싶은 마음은 남겨 둘게\n돌아오란 말은 하지 않을게\n너를 담던 나의 두 손으로\n이젠 나를 안아 줄 테니\n[Outro]\n조용히 불을 끄고 쉬어 갈게",
  "targetSeconds": 60,
  "seed": 260,
  "parts": {"instruments": ["piano", "cello", "string ensemble"], "bpm": 66}
}
```

락발라드와 비교하려면 가사를 같은 것으로 맞춘 뒤 기타·드럼 중심 편곡과 현악 중심 편곡을 별도 생성한다. 보컬이 동일 인물처럼 유지된다는 보장은 없다.

### 5. 보컬 없는 카페 재즈

```json
{
  "title": "창가의 오후",
  "engine": "ace",
  "style": "warm cafe jazz, relaxed swing, soft dynamics, intimate room, mellow piano trio",
  "instrumental": true,
  "targetSeconds": 120,
  "seed": 310,
  "parts": {"instruments": ["piano", "upright bass", "brushed drums"], "bpm": 84, "structure": "loop", "strict": false}
}
```

### 6. 피아노만 들리는 짧은 테마

```json
{
  "title": "작은 쉼",
  "engine": "ace",
  "instrumental": true,
  "targetSeconds": 30,
  "seed": 510,
  "parts": {"genre": "minimal felt piano, tender melody, soft dynamics, quiet room", "instruments": ["piano"], "bpm": 64, "structure": "short", "strict": true}
}
```

`strict`는 요청 강도를 높이는 문구다. 피아노 외 소리가 전혀 없다는 검증은 실제 음원을 들어서 한다.

### 7. 짧은 효과음

```json
{
  "title": "작은 종의 알림",
  "engine": "ace",
  "style": "single soft bell chime, short decay, quiet background, no speech, no music",
  "soundEffect": true,
  "targetSeconds": 3,
  "seed": 610
}
```

효과음은 일반 음악과 달리 `style`을 그대로 전달한다. `parts`의 악기·BPM 자동 조합에 의존하지 않는다.

<a id="advanced"></a>

## YuE 전용 고급 옵션

ACE 사용자에게 이 값들을 기본 템플릿으로 넣을 필요는 없다. `advanced`는 YuE 워커에서만 사용한다. Windows NVIDIA는 `yue`, Apple Silicon은 `yue-mlx`를 사용한다. Apple Silicon 설치·메모리·복구 한계는 [YuE2 Apple Silicon](yue-mlx.md)을 따른다. 모든 YuE 설정의 지원 엔진·실효 payload·runtime·재현·전사 검수는 [YuE CLI 고급 제작 워크플로](yue-cli-workflow.md)를 따른다.

| 단계 | 옵션 | 조절 목적과 주의점 |
| --- | --- | --- |
| semantic | `temperature`, `topP`, `topK`, `repetitionPenalty`, `penaltyWindow`, `minTokens`, `maxTokens` | 의미 음악 토큰의 다양성·후보 폭·반복·토큰 예산. `temperature:0`은 greedy 비교용이며 품질 증대값이 아님 |
| ABC 계획 | `abcTemperature`, `abcTopP`, `abcTopK`, `abcRepetitionPenalty`, `abcPenaltyWindow`, `abcMinTokens`, `abcMaxTokens` | 멜로디·화성 계획의 다양성·반복·토큰 예산. `cot:"off"`에는 계획 제어를 적용하지 않음 |
| 음원 합성 | `cfgScale`, `odeSteps` | 조건 유도와 ODE 계산량. `cfgScale:0`은 조건을 약화하는 제한 실험이고, 높은 `odeSteps`는 비용을 늘릴 뿐 품질 보장이 아님 |

`minTokens <= maxTokens`, `abcMinTokens <= abcMaxTokens`여야 한다. 이 토큰 수는 초가 아니며 ABC/semantic prefix와 생성 예산이 24,576 컨텍스트를 넘으면 요청이 실패한다. 생략하면 엔진 기본 동작을 사용한다. 여러 값을 동시에 바꾸기보다 같은 가사·score·seed에서 하나씩 비교하고, 결과의 `truncated.abc`와 `truncated.semantic`을 모두 확인한다.

```json
{
  "title": "YuE 피아노 테마 비교",
  "engine": "yue",
  "style": "minimal piano, warm room, gentle melody",
  "instrumental": true,
  "targetSeconds": 60,
  "seed": 720,
  "cot": "full",
  "parts": {"instruments": ["piano"], "bpm": 72, "structure": "theme", "strict": true},
  "advanced": {"temperature": 0.8, "topP": 0.9, "topK": 50, "repetitionPenalty": 1.1, "penaltyWindow": 50, "minTokens": 1200, "maxTokens": 3000, "abcTemperature": 0.7, "abcTopP": 0.9, "abcTopK": 30, "abcRepetitionPenalty": 1.005, "abcPenaltyWindow": 100, "abcMinTokens": 32, "abcMaxTokens": 1024, "cfgScale": 1.0, "odeSteps": 32}
}
```

<a id="reference-audio"></a>

## 커버·허밍·악보

### 라이브러리 곡을 다른 편곡으로

커버는 ACE 전용이다. `songs:list`의 실제 `dir`을 사용하고, 원곡 길이를 따른다. `strength`는 0.1~1, 생략 시 0.8이다. 강도에 따른 보존 정도는 들어서 비교하며 원곡 멜로디나 음색이 그대로 유지된다고 보장하지 않는다.

```json
{
  "title": "창가의 오후 어쿠스틱 편곡",
  "engine": "ace",
  "style": "acoustic folk instrumental, soft guitar, warm room",
  "instrumental": true,
  "coverAudio": {"dir": "/absolute/path/from/songs-list", "strength": 0.7},
  "parts": {"instruments": ["acoustic guitar", "cello"], "bpm": 84}
}
```

경로는 예시이므로 그대로 실행하면 안 된다. 커버에는 일반 `targetSeconds`를 넣어 길이를 바꾸려 하지 않는다.

### 내 허밍을 곡으로

먼저 녹음을 앱 관리 파일로 가져온다. `recording.path`에 임의 원본 파일을 직접 넣을 수 없다.

```bash
node cli/road-music.js recording:pick --input "/Users/me/Music/humming.m4a"
```

반환된 실제 절대 경로로 아래 `path`를 바꾼다. `recording.targetSeconds`는 0~600 정수이며 일반 `targetSeconds`와 별개다. 0 또는 생략은 원본을 사용한다. 양수여도 원본보다 1초 넘게 긴 경우에만 반복·크로스페이드로 늘리며, 이 옵션으로 녹음을 짧게 자르지는 않는다.

```json
{
  "title": "허밍에서 시작한 테마",
  "engine": "ace",
  "style": "gentle acoustic instrumental, intimate room",
  "instrumental": true,
  "recording": {"path": "/absolute/path/from/recording-pick.wav", "strength": 0.8, "targetSeconds": 90},
  "parts": {"instruments": ["acoustic guitar", "piano"], "bpm": 88}
}
```

직접 마이크로 녹음하려면 `recording:start`, `recording:stop`과 OS 권한이 필요하다. 커버와 녹음은 서로 다른 작업으로 나눠 사용한다.

### 악보 계획·렌더·이어 만들기

- YuE의 `mode:"plan"`은 계획 단계, `abc`는 ABC 입력이다. ACE에 적용할 수 없다.
- `score:check`로 ABC를 검사하고 `song:render`에 기존 곡 `dir`과 `abc`를 전달한다.
- `song:resume`은 기존 작업의 `dir`만 받는다. 새 스타일·가사를 넣어 편곡하는 명령이 아니다.
- `song:clone`은 설정 재사용에 활용한다. 변경된 가사나 편곡은 별도 생성 요청으로 만든다.

상세 필드와 실제 검증 한계는 [CLI 레퍼런스](cli-reference.md), [검수 결과](cli-qa-report.md)를 따른다.

<a id="output"></a>

## 저장·재생·플레이리스트

| 목적 | 명령 | 주의점 |
| --- | --- | --- |
| 완료 곡 정보 | `songs:list`, `song:detail` | 실제 `dir`, `audio`, seed·설정 확인 |
| 앱에서 듣기 | `player:play` | 로컬 앱 재생이며 채팅 첨부와 다르다 |
| MP3·WAV 저장 | `song:export` | 실제 `dir`, `format`, 절대 `--output` 경로 |
| 여러 곡 묶기 | `album:export` | `dirs`에 고른 곡의 실제 절대 경로만 지정 |
| 자막 | `song:srt`, `song:save-srt` | SRT 생성·저장, 오디오 가창 타이밍은 확인 필요 |
| 플레이리스트 영상 | `video:render` | 곡 목록과 출력 경로 지정. 자체 완료 응답 대기 |
| 설정 재사용 | `presets:save`, `presets:list` | 스타일·parts·연주곡 여부 저장. 가사·seed 전체 저장 기능과 다르다 |

```bash
node cli/road-music.js song:export --json '{"dir":"/absolute/path/from/songs-list","format":"mp3"}' --output "/Users/me/Music/exports/ballad.mp3"
```

위 경로는 실제 응답과 사용자 출력 폴더로 바꾼다. 기존 출력은 기본적으로 덮어쓰지 않는다. “여기서 바로 들려줘”라고 요청했다면 에이전트가 사용하는 채팅 도구의 로컬 오디오 첨부 지원 여부를 확인하고, 가능하면 실제 절대 경로 파일을 첨부한다. 지원하지 않으면 파일 링크와 경로를 제공한다. CLI 자체가 원격 업로드를 수행하는 기능은 아니다.

영상의 EQ는 영상 출력 설정이다. 이를 `song:generate`의 음원 마스터링 옵션으로 안내하지 않는다. 영상·자막·앨범 절차는 [작업 프롬프트](../prompts/cli-workflows.md#4-앨범srtmp4-내보내기)를 참고한다.

자주 쓰는 스타일을 저장할 때는 다음처럼 프리셋을 만든다. 같은 이름의 기존 프리셋이 있는지 `presets:list`로 먼저 확인한다.

```bash
node cli/road-music.js presets:list
node cli/road-music.js presets:save --json '{"preset":{"name":"여성 피아노 발라드","style":"Korean ballad, tender female vocal, intimate mood","instrumental":false,"parts":{"instruments":["piano","cello"],"bpm":66},"folder":"발라드"}}'
```

<a id="improve"></a>

## 결과를 개선하는 순서

1. 가사 발음과 후렴 전달력이 맞는지 확인한다. 너무 빽빽하면 한 줄을 줄이고 쉼을 준다.
2. 핵심 장르·보컬·주악기만 남겨 상충하는 태그를 정리한다.
3. 같은 가사·옵션에서 seed를 달리한 후보 2~3개를 비교한다.
4. 보컬·템포·악기·길이 중 한 요소만 바꿔 새 버전을 만든다.
5. 완성본의 실제 길이·클리핑·앞뒤 잘림·불필요한 보컬을 확인하고 채택한다.

```text
방금 곡의 가사·BPM·길이를 유지한 후보 2개를 새 seed로 만들어줘.
하나는 담담한 여성 보컬, 다른 하나는 힘 있는 여성 록 보컬로 요청해줘.
원곡은 보존하고 두 결과의 가사 전달력과 후렴 차이를 비교할 수 있게 가져와줘.
```

전용 보컬 고정·줄 단위 시간 배치·완벽한 루프·흥행 점수 기능은 없다. 청취하지 않았다면 “옵션과 파일 검증 완료”까지만 보고하고 “최고 음질·유행 보장”이라고 평가하지 않는다.
