# 모델별 음악 제작·비교 가이드

[문서 지도](README.md) · [ACE 적용 가이드](ace-prompt-guide.md) · [장르 프롬프트](genre-prompts.md) · [작사·생성 스킬](../skills/road-music-ace/SKILL.md)

기존 가사를 유지하며 모델별 프롬프트·생성 흐름을 조정하거나 결과를 비교할 때 읽는다. 기본 ACE 제작에 모든 실험 설정을 적용하지 않는다. `prompt:knowledge --json '{"topic":"models"}'`로 이 원문을 조회할 수 있다.

**근거 범위:** 2026-10-16, Apple M1 Ultra 64GB에서 같은 두 편의 한국어 가사·시드·BPM과 180초 목표로 기존 8곡과 모델별 조정 8곡을 제작했다. 직접 청취하지 않았고 M1 Max 32GB를 실측하지 않았다. 아래 수치는 이 표본의 관측이며, 가사 정확도·음질의 일반적인 우열이나 보편적 최적값을 뜻하지 않는다.

필요한 절: [제작 경로](#제작-경로-선택) · [입력 설계](#가사-전달을-위한-입력-설계) · [모델별 조정](#모델별-조정과-실험-상태) · [실패 복구](#실패-복구와-비용-기록) · [비교 결과](#2026-10-16-비교에서-확인한-범위) · [시험 프롬프트](#모델별-프롬프트-기록) · [근거](#근거와-재현-자료)

## 제작 경로 선택

| 구성 | 확인한 경로 | 입력·제어 경계 |
| --- | --- | --- |
| ACE 2B Turbo + 0.6B LM | 기본 Road Music ACE 경로 | 공개 `song:generate`와 `job:wait`. 현재 지원 필드는 실행본 `schema`로 확인한다. |
| ACE 2B Turbo + 1.7B LM | 별도 복사 워커에서 비교한 구성 | 기본 CLI의 모델 선택 옵션이 아니다. 해당 런타임에서 실제 로드한 체크포인트를 확인해야 한다. |
| ACE XL Turbo 8bit | MLX-Serve v26.10.2의 별도 공개 음악 생성 API | 5Hz LM 없이 실행했다. 생성한 WAV를 Road Music 공개 `songs:import`로 가져온 뒤 내보냈다. |
| YuE2-3B MLX | Road Music의 Apple Silicon `yue-mlx` 경로 | full ABC 계획 → semantic AR → NAR 합성 → VAE. 기존 Windows NVIDIA용 `yue`와 구분한다. 설치·생성은 [YuE2 Apple Silicon](yue-mlx.md)을 따른다. |

`yue-mlx`는 현재 제품 통합 지원 경로이며, 아래 2026-10-16 기록은 통합 전 별도 공개 CLI로 수행한 비교다. 그 실험의 시간·메모리·샘플링 값은 현재 제품의 품질 보증이나 기본 권장값이 아니다. 문서 조회가 엔진 설치·다운로드·앱 업데이트·음악 생성의 권한을 추가하지 않는다. 미설치 상태나 공개 어댑터 부재를 보고하며, 내부 IPC 또는 미지원 `song:generate` 필드를 만들어 기능을 우회하지 않는다. 라이브러리·기존 GUI 작업을 보존하고 비교용 데이터 폴더와 출력 경로를 분리한다.

과거 비교 폴더의 `inputs/native-xl8/*.json`, `inputs/yue2/*.json`은 공통 가사·프롬프트 검토용이며 `engine:"ace"`가 들어 있다. 이를 실제 외부 런타임 요청으로 그대로 제출하지 않는다. 실행에는 아래 각 런타임의 공개 입력 계약에 맞춘 payload를 따로 만들고, 검토 입력과 실제 제출 입력을 함께 보관한다.

## 가사 전달을 위한 입력 설계

- ACE·YuE 모두 생성 전에 [원문 보존과 근거 기반 추천](music-review.md#preserve-input)으로 제목·문장·용어·후렴의 자연스러움을 확인하고, 허용된 수정 뒤 다시 검수한다. 자동 위임에서도 생략하지 않으며 입력 기술 검사·ASR 평가와 구분한다.
- 사용자 가사·구간 태그·명시한 길이를 기준으로 원문과 엔진 전달본을 각각 보관한다. 정확한 보존 요청에는 개사·축약·번역·로마자화·음절 재분할을 임의로 적용하지 않는다.
- 스타일은 보컬·편성·전개를 설명하고, 가사에는 실제 부를 문장과 지원 구간 태그를 둔다. 여성 보컬·고음·명료한 발음은 조건 요청이며 완창 보장 기능이 아니다.
- 가사 중심 편곡은 `solo female lead`, `vocal-forward mix`, 절제된 반주처럼 핵심부터 짧게 제안한다. 고음이 요청되면 마지막 후렴에 집중시키고, 과한 멜리스마·애드리브와 단어 끝음을 늘이는 연출의 영향을 함께 고려한다. 지시가 많거나 부정 태그가 길수록 더 정확해진다는 근거는 없다.
- 공개 CLI에는 실제 지원 JSON만 전달한다. `lyrics:clean` 전후와 `lyrics:check`, 같은 입력의 `prompt:compose`를 확인한다. 제공 원문이 바뀌면 기존 [검토 규칙](music-review.md#preserve-input)을 따른다.
- 기본 Road Music ACE 워커의 실효 한계는 caption 512자·가사 4,096자다. MLX-Serve v26.10.2 네이티브 구현은 caption 256토큰·가사 2,048토큰에서 자르므로 해당 토크나이저로도 확인한다. 이는 모든 모델의 공통 한도가 아니며 런타임이 바뀌면 다시 확인한다.

## 모델별 조정과 실험 상태

### ACE 0.6B·1.7B LM

기존 Turbo는 DiT 8단계·shift 3을 사용한다. 일반 가사 요청을 Base/SFT용 CFG·추론 단계 증대 조언으로 바꾸지 않는다. `advanced`는 현재 Road Music에서 YuE용이며 ACE LM 옵션을 넣는 통로가 아니다.

이번 별도 복사 워커에서는 `thinking=True`로 semantic 음악 토큰 생성은 유지하고, `use_cot_caption=False`, `use_cot_language=False`, `use_cot_metas=False`로 캡션 재작성·언어 및 메타정보 추론을 생략했다. 한국어 언어 `ko`, BPM·duration은 직접 조건으로 전달했다. 이 플래그들은 **기본 `song:generate`의 공개 옵션이 아니며, 실험적으로 조정한 워커의 설정 기록**이다.

세 CoT 플래그를 함께 끄면 항상 가사가 더 정확해진다는 결과는 얻지 못했다. 제공하지 않은 keyscale·timesignature는 N/A일 수 있어 모든 음악 메타정보가 고정되는 것도 아니다. 일반 제작의 기본값으로 승격하지 말고, 명시적으로 승인된 비교에서 필요한 제어만 검토한다. 가사 재작성용 `use_cot_lyrics`는 이 실험에서 켠 기능이 아니다.

메모리용 MLX 캐시 제한 0·VAE FP16·청크 256은 기존 분리 프로필에서 유지한 값이다. 이 자체를 발음 개선 설정이나 모든 Mac의 최적 메모리값으로 설명하지 않는다. 1.7B는 0.6B보다 크다는 이유만으로 개선을 단정하지 않고 실제 로드 이벤트와 입력을 기록한다. 정적 엔진 표시 문자열과 체크포인트가 다르면 로드 로그를 근거로 구분한다.

### 네이티브 XL 8bit

확인한 별도 API는 `POST /v1/audio/music-generations`이며 `model`, `prompt`, `lyrics`, `vocal_language`, `bpm`, `duration_seconds`, `seed`를 사용했다. 한국어에는 `vocal_language:"ko"`를 지정했다. 지원하지 않는 lyrics strength·guidance·steps 값을 발명하지 않는다. 해당 버전의 Turbo는 8단계·shift 3 고정이다.

이 경로는 5Hz LM의 자동 캡션 재작성을 거치지 않아 직접 caption의 우선순위와 길이가 중요하다. 이번 조정은 보컬 전면·절 반주 축소·마지막 후렴 고음·간주에서만 기타 솔로 같은 문구였고 추론 알고리즘은 그대로였다. 빠른 생성은 관측했지만 가사 전달·음질 우위는 입증하지 못했다. 이 구성을 XL + 4B LM 조합으로 안내하지 않는다.

### YuE2 MLX

검증한 입력은 `cot=full`, AR 8bit·NAR BF16, ODE 32단계였다. 비교 실험에서 semantic sampling을 temperature 1.0→0.8, top-p 0.95→0.9, top-k 100→80, repetition penalty 1.2→1.1로 바꾸고 CFG를 1.0→1.1로 조정했다. 낮은 무작위성과 조건 강화가 전달을 돕는다는 **가설**이었으며 기본 추천값이 아니다. 작은 CFG 변경도 조건 분기를 활성화해 시간·메모리 비용을 늘릴 수 있다.

해당 `SongRequest`에 독립적인 duration·language·자유 instruction 필드는 없었다. caption의 `Korean`, `concise three-minute arrangement`와 가사로 유도했지만 180초를 보장하지 못했다. semantic 최소 0·최대 9,000으로 EOS를 허용했다. 토큰 상한에 걸리면 `truncated.semantic`을 확인하고, 가사 말단을 자르거나 음원을 강제 절단·무음 패딩해 목표 달성으로 보고하지 않는다. 실제 길이 편차를 보고한다.

생성 후 공개 `abc inspect`로 악보 구조를 점검할 수 있다. ABC 검사 통과는 한국어 발음·완창 증거가 아니다. `SongRequest.abc`를 제공하면 계획 생성을 생략하고 해당 악보를 조건으로 사용할 수 있지만, 악보의 명목 길이도 실제 오디오 EOS 길이를 보장하지 않는다. 템포·마디 편집은 새 음악적 변경으로 기록하고, 사용자가 고정한 BPM·구조를 길이에 맞추려고 임의 변경하지 않는다.

## 실패 복구와 비용 기록

이번 YuE2 연속 배치의 두 번째 곡은 시스템 메모리 압력 level 2 보호장치로 중단됐다. 실제 OOM으로 확인한 사건이 아니다. 보호장치를 끄거나 같은 조건에서 무한 재시도하지 않는다. 실패·실행 여부를 확인하고 자원 상태가 정상으로 돌아왔을 때 승인된 재시도 범위에서 복구한다.

공개 `mlx-yue batch --resume`을 새 프로세스에서 사용해 완료된 첫 결과를 해시로 검증·재사용하고 실패한 두 번째 곡만 다시 생성했다. 이 명령은 Road Music의 `song:resume`과 다르며 스타일 수정용 명령으로 섞어 쓰지 않는다. 완료 음원은 보존하고 요청 입력·seed·설정·재시도 횟수를 남긴다.

성공한 생성 본체 시간, 실패 시도 비용, 복구 전체 벽시계 시간을 구분한다. 이 사례의 성공 본체 311.550초는 복구 전체 319.691초 **안에 포함**된다. 실패 시도는 파일 시각으로 약 198.699초 추정, 진단 대기를 제외한 실패+복구 실행 합계는 약 518.390초였다. 311.550과 319.691을 더하면 중복 계산이다. 지식 조회나 한 번의 생성 승인을 추가 후보·무제한 재시도 승인으로 확대하지 않는다.

## 2026-10-16 비교에서 확인한 범위

- 가사·태그·seed와 요청 BPM·180초 목표는 유지했다. 새 caption에는 애절함·고음·반주·보컬 지시가 함께 달라져 한 옵션의 인과 효과를 분리하지 못했다.
- 새 ACE·XL 6곡은 각 180초였다. 새 YuE2 록발라드는 299.599초로 목표보다 119.599초 길었고, 발라드는 180.919초였다. 길이를 맞추려고 자르지 않았다.
- 첫 곡/후속 곡은 서로 다른 장르이며, CLI 요청 시간·native HTTP 시간·YuE e2e의 측정 경계도 다르다. 다운로드·분석·복구 시간을 생성 본체와 섞지 않는다. RTF는 생성시간/오디오길이, 실시간 배속은 그 역수다.

| 구성 | 기존 생성시간: 록 / 발라드 | 조정안 생성시간: 록 / 발라드 |
| --- | --- | --- |
| 네이티브 XL 8bit | 31.2 / 30.7초 | 33.9 / 31.0초 |
| ACE 2B + 0.6B LM | 98.0 / 39.2초 | 83.3 / 34.4초 |
| ACE 2B + 1.7B LM | 74.2 / 39.3초 | 70.3 / 37.4초 |
| YuE2 MLX | 352.4 / 303.9초 | 664.5 / 311.6초; 발라드 재시도 비용 별도 |

가사 비교에는 원문을 초기 프롬프트로 주지 않은 동일 Whisper large-v3-turbo 한국어 전사를 사용했다. 의심스러운 자막·평가 문장 반복이 나타나 같은 16곡을 30초 고정 구간 104개로도 확인했다. 아래는 **전사 CER**이며 실제로 틀리게 부른 가사의 비율이나 청취 점수가 아니다. 낮을수록 해당 전사가 원문에 가깝다는 뜻이다.

| 사례 | 전곡 CER: 기존→조정 | 30초 구간 CER: 기존→조정 | 해석 |
| --- | --- | --- | --- |
| 네이티브 XL 록발라드 | 7.2→25.5% | 14.7→47.4% | 두 방법 모두 전사 불일치 증가 |
| ACE 0.6B 록발라드 | 2.0→50.2% | 47.4→15.1% | 방법에 따라 방향 반대 |
| YuE2 발라드 | 4.1→0.8% | 8.9→7.7% | 두 방법 모두 전사 불일치 감소 |

8쌍 중 5쌍은 두 전사 방식의 방향이 반대였다. ACE 1.7B 발라드는 전곡 동일·구간 감소였으며, 나머지 두 쌍은 위 XL 록과 YuE2 발라드다. 두 검사도 같은 ASR을 사용해 독립적인 청취 정답은 아니다. 반복 실행의 일치가 실제 가창의 정확성을 증명하지도 않는다. 따라서 **조정안을 일괄 권장하거나 전반적인 가사 전달 개선·여성 보컬·고음 성취·편곡/음질 순위를 확정하지 않는다.**

앞으로 비교할 때도 사용한 모델·런타임·입력 원문·정리본·caption·seed·목표/실제 길이·시간 측정 범위·성공/실패/재시도 비용을 남긴다. ASR에 반복 자막/평가 문장 등 오류가 의심되거나 개선 판정이 민감하면 분할 조건을 바꿔 민감도를 확인한다. 방향이 달라지면 불확실하다고 보고하고 더 잘 나온 숫자만 고르지 않는다. 직접 청취하지 않은 결과를 들었다고 표현하지 않는다.

## 모델별 프롬프트 기록

아래는 **이번에 시험한 최종 caption**으로, 향상이 검증된 프리셋이 아니다. 모델별 적응 예시와 실패 가능성을 함께 읽는다. 사용자 기존 프롬프트를 이 문구로 자동 교체하지 않는다. 가사는 별도 입력이며 원문 그대로 유지했다. 최종 caption을 다시 `style`로 넣고 같은 BPM·악기를 `parts`로 중복 조합하지 않는다. Road Music에서는 원래 style/parts로 `prompt:compose`한 최종 결과를 확인한다.

### ACE 2B + 0.6B LM의 시험 caption

애절한 고음 록발라드:

```text
Korean sorrowful rock ballad, clear solo female vocal, precise Korean consonants, syllabic singing, restrained verses, powerful high-register final chorus, minimal melisma, vocal-forward dry mix, quiet guitar under vocals, short instrumental breaks, no backing vocals, no ad-libs, minor key, 78 BPM, electric guitar, piano and drums
```

애절한 발라드:

```text
Korean sorrowful piano ballad, clear solo female vocal, precise Korean consonants, measured syllabic phrasing, tender restrained verses, expressive final chorus, controlled vibrato, sparse accompaniment, close dry vocal, no backing vocals, no ad-libs, minor key, 68 BPM, piano, cello and string ensemble
```

### ACE 2B + 1.7B LM의 시험 caption

애절한 고음 록발라드:

```text
Korean sorrowful rock ballad, expressive solo female lead, distinct Korean consonants and vowels, clear word endings, restrained verses, controlled high-register final chorus, short held notes after complete words, quiet band under lyric lines, intimate vocal-forward mix, no vocal runs, no backing vocals, minor key, 78 BPM, electric guitar, piano and drums
```

애절한 발라드:

```text
Korean sorrowful ballad, intimate solo female lead, distinct Korean consonants and vowels, clear word endings, unhurried syllabic phrasing, tender verses, expressive final chorus, restrained vibrato, piano-led sparse arrangement, strings behind the lead, close dry vocal, no vocal runs, no backing vocals, minor key, 68 BPM, piano, cello and string ensemble
```

### 네이티브 XL 8bit의 시험 caption

애절한 고음 록발라드:

```text
Korean sorrowful rock ballad, solo female lead upfront, precise Korean consonants, syllabic phrasing, quiet piano and clean guitar under verses, powerful high-register final chorus, short sustained notes after complete words, guitar solo during interlude only, sparse drums, dry clear lead vocal, no backing vocals, no ad-libs, minor key, resolved ending, 78 BPM, electric guitar, piano and drums
```

애절한 발라드:

```text
Korean sorrowful piano ballad, solo female lead upfront, precise Korean consonants, clear word endings, spacious syllabic phrasing, tender restrained verses, expressive final chorus, gentle controlled vibrato, sparse cello and strings behind the voice, close dry vocal, no backing vocals, no ad-libs, minor key, quiet resolved ending, 68 BPM, piano, cello and string ensemble
```

### YuE2 MLX의 시험 caption

애절한 고음 록발라드:

```text
Korean sorrowful rock ballad, solo female singer, clearly articulated Korean lyrics, syllabic vocal melody, restrained verse, high-register final chorus, minimal melisma, sparse piano and guitar under the voice, instrumental guitar only between vocal sections, concise three-minute arrangement, no vocal doubles, minor key, 78 BPM, electric guitar, piano and drums
```

애절한 발라드:

```text
Korean sorrowful ballad, solo female singer, clearly articulated Korean lyrics, syllabic vocal melody, tender restrained verses, expressive final chorus, gentle vibrato, piano-led sparse accompaniment, cello and strings behind the voice, concise three-minute arrangement, no vocal doubles, minor key, 68 BPM, piano, cello and string ensemble
```

## 근거와 재현 자료

- [고정 ACE 공식 문서](vendor/ace-step-1.5/README.md): commit `ca1e85fe9430179831e6bc6be790c332190a3866`의 GenerationParams·Turbo 처리. 실제 공개 CLI 허용값은 실행본 schema가 우선한다.
- [MLX-Serve v26.10.2](https://github.com/ddalcu/mlx-serve/tree/v26.10.2), [XL 8bit 모델 카드](https://huggingface.co/ddalcu/ACE-Step-1.5-XL-Turbo-MLX-Serve-8bit).
- [검증한 mlx-Yue 소스](https://github.com/vanch007/mlx-Yue/tree/c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8), [공식 YuE2-3B](https://huggingface.co/m-a-p/YuE2-3B).
- [Whisper 모델 카드의 한계](https://github.com/openai/whisper/blob/main/model-card.md): 음원에 없는 텍스트 생성·반복 등 ASR 자체 오류를 가창 오류와 구별해야 한다.

이 작업 폴더에 남긴 원자료는 `Output/female-ballads-20261016/production-report.json` 및 `Output/female-ballads-optimized-20261016/`의 `production-report.json`, `flow-changes.json`, `evaluation/paired-comparison.json`이다. 오디오·모델·개인 절대 경로는 배포 키트의 의존 자료로 삼지 않는다. 원자료가 없는 설치에서도 위 관측의 범위와 한계를 읽을 수 있으며, 새로운 제작의 실제 근거는 새 실행에서 검증한다.
