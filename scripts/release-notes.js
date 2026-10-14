#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const releasesDirectory = 'releases'
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const noteNamePattern = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/
const metadataPattern = /^<!-- road-music-release: ([^\r\n]+) -->\r?\n?/

function fail (message) { throw new Error(message) }

function assertStableVersion (version, label = '버전') {
  if (typeof version !== 'string' || !stableVersionPattern.test(version)) fail(`${label}은 안정 버전 X.Y.Z 형식이어야 합니다.`)
  return version
}

function assertDate (date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('날짜는 YYYY-MM-DD 형식이어야 합니다.')
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) fail('유효하지 않은 날짜입니다.')
  return date
}

function assertSlug (slug) {
  if (typeof slug !== 'string' || !slugPattern.test(slug)) fail('slug은 소문자 영문·숫자·하이픈만 사용할 수 있습니다.')
  return slug
}

function assertTitle (title) {
  if (typeof title !== 'string' || title.length === 0 || title.length > 120 || title.trim() !== title || /[\u0000-\u001f\u007f\u2028\u2029]/.test(title)) fail('제목은 줄바꿈·제어 문자가 없는 1~120자여야 합니다.')
  return title
}

function todayInSeoul () {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function parseMetadata (text, file) {
  const match = text.match(metadataPattern)
  if (!match) fail(`${file}: 한 줄 release 메타데이터가 없습니다.`)
  let metadata
  try { metadata = JSON.parse(match[1]) } catch { fail(`${file}: release 메타데이터 JSON이 잘못되었습니다.`) }
  if (!metadata || Array.isArray(metadata) || Object.getPrototypeOf(metadata) !== Object.prototype || Object.keys(metadata).sort().join(',') !== 'date,slug,title,version') fail(`${file}: release 메타데이터 객체가 잘못되었습니다.`)
  const { date, slug, version, title } = metadata
  assertDate(date)
  assertSlug(slug)
  if (version !== 'unreleased') assertStableVersion(version, '메타데이터 버전')
  assertTitle(title)
  return { metadata: { date, slug, version, title }, body: text.slice(match[0].length).trim() }
}

async function readDatedNotes (projectRoot) {
  const directory = path.join(projectRoot, releasesDirectory)
  let entries
  try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const notes = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md' || entry.name === 'TEMPLATE.md') continue
    const name = entry.name.match(noteNamePattern)
    if (!name) fail(`releases/${entry.name}: YYYY-MM-DD-kebab-title.md 이름이 필요합니다.`)
    const relativePath = path.join(releasesDirectory, entry.name)
    const absolutePath = path.join(directory, entry.name)
    const parsed = parseMetadata(await fs.readFile(absolutePath, 'utf8'), relativePath)
    if (parsed.metadata.date !== name[1] || parsed.metadata.slug !== name[2]) fail(`${relativePath}: 파일명과 메타데이터 날짜·slug가 일치하지 않습니다.`)
    if (!parsed.body) fail(`${relativePath}: 공개할 릴리스 본문이 없습니다.`)
    notes.push({ ...parsed, path: absolutePath, relativePath })
  }
  const seenVersions = new Map()
  for (const item of notes) {
    if (item.metadata.version === 'unreleased') continue
    const existing = seenVersions.get(item.metadata.version)
    if (existing) fail(`${existing.relativePath}와 ${item.relativePath}: 버전 ${item.metadata.version}의 릴리스 노트가 중복됩니다.`)
    seenVersions.set(item.metadata.version, item)
  }
  return notes
}

async function packageVersion (projectRoot) {
  let manifest
  try { manifest = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8')) } catch { fail('package.json의 version을 읽을 수 없습니다.') }
  return assertStableVersion(manifest.version, 'package.json 버전')
}

async function resolveReleaseNote (projectRoot, version, options = {}) {
  assertStableVersion(version)
  if (await packageVersion(projectRoot) !== version) fail('요청 버전이 package.json 버전과 일치하지 않습니다.')
  const notes = await readDatedNotes(projectRoot)
  const dated = notes.find(note => note.metadata.version === version)
  let resolved
  if (dated) {
    resolved = {
      source: 'dated',
      path: dated.path,
      body: `${dated.body}\n`,
      title: `v${version} — ${dated.metadata.title}`
    }
  } else {
    const legacyPath = path.join(projectRoot, 'docs', 'releases', `v${version}.md`)
    let body
    try { body = await fs.readFile(legacyPath, 'utf8') } catch { fail(`버전 ${version}의 릴리스 노트가 없습니다.`) }
    if (!body.trim()) fail(`docs/releases/v${version}.md: 공개할 릴리스 본문이 없습니다.`)
    resolved = { source: 'legacy', path: legacyPath, body: `${body.trim()}\n`, title: `v${version} — GitHub 업데이트` }
  }
  assertTitle(resolved.title)
  if (options.output !== undefined) {
    if (typeof options.output !== 'string' || !options.output || /[\r\n]/.test(options.output)) fail('출력 경로가 잘못되었습니다.')
    await fs.writeFile(options.output, resolved.body)
  }
  if (options.githubOutput !== undefined) {
    if (typeof options.githubOutput !== 'string' || !options.githubOutput || /[\r\n]/.test(options.githubOutput)) fail('GitHub 출력 경로가 잘못되었습니다.')
    if (options.output === undefined) fail('GitHub 출력에는 --output이 필요합니다.')
    await fs.appendFile(options.githubOutput, `release_note_path=${options.output}\nrelease_title=${resolved.title}\n`)
  }
  return resolved
}

async function createReleaseNote (projectRoot, options) {
  const date = assertDate(options.date || todayInSeoul())
  const slug = assertSlug(options.slug)
  const title = assertTitle(options.title)
  const version = options.version === undefined ? 'unreleased' : options.version
  if (version !== 'unreleased') assertStableVersion(version, '버전')
  const directory = path.join(projectRoot, releasesDirectory)
  const target = path.join(directory, `${date}-${slug}.md`)
  try { await fs.access(target); fail(`${path.relative(projectRoot, target)} 파일이 이미 존재합니다.`) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (version !== 'unreleased' && (await readDatedNotes(projectRoot)).some(note => note.metadata.version === version)) fail(`버전 ${version}의 릴리스 노트가 이미 존재합니다.`)
  const reference = version === 'unreleased' ? 'main' : `v${version}`
  const metadata = JSON.stringify({ date, slug, version, title })
  const body = `<!-- road-music-release: ${metadata} -->

# ${title}

> **상태:** ${version === 'unreleased' ? '공개 전 초안' : `v${version} 릴리스 후보`} · 이 노트의 링크는 GitHub Release에서도 열리도록 전체 GitHub URL을 사용합니다.

## 사용자 변경

- 내용을 작성하세요.

## 설치 영향

- 내용을 작성하세요.

## 검증

- 내용을 작성하세요.

## 제한과 참고

- [관련 문서](https://github.com/roadkwonai/music-road/blob/${reference}/docs/updates.md)
`
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(target, body, { flag: 'wx' })
  return { path: target, relativePath: path.relative(projectRoot, target) }
}

function parseArguments (argv) {
  const [command, ...rest] = argv
  if (!['create', 'resolve'].includes(command)) fail('사용법: release-notes.js create|resolve [옵션]')
  const values = {}
  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index]
    const value = rest[index + 1]
    if (!option?.startsWith('--') || value === undefined || value.startsWith('--') || Object.hasOwn(values, option)) fail('옵션은 --이름 값 형식으로 한 번씩 지정하세요.')
    values[option] = value
  }
  return { command, values }
}

async function main () {
  const { command, values } = parseArguments(process.argv.slice(2))
  if (command === 'create') {
    for (const key of Object.keys(values)) if (!['--date', '--slug', '--title', '--version'].includes(key)) fail(`알 수 없는 옵션: ${key}`)
    if (!values['--slug'] || !values['--title']) fail('create에는 --slug와 --title이 필요합니다.')
    const result = await createReleaseNote(root, { date: values['--date'], slug: values['--slug'], title: values['--title'], version: values['--version'] })
    console.log(JSON.stringify(result))
    return
  }
  for (const key of Object.keys(values)) if (!['--version', '--output', '--github-output'].includes(key)) fail(`알 수 없는 옵션: ${key}`)
  if (!values['--version']) fail('resolve에는 --version이 필요합니다.')
  const result = await resolveReleaseNote(root, values['--version'], { output: values['--output'], githubOutput: values['--github-output'] })
  console.log(JSON.stringify({ path: result.path, title: result.title, source: result.source }))
}

if (require.main === module) main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})

module.exports = { createReleaseNote, readDatedNotes, resolveReleaseNote, todayInSeoul }
