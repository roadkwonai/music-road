# LTX 기본 모델과 Road Music의 실제 경계

확인일 2026-10-16. 모델 능력, 실행 백엔드 능력, Road Music 공개 입력을 따로 기록한다. 아래 로컬 경로는 이 컴퓨터의 확인 스냅샷이며 다른 환경의 기본값이 아니다.

## 새 제작 기본값: LTX 2.5 Distilled Q8

모델을 지정하지 않은 새 AI 영상 생성은 [harness-spec.json](harness-spec.json)의 `generation_defaults`를 따른다. 기본은 **LTX 2.5 / distilled / Q8**, MLX 팩은 `dgrauet/ltx-2.5-mlx-q8`이다. 이 값은 모델 식별자이며 자동 다운로드를 허용하는 실행 인자가 아니다. 실제 명령에는 설치를 확인한 로컬 팩 경로를 `--model`로 넣고 `--distilled`를 선택한다. 외부 CLI 자체의 기존 기본값에 의존하지 않는다.

- [공식 2.5 모델 카드](https://huggingface.co/Lightricks/LTX-2.5): 22B dev/distilled, 전용 Gemma 4, Conv VAE와 더 무거운 diffusion decoder, DFR을 구분한다. distilled도 22B·8-step이며 DFR은 기본 생성과 별도 검증한다.
- [현재 MLX adapter의 2.5 지원](https://github.com/dgrauet/ltx-2-mlx/blob/9e4a1a54194460547a103334b5e06382724fbba6/README.md#ltx-25): 설치된 v0.16.3은 팩에서 2.5를 자동 감지하며 Gemma 4를 팩에서 로드한다. 2.3용 `--gemma`/Gemma 3을 2.5 설정으로 재사용하지 않는다. 미지원 task LoRA나 CUDA/ComfyUI 옵션을 지원한다고 추정하지 않는다.
- 이 컴퓨터는 M1 Ultra·64GB다. 2026-10-16 사용자 설치 승인과 계정 접근 동의 뒤, 아래 로컬 2.5 Q8 선택 팩의 필수 19파일·43,120,872,772바이트를 설치하고 재해시했다. LFS SHA-256 7개와 Git blob SHA-1 12개가 모두 원격 목록과 일치했고, 2.5.0·bits=8/group=64·팩 내 Gemma 4 메타데이터를 확인했다. 실제 2.5 추론·안전 해상도·메모리 피크·인물 품질은 별도 proof 전 미검증이다. 2.3 Q4 풍경 생성의 과거 성공은 당시 증거로 유지한다. 다음 실행은 실제 설치 상태를 재확인하며, 다른 모델 다운로드·계정 인증·라이선스 동의는 설치 요청 없이 자동 진행하지 않는다.

확인한 로컬 2.5 팩: `/Users/freelife/.local/share/roadmusic-ltx25/models/ltx-2.5-mlx-q8`. 팩 revision은 `746ca9aacb697d2c739f544d68b584214dedcc75`다. 선택 범위는 두 단계 distilled I2V·conv·명시 frames·`--no-audio`이며 dev·DFR·diffusion decoder·오디오 출력 가중치는 설치하지 않았다. 설치 검증 기록은 `.harness/work/lumi4-selected-mv-20261016-v5/review/installed-runtime25.json`에 있다.

2.5가 없거나 요청 기능이 미지원이면 해당 생성 단계를 미실행으로 보고한다. 2.3이나 Q4로 조용히 대체하지 않는다. 사용자가 다른 모델을 명시하면 그 선택을 따르며, 기존 승인된 2.3 작업의 재현은 당시 모델·옵션·출력을 유지한다. 모델을 바꾸어 새 작업을 시작할 때는 새로운 입력/모델 기록과 proof를 남긴다.

설치를 위임받으면 실제 loader와 공개 파일 목록으로 선택한 pipeline의 필요 파일·revision·바이트 합계를 먼저 정한다. 현재 adapter의 두 단계 distilled I2V·conv·명시 frames·`--no-audio`에서는 dev·DFR·diffusion decoder·오디오 출력 가중치가 필요하지 않다. 필요한 Gemma 4·connector·conv encoder/decoder·공간 업스케일러와 config/tokenizer를 같은 팩 revision으로 보존한다. 이 선택 집합은 실제 로딩 전에는 소스 기반 계획이며, 기능을 바꾸면 다시 대조한다. 원격 repo ID를 `generate --model`에 바로 전달해 전체 팩의 자동 다운로드를 유발하지 않는다.

공개 metadata 조회 성공과 가중치 파일 접근은 별도다. gated 팩이면 기존 인증의 파일 접근을 작은 metadata 요청으로 확인하고, 접근 거부를 모델 미지원이나 다운로드 성공으로 표시하지 않는다. 계정 로그인·접근 동의가 필요한 경우 그 조건을 알리고 해당 생성 단계만 대기한다. 토큰을 채팅·명령 인수·장부에 남기거나 공개 미러로 조용히 대체하지 않는다.

## ComfyUI와 MLX 선택

ComfyUI 검토를 요청받으면 실제 실행 core의 `models`와 설정에 연결된 추가 모델 경로를 읽기 전용으로 확인한다. Desktop 설치나 `Documents/ComfyUI` 한 곳만 보고 모델 설치 여부를 단정하지 않는다. [공식 2.5 native workflow](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5)의 노드·요구 파일을 현재 로컬 버전과 대조한다. MLX Q8 팩과 Comfy용 `int8-convrot`/bf16 VAE 팩은 loader 계약이 다르며, 같은 `.safetensors` 확장자가 직접 호환을 뜻하지 않는다. 세부 구성은 [2.5 모델 카드](https://huggingface.co/Lightricks/LTX-2.5)에서 다시 확인한다.

Apple Silicon 지원과 해당 LTX 2.5 I2V 조합의 실제 성공은 별도 근거다. 보유 가중치·추가 용량·필요 기능·실측 메모리와 생성 결과를 비교해 백엔드를 선택한다. 선택한 경로의 솔로·다인 proof를 검수한 뒤 전체 샷으로 확장하며, ComfyUI를 쓰면 실제 workflow JSON·노드 버전·모델/이미지 지문·seed를 함께 보존한다. native 로컬 I2V와 별도 유료 API enhancer를 구분하고, 로컬 제작 위임을 cloud/API 호출이나 미승인 모델 다운로드로 확대하지 않는다.

## 2.3 호환·과거 작업의 공식 근거

- [LTX 2.3 프롬프트 가이드](https://ltx.io/blog/ltx-2-3-prompt-guide): 피사체·행동·환경·빛·카메라·오디오의 구체적 자연어, 현재형 한 문단, 피사체 상대 카메라 이동. I2V는 이미지를 출발점으로 다음 동작에 집중한다. 자연어가 정확한 프레임 스케줄러는 아니다.
- [2.3 모델 카드, revision 3c6a4e66](https://huggingface.co/Lightricks/LTX-2.3/blob/3c6a4e66e5d0a684231950b9c74dd4ded7b6fadc/README.md): 22B dev/distilled 구분, 별도 Gemma 3, 프레임 `8k+1`·기본 공간 32 배수, 불완전한 프롬프트 준수 등 한계. distilled는 8-step/CFG=1 계약이며 dev의 guidance를 그대로 적용하지 않는다.
- [공식 2.3용 ComfyUI 예제](https://github.com/Lightricks/ComfyUI-LTXVideo/blob/44c8a36b7c31ee00b4271daed11dc2a4aa481140/example_workflows/2.3/LTX-2.3_T2V_I2V_Two_Stage_Distilled.json): workflow 이름만 보고 checkpoint를 추정하지 않는다. dev+distillation LoRA 조합도 있다.
- [upstream 크기 검증](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-pipelines/src/ltx_pipelines/utils/helpers.py#L674-L686): 2단계는 64 배수, 단일 단계는 32 배수. 실제 adapter의 추가 제약이 우선이다.
- [2.3 Dub-It IC-LoRA](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-DubIt): 별도 lip-dubbing 구성이다. 기본 T2V/I2V를 기존 한국어 노래의 정확한 립싱크 증거로 쓰지 않는다.

현재 공식 main/docs의 기본 모델은 2.5로 바뀌었다. [Legacy 2.3](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/README.md) 기준을 확인한다. Gemma 4, 자동 DurationHead, 2.5 전용 VAE·LoRA·업스케일링 예제를 2.3로 옮기지 않는다. upstream/CUDA/ComfyUI/API 옵션이 MLX나 Road Music의 옵션이라는 뜻은 아니다.

## 현재 로컬 adapter

실제로 `--help`, `generate --help`, `a2v --help`를 읽은 실행 파일:

`/Users/freelife/.local/share/roadmusic-ltx23/src/.venv/bin/ltx-2-mlx`

`generate`는 T2V/I2V, `--prompt`, `--output`, `--model`, `--gemma`, `--seed`, `--height`, `--width`, `--frames`, 필수 `--frame-rate`, `--distilled`, `--low-ram`, `--no-audio`, 반복 `--image PATH [FRAME_IDX STRENGTH CRF]`를 노출한다. 실제 사용 전 재확인한다. `--no-audio`는 오디오 decode/mux를 생략하며 내부 모델의 공동 생성 경로 전체를 제거한다는 뜻은 아니다.

`a2v`는 beta이며 `--audio`·`--audio-start`를 노출한다. `lipdub`는 experimental이다. help의 존재만으로 2.3 checkpoint·LoRA 조합이나 한국어 가창·군무 품질을 검증했다고 하지 않는다. 특히 현재 help의 distilled A2V 설명은 2.5 workflow를 참조하므로 2.3 동작을 실험 없이 확정하지 않는다.

이 저장소의 과거 `Output/ltx23-playlist-demo-20261015/ltx-generation-result.json`에는 2.3 q4·Gemma 3·distilled·640×384·24fps·97프레임 무음 생성 성공이 기록되어 있다. 이는 과거 ambient 풍경의 기술 증거이며 인물·군무·립싱크 성공은 아니다. 현재 모델 파일과 revision을 따로 확인한다. 과거 출력 폴더를 실행 파일이나 최신 설정의 권위로 삼지 않는다.

새 실행은 확인한 로컬 모델을 명시한다. 원격 repo 이름·기본값으로 자동 다운로드를 유발하지 않는다. 실제 모델이 없으면 미설치로 보고하고 설치 요청 없이 받지 않는다. 키/비밀은 명령·장부에 넣지 않는다. argv 배열과 subprocess의 `shell=False`를 사용한다.

## 확인된 MLX 이미지 전처리 교착

macOS의 고정 adapter v0.16.3(`9e4a1a54194460547a103334b5e06382724fbba6`)에서 큰 참조 이미지의 CRF 압축 중 Python의 stdin 쓰기와 ffmpeg의 stderr 쓰기가 서로 막힌 사례가 있다. 로그 정지만으로 Metal 정지나 상위 stdout 문제로 단정하지 말고 실제 FD·하위 ffmpeg·전처리 소스를 연결한다.

[파일 stdin 패치](../assets/patches/ltx-pipelines-mlx-v0.16.3-file-stdin.patch)는 `media_io.py` 원본 SHA-256 `c8ce10b1c5976eba04a5a6b0f090b6f1b477ac22bf99fcc06c844d9ea4e0313c`용이다. 설치본을 덮어쓰지 않고 별도 패키지 사본에서만 적용·검증하며, 다른 원본에는 맹목 적용하지 않는다. FFmpeg argv·codec·CRF·오류 처리를 유지하고 네 bytes-input 호출의 stdin을 임시 일반 파일로 전달한다. 모델 옵션을 바꾸는 패치가 아니다.

채택 전 실제 참조 이미지의 CRF encode→decode, 모델의 두 작업 해상도·자료형·범위, 작은 baseline의 압축 bytes·복원 pixels, 잘못된 입력의 오류 전파를 제한 시간 안에 대조한다. 실제 import 경로와 패치 SHA를 새 실행에 결속하고, 코드 사전검사 통과와 LTX forward·최종 영상 품질 통과는 구분한다. 현재 실행의 입력·설치본을 수정하거나 실패한 동일 요청을 계속 재제출하지 않는다.

## 길이와 납품

전체 MV의 LTX 샷 생성은 [전체 연출](creative-direction.md)과 [이미지 선행 제작](image-preproduction.md)의 키시트·실제 이미지 스토리보드·원곡 애니매틱 독립 검수를 통과한 뒤 시작한다. `validate_preproduction.py`에 production-design/storyboard와 `--stage animatic --animatic-review ... --require-ready`를 적용한다. 키 단계는 미래 샷 이미지를 요구하지 않고, 무손실 애니매틱은 원본과 실제 PCM 신호가 같은지 확인한다. 기존 이미지-only 게이트의 준비 상태를 전체 MV 준비로 확대하지 않는다.

캐릭터시트·배경은 연출 참고이고, 실제 `--image`에는 샷 구도와 cast/location이 맞는 단일 프레임을 연결한다. `start_image_asset_id`와 선택적 `end_image_asset_id`를 실제 파일·해시에 해석하고 현재 로컬 help의 프레임 인덱스 형식으로 변환한다. asset ID 자체를 CLI에 전달하거나 이미지 파일 존재만으로 정체성/립싱크를 보장하지 않는다. 스토리보드의 다중 패널 페이지도 I2V 입력이 아니다.

I2V 프롬프트는 얼굴·헤어·의상·인원·공간의 일관성을 유지하면서 해당 샷의 움직임을 허용한다. 걷기나 난간에서 손 떼기를 계획하고도 발·손 접촉점과 화면 깊이를 고정하라고 쓰면 동작과 충돌한다. 시작 자세, 구체적인 작은 행동, 한 카메라 경로, 움직임 내내 설득되는 접촉·가림·그림자를 함께 적는다. `97/105` 같은 선택 전 표기 대신 실제 샷의 생성 프레임과 FPS로 계산한 길이를 사용한다.

생성 프레임은 `8k+1` 격자에 맞추고 편집 handle까지 포함한다. 납품에 필요한 프레임은 별도 계산한다. 예를 들어 24fps에서 97프레임 파일의 재생 길이는 보통 97/24초이고 마지막 프레임 PTS는 96/24초다. 모션 구간과 컨테이너 길이를 혼동하지 말고 ffprobe로 실측한다. 생성 FPS를 납품 FPS에 맞추려 무리하게 바꾸기보다 검증된 설정으로 생성 후 변환법을 명시한다.

파일이 생긴 것만으로 성공 처리하지 않는다. return code, 실제 stream·프레임 수·길이·decode, 정체성·물리·카메라·립싱크를 확인한다. 후보 예산을 초과하는 재시도를 하지 않는다.

## Road Music 연결

이 저장소의 `node cli/road-music.js schema`가 최종 입력 계약이다. 조회 시 `video:render`·`video:preview`·`video:configure`·`video:background`가 있었으며 **LTX 생성·샷 타임라인·카메라·장면 전환 명령은 없었다**. 지원하지 않는 `ltx:generate` 같은 명령을 만들지 않는다.

기존 공개 스키마는 배경 영상·이미지, 720p~2160p, 30/60fps, CPU/GPU, 스펙트럼·CD·오버레이·트랙리스트·EQ를 지원한다. 실제 요청 전에 해당 version schema를 읽는다. LTX 샷과 다중 장면은 외부 생성·편집으로 만들고 최종 영상만 앱의 배경 입력으로 전달한다. 원곡은 목록의 실제 절대 `dir`·`audio`를 쓴다.

`video:render`는 명령 자체의 완료 JSON을 확인한다. stdout 한 줄 JSON, 진행 JSONL은 stderr다. renderer 작업 중 프로젝트·언어·곡 목록 등 화면 상태를 바꾸는 명령을 섞지 않는다. `uncertain:true`에는 자동 재제출하지 않는다.

작곡·엔진·앱 코드 변경, 설치·중단·라이브러리 이동은 이 MV 스킬의 자동 부수 작업이 아니다. 분석용 ffmpeg·브라우저는 공개 CLI에 없는 앱 기능을 우회하는 용도로 쓰지 않는다.
