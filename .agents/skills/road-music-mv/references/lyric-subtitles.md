# 보컬에 맞춘 가사 강조 자막

가사 자막·노래방식 강조를 요청한 MV에서만 적용한다. 음악 생성·개사와 별개인 후반 작업이다. 사용자가 제공한 자막 이미지는 스타일 근거이며, 그 이미지의 문장을 원곡 가사로 대체하지 않는다.

기본 제작 순서는 자막 없는 LTX 샷·본편 편집 확정 뒤 별도 자막 합성이다. 정렬 자료와 자막 도구 준비는 병행할 수 있다. 사용자가 완성 뒤 합성을 지정했다면 애니매틱 자막 렌더는 추가하지 않고 클린 영상 제작을 계속한다.

## 원문과 타이밍

인계 음원·가사 파일의 절대 경로와 raw SHA-256을 보존한다. 표시 문자열은 원문의 줄·공백·구두점을 유지하고 구간 태그와 빈 줄만 제외한다. 정렬용 정규화 문자열에는 원문 문자 span으로 돌아가는 대응표를 둔다. ASR 전사를 원문 대신 표시하지 않는다.

기존 단어 시각이 있으면 실제 보컬에 맞는지 먼저 확인한다. 줄 단위 LRC/SRT, ABC 악보, 곡 길이·BPM·글자 수 배분은 단어 발화 시각의 증거가 아니다. 정렬 도구가 없다면 현재 미설치 상태를 기록하고, 설치·다운로드는 기존 위임 범위에 따라 처리한다.

설치된 Whisper.cpp를 쓸 때는 실제 `--help`와 해당 버전 원문을 확인한다. v1.9.5의 주의점은 다음과 같다.

- CPU 실행은 `--no-gpu`, DTW는 모델과 맞는 `--dtw large.v3` 또는 `large.v3.turbo`를 사용한다. 이 버전은 `--no-flash-attn`이 없으면 DTW를 비활성화하므로 실제 로그의 `use gpu`, `flash attn`, `dtw`를 확인한다.
- `--output-json-full`의 token `offsets`는 ms, `t_dtw`는 10ms 단위의 단일 앵커다. `t_dtw / 100`으로 초를 얻으며 시작·끝 두 경계를 측정한 값으로 해석하지 않는다.
- 일반 token 경계에는 `voice_length` 비례 배분이 포함된다. 한국어 UTF-8 조각 병합 시 중간 token의 DTW 메타데이터도 소실된다. `--split-on-word`나 전체 가사를 넣은 `--prompt`가 원문 강제 정렬을 수행하지 않는다.
- 원문과 인식 결과를 순서대로 대조하고 반복 후렴의 occurrence를 구분한다. 누락·치환·반복 혼동·음수/중복/역전 앵커는 미확정으로 남긴다. 없는 시각을 균등 분배해 채우지 않는다.

모델 앵커로 파생한 표시 구간은 `model-estimated`/`derived_display_interval`로, 실제 청취 검수는 별도 상태로 기록한다. token 확률은 경계 오차의 신뢰도가 아니다. 원문 어절마다 문자 span, 대응 ASR segment/token, 앵커·일반 경계, 매칭 상태·불확실 이유를 남긴다. 자동 추론 완료를 가창 싱크 검수 완료로 보고하지 않는다.

## 스타일과 합성

기획에서 위치·폰트·색·강조 단위를 정한다. 사용자가 요청한 경우 흰색 전체 가사, 현재 단어의 금색 채움·밑줄, 반투명 어두운 둥근 바를 사용할 수 있다. 단어가 바뀌면 이전 단어는 흰색으로 돌아온다. 단어 구간 안의 좌→우 채움은 표시용 보간이며 음절·음소 시각의 실측을 뜻하지 않는다. 무가사 구간에는 바와 강조를 숨긴다.

얼굴·눈·안무의 손과 발을 가리지 않는 위치를 실제 대표 프레임에서 결정한다. 긴 줄은 원문의 단어 경계에서 나누고 글자를 생략하지 않는다. 한글 glyph·밑줄·바 여백·원본 해상도에서의 잘림을 시각 검수한다. 정밀 자막을 LTX 프롬프트에 그리게 하지 않고 후반 그래픽으로 합성한다.

현재 단어만 강조하는 방식은 기본 ASS `\k`/`\kf`의 누적 강조와 다르다. 기존 Pillow로 RGBA 자막 strip을 만들어 FFmpeg `rawvideo`→`overlay alpha=straight`로 합성하는 경로를 사용할 수 있다. 설치된 라이브러리와 필터를 확인하고 불필요한 libass 설치를 추가하지 않는다. Pillow에 libraqm이 없으면 `language`/`direction`/`features` 인자를 사용하지 않는다.

현재 [render_karaoke.py](../scripts/render_karaoke.py)는 1920×1080·24fps·0기준 CFR 클린 영상과 원곡 전체, 원문 행·문자 span·단어 구간 JSON을 받아 상단 Bold 자막의 H.264/PCM MOV와 AAC 브라우저 프록시를 만든다. `--timings`, `--video`, `--output-dir`을 지정하며 기존 출력 폴더는 거부한다. 다른 납품 규격은 해당 규격의 기하·PTS 검증을 보완한 뒤 사용한다. JSON의 `alignment_complete`는 후보 구간의 구조적 완결성이고 실제 가창 싱크 승인과 별개다. 모델 전사 불일치·공유 token 경계와 미청취 상태를 남기고 독립 최종 검수에서 해결한다.

모든 영상 프레임에 투명 프레임을 포함한 자막 strip을 공급한다. 입력 FPS·시작 PTS·출력 프레임 수와 파이프 전송량·종료 코드를 검사한다. `eof_action=pass`가 조기 종료된 자막 파이프를 통과시키는 근거가 되지 않는다. 24fps의 한 프레임은 약 41.667ms이며, 렌더 격자와 정렬 정확도는 다르다.

클린 영상과 자막본은 별도로 보존한다. 원곡 전체를 같은 sample rate/channels로 연결하고 `-shortest`·길이 잘라내기·게인·페이드·템포 변경으로 맞추지 않는다. 무손실 master는 원곡과 동일 조건의 `pcm_s32le` 전체 sample count·raw PCM SHA-256을 대조한다. AAC 브라우저본은 손실 프록시로 명시한다.

## 워크플로 연결과 검수

자막 요청이 있으면 기존 계획에 `단어 정렬 → 자막 합성 → 독립 자막 검수`를 추가하고 최종 검수가 그 실제 산출물을 소비하게 한다. 정렬은 영상 proof와 독립적으로 준비할 수 있으며, 자막 변경만으로 기존 캐릭터·이미지·컷 승인을 무효화하지 않는다. 가사·음원·영상 PTS가 바뀌면 영향을 받는 정렬·합성과 검수를 다시 수행한다.

정렬 JSON에는 원곡/가사 SHA, 시간 원점·단위·도구/모델, 원문 행과 문자 span, 단어 start/end, 매칭·미확정 목록을 둔다. 누락·겹침·역전·범위 초과를 검사하고 미확정 단어를 완료로 숨기지 않는다. 기하 검사용 합성 시간은 실제 보컬 정렬 파일과 분리한다.

독립 검수는 단어 전환 전후, 현재 단어만 강조되는 상태, 긴 줄·반복 후렴·휴지·마지막 프레임, 얼굴/군무 비가림, 원문 재결합, 원곡 PCM·출력 프레임/PTS·전체 decode를 확인한다. 실제 소리를 들으며 강조 시각을 판단한 범위와 표본만 본 범위를 기록한다. 무음 프레임 관찰이나 모델 추론만으로 청취 검수를 주장하지 않는다.

## 공식 근거

- [Whisper.cpp v1.9.5 CLI·JSON writer](https://github.com/ggml-org/whisper.cpp/blob/d1be6fde11ac6e0407606b4e42fe72d34add8037/examples/cli/cli.cpp), [DTW와 경계 계산](https://github.com/ggml-org/whisper.cpp/blob/d1be6fde11ac6e0407606b4e42fe72d34add8037/src/whisper.cpp).
- [ASS karaoke 태그](https://aegisub.org/docs/latest/ass_tags/#karaoke-effect), [FFmpeg rawvideo](https://ffmpeg.org/ffmpeg-formats.html#rawvideo), [overlay](https://ffmpeg.org/ffmpeg-filters.html#overlay).
- [Pillow 글자 계측·그리기](https://pillow.readthedocs.io/en/stable/reference/ImageDraw.html), [FFmpeg streamhash의 기본 오디오 변환](https://ffmpeg.org/ffmpeg-formats.html#streamhash).
