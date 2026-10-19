# YuE2 Apple Silicon

[Road Music](../README.md) · [문서 지도](README.md) · [음악 생성 옵션](music-options.md)

`yue-mlx`는 Apple Silicon 맥에서 YuE2-3B를 MLX로 실행하는 Road Music 엔진 ID다. 기존 `yue`는 Windows NVIDIA CUDA용 YuE2로 유지한다. 두 경로의 모델·실행 환경·메모리 조건을 섞어 쓰지 않는다.

가사·style·cot·ABC·길이·완주 검수는 [YuE 제작 적용 가이드](yue-prompt-guide.md)와 [고정 공식·MLX 원문](vendor/yue2/README.md)을 읽는다. MLX는 공식 가중치를 사용하는 커뮤니티 포트이며, 이 문서는 Road Music의 설치·운영 조건을 다룬다.

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

32GB Mac은 아직 Road Music에서 실측하지 않았다. 다른 앱을 닫고 한 번에 한 곡으로 시작한다. 생성은 기본적으로 전원 연결을 요구하므로 배터리만으로 실행하면 작업이 시작되지 않을 수 있다. 설치·생성 중 메모리 압력 보호가 중단을 보고하면 실제 OOM으로 단정하지 않는다. 완료된 곡은 보존하고 `service:status`, `queue:list`, `songs:list`으로 실행 상태부터 확인한다. 앱의 재시도와 `song:resume`은 새 생성 시도가 될 수 있으므로 승인된 재시도 범위에서만 실행한다.

MLX 런타임·변환 모델·VAE·캐시는 선택한 앱 데이터 위치 아래 `engines/yue-mlx/`에 함께 둔다. 이 경로는 기존 Windows NVIDIA `yue`의 Hugging Face 캐시를 옮기는 **모델 위치 옮기기**와 별개다. MLX 설치 후 기존 캐시 이동 기능으로 이 파일을 옮기지 않는다.

MLX 런타임은 `mlx-Yue` 커밋 `c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8`을 기준으로 하며, 기본 생성은 AR 8bit·NAR BF16·ODE 32단계를 쓴다. 비교 과정에서 시험한 CFG·샘플링 값은 품질 향상이 입증된 기본값이 아니다.

## 곡 생성

먼저 [검토·자동 생성 규칙](music-review.md)을 적용한다. 한국어 제목 또는 가사가 있으면 [한국어 검수](music-review.md#korean-review)를 해당 항목에 수행하며, 한국어가 없거나 연주곡의 가사·후렴이면 해당 없음으로 표시한다. AI 초안의 어색한 표현은 허용 범위에서 수정·재검수하고 사용자 제공·승인 원문은 임의로 바꾸지 않는다. 자동 위임도 적용 대상의 검수를 생략하지 않는다. 기술 검증에는 YuE2 MLX의 공개 입력 계약을 사용하며 ACE 입력 한계를 적용하지 않는다.

`song:generate`에 `engine:"yue-mlx"`를 지정한다. 반환된 `jobId`는 반드시 `job:wait`으로 완료를 확인한다.

```bash
node cli/road-music.js song:generate --events --json '{"title":"YuE2 Apple Silicon 예시","engine":"yue-mlx","style":"Korean emotional ballad, piano and strings","lyrics":"[Verse]\n창가에 남은 빛을 보며\n[Chorus]\n오늘도 너를 부른다","targetSeconds":180,"seed":42,"mode":"song","cot":"full"}'
```

```bash
node cli/road-music.js job:wait --events --json '{"jobId":"반환된-jobId","timeoutMs":3600000}'
```

`mode:"plan"`과 `abc` 입력은 YuE2의 악보 계획 경로다. `targetSeconds`는 `yue-mlx`에서 20~360초 범위의 유효한 요청값이지만, 모델 SongRequest에는 전달하지 않고 메타데이터의 기록·비교용 목표로만 남긴다. 생성은 자연 EOS를 목표로 하며 토큰 예산 소진 시 잘릴 수 있으므로 `truncated.abc`·`truncated.semantic`과 실제 오디오 길이를 확인한다. 길이를 맞추려고 새 프롬프트를 덧붙이거나 가사·오디오를 자르거나 최소 토큰을 임의로 추가하지 않는다. 완료 응답의 실제 파일·길이와 입력을 함께 확인한다.

가사 수정에서는 [악보 선택 기준](yue-prompt-guide.md#score-choice)을 적용해 새 계획과 기존 ABC 재사용을 구분한다. 선율 고정 요구가 없고 가사 반영이 우선이면 새 악보를 우선 검토하며, 명시한 원곡 선율·제공 악보 보존은 우선한다. 완료 후 [전곡·구간 가사 검수](yue-prompt-guide.md#lyrics-verification)로 입력·악보 경로·파일 검사·자동 전사·직접 청취의 근거를 분리한다. 한 번의 성공 사례의 CFG나 구간 길이는 보편적 기본값이 아니다.

## 라이선스와 검증 한계

고정 YuE2 모델 가중치의 [CC-BY-NC 4.0](vendor/yue2/models/pinned-model/LICENSE)과 MLX 자체 코드의 [Apache-2.0](vendor/yue2/mlx/LICENSE)을 구분하고 동봉 upstream의 고지를 유지한다. 2026-10-18 확인한 공식 [MODEL_LICENSE](vendor/yue2/current/MODEL_LICENSE)에는 개인 창작자에게 responsible-use 조건을 전제로 생성물 수익화를 허용하는 추가 조항이 있다. 회사의 모델 상업 이용·가중치 재배포·제3자 권리에 같은 허락을 추론하지 않는다. 고정 파일과 현재 공식 조항의 시점·범위는 [제작 가이드](yue-prompt-guide.md#rights)에서 확인하며, HF 고정 LICENSE 자체가 변경됐다고 설명하지 않는다.

2026-10-16 M1 Ultra 64GB 비교 기록은 [모델별 제작·비교](model-production-guide.md#2026-10-16-비교에서-확인한-범위)에 남아 있다. 그 실험은 현재 제품 통합 지원의 품질 보증이나 M1 Max 32GB 실측이 아니다.
