# AI 에이전트에서 Road Music CLI 사용하기

Road Music에는 MCP 서버가 없다. AI 에이전트는 로컬 셸에서 `node cli/road-music.js`를 실행하고 stdout JSON 한 줄과 stderr 이벤트 JSONL을 분리해 읽는다. CLI는 실행 중인 GUI와 같은 로컬 서비스·대기열을 쓸 수 있으므로, 에이전트는 먼저 상태를 읽고 생성·이동·삭제·외부 열기 명령을 요청 범위로 제한해야 한다.

## 필요한 파일

| 파일 | 용도 | 자동 적용 |
| --- | --- | --- |
| [`AGENTS.md`](../AGENTS.md) | Codex 등 에이전트의 공통 작업 순서·안전 경계 | 현재 작업 디렉터리 또는 상위 경로에서 세션을 시작할 때 Codex가 읽는다. |
| [`CLAUDE.md`](../CLAUDE.md) | Claude Code가 같은 지침을 재사용하는 진입점 | Claude Code가 프로젝트 메모리를 읽을 때 `@AGENTS.md`를 가져온다. |
| [`prompts/cli-workflows.md`](../prompts/cli-workflows.md) | 반복 작업용 프롬프트 5개 | 자동 로드하지 않는다. 작업 시작 전에 명시적으로 읽는다. |
| [CLI 사용법](cli.md)·[레퍼런스](cli-reference.md) | 명령 순서·입력 스키마 | 자동 로드하지 않는다. 실제 요청 전 필요한 부분을 읽는다. |

Codex는 세션 시작 시 프로젝트 루트부터 현재 디렉터리까지 지침을 읽는다. Git 프로젝트가 아니면 현재 디렉터리를 기준으로 한다. 따라서 외부 프로젝트에서 Road Music 키트를 제어할 때는 기존 프로젝트의 `AGENTS.md`를 덮어쓰거나 복사하지 말고, 에이전트에게 다음 절대 경로를 읽도록 요청한다.

```text
Road Music CLI를 사용하기 전에 /사용자가 설치한 절대 경로/RoadMusic-1.3.1-cli/AGENTS.md,
/사용자가 설치한 절대 경로/RoadMusic-1.3.1-cli/docs/cli.md,
/사용자가 설치한 절대 경로/RoadMusic-1.3.1-cli/docs/cli-reference.md를 읽고 지침을 따른다.
```

Claude Code는 `CLAUDE.md`에서 코드 펜스 밖의 상대 가져오기 문법 `@AGENTS.md`를 지원한다. 이 키트의 `CLAUDE.md`는 그 한 줄만 두어 지침이 서로 어긋나지 않게 한다. 근거: [Codex AGENTS.md 구성](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude Code 메모리와 가져오기](https://code.claude.com/docs/en/memory).

## 실행 계약

```bash
cd "/사용자가 선택한 경로/RoadMusic-1.3.1-cli"
node cli/road-music.js schema
node cli/road-music.js app:state
```

- 표준 출력은 최종 JSON 한 줄이다. 진행 상황이 필요하면 `--events`를 주고 표준 오류의 JSONL만 추가로 읽는다.
- `song:generate`, `song:resume`, `song:render` 뒤에는 받은 `jobId`로 `job:wait`을 호출한다. `video:render`는 명령 자체가 렌더 완료를 반환한다.
- `uncertain:true` 오류는 요청이 실제로 접수됐는지 알 수 없다는 뜻이다. 자동 재제출하지 말고 `service:status`, `queue:list`, `songs:list` 또는 `job:wait`을 조회한다.
- `--confirm`, `--overwrite`, `--input`, `--output`은 JSON 안이 아닌 CLI 최상위 플래그다. 경로는 사용자가 고른 절대 경로를 쓴다.
- `about:feedback`, `shell:open`, `about:open`, `update:open-page`, `notices:open`, `song:reveal`, `log:open`은 외부 전송·앱·브라우저 동작을 할 수 있으므로 명시적 요청이 있을 때만 쓴다.

CLI 설치와 환경 점검은 [CLI 설치](cli-install.md), 명령별 상세 계약은 [CLI 레퍼런스](cli-reference.md), 검증된 범위는 [CLI 검수 결과](cli-qa-report.md)를 참고한다.
