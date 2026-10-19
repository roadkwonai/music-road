# YuE2 전체 제작 CLI 설계

요청: 공식 YuE2·고정 MLX 포트의 작곡·악보·샘플링·편곡·단계 재사용을 AI가 공개 CLI와 공용 스킬로 설계하고 검수하며, 실제 음원 반복 시험으로 품질과 비용을 비교한다. 기존 ACE·YuE Windows·프로젝트·승인 원문·진행 작업을 보존한다.

## 범위와 경계

- 공식 SongRequest, ABC/semantic Sampling 각 7개, CFG, ODE 전부 지원한다. legacy advanced 이름을 유지하고 6개 누락 필드를 추가한다. 원생이 고정한 midpoint/context는 임의 선택지로 만들지 않는다.
- 악기 37종 선택의 3개 제한을 16개로 넓히며 자유 악기 이름/역할/주법/구간의 구조화 방향을 style로 변환한다. 보컬/다이내믹/믹스도 짧은 태그로 변환한다. 악기별 믹서·스템·가수 고정·음소 강제 기능을 새로 주장하지 않는다.
- song:prepare는 서비스·설치·생성 없이 실제 전처리, 손실 경고, 옵션 기본값/덮어쓰기와 원생 요청을 반환한다. 손실된 핵심 style을 조용히 생성하지 못하게 한다.
- yue:capabilities는 엔진별 지원·미지원·옵션·runtime·설치 필요 조건을 조회한다. 실측 성능과 가용성은 구분한다.
- song:replay는 기존 곡을 원본으로 새 작업을 제출한다. plan은 정확한 ABC token/prefix를 유지, synthesize는 semantic+noise를 유지, decode는 latent를 유지한다. 서로 의미 없는 override는 거부한다. source manifest·해시 검사 실패는 생성 전 차단한다.
- score:inspect/compare는 고정 공식 ABC helper를 사용한다. score:transcribe는 명시한 별도 기설치 SheetSage2 Python/model과 로컬 오디오만 사용한다. 모델을 새로 설치/다운로드하지 않는다.
- runtime은 MLX precision, memory guard, VAE tile/query chunk, AC 보호, 로컬 decoder/LoRA를 선택적으로 전달한다. 기본은 기존 8bit·16GiB·ODE32·AC 보호다. Windows 미지원 runtime은 명시 거부한다. 출력은 새 폴더, 소스와 겹치지 않는다.

## 공개 인터페이스

song:generate의 기존 JSON을 보존하며 advanced 16개, runtime 객체, parts.instrumentation/vocal/dynamics/mix를 추가한다. song:prepare는 같은 입력을 받는다. song:replay={dir,stage:plan|synthesize|decode,title?,advanced?,runtime?}. score:inspect={text|file}; score:compare={source:{text|file},candidate:{text|file},invariants?}; score:transcribe={audio,output,python,modelDir,melodyOnly?,task?}.

## 검증과 완료 조건

계약/경계/위조·변조/원문 보존/불변조건의 단위 테스트, 실제 CLI schema·prepare·capabilities·inspect/compare·미설치 전사 오류, 격리 프로필의 queue/job wait/cancel/replay를 검증한다. 기존 설치된 M1 Ultra 64GB MLX 모델만 재사용해 2장르 고정 자료의 여러 설정과 같은 캐시 단계 비교를 순차 수행한다. 생성·실패·복구 시간, 실제 길이, EOS/잘림, 파일 디코드·클리핑/음량 및 무유도 ASR를 기록한다. 직접 청취가 불가능한 도구 범위에서는 청취 미확인을 별도 표시하고 ASR를 음질·가창 점수로 대체하지 않는다. 무한 반복과 최상 품질 보장은 하지 않는다. 결과 회귀나 메모리 압력은 원인 하나를 확인해 제한된 재시도하고 새 근거가 없으면 안정 후보를 유지한다.

별도 요청 없는 commit/push/release·기존 GUI 종료·모델 이동·새 전사/추론 모델 설치는 하지 않는다.

## 확정 지원·옵션 행렬

| 경로 | 16 sampling/CFG/ODE | 런타임 | 단계 재사용 | 검증 범위 |
| --- | --- | --- | --- | --- |
| Windows NVIDIA yue | 모두 전달·동일 경계 검사 | 현재 공개 runtime 객체 거부 | 현재 없음, 명시 unsupported | mock pipeline와 공유 매핑; Windows 실장비 미검증 |
| Apple Silicon yue-mlx | 모두 전달·동일 경계 검사 | 설치된 precision/로컬 VAE/LoRA/메모리/AC/query/tile | 정확한 plan, synthesize, decode | 기존 M1 Ultra64 모델로 실제 시험 |
| score 도구 | 악보 inspect/compare/strip-chords는 동봉 고정 공식 표준라이브러리 helper, 엔진 불필요 | Python 필요 | 원본 읽기 전용 | text/file 정확히 하나·보존 조건 검사 |
| SheetSage2 | 음악 ABC/MIDI 전사(가사 ASR 아님) | 명시한 별도 Python3.10/3.11+로컬 모델, 항상 offline | 새 출력만 | 미설치 available:false, fixture 성공/실패/취소; 실제 모델 미설치 |

계획 재사용의 advanced 허용은 semantic 7개·CFG·ODE이며 ABC sampling 변경은 거부한다. synthesize는 ODE만, decode는 advanced 전부 거부한다. 공통 memoryBudgetGiB/requireAc와 후속 decoder의 vaePath/vaeCoreFrames는 각 단계에서 유효하다. synthesize는 NAR query/LoRA를 허용하지만 AR precision 명시는 거부한다. decode는 precision/query/LoRA를 거부한다. 나머지 무효 옵션을 성공처럼 기록하지 않는다. 원본/출력 경로 중첩·덮어쓰기·변조 manifest·부모 탈출은 차단하며 취소는 자식 terminate→kill→reap 뒤 terminal 이벤트 하나만 남긴다.

Road Music의 AR8bit는 기존 호환 기본값이며 공식 MLX의 BF16 MVP 기본·8/4bit 실험 상태와 구분한다. 4bit 변환물이 없으면 선택을 차단하고 자동 변환/다운로드하지 않는다. 실제 개발 검증은 2장르×8bit seed2=4곡, 같은 plan/seed의 BF16 비교 각1=2곡, synthesize/decode 재사용 각1로 최소8개다. 이 수는 이번 개발 검증의 계약이며 일반적인 1곡 요청의 기본 생성 수량으로 확대하지 않는다. 새로운 원인 없는 반복은 중단한다. 메모리 압력은 원인1개를 교정해 1회만 재시도하며 M1 Ultra64에서 BF16이16GiB guard에 걸리면24GiB로 복구한 비용과 한계를 별도 보고한다.

모든 실제 결과는 48kHz stereo·전체 디코드·유한 신호·길이·EOS/잘림·클리핑/음량·시간/메모리·원본 해시를 기록한다. 기존 로컬 Whisper의 무유도 전사와 CER는 가사 진단이지 음질·여성 보컬·음정·리듬의 청취 판정이 아니다. 직접 청취 도구가 없으면 최상 음질을 확정하지 않으며 비교 음원과 확인 가능한 기술 후보를 제공한다.
