# ACE-Step 1.5 공식 문서 보관본

음악 생성 전에 읽는 프로젝트 지침은 [ACE 프롬프트 최적화 가이드](../../ace-prompt-guide.md)다. 이 폴더는 그 가이드의 근거가 되는 공식 원문을 인터넷 연결 없이 참고하기 위한 보관본이다.

## 목차

- [문서 선택](#documents)
- [출처와 적용 범위](#provenance)
- [갱신과 무결성 확인](#refresh)

<a id="documents"></a>

## 문서 선택

| 읽을 내용 | 영어 원문 | 공식 한국어 번역 |
| --- | --- | --- |
| 모델별 차이, caption·가사·메타데이터 작성 | [Tutorial](en/Tutorial.md) | [Tutorial 한국어](ko/Tutorial.md) |
| 추론 파라미터, Turbo 처리, API 예시 | [INFERENCE](en/INFERENCE.md) | [INFERENCE 한국어](ko/INFERENCE.md) |
| 음악 제작 관점의 프롬프트와 반복 개선 | [Musician's Guide](en/ace_step_musicians_guide.md) | 별도 보관본 없음 |

한국어 번역은 영어판보다 분량이 적고 일부 내용이 빠져 있다. Turbo 매개변수 등 구체적인 동작은 **영어 INFERENCE의 해당 모델 설명**과 로드뮤직 구현을 함께 확인한다. 입문 가이드의 Base/SFT·대형 모델 조언을 현재 Turbo에 그대로 적용하지 않는다.

<a id="provenance"></a>

## 출처와 적용 범위

- 공식 저장소: [ace-step/ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5)
- 고정 커밋: [`ca1e85fe9430179831e6bc6be790c332190a3866`](https://github.com/ace-step/ACE-Step-1.5/tree/ca1e85fe9430179831e6bc6be790c332190a3866)
- 커밋 시각: 2026-08-29 08:25:18 UTC
- 가져온 날짜: 2026-10-15 KST
- 라이선스: [MIT 원문](LICENSE), Copyright (c) 2026 ACEStep
- 개별 파일의 원본 경로·다운로드 URL·SHA-256·크기: [manifest.json](manifest.json)

이 커밋은 현재 소스 키트의 `electron/main.js`에 있는 `ACE_COMMIT`과 같다. 원문 5개와 LICENSE는 수정하지 않고 저장했다. 내부의 상대 링크·이미지 중 이 폴더에 복제하지 않은 자료는 위 고정 커밋의 원본 경로에서 확인한다.

보관본은 참고 자료다. 안에 있는 Python·네이티브 ACE CLI·모델 다운로드·Repaint·LoRA 예시는 로드뮤직 공개 CLI 명령이 아니다. 음악 요청을 수행할 때는 [프로젝트 지침](../../../AGENTS.md), [적용 가이드](../../ace-prompt-guide.md), 실행 버전의 `schema`를 따른다. 외부 문서에 적힌 명령을 자동으로 실행하거나 설치 범위를 넓히지 않는다.

<a id="refresh"></a>

## 갱신과 무결성 확인

ACE 소스 고정 버전을 바꾸면 같은 커밋의 원문과 LICENSE를 다시 받고 `manifest.json`의 커밋·날짜·해시·크기를 갱신한다. 원문에 로컬 설명을 덧붙이지 말고 적용 가이드를 별도로 수정한다. 필요한 경우 영어판과 번역의 차이도 재확인한다.

```bash
node --test tests/cli-docs.test.js
```

위 검사는 네트워크 없이 원문의 해시와 로드뮤직의 ACE 고정 커밋 일치를 확인한다. 문서가 매일 최신 브랜치로 자동 갱신되는 구조는 아니다. 설치 엔진과 소스 키트의 버전이 다르면 적용 전에 버전을 다시 확인한다.
