'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createReleaseNote, resolveReleaseNote } = require('../scripts/release-notes')

async function fixture (t, version = '1.4.4') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-release-notes-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'releases'), { recursive: true })
  await fs.mkdir(path.join(root, 'docs', 'releases'), { recursive: true })
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version }))
  return root
}

function note ({ date = '2026-10-15', slug = 'ace-guides', version = '1.4.4', title = 'ACE 가이드', body = '# 변경 사항\n\n내용\n' } = {}) {
  return `<!-- road-music-release: ${JSON.stringify({ date, slug, version, title })} -->\n\n${body}`
}

test('날짜·파일명·제목·경로를 엄격히 검증하고 기존 초안을 덮어쓰지 않는다', async t => {
  const root = await fixture(t)
  await assert.rejects(createReleaseNote(root, { date: '2026-02-30', slug: 'ace-guides', title: 'ACE 가이드' }), /날짜/)
  await assert.rejects(createReleaseNote(root, { date: '2026-10-15', slug: '../escape', title: 'ACE 가이드' }), /slug/)
  await assert.rejects(createReleaseNote(root, { date: '2026-10-15', slug: 'ace-guides', title: '줄바꿈\n주입' }), /제목/)
  const created = await createReleaseNote(root, { date: '2026-10-15', slug: 'ace-guides', title: 'ACE 가이드' })
  assert.equal(path.relative(root, created.path), 'releases/2026-10-15-ace-guides.md')
  await assert.rejects(createReleaseNote(root, { date: '2026-10-15', slug: 'ace-guides', title: 'ACE 가이드' }), /이미 존재/)
  await createReleaseNote(root, { date: '2026-10-16', slug: 'cli-guides', title: 'CLI 가이드', version: '1.4.4' })
  await assert.rejects(createReleaseNote(root, { date: '2026-10-17', slug: 'duplicate-version', title: '중복 버전', version: '1.4.4' }), /이미 존재/)
})

test('같은 안정 버전의 날짜 노트는 fail closed로 거부한다', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'releases', '2026-10-15-ace-guides.md'), note())
  await fs.writeFile(path.join(root, 'releases', '2026-10-16-cli-guides.md'), note({ date: '2026-10-16', slug: 'cli-guides' }))
  await assert.rejects(resolveReleaseNote(root, '1.4.4'), /중복/)
})

test('메타데이터 날짜·버전이 파일명과 안정 버전 규칙을 벗어나면 배포 전에 실패한다', async t => {
  const root = await fixture(t)
  const file = path.join(root, 'releases', '2026-10-15-ace-guides.md')
  await fs.writeFile(file, note({ date: '2026-10-14' }))
  await assert.rejects(resolveReleaseNote(root, '1.4.4'), /파일명과 메타데이터/)
  await fs.writeFile(file, note({ version: '1.4' }))
  await assert.rejects(resolveReleaseNote(root, '1.4.4'), /안정 버전/)
})

test('안정 버전은 날짜 노트를 우선하고 메타데이터를 제거한 본문만 출력한다', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'releases', '2026-10-15-ace-guides.md'), note({ title: 'ACE 작사 가이드' }))
  await fs.writeFile(path.join(root, 'docs', 'releases', 'v1.4.4.md'), '# 레거시\n')
  const result = await resolveReleaseNote(root, '1.4.4')
  assert.equal(result.source, 'dated')
  assert.equal(result.title, 'v1.4.4 — ACE 작사 가이드')
  assert.doesNotMatch(result.body, /road-music-release/)
  assert.match(result.body, /^# 변경 사항/m)
})

test('날짜 노트가 없으면 기존 docs/releases 노트를 사용하고 없으면 실패한다', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'releases', '2026-10-15-ace-guides.md'), note({ version: 'unreleased' }))
  await fs.writeFile(path.join(root, 'docs', 'releases', 'v1.4.4.md'), '# 기존 노트\n')
  const result = await resolveReleaseNote(root, '1.4.4')
  assert.equal(result.source, 'legacy')
  assert.equal(result.title, 'v1.4.4 — GitHub 업데이트')
  await fs.rm(path.join(root, 'docs', 'releases', 'v1.4.4.md'))
  await assert.rejects(resolveReleaseNote(root, '1.4.4'), /릴리스 노트/)
})

test('패키지 버전과 요청 버전이 일치해야 하며 GitHub 출력은 한 줄 값만 쓴다', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'releases', '2026-10-15-ace-guides.md'), note({ title: '안전한 제목' }))
  await assert.rejects(resolveReleaseNote(root, '1.4.5'), /package.json/)
  const output = path.join(root, 'rendered.md')
  const githubOutput = path.join(root, 'github-output.txt')
  await resolveReleaseNote(root, '1.4.4', { output, githubOutput })
  assert.doesNotMatch(await fs.readFile(output, 'utf8'), /road-music-release/)
  assert.deepEqual((await fs.readFile(githubOutput, 'utf8')).trim().split('\n'), [
    `release_note_path=${output}`,
    'release_title=v1.4.4 — 안전한 제목'
  ])
})
