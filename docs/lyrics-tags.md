# 가사 구간 태그와 사용법

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

`[Verse]`, `[Chorus]`는 **가사 안에서 곡의 전개를 알려주는 태그**다. `bpm`처럼 CLI JSON에 넣는 독립 옵션이 아니다. 예를 들어 `"verse":true`를 추가하지 않고 `lyrics` 문자열에 `[Verse]`와 실제 부를 가사를 적는다.

이 문서는 [공식 ACE Tutorial](vendor/ace-step-1.5/en/Tutorial.md#about-lyrics-the-temporal-script)에 실린 구조·보컬·에너지 태그와 로드뮤직의 실제 처리 차이를 정리한다. 공식 태그가 모두 로드뮤직을 통해 그대로 전달되지는 않는다. 생성 전에는 [ACE 가이드](ace-prompt-guide.md)와 [요청자 검토 규칙](music-review.md)을 함께 따른다.

## 목차

- [기본 태그와 사용 시점](#basic)
- [공식 태그의 변환·삭제](#official)
- [표기 변형과 자주 하는 실수](#normalization)
- [장르별 배치 예시](#examples)
- [CLI에서 확인하는 방법](#validation)
- [AI 작사에 적용하기](#songwriting)

<a id="basic"></a>

## 기본 태그와 사용 시점

태그만 적는다고 멜로디·초 단위 구간 길이가 확정되는 것은 아니다. 그 아래 가사의 분량·반복, caption의 편곡 지시, 전체 목표 길이가 함께 작용한다. 필요한 구간만 고른다.

| 태그 | 로드뮤직 결과 | 의미와 사용할 때 |
| --- | --- | --- |
| `[Intro]` | `[Intro]` | 도입. 분위기·주악기를 먼저 들려주고 싶을 때. 바로 보컬로 시작하는 짧은 곡은 생략 가능 |
| `[Verse]` | `[Verse]` | 벌스·절. 구체적인 장면·사건·감정을 전개할 때. 1절과 2절은 같은 태그로 반복 |
| `[Pre-Chorus]` | `[Pre-Chorus]` | 후렴 직전 연결. 짧은 문장과 상승감으로 긴장을 쌓고 싶을 때. 모든 장르에 필수는 아님 |
| `[Chorus]` | `[Chorus]` | 코러스·후렴. 제목·핵심 감정·기억할 훅을 반복할 때. “후렴 2회” 대신 실제 가사를 반복해서 적음 |
| `[Bridge]` | `[Bridge]` | 후반 전환. 반복된 절·후렴과 다른 관점·화성감·감정으로 마지막 후렴을 준비할 때 |
| `[Interlude]` | `[Interlude]` | 간주. 보컬을 쉬고 악기 중심 구간을 의도할 때. 보통 아래에 `[instrumental]`을 둠 |
| `[Outro]` | `[Outro]` | 끝맺음. 마지막 가사를 짧게 정리하거나 연주로 마무리할 때. 자체적으로 정확한 페이드·종료 시각을 보장하지 않음 |
| `[instrumental]` | `[instrumental]` | 부를 말이 없는 연주 구간의 표시. 전체 연주곡은 별도로 `instrumental:true`를 설정 |

브리지는 후렴 바로 앞에만 써야 하는 태그가 아니며, 간주도 곡마다 필요하지 않다. 짧은 스케치에 도입·간주·브리지를 모두 넣으면 원하는 가사를 담을 시간이 부족해질 수 있다. “좋은 가사”와 “태그를 많이 쓴 가사”를 같은 뜻으로 취급하지 않는다.

<a id="official"></a>

## 공식 태그의 변환·삭제

아래 결과는 현재 `renderer/prompt.js`의 `cleanLyrics()`로 확인했다. **삭제**는 태그 줄이 사라진다는 뜻이며, 뒤에 적은 실제 가사까지 자동으로 연주 구간이 되는 것은 아니다.

### 구조·연주·특수 태그

| 태그 | 로드뮤직 결과 | 원래 의도와 대체 방법 |
| --- | --- | --- |
| `[Verse 1]` | `[Verse]` | 절 번호는 제거. 두 번째 절도 별도의 `[Verse]`와 새 가사로 작성 |
| `[Build]` | 삭제 | 점진적 상승 의도는 `building energy` 같은 style 태그로. 후렴 연결 가사는 `[Pre-Chorus]` 사용 |
| `[Drop]` | `[Chorus]` | 전자음악 드롭 전용 이름으로 남지 않음. `high energy drop` 같은 style 요청과 후렴 배치를 함께 사용 |
| `[Breakdown]` | `[Interlude]` | 편성이 줄어드는 구간이라는 세부 의미는 보존되지 않음. `sparse interlude` 등으로 style에 보완 |
| `[Instrumental]` | `[instrumental]` | 대소문자만 정리. 구간 표시와 전체 `instrumental:true`를 구분 |
| `[Guitar Solo]` | `[Interlude]` | 기타 솔로라는 정보는 사라짐. style에 `melodic guitar solo`, 가사에는 `[Interlude]` 배치 |
| `[Piano Interlude]` | `[Interlude]` | 피아노라는 정보는 style의 주악기·편곡 태그로 보완 |
| `[Fade Out]` | `[Outro]` | 페이드 지시가 그대로 보존되지는 않음. style에 `gentle fade out`을 요청하고 실제 끝부분 확인 |
| `[Silence]` | 삭제 | 정확한 침묵 구간을 보장할 태그가 없음. 초 단위 무음 배치를 약속하지 않음 |
| `[Chorus - anthemic]` | `[Chorus]` | `anthemic` 수식어는 style로 이동 |
| `[Bridge - whispered]` | `[Bridge]` | 속삭임 지시가 사라짐. 전반 보컬 질감은 style로 요청하되 구간별 정확한 창법 고정은 보장하지 않음 |

### 보컬 제어 태그

공식 ACE가 소개하는 보컬 태그들이다. 로드뮤직의 현재 가사 정리에서는 별도 구간으로 보존되지 않으므로 **짧은 style 태그로 의도를 옮긴다**.

| 태그 | 로드뮤직 결과 | 의도와 style 예시 |
| --- | --- | --- |
| `[raspy vocal]` | 삭제 | 거친·허스키한 음색 → `raspy vocal` |
| `[whispered]` | 삭제 | 속삭이는 전달 → `intimate soft vocal` |
| `[falsetto]` | 삭제 | 가성 → `light falsetto` |
| `[powerful belting]` | 삭제 | 힘 있는 고음 전달 → `powerful belting` |
| `[spoken word]` | 삭제 | 말하듯 낭독 → `spoken word vocal` |
| `[harmonies]` | 삭제 | 화음 보컬 → `layered vocal harmonies` |
| `[call and response]` | 삭제 | 주고받는 구절 → `call and response vocals` |
| `[ad-lib]` | 삭제 | 즉흥 보컬 장식 → `vocal ad libs` |

style로 옮기면 곡 전체의 성향을 요청하는 것이다. 특정 줄만 가성으로 부르거나 특정 구간에 화음을 강제로 넣는 전용 옵션이 생기는 것은 아니다.

### 에너지·감정 태그

| 태그 | 로드뮤직 결과 | 의도와 style 예시 |
| --- | --- | --- |
| `[high energy]` | 삭제 | 강한 에너지 → `high energy chorus` |
| `[low energy]` | 삭제 | 절제된 에너지 → `restrained verse` |
| `[building energy]` | 삭제 | 점진적 고조 → `gradual build` |
| `[explosive]` | 삭제 | 폭발적인 전개 → `explosive chorus` |
| `[melancholic]` | 삭제 | 우울·그리움 → `melancholic mood` |
| `[euphoric]` | 삭제 | 고양된 기쁨 → `euphoric mood` |
| `[dreamy]` | 삭제 | 몽환적인 질감 → `dreamy texture` |
| `[aggressive]` | 삭제 | 공격적 전달 → `aggressive rhythm` |

공식 문서에 없는 임의 태그를 계속 추가하는 방식으로 제어 범위를 넓히지 않는다. 보컬·감정 태그를 style로 옮길 때에도 같은 뜻을 중복해서 늘리지 말고 **최종 caption 512자** 안에 우선순위가 높은 요구를 담는다.

<a id="normalization"></a>

## 표기 변형과 자주 하는 실수

| 입력 형식 | 실제 처리·권장 방법 |
| --- | --- |
| `[Hook]`, `[Refrain]`, `[후렴]` | `[Chorus]`로 정리 |
| `[Build-up]`, `[프리 코러스]` | `[Pre-Chorus]`로 정리. `[Build]`와 다름 |
| `[Solo]`, `[Break]`, `[간주]` | `[Interlude]`로 정리 |
| `[Coda]`, `[Ending]`, `[후주]` | `[Outro]`로 정리 |
| `Verse 2:`·`후렴:`처럼 단독으로 적은 이름 | 인식하는 이름이면 섹션 태그로 변환. 표준 대괄호 표기가 명확함 |
| `사랑해 [whisper]` | 가사는 남고 줄 안의 대괄호 지시는 삭제 |
| `(guitar solo)`·`*fade out*`만 있는 줄 | 무대 지시로 판단하면 줄 전체 삭제 |
| `(사랑해)` 같은 실제 메아리 가사 | 일부 실제 가사는 남을 수 있지만 괄호만으로 백보컬을 보장하지 않음 |
| `Style: ...`, `BPM: ...`, `# 제목` | 설명·제목 줄은 가사에서 제외. 별도 옵션에 작성 |
| `[not a chorus]` 같은 문장 | 내부 단어의 정규식 매칭으로 `[Chorus]`가 될 수 있음. 태그 안에 설명문을 길게 쓰지 않음 |
| 빈 `[Intro]`·`[Interlude]`·`[Outro]` | 정리 과정에서 `[instrumental]`이 보완될 수 있음. 검토안에는 실제 정리 결과를 제시 |

연주 구간이라고 표시하고 바로 아래 부를 가사를 적으면 의도가 충돌한다. 가사를 부를 구간에는 `[Verse]`·`[Chorus]` 등을 쓰고, 순수 연주 구간은 실제 가사를 두지 않는다.

<a id="examples"></a>

## 장르별 배치 예시

아래는 태그 선택을 설명하는 짧은 창작 가사 스케치다. 이 분량을 그대로 3분 완성곡에 맞춘 최적 가사라고 보지 않는다. 길이에 맞게 절·후렴·쉼을 설계한 뒤 기술 검증과 요청자 검토를 거친다.

### K-POP: 후렴 직전 긴장 쌓기

Verse에서 장면을 보여주고, Pre-Chorus를 짧게 올린 뒤 Chorus에서 핵심 문장을 반복한다. 짧은 데모에서는 Bridge를 생략할 수 있다.

```lyrics
[Verse]
유리창에 비친 오늘
조금 낯선 내가 웃어

[Pre-Chorus]
망설이던 말을 켜
지금 여기 내 목소리

[Chorus]
나의 신호를 켜
오늘의 나를 믿어
나의 신호를 켜
한 걸음 더 나아가
```

### 락발라드: 절제·간주·마지막 후렴

기타 중심 간주를 원하면 style에도 주악기를 적는다. `[Guitar Solo]`가 그대로 전달된다고 기대하지 않는다.

```lyrics
[Verse]
닫아 두었던 창문 너머
아침이 나를 부르네

[Chorus]
나는 이 문을 열고 갈게
떨리는 마음을 데리고

[Interlude]
[instrumental]

[Bridge]
지나온 날은 남겨 두고
그 안에 나를 두진 않아

[Chorus]
나는 이 문을 열고 갈게
새로운 나를 만나러
```

### 트로트: 짧고 반복하기 쉬운 후렴

Pre-Chorus나 Bridge를 억지로 넣지 않고 장면을 풀어내는 절과 제목 훅을 대비할 수 있다.

```lyrics
[Verse]
시장 끝에 불이 켜지면
그대 오던 길을 보네요

[Chorus]
오늘도 꽃길이오
우리 함께 걷는 길이오
오늘도 꽃길이오
그대 있어 꽃길이오
```

### 짧은 피아노 보컬 스케치

짧은 곡은 Verse와 Chorus만으로도 시작할 수 있다. 모든 구간 태그를 사용하는 것이 목표가 아니다.

```lyrics
[Verse]
빈 찻잔을 내려놓고
오늘의 안부를 적어

[Chorus]
잠깐 쉬어 가도 좋아
너의 걸음으로 와
```

전체 연주곡은 가사를 새로 쓰지 않고 `instrumental:true`와 `parts.structure`를 사용한다. `pop`·`short`·`theme`·`loop`는 연주곡 골격 선택값이며 **가사 태그가 아니다**. 보컬곡에서는 해당 구조에 맞는 실제 가사를 직접 배치한다. [옵션별 구조 순서](music-options.md#parts)

<a id="validation"></a>

## CLI에서 확인하는 방법

가사 정리는 생성 요청 없이 확인할 수 있다. 아래 명령은 로컬 서비스를 시작할 수 있다.

```bash
node cli/road-music.js lyrics:clean --json '{"text":"[Verse 1]\n오늘의 안부를 적어\n[Pre-Chorus]\n망설이던 말을 켜\n[Chorus - anthemic]\n나의 신호를 켜"}'
node cli/road-music.js lyrics:check --json '{"text":"[Verse]\n오늘의 안부를 적어\n[Chorus]\n나의 신호를 켜","targetSeconds":30}'
```

`lyrics:clean` 전후를 비교하면 절 번호와 수식어가 사라진 것을 볼 수 있다. 승인받을 가사는 **정리된 실제 전달본**으로 제시하고, 의미 있는 차이가 생기면 이유를 설명한다.

`lyrics:sections`는 태그 없는 초안의 빈 줄·반복을 보고 구조를 **추정**하는 보조 기능이다. 의미를 이해해 후렴을 보증하는 분석기가 아니다. 이미 태그가 있으면 다시 자동 배치하지 않으며, 구조를 직접 설계한 가사는 기존 태그를 유지하고 점검한다.

<a id="songwriting"></a>

## AI 작사에 적용하기

1. 곡 길이와 목적에 맞춰 필요한 구간만 선택한다. 짧은 곡과 장곡의 구성을 동일하게 고정하지 않는다.
2. Verse는 장면·서사, Chorus는 핵심 감정·훅, Bridge는 새로운 관점처럼 구간의 역할을 나눠 창작한다.
3. 한국어 가사를 실제로 쓰고, 후렴 반복은 가사에도 직접 적는다. 편곡 지시를 노랫말에 섞지 않는다.
4. 공식 태그가 변환·삭제되면 지원 구간으로 옮기고 style을 보완한다. 이 차이를 검토안에 표시한다.
5. [작사·생성 스킬](../skills/road-music-ace/SKILL.md)과 [검토 규칙](music-review.md)에 따라 승인 또는 자동 위임을 확인한 뒤 생성한다.

공식 문서의 태그는 음악적 의도를 전달하는 수단이다. 정확한 초 단위 구조·가창·보컬 고정 기능이나 ACE 전체 기능을 100% 통제하는 명령으로 안내하지 않는다.
