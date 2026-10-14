# Road Music CLI 작업 지침

한국어로 응답한다.

이 저장소에서 Road Music CLI를 호출하거나 수정하는 AI 에이전트는 먼저 [CLI 설치와 AI 사용](docs/cli-install.md), [CLI 사용법](docs/cli.md), [CLI 레퍼런스](docs/cli-reference.md), [CLI 검수 결과](docs/cli-qa-report.md)를 읽는다. 실제 실행 버전에서는 `node cli/road-music.js schema`가 명령과 입력값의 최종 기준이다.

## 작업 순서

1. `app:state`, `engines:list`, `projects:list`, `songs:list`을 읽어 현재 상태를 확인한다.
2. 곡·프로젝트·내보내기 작업에는 목록 응답의 절대 `dir`과 `path`를 그대로 사용한다. 이름이나 추측한 경로로 대체하지 않는다.
3. 모든 최종 응답은 stdout JSON 한 줄로 읽고, `--events` 진행 JSONL은 stderr에서만 읽는다.
4. `song:generate`, `song:resume`, `song:render`은 먼저 받은 `jobId`를 `job:wait`으로 확인한다. 영상 렌더는 명령 자체의 완료 응답을 확인한다. 연결 오류에 `uncertain:true`가 있으면 자동 재제출하지 말고 `service:status`, `queue:list`, `songs:list`으로 실행 여부를 확인한다.

## 안전 경계

- `--confirm`이 필요한 삭제, 대기열 비우기, 진행 중인 서비스 중단, 모델·곡 라이브러리 이동은 사용자가 요청한 범위에서만 실행한다.
- 외부 전송·브라우저 열기·피드백 전송 명령은 사용자의 명시적 요청 없이는 실행하지 않는다.
- 사용자의 명시적 요청 없이 기존 GUI 작업·엔진 설치·생성·렌더를 종료하거나, 라이브러리·모델을 이동하지 않는다. 테스트는 `ROADMUSIC_DATA_DIR`로 분리한 임시 데이터 폴더에서 한다.
- 같은 출력 경로를 동시에 쓰지 않는다. 출력 파일은 실제 절대 경로를 사용하고, 기존 파일 덮어쓰기는 사용자가 요청한 경우에만 `--overwrite`를 쓴다.
- CLI는 공개 카탈로그 명령만 사용한다. UI 내부 IPC, 임의 셸 명령 또는 임의 JavaScript 실행으로 기능을 우회하지 않는다.
- renderer 기반 작업은 한 번에 하나만 실행한다. 영상 렌더·미리보기 중에는 언어·프로젝트·곡 목록처럼 화면 상태를 바꾸는 명령을 섞지 않는다.

## 설치와 실행

- GUI용 dmg는 `/Applications`로 복사해 실행한다. GUI만 사용할 때 Node.js는 필요 없다.
- CLI는 이 소스 키트에서 Node.js 24 LTS와 `npm ci --include=dev`가 필요하다. `node cli/road-music.js …`로 실행한다. Electron이 개발 의존성으로 선언되어 있어 실행 시에도 설치해야 한다.
- `npm link`로 `road-music` 전역 명령을 만들 수 있지만 선택 사항이다. 권한 오류가 나도 `sudo`를 쓰지 말고 위의 `node` 명령을 사용한다.
- `ffmpeg`와 `ffprobe`, ACE 엔진은 CLI와 별도로 준비한다. 설치·생성 전 `setup:check`와 `engines:list`으로 확인한다.
- 업데이트는 [업데이트 가이드](docs/updates.md)를 따른다. `update:check`와 `update:status`로 대상·버전을 확인하고 사용자가 업데이트를 요청했을 때 `update:install`을 실행한다. 진행·대기 작업을 취소하거나 로컬 수정을 덮어쓰지 않는다. `installing`은 인계 응답이므로 재시작 후 실제 버전·설치 결과를 확인한다.
- 코드를 변경하면 `npm test`와 변경한 JavaScript의 `node --check`를 실행한다. 실제 엔진·마이크·다른 OS 검증을 생략했다면 결과에 구분해 적는다.

## 지침의 적용 범위

Codex는 세션 시작 시 프로젝트 루트부터 현재 작업 디렉터리까지의 지침을 읽는다. Git 프로젝트가 아니면 현재 디렉터리를 기준으로 한다. 외부 프로젝트에서 Road Music을 제어할 때 이 파일이 자동 적용된다고 가정하지 말고, [AI CLI 운영 문서](docs/ai-cli.md)의 절대 경로 읽기 절차를 따른다. 다른 프로젝트의 `AGENTS.md`를 덮어쓰지 않는다.
