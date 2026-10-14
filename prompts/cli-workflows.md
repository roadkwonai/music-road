# Road Music CLI 작업 프롬프트

[Road Music](../README.md) · [문서 지도](../docs/README.md) · [릴리스 노트](../releases/README.md)

이 파일은 자동 로드되지 않는다. 작업을 시작할 때 [AGENTS.md](../AGENTS.md), [CLI 설치](../docs/cli-install.md), [CLI 사용법](../docs/cli.md), [CLI 레퍼런스](../docs/cli-reference.md)를 먼저 읽은 AI 에이전트에게 아래 프롬프트 중 하나를 전달한다. 모든 경로는 사용자가 고른 실제 절대 경로로 바꾼다.

`RoadMusic-버전-cli`의 `버전`은 설치한 Release의 값으로 바꾼다.

음악 제작 예시는 [장르별 프롬프트](../docs/genre-prompts.md), 상세 입력은 [음악 옵션](../docs/music-options.md), 최신 스타일 조사는 [리서치 프롬프트](../docs/music-research.md)를 참고한다. 이 파일은 설치·작업 실행·내보내기·진단에 집중한다.

생성 예시에도 [공통 검토 규칙](../docs/music-review.md)을 적용한다. 기본은 가사·프롬프트를 검증해 요청자에게 먼저 보여주며, 두 항목부터 생성까지 전부 자동 위임받은 경우에만 검토 없이 생성한다. 태그는 [구간 가이드](../docs/lyrics-tags.md)에 맞춰 쓴다.

## 목차

- [1. 설치와 환경 확인](#toc-1)
- [2. 10~30초 연주곡 두 곡 생성](#toc-2)
- [3. 가사가 있는 보컬 곡 생성](#toc-3)
- [4. 앨범·SRT·MP4 내보내기](#toc-4)
- [5. 오류 진단](#toc-5)

<a id="toc-1"></a>

## 1. 설치와 환경 확인

```text
Road Music CLI 소스 키트에서 설치와 읽기 전용 환경 점검을 해줘.
키트 절대 경로: /사용자가 선택한 경로/RoadMusic-버전-cli
Node.js 버전을 확인하고 npm ci --include=dev로 CLI 의존성을 설치한 뒤 schema, app:state, setup:check, engines:list을 확인해줘. 음악 생성·모델 설치·기존 곡 삭제나 설정 변경은 하지 마. 첫 상태 요청에서 서비스와 데이터 폴더가 초기화될 수 있다는 점은 보고해줘.
stdout 최종 JSON과 핵심 상태를 요약하고, 누락된 ffmpeg/ffprobe/ACE 엔진이 있으면 설치 명령을 실행하지 말고 알려줘.
```

입력은 키트의 절대 경로다. 출력은 설치 성공 여부, CLI 스키마 접근 여부, 환경·엔진의 읽기 전용 상태 보고다.

<a id="toc-2"></a>

## 2. 10~30초 연주곡 두 곡 생성

```text
Road Music CLI로 서로 다른 10~30초 연주곡 두 곡을 생성해줘.
프로젝트 이름: CLI 연주 스케치
첫 곡: 15초, minimal warm piano, piano와 cello, 76 BPM.
둘째 곡: 25초, gentle acoustic guitar, acoustic guitar와 brushed drums, 96 BPM.
각 요청은 instrumental:true, engine:ace, 서로 다른 seed를 사용하고 --events --wait로 완료를 확인해줘.
시작 전에 app:state, engines:list, projects:list을 읽고 ACE가 준비되지 않았으면 설치·다운로드를 시작하지 말고 상태를 보고해줘.
성공하면 각 곡의 title, dir, audio, jobId를 반환해줘. 지정한 프로젝트를 만들거나 선택하는 변경은 허용하지만, 기존 곡을 수정하거나 기존 대기 작업을 제거하지 마.
```

입력은 위 음악 사양이며, 출력은 두 완료 곡의 실제 경로와 작업 결과다. 엔진 없음·연결 불명확 상태에서는 재제출하지 않는다.

<a id="toc-3"></a>

## 3. 가사가 있는 보컬 곡 생성

```text
Road Music CLI로 아래 가사가 있는 30초 보컬 곡을 한 곡 생성해줘.
제목: 새벽의 길
스타일: warm Korean indie pop, intimate female vocal, piano and acoustic guitar, 90 BPM
가사:
[Verse]
새벽의 길을 천천히 걸어요
작은 불빛이 나를 비춰요
[Chorus]
오늘의 마음을 노래해요
다시 시작할 용기를 찾아요

시작 전에 app:state와 engines:list을 읽고, ACE 준비 상태를 확인해줘.
song:generate에는 engine:ace, targetSeconds:30, count:1을 사용하고 --events --wait로 결과를 확인해줘.
성공한 곡의 title, dir, audio, jobId와 실패 시 오류 JSON을 반환해줘. 모델 설치, 파일 삭제, 외부 전송은 하지 마.
```

입력은 제목·스타일·가사이며, 출력은 완료된 곡의 절대 경로 또는 검증 가능한 오류 JSON이다.

<a id="toc-4"></a>

## 4. 앨범·SRT·MP4 내보내기

```text
Road Music CLI로 사용자가 고른 완료 곡만 내보내줘.
곡 폴더 절대 경로: /사용자가 선택한 경로/완료-곡-폴더
SRT 출력 절대 경로: /사용자가 선택한 경로/exports/완료-곡.srt
MP4 출력 절대 경로: /사용자가 선택한 경로/exports/완료-곡-영상.mp4
앨범 폴더 출력 절대 경로: /사용자가 선택한 경로/exports/앨범

먼저 songs:list과 song:detail로 곡 폴더가 현재 라이브러리의 완료 곡인지 확인해줘.
song:srt로 SRT를 만든 뒤 song:save-srt에 --output을 사용해 저장해줘.
선택한 곡만 담은 album:export를 MP3 형식으로 --output 앨범 폴더에 저장해줘.
video:render는 720p, 30fps, CPU, 배경 없음, 막대 스펙트럼, 한 번 재생으로 만들고 --output MP4 경로와 --events를 사용해 완료 응답을 확인해줘.
기존 출력 파일이 있으면 덮어쓰지 말고 충돌을 보고해줘. --overwrite, --confirm, 파일 삭제, 외부 전송은 사용하지 마.
```

입력은 사용자가 선택한 완료 곡과 세 출력 절대 경로다. 출력은 SRT·앨범 폴더·MP4의 실제 결과 경로와 작업 상태다.

<a id="toc-5"></a>

## 5. 오류 진단

```text
Road Music CLI 오류를 읽기 전용으로 진단해줘.
실행한 명령: [사용자가 실제로 실행한 명령]
stdout JSON: [사용자가 받은 stdout 한 줄]
stderr 이벤트 또는 오류: [사용자가 받은 stderr 전체]
키트 절대 경로: /사용자가 선택한 경로/RoadMusic-버전-cli

app:state, service:status --no-start, setup:check, engines:list을 조회하고 필요한 경우 queue:list과 songs:list도 읽어줘.
오류 코드, 이미 실행됐을 가능성(uncertain:true), 다음의 비파괴적 확인 명령을 순서대로 제시해줘.
service:stop --confirm, 모델/곡 이동, 삭제, 재설치, 재생성, 외부 전송은 실행하지 마.
```

입력은 실제 명령과 JSON 로그다. 출력은 원인 후보, 근거, 다음 읽기 전용 확인 순서이며 자동 복구·재제출은 포함하지 않는다.
