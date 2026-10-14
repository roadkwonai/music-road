# Road Music CLI 설계와 범위

[Road Music](../README.md) · [문서 지도](README.md) · [릴리스 노트](../releases/README.md)

Road Music CLI는 GUI 기능을 새로 구현하지 않는다. 실행 중인 Electron 앱의 기존 IPC와 제한된 renderer 자동화 명령을 로컬 JSON Lines 전송으로 호출한다.

```text
node cli/road-music.js
  → cli/client.js: 인수·JSON/JSONL·자동 시작·stdout/stderr
  → 사용자 데이터 폴더별 Unix socket 또는 Windows named pipe
  → electron/cli-transport.js: 요청·경로·확인·작업 대기
  → electron/cli-catalog.js: 공개 명령 스키마와 IPC 매핑
  → electron/main.js 또는 renderer/cli-api.js
  → 기존 음악 워커, 설정·라이브러리, Canvas 영상 스튜디오
```

## 목차

- [공개 계약](#toc-1)
- [안전 경계](#toc-2)
- [서비스와 동시성](#toc-3)
- [검증 범위](#toc-4)

<a id="toc-1"></a>

## 공개 계약

- `cli:schema`는 공개 명령, JSON 매개변수 스키마, 열거값과 범위를 반환한다. 문서보다 현재 설치 버전의 스키마가 우선한다.
- 일반 응답은 stdout JSON 한 줄이며, `--events`를 쓴 진행 이벤트만 stderr JSON Lines다.
- 단일 요청은 JSON 객체, 배치는 JSON Lines를 사용한다. CLI는 임의 JavaScript 실행을 노출하지 않는다.
- 요청은 같은 데이터 폴더의 GUI 인스턴스와 곡 라이브러리·설정·생성 대기열을 공유한다.
- `song:generate`, `song:resume`, `song:render`만 `--wait`을 지원한다. 대기하지 않는 기본 호출은 작업 ID를 즉시 반환한다.
- 일반 타임아웃은 30초, 긴 명령은 1시간이다. `video:render`만 기본 24시간이며 Node 타이머의 최대값인 2,147,483,647 ms까지 지정할 수 있다. `job:wait.timeoutMs`는 1시간 이내의 정수이고 연결 전에 검증한다.

<a id="toc-2"></a>

## 안전 경계

- CLI 제어는 Unix 소켓 또는 Windows named pipe만 사용한다. Unix 소켓은 소유자와 권한을 검사하고 생성 시 `0600`으로 설정한다. 영상 렌더 중 프레임 전달은 성능을 위해 임시 `127.0.0.1` HTTP 서버를 사용하며, 렌더별 무작위 토큰을 검증한다. 이 서버를 쓸 수 없으면 기존 IPC 경로로 대체한다.
- 전송 계층은 `--input`/`--output`을 네이티브 파일 대화상자에 주입한다. 필요한 경로가 없으면 UI를 열지 않고 오류를 반환한다.
- 일반 파일 출력은 기존 파일을 거부하며 `--overwrite`일 때만 덮어쓴다. 곡 원본을 보호하기 위해 파일 내보내기는 곡 라이브러리 밖에만 쓸 수 있다.
- 파일 출력은 같은 폴더의 스테이징 파일을 완료 뒤 원자적으로 반영한다. 실패한 저장은 기존 출력 파일을 바꾸지 않는다. 지원하지 않는 입력·출력 플래그, 잘못된 출력 확장자, 심볼릭 링크 출력은 전송 계층에서 거부한다.
- 곡·커버·영상 트랙은 라이브러리 내부의 실제 곡 폴더여야 하고, 녹음·에셋도 각 앱 관리 루트 안이어야 한다.
- 배경·오버레이는 로컬 파일 경로 또는 호스트가 없거나 `localhost`인 `file:` URL만 받으며, 원격 URL과 Windows UNC 경로를 거부한다.
- 카탈로그의 파괴적 명령은 `--confirm` 없이는 실행하지 않는다. `cli:stop`은 진행 작업이 있을 때 `--confirm`이 필요하다.
- renderer 자동화는 `renderer/cli-api.js`의 고정 명령만 실행한다. 내부 프레임 전송 명령은 공개 스키마에서 제외한다.

<a id="toc-3"></a>

## 서비스와 동시성

클라이언트는 연결 실패가 `ECONNREFUSED` 또는 `ENOENT`일 때만 Electron 서비스를 시작하고 최대 30초 동안 소켓을 기다린다. `--no-start`, `service:status`, `service:stop`은 이 자동 시작을 끈다. `job:wait`만 남은 제한 시간 안에서 일시적 연결 끊김을 재시도한다. 생성·재개·악보 렌더·영상 렌더 요청은 처리 여부가 불명확할 수 있어 자동 재제출하지 않는다. 명시적으로 서비스를 중지하면 `SERVICE_STOPPED`을 반환하고 자동 재시작하지 않는다.

설정·라이브러리 변경, 생성 요청은 직렬화한다. 같은 출력 파일을 동시에 만드는 요청은 거부한다. renderer 작업은 일부 상태 조회/취소를 제외하고 동시에 하나만 실행한다. 대기열은 재시작 후 복원하며, 실패 작업은 최대 8개, 최근 결과는 최대 64개를 저장한다. 커버·녹음 원본은 재시도 작업이 참조하는 동안 보존한다. 생성·영상 작업과 시스템 상태는 환경 및 하드웨어에 의존한다.

<a id="toc-4"></a>

## 검증 범위

문서의 코드 블록은 CLI 인수 파서와 공개 카탈로그 스키마로 검증할 수 있게 작성한다. 실제 모델 설치·음악 생성·마이크 권한·GPU 인코딩은 이 문서만으로 보증하지 않는다. 통합 검증은 별도 환경과 하드웨어에서 수행하며, 결과는 실행 당시의 환경에만 적용된다.

명령 사용 순서와 응답 형태는 [CLI 사용법](cli.md), 매개변수 전체 목록은 [CLI 레퍼런스](cli-reference.md)를 따른다.
