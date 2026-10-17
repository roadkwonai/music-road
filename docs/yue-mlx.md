# YuE2 Apple Silicon

[Road Music](../README.md) · [문서 지도](README.md) · [음악 생성 옵션](music-options.md)

`yue-mlx`는 Apple Silicon 맥에서 YuE2-3B를 MLX로 실행하는 Road Music 엔진 ID다. 기존 `yue`는 Windows NVIDIA CUDA용 YuE2로 유지한다. 두 경로의 모델·실행 환경·메모리 조건을 섞어 쓰지 않는다.

## 설치와 확인

앱에서는 `설정 · 도구 → AI 엔진`에서 **YuE2 Apple Silicon**을 선택해 설치한다. 미설치 엔진을 곡 만들기 화면에서 선택하면 같은 설치 화면이 열린다.

CLI 설치는 실제 모델 다운로드와 디스크 사용을 일으킨다. 설치 요청을 받은 경우에만 다음 명령을 실행한다.

```bash
node cli/road-music.js engines:install --events --json '{"id":"yue-mlx"}'
```

설치 전후에는 현재 설치본이 지원하는 ID와 상태를 확인한다.

```bash
node cli/road-music.js engines:list
node cli/road-music.js schema --json '{"command":"engines:install"}'
```

## 지원 환경과 메모리

| 조건 | 요구 사항 |
| --- | --- |
| 일반 Apple Silicon | M1 이상, macOS 14.2 이상, 통합 메모리 32GB 이상 |
| 권장 메모리 | 64GB 이상 |
| M5 Mac | macOS 26.2 이상 |
| 전원 | 곡 생성 중 전원 어댑터 연결 필요 |
| 저장 공간 | 설치 위치에 최소 30GB 여유 공간 |

32GB Mac은 아직 Road Music에서 실측하지 않았다. 다른 앱을 닫고 한 번에 한 곡으로 시작한다. 생성은 기본적으로 전원 연결을 요구하므로 배터리만으로 실행하면 작업이 시작되지 않을 수 있다. 설치·생성 중 메모리 압력 보호가 중단을 보고하면 실제 OOM으로 단정하지 않는다. 완료된 곡은 보존하고 앱의 재시도 또는 `song:resume`으로 상태를 확인한다.

MLX 런타임·변환 모델·VAE·캐시는 선택한 앱 데이터 위치 아래 `engines/yue-mlx/`에 함께 둔다. 이 경로는 기존 Windows NVIDIA `yue`의 Hugging Face 캐시를 옮기는 **모델 위치 옮기기**와 별개다. MLX 설치 후 기존 캐시 이동 기능으로 이 파일을 옮기지 않는다.

MLX 런타임은 `mlx-Yue` 커밋 `c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8`을 기준으로 하며, 기본 생성은 AR 8bit·NAR BF16·ODE 32단계를 쓴다. 비교 과정에서 시험한 CFG·샘플링 값은 품질 향상이 입증된 기본값이 아니다.

## 곡 생성

먼저 [원문 보존과 근거 기반 추천](music-review.md#preserve-input)과 [검토·자동 생성 규칙](music-review.md)을 적용한다. AI 초안의 어색한 표현은 허용 범위에서 수정·재검수하고, 사용자 제공·승인 원문은 임의로 바꾸지 않는다. 자동 위임도 한국어 검수를 생략하지 않는다.

`song:generate`에 `engine:"yue-mlx"`를 지정한다. 반환된 `jobId`는 반드시 `job:wait`으로 완료를 확인한다.

```bash
node cli/road-music.js song:generate --events --json '{"title":"YuE2 Apple Silicon 예시","engine":"yue-mlx","style":"Korean emotional ballad, piano and strings","lyrics":"[Verse]\n창가에 남은 빛을 보며\n[Chorus]\n오늘도 너를 부른다","targetSeconds":180,"seed":42,"mode":"song","cot":"full"}'
```

```bash
node cli/road-music.js job:wait --events --json '{"jobId":"반환된-jobId","timeoutMs":3600000}'
```

`mode:"plan"`과 `abc` 입력은 YuE2의 악보 계획 경로다. `targetSeconds`는 `yue-mlx`에서 20~360초 범위의 유효한 요청값이지만, 모델 SongRequest에는 전달하지 않고 메타데이터의 기록·비교용 목표로만 남긴다. 생성은 자연 EOS로 끝나므로 실제 오디오 길이를 보고한다. 길이를 맞추려고 새 프롬프트를 덧붙이거나 가사·오디오를 자르거나 최소 토큰을 임의로 추가하지 않는다. 완료 응답의 실제 파일·길이와 입력을 함께 확인한다.

## 라이선스와 검증 한계

YuE2 모델은 [CC-BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 비상업 조건을 따른다. MLX 런타임은 [Apache-2.0](https://github.com/vanch007/mlx-Yue/blob/c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8/LICENSE)이다. 배포·상업 이용 전에는 각 모델과 런타임의 최신 고지·적용 범위를 별도로 확인한다.

2026-10-16 M1 Ultra 64GB 비교 기록은 [모델별 제작·비교](model-production-guide.md#2026-10-16-비교에서-확인한-범위)에 남아 있다. 그 실험은 현재 제품 통합 지원의 품질 보증이나 M1 Max 32GB 실측이 아니다.
