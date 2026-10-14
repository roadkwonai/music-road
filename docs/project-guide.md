# Road Music 프로젝트 안내

Road Music은 ssokMusic Free 1.3.0(MIT)을 바탕으로 Apple Silicon 지원과 AI용 CLI를 추가한 로컬 음악 제작 앱이다. 원저작자와 수정 사항의 고지는 [LICENSE](../LICENSE)에 있다.

## 기능과 사용 흐름

- 가사·스타일·악기·BPM·길이로 보컬 또는 연주곡을 생성한다. 한 요청에서 최대 8곡을 대기열에 제출할 수 있다.
- ACE-Step으로 짧은 효과음, 기존 곡 오디오 커버, 녹음 파일 기반 음악을 만든다.
- 가사 구간 태그·점검·숫자 읽기 변환, 프로젝트·곡·프리셋 관리, 음악 파일 가져오기, MP3/WAV/SRT·앨범 내보내기를 제공한다.
- 플레이어와 생성 대기열을 제어한다. 일시정지·실패 재시도·순서 변경·재시작 복원을 지원한다.
- 이미지·영상 배경, 스펙트럼 4종, 7밴드 EQ, 로고·트랙리스트, 반복 길이, 720p–4K·30/60 FPS 영상과 챕터를 만든다.

CLI 작업 순서는 [빠른 시작](quickstart.md), 전체 앱 동작은 [상세 가이드](guide.md)에 있다.

## 지원 범위와 엔진

현재 제공하는 DMG는 Apple Silicon용이다. ACE-Step 생성과 CPU/GPU 영상 렌더를 macOS에서 검증했다. Windows/Linux·실제 마이크·장시간 최대 길이 작업은 [검수 결과의 미검증 범위](cli-qa-report.md#미검증과-남은-한계)를 따른다.

| 엔진 | 용도 | macOS Apple Silicon | 라이선스 고지 |
| --- | --- | --- | --- |
| ACE-Step 1.5 | 음악 생성, 커버, 녹음 파일, 효과음 | 지원 | MIT |
| YuE2 | ABC 작곡·소리 합성 및 해당 전용 기능 | 지원하지 않음 | 코드·가중치 CC BY-NC 4.0 |

엔진·모델은 앱이 따로 다운로드하며 저장소나 DMG에 포함되지 않는다. Node.js는 CLI·소스 실행·빌드에 필요하고, `ffmpeg`와 `ffprobe`는 변환·영상에 필요하다. 준비물과 설치는 [CLI 설치](cli-install.md)를 참고한다.

## 코드 구조

```text
cli/client.js → 로컬 socket/pipe → electron/cli-transport.js
  → 공개 스키마·기존 IPC → electron/main.js / renderer/cli-api.js
  → Python 음악 워커 / 오프라인 FFT·Canvas·ffmpeg 영상
```

`cli/`는 JSON/JSONL과 서비스 시작·작업 대기를 담당한다. `electron/`는 앱·파일·엔진·대기열, `renderer/`는 화면과 제한된 자동화, `python/`는 음악 워커다. CLI는 임의 JavaScript 실행이나 원격 제어 TCP 서버를 제공하지 않는다. 영상 프레임 전송에는 토큰을 검증하는 임시 loopback HTTP 서버를 사용할 수 있다. 자세한 경계는 [CLI 설계](cli-design.md)에 있다.

## 외부 통신

로컬 음악 제작 외에 다음 통신이 있다. API 주소는 공개 서비스 주소이며 인증 토큰을 저장소에 넣지 않는다.

| 목적 | 대상 |
| --- | --- |
| 엔진 설치 | GitHub·PyPI·Hugging Face에서 소스·도구·모델 다운로드 |
| 업데이트 조회 | `roadkwon.dev/api/version` |
| 공지 조회 | `roadkwon.dev/api/notices` |
| 사용자가 요청한 오류 신고 | `roadkwon.dev/api/inquiries` |
| 패키징된 앱의 설치 집계 | `roadkwon.dev/api/installs/ping` |

오류 신고에 로그를 붙이면 곡 제목 등 실행 기록이 포함될 수 있다. AI는 외부 전송을 사용자의 명시적 요청 범위에서만 실행한다. CLI 자체에 OpenAI API 키나 MCP 설정은 필요하지 않으며, 호출하는 AI 도구의 설치·인증은 별도다.

## 개발과 배포

Node 의존성은 `npm ci --include=dev`로 설치한다. `npm test`는 동작·회귀·문서·패키지 검사를 실행한다. `npm start`는 GUI, `npm run dist:mac`은 DMG, `npm run dist:cli`는 소스 키트 ZIP을 만든다. 빌드·서명·공증과 확인 항목은 [패키징 가이드](packaging.md)를 따른다.
