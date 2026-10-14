# AI 에이전트에서 Road Music CLI 사용하기

Road Music에는 MCP 서버가 없다. AI 에이전트는 로컬 셸에서 `node cli/road-music.js`를 실행하고 stdout JSON 한 줄과 stderr 이벤트 JSONL을 분리해 읽는다. CLI는 실행 중인 GUI와 같은 로컬 서비스·대기열을 쓸 수 있으므로, 에이전트는 먼저 상태를 읽고 생성·이동·삭제·외부 열기 명령을 요청 범위로 제한해야 한다.

## 목차

- [필요한 파일](#toc-1)
- [실행 계약](#toc-2)
- [음악 요청 예시 찾기](#toc-3)

<a id="toc-1"></a>

## 필요한 파일

| 파일 | 용도 | 자동 적용 |
| --- | --- | --- |
| [`AGENTS.md`](../AGENTS.md) | Codex 등 에이전트의 공통 작업 순서·안전 경계 | 현재 작업 디렉터리 또는 상위 경로에서 세션을 시작할 때 Codex가 읽는다. |
| [`CLAUDE.md`](../CLAUDE.md) | Claude Code가 같은 지침을 재사용하는 진입점 | Claude Code가 프로젝트 메모리를 읽을 때 `@AGENTS.md`를 가져온다. |
| [동봉 작사·생성 스킬](../skills/road-music-ace/SKILL.md) | 태그 선택·프롬프트·기술 검증·요청자 검토·자동 생성 | `AGENTS.md`를 읽은 AI가 요청마다 파일을 읽어 적용한다. 전역 스킬 등록은 전제하지 않는다. |
| [검수 에이전트 역할](../prompts/ace-review.md) | 별도 에이전트가 있을 때 독립 입력 검수 | 선택적 사용. 없으면 동일 항목을 직접 검수한다. |
| [`prompts/cli-workflows.md`](../prompts/cli-workflows.md) | 반복 작업용 프롬프트 5개 | 자동 로드하지 않는다. 작업 시작 전에 명시적으로 읽는다. |
| [CLI 사용법](cli.md)·[레퍼런스](cli-reference.md) | 명령 순서·입력 스키마 | 자동 로드하지 않는다. 실제 요청 전 필요한 부분을 읽는다. |

Codex는 세션 시작 시 프로젝트 루트부터 현재 디렉터리까지 지침을 읽는다. Git 프로젝트가 아니면 현재 디렉터리를 기준으로 한다. 따라서 외부 프로젝트에서 Road Music 키트를 제어할 때는 기존 프로젝트의 `AGENTS.md`를 덮어쓰거나 복사하지 말고, 에이전트에게 다음 절대 경로를 읽도록 요청한다.

```text
Road Music CLI를 사용하기 전에 /사용자가 설치한 절대 경로/RoadMusic-1.4.0-cli/AGENTS.md,
/사용자가 설치한 절대 경로/RoadMusic-1.4.0-cli/docs/cli.md,
/사용자가 설치한 절대 경로/RoadMusic-1.4.0-cli/docs/cli-reference.md를 읽고 지침을 따른다.
ACE로 음악을 만들거나 가사·옵션을 설계할 때는 요청마다
/사용자가 설치한 절대 경로/RoadMusic-1.4.0-cli/docs/ace-prompt-guide.md를 먼저 읽고
그 안에 연결된 로컬 공식 원문의 해당 부분도 참고한다.
가사·프롬프트 작업에는 같은 키트의 skills/road-music-ace/SKILL.md와
docs/lyrics-tags.md, docs/music-review.md도 읽고 기본 검토 또는 명시적 자동 위임을 적용한다.
```

Claude Code는 `CLAUDE.md`에서 코드 펜스 밖의 상대 가져오기 문법 `@AGENTS.md`를 지원한다. 이 키트의 `CLAUDE.md`는 그 한 줄만 두어 지침이 서로 어긋나지 않게 한다. 근거: [Codex AGENTS.md 구성](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude Code 메모리와 가져오기](https://code.claude.com/docs/en/memory).

<a id="toc-2"></a>

## 실행 계약

```bash
cd "/사용자가 선택한 경로/RoadMusic-1.4.0-cli"
node cli/road-music.js schema
node cli/road-music.js app:state
```

- 표준 출력은 최종 JSON 한 줄이다. 진행 상황이 필요하면 `--events`를 주고 표준 오류의 JSONL만 추가로 읽는다.
- `song:generate`, `song:resume`, `song:render` 뒤에는 받은 `jobId`로 `job:wait`을 호출한다. `video:render`는 명령 자체가 렌더 완료를 반환한다.
- `uncertain:true` 오류는 요청이 실제로 접수됐는지 알 수 없다는 뜻이다. 자동 재제출하지 말고 `service:status`, `queue:list`, `songs:list` 또는 `job:wait`을 조회한다.
- `--confirm`, `--overwrite`, `--input`, `--output`은 JSON 안이 아닌 CLI 최상위 플래그다. 경로는 사용자가 고른 절대 경로를 쓴다.
- `about:feedback`, `shell:open`, `about:open`, `update:open-page`, `notices:open`, `song:reveal`, `log:open`은 외부 전송·앱·브라우저 동작을 할 수 있으므로 명시적 요청이 있을 때만 쓴다.
- 새 버전은 `update:check`, 상태는 `update:status`로 확인한다. 사용자가 업데이트를 요청한 경우 작업·대기열이 없을 때 `update:install`을 실행한다. 설치 인계 뒤 재시작을 기다리고 실제 버전을 다시 확인한다. [업데이트 가이드](updates.md)를 따른다.

CLI 설치와 환경 점검은 [CLI 설치](cli-install.md), 명령별 상세 계약은 [CLI 레퍼런스](cli-reference.md), 검증된 범위는 [CLI 검수 결과](cli-qa-report.md)를 참고한다.

<a id="toc-3"></a>

## 음악 요청 예시 찾기

| 필요한 내용 | 문서 |
| --- | --- |
| ACE 생성 전 필수 참고, 공식 원문·프롬프트 최적화 | [ACE 최적화 가이드](ace-prompt-guide.md) · [공식 보관본](vendor/ace-step-1.5/README.md) |
| Verse·Chorus 등 구간 태그, 기본 검토·전체 자동 위임 | [태그 가이드](lyrics-tags.md) · [검토 규칙](music-review.md) |
| 자연어 요청을 지원 옵션으로 바꾸기, JSON 파일 실행 | [음악 생성 옵션](music-options.md) |
| 장르별 상세 요청·한 줄 요청·여성 보컬·여러 곡 | [장르별 프롬프트](genre-prompts.md) |
| 최신 차트·AI 플레이리스트 조사와 창작 가사 | [리서치 기반 음악 만들기](music-research.md) |
| 내보내기·자막·영상·오류 진단 | [작업 프롬프트](../prompts/cli-workflows.md) |

에이전트가 공통 지침과 스킬을 읽은 뒤에는 “한국어 여성 락발라드 1곡, 150초, 피아노와 기타 중심으로 만들어줘”처럼 요청해도 된다. 기본은 검증한 가사·프롬프트를 제시한 뒤 승인받아 생성한다. “가사와 프롬프트까지 전부 자동으로 정해 생성해줘”라고 위임하면 승인 질문 없이 검증·생성하고 음악·사용 가사·최종 옵션·참고 자료·선택 이유를 제공한다. 조사·설정만 요청했다면 생성하지 않는다.
