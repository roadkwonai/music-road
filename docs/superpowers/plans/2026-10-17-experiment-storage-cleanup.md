# 실험 복사 및 저장공간 정리 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 현재 프로그램·모델·곡·영상 결과물을 유지하면서 중복 앱과 Git 임시 파일을 제거하고 동일한 실험 복제를 방지한다.

**Architecture:** 기존 실험 복사 함수의 제외 규칙을 수정한다. 생성 폴더는 Git에서 제외하고 원본·결과물은 삭제하지 않는다. 영구 Git 객체·refs·reflog는 수정하지 않는다.

**Tech Stack:** Python 표준 라이브러리, Node 기본 테스트 러너, Git.

**Spec:** 현재 대화의 사용자 요청: 중복 Road Music 앱과 Git 임시 쓰레기 파일 정리, 실험 재발 방지, 현재 프로그램과 작업 결과물 유지.

## Global Constraints

- 실행 중 Electron 및 LTX 생성 프로세스를 중단하지 않는다.
- 최신 YuE2 build-final 앱과 모델·VAE·songs·masters·영상·이미지·문서 산출물을 보존한다.
- 삭제 전 실제 경로·프로세스·열린 파일·파일 지문을 검사하고 삭제 목록을 별도 임시 감사 파일에 고정한다.
- 앱은 확인된 Road Music.app 번들만 삭제한다. 부모 dist·Output 폴더는 통삭제하지 않는다.
- Git은 count-objects가 garbage로 분류한 오래된 objects/??/tmp_obj_* 중 열리지 않은 파일만 삭제한다.
- Git gc/prune, refs 변경, 자동 상시 정리·모델 다운로드·새 의존성 추가는 하지 않는다.

## Review Focus

- symlink로 보존 데이터에 접근하는 삭제 대상은 제외한다.
- 작업 중 쓰는 앱·Git 임시 파일은 삭제하지 않는다.
- 복사에서 배포 앱·중첩 앱·생성물·모델을 제외해도 소스·worker 수정·공유 의존성 링크가 유지되는지 fixture로 검증한다.
- .harness 설정과 코드 및 실험 준비 스크립트까지 Git에서 통째로 숨기지 않는다.
- 삭제와 병행한 다른 작업 변경은 덮어쓰지 않고 제한된 변경 파일만 검토한다.

## Task 1: 재발 방지

- [x] 테스트 먼저 추가하고 기존 동작에서 앱/생성물 복사가 재현되는지 확인한다.
- [x] 두 prepare_profiles.py의 복사 제외 규칙을 최소 수정한다.
- [x] .gitignore와 AGENTS.md에 생성물 제외 및 최소 복사·공유 모델 원칙을 반영한다.
- [x] 회귀 테스트와 Python 구문 검사 및 npm test, 변경 JavaScript node --check를 실행한다.

## Task 2: 확인된 중복 데이터 정리

- [x] 실제 파일 목록·크기·실행 프로세스·보존 대상을 기록한다.
- [x] 최신 build-final 앱 하나 및 실행 중 Electron을 보존하고 중복 앱 21개만 제거한다.
- [x] 사용 중이 아닌 오래된 Git 임시 garbage 11개만 제거한다.
- [x] 삭제 후 보존 파일·Git HEAD/index/refs·현재 프로그램·정리 용량을 검증한다.

## Task 3: 독립 검토 및 결과 보고

- [x] 수정과 삭제 경계에 대해 독립 검토를 받고 필요한 사항을 보완한다.
- [x] 변경 파일·확보 공간·테스트 결과와 남은 Git 영구 객체 용량을 보고한다.

정리 근거: 임시 감사 manifest/result 기록, 앱 21개·Git tmp 11개 삭제, 약 14.59GiB 확보. 보호 파일 240개·기존 결과 미디어 65,784개·Git 영구 객체 11,578개와 HEAD/index/refs 보존 확인.

최종 검증: npm test 201/201 통과, 신규 JavaScript node --check 및 두 Python AST 검사 통과, 독립 코드 검토 APPROVE(조치 사항 없음). Git garbage 0개, 실제 Road Music.app 1개 유지, Source Electron PID 6441 및 진행 중 LTX PID 96995 생존 확인. 디스크 여유 약 186GiB. 실제 음악·영상 생성 재실행은 하지 않음.
