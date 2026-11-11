<!-- road-music-release: {"date":"2026-11-12","slug":"yue2-official-guide-studio-agent","version":"0.1.1","title":"YuE2 공식 가이드 보정과 제작실 Codex 연결"} -->

# YuE2 공식 가이드 보정과 제작실 Codex 연결

> **상태:** v0.1.1 릴리스 후보 · 이 노트의 링크는 GitHub Release에서도 열리도록 전체 GitHub URL을 사용합니다.

## 사용자 변경

- **YuE2 공식 가이드 보정:** YuE 엔진 요청에서 `song:prepare`가 `officialGuide` 점검 10가지를 함께 돌려줍니다. 점검 대상은 언어·악기·보컬·템포, 긍정형 묘사, 지시문 섞임, 구간 태그, 가사 속 주석, ABC 템포 일치, melody 모드 ABC의 코드 기호입니다. 점검은 조언일 뿐 요청을 바꾸거나 막지 않습니다. AI가 쓴 style·가사는 공식 규칙에 맞게 보정하고, 사용자 원문에는 승인이 필요한 보정안을 제시하며, 근거와 보정 전후를 담은 「YuE2 공식 가이드 보정 보고」를 남기도록 안내 문서와 스킬을 바꿨습니다.
- **점검 정확도:** "no drums"처럼 부정한 악기를 악기 명시로 세지 않습니다. 곡 제목은 `[Verse]` 같은 구간 태그 대신 `# 제목`이나 첫 가창 줄에서 추론합니다.
- **CCM 지침 선택화:** CCM 요청에서 CCM 가이드를 반드시 먼저 읽어야 하던 규칙을 없애고 참고 자료로 바꿨습니다.
- **제작실 Codex 연결:** 제작실·음악 상세 HTML에서 연결된 Codex 대화로 수정·검토 요청을 보내고, 상태와 대화 이력을 확인합니다. 초안은 보존됩니다. 공개 CLI 명령은 `studio:agent:*`, `studio:draft:*`, `studio:request:*`, `studio:conversation:history`입니다.
- **공식 참고본 갱신:** YuE2 main 참고본을 `1116bea`(2026-11-01)로 갱신하고 `docs/generation.md`를 추가했습니다.
- **동봉 스킬:** music-road-skills를 제작실 Codex 연결 내용을 반영한 커밋으로 갱신했습니다.

## 설치 영향

- 앱 0.1.0에서 0.1.1로 올라가는 패치입니다. 모델·곡·영상·제작 기록 DB는 그대로 쓰고 옮기거나 다시 만들지 않습니다.
- `song:prepare` 결과에 `officialGuide` 필드가 추가됐습니다. 기존 필드와 생성 요청 형식은 바뀌지 않았습니다.
- CLI도 같은 날 `cli-v0.1.1`로 따로 배포합니다. 앱 Latest는 `v0.1.1`입니다.

## 검증

- `npm test` 404/404 통과. 부하가 크면 간헐적으로 실패하던 악보 변환 취소 테스트는 작업 시작을 확인한 뒤 취소하도록 고쳤고, CLI 업데이트 테스트는 고정 버전 대신 현재 `cli/package.json` 버전을 기준으로 바꿨습니다.
- music-road-skills 자체 테스트 통과.
- YuE2 공식 계약 감사: Claude·Codex 에이전트가 만든 제출 요청 JSON을 `song:prepare`의 `nativeRequest` 기준으로 검사해 위반 0건이었습니다(music-road-music-skills 회귀).
- `release-notes.js resolve`·`resolve-cli`와 `release-version.js` 사전 검증 통과.

## 제한과 참고

- `officialGuide` 점검은 문자열 규칙에 따른 조언입니다. 길이·가창·발음·무보컬 결과를 보장하지 않습니다.
- 철회된 옛 앱 0.1.1 설치본은 이번 0.1.1과 번호가 같아 자동 업데이트 알림이 뜨지 않습니다. Release에서 DMG를 받아 수동 설치하세요.
- 이번 검증에 새 모델 설치나 Windows·Linux 실제 설치는 포함하지 않았습니다.
- [업데이트 안내](https://github.com/roadkwonai/music-road/blob/v0.1.1/docs/updates.md) · [YuE 프롬프트 가이드](https://github.com/roadkwonai/music-road/blob/v0.1.1/docs/yue-prompt-guide.md)
