# HTML 템플릿 목록과 검수 기록

검수일: 2026-10-18. 대상은 프로젝트에서 유지·생성하는 Road Music 영상 HTML이며, 과거 렌더 출력 폴더와 공식 외부 엔진 원본은 제외한다. 기본 글꼴과 UI 디자인은 [DESIGN.md](../DESIGN.md)를 따른다.

## 원본 HTML 8개

| 이름 | 역할 | 원본 |
| --- | --- | --- |
| 영상 제작실 | 제작 방식·음원·스타일 선택, 화면 표시, 제작 설정 전달·완성 파일 재생/다운로드·결과 검수 | [studio.html](../.agents/skills/road-music-video-studio/assets/studio.html) |
| JIZURA 음악 스튜디오 | 추천 3안 비교, 효과·출력 설정, 실제 엔진 미리보기·전체 편집기 | [index.html](https://github.com/roadkwonai/music-road-skills/blob/main/skills/road-music-jizura-playlist/assets/studio/index.html) |
| Showreel 스타일 카탈로그 | 등록된 7개 프리셋과 실제 미리보기·장르 추천 | [catalog.html](https://github.com/roadkwonai/music-road-skills/blob/main/skills/road-music-showreel-playlist/assets/catalog.html) |
| CD 호환 카탈로그 | 이전 CD 스킬에서 여는 카탈로그 진입점 | [catalog.html](https://github.com/roadkwonai/music-road-skills/blob/main/skills/road-music-showreel-cd/assets/catalog.html) |
| 기본 회전 CD | 회전 CD·앨범 이미지·곡 정보·가사·스펙트럼의 영상 장면 | [index.html](https://github.com/roadkwonai/music-road-skills/blob/main/skills/road-music-showreel-playlist/assets/template/index.html) |
| 네이티브 음악 장면 | 곡별로 새로 구성하는 Showreel 장면의 기본 셸 | [index.html](https://github.com/roadkwonai/music-road-skills/blob/main/skills/road-music-showreel-playlist/assets/native-music/index.html) |
| 그루브 다이얼 | 사진 콜라주·셔터 인트로·회전 CD·리듬 반응 | [index.html](https://github.com/roadkwonai/music-road-skills/blob/main/skills/road-music-showreel-playlist/assets/presets/groove-dial/template/index.html) |
| 리듬 캔버스 | 곡별 이미지와 궤도·리본·원근 그리드·타일 모션 | [index.html](https://github.com/roadkwonai/music-road-skills/blob/main/skills/road-music-showreel-playlist/assets/presets/rhythm-canvas/template/index.html) |

기본 회전 CD의 재질 변주 5종은 가을 아카이브, 누아르 필름, 네온 애프터아워, 로파이 노트북, 크롬 프리즘이다. 그루브 다이얼·리듬 캔버스를 합쳐 카탈로그의 등록 프리셋은 7개다. 프리셋 수와 HTML 원본 파일 수는 다르다.

## 별도로 생성되는 HTML

- [스타일 선택기 생성기](https://github.com/roadkwonai/music-road-skills/blob/main/skills/road-music-showreel-playlist/scripts/playlist_chooser.py): 음악·스타일·표시 옵션 선택을 저장하는 임시 로컬 화면.
- [가사 가독성 검수 생성기](https://github.com/roadkwonai/music-road-skills/blob/main/skills/road-music-jizura-playlist/scripts/readability.mjs): 실제 영상 프레임과 확정·추정·자동 정렬 초안을 구분한 검수 시트.

템플릿은 곡별 음악·이미지·프로젝트를 연결해야 작동한다. HTML 파일만 열어 완성 영상으로 판단하지 않는다.

## 이번 보완

- 새 프로젝트에서 전체 SKIP 후 제작 방식을 바꾸거나 결과를 새로 확인해도 선택이 유지되도록 수정했다. 최초 미응답과 명시적인 SKIP을 구분한다.
- 제작 방식 선택 버튼에 고유한 접근성 이름을 붙이고, 채널명·검수 상태 입력과 저장 결과의 상태 알림을 보완했다.
- 카드 라벨 전체에 마우스를 올릴 때 미리보기 영상까지 흐려지던 공통 효과를 제거했다. 보조 버튼·탭·추천 카드·도움말의 고유 상태를 공통 버튼 배경이 덮지 않게 했다.
- JIZURA 도움말 버튼의 터치 영역을 44×44px로 확보했다.
- 가사 검수 카드의 최소 너비를 화면 폭에 맞춰 320px 화면에서도 가로 넘침이 없도록 수정했다.
- Showreel 영상 템플릿 4개에 모바일 viewport를 추가했다. 스타일 선택기 영상에는 고유한 접근성 이름, 카탈로그 장르 안내에는 상태 알림을 추가하고 카탈로그의 공통 CSS 번들을 갱신했다.

## 검증과 한계

아래 수치는 초기 검수 기록이다. 이후 실제 CLI·Ego 전체 흐름 검수와 추가 수정 결과는 문서 끝의 후속 기록을 따른다.

- 루트 `npm test`: 243개 통과.
- 공통 디자인·폰트 HTTP 검사: 5개 통과. SKIP 유지 회귀 검사 통과.
- JIZURA 서버 계약 검사: 5개 통과. 가독성 검수 생성·프레임·검수 판정 회귀 검사 통과.
- Showreel 선택기 7개, 카탈로그 2개 통과. 기본 CD 5변주의 폰트·탐색 일관성·브라우저 오류 검사 통과.
- 실제 브라우저: SKIP → 제작 방식 변경 → 결과 새로 확인 → 저장까지 확인. 제작실 390px, 가사 검수 시트 320px에서 가로 넘침이 없고 Paperlogy를 실제 로딩하는 것을 확인했다. JIZURA 390px에서 도움말 영역과 탭 상태를 확인했다.
- Showreel 전체 프리셋 검사 중 등록 자산 검사 1개는 현재 Python 환경에 Pillow가 없어 실행하지 못했다. 새 의존성은 설치하지 않았다.
- 이번 검수는 HTML과 템플릿 실행에 대한 것이다. 모든 프리셋의 전곡 MP4를 새로 렌더하거나 과거 생성 HTML을 일괄 변환하지 않았다.


## 완성 파일 제공 보완

같은 날 후속 보완으로 제작실의 4번을 **제작 설정 전달**, 5번을 **완성 파일 · 재생과 다운로드**로 명확히 했다. 상단 바로가기와 음원·원가사·영상별 버튼을 제공하며, 원가사 미리보기는 일반 텍스트로 표시한다. 스토리보드·자막·수정 의견은 별도 펼침 영역에 보존한다. `publish`에 UTF-8 `lyrics`를 추가하고 인증된 다운로드에 원본 파일명 첨부 헤더를 적용했다. ‘어디든 좋아’에는 실제 음원 1개·원가사 1개·기존 영상 2개를 등록했다. 기존 파일을 재렌더하거나 가사를 수정하지 않았다.


## CLI 시작과 페이지 이동 보완

명시적인 `service:start` 성공 후 제작실을 열도록 연결했다. 유효한 서버는 재사용하며 조회·스키마·배치는 창을 열지 않는다. 자동 열기를 원하지 않는 실행은 `ROADMUSIC_STUDIO_AUTO_OPEN=0`을 사용한다. 현재 소스에 구현했으며 배포 CLI를 설치·업데이트하지 않았다.

사용자 화면에는 공통 메뉴(영상 제작실·스타일 둘러보기·음악·제작 설정·완성 파일)를 적용했다. JIZURA와 선택기는 내부 설정 위치도 연결한다. 제작실과 카탈로그를 실제로 왕복하고 7개 미리보기의 로딩을 확인했다. JIZURA 탭 왕복과 별도 프로젝트의 미저장 SKIP 4개·피드백 복원도 실제 브라우저에서 확인했다. 영상 장면 템플릿과 공식 엔진 iframe에는 메뉴를 넣지 않았다. 원본 배포 템플릿에는 실행 중인 세션 토큰이 포함되지 않는 것을 확인했다.

## 2026-10-18 실제 CLI·Ego 전체 흐름 후속 검수

`service:start`와 각 스튜디오/선택기의 `--open`을 Ego에서 실제 확인했다. 공통 화면 6종을 320/390/768/1280px에서 검사했고, 24개 조건 모두 가로 넘침 없이 Paperlogy를 로딩했다. JIZURA 드롭다운 60개 옵션과 효과·도움말·탭·저장, 페이지 왕복 복원, 완성 음원·영상 재생과 다운로드를 확인했다. 원가사·음원·완성 영상의 실제 다운로드는 원본 SHA-256과 일치했고, 합성 4초 음원으로 JIZURA 네이티브 MP4 내보내기도 검증했다.

발견한 결과 갱신 오류의 숨김, 선택기 제출 후 재활성화, JIZURA 모바일 넘침·손상 음원 연결·페이지 복귀 설정 유실을 수정했다. Showreel의 곡별 새 연출을 프리셋 없이 선택·저장할 수 있게 연결했고, CD의 프리셋 필수 조건은 유지했다. 단계별 필요한 화면을 실제로 여는 절차를 관련 스킬에 연결했다.

최종 루트 테스트 255개, 별도 Python 검사 28개, UI 로직 2개 파일과 문법 검사를 통과했다. 검수 범위·다운로드 증거·스크린샷·미검수 항목은 당시 전체 검수 기록(원시 스크린샷·자료는 2026-10-19 사용자 승인 정리로 제거)에 남겼다. 기존 원곡·가사·완성 영상은 변경하지 않았다.
