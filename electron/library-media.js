'use strict'

// File-level import and replacement primitives.  The IPC layer owns project order
// and UI concerns; this module only ever swaps one already-resolved song folder.
const crypto = require('crypto')
const { execFile } = require('child_process')
const fs = require('fs/promises')
const path = require('path')

const COPY_EXTENSIONS = new Set(['.wav', '.mp3'])
const TAG_FIELDS = ['title', 'artist', 'album', 'genre', 'track', 'lyrics']
const MAX_BUFFER = 1024 * 1024

const fail = (message, code = 'INVALID_ARGUMENT') => {
  const error = new Error(message)
  error.code = code
  throw error
}

const isWithin = (child, root) => {
  const relative = path.relative(path.resolve(root), path.resolve(child))
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function safeRelativePath (value, name) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) fail(`${name}은(는) 상대 경로여야 합니다.`)
  const normalized = path.normalize(value)
  if (normalized === '.' || normalized === '..' || normalized.startsWith(`..${path.sep}`) || path.isAbsolute(normalized)) {
    fail(`${name}이(가) 폴더 밖을 가리킵니다.`)
  }
  return normalized
}

function relativePath (dir, file, name) {
  if (!isWithin(file, dir)) fail(`${name}이(가) 곡 폴더 밖을 가리킵니다.`)
  return safeRelativePath(path.relative(dir, file), name)
}

function relativeFile (dir, relative, name) {
  const result = path.resolve(dir, safeRelativePath(relative, name))
  if (!isWithin(result, dir)) fail(`${name}이(가) 곡 폴더 밖을 가리킵니다.`)
  return result
}

function requireAbsolute (value, name) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail(`${name}는 절대 경로여야 합니다.`)
  return path.resolve(value)
}

async function regularFile (file, name = '파일') {
  const stat = await fs.lstat(file).catch(() => null)
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) fail(`${name}은(는) 일반 파일이어야 합니다.`)
  return stat
}

async function directory (dir, name = '폴더') {
  const stat = await fs.lstat(dir).catch(() => null)
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) fail(`${name}은(는) 심볼릭 링크가 아닌 폴더여야 합니다.`)
  return stat
}

async function assertTreeWithoutLinks (dir) {
  await directory(dir)
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) fail('심볼릭 링크가 포함된 곡 폴더는 교체할 수 없습니다.')
    if (entry.isDirectory()) await assertTreeWithoutLinks(target)
  }
}

function safeBase (title) {
  const value = String(title || '무제').replace(/[\\/:*?"<>|#%\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim() || '무제'
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(value) ? `${value}_` : value
}

function audioBaseName (audioBase, title, dir) {
  const name = typeof audioBase === 'function' ? audioBase
    : audioBase && typeof audioBase.name === 'function' ? audioBase.name : null
  const result = name ? name(title, dir) : safeBase(title)
  if (typeof result !== 'string' || !result || result !== path.basename(result) || result === '.' || result === '..') {
    fail('안전하지 않은 음원 파일명입니다.')
  }
  return result
}

function libraryRoot (audioBase, dir) {
  if (typeof audioBase === 'string') return requireAbsolute(audioBase, '음원 라이브러리')
  if (audioBase && typeof audioBase.root === 'string') return requireAbsolute(audioBase.root, '음원 라이브러리')
  // shortcut: assumes Songs/<project>/<song> for legacy callers; pass { root, name } when paths differ.
  return path.resolve(dir, '..', '..')
}

function exec (file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, maxBuffer: MAX_BUFFER, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = String(stdout || '')
        error.stderr = String(stderr || '')
        reject(error)
      } else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

function unescapeMetadata (value) {
  let result = ''
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\\' && index + 1 < value.length) result += value[++index]
    else result += value[index]
  }
  return result
}

function metadataLines (text) {
  const source = String(text)
  const logical = []
  let line = ''
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (character !== '\n') { line += character; continue }
    let slashes = 0
    for (let cursor = line.length - 1; cursor >= 0 && line[cursor] === '\\'; cursor--) slashes++
    // ffmetadata writes a CRLF value as CR + escaped LF ("\r\\\n").  An odd
    // slash run escapes this LF; an even run contains literal backslashes instead.
    if (slashes % 2) line = `${line.slice(0, -1)}\n`
    else {
      logical.push(line)
      line = ''
    }
  }
  if (line) logical.push(line)
  return logical
}

function parseFfmetadata (text) {
  const tags = {}
  let global = true
  for (const line of metadataLines(text)) {
    if (/^\[[^\]]+\]$/.test(line.trim())) { global = false; continue }
    if (!global) continue
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    let split = -1
    for (let index = 0; index < line.length; index++) {
      if (line[index] === '\\') index++
      else if (line[index] === '=') { split = index; break }
    }
    if (split < 1) continue
    const key = unescapeMetadata(line.slice(0, split)).trim().toLowerCase()
    if (TAG_FIELDS.includes(key)) tags[key] = unescapeMetadata(line.slice(split + 1))
  }
  return tags
}

async function readTags (ffmpeg, file) {
  if (!ffmpeg) fail('메타데이터를 읽으려면 ffmpeg가 필요합니다.', 'FFMPEG_UNAVAILABLE')
  const { stdout } = await exec(ffmpeg, ['-hide_banner', '-i', file, '-f', 'ffmetadata', '-'])
  return parseFfmetadata(stdout)
}

async function probeSeconds (ffmpeg, file) {
  if (!ffmpeg) return null
  try {
    await exec(ffmpeg, ['-hide_banner', '-i', file])
    return null
  } catch (error) {
    const match = String(error.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null
  }
}

const localStamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

async function sha256 (file) {
  const hash = crypto.createHash('sha256')
  const handle = await fs.open(file, 'r')
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (!bytesRead) break
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
  } finally { await handle.close() }
  return hash.digest('hex')
}

async function emptyDestination (dir, root) {
  if (!isWithin(dir, root)) fail('곡 폴더가 라이브러리 밖에 있습니다.')
  const existing = await fs.lstat(dir).catch(() => null)
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) fail('곡 폴더가 안전하지 않습니다.')
    if ((await fs.readdir(dir)).length) fail('대상 곡 폴더가 비어 있지 않습니다.')
    return false
  }
  const parent = path.dirname(dir)
  await fs.mkdir(parent, { recursive: true })
  await directory(parent, '곡 폴더의 상위 폴더')
  await fs.mkdir(dir)
  return true
}

async function writeMeta (dir, meta) {
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
}

async function prepareImport ({ file, dir, ffmpeg, titleFallback = '', now = new Date(), audioBase }) {
  const source = requireAbsolute(file, '원본 파일')
  const target = requireAbsolute(dir, '곡 폴더')
  const root = libraryRoot(audioBase, target)
  await regularFile(source, '원본 파일')
  const created = await emptyDestination(target, root)
  try {
    const extension = path.extname(source).toLowerCase()
    if (!extension) fail('음원 파일 확장자가 없습니다.')
    const tags = await readTags(ffmpeg, source)
    const title = Object.hasOwn(tags, 'title') && tags.title.trim() ? tags.title.trim() : String(titleFallback || path.basename(source, extension)).trim() || '무제'
    // Metadata remains verbatim; only a normalized display-safe title reaches a path helper.
    const base = audioBaseName(audioBase, safeBase(title), target)
    const audio = path.join(target, `${base}${COPY_EXTENSIONS.has(extension) ? extension : '.wav'}`)
    const sourceInfo = {
      originalPath: source,
      originalName: path.basename(source),
      sha256: await sha256(source),
      preservedPath: null
    }
    let audioFormat = 'source-copy'
    if (COPY_EXTENSIONS.has(extension)) {
      await fs.copyFile(source, audio)
      if (await sha256(audio) !== sourceInfo.sha256) fail('복사한 원본 음원 검증에 실패했습니다.', 'COPY_VERIFY_FAILED')
      sourceInfo.preservedPath = audio
    }
    else {
      if (!ffmpeg) fail('원본 변환에 ffmpeg가 필요합니다.', 'FFMPEG_UNAVAILABLE')
      const sourceDir = path.join(target, '.source')
      await fs.mkdir(sourceDir)
      const preserved = path.join(sourceDir, `original${extension}`)
      await fs.copyFile(source, preserved)
      if (await sha256(preserved) !== sourceInfo.sha256) fail('보존한 원본 음원 검증에 실패했습니다.', 'COPY_VERIFY_FAILED')
      sourceInfo.preservedPath = preserved
      await exec(ffmpeg, ['-hide_banner', '-y', '-i', preserved, '-vn', '-c:a', 'pcm_s32le', audio])
      audioFormat = 'pcm_s32le'
    }
    await regularFile(audio, '가져온 음원')
    const seconds = await probeSeconds(ffmpeg, audio)
    const meta = {
      id: 'imported', title, imported: true, status: 'done', audio,
      audioRelativePath: relativePath(target, audio, '활성 음원 경로'),
      seconds: seconds === null ? null : Math.round(seconds * 10) / 10,
      instrumental: false, createdAt: localStamp(now), audioFormat, source: sourceInfo
    }
    meta.source.preservedRelativePath = relativePath(target, sourceInfo.preservedPath, '보존 원본 경로')
    for (const field of TAG_FIELDS) if (field !== 'title' && Object.hasOwn(tags, field)) meta[field] = tags[field]
    await writeMeta(target, meta)
    return { dir: target, audio, meta, source: sourceInfo }
  } catch (error) {
    if (created) await fs.rm(target, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

function backupRootFor (dir, backupRoot, audioBase) {
  const root = backupRoot ? requireAbsolute(backupRoot, '백업 폴더') : path.join(path.dirname(dir), '.roadmusic-backups')
  if (!isWithin(root, audioBase)) fail('백업 폴더가 라이브러리 밖에 있습니다.')
  return root
}

async function prepareBackupRoot (root) {
  const existing = await fs.lstat(root).catch(() => null)
  if (existing) await directory(root, '백업 폴더')
  else await fs.mkdir(root, { recursive: true })
}

function backupName (dir, now) {
  return `${path.basename(dir)}-${localStamp(now).replace(/[:]/g, '')}-${crypto.randomBytes(4).toString('hex')}`
}

async function readMeta (dir) {
  const file = path.join(dir, 'meta.json')
  await regularFile(file, '곡 메타데이터')
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('곡 메타데이터가 올바르지 않습니다.')
    return value
  } catch (error) {
    if (error.code) throw error
    fail('곡 메타데이터를 읽을 수 없습니다.')
  }
}

async function copyBackground (from, to) {
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (entry.isFile() && /^background\.[a-z0-9]+$/i.test(entry.name)) await fs.copyFile(path.join(from, entry.name), path.join(to, entry.name))
  }
}

function previousProvenance (meta) {
  const previous = {}
  for (const field of ['title', 'request', 'style', 'engine', 'engineId', 'seed', 'jobId', 'createdAt', 'parts']) {
    if (Object.hasOwn(meta, field)) previous[field] = meta[field]
  }
  return previous
}

function mergedReplacementMeta (fresh, old, backup, now) {
  const result = { ...fresh, imported: true }
  for (const field of TAG_FIELDS) if (!Object.hasOwn(result, field) && Object.hasOwn(old, field)) result[field] = old[field]
  if (old.backgroundName) result.backgroundName = old.backgroundName
  for (const field of ['style', 'engine', 'engineId', 'seed', 'jobId', 'request', 'parts', 'cover']) delete result[field]
  result.provenance = { previous: previousProvenance(old), replacedAt: now.toISOString(), backup }
  return result
}

function relocateActivePaths (meta, from, to) {
  const audioRelativePath = typeof meta.audioRelativePath === 'string'
    ? safeRelativePath(meta.audioRelativePath, '활성 음원 경로') : relativePath(from, meta.audio, '활성 음원 경로')
  const result = { ...meta, audioRelativePath, audio: relativeFile(to, audioRelativePath, '활성 음원 경로') }
  if (meta.source) {
    const preservedRelativePath = typeof meta.source.preservedRelativePath === 'string'
      ? safeRelativePath(meta.source.preservedRelativePath, '보존 원본 경로')
      : relativePath(from, meta.source.preservedPath, '보존 원본 경로')
    result.source = { ...meta.source, preservedRelativePath, preservedPath: relativeFile(to, preservedRelativePath, '보존 원본 경로') }
  }
  return result
}

function manifestMatchesTarget (manifest, target) {
  if (!manifest || typeof manifest !== 'object') return false
  if (manifest.schema === 1) return manifest.targetDir === target
  return manifest.schema === 2 && manifest.targetFolder === path.basename(target)
}

async function discoverPrimaryAudio (dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const extension of ['.wav', '.mp3']) {
    const entry = entries.filter((item) => item.isFile() && path.extname(item.name).toLowerCase() === extension)
      .sort((a, b) => a.name.localeCompare(b.name))[0]
    if (entry) return safeRelativePath(entry.name, '주 음원 경로')
  }
  fail('주 음원 파일을 찾을 수 없습니다.')
}

async function primaryAudioRelativePath (dir, meta) {
  if (typeof meta.audioRelativePath === 'string') return safeRelativePath(meta.audioRelativePath, '주 음원 경로')
  if (typeof meta.audio === 'string' && isWithin(meta.audio, dir)) return relativePath(dir, meta.audio, '주 음원 경로')
  return discoverPrimaryAudio(dir)
}

async function writeBackupManifest (dir, now) {
  const marker = path.join(dir, '.roadmusic-backup.json')
  const existing = await fs.lstat(marker).catch(() => null)
  if (existing) {
    await regularFile(marker, '기존 백업 정보')
    let previous
    try { previous = JSON.parse(await fs.readFile(marker, 'utf8')) } catch { fail('기존 백업 정보가 올바르지 않습니다.') }
    if (!manifestMatchesTarget(previous, dir)) fail('다른 곡의 백업 정보를 교체할 수 없습니다.')
  }
  const meta = await readMeta(dir)
  const primaryRelativePath = await primaryAudioRelativePath(dir, meta)
  await regularFile(relativeFile(dir, primaryRelativePath, '주 음원 경로'), '주 음원')
  await fs.writeFile(marker, JSON.stringify({ schema: 2, targetDir: dir, targetFolder: path.basename(dir), primaryAudioRelativePath: primaryRelativePath, backedUpAt: now.toISOString() }, null, 1), { encoding: 'utf8', flag: existing ? 'w' : 'wx', mode: 0o600 })
}

async function validateRestorableStage (stage, target, manifest) {
  const meta = await readMeta(stage)
  let audioRelativePath
  if (typeof meta.audioRelativePath === 'string') audioRelativePath = safeRelativePath(meta.audioRelativePath, '백업 활성 음원 경로')
  else if (typeof manifest.primaryAudioRelativePath === 'string') audioRelativePath = safeRelativePath(manifest.primaryAudioRelativePath, '백업 주 음원 경로')
  else if (typeof meta.audio === 'string' && typeof manifest.targetDir === 'string' && isWithin(meta.audio, manifest.targetDir)) {
    audioRelativePath = relativePath(manifest.targetDir, meta.audio, '백업 활성 음원 경로')
  } else audioRelativePath = await discoverPrimaryAudio(stage)
  const stagedAudio = relativeFile(stage, audioRelativePath, '백업 활성 음원 경로')
  if (!/\.(wav|mp3)$/i.test(stagedAudio)) fail('백업 활성 음원 형식이 지원되지 않습니다.')
  await regularFile(stagedAudio, '백업 활성 음원')
  const next = { ...meta, audioRelativePath, audio: relativeFile(target, audioRelativePath, '활성 음원 경로') }
  const structuredSource = meta.source && typeof meta.source === 'object' && !Array.isArray(meta.source) &&
    typeof meta.source.sha256 === 'string' && (typeof meta.source.preservedRelativePath === 'string' || typeof meta.source.preservedPath === 'string')
  if (structuredSource) {
    let preservedRelativePath
    if (typeof meta.source.preservedRelativePath === 'string') preservedRelativePath = safeRelativePath(meta.source.preservedRelativePath, '백업 보존 원본 경로')
    else if (manifest.schema === 1 && typeof meta.source.preservedPath === 'string' && isWithin(meta.source.preservedPath, manifest.targetDir)) {
      preservedRelativePath = relativePath(manifest.targetDir, meta.source.preservedPath, '백업 보존 원본 경로')
    } else fail('백업 보존 원본 경로가 없습니다.')
    const stagedSource = relativeFile(stage, preservedRelativePath, '백업 보존 원본 경로')
    await regularFile(stagedSource, '백업 보존 원본')
    if (typeof meta.source.sha256 === 'string' && await sha256(stagedSource) !== meta.source.sha256) fail('백업 보존 원본의 SHA-256이 일치하지 않습니다.')
    next.source = { ...meta.source, preservedRelativePath, preservedPath: relativeFile(target, preservedRelativePath, '보존 원본 경로') }
  }
  return next
}

async function moveWithRollback ({ dir, stage, backup, now }) {
  let originalMoved = false
  try {
    // The marker travels with the old folder, so an interrupted rename stays recoverable.
    await writeBackupManifest(dir, now)
    await fs.rename(dir, backup)
    originalMoved = true
    await fs.rename(stage, dir)
  } catch (error) {
    if (originalMoved && !(await fs.lstat(dir).catch(() => null))) {
      try { await fs.rename(backup, dir) } catch (restoreError) {
        error.backup = backup
        error.restoreError = restoreError.message
      }
    }
    throw error
  } finally {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {})
  }
}

async function replaceSong ({ dir, file, ffmpeg, backupRoot, audioBase, now = new Date() }) {
  const target = requireAbsolute(dir, '곡 폴더')
  const root = libraryRoot(audioBase, target)
  if (!isWithin(target, root)) fail('곡 폴더가 라이브러리 밖에 있습니다.')
  await assertTreeWithoutLinks(target)
  const old = await readMeta(target)
  const backups = backupRootFor(target, backupRoot, root)
  await prepareBackupRoot(backups)
  const stage = await fs.mkdtemp(path.join(path.dirname(target), `.${path.basename(target)}.staging-`))
  const backup = path.join(backups, backupName(target, now))
  try {
    const fresh = await prepareImport({ file, dir: stage, ffmpeg, titleFallback: old.title, now, audioBase: root })
    await copyBackground(target, stage)
    const meta = relocateActivePaths(mergedReplacementMeta(fresh.meta, old, backup, now), stage, target)
    await fs.rm(path.join(stage, 'meta.json'))
    await writeMeta(stage, meta)
    await moveWithRollback({ dir: target, stage, backup, now })
    return { dir: target, audio: meta.audio, meta, backup }
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function restoreSong ({ dir, backup, backupRoot, audioBase, now = new Date() }) {
  const target = requireAbsolute(dir, '곡 폴더')
  const root = libraryRoot(audioBase, target)
  const source = requireAbsolute(backup, '백업 곡 폴더')
  if (!isWithin(target, root)) fail('곡 폴더가 라이브러리 밖에 있습니다.')
  const backups = backupRootFor(target, backupRoot, root)
  if (path.dirname(source) !== backups) fail('백업 곡 폴더가 지정된 백업 폴더에 없습니다.')
  const targetStat = await fs.lstat(target).catch(() => null)
  if (targetStat) await assertTreeWithoutLinks(target)
  await assertTreeWithoutLinks(source)
  let manifest
  try { manifest = JSON.parse(await fs.readFile(path.join(source, '.roadmusic-backup.json'), 'utf8')) } catch { fail('복구할 백업 정보가 없습니다.') }
  if (!manifestMatchesTarget(manifest, target)) fail('다른 곡의 백업은 복구할 수 없습니다.')
  await prepareBackupRoot(backups)
  const stage = await fs.mkdtemp(path.join(path.dirname(target), `.${path.basename(target)}.restore-`))
  const currentBackup = path.join(backups, backupName(target, now))
  try {
    await fs.rm(stage, { recursive: true, force: true })
    await fs.cp(source, stage, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true })
    await fs.rm(path.join(stage, '.roadmusic-backup.json'))
    await assertTreeWithoutLinks(stage)
    const meta = await validateRestorableStage(stage, target, manifest)
    await fs.rm(path.join(stage, 'meta.json'))
    await writeMeta(stage, meta)
    if (!targetStat) {
      await fs.rename(stage, target)
      return { dir: target, audio: meta.audio || null, meta, backup: null, restoredFrom: source }
    }
    await moveWithRollback({ dir: target, stage, backup: currentBackup, now })
    return { dir: target, audio: meta.audio || null, meta, backup: currentBackup, restoredFrom: source }
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function listBackups ({ dir, audioBase }) {
  const target = requireAbsolute(dir, '곡 폴더')
  const root = libraryRoot(audioBase, target)
  if (!isWithin(target, root)) fail('곡 폴더가 라이브러리 밖에 있습니다.')
  const backups = backupRootFor(target, null, root)
  const entries = await fs.readdir(backups, { withFileTypes: true }).catch(() => [])
  const found = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const backup = path.join(backups, entry.name)
    try {
      await assertTreeWithoutLinks(backup)
      const manifestFile = path.join(backup, '.roadmusic-backup.json')
      await regularFile(manifestFile, '백업 정보')
      const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
      if (!manifestMatchesTarget(manifest, target) || typeof manifest.backedUpAt !== 'string') continue
      const meta = await readMeta(backup)
      found.push({ backup, title: typeof meta.title === 'string' ? meta.title : path.basename(target), backedUpAt: manifest.backedUpAt })
    } catch { /* malformed backups are never offered for restore */ }
  }
  return found.sort((a, b) => b.backedUpAt.localeCompare(a.backedUpAt))
}

module.exports = { prepareImport, replaceSong, restoreSong, listBackups, parseFfmetadata, sha256 }
