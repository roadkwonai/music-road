# 전 프레임·샷·전환 분석

## 원본과 완결성

공식 페이지·원본·버전·공개일·사용 범위를 구분한다. 허용된 접근으로 원본을 확보하지 못하면 크레딧 조사만 수행하고 `source_unavailable`로 남긴다. DRM·로그인·결제 경계를 우회하지 않는다. 메타데이터·자막·썸네일만으로 장면을 만들지 않는다. `ego-browser`가 있으면 해당 스킬을 읽고 공식 재생·다운로드 접근성을 확인할 수 있다.

정밀 분석 전에는 공식/제작자가 공개한 최고 공개본을 확인해 기록하고 2160p급을 우선한다. 실제 파일은 `ffprobe`로 영상 스트림·가로×세로·회전·PTS를 검사한다. 1080p급은 인코딩 스트림이 1920×1080 또는 회전된 1080×1920 이상인 파일이다. 가로 레터박스와 세로 레터박스(pillarbox), 실제 활성 영상 영역은 스트림 해상도와 별개로 기록·시각 검수한다. 따라서 1080p 인코딩 스트림의 letterbox MV를 활성 영역만으로 미달 처리하지 않는다. 컨테이너 해상도나 4K 표기만으로 통과시키지 않으며, 원래 master가 native인지 확인할 수 없는 공개 4K 판본은 `public_4k_master_unverified`로 기록한다. 업스케일·리인코딩은 화질 개선 근거가 아니고, 우리가 저해상도 파일을 업스케일하거나 재인코딩해 기준 충족으로 취급하지 않는다. 이 기준에 못 미치는 파일은 `precision_gate_not_met` 및 `sample_only`로 남기며 정밀 전수 분석 근거나 품질 통과로 인용하지 않는다.

파일 SHA-256, 실제 해상도, 실제 PTS와 영상 스트림을 고정한다. 리인코딩·편집·세로 크롭은 별도 버전이다. SHA-256 또는 PTS가 바뀐 새 원본에는 기존 샷·전환·coverage 관찰을 자동 승계하지 않고 새 지문에 다시 결속해 대조·재검토한다. VFR은 `frame/fps`로 시간을 계산하지 않는다. 전 프레임을 추출해도 실제로 본 범위는 별도로 집계한다. 예산상 전부 못 봤으면 누락을 보고한다.

## 도구

프로젝트 루트에서 실행한다. 출력은 새 절대 디렉터리여야 한다. 표준 Python과 기존 ffmpeg/ffprobe를 쓰며 원격 영상을 받거나 의미를 자동 판정하지 않는다. 단일 파일 컨테이너 mov/MP4·matroska/WebM·AVI·MPEG-TS·OGG·FLV·MPEG만 받는다. 로컬 HLS/concat/DASH도 종속 미디어가 원본 해시 밖에 있으므로 거부한다. 필요한 재생목록은 별도 허용된 수집 단계에서 하나의 영상 파일로 고정한다.

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,duration:stream_tags=rotate:stream_side_data=rotation \
  -of json /absolute/reference.mp4
python3 -B .agents/skills/road-music-mv/scripts/inspect_video.py /absolute/reference.mp4 \
  --output /absolute/new-analysis --width 320 --max-frames 20000 --max-megabytes 4096
python3 -B .agents/skills/road-music-mv/scripts/audit_coverage.py \
  --manifest /absolute/new-analysis/manifest.json --review /absolute/review.json --require-complete
```

manifest의 추출 완료는 시각 검토 완료가 아니다. format_version 2의 manifest는 원본·인덱스·썸네일·sheet·HTML 해시를 결속하고 audit에서 재계산한다. 예전 무결성 필드가 없는 패키지는 새 출력 경로로 다시 추출한다. manifest 자체도 상위 하네스의 artifact fingerprint로 고정한다. frame-index.jsonl·sheet-index.json·contact sheets·index.html로 구간을 배정한다. 320px 썸네일은 탐색용이다. 미세 합성·손가락·깜박임은 원본 해상도와 연속 재생으로 확인한다. 전체 정상속도·필요 구간 저속 재생의 실제 범위를 기록한다. 새 SHA-256 또는 PTS의 원본은 새 manifest와 review.json으로 다시 결속한다.

max-frames는 상한+1까지만 probe해 과다 프레임을 검출한다. max-megabytes는 보수적 예상과 생성 후 검사·실패 정리 경계이며 OS의 하드 디스크 할당 제한은 아니다. 실행 중 순간 사용량이 상한을 넘을 수 있으므로 여유 공간을 먼저 확인한다. 실패 시 이 실행이 새로 만든 추출물만 정리하고 incomplete manifest를 남긴다. 기존 출력·원본은 삭제하지 않는다.

## 의미 주석

review.json 계약: 프레임은 0 기반·끝 포함이다. 실제로 본 범위만 적는다. 카메라·효과가 바뀌면 구간을 나눈다. 구간 주석을 색인에 연결해 같은 문장을 수천 번 복제하지 않고 프레임별 의미를 조회한다.

```json
{
  "source_sha256": "실제 원본 SHA-256",
  "playback_reviewed": false,
  "reviewed_ranges": [
    {"first_frame": 0, "last_frame": 47, "evidence": "실제로 본 sheet·원본 구간", "note": "검토자와 관찰한 변화"}
  ],
  "shots": [
    {"first_frame": 0, "last_frame": 47, "size": "medium", "angle": "eye-level", "movement": "고정으로 보임", "lighting": "따뜻한 측광·청색 배경", "effects": "확인되지 않음", "transition_in": "첫 프레임", "evidence": "실제로 본 원본 프레임·구간", "confidence": "observed"}
  ]
}
```

이는 형식 예시이며 관찰 기록이 아니다. 도구는 무결성·범위·누락을 검사한다. 정말 보았는지와 주석 정확성은 독립 reviewer가 원본과 대조한다.

## 관찰 항목

| 축 | 기록할 것 |
|---|---|
| 음악·서사 | 구간·가사/악기 사건·감정 변화, 공연/서사/추상 이미지 기능. 듣지 않은 BPM·비트는 측정으로 쓰지 않음. |
| 프레이밍 | ECU/CU/MCU/MS/FS/WS/EWS, 인물 크기·여백·중심·대칭·가림·시선·화면축. |
| 앵글 | eye/high/low/overhead/worm's-eye/Dutch/POV/OTS. 실제 높이·각도 숫자는 근거 없으면 추정. |
| 광학 | 원근·왜곡·심도·초점 이동·bokeh·노출 변화. 초점거리·조리개·기종·셔터는 메이킹 근거 없으면 unknown. |
| 움직임 | pan/tilt/dolly/truck/pedestal/orbit/crane/handheld/zoom, 방향·가속·피사체 상대 거리·시차. 줌과 이동 불명확 시 추정. |
| 동작 | 얼굴·몸·손·소품·군무·배경 변화, 동작의 가독성, 카메라와 안무의 관계. |
| 빛·색·미술 | 보이는 키/필/역광 방향·색·노출·재질·의상·공간 층·모티프. 실제 장비·출력은 확인 전 추정. |
| 효과 | 합성·매치무브·분신·타임리맵·스피드램프·스톱모션·잔상·블러·왜곡·글리치·그래픽·질감. 보이는 현상과 제작법 분리. |
| 전환 | hard cut/dissolve/fade/match/action cut/whip/occlusion/morph/graphic, 전후 앵커·시선·방향·모양·색·운동. J/L cut은 소리도 확인. |

자동 scene score는 후보일 뿐이다. 스트로브·빠른 움직임 오검출, dissolve·가림 편집 누락을 보정한다. 전후 프레임과 연속 구간을 원본으로 확인하고 효과 시작/끝·변화·추정 제작법·확신도·음악적 목적을 적는다. 후보 주변만 보고 모든 전환을 찾았다고 하지 않는다.

검수한 샷에서 평균/중앙 길이·구간별 컷 밀도·반복 프레이밍·에너지 곡선을 산출하고 생성할 요소와 후반 요소를 나눈다. 최종 전달은 원본 지문→색인→coverage→샷/전환 근거→작품 분석→제작 원리다. coverage가 부족하면 `partial`이다.
