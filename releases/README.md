# 릴리스 노트

버전 태그로 배포하기 전에 사용자에게 보일 변경 사항을 날짜별로 작성하는 공간입니다. 실제 GitHub Release는 이 폴더에서 해당 안정 버전을 찾고, 없을 때만 이전 [릴리스 아카이브](../docs/releases/)를 사용합니다.

[Road Music README](../README.md) · [업데이트와 배포](../docs/updates.md) · [패키징](../docs/packaging.md)

## 목차

- [최신 릴리스](#최신-릴리스)
- [통합 릴리스](#통합-릴리스)
- [작성 규칙](#작성-규칙)
- [배포 연동](#배포-연동)
- [이전 릴리스](#이전-릴리스)

## 최신 릴리스

| 날짜 | 노트 | 버전 |
| --- | --- | --- |
| 2026-10-15 | [찬송가 리메이크 지식과 원문 보존](2026-10-15-hymn-remake-knowledge.md) | 1.4.4 |

## 통합 릴리스

| 날짜 | 노트 | 버전 |
| --- | --- | --- |
| 2026-10-15 | [1.4.0 통합 배포](2026-10-15-road-music-1-4-0.md) | 1.4.0 |

## 작성 규칙

```bash
npm run release:note -- create --slug cli-guides --title "CLI 가이드 개선"
```

명령이 출력한 파일을 편집하세요. 직접 작성할 때는 [템플릿](TEMPLATE.md)을 복사하고 날짜·slug·제목을 바꿉니다.

1. `npm run release:note -- create --slug <kebab-title> --title <표시 제목>`으로 초안을 만듭니다. 날짜는 한국 시간(Asia/Seoul)으로 정합니다.
2. 파일명은 `YYYY-MM-DD-kebab-title.md`이고, 맨 첫 줄의 보이지 않는 메타데이터에서 `date`, `slug`, `version`, `title`을 함께 관리합니다. 기존 파일은 덮어쓰지 않습니다.
3. 버전 미지정 초안은 `"unreleased"`로 남습니다. 배포 대상이 정해지면 실제 안정 버전(`X.Y.Z`)으로만 바꿉니다. 한 안정 버전에는 날짜 노트가 하나만 있을 수 있습니다.
4. 본문에는 **사용자 변경**, **설치 영향**, **검증**, **제한과 참고**를 넣습니다. GitHub Release에서도 열리도록 문서 링크는 상대 경로 대신 `https://github.com/roadkwonai/music-road/blob/vX.Y.Z/...` 형식의 전체 URL을 사용합니다.

> [!IMPORTANT]
> `package.json`의 안정 버전, 태그 `vX.Y.Z`, 노트 메타데이터의 `version`은 같아야 합니다. 이미 공개한 태그·Release·노트는 고치지 않고 다음 버전에서 수정합니다.

## 배포 연동

태그 워크플로는 `npm run release:note -- resolve --version X.Y.Z`로 노트를 검사합니다. 메타데이터는 제거한 본문 파일만 GitHub Release에 올리므로 내부 메타데이터가 공개 본문에 보이지 않습니다.

날짜 노트가 아직 없는 과거 버전은 `docs/releases/vX.Y.Z.md`를 읽어 호환합니다. 새 날짜 노트가 있으면 그것을 우선하며, 잘못된 날짜·파일명·중복 버전·없는 노트는 배포 전에 실패합니다.

## 이전 릴리스

통합 전 1.4.x 변경 기록은 [기존 릴리스 아카이브](../docs/releases/)에서 보관합니다. 1.4.0 통합 이후의 변경은 최신 릴리스 노트에서 확인하며, 원격 발행 여부는 [GitHub Releases](https://github.com/roadkwonai/music-road/releases)에서 확인합니다.
