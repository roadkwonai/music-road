# 옛 찬송가 공개 원전·CCM 리메이크 가이드

[Road Music](../README.md) · [CCM 48개 스타일](ccm-prompts.md) · [원문 보존 규칙](music-review.md#preserve-input)

**원어 가사·지정 고전 선율의 Public Domain 표기를 확인한 리메이크 후보 20개**와 현대 CCM 편곡 16가지를 정리했다. 확인일은 **2026-10-15 KST**다. 한국어 제목은 곡 식별용이며, 현행 한국어 찬송가 가사·현대 후렴·편곡·상업 음원까지 자유 이용 대상이라는 뜻은 아니다. 최종 이용 판본과 배포 지역은 곡을 선택할 때 고정한다.

실제 작업은 다음 세 가지를 먼저 정한다.

1. **무엇을 유지할지:** 제공 가사 그대로, 지정 고전 선율, 절 구조, 또는 새 곡으로 만들 범위.
2. **어떤 자료를 쓸지:** 확인한 가사·악보 판본, 허락된 한국어 가사, 직접 녹음한 참조 음원.
3. **어떻게 바꿀지:** 아래 R01~R16 중 편곡만 선택. 사용자에게 이미 받은 가사·프롬프트·지정 옵션은 레시피로 덮어쓰지 않는다.

GUI의 **프롬프트 가이드**와 CLI의 `prompt:knowledge`는 문서를 읽기 전용으로 제공한다. 조회만으로 작사·번역·곡 생성·입력 변경은 실행되지 않는다.

## 목차

- [권리를 구분하는 기준](#rights)
- [리메이크 후보 20곡](#candidates)
- [원래 선율 유지와 새 작곡의 차이](#modes)
- [현대 CCM 편곡 16가지](#recipes)
- [상세 리메이크 요청 프롬프트](#prompts)
- [CLI 절차와 JSON 예시](#cli)
- [원문 보존과 추천](#preservation)
- [출처와 결과 기록](#record)

<a id="rights"></a>

## 권리를 구분하는 기준

### 곡명 하나가 아니라 실제 이용하는 구성요소를 확인

| 구성요소 | 이번 목록이 다루는 범위 | 제작 전에 추가로 고정할 것 |
| --- | --- | --- |
| 원어 가사 | 아래 자료에 표시된 고전 영문 text | 실제 사용할 절·후렴·철자·수록판. 이후 추가된 절은 별도 확인 |
| 고전 선율 | 행마다 지정한 tune | 같은 제목의 다른 선율·현대 작곡을 혼동하지 않기 |
| 한국어 가사 | 통용 제목으로 식별만 함 | 번역자·개정자·판본·보호기간 또는 이용허락. 미확인이면 원문을 다른 가사로 몰래 교체하지 않기 |
| 현대 추가 후렴·편곡 | 원전 PD 범위에 포함하지 않음 | 새 후렴·독창적 화성/리프·현대 악보 편곡의 별도 이용조건 |
| 실연·녹음·MR·샘플 | 원전 PD 범위에 포함하지 않음 | 이용 근거를 확인한 원전에서 새로 연주·녹음하거나 해당 녹음 자체의 이용조건 확인 |
| 배포 지역·플랫폼 | 확인 당시의 자료를 제공 | 한국과 해외 배포 대상 국가의 판단·플랫폼 신고 절차 구분 |

번역·편곡의 독립 보호는 [한국 저작권법 제5조](https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0005&lsiSeq=283335&urlMode=lsScJoRltInfoR), 외국 저작물은 [제3조](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0003&lsiSeq=283335&urlMode=lsScJoRltInfoR), 실연·음반의 별도 보호기간은 [제86조](https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0086&lsiSeq=283335&urlMode=lsScJoRltInfoR)를 참고한다. 가사·작곡과 녹음이 다른 권리라는 설명은 [미 저작권청 Circular 56A](https://www.copyright.gov/circs/circ56a.pdf)에도 있다.

### 한국·미국 기준을 섞지 않기

- **한국:** 현행 일반 원칙은 사후 70년이며, 해당 구성요소가 공동저작물인 경우 마지막 사망 저작자를 기준으로 한다. 다음 해부터 계산한다. [제39조](https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0039&lsiSeq=283335&urlMode=lsScJoRltInfoR)·[제44조](https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0044&lsiSeq=283335&urlMode=lsScJoRltInfoR). 작사·작곡·번역을 무조건 하나의 공동저작물로 묶지 않는다.
- **한국의 경과조치:** 2013-07-01 전에 이미 만료된 저작재산권은 70년 연장으로 부활하지 않는다. 통상적인 개인저작물 예시로 1962년 사망자는 종전 규정에 따라 2012년 말 만료, 1963년 사망자는 연장 적용으로 2033년 말 만료다. [법제처 생활법령](https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=2&cciNo=3&cnpClsNo=2&csmSeq=705&popMenu=ov)·[한국저작권위원회 FAQ](https://www.copyright.or.kr/customer-center/faq/list.do?categorycode1=02&counselfaqno=47593&pageIndex=2&portalcode=&searchkeyword=). 외국 작품에는 조약·공표국 등도 함께 검토한다.
- **미국:** [미 저작권청](https://www.copyright.gov/what-is-copyright/)은 현재 1931-01-01 이전 미국에서 출판된 저작물의 만료를 설명한다. 여기서는 **1930년까지 미국에서 출판된 해당 가사·악보 판본**의 미국 내 판단으로 한정한다. 미공표 원고·나중의 창작 부분·다른 국가로 확대하지 않는다.
- **녹음:** 악보의 1930년 기준을 녹음물에 그대로 적용하지 않는다. 미국의 옛 녹음에는 [별도 보호기간 규칙](https://www.copyright.gov/music-modernization/pre1972-soundrecordings/)이 있다. 예를 들어 1923~1946년 발행 녹음은 100년 규칙이므로 2026년 초에는 1925년분까지의 기간이 만료되는 계산이다. 현대 유튜브 음원·MR에는 이 원전 목록을 이용 근거로 쓰지 않는다.

위 한국법 조문은 확인일 현재 **2026-08-11 시행본**을 참고했다. “오래됐으니 전세계에서 저작권 없음” 같은 자동 판정식을 사용하지 않는다. 사후 인격적 이익 관련 [제14조](https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0014&lsiSeq=283335&urlMode=lsScJoRltInfoR)도 있으므로 원저자·원전과 새 번역·편곡의 기여를 기록한다.

### 무료·예배용·CCLI와 리메이크 배포의 차이

[CCLI 한국 FAQ](https://ccli.com/kr/ko/frequent-questions)는 보호 중인 곡의 음원 제작·출판이 일반 라이선스 범위에 들지 않으며 해당 권리자의 별도 허락이 필요하다고 안내한다. [한국 스트리밍 안내](https://ccli.com/kr/ko/how-to-stream)도 비영리 예배와 곡 단위 커버 콘텐츠를 구분한다. CCLI 번호가 있거나 예배에 썼다는 사실만으로 개인 리메이크 음원의 발매 허락까지 받은 것으로 판단하지 않는다.

한국법의 [비영리 공연 예외](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0029&lsiSeq=283335&urlMode=lsScJoRltInfoR)를 녹음·배포·주문형 전송 전체의 허가로 넓히지 않는다. [출처 표시](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0037&lsiSeq=283335&urlMode=lsScJoRltInfoR)만으로 이용허락이 생기지도 않는다. [공유마당](https://gongu.copyright.or.kr/gongu/bbs/B0000023/list.do?menuNo=200210)의 자료는 항목별 만료·기증·CCL 조건을 읽는다. NC는 상업 이용, ND는 개작본 공개와 충돌할 수 있으므로 PD와 같은 분류로 섞지 않는다.

### 실제로 자주 혼동하는 버전

| 원전과 현대 버전 | 구분할 부분 | 확인 자료 |
| --- | --- | --- |
| Amazing Grace / My Chains Are Gone | Newton의 고전 가사·NEW BRITAIN과 현대에 추가한 후렴·편곡은 별개 | [공식 곡 소개](https://www.worshiptogether.com/songs/amazing-grace-my-chains-are-gone/)·[후렴/편곡 2006, 추가 편곡 2012 표시](https://liftupyourheartshymnal.org/songs/amazing-grace-my-chains-are-gone) |
| My Hope Is Built / Cornerstone | 고전 Mote 가사·Bradbury의 SOLID ROCK과 현대 후렴·새 음악 설정은 별개 | [Hillsong 공식 크레디트](https://hillsong.com/music/worship/cornerstone-deluxe-edition/cornerstone-live/lyrics)·[권리관리사 2011 표기](https://essentialmusicpublishing.com/songs/cornerstone-2/) |
| NETTLETON / 현대 오르간 편곡 | 전승 tune의 PD 표기와 해당 편곡의 © 2008이 같은 악보에 함께 존재 | [실제 편곡 미리보기](https://hymnary.org/files/previews/215257/15952.pdf) |

<a id="candidates"></a>

## 리메이크 후보 20곡

**확인 수준:** Hymnary의 해당 text·tune 또는 결합 항목에서 `Public Domain` 표기를 대조한 목록이다. 사이트의 표시가 세계 공통 법적 인증인 것은 아니다. 각 실제 리메이크는 수록판·페이지·절·선율을 고정하고 배포 지역의 이용 근거를 기록한다. 대표 텍스트 화면에도 현대 수정절이 있을 수 있어 전체 화면을 “최초 원문”으로 복사하지 않는다. 아래 한국어 제목에서 현행 한국어 가사를 추출하지 않는다.

| ID | 곡 식별·한국어 통용 제목 | 원어 가사 저자·연혁 | 지정 tune·연혁 | PD 표기·원전 근거 |
| --- | --- | --- | --- | --- |
| H01 | Amazing Grace / 나 같은 죄인 살리신 | John Newton, 1779 출판 | NEW BRITAIN, 전승. 1829 인쇄, 이 가사와 1835 결합. William Walker는 수집·편곡·출판 맥락 | [text](https://www.hymnary.org/text/amazing_grace_how_sweet_the_sound) · [tune](https://www.hymnary.org/tune/new_britain) · [미 의회도서관 연혁](https://www.loc.gov/collections/amazing-grace/articles-and-essays/timeline/) |
| H02 | Holy, Holy, Holy! Lord God Almighty! / 거룩 거룩 거룩 전능하신 주님 | Reginald Heber. 1823 메타데이터, 최초 인쇄는 자료 안의 1825/1826/1827 설명이 상충 | NICAEA, John Bacchus Dykes, 1861 | [text와 이견](https://www.hymnary.org/text/holy_holy_holy_lord_god_almighty_early) · [지정 조합·PD](https://www.hymnary.org/hymn/LUYH2013/538) |
| H03 | It Is Well with My Soul / 내 평생에 가는 길 | Horatio G. Spafford, 1873 작성·1876 출판 | VILLE DU HAVRE, Philip P. Bliss, 1876 | [text·tune·PD](https://hymnary.org/hymn/LUYH2013/451) · [1876 설명](https://hymnary.org/text/when_peace_like_a_river_attendeth_my_way) |
| H04 | When I Survey the Wondrous Cross / 주 달려 죽은 십자가 | Isaac Watts, 1707 | HAMBURG, Lowell Mason, 1824 표기. 다른 tune과 구분 | [지정 조합·PD](https://www.hymnary.org/hymn/LUYH2013/175) · [text](https://hymnary.org/text/when_i_survey_the_wondrous_cross_watts?extended=true) |
| H05 | Blessed Assurance / 예수로 나의 구주 삼고 | Fanny Crosby, 1873 | ASSURANCE 또는 BLESSED ASSURANCE, Phoebe Palmer Knapp, 1873 | [text](https://hymnary.org/text/blessed_assurance_jesus_is_mine?extended=false) · [tune](https://hymnary.org/tune/blessed_assurance_jesus_is_mine_knapp?extended=true) · [1903 수록판](https://hymnary.org/hymn/HH1903/175) |
| H06 | What a Friend We Have in Jesus / 죄짐 맡은 우리 구주 | Joseph Medlicott Scriven, 1855 작성 표기 | CONVERSE, 별칭 ERIE, Charles Crozat Converse, 1868 | [text](https://hymnary.org/text/what_a_friend_we_have_in_jesus_all_our_s?page=0) · [1898판·양쪽 PD](https://hymnary.org/hymn/CH1898/315) |
| H07 | Rock of Ages / 만세 반석 열리니 | Augustus Montague Toplady, 1775 일부·1776 전체 가사 | TOPLADY, Thomas Hastings. 1830 작곡 표기·1832 출판 설명 | [text](https://hymnary.org/text/rock_of_ages_cleft_for_me_let_me_hide) · [tune](https://hymnary.org/tune/toplady_hastings) |
| H08 | Come, Thou Fount of Every Blessing / 복의 근원 강림하사 | Robert Robinson, 1758 기록·1759 현존 인쇄 설명. Martin Madan의 1760 수정판 구분 | NETTLETON, 작곡자 미상. John Wyeth 편집본 1813 수록 | [text와 판본](https://www.hymnary.org/text/come_thou_fount_of_every_blessing) · [tune·귀속](https://hymnary.org/tune/nettleton?extended=true&page=9&tab=rtexts) |
| H09 | Just as I Am, Without One Plea / 큰 죄에 빠진 날 위해 | Charlotte Elliott, 1836 표기·재출판 설명. 최초 연도를 하나로 단정하지 않음 | WOODWORTH, William B. Bradbury, 1849 | [text](https://www.hymnary.org/text/just_as_i_am_without_one_plea) · [tune](https://hymnary.org/tune/woodworth_bradbury) |
| H10 | Abide with Me / 때 저물어서 날이 어두니 | Henry Francis Lyte, 1847 작성·낱장 인쇄, 유고집 1850 | EVENTIDE, William Henry Monk, 1861 | [text](https://hymnary.org/text/abide_with_me_fast_falls_the_eventide) · [tune](https://hymnary.org/tune/eventide_monk) |
| H11 | Nearer, My God, to Thee / 내 주를 가까이 하게 함은 | Sarah Flower Adams, 1840 작성 표기·1841 출판 맥락 | BETHANY (Mason), Lowell Mason, 1856. BETHANY (Smart)와 다름 | [text](https://hymnary.org/text/nearer_my_god_to_thee_nearer_to_thee_een) · [tune](https://hymnary.org/tune/bethany_mason) |
| H12 | The Church's One Foundation / 교회의 참된 터는 | Samuel J. Stone, 1866, Lyra Fidelium | AURELIA, Samuel Sebastian Wesley, 1864. 이 가사와 1868 결합 | [text](https://hymnary.org/text/the_churchs_one_foundation?page=1) · [tune](https://hymnary.org/tune/aurelia_wesley) · [1927 수록판](https://www.hymnary.org/hymn/HCH11927/134) |
| H13 | I Need Thee Every Hour / 주 음성 외에는 | Annie S. Hawks, 후렴 Robert Lowry. 1872 작성·연주, 출판은 자료 안의 1872/1873 설명이 상충 | NEED 또는 LOWRY, Robert Lowry, 1872 | [text와 이견](https://hymnary.org/text/i_need_thee_every_hour_most_gracious_lor?sort=date) · [tune](https://hymnary.org/tune/need_lowry?extended=true) · [1898 수록판](https://hymnary.org/hymn/CH1898/255) |
| H14 | To God Be the Glory / 식별용 직역: 하나님께 영광 | Fanny J. Crosby. 1875 메타데이터와 1870 최초 출판 해설이 상충 | TO GOD BE THE GLORY, William Howard Doane, 1875 표기 | [text와 이견](https://www.hymnary.org/text/to_god_be_the_glory_great_things_he_hath) · [tune](https://www.hymnary.org/tune/to_god_be_the_glory_doane) · [1879 수록판](https://hymnary.org/hymn/GHTB1879/42) |
| H15 | All Hail the Power of Jesus' Name / 주 예수 이름 높이어 | Edward Perronet, 1779~1780 인쇄. John Rippon의 1787 개작 구분 | CORONATION, Oliver Holden, 1793. DIADEM 등과 구분 | [text·판본](https://hymnary.org/text/all_hail_the_power_of_jesus_name_let) · [tune](https://hymnary.org/tune/coronation_holden?extended=true&tab=media) |
| H16 | My Hope Is Built on Nothing Less / 이 몸의 소망 무언가 | Edward Mote, 1834 표기 | SOLID ROCK, William B. Bradbury, 1863 작곡·1864 출판 | [text](https://www.hymnary.org/text/my_hope_is_built_on_nothing_less) · [tune](https://hymnary.org/tune/solid_rock_bradbury) |
| H17 | 'Tis So Sweet to Trust in Jesus / 구주 예수 의지함이 | Louisa M. R. Stead, 1882, Songs of Triumph | TRUST IN JESUS, William James Kirkpatrick. 해당 가사·음악의 1882 판본 기준 | [text](https://hymnary.org/text/tis_so_sweet_to_trust_in_jesus_just_to?extended=true&page=0) · [1882 출처·양쪽 PD](https://www.hymnary.org/hymn/CYBER/6771?highlight=&media=text) |
| H18 | Pass Me Not, O Gentle Savior / 인애하신 구세주여 | Fanny J. Crosby, 1868 작성·1870 출판 | PASS ME NOT, William H. Doane, 1870 | [조합·양쪽 PD](https://www.hymnary.org/hymn/LUYH2013/422) · [1868/1870 악보](https://hymnary.org/media/fetch/121634) |
| H19 | Sweet Hour of Prayer / 내 기도하는 그 시간 | W. W. Walford 귀속, 1845 최초 인쇄 설명. 정확한 신원·귀속은 이견 | SWEET HOUR, William B. Bradbury, 1861, Golden Chain | [text·귀속 설명](https://hymnary.org/text/sweet_hour_of_prayer_sweet_hour_of_pray) · [tune·PD 악보](https://hymnary.org/media/fetch/101445) |
| H20 | Softly and Tenderly Jesus Is Calling / 예수가 우리를 부르는 소리 | Will Lamartine Thompson, 1880, Sparkling Gems | SOFTLY AND TENDERLY 또는 THOMPSON, Will Lamartine Thompson, 1880 | [text·tune 설명](https://hymnary.org/text/softly_and_tenderly_jesus_is_calling) · [1880·PD 악보](https://hymnary.org/media/fetch/123452) |

H02·H09·H13·H14·H19의 연도·귀속 이견은 실제 자료에 남아 있어 임의로 한 숫자로 합치지 않았다. 이 표의 수록 연혁은 작성·인쇄·작곡·가사와 선율 결합을 구별한다. 원전 스캔의 모든 음표·절을 전수 대조한 결과는 아니며, 특정 곡 제작 시 실제 사용할 판본을 별도로 대조한다.

**처음 고를 만한 조합:** H01+R01은 단순한 회중형, H03+R02는 감정의 대비가 있는 밴드형, H06+R05는 기도형, H19+R15는 가사 없는 묵상형이다. 이는 품질·흥행을 보장하는 순위가 아니다.

<a id="modes"></a>

## 원래 선율 유지와 새 작곡의 차이

| 작업 | 가능한 입력 경로 | 결과를 설명하는 방법 |
| --- | --- | --- |
| 옛 선율을 유지하며 편곡 변경 | 직접 연주·녹음하거나 사용 근거가 확인된 오디오를 가져와 ACE `coverAudio` 또는 `recording` 사용 | 참조 기반 리메이크. 원 선율·리듬·가사의 실제 준수는 청취로 점검 |
| 옛 영문 가사에 새 음악 | 확인한 가사를 보존해 일반 `song:generate` | 기존 가사를 사용한 새 작곡. 원래 찬송가 멜로디의 리메이크라고 단정하지 않음 |
| 새로운 한국어 번역·번안 | 사용자가 번역·번안을 명시적으로 요청한 원전으로 초안을 작성하고 검토 | 새 번역임을 표시. 현행 한국어 찬송가 가사를 몰래 복사하거나 제공 가사를 대체하지 않음 |
| 한국어 가사를 그대로 유지한 편곡 | 해당 가사의 이용 근거와 보존 요구를 기록하고 참조 기반 생성 | 승인된 가사와 실행 전 정리본의 차이를 먼저 확인 |
| 찬송 선율의 연주곡 | 허락된 참조 오디오 + `instrumental:true` | 보컬 없이 선율을 살린 편곡 의도. 실제 선율·허밍 유무는 청취 |

**곡 제목·장르 태그만 입력하면 모델이 그 곡의 원래 멜로디를 정확히 재현한다는 보장은 없다.** `style`은 새 편곡의 음색·보컬·공간감을 설명하는 곳이며 악보·음원 자체를 대신하지 않는다. ACE의 커버 강도도 모든 음표·가창을 고정하는 수치가 아니다. 정확한 원형 유지가 요구되면 참조 녹음과 결과를 비교하고, 맞지 않으면 임의의 새 곡을 완료본으로 제출하지 않는다.

<a id="recipes"></a>

## 현대 CCM 편곡 16가지

최근 제작 방향은 [2025~2026 CCM 근거](ccm-prompts.md#research)의 회중 참여·고백·라이브/어쿠스틱 병행을 참고했다. R&B·로파이·네오소울·신스팝 등은 선택 폭을 넓히는 창작 변형이며 최신 시장 순위가 입증된 항목은 아니다. BPM은 새 편곡의 의도이고 실제 참조 오디오의 리듬이 결과에 영향을 준다. 악기명은 CLI 지원 값이며 기본 `strict:false`다.

| ID | 예시 대상 | 편곡 방향 | style | BPM | parts.instruments | 유형 |
| --- | --- | --- | --- | ---: | --- | --- |
| R01 | H01 | 여성 회중 모던 워십 | `contemporary worship hymn, warm female lead, congregational unison, restrained verses, gradual build, spacious chorus` | 76 | `piano, acoustic guitar, drums` | 보컬 |
| R02 | H03 | 애절한 CCM 록발라드 | `Christian hymn rock ballad, expressive female lead, melodic guitar, restrained verses, soaring chorus, hopeful resolution` | 76 | `piano, electric guitar, drums` | 보컬 |
| R03 | H02 | 현대 찬송·현악 | `modern sacred hymn, clear mixed vocals, steady hymn phrasing, warm strings, reverent, resolved ending` | 82 | `piano, acoustic guitar, string ensemble` | 보컬 |
| R04 | H05 | 가스펠 콰이어 | `gospel hymn, soulful female lead, mixed choir harmonies, joyful pocket, restrained vocal runs, clear diction` | 104 | `piano, bass guitar, drums` | 보컬 |
| R05 | H06 | 피아노 기도 | `intimate prayer hymn, soft female lead, spacious pauses, gentle dynamics, clear diction, quiet ending` | 64 | `piano` | 보컬 |
| R06 | H04 | 고난절 앰비언트 | `contemplative hymn instrumental, soft piano motifs, slow evolving textures, spacious, solemn, gentle dynamics` | 60 | `piano, cello, synth pads` | 연주곡 |
| R07 | H08 | 인디 포크 예배 | `indie worship hymn, intimate female lead, fingerpicked guitar, organic warmth, gentle harmonies, reflective` | 88 | `acoustic guitar, piano, cello` | 보컬 |
| R08 | H07 | CCM R&B | `Christian hymn R&B, warm female lead, restrained vocal runs, laid back groove, clear diction, intimate` | 78 | `Rhodes electric piano, bass guitar, drums` | 보컬 |
| R09 | H10 | 위로의 피아노·현악 | `devotional hymn ballad, tender female lead, warm strings, spacious phrasing, prayerful, restrained vibrato` | 68 | `piano, cello, string ensemble` | 보컬 |
| R10 | H11 | 왈츠 느낌의 워십 | `worship hymn ballad, warm male lead, three four waltz feel, gentle sway, simple phrasing, small room ambience` | 72 | `piano, acoustic guitar, cello` | 보컬 |
| R11 | H16 | 청년 팝록 | `worship hymn pop rock, clear mixed vocals, driving guitars, melodic bass, communal energy, bright resolution` | 128 | `electric guitar, bass guitar, drums` | 보컬 |
| R12 | H15 | 밝은 신스팝 찬양 | `worship hymn synth pop, bright female lead, pulsing synth chords, crisp groove, joyful group harmonies` | 118 | `synthesizer, bass guitar, drums` | 보컬 |
| R13 | H12 | 공동체 라이브 앤섬 | `congregational hymn anthem, warm male lead, mixed unison backing, clean delay guitar, expansive final verse` | 80 | `piano, electric guitar, drums` | 보컬 |
| R14 | H17 | 네오소울 묵상 | `gospel hymn neo soul, warm male lead, mellow harmony, relaxed pocket, reflective prayer, restrained` | 82 | `Rhodes electric piano, bass guitar, brushed drums` | 보컬 |
| R15 | H19 | 로파이 기도 연주 | `prayer hymn lofi instrumental, mellow electric piano, relaxed pocket, warm texture, restrained percussion` | 72 | `Rhodes electric piano, upright bass, brushed drums` | 연주곡 |
| R16 | H20 | 남녀 듀엣 고백 | `worship hymn duet, warm male and female vocals, blended harmonies, gentle phrasing, intimate, prayerful` | 80 | `piano, acoustic guitar, cello` | 보컬 |

보컬 레시피의 `Korean`·`English` 언어 태그는 **실제로 사용하도록 승인된 가사 언어**에 맞춰 보완한다. 한국어 제목을 골랐다는 이유로 영어 원문을 자동 번역하지 않는다. 강한 콰이어·후렴 표현도 가사에 없던 새 절·후렴을 추가하라는 뜻은 아니다. `6/8`·`3/4`의 `/`는 스타일 구분자로 바뀌므로 필요하면 `six eight time`·`three four waltz feel`처럼 요청한다.

<a id="prompts"></a>

## 상세 리메이크 요청 프롬프트

아래 공통 요청을 먼저 붙이고 원하는 R 레시피 요청을 이어서 사용한다. 이것은 AI 작업 지시이며 긴 문장 전체를 `style`에 넣지 않는다.

### 모든 리메이크에 붙일 공통 요청

```text
기존 Road Music CLI를 찾아 AGENTS.md와 docs/hymn-remake-guide.md를 읽어줘.
지정한 H 원전의 실제 text/tune·판본·이용 지역과 내가 제공한 가사·참조 녹음의 근거를 확인해줘.
내가 제공한 가사·프롬프트·지정 옵션은 그대로 보존하고 문서 예시로 교체하거나 임의 번역·개사하지 마.
새 한국어 번역이나 새 후렴이 좋겠다면 공식 가이드와 장르 문서의 근거를 붙여 제안만 해줘.
선율 유지 여부와 새 작곡을 구분하고, 참조가 필요하면 기존의 허락된 녹음부터 확인해줘.
전체 입력·최종 caption·정리 전후 차이·권리 확인 범위를 보여주고 승인된 안으로만 1곡 생성해줘.
```

### R01. Amazing Grace를 여성 회중 워십으로

```text
H01의 Newton 영문 가사와 NEW BRITAIN을 원전으로 R01 편곡을 준비해줘.
보컬은 따뜻한 여성 리드, 76 BPM 의도, piano·acoustic guitar·drums, strict=false로 해줘.
직접 연주한 원선율 녹음이 있으면 ACE 참조 기반으로 사용하고 길이는 원본 경로를 따라줘.
제공한 절·반복 순서를 보존하고 마지막 절의 화음·공간감만 넓히는 방향을 제안해줘.
현대 My Chains Are Gone의 추가 후렴이나 기존 음원은 가져오지 마.
```

### R02. It Is Well을 애절한 CCM 록발라드로

```text
H03의 지정 원전과 VILLE DU HAVRE를 R02로 편곡하는 안을 준비해줘.
76 BPM 의도, piano·electric guitar·drums, 절제된 첫 절과 힘 있는 여성 후반 보컬을 원해.
내 가사의 절과 후렴을 유지하고 기타·드럼의 고조만 style로 요청해줘.
새 Bridge 가사를 만들지 말고 필요한 편곡 제안은 입력과 분리해서 보여줘.
```

### R03. Holy, Holy, Holy를 현대 찬송으로

```text
H02의 Heber 가사와 NICAEA를 선택해 R03을 준비해줘.
82 BPM 의도, piano·acoustic guitar·string ensemble, 명료한 혼성 보컬과 절제된 현악을 원해.
원전의 절 형식을 존중하고 제공된 한국어 가사가 있으면 그 가사를 보존해줘.
최초 출판연도의 자료 이견을 임의로 확정하지 말고 실제 사용할 판본을 기록해줘.
```

### R04. Blessed Assurance를 가스펠 화음으로

```text
H05의 지정 가사·ASSURANCE를 R04의 소울풀한 여성 리드·혼성 화음으로 준비해줘.
104 BPM 의도, piano·bass guitar·drums, 즐거운 리듬과 명료한 후렴을 원해.
원문에 없는 응답 가사나 후렴을 자동 추가하지 마. 콰이어는 기존 가사의 화음으로 요청해줘.
보컬 장식이 원래 선율을 흐리면 원형 보존과 장식 중 어느 쪽을 우선할지 제안해줘.
```

### R05. What a Friend를 새벽 피아노 기도로

```text
H06의 가사·CONVERSE를 R05로 준비해줘.
64 BPM 의도, piano만, soft female lead와 긴 쉼을 원해. strict=true 시 caption 길이를 점검해줘.
내가 준 절을 삭제해서 길이를 맞추지 말고 참조 녹음의 길이와 가사 호흡을 먼저 비교해줘.
현행 한국어 번역의 권리 근거가 없으면 새 가사로 대체하지 말고 그 부분만 알려줘.
```

### R06. When I Survey를 묵상 연주로

```text
H04의 HAMBURG를 직접 연주한 참조 녹음으로 R06을 준비해줘.
보컬 없는 연주곡, piano·cello·synth pads, 60 BPM 의도, instrumental=true로 해줘.
이 경우에만 가사 입력을 비우고 원래 선율의 위치와 끝맺음을 청취로 점검해줘.
참조 없이 새 앰비언트 곡을 만들었다면 원래 찬송 선율 리메이크라고 부르지 마.
```

### R07. Come, Thou Fount를 인디 포크로

```text
H08의 선택한 영문 판본과 NETTLETON을 R07로 준비해줘.
88 BPM 의도, acoustic guitar·piano·cello, 가까운 여성 보컬과 자연스러운 방의 질감을 원해.
작곡자 미상의 전승 선율을 John Wyeth의 확정 작곡으로 표기하지 마.
원문 절과 선율은 보존하고 핑거스타일·화음·주악기 비중만 새로 제안해줘.
```

### R08. Rock of Ages를 차분한 CCM R&B로

```text
H07의 TOPLADY를 R08로 준비해줘.
78 BPM 의도, Rhodes electric piano·bass guitar·drums, 여성 리드와 절제된 장식을 원해.
R&B 리듬을 위해 가사를 빼거나 순서를 바꾸지 말고, 박에 맞추기 어려운 부분은 근거와 함께 제안해줘.
참조 오디오 강도는 선율 고정 기능이라고 설명하지 말고 실제 결과를 비교해줘.
```

### R09. Abide with Me를 위로의 현악 CCM으로

```text
H10의 EVENTIDE와 내가 제공한 가사를 R09로 준비해줘.
68 BPM 의도, piano·cello·string ensemble, 따뜻하고 절제된 여성 보컬을 원해.
원문에 없는 희망의 후렴을 자동 덧붙이지 말고, 현악·다이내믹으로 후반을 넓혀줘.
사용한 가사 판본과 새 편곡의 범위를 따로 기록해줘.
```

### R10. Nearer, My God를 왈츠 느낌으로

```text
H11의 BETHANY (Mason)를 R10으로 준비해줘. BETHANY (Smart)는 선택하지 마.
72 BPM 의도, piano·acoustic guitar·cello, 남성 보컬과 three four waltz feel을 요청해줘.
참조와 박자 의도가 충돌하면 가사·선율을 자동 재작성하지 말고 비교안으로 보여줘.
박자·조성이 정확히 구현됐는지는 청취하지 않았다면 미확인으로 표시해줘.
```

### R11. My Hope Is Built를 청년 팝록으로

```text
H16의 Mote 가사·Bradbury SOLID ROCK을 R11로 준비해줘.
128 BPM 의도, electric guitar·bass guitar·drums, 명료한 혼성 보컬을 원해.
현대 Cornerstone의 새 후렴·리프·음악 설정을 가져오지 말고 지정 고전 선율에서 출발해줘.
빠른 템포에서 음절이 빽빽하면 원문을 지우지 말고 템포·쉼의 대안을 먼저 제안해줘.
```

### R12. All Hail the Power를 신스팝 찬양으로

```text
H15의 선택한 Perronet/Rippon 판본과 CORONATION을 R12로 준비해줘.
118 BPM 의도, synthesizer·bass guitar·drums, 밝은 여성 리드와 기존 가사의 단체 화음을 원해.
가사를 춤 리듬에 맞춘 새 훅으로 교체하지 말고 반주 질감의 변형만 제안해줘.
다른 전통 tune인 DIADEM을 제목만 보고 섞지 마.
```

### R13. The Church's One Foundation을 공동체 앤섬으로

```text
H12의 AURELIA와 지정 가사를 R13으로 준비해줘.
80 BPM 의도, piano·electric guitar·drums, 남성 리드와 혼성 유니즌을 원해.
절이 이어지는 원래 구조를 유지하고 마지막 절의 악기·화음을 넓혀줘.
회중의 정확한 음역이나 실제 라이브 녹음이 보장되는 옵션인 것처럼 설명하지 마.
```

### R14. 'Tis So Sweet를 네오소울 묵상으로

```text
H17의 1882 출처와 TRUST IN JESUS를 R14로 준비해줘.
82 BPM 의도, Rhodes electric piano·bass guitar·brushed drums, 차분한 남성 보컬을 원해.
원래 후렴·신앙고백을 보존하고 재즈 화성·그루브는 요청 태그로만 제안해줘.
현대 음원의 보컬 애드리브나 화성을 직접 복제하지 마.
```

### R15. Sweet Hour of Prayer를 로파이 연주로

```text
H19의 SWEET HOUR를 직접 연주한 참조 녹음으로 R15를 준비해줘.
72 BPM 의도, Rhodes electric piano·upright bass·brushed drums, instrumental=true로 해줘.
가사를 비우는 것은 이 연주곡 요청의 범위이며 다른 보컬 요청에 적용하지 마.
짧은 선율 모티프·허밍 유무·끝부분을 점검하고 저자 귀속 이견은 그대로 기록해줘.
```

### R16. Softly and Tenderly를 남녀 듀엣으로

```text
H20의 지정 가사·선율을 R16으로 준비해줘.
80 BPM 의도, piano·acoustic guitar·cello, 따뜻한 남녀 듀엣과 겹치는 화음을 원해.
듀엣을 위해 원문 문장을 나누거나 새 응답을 쓰지 말고 먼저 배치 제안으로 보여줘.
가사 줄마다 실제 가수를 고정하는 전용 CLI 옵션은 추가하지 마.
```

<a id="cli"></a>

## CLI 절차와 JSON 예시

### 1. 먼저 지식과 현재 지원 입력 읽기

```bash
node cli/road-music.js prompt:knowledge
node cli/road-music.js prompt:knowledge --json '{"topic":"hymn-remake"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"ccm"}'
node cli/road-music.js prompt:knowledge --json '{"topic":"ace"}'
node cli/road-music.js schema --json '{"command":"song:generate"}'
```

지식 조회는 로컬 문서를 읽으며 앱·엔진을 시작하거나 입력을 수정하지 않는다. 실제 제작 준비 단계에서만 `app:state`, `engines:list`, `projects:list`, `songs:list`을 조회한다. 생성 또는 엔진 설치까지 이번 문서 조회의 권한으로 확대하지 않는다.

### 2. 사용할 가사·참조 녹음 고정

공개 원전의 선율을 직접 연주·녹음한 파일 또는 별도 이용 근거가 있는 파일을 사용한다. 아래 절대 경로는 자신의 실제 파일로 바꾼다.

```bash
node cli/road-music.js songs:import --input "/absolute/path/to/your-own-new-britain-recording.wav"
node cli/road-music.js songs:list
```

가져온 곡 응답의 **실제 `dir`**를 `coverAudio.dir`에 넣는다. 파일 경로를 곡 폴더 `dir`로 추측하지 않는다. 직접 녹음으로 시작한다면 `recording:pick --input`으로 앱 관리 녹음을 만들고 반환된 실제 `path`를 `recording.path`에 넣는다. [오디오 참조 옵션](music-options.md#reference-audio)을 따른다.

### 3. 실제 입력과 전달본 검증

원문 가사·프롬프트를 보관하고 `lyrics:clean`·`lyrics:check`·`prompt:compose`로 **같은 전체 입력**을 점검한다. 승인되지 않은 구절 삭제·후렴 추가·영한 번역을 원문에 반영하지 않는다. 최종 caption 512자·정리 가사 4,096자 한계를 넘으면 조용히 자르지 말고 대안을 제안한다. [구체적인 점검 파일 매핑](ccm-prompts.md#workflow)을 참고한다.

참조 기반 생성은 일반 생성의 `targetSeconds`를 넣어 원본 길이를 바꾸는 경로가 아니다. `coverAudio.strength`는 0.1~1이며 여기서 0.7은 출발 예시다. 입력·모델·참조에 따른 결과를 들어야 하며 “높을수록 원선율 완벽 보존”으로 설명하지 않는다.

아래 JSON은 입력 형태 예시이며, 실제 사용할 판본·가사·참조 경로를 확정한 완성 리메이크가 아니다.

#### 예시 A. H04/HAMBURG를 직접 연주한 곡의 묵상 연주 편곡

참조 곡의 실제 `dir`로 바꾼다. **연주곡 요청**이므로 빈 가사와 `instrumental:true`를 사용한다. 이 예시로 사용자의 보컬 가사를 지우지 않는다.

```json
{
  "title": "HAMBURG 묵상 연주 편곡",
  "engine": "ace",
  "style": "contemplative hymn instrumental, soft piano motifs, spacious, solemn, gentle dynamics",
  "lyrics": "",
  "instrumental": true,
  "count": 1,
  "seed": 42,
  "coverAudio": {"dir": "/absolute/path/from/songs-list", "strength": 0.7},
  "parts": {"instruments": ["piano", "cello", "synth pads"], "bpm": 60, "strict": false}
}
```

#### 예시 B. H19/SWEET HOUR 직접 녹음으로 시작한 로파이 연주

`recording:pick`이 반환한 관리 파일의 실제 `path`로 바꾼다. `recording.targetSeconds:0`은 원본을 사용하는 선택이다. 커버 입력과 녹음 입력을 같은 요청에 섞지 않는다.

```json
{
  "title": "SWEET HOUR 로파이 기도 연주",
  "engine": "ace",
  "style": "prayer hymn lofi instrumental, mellow electric piano, relaxed pocket, warm texture, restrained percussion",
  "lyrics": "",
  "instrumental": true,
  "count": 1,
  "seed": 42,
  "recording": {"path": "/absolute/path/from/recording-pick.wav", "strength": 0.7, "targetSeconds": 0},
  "parts": {"instruments": ["Rhodes electric piano", "upright bass", "brushed drums"], "bpm": 72, "strict": false}
}
```

보컬 리메이크는 위 입력 형태에서 **사용자가 승인한 전체 가사**를 `lyrics`에 넣고 `instrumental:false`로 정하며 R01~R05·R07~R14·R16 중 해당 편곡을 사용한다. 현대 한국어 찬송가 가사를 이 문서에서 임의로 제공하거나 다른 원문으로 대체하지 않는다. 실제 가사·caption·참조 경로·정리 차이를 검토한 뒤 승인된 JSON 하나를 파일로 저장한다.

```bash
node cli/road-music.js song:generate --file hymn-song.json --events --wait
```

<a id="preservation"></a>

## 원문 보존과 추천

요청자가 제공한 가사·프롬프트·옵션은 그대로 보관한다. 지식은 **권리·기술 제약 확인과 미지정 부분의 제안**에 사용하며 예시 가사로 대체하지 않는다. 추천하려면 사용자 원문과 제안 내용을 나누고 [공식 ACE 적용 가이드](ace-prompt-guide.md), [태그 가이드](lyrics-tags.md), [CCM 레시피](ccm-prompts.md)의 해당 근거를 제시한다.

```text
내가 준 가사와 style은 그대로 보존해줘.
원전·권리·기술 제약만 점검하고 개선 아이디어가 있으면 변경점과 근거를 제안해줘.
추천을 실제 입력에 반영하거나 번역·후렴을 추가하는 것은 내가 요청했을 때만 해줘.
```

권리 근거가 없는 한국어 가사를 받았다고 자동으로 다른 가사로 바꾸지 않는다. 그 가사의 이용 근거가 미확인임을 설명하고, 허락 확인·만료된 원전 선택·새 번역 요청 등의 대안을 제안한다. 생성 전 필수 정리가 원문 보존과 충돌하는 경우에도 같은 방식으로 차이를 보여준다. [원문·전달본 구분](music-review.md#preserve-input)을 따른다.

<a id="record"></a>

## 출처와 결과 기록

곡을 선택하면 아래 정보를 작업 기록에 남긴다. 목록에서 곡을 골랐다는 사실만으로 모든 항목을 확인 완료 처리하지 않는다.

```text
선택 H / 원제 / 지정 tune:
사용 원전 판본·발행연도·페이지·URL:
원 가사 저자·편집/수정절 저자 / 선율 작곡·편곡자:
작사·작곡·번역·수정절 저자의 사망연도와 근거 / 적용 판본의 공표연도:
해당 원전의 만료 판단 지역·기준일·근거:
한국어 가사: 사용자 제공 원문 / 허락된 판본 / 명시적으로 요청된 새 번역
참조 녹음: 직접 녹음 / 별도 이용조건 / 사용하지 않음
사용자 원문과 엔진 전달본의 차이·승인 범위:
새 편곡 R / 실제 caption·옵션·seed:
공개 대상 국가·플랫폼 / 미확인 부분:
완료 파일·실제 가사·선율 보존 청취 결과:
```

원곡 가사·선율의 기여와 새 번역·편곡·녹음의 기여를 구분해 표기한다. 완성 음원과 실제 가사·caption·원래 JSON·참고 근거를 함께 제공한다. 파일 검증만 했다면 원선율·가창·한국어 발음·음질을 청취 검증했다고 보고하지 않는다. PD 원전을 사용했어도 플랫폼의 자동 권리 주장까지 발생하지 않는다는 보장은 하지 않는다.
