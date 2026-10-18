# 장르별 음악 생성 프롬프트 레시피

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

Road Music CLI로 곡을 만들도록 AI에게 요청할 때 바로 복사할 수 있는 실전 레시피다. 이 문서의 BPM·악기·길이는 성공을 보장하는 값이 아니라, 첫 시도를 일관되게 만드는 **출발점**이다. 최신 플레이리스트 흐름이나 특정 시기의 인기 스타일을 요청하려면 먼저 [음악 리서치 가이드](music-research.md)를 따른다.

ACE를 사용할 때는 매 요청마다 [ACE 공식 가이드 적용 절차](ace-prompt-guide.md)를 먼저 읽고, 아래 레시피를 가사·caption 길이와 실제 지원 옵션에 맞게 조정한다.

YuE2는 [YuE 제작 가이드](yue-prompt-guide.md), Apple Silicon은 해당 [MLX 운영 안내](yue-mlx.md)를 적용한다. 아래의 음악적 방향은 응용할 수 있지만 `targetSeconds`가 실제 길이를 제어한다는 ACE 전제나 ACE 전용 입력 한계를 YuE에 적용하지 않는다.

가사는 [구간 태그 가이드](lyrics-tags.md)에 맞춰 작성한다. 아래 “만들어줘” 예시는 **검증한 가사·프롬프트를 먼저 검토받는 기본 모드**다. 가사와 프롬프트까지 모두 자동으로 정해 생성하라고 위임하면 [자동 모드](music-review.md#mode)로 진행하고 결과·근거 자료를 제공한다.

사용자가 준 가사·프롬프트·지정 옵션은 아래 레시피보다 우선한다. 예시는 비어 있는 부분을 설계하거나 개선안을 제안할 때 참고하며, 원문을 임의로 개사·번역·축약·교체하지 않는다. [원문 보존과 추천](music-review.md#preserve-input)을 따른다. 찬송가 리메이크는 [원전 목록과 상세 리메이크 가이드](hymn-remake-guide.md)를 참고한다.

<a id="toc"></a>

## 목차

- [빠른 사용법](#quick-start)
- [프롬프트 작성 원칙](#prompt-basics)
- [외부 작사·프롬프트 자료의 모델별 변환](#external-adaptation)
- [장르 카탈로그](#genre-catalog)
- [CCM·워십 중심 제작](#ccm)
- [상세 복사 프롬프트](#detailed-prompts)
- [한 줄 요청 모음](#one-line-requests)
- [요청한 5곡 묶음](#requested-five-song-set)
- [비교·수정 지시](#iterate)
- [가사 전달·고음·모델별 조정](#model-adaptation)
- [가사 작성 팁](#lyrics-tips)
- [다음 문서](#related-docs)

<a id="quick-start"></a>

## 빠른 사용법

아래 프롬프트를 로컬 셸을 쓸 수 있는 AI에게 전달한다. AI는 프로젝트 지침과 [CLI 사용법](cli.md)을 읽고, 현재 엔진 상태와 입력을 검증한 뒤 가사·프롬프트를 검토받는다. 승인 또는 전체 자동 위임 후 `song:generate`를 호출한다. 문서 예시를 읽는 것만으로 생성·렌더·앱 종료를 실행하지 않는다.

```text
AGENTS.md와 docs/cli.md를 따라 아래 곡을 Road Music CLI로 1곡 생성해줘.
검증한 가사·프롬프트·옵션을 먼저 보여줘. 승인 후 생성 완료를 확인하고 음원과 근거 자료를 알려줘.
```

이어지는 상세 프롬프트 하나를 그 아래에 붙이면 된다. JSON 필드와 범위, 엔진별 제약은 [음악 생성 옵션](music-options.md)과 [CLI 레퍼런스](cli-reference.md#songgenerate-필드)가 기준이다.

<a id="prompt-basics"></a>

## 프롬프트 작성 원칙

| 요소 | 권장 작성법 | CLI에서의 위치 |
| --- | --- | --- |
| 언어·보컬 | `Korean, warm female vocal`처럼 짧은 영어 태그로 지정 | `style` 또는 `parts.genre` |
| 장르·질감 | 장르, 시대감이 아닌 음향 특성, 에너지, 믹스를 쉼표 태그로 | `style` 또는 `parts.genre` |
| 템포 | 정수 BPM 하나를 정해 반복 기재하지 않음 | `bpm` 또는 `parts.bpm` |
| 악기 | 아래 카탈로그에 적힌 공개 악기명 중 최대 3개 | `parts.instruments` |
| 가사 | 요청 언어의 실제 가사와 필요한 지원 구간 태그 | `lyrics`, [태그 대응표](lyrics-tags.md#basic) |
| 길이·변주 | 초 단위 길이, 시드, 곡 수를 명시 | `targetSeconds`, `seed`, `count` |
| 연주곡 구조 | `pop`, `short`, `theme`, `loop` 중 하나 | 가사가 없는 `instrumental` 곡의 골격에만 `parts.structure` |

`female vocal`, `male vocal`, 조성, "후렴을 크게" 같은 말은 전용 보장 옵션이 아니다. 짧은 `style` 태그와 가사의 반복·섹션으로 모델에 전달하는 **의도**다. `parts.genre`를 채우면 최상위 `style`보다 우선하므로, 장르 태그는 둘 중 하나에만 넣는 편이 명확하다. 실제 결과가 다르면 같은 시드를 고집하기보다 A/B 생성 후 원하는 결과의 스타일을 좁힌다. 실존 가수 이름·목소리 모사·기존 노래 가사는 요청하지 말고, 분위기와 편곡 특성으로 설명한다.

스타일에는 긴 문장이나 `[Mood: ...]` 같은 대괄호 태그를 넣지 않는다. 스타일이 가사처럼 불릴 수 있다. 보컬곡의 구조는 `parts.structure`가 다시 만들지 않으므로 가사에 직접 쓴다. 기본 섹션명은 `Intro`, `Verse`, `Pre-Chorus`, `Chorus`, `Bridge`, `Interlude`, `Outro`다. [역할과 배치 예시](lyrics-tags.md#examples)를 참고한다.

<a id="external-adaptation"></a>

## 외부 작사·프롬프트 자료의 모델별 변환

2026-10-18에 사용자가 제공한 「가사 디렉터.md」와 「Suno V6 스타일 프롬프트 북」(104쪽)을 검토했다. 작사 자료의 장면·감정 설계는 [작사 설계](music-review.md#songwriting-design)에, PDF 2쪽의 구성 관점과 5~7·21·29·69·101쪽의 편곡 사례는 아래 판단 기준에 독자적으로 요약했다. 사용자 참고 자료이며 ACE·YuE 공식 사양이나 Suno 버전·옵션의 검증 근거가 아니다. 재배포 금지 자료의 원문·예시 프롬프트·카탈로그는 동봉하지 않으며, 이 요약을 쓰는 데 외장 디스크의 원본이 필요하지 않다.

| 설계할 내용 | 적용 방법 |
| --- | --- |
| 템포와 가창 밀도 | BPM과 별개로 느긋한 프레이징·쉼·음절 밀도를 정한다. `unhurried phrasing` 같은 짧은 의도와 실제 가사 분량을 함께 점검한다 |
| 보컬과 악기의 역할 | 주악기는 반주·짧은 응답·간주 중 역할을 고른다. 가사 전달이 우선이면 보컬 구절 사이에 응답을 두는 안을 검토하고, 악기 수만 늘리지 않는다 |
| 전개와 마무리 | 절제에서 절정으로 가는 곡과 끝까지 친밀한 곡을 구분한다. 도입·절정·끝맺음 중 필요한 대비만 고르며 모든 발라드에 전조·벨팅·합창을 넣지 않는다 |
| 발음과 공간감 | 긴 잔향·두터운 더블링·거친 질감이 또렷한 리드 요청과 충돌하는지 살핀다. 명료한 가사가 우선이면 가까운 리드·절제된 반주를 제안하되 결과는 청취로 확인한다 |

보컬 성별·음색·프레이징·편곡·믹스 중 요청에 필요한 요소만 짧은 쉼표 태그로 옮긴다. 핵심 요구를 먼저 두고 같은 뜻의 수식어를 줄인다. 현재 공통 스타일 정리는 **쉼표로 구분한 태그 하나가 공백 기준 10단어를 넘으면 삭제**한다. 초안만 요청받았어도 이 정적 기준을 확인해 긴 태그를 의미가 유지되는 짧은 태그로 나누며, 최종 고음·악기 응답 같은 핵심 지시가 빠지지 않았는지 읽는다. 실제 생성 준비에서는 `prompt:compose`의 notes와 전달본까지 대조한다. ACE는 최종 caption 512자를 확인하고, YuE는 자체 입력 계약을 확인한다.

- Suno의 `Variety`·`Exclude Styles`를 Road Music JSON 필드나 YuE의 CFG·temperature로 대응시키지 않는다. 자료의 부정 프롬프트 요령도 모델 공통 법칙으로 옮기지 않는다. 악기 제한은 공개 `parts`의 의미·추가 문구를 확인하며 결과 고정을 약속하지 않는다.
- 태그 생략 지침이나 `[Final Chorus – ...]`·`[Verse] (soft, close-mic)` 같은 연출 표기는 그대로 이식하지 않는다. [실제 정리 규칙](lyrics-tags.md#normalization)에 따라 필요한 구간과 style을 나누고, 삭제된 지시를 전달됐다고 보고하지 않는다.
- 스타일 대안은 요청한 수만 준비한다. 목적이 다른 대안을 제안하더라도 선택 전 추가 곡 생성으로 이어가지 않는다. 시험 비교는 [재시도 가치](music-review.md#retry-value)와 승인 범위 안에서 수행하고, 한 요소 비교와 여러 요소를 바꾼 편곡안을 구분한다.

<a id="genre-catalog"></a>

## 장르 카탈로그

악기명은 CLI 공개 목록의 영어 값을 그대로 썼다. **보컬곡의 마지막 열은 `parts.structure` 값이 아니라 가사에 직접 적을 전개 방향**이다. `pop`·`loop`은 아래에서 보컬 구조로 쓰지 않았으며, 연주곡의 `loop`·`theme`만 `parts.structure`에 넣는다.

| 장르 | 스타일 태그 출발점 | BPM | 악기(최대 3) | 보컬·구성 |
| --- | --- | ---: | --- | --- |
| 밝은 K-pop | `Korean, bright pop, clean dance groove` | 118 | synthesizer, bass guitar, drums | 선명한 리드, Verse→Chorus→Bridge→마지막 Chorus |
| 몽환 K-pop | `Korean, dreamy pop, airy synth pop` | 104 | synthesizer, synth pads, drums | 숨결 섞인 리드, Verse 대비 후 Chorus 반복 |
| R&B | `Korean R&B, warm, late night` | 82 | Rhodes electric piano, bass guitar, brushed drums | 부드러운 리드, 기본 |
| 시티팝 | `Korean city pop, glossy, night drive` | 108 | Rhodes electric piano, bass guitar, saxophone | 맑은 리드, Verse와 Chorus의 밝기 대비 |
| 인디 포크 | `Korean indie folk, intimate, warm` | 92 | acoustic guitar, piano, cello | 가까운 보컬, 기본 |
| 어쿠스틱 발라드 | `Korean emotional ballad, intimate` | 72 | piano, cello, string ensemble | 절제 후렴, 기본 |
| 애절한 발라드 | `Korean dramatic ballad, cinematic` | 68 | piano, string ensemble, drums | 큰 Chorus, 후반 한 번만 상승 |
| 락발라드 | `Korean rock ballad, dramatic, anthemic` | 76 | electric guitar, piano, drums | 강한 Chorus, Bridge 뒤 마지막 Chorus 확장 |
| 트로트 | `Korean trot, lively, sentimental` | 124 | accordion, brass section, drums | 또렷한 꺾기 유도, 제목 훅 반복 |
| 모던 록 | `Korean alternative rock, driving, melodic` | 132 | electric guitar, bass guitar, drums | 전진하는 리드, Verse에서 Chorus로 상승 |
| 펑크 팝 | `Korean pop punk, upbeat, youthful` | 156 | electric guitar, bass guitar, drums | 짧고 큰 Chorus, 간결한 Verse |
| 댄스 EDM | `Korean dance pop, uplifting, electronic` | 126 | synthesizer, bass guitar, drums | 반복 훅, 마지막 Chorus 재등장 |
| 하우스 | `Korean house, warm, club groove` | 122 | synthesizer, bass guitar, percussion | 짧은 보컬 훅, Verse·Chorus 반복 가사 |
| 로파이 BGM | `lofi hip hop, dusty, relaxed` | 76 | Rhodes electric piano, upright bass, brushed drums | 연주곡, `loop` |
| 재즈 보컬 | `Korean vocal jazz, smoky, intimate` | 86 | piano, upright bass, brushed drums | 여유로운 리드, 기본 |
| 보사노바 | `Korean bossa nova, breezy, gentle` | 96 | classical guitar, upright bass, percussion | 가벼운 리드, 기본 |
| 소울 가스펠풍 | `Korean soul pop, warm, uplifting` | 90 | piano, bass guitar, drums | 힘있는 리드, Chorus의 격려 문장 반복 |
| 모던 CCM 워십 | `Korean contemporary worship, warm female lead, congregational unison, gradual build` | 76 | piano, acoustic guitar, drums | 은혜·동행의 고백, Chorus 반복·Bridge |
| 소그룹 복음성가 | `Korean acoustic gospel, mixed unison vocals, simple singalong chorus, warm` | 86 | acoustic guitar, piano, percussion | 담백한 공동체 감사, 짧은 Chorus |
| 새 찬송 형식 | `Korean modern hymn, clear female lead, hymnlike melody, reverent` | 82 | acoustic guitar, piano, violin | 절마다 논리적으로 이어지는 창작 가사 |
| 가스펠 콰이어 워십 | `Korean gospel worship, soulful female lead, mixed choir responses, joyful` | 104 | piano, bass guitar, drums | 실제 가사로 응답 문장 배치 |
| 피아노 기도 CCM | `Korean piano prayer song, soft female lead, spacious pauses, intimate` | 64 | piano | 고난에서 신뢰로, 쉼이 있는 가사 |
| 묵상 CCM 연주 | `contemplative Christian ambient instrumental, soft motifs, spacious` | 60 | piano, synth pads, harp | 연주곡, `theme` |
| 영화적 발라드 | `Korean cinematic ballad, expansive` | 70 | piano, string ensemble, orchestra | 서사적 Chorus, Bridge 뒤 확장 |
| 게임·영상 테마 | `cinematic instrumental, hopeful, evolving` | 96 | orchestra, piano, french horn | 연주곡, `theme` |
| 앰비언트 휴식 | `ambient instrumental, calm, spacious` | 60 | synth pads, piano, flute | 연주곡, `loop` |

<a id="ccm"></a>

## CCM·워십 중심 제작

CCM을 주로 만들 때는 [전용 상세 가이드](ccm-prompts.md)에서 먼저 목적과 스타일을 고른다. **48개 레시피·상세 요청 12개·한국어 창작 가사 8편·완전한 CLI JSON 8개**와 과거·2025~2026 자료, 보컬·회중·박자·악기·공간감 조절법을 제공한다. 표의 수치는 제작 출발값이며 신곡 인기 순위나 품질 보장이 아니다.

```text
docs/ccm-prompts.md의 C17로 한국어 여성 모던 워십 1곡을 준비해줘.
76 BPM, 180초, piano·acoustic guitar·drums, strict=false로 설정해줘.
가사는 은혜와 주님의 동행을 고백하고 마지막 후렴은 회중이 함께 부르는 의도로 설계해줘.
최종 가사·caption·JSON을 검증해 보여주고 승인 후 생성해줘.
```

```text
docs/ccm-prompts.md에서 C05의 과거 복음성가 질감과 C27의 CCM R&B를 비교해줘.
같은 한국어 창작 가사를 먼저 검토받고, 승인 후 각 설정으로 1곡씩 별도 생성해줘.
시대·음반 자료에서 확인한 사실과 새로 제안한 편곡·옵션을 구분해줘.
```

CCM 전체를 한 장르로 간주하지 않고 회중 예배·개인 감상·특송·묵상 연주를 나눈다. 기존 소울 가스펠풍 레시피의 격려 문장만으로 신앙의 대상이 분명한 CCM이 되는 것은 아니므로 가사의 주제·대상도 정한다.

<a id="detailed-prompts"></a>

## 상세 복사 프롬프트

각 블록은 AI에게 전달하는 자연어 요청이다. 실제 실행 AI는 이를 공개 스키마의 `song:generate` JSON으로 옮겨야 하며, 없는 키를 임의로 추가하면 안 된다.

| 바로가기 | 바로가기 | 바로가기 |
| --- | --- | --- |
| [1. 새벽 시티팝](#prompt-citypop) | [2. 밝은 K-pop](#prompt-bright-kpop) | [3. 몽환 K-pop](#prompt-dreamy-kpop) |
| [4. 감성 R&B](#prompt-rnb) | [5. 신나는 트로트](#prompt-trot) | [6. 남성 락발라드](#prompt-male-rock-ballad) |
| [7. 여성 락발라드](#prompt-female-rock-ballad) | [8. 여성 애절 발라드](#prompt-female-ballad) | [9. 한국 인디 포크](#prompt-indie-folk) |
| [10. 댄스 팝](#prompt-dance-pop) | [11. 로파이 BGM](#prompt-lofi) | [12. 영화적 테마](#prompt-cinematic-theme) |

<a id="prompt-citypop"></a>

### 1. 새벽 시티팝

```text
Road Music CLI로 한국어 보컬 시티팝 1곡을 생성해줘.
제목은 "네온의 끝"으로 하고, ACE 엔진이 준비되어 있을 때만 사용해줘.
길이는 150초, 스타일은 "Korean city pop, glossy night drive, warm female vocal, restrained verses, bright chorus"로 해줘.
BPM은 108, 악기는 Rhodes electric piano·bass guitar·saxophone으로 설정해줘.
가사는 비 온 뒤 네온 거리에서 끝난 관계를 다정하게 떠나보내는 내용으로, 한국어만 쓰고 Verse 2개·Chorus 반복·Bridge·Outro를 넣어줘.
첫 벌스는 낮게, 후렴은 기억하기 쉬운 한 문장 훅으로 만들되 실존 곡의 가사나 가수 표현은 쓰지 마.
완료 기준은 보컬이 가사를 부르고, 밤 드라이브 질감과 후렴 대비가 들리는 1곡이야.
```

<a id="prompt-bright-kpop"></a>

### 2. 밝은 K-pop

```text
Road Music CLI로 한국어 밝은 K-pop 1곡을 생성해줘.
제목은 "우리의 신호"이고, 길이는 145초, BPM은 118이야.
스타일은 "Korean bright pop, clean dance groove, youthful female vocal, catchy chorus, polished"로 지정해줘.
악기는 synthesizer·bass guitar·drums만 사용하고, pre-chorus에서는 기대감을 쌓고 chorus는 짧은 한국어 훅을 두 번 반복해줘.
가사는 친구에서 사랑이 되는 순간을 긍정적으로 그리며 Verse, Chorus, Verse, Chorus, Bridge, Chorus, Outro 순서로 새로 작성해줘.
완료 기준은 1곡, 명확한 춤 리듬, 과도한 영어 가사 없이 따라 부를 수 있는 한국어 후렴이야.
```

<a id="prompt-dreamy-kpop"></a>

### 3. 몽환 K-pop

```text
Road Music CLI로 한국어 몽환 K-pop 1곡을 생성해줘.
제목은 "물결 위의 달", 길이 160초, BPM 104로 해줘.
스타일은 "Korean dreamy pop, airy female vocal, soft electronic pulse, luminous, intimate"로 해줘.
악기는 synthesizer·synth pads·drums, 가사는 밤바다에서 스스로를 다시 찾는 내용의 한국어 창작 가사로 구성해줘.
첫 Verse는 속삭이듯 짧게, 두 번째 Verse는 감정을 고조시키고, Chorus는 '나는 다시 빛나'라는 새 훅을 중심으로 반복해줘.
완료 기준은 리드 보컬이 뚜렷하고 신스 패드가 보컬을 덮지 않는 1곡이야.
```

<a id="prompt-rnb"></a>

### 4. 감성 R&B

```text
Road Music CLI로 한국어 감성 R&B 1곡을 생성해줘.
제목은 "새벽 두 시", 길이 150초, BPM 82로 설정해줘.
스타일은 "Korean R&B, warm female vocal, late night, close microphone, restrained groove"로 해줘.
악기는 Rhodes electric piano·bass guitar·brushed drums이며, 가사는 보내지 못한 메시지를 지우는 장면을 담은 한국어 창작 가사로 작성해줘.
Verse는 말하듯 부드럽게, Chorus는 음절 수를 줄여 여백을 남기고 Bridge에서 감정을 한 번만 올려줘.
완료 기준은 과한 드럼 없이 보컬과 로즈 피아노 중심으로 들리는 1곡이야.
```

<a id="prompt-trot"></a>

### 5. 신나는 트로트

```text
Road Music CLI로 한국어 신나는 트로트 1곡을 생성해줘.
제목은 "오늘도 꽃길", 길이 150초, BPM 124로 해줘.
스타일은 "Korean trot, lively, sentimental, clear female vocal, festive"로 지정해줘.
악기는 accordion·brass section·drums를 사용하고, 가사는 힘든 날을 지나 오늘을 축하하는 밝은 한국어 창작 가사로 만들어줘.
Chorus에는 제목을 중심으로 짧고 반복 가능한 훅을 넣고, Verse와 Bridge는 쉽게 발음되는 짧은 문장으로 써줘.
완료 기준은 1곡, 경쾌한 리듬과 또렷한 한국어 후렴이며 특정 가수의 창법을 지시하지 않는 것이야.
```

<a id="prompt-male-rock-ballad"></a>

### 6. 애절한 남성 락발라드

```text
Road Music CLI로 한국어 애절한 남성 보컬 락발라드 1곡을 생성해줘.
제목은 "남겨진 계절", 길이 190초, BPM 76으로 해줘.
스타일은 "Korean rock ballad, emotional male vocal, dramatic build, anthemic chorus, spacious"로 해줘.
악기는 electric guitar·piano·drums이며, 가사는 이별 후에도 상대의 안녕을 바라는 한국어 창작 가사로 구성해줘.
첫 Verse는 피아노 중심의 절제된 문장, 두 번째 Verse는 긴장을 높이고, Chorus는 제목을 한 번씩 또렷하게 부르는 큰 멜로디로 작성해줘.
Bridge에는 새로운 장면을 넣고 마지막 Chorus에서만 에너지를 최대로 올려줘.
완료 기준은 1곡, 감정선이 점진적으로 커지고 기타가 보컬을 가리지 않는 결과야.
```

<a id="prompt-female-rock-ballad"></a>

### 7. 여성 보컬 락발라드

```text
Road Music CLI로 한국어 여성 보컬 락발라드 1곡을 생성해줘.
제목은 "다시 피는 밤", 길이 190초, BPM 78로 해줘.
스타일은 "Korean rock ballad, powerful female vocal, emotional, soaring chorus, live band feel"로 지정해줘.
악기는 electric guitar·piano·drums이고, 가사는 상처를 딛고 일어서는 화자의 한국어 창작 가사로 작성해줘.
첫 Verse는 낮고 단단한 어조, 두 번째 Verse는 결심을 보여 주고, Chorus는 '나는 다시 피어'라는 새 훅으로 넓게 열어줘.
Bridge 이후 마지막 Chorus는 길게 이어지되 보컬 성별·파워는 스타일 지시라는 점을 유지해줘.
완료 기준은 1곡, 여성 리드의 존재감과 락 밴드의 상승감이 함께 들리는 결과야.
```

<a id="prompt-female-ballad"></a>

### 8. 여성 보컬 애절한 발라드

```text
Road Music CLI로 한국어 여성 보컬 애절한 발라드 1곡을 생성해줘.
제목은 "빈 의자", 길이 175초, BPM 68로 해줘.
스타일은 "Korean dramatic ballad, tender female vocal, intimate verses, cinematic chorus"로 해줘.
악기는 piano·string ensemble·drums이며, 가사는 떠난 사람의 빈자리를 일상 속 사물로 기억하는 한국어 창작 가사로 작성해줘.
Verse는 구체적인 사물 한 개씩만 묘사하고, Chorus는 감정을 직접적으로 한 번 터뜨리며, Bridge에는 놓아주겠다는 전환을 넣어줘.
완료 기준은 1곡, 초반 절제와 후반 현악·드럼의 대비, 가사 전달이 살아 있는 결과야.
```

<a id="prompt-indie-folk"></a>

### 9. 한국 인디 포크

```text
Road Music CLI로 한국어 인디 포크 1곡을 생성해줘.
제목은 "느린 오후", 길이 140초, BPM 92로 해줘.
스타일은 "Korean indie folk, intimate vocal, warm, organic, unhurried"로 지정해줘.
악기는 acoustic guitar·piano·cello이고, 가사는 동네 산책 중 발견한 작은 위로를 담은 한국어 창작 가사로 써줘.
Verse는 관찰 위주, Chorus는 짧고 담백한 한 문장, Bridge는 악기 여백이 느껴지는 짧은 문장으로 구성해줘.
완료 기준은 과한 전자음 없이 가까이 녹음된 보컬과 어쿠스틱 기타가 중심인 1곡이야.
```

<a id="prompt-dance-pop"></a>

### 10. 댄스 팝

```text
Road Music CLI로 한국어 댄스 팝 1곡을 생성해줘.
제목은 "빛을 따라", 길이 140초, BPM 126으로 해줘.
스타일은 "Korean dance pop, uplifting, confident female vocal, energetic electronic groove"로 해줘.
악기는 synthesizer·bass guitar·drums를 사용하고, 가사는 망설임을 벗고 무대 위로 나아가는 한국어 창작 가사로 작성해줘.
Chorus의 훅은 6~10음절의 새 문장을 반복하고, Verse마다 다른 장면을 보이며, Bridge 뒤에는 마지막 Chorus를 분명히 넣어줘.
완료 기준은 1곡, BPM에 맞는 일관된 댄스 리듬과 가사가 섞이지 않은 깨끗한 보컬이야.
```

<a id="prompt-lofi"></a>

### 11. 로파이 집중 BGM

```text
Road Music CLI로 보컬 없는 로파이 집중 BGM 1곡을 생성해줘.
제목은 "창가의 노트", 길이 180초, BPM 76, 구조 loop으로 해줘.
스타일은 "lofi hip hop, dusty, relaxed, late afternoon, instrumental only"로 지정해줘.
instrumental을 true로 설정하고 악기는 Rhodes electric piano·upright bass·brushed drums만 사용해줘.
가사는 넣지 말고, 반복해도 거슬리지 않는 두 개의 짧은 주제와 부드러운 전환을 목표로 해줘.
완료 기준은 말소리·허밍·보컬 샘플 없이 안정적인 리듬이 유지되는 1곡이야.
```

<a id="prompt-cinematic-theme"></a>

### 12. 영화적 희망 테마

```text
Road Music CLI로 보컬 없는 영화적 희망 테마 1곡을 생성해줘.
제목은 "첫 빛", 길이 180초, BPM 96, 구조 theme으로 해줘.
스타일은 "cinematic instrumental, hopeful, gradual build, wide, orchestral"로 해줘.
instrumental을 true로 설정하고 악기는 orchestra·piano·french horn만 사용해줘.
가사는 넣지 말고 Intro에서 피아노 주제를 제시하고, 중간에 호른으로 확장한 뒤 Outro에서 잔잔히 정리되는 흐름을 목표로 해줘.
완료 기준은 보컬이나 내레이션 없이 장면 전환에 쓸 수 있는 1곡이야.
```

<a id="one-line-requests"></a>

## 한 줄 요청 모음

아래 요청은 위의 공통 시작 문구 뒤에 한 줄만 붙이는 용도다. 필요하면 제목만 바꿔 여러 곡을 만든다. 보컬곡의 `Verse·Chorus·Bridge 전개`는 가사 섹션 지시이며 `parts.structure` 값이 아니다.

1. 한국어 밝은 K-pop 여성 보컬, 118 BPM, 신스·베이스·드럼, 145초, 새 출발을 주제로 Verse·Chorus·Bridge 전개의 1곡 만들어줘.
2. 한국어 몽환 K-pop 여성 보컬, 104 BPM, 신스·신스 패드·드럼, 별빛 아래의 다짐을 가사로 1곡 만들어줘.
3. 한국어 감성 R&B 여성 보컬, 82 BPM, 로즈 피아노·베이스·브러시 드럼, 새벽 메시지를 주제로 1곡 만들어줘.
4. 한국어 시티팝 보컬, 108 BPM, 로즈 피아노·베이스·색소폰, 비 내린 야간 드라이브를 주제로 1곡 만들어줘.
5. 한국어 인디 포크 보컬, 92 BPM, 어쿠스틱 기타·피아노·첼로, 산책의 위로를 주제로 1곡 만들어줘.
6. 한국어 어쿠스틱 발라드 여성 보컬, 72 BPM, 피아노·첼로·현악 합주, 조용한 작별을 주제로 1곡 만들어줘.
7. 한국어 애절한 발라드 여성 보컬, 68 BPM, 피아노·현악 합주·드럼, 빈 의자를 주제로 1곡 만들어줘.
8. 한국어 애절한 남성 락발라드, 76 BPM, 일렉 기타·피아노·드럼, 남겨진 계절을 주제로 1곡 만들어줘.
9. 한국어 여성 락발라드, 78 BPM, 일렉 기타·피아노·드럼, 다시 일어서는 마음을 주제로 1곡 만들어줘.
10. 한국어 신나는 트로트 여성 보컬, 124 BPM, 아코디언·브라스·드럼, 오늘의 축하를 주제로 1곡 만들어줘.
11. 한국어 잔잔한 트로트 보컬, 98 BPM, 아코디언·피아노·브러시 드럼, 오래된 사랑을 주제로 1곡 만들어줘.
12. 한국어 모던 록 보컬, 132 BPM, 일렉 기타·베이스·드럼, 답답함을 뚫고 달리는 내용을 1곡 만들어줘.
13. 한국어 팝 펑크 보컬, 156 BPM, 일렉 기타·베이스·드럼, 졸업 후의 자유를 주제로 짧은 1곡 만들어줘.
14. 한국어 댄스 팝 여성 보컬, 126 BPM, 신스·베이스·드럼, 무대의 자신감을 주제로 1곡 만들어줘.
15. 한국어 하우스 보컬 훅, 122 BPM, 신스·베이스·퍼커션, 새벽 클럽의 해방감을 주제로 Verse·Chorus 반복 전개의 1곡 만들어줘.
16. 보컬 없는 로파이 힙합, 76 BPM, 로즈 피아노·콘트라베이스·브러시 드럼, 180초 집중 BGM 1곡 만들어줘.
17. 보컬 없는 앰비언트, 60 BPM, 신스 패드·피아노·플루트, 비 오는 창가 휴식용 loop 1곡 만들어줘.
18. 한국어 보컬 재즈, 86 BPM, 피아노·콘트라베이스·브러시 드럼, 늦은 카페의 대화를 주제로 1곡 만들어줘.
19. 한국어 보사노바 보컬, 96 BPM, 클래식 기타·콘트라베이스·퍼커션, 햇살 좋은 오후를 주제로 1곡 만들어줘.
20. 한국어 소울 팝 보컬, 90 BPM, 피아노·베이스·드럼, 서로를 격려하는 가사로 1곡 만들어줘.
21. 보컬 없는 영화적 테마, 96 BPM, 오케스트라·피아노·호른, 새벽의 출발을 theme 구조로 1곡 만들어줘.
22. 보컬 없는 게임 마을 테마, 88 BPM, 피아노·하프·플루트, 평화롭고 반복 가능한 loop 1곡 만들어줘.
23. 한국어 크리스마스 팝 여성 보컬, 110 BPM, 피아노·썰매 방울·베이스, 겨울 약속을 주제로 1곡 만들어줘.
24. 한국어 여름 팝 보컬, 116 BPM, 우쿨렐레·베이스·퍼커션, 바닷가의 해방감을 주제로 1곡 만들어줘.
25. 한국어 미니멀 피아노 발라드 여성 보컬, 70 BPM, 피아노·첼로, 미안하다는 말을 주제로 1곡 만들어줘.
26. 한국어 남성 보컬 블루스 록, 96 BPM, 일렉 기타·베이스·드럼, 늦은 밤의 후회를 주제로 1곡 만들어줘.
27. 보컬 없는 카페 재즈, 90 BPM, 피아노·콘트라베이스·브러시 드럼, 150초 BGM 1곡 만들어줘.
28. 한국어 오르골 자장가 보컬, 68 BPM, 오르골·피아노·첼로, 잠들기 전의 안부를 주제로 1곡 만들어줘.

<a id="requested-five-song-set"></a>

## 요청한 5곡 묶음

아래는 한 번에 "각각 1곡"을 요청할 때의 복사 프롬프트다. 대기열 부하를 줄이려면 CLI 호출 자체는 한 곡씩 시작하고 각 `jobId`를 확인한다.

```text
AGENTS.md와 docs/cli.md를 따라 Road Music CLI로 아래 한국어 창작곡 5곡을 각각 1곡씩 생성해줘.
각 곡은 이전 곡의 완료 또는 실패 확인 뒤 다음 곡을 시작하고, 모든 결과의 jobId·실제 dir·제목을 표로 정리해줘.

1) 밝은 K-pop: "우리의 신호", 145초, 118 BPM, Korean bright pop·clean dance groove·youthful female vocal, synthesizer·bass guitar·drums. Verse·Chorus·Bridge·마지막 Chorus 가사 전개, 친구에서 사랑이 되는 가사.
2) 신나는 트로트: "오늘도 꽃길", 150초, 124 BPM, Korean trot·lively·sentimental·clear female vocal, accordion·brass section·drums. Verse·Chorus·Bridge·마지막 Chorus 가사 전개, 오늘을 축하하는 가사.
3) 애절한 락발라드: "남겨진 계절", 190초, 76 BPM, Korean rock ballad·emotional male vocal·dramatic build, electric guitar·piano·drums. Verse·Chorus·Bridge·마지막 Chorus 가사 전개, 이별 뒤 안녕을 바라는 가사.
4) 여성 보컬 락발라드: "다시 피는 밤", 190초, 78 BPM, Korean rock ballad·powerful female vocal·soaring chorus, electric guitar·piano·drums. Verse·Chorus·Bridge·마지막 Chorus 가사 전개, 상처를 딛고 일어서는 가사.
5) 여성 보컬 애절한 발라드: "빈 의자", 175초, 68 BPM, Korean dramatic ballad·tender female vocal·cinematic chorus, piano·string ensemble·drums. Verse·Chorus·Bridge·마지막 Chorus 가사 전개, 빈자리를 기억하다 놓아주는 가사.

모든 가사는 새로 쓰고, 실존 가수·기존 가사·모창 지시는 넣지 마. 보컬 성별은 style의 의도이며 결과 보장이 아님을 결과에 한 줄로 밝혀줘.
```

<a id="iterate"></a>

## 비교·수정 지시

생성 품질은 첫 시도보다 비교와 좁은 수정에서 좋아진다. 단일 요소 비교는 같은 시드와 나머지 입력을 고정하고, 아래처럼 의도적으로 여러 요소를 바꾸는 수정은 별도 실험으로 기록한다. 시드 비교만은 시드 자체를 바꾸고 다른 입력을 고정한다.

### 단일 요소 비교

| 목표 | 복사해 쓸 지시 |
| --- | --- |
| 시드 비교 | `같은 가사·스타일·악기·BPM으로 seed만 달리해 2곡(A/B)을 만들어줘. 실제 청취가 가능하면 더 기억에 남는 후렴의 dir를 알려주고, 청취할 수 없으면 두 결과의 dir를 모두 알려줘.` |
| 보컬을 앞으로 | `같은 시드와 모든 입력을 유지하고 장르 태그 입력(style 또는 parts.genre)에 "clear lead vocal"만 추가해 1곡을 새로 만들어줘.` |
| 악기 제한 | `같은 시드와 모든 입력을 유지하고 parts.strict만 true로 바꿔 1곡을 새로 만들어줘.` |
| 길이 비교 | `같은 시드와 가사·스타일·악기를 유지하고 targetSeconds만 120초와 180초로 각각 1곡씩 만들어 차이를 비교해줘.` |

### 의도적 다중 변경

| 목표 | 복사해 쓸 지시 |
| --- | --- |
| 더 잔잔하게 | `의도적 다중 변경으로 BPM을 8 낮추고 drums를 brushed drums로 바꿔 1곡을 새로 만들어줘. 가사·스타일·다른 악기·시드는 유지하고 변경한 두 항목을 결과에 적어줘.` |
| 후렴을 크게 | `의도적 다중 변경으로 두 번째 Verse를 짧게 줄이고 Chorus의 제목 훅을 한 번 더 반복한 새 가사로 1곡을 만들어줘. BPM·스타일·악기·시드는 유지하고 변경한 가사 항목을 결과에 적어줘.` |
| 연주곡화 | `가사를 제거하고 instrumental을 true로 바꾼 뒤, 같은 BPM과 악기로 loop 구조의 180초 연주곡 1곡을 만들어줘.` |
| 재시도 안전 | `생성 요청이 uncertain 오류면 재제출하지 말고 service:status, queue:list, songs:list으로 먼저 생성 여부를 확인해줘.` |

`count: 2`는 제목 뒤에 A/B를 붙이고 시드를 증가시킨다. 세밀한 생성 옵션은 [음악 생성 옵션](music-options.md), 대기·오류 처리 규칙은 [CLI 사용법](cli.md#연결-끊김과-재시작)을 따른다.

<a id="model-adaptation"></a>

## 가사 전달·고음·모델별 조정

기존 가사를 유지한 채 모델별 프롬프트나 FLOW를 바꿔 비교하려면 [모델별 제작·비교 가이드](model-production-guide.md)를 읽거나 `prompt:knowledge`의 `models`를 조회한다. 기본 ACE·0.6B 제작과 별도 1.7B·네이티브 XL·YuE2 MLX 실험의 지원 범위를 구분한다.

가사 중심 편곡은 명료한 여성 솔로 보컬·보컬 전면 배치·절제된 반주를 짧게 제안하고, 고음 요청은 마지막 후렴에 집중시키는 안을 검토할 수 있다. 제공 가사를 음절 단위로 다시 쓰거나 후렴을 임의 추가하지 않는다. 긴 발음 지시나 부정 태그, 더 큰 LM이 더 정확한 가창을 보장하지 않는다. 모델별 시험 caption과 실제 결과·한계는 위 가이드에 모았다.

2026-10-16의 16곡 비교에서는 전곡 ASR과 30초 구간 ASR의 개선 방향이 다수 엇갈렸다. 관측된 전사 오류를 실제 발음 오류로 단정하지 않고, 목표 길이와 실제 길이·생성 시간·재시도 비용을 함께 비교한다. 실험값을 일괄 프리셋으로 적용하거나 청취하지 않은 음질을 평가하지 않는다.

<a id="lyrics-tips"></a>

## 가사 작성 팁

- 한 곡에는 장면 하나와 감정 변화 하나를 정한다. 예: "비 내린 정류장 → 작별을 받아들임".
- 벌스는 구체적 사물·행동을 보여 주고, 코러스는 한 문장 훅으로 감정을 말한다.
- 150초 안팎 팝은 벌스마다 4~6줄, 코러스는 2~4줄에서 시작한다. 엔진 결과에 맞춰 줄 수를 줄이거나 늘린다.
- 각 줄의 길이를 지나치게 들쭉날쭉하게 만들지 말고, 어려운 외래어·긴 문장은 코러스에서 피한다.
- 괄호 속 무대 지시, 템포 메모, "반복 2회"는 가사로 불릴 수 있다. 편곡 지시는 스타일에 짧은 태그로 쓰고, 가사에는 발화할 문장만 둔다.
- `lyrics:check`으로 길이와 형식을 확인하고, `lyrics:clean`으로 섹션·줄을 정리할 수 있다. 실행 입력의 최종 기준은 `node cli/road-music.js schema`다.

### 최소 가사 뼈대

```text
[Verse]
창문에 번진 빛을 따라
오늘의 마음을 접어 두고

[Chorus]
나는 다시 빛나
어둠을 지나 너머로

[Bridge]
이제는 나를 안아 줄게
```

이 뼈대의 문장은 예시이므로, 제목·장면·훅을 바꿔 새 가사로 사용한다.

<a id="related-docs"></a>

## 다음 문서

- 최신 흐름을 출처와 날짜를 붙여 조사하는 방법: [음악 리서치 가이드](music-research.md)
- `style`, `parts`, `advanced`, `seed` 등 세부 값: [음악 생성 옵션](music-options.md)
- 모든 공개 필드와 허용 범위: [CLI 레퍼런스](cli-reference.md)
