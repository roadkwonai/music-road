# 실제 완성 음원 후렴 보강 HTML 통합 검수 (2026-10-20)

HTML 요청 → 같은 Codex 대화 실제 수신 → ACK → YuE 가이드/입력 검토 → 새 전체 녹음 1회 → 새 납품 버전 등록 → HTML 재생·다운로드·완료 표시를 확인했다. 음악적 개선·가창 품질은 청취 미확인 후보로 남긴다.

## 요청과 범위

- studioRequestId: `9d191e09f7e7343445f1f994c0f477f0d370c0be97441227` / intent: `produce`
- threadId: `01a1585e-50f3-7dc3-abea-6fa36f8b6d58`
- source/group SHA-256: `e9ba0950b2aa1e4935751f34e19f7c466d426eb4573f84b22809e7a324dba340`
- 실제 HTML 구간: 133.93–170.47초. 본문의 134.58–170.47초는 ABC 첫 후렴 추정값이며 확정 가창 시각이 아니다. 브라우저 숫자 입력에 초점이 남은 스크롤에서 시작값이 변한 이력은 실제 payload 값으로 보존했다. 부분 파형 교체 구간으로 사용하지 않았다.
- 원곡: 잊을 수 없는 너 — 여성 고음 리메이크 v2. 목표 292초·가사·ABC(Bm/107 BPM)·melody·seed20261020·CFG1·ODE32·8bit/16GiB 설정을 유지하고 후렴 기타·베이스·킥·스네어·크래시·필 강화 style만 추가했다. 제목에 새 버전 v3를 붙였다.
- 기존 승인 가사의 문장·반복 후렴·시적 표현을 검토했으며 개사하지 않았다. lyrics:clean 결과 동일, 긴 절 경고는 원문 보존을 위해 자동 분할하지 않았다.

## 공식 가이드와 입력 검증

동봉 road-music 스킬, YuE 제작 가이드, vendor README, 공식 editing·yue2-music 스킬과 MLX usage, 실행 schema/capabilities를 대조했다. 고정 공식 `9c6c4b349be978b06a9d0d958471a07a6cdeff4d`, MLX `c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8` 기준이다. YuE는 waveform inpainting이 없으므로 prepare→generate로 새 전체 녹음을 생성했다. render/replay로 style을 편집하지 않았다. 동일 악보가 구간 밖 가창·음색·파형 동일성을 보장하지 않는다.

준비 입력 valid:true, 오류/누락 없음. 조합기의 세미콜론→쉼표 정규화 이외 의미 변화 없음. 실제 native style·lyrics·ABC 전달본과 prepare를 대조했다. score:compare의 상징적 악보 불변 조건 match:true. 독립 입력 검수 PASS.

## 실제 생성과 파일

- jobId: `1792494748770-d882857f`. 앞선 다른 사용자 작업을 보존하고 대기 후 실행했다. 생성 제출 1회. 기다리기 timeout에도 중복 제출하지 않았다.
- 실제 생성 516.18초, 결과 284.359초(목표 대비 -7.641초, 기준 음원 대비 -4.920초). ABC/semantic 잘림 false, 자연 종료. 48kHz stereo MP3 전체 디코딩·비무음 확인.
- 새 음원 SHA-256: `3c4ae4b545774b080e7c863bc4d2762bb0eccf6a4346ab328c845b5702e7fb45`.
- 원본 폴더 36파일의 SHA-256 36/36 일치. 등록 원가사 SHA `143d3d9bd54e7bbfec044802727f9276475e805ceef2c4a014c72e6d0a434581` 유지. 원본·이전 납품 경로·기존 영상은 삭제/덮어쓰기/재렌더하지 않았다.
- dry-run: 기존 음원/가사 유지, 새 음원1 추가, 제거0/경고0. 새 납품 버전 `2fb7f2b22e1a7c1c00c468b1b321538acbb2842c0059bb2ed8a73bffb89f7216`. 같은 그룹의 버전 비교에 2개 표시.

## HTML 검수

원본과 v3 플레이어를 함께 확인했다. 새 음원 재생(음소거 해제/음량1/오류 없음), 134.58초 탐색 후 138초 이상 진행, 원가사 원문/읽기 전용 표시를 확인했다. 실제 다운로드 버튼의 한글 파일명·11,377,004B·SHA와 가사 다운로드 SHA가 등록본과 일치했다. 첫 자동화 saveAs는 0B였으나 HTTP 전체 응답 SHA와 다운로드 완료를 기다린 버튼 재검수는 통과했다. 작품 상세 재진입 후 새 음원이 다음 요청 미디어에 나타나고 요청 상태는 `작업 완료`다.

## 음악 품질의 한계

Whisper large-v3-turbo/large-v3의 무유도 전곡 및120–180초 문맥 전사를 보존했다. 두 모델은 같은 계열이다. large 전곡은 반복 환각이 심하고, 문맥 전사에도 거라곤/거라고, 널 잊겠니/너 잊겠니, 삶인데/사유인데 불일치가 남았다. 실제 오발음 확정·청취 점수로 해석하지 않는다. 추가 개사·재생성은 하지 않았다. 후렴 악기/비트 강화는 style로 요청했고 실제 청취상 개선은 미확인이다.

고정 시각 신호의 벌스→첫 후렴 RMS 차이는 기준 약2.30dB, 새 후보 약3.50dB이며, 새 후보 후렴 절대 RMS는 더 낮다. 시각 정렬·악기 분리가 아니므로 드럼/악기 보강 성공 증거로 삼지 않는다.

## 저장공간과 남은 제한

원음과 새 녹음의 길이가 달라 기존 자동 완료/캐시 정리 검증은 보류했다. 검증을 완화하거나 파일을 삭제하지 않았다. 공개 storage:policy로 이 테스트 프로젝트만 completed·autoCleanup:false·preserveHistory:true 처리했다. 모델·전역 정책·다른 작업은 바꾸지 않았다.

코드 변경·설치·추가 모델 다운로드·새 영상 렌더·외부 게시 없음. 이번 실행은 실제 macOS YuE 생성 검수이며 제품 코드 변경이 없어 npm 회귀를 다시 돌리지 않았다. 직접 청취·가창 정확성·후렴 악기 보강의 주관적 품질은 미확인이다.

## 결과 경로

- 과거 게시 음원: `./Output/잊을 수 없는 너 — 여성 고음 리메이크 v2--e9ba0950b2aa/잊을 수 없는 너 — 여성 고음 리메이크 v2--a4533426ebf7/20261020-202626/잊을 수 없는 너 — 후렴 악기·비트 보강 v3.mp3`. 2026-10-22 사용자 요청으로 제거했으며 현재 납품본이 아니다.
- 당시 비교 기준 곡 폴더: `~/Documents/YueStudio/Songs/최재훈 여성보컬 리메이크 1곡 2026-10-20/20261020101359_잊을 수 없는 너 — 여성 고음 리메이크 v2`. 2026-10-21 사용자의 이전 생성 음악 제거 요청으로 백업 후 삭제했으며, 이 경로는 과거 검수 기록이다.
- [상세 JSON 검수](<../.roadmusic/work/unassigned/choi-jaehoon-first-song-20261020/source-remakes-seven-v1/.roadmusic/history/retired-published-audit-20261022/후렴-보강-통합검수.json>)
- [실제 생성 요청](<../.roadmusic/work/unassigned/choi-jaehoon-first-song-20261020/source-remakes-seven-v1/.roadmusic/history/retired-published-audit-20261022/검수자료/생성요청.json>)
- [원본 SHA 목록](<../.roadmusic/work/unassigned/choi-jaehoon-first-song-20261020/source-remakes-seven-v1/.roadmusic/history/retired-published-audit-20261022/검수자료/원본SHA256.json>)
