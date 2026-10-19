# YuE2 고품질 제작·검수 워크플로

[문서 지도](README.md) · [YuE 제작 적용 가이드](yue-prompt-guide.md) · [공용 제작 스킬](../skills/road-music/SKILL.md) · [고정 공식·MLX 원문](vendor/yue2/README.md)

Road Music CLI에서 YuE2의 계획, 샘플링, 음원 합성, 악보와 재현 산출물을 다룰 때의 실행 안내다. 실행 버전의 `schema`, `yue:capabilities`가 허용 필드와 엔진별 지원 여부의 최종 기준이다. 이 문서는 품질을 보장하거나 모든 값을 최대로 올리라고 지시하지 않는다.

실제 8개 비교 음원의 시간·가사 전사·메모리와 검증 한계는 [2026-10-19 실기 검증](yue-cli-validation.md)에 기록했다. 새 요청의 기본 곡 수나 필수 시험 수로 확대하지 않는다.

## 빠른 선택

1. 먼저 `yue:capabilities`와 `song:prepare`로 선택한 엔진이 실제 사용할 수 있는 기능과 정리 뒤 입력을 확인한다. 이 두 명령은 음악을 생성하거나 모델을 설치하지 않는다.
2. 새 곡은 `cot:"full"`과 기본 샘플링으로 시작하며 effective에서 CFG1·ODE32를 확인한다. off의 CFG기본1.01을 full의 값으로 조용히 덮지 않는다. `parts`에는 장르·보컬·편성·전개·믹스의 의도를 짧은 태그로 나눈다.
3. 비교가 요청된 범위에서만 한 번에 한 가설을 바꾼 후보를 준비한다. 2~3개는 제한된 비교 예시이지 매 제작의 필수 곡 수가 아니다. 예를 들어 seed만, 또는 같은 score에서 `odeSteps`만 바꾼다. 전 곡의 새 계획·새 합성·새 디코드를 섞어 비교하지 않는다.
4. 채택 전 입력·실효 옵션·ABC·truncation·길이·파일 검사를 확인한다. 듣지 않았다면 보컬 음색·가사 전달력·편곡 품질 판정은 `미청취`로 남긴다.

`song:prepare`가 notes에 승인한 의미의 삭제·교체를 보이면 원문과 전달본을 비교해 해결한 뒤에만 생성한다. 가사와 프롬프트부터 생성까지 전부 자동 위임받은 작업만 이 검수 뒤 자동 제출할 수 있다. 그 외에는 [검토 규칙](music-review.md)을 따른다.

## 입력의 역할

| 입력 | 모델에 주는 것 | 보장하지 않는 것 |
| --- | --- | --- |
| `style` / `parts.genre` | 장르, 언어, 보컬 성격, 공간감, 편곡 방향의 짧은 태그 | 특정 가수·음색·믹스·악기의 고정 |
| `parts.instruments` | 표준 악기명 목록의 편성 요청, 최대 16개 | 멀티트랙, 악기별 볼륨·팬·완전 배제 |
| `parts.instrumentation` | 자유 악기명과 `role`, 선택 `technique`·`section`을 조합한 짧은 스타일 태그 | 악보의 개별 성부나 스템 |
| `parts.vocal`, `parts.dynamics`, `parts.mix` | 가창, 섹션별 에너지, 음장·밸런스 의도 태그 | 노트별 가창, 자동 마스터링 값 |
| `abc` | YuE2 네이티브 ABC의 보컬 멜로디·반주 멜로디·코드 | 악기별 악보, 가사 음소-음표 강제 정렬 |

`V: Vocal`과 `V: Ins`는 각각 한 줄의 선율이다. `Ins`는 기타·첼로·드럼의 개별 트랙이 아니며, 실제 악기 질감은 뒤 음원 합성에서 style을 참고해 결정된다. `instrumental:true`는 현재 MLX 경로에서 무보컬 style 의도를 더하는 요청이며 ABC Vocal 성부를 자동으로 비우거나 Ins로 옮기는 보장이 아니다. 성부·실제 보컬 누출을 확인한다. 현재 공식 main의 별도 연주곡 스킬을 설치된 flag와 동일시하지 않는다.

### 편성 태그 예

다음처럼 역할을 분리한다. 값은 생성 옵션이 아니라 최종 style에 들어가는 짧은 의도다.

```json
{
  "parts": {
    "instrumentation": [
      {"instrument": "piano", "role": "accompaniment", "technique": "sparse chords", "section": "Verse"},
      {"instrument": "electric guitar", "role": "response", "technique": "sustained bends", "section": "Chorus"}
    ],
    "vocal": ["female lead", "clear Korean consonants", "restrained verse", "open final chorus"],
    "dynamics": ["gradual build", "chorus lift", "quiet bridge reset"],
    "mix": ["lead vocal forward", "wide chorus", "controlled low end"],
    "bpm": 72
  }
}
```

긴 문장, 서로 충돌하는 태그, 한 태그 안에 여러 섹션의 지시는 피한다. `song:prepare`의 최종 style과 notes로 실제 남은 의미를 확인한다.

`parts.instruments`와 `parts.instrumentation`은 동시에 지정하지 않는다. `role`은 `accompaniment`, `lead`, `bass`, `rhythm`, `texture`, `response`, `solo` 중 하나다. `section`은 `All`, `Intro`, `Verse`, `Pre-Chorus`, `Chorus`, `Bridge`, `Interlude`, `Outro`이며 대소문자를 그대로 쓴다. 예를 들어 `all`이나 `Accompaniment`는 허용값이 아니다.

## 지원 행렬

`yue:capabilities`는 엔진별 공개 지원·기본값·제약과 설치 파일 탐지 상태를 구분해 돌려준다. 설치 탐지는 실제 추론 성공 검증이 아니며 생성 전에 `engines:list`도 확인한다. 지원하지 않는 runtime 키는 거부하며, 유사한 ACE 옵션으로 대체하지 않는다.

| 영역 | `yue` | `yue-mlx` | 확인·주의 |
| --- | --- | --- | --- |
| `cot`, `abc`, 16개 `advanced` 제어 | 지원 | 지원 | `temperature`, `cfgScale`의 0도 유효; 상한·prefix 컨텍스트는 schema/effective 확인 |
| `parts`의 편성·보컬·전개·믹스 태그 | 지원 | 지원 | 스타일 의도일 뿐 음색/믹서 제어 아님 |
| `runtime.precision`, `memoryBudgetGiB`, `vaeCoreFrames`, `queryChunkSize`, `requireAc`, `vaePath`, `loraPath`, `loraScale` | capabilities가 표시한 항목만 | capabilities가 표시한 항목만 | 런타임·모델 경로를 임의로 바꾸지 말고 설치된 경로/안전 제한을 보존 |
| `song:replay`의 `plan`·`synthesize`·`decode` | capabilities가 표시한 단계만 | capabilities가 표시한 단계만 | 원래 artifact·해시·truncation을 보존한 새 작업 |
| `score:transcribe` | 별도 SheetSage2 환경이 있을 때 | 별도 SheetSage2 환경이 있을 때 | 오디오에서 음악 ABC/MIDI를 추정. 가사 ASR·청취 판정의 대체물이 아님 |

## 고급 옵션

`advanced`는 아래 세 묶음만 쓴다. 생략값은 엔진의 고정 기본값을 유지한다. 모델 실행 전에 `song:prepare`가 실효 옵션과 이유를 기록한다.

| 단계 | 옵션 | 용도 |
| --- | --- | --- |
| semantic 음악 토큰 | `temperature`, `topP`, `topK`, `repetitionPenalty`, `penaltyWindow`, `minTokens`, `maxTokens` | 창의성·후보 폭·반복 억제·종료 길이 예산 |
| ABC 계획 | `abcTemperature`, `abcTopP`, `abcTopK`, `abcRepetitionPenalty`, `abcPenaltyWindow`, `abcMinTokens`, `abcMaxTokens` | 멜로디·화성 계획의 다양성·반복·토큰 예산 |
| semantic 조건 유도 | `cfgScale` | semantic AR 조건부/무조건부 logits 결합. ABC 계획에는 적용되지 않음 |
| acoustic 음원 합성 | `odeSteps` | NAR 확산/ODE 계산량. 더 높아도 품질 보장 아님 |

`minTokens <= maxTokens`, `abcMinTokens <= abcMaxTokens`를 먼저 만족시킨다. `temperature:0`은 탐색이 아닌 greedy 재현 후보에, `cfgScale:0`은 조건 유도가 필요 없는 제한 실험에만 쓴다. 높은 `odeSteps`는 속도와 메모리 비용을 늘리며 더 좋은 곡을 보장하지 않는다. `maxTokens`와 `abcMaxTokens`는 초 단위가 아니며, 컨텍스트 24,576에서 prefix와 생성 예산이 넘으면 실패한다. `result.truncated.abc`와 `result.truncated.semantic`이 하나라도 참이면 완료 파일이어도 완주로 채택하지 않는다.

YuE seed는 숫자일 때 JavaScript 안전 정수, 그보다 크면 정확한 십진 문자열로 지정한다. 전체 범위는 `0..9223372036854775807`이다. schema의 문자열 정규식은 형식을 검사하며 의미상 상한은 `song:prepare`와 제출 검증에서 추가로 검사한다.

## 제작 패턴

### 1. 준비와 첫 생성

`song:prepare`에는 `song:generate`와 같은 생성 입력을 준다. 반환된 최종 가사·최종 style·변경 notes·실효 옵션·원생 payload와 원문을 대조한다. 필드 이름은 실행 버전 `schema`를 따른다.

```bash
node cli/road-music.js yue:capabilities --json '{"engine":"yue-mlx"}'
node cli/road-music.js song:prepare --file song.json
node cli/road-music.js song:generate --file song.json --events --wait
```

전사 환경도 검사해야 하면 `yue:capabilities`에 절대 `python`·`modelDir`을 함께 준다. 경로는 설치 여부 조회용이며 새 설치 권한이 아니다.

```bash
node cli/road-music.js yue:capabilities --json '{"engine":"yue-mlx","transcription":{"python":"/absolute/path/to/sheetsage-python","modelDir":"/absolute/path/to/SheetSage2"}}'
```

새 곡의 출발점은 `cot:"full"`과 생략한 advanced 기본값이다. full/melody의 CFG는1, off의 CFG는1.01이며 ODE는32다. 이 수치는 품질 최적값 인증이 아니라 현재 고정 구현의 기본값이다. `parts.strong` 단독은 CFG를 바꾸지 않는다. 현재 구현은 strict와 strong이 둘 다 true일 때에만 1.5를 제안하고 명시한 advanced.cfgScale가 우선한다. baseline 비교는 parts.strict/strong 효과를 섞지 않고 effective에서 실제 CFG를 확인한다. 같은 가사·style에서 seed만 바꾼 2~3개 후보가 첫 비교 단위다.

### 2. score와 음원을 분리해 비교

계획이 마음에 들면 artifact를 보존하고 `song:replay`로 필요한 단계만 반복한다. `plan`은 저장된 plan을 보존한 채 semantic·CFG·ODE만 다시 실행하고, `synthesize`는 저장 semantic/noise부터, `decode`는 저장 latent부터 새 산출물을 만든다. 입력 가사·style·ABC를 바꾸면 replay가 아니라 새 생성이다. 재현 override는 단계보다 앞선 값을 바꾸지 않는다: `plan`에는 semantic sampling 7개·CFG·ODE, `synthesize`에는 ODE/NAR 관련 값, `decode`에는 VAE 관련 값만 준다. 나머지 override는 거부되며, 세부 허용 키는 `yue:capabilities`로 확인한다.

```bash
node cli/road-music.js song:replay --json '{"dir":"/absolute/path/from/song-detail","stage":"decode","title":"decoder-comparison"}' --wait
node cli/road-music.js score:inspect --json '{"file":"/absolute/path/from/song-detail/score.abc"}'
node cli/road-music.js score:compare --json '{"source":{"file":"/absolute/path/source.abc"},"candidate":{"file":"/absolute/path/candidate.abc"}}'
```

`score:inspect`는 공식 YuE2 ABC 범위와 구조를 확인한다. `score:compare`는 지정하지 않은 선율·박자·템포 불변조건이 유지됐는지를 비교한다. 동봉 ABC helper를 써서 두 명령은 엔진 설치 없이 offline으로 실행할 수 있다. 둘 다 음악성이 좋다는 판정은 하지 않는다.

### 3. 악보·가사 전달력 점검

`yue:capabilities`에 선택 `transcription:{python,modelDir}`을 주면 별도 설치된 SheetSage2 환경의 가용성을 확인한다. 이를 생략하면 전사 환경은 구성되지 않은 것으로 보고 `available:false`를 돌려준다. 자동 설치·다운로드·외부 업로드는 하지 않는다. `score:transcribe`는 로컬 오디오의 음악 ABC/MIDI 진단이며 가사 전달력에는 사용하지 않는다. 이 명령에는 `audio`, `output`, `python`, `modelDir` 네 필드가 모두 필요하다.

```bash
node cli/road-music.js score:transcribe --json '{"audio":"/absolute/path/from/song-detail/audio.wav","output":"/absolute/path/new-cover-score-dir","python":"/absolute/path/to/sheetsage-python","modelDir":"/absolute/path/to/SheetSage2"}'
```

`task:"full"`은 화음이 포함된 전체 선율 악보, `melody-full`은 악기 구간을 포함한 코드 없는 전체 선율, `melody-vocal`은 코드 없는 보컬 선율 사본을 요청한다. `task`와 `melodyOnly`를 모두 생략하면 `melody-full`에 해당한다. `task` 없이 `melodyOnly:false`를 주면 화음을 포함한다. 전사는 추정 결과이므로 경고와 누락을 검토한 뒤 새 생성의 `abc`와 알맞은 `cot`으로 전달한다.

가사 전달력은 별도 설치된 로컬 ASR이 있을 때만 무유도 전사와 원문을 비교한다. ASR이 없으면 `미확인`으로 남기며, SheetSage2 결과를 가사 전사처럼 바꾸지 않는다. ASR과 직접 청취 모두 음정·편곡·음질의 점수는 아니다.

커버용 melody 조건을 만들 때는 `score:strip-chords`로 코드를 제거한다. `voice:"Vocal"`을 함께 주면 `Vocal` 선율을 유지하고 `Ins`를 쉼표로 바꾼 새 ABC 문자열을 받는다. `score:transcribe`의 `task:"melody-vocal"`은 공식 `--melody-only` 전사 뒤 같은 후처리로 `score-vocal.abc` 사본을 만든다. 원래 `score.abc`와 원 artifact는 보존한다.

## 반복 테스트의 종료 조건

짧은 가사로 두 장르를 시험할 때도 가사·style·초기 옵션을 고정하고 실험별 한 변수만 바꾼다. 예시는 자동 작곡을 명시 위임받은 테스트용 초안이며, 사용자 제공 가사를 대체하는 템플릿이 아니다.

| 시험 | 고정 조건 | 한 변수 | 채택 근거 |
| --- | --- | --- | --- |
| 여성 보컬 록발라드 | 짧은 verse/chorus, piano·electric guitar·drums, 72 BPM | seed 또는 runtime precision | 파일/완주/가사 구간/직접 청취 기록 |
| 피아노 중심 발라드 | 짧은 verse/chorus, piano·cello, 66 BPM | seed 또는 runtime precision | 같은 기준과 실제 시간·메모리 비교 |

실제 승인된 **이번 개발 검증**은 장르별 기본 8bit 후보 2개(총 4개), 장르별 BF16 비교 1개(총 2개), 같은 artifact의 synthesize와 decode 재현 각 1개(총 2개)로 최소 8개를 만든다. 이는 일반 음악 제작마다 8곡을 강제하는 규칙이 아니다. 4bit 가중치가 없으면 `unavailable`로 기록하고 내려받지 않는다. 모델 압력 실패는 원인 하나만 고쳐 한 번 재시도하고, 다시 실패하면 중단한다. 파일 기술 검사, ABC 검사, truncation, SheetSage2 악보 전사(가능할 때), 로컬 ASR(가능할 때), 직접 청취를 분리해 기록한 뒤에도 명확한 우위가 없으면 8bit 호환 기본을 채택하고 중단한다. ASR은 단어 누락 진단이고 여성 보컬·음정·편곡·음질의 점수가 아니다. 직접 청취 도구가 없으면 품질 우위를 확정하지 않는다.

## 결과 기록

곡마다 다음을 남긴다: 원문과 전달본, `song:prepare` notes, capabilities/effective JSON, engine·모델·VAE·runtime, seed, ABC와 source hash, 단계별 시간과 메모리, 실제 파일 길이·포맷, truncation, 전사·직접 청취 여부와 채택 이유. 이러한 기록은 다음 후보의 변경 원인을 좁히기 위한 것이며, 한 성공 사례를 전역 최적값으로 승격하지 않는다.

## 계획·원문 변경·replay의 실제 경계

- song:prepare는 무추론 입력 검증이다. song:generate의 mode:plan은 모델로 ABC를 생성하는 실제 작업이며 음원은 없다. mode:song과 혼동하지 않는다.
- 가사/style 변경은 새 song:prepare→song:generate다. 보존할 선율이 있으면 source/candidate ABC를 검사한 뒤 새 요청의 abc에 넣는다. song:render는 dir의 원래 가사/style을 재사용하므로 수정 가사 전달에 쓰지 않는다.
- 기존 원문을 유지하고 악보만 바꿀 때 song:render를 쓴다. 실제 가사가 빈 프로젝트는 현재 이 명령에서 거부하므로 instrumental:true/abc/mode:song 새 생성이나 검증한 MLX plan replay를 사용한다.
- plan replay는 새 ABC를 작곡하는 기능이 아니라 무결성 검증한 저장 plan 이후를 재실행한다. synthesize는 semantic/noise, decode는 latent를 재사용한다. artifact가 없거나 해시가 다르면 재사용 가능하다고 추정하지 않는다.
- synthesize replay의 advanced는 odeSteps만, decode replay의 advanced는 허용되지 않는다. plan replay의 semantic/CFG/ODE와 runtime별 허용키는 capabilities가 기준이다. 가사/style/ABC 변경은 replay가 아니다.
- targetSeconds만 바꾸는 것은 원생 음악 조건 변경이 아니다. 실제 길이는 원문·기호 계획·EOS·잘림으로 확인하고 임의 잘라 맞추지 않는다.
