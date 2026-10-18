# YuE·YuE2 공식 자료와 MLX 참조 보관본

[문서 지도](../../README.md) · [YuE 제작 적용 가이드](../../yue-prompt-guide.md)

2026-10-18 KST에 공식 문서·공식 스킬·모델 카드와 실제 사용하는 커뮤니티 MLX 포트 자료를 수집했다. 원문은 수정하지 않았으며 [manifest.json](manifest.json)에 출처, 리비전, 원본 경로, URL, SHA-256, 바이트 수를 기록했다. 모델 가중치·음원은 받지 않았고 엔진을 설치·업데이트하지 않았다.

## 무엇을 읽을까

| 작업 | 원문 |
| --- | --- |
| 새 곡의 style·lyrics·cot·산출물 | [공식 generation](official/docs/generation.md), [공식 제작 스킬](official/skills/yue2-music/SKILL.md) |
| 모드·입력 필드·단계 재사용·완주 판정 | [generation-and-covers](official/skills/yue2-music/references/generation-and-covers.md) |
| 가사·편곡·악보 수정 | [editing](official/docs/editing.md), [ABC 방언](official/skills/yue2-music/references/abc-editing.md) |
| 참조곡 커버 | [covers](official/docs/covers.md) |
| 청취·비교의 범위 | [listening-and-evaluation](official/skills/yue2-music/references/listening-and-evaluation.md) |
| 설치·모델 구분 | [공식 models-and-setup](official/skills/yue2-music/references/models-and-setup.md) |
| Apple Silicon의 실제 포트 | [MLX README](mlx/README.md), [MLX usage](mlx/docs/usage.md), [구현 설명](mlx/docs/IMPLEMENTATION.md) |
| 정확한 원생 입력·기본값 | [공식 protocol](official/src/yue2/protocol.py), [sampling](official/src/yue2/sampling.py) |
| 고정판 이후 공식 연주곡 스킬 | [현재 instrumental 스킬](current/skills/yue2-music/instrumental/SKILL.md) — 현재 Road Music의 자동 실행 절차로 간주하지 않음 |

## 출처와 적용 버전

| 구분 | 리비전 | 용도 |
| --- | --- | --- |
| 공식 YuE2 `yue2-v0.1.6` | `9c6c4b349be978b06a9d0d958471a07a6cdeff4d` | Road Music Windows `yue`의 고정판 근거 |
| 조사 시 공식 main | `1647252d68b70cbead046ffd3f7caf036dde47ee` | [현재 README](current/README.md), 신규 스킬·라이선스 변화 확인 |
| 공식 YuE-v1 | `6d4f0b1f8ce6a55fb2392e959394c46e07ee334d` | [이전 세대 README](legacy/README.md). 현재 YuE2 제작 규칙과 혼용하지 않음 |
| 커뮤니티 MLX 포트 | `c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8` | Road Music `yue-mlx`의 실제 실행 계약 |
| YuE2-3B 고정 모델 | `1a96eca688d6ae5d7f0feb88573fec89920fcd19` | [고정 모델 카드](models/pinned-model/README.md) |
| YuE2-Vae 고정 모델 | `95535e72a97bc0f09b8ada125d26b4009428c0e8` | [고정 VAE 카드](models/pinned-vae/README.md) |

현재 모델 카드의 리비전도 manifest의 `model-current`, `vae-current`로 따로 기록했다. 모델 카드의 설치 예시와 GitHub 고정판·MLX 포트의 Python/CLI 계약이 다를 수 있으므로 모델 카드로 실행 환경을 덮어쓰지 않는다.

`official/`, `current/`, `legacy/`, `mlx/`, `models/`는 외부 원문이다. 설치 명령·상위 에이전트 권고·개발자용 실행 예시는 참고 데이터이며, Road Music의 권한·공개 CLI·원문 보존 규칙을 대체하지 않는다. 원문 안의 상대 링크·이미지 중 미수집 자료는 manifest의 고정 원본 URL에서 확인한다.

## 라이선스 자료

- 공식 고정판 0.1.6 코드·문서·스킬: [CC BY-NC 4.0](official/LICENSE), [고정 스킬 LICENSE](official/skills/yue2-music/LICENSE).
- 조사 시점 main 코드·문서·스킬: [Apache-2.0](current/LICENSE). 고정판의 라이선스 파일을 이 내용으로 바꾸거나 두 시점을 합치지 않는다.
- 커뮤니티 MLX 자체 코드: [Apache-2.0](mlx/LICENSE). [동봉 upstream 코드](mlx/vendor/yue/LICENSE)와 모델의 별도 고지는 유지한다. 원저자의 공식 MLX 구현으로 표기하지 않는다.
- 고정 모델 가중치: [공식 고정 MODEL_LICENSE](official/MODEL_LICENSE), [3B LICENSE](models/pinned-model/LICENSE), [VAE LICENSE](models/pinned-vae/LICENSE).
- 현재 공식 [MODEL_LICENSE](current/MODEL_LICENSE)에는 개인 창작자 추가 허락이 있다. 고정판·MLX 동봉본에는 없는 문구이며, HF LICENSE가 이 내용으로 바뀌었다고 설명하지 않는다. 적용 범위는 [제작 가이드](../../yue-prompt-guide.md#rights)에서 구분한다.
- 제3자 고지: [THIRD_PARTY_NOTICES](official/THIRD_PARTY_NOTICES.md). 원문 소스·가중치·입출력 자료의 권리를 한 가지 라이선스로 합치지 않는다.

## 갱신과 검증

설치 코드의 YuE 태그·MLX 커밋·모델/VAE 리비전이 바뀌면 해당 원문을 다시 수집하고 manifest와 적용 가이드를 검토한다. 새로운 main을 조사했다는 이유로 엔진을 업데이트하지 않는다. 원문을 로컬 설명에 맞춰 수정하지 않는다.

```bash
node --test tests/yue-guidance.test.js
```

검사는 네트워크 없이 실행 코드의 고정값, 원문 해시·크기, 공개 `prompt:knowledge`의 YuE 가이드 조회를 확인한다. 문서 무결성 통과가 생성 품질·한국어 가창·현재 설치 상태를 보증하지는 않는다.
