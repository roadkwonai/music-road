# YuE2 CLI 구현 계획

1. 완료: 공식/MLX 계약·현재 CLI·재사용 artifact 조사, 변경 전 스냅샷 보존.
2. 구현 완료: Python 16옵션 공통 검증/매핑 및 runtime 지원 (extend_yue_worker_controls).
3. 구현 완료: 정확한 plan/semantic/latent 재사용 helper (implement_yue_stage_reuse).
4. 구현 완료: 공식 ABC 점검·불변조건 비교·별도 전사 adapter (implement_yue_score_tools).
5. 구현 완료: 공용 스킬·모델별 workflow/선택 근거·16옵션·실제 검수 지침 (design_yue_complete_skill).
6. 완료: 공개 schema/입력 사전검사/악기·편곡 조합/CLI 라우팅/queue 연결, 동료 결과 통합.
7. 완료: 모델 없는 회귀 및 실제 공개 CLI 격리 smoke, 독립 검수·forward-test. 최대 seed와 16개 옵션의 실제 계획 저장값·공개 취소도 확인.
8. 완료: 기존 MLX로 실제 비교 음원 8개, 실패·복구·기술/악보·전곡 ASR 8건·문맥 ASR 2건 검수. 직접 청취는 도구 미지원으로 미확인.
9. 완료: 전체 307/307·JS 구문·Python 검사·스킬 validator·독립 코드 검수. 결과·한계는 `docs/yue-cli-validation.md`에 기록.

모든 작업자는 소유 파일만 수정하고 기존 사용자·동료 변경을 보존한다. 변경 전 자료 /private/tmp/road-music-yue-expansion-20261019/before/.

검증별 합격 기준: (a) 구조화4/16/중복 악기가 trio로 오표기되지 않고 원문/최종tag손실을 보고·차단 (b) 16옵션·63bitseed·기본값/최소최대·범위가 JS/Python 동일 (c) plan CFG/semantic, synth ODE/query/LoRA, decode VAE 외의 override 거부 (d) source manifest 변조/출력겹침/symlink/parent escape 오류 시 source 불변 (e) 각 단계 취소 후 자식 process gone, terminal1개, partial 보존 (f) capability missing-runtime/precision/SheetSage2가 설치·다운로드로 이어지지 않음 (g) 실제8개 기록의 파일/실효설정/시간/peak/truncation 확인. 부족한 실제청취·Windows실기는 별도 미확인으로 남긴다.
