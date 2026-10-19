'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const LEGACY_ID = /^[0-9a-f]{20}$/
const LEGACY_SPECTRUM = /^([0-9a-f]{20})_([0-9a-f]{20})\.(?:bin|spectrum)$/
const MAX_LEGACY_FILES = 10000
const MAX_LEGACY_JSON = 1024 * 1024

function snapshot (stat, name) {
  return { name, dev: stat.dev, inode: stat.ino, bytes: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs }
}

function sameSnapshot (left, right) {
  return left && right && left.dev === right.dev && left.inode === right.inode && left.bytes === right.bytes && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
}

async function regular (file) {
  const stat = await fs.lstat(file)
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error('단일 링크 일반 파일이 아닙니다.')
  return stat
}

async function legacyCacheDir (userData) {
  const dataDir = path.resolve(userData)
  const dataStat = await fs.lstat(dataDir)
  if (dataStat.isSymbolicLink() || !dataStat.isDirectory() || await fs.realpath(dataDir) !== dataDir) throw new Error('앱 데이터 경로가 안전하지 않습니다.')
  const cacheDir = path.join(dataDir, 'video-cache')
  let cacheStat
  try { cacheStat = await fs.lstat(cacheDir) } catch (error) {
    if (error.code === 'ENOENT') return { dataDir, cacheDir, cacheSnapshot: null }
    throw error
  }
  if (cacheStat.isSymbolicLink() || !cacheStat.isDirectory() || await fs.realpath(cacheDir) !== cacheDir) throw new Error('공용 영상 캐시 경로가 안전하지 않습니다.')
  return { dataDir, cacheDir, cacheSnapshot: snapshot(cacheStat, 'video-cache') }
}

async function readRegular (file, limit = MAX_LEGACY_JSON) {
  const stat = await regular(file)
  if (stat.size > limit) throw new Error('파일 크기가 안전 한도를 초과했습니다.')
  const flags = require('node:fs').constants.O_RDONLY | (require('node:fs').constants.O_NOFOLLOW || 0)
  const handle = await fs.open(file, flags)
  try {
    const current = await handle.stat()
    if (!current.isFile() || !sameSnapshot(snapshot(stat, path.basename(file)), snapshot(current, path.basename(file)))) throw new Error('파일이 변경되었습니다.')
    return await handle.readFile()
  } finally { await handle.close() }
}

async function readPrefix (file, bytes) {
  const stat = await regular(file)
  const flags = require('node:fs').constants.O_RDONLY | (require('node:fs').constants.O_NOFOLLOW || 0)
  const handle = await fs.open(file, flags)
  try {
    const current = await handle.stat()
    if (!current.isFile() || !sameSnapshot(snapshot(stat, path.basename(file)), snapshot(current, path.basename(file)))) throw new Error('파일이 변경되었습니다.')
    const buffer = Buffer.alloc(Math.min(bytes, stat.size))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead)
  } finally { await handle.close() }
}

function validMeta (value, id) {
  return value && value.sourceHash === id && value.sampleRate === 48000 && [30, 60].includes(value.fps) &&
    Number.isFinite(value.seconds) && value.seconds > 0 && Number.isInteger(value.frameCount) && value.frameCount > 0 &&
    Math.abs(value.frameCount / value.fps - value.seconds) < 1e-7
}

function wavData (buffer) {
  if (buffer.length < 44 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') return null
  let offset = 12; let format = null; let data = null
  while (offset + 8 <= buffer.length) {
    const name = buffer.subarray(offset, offset + 4).toString('ascii')
    const bytes = buffer.readUInt32LE(offset + 4)
    const start = offset + 8; const end = start + bytes
    if (name === 'data') { data = { bytes, end: end + (bytes % 2) }; break }
    if (end > buffer.length) return null
    if (name === 'fmt ') format = buffer.subarray(start, end)
    offset = end + (bytes % 2)
  }
  if (!format || format.length < 16 || !data || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 2 || format.readUInt32LE(4) !== 48000 || format.readUInt16LE(14) !== 16) return null
  return data
}

async function validCycle (cacheDir, id, names) {
  const jsonName = `${id}.json`; const wavName = `${id}.wav`; const f32Name = `${id}.f32`
  if (!names.has(jsonName) || !names.has(wavName) || !names.has(f32Name)) throw new Error('cycle 파일 묶음이 완전하지 않습니다.')
  let meta
  try { meta = JSON.parse((await readRegular(path.join(cacheDir, jsonName))).toString('utf8')) } catch { throw new Error('cycle 메타데이터가 올바르지 않습니다.') }
  if (!validMeta(meta, id)) throw new Error('cycle 메타데이터가 올바르지 않습니다.')
  const expectedF32 = meta.seconds * 48000 * 4
  const expectedWav = meta.seconds * 48000 * 2 * 2
  if (!Number.isSafeInteger(expectedF32) || !Number.isSafeInteger(expectedWav)) throw new Error('cycle 길이가 안전하지 않습니다.')
  const wav = path.join(cacheDir, wavName); const f32 = path.join(cacheDir, f32Name)
  const wavStat = await regular(wav); const wavInfo = wavData(await readPrefix(wav, 4096))
  if ((await regular(f32)).size !== expectedF32 || !wavInfo || wavInfo.bytes !== expectedWav || wavStat.size !== wavInfo.end) throw new Error('cycle 오디오 크기가 맞지 않습니다.')
  return meta
}

async function validSpectrum (file, id, settingsHash, cycle) {
  const stat = await regular(file)
  const headerBytes = await readPrefix(file, MAX_LEGACY_JSON)
  const newline = headerBytes.indexOf(10)
  if (newline < 2 || newline > MAX_LEGACY_JSON) throw new Error('스펙트럼 헤더가 올바르지 않습니다.')
  let header
  try { header = JSON.parse(headerBytes.subarray(0, newline).toString('utf8')) } catch { throw new Error('스펙트럼 헤더가 올바르지 않습니다.') }
  const valid = header && header.version === 1 && header.sourceHash === id && header.analysisSettingsHash === settingsHash &&
    header.durationSeconds === cycle.seconds && header.sampleRate === 48000 && header.fps === cycle.fps && header.frameCount === cycle.frameCount &&
    Number.isInteger(header.barCount) && header.barCount >= 8 && header.barCount <= 256
  if (!valid || stat.size !== newline + 1 + header.frameCount * header.barCount * 4) throw new Error('스펙트럼 데이터가 맞지 않습니다.')
}

async function previewLegacyVideoCache (userData) {
  const { dataDir, cacheDir, cacheSnapshot } = await legacyCacheDir(userData)
  if (!cacheSnapshot) return { dataDir, cacheDir, cacheSnapshot: null, files: [], blocked: [], fileCount: 0, bytes: 0 }
  const entries = await fs.readdir(cacheDir, { withFileTypes: true })
  if (entries.length > MAX_LEGACY_FILES) throw new Error('공용 영상 캐시 파일 수가 안전 한도를 초과했습니다.')
  const names = new Set(entries.map(entry => entry.name))
  const blocked = []; const accepted = new Set(); const cycles = new Map()
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) blocked.push({ name: entry.name, reason: entry.isSymbolicLink() ? 'symlink는 보호됩니다.' : '일반 파일이 아니어서 보호됩니다.' })
  }
  for (const entry of entries.filter(item => item.isFile() && !item.isSymbolicLink() && LEGACY_ID.test(path.basename(item.name, '.json')) && item.name.endsWith('.json'))) {
    const id = path.basename(entry.name, '.json')
    try { cycles.set(id, await validCycle(cacheDir, id, names)); accepted.add(`${id}.json`); accepted.add(`${id}.wav`); accepted.add(`${id}.f32`) } catch (error) { blocked.push({ name: entry.name, reason: error.message }) }
  }
  for (const entry of entries.filter(item => item.isFile() && !item.isSymbolicLink() && LEGACY_SPECTRUM.test(item.name))) {
    const [, id, settingsHash] = entry.name.match(LEGACY_SPECTRUM)
    try {
      const cycle = cycles.get(id)
      if (!cycle) throw new Error('검증된 cycle이 없어 보호됩니다.')
      await validSpectrum(path.join(cacheDir, entry.name), id, settingsHash, cycle)
      accepted.add(entry.name)
    } catch (error) { blocked.push({ name: entry.name, reason: error.message }) }
  }
  for (const entry of entries) if (entry.isFile() && !entry.isSymbolicLink() && !accepted.has(entry.name) && !blocked.some(item => item.name === entry.name)) blocked.push({ name: entry.name, reason: '알 수 없는 캐시 파일은 보호됩니다.' })
  const files = []
  for (const name of [...accepted].sort()) files.push(snapshot(await regular(path.join(cacheDir, name)), name))
  return { dataDir, cacheDir, cacheSnapshot, files: files.map(file => ({ ...file, path: path.join(cacheDir, file.name) })), blocked, fileCount: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) }
}

async function cleanupLegacyVideoCache (plan) {
  if (!plan || !Array.isArray(plan.files) || !plan.cacheDir || !plan.dataDir) throw new Error('공용 영상 캐시 정리 계획이 올바르지 않습니다.')
  const current = await legacyCacheDir(plan.dataDir)
  if (!plan.cacheSnapshot && !current.cacheSnapshot && !plan.files.length) return { removedFiles: 0, freedBytes: 0, skipped: [] }
  if (current.cacheDir !== plan.cacheDir || !sameSnapshot(current.cacheSnapshot, plan.cacheSnapshot)) throw new Error('정리 계획 뒤 캐시 폴더가 변경되었습니다.')
  const dirFlags = require('node:fs').constants.O_RDONLY | (require('node:fs').constants.O_DIRECTORY || 0) | (require('node:fs').constants.O_NOFOLLOW || 0)
  const directory = await fs.open(current.cacheDir, dirFlags)
  const handles = []
  try {
    for (const item of plan.files) {
      if (!item || typeof item.name !== 'string' || !(/^[0-9a-f]{20}\.(?:json|wav|f32)$/.test(item.name) || LEGACY_SPECTRUM.test(item.name))) throw new Error('정리 계획 파일명이 안전하지 않습니다.')
      const target = path.join(current.cacheDir, item.name)
      if (path.dirname(target) !== current.cacheDir) throw new Error('정리 계획 경로가 안전하지 않습니다.')
      const before = await regular(target)
      if (!sameSnapshot(snapshot(before, item.name), item)) throw new Error('계획 뒤 캐시 파일이 변경되었습니다.')
      const handle = await fs.open(target, require('node:fs').constants.O_RDONLY | (require('node:fs').constants.O_NOFOLLOW || 0))
      const opened = await handle.stat()
      if (!opened.isFile() || !sameSnapshot(snapshot(opened, item.name), item)) { await handle.close(); throw new Error('계획 뒤 캐시 파일이 변경되었습니다.') }
      handles.push(handle)
    }
    const after = await fs.lstat(current.cacheDir)
    if (!sameSnapshot(snapshot(after, 'video-cache'), plan.cacheSnapshot)) throw new Error('정리 계획 뒤 캐시 폴더가 변경되었습니다.')
    let removed = 0; let freedBytes = 0
    const skipped = []
    for (const [index, item] of plan.files.entries()) {
      try {
        const dir = await fs.lstat(current.cacheDir)
        if (!dir.isDirectory() || dir.isSymbolicLink() || dir.dev !== plan.cacheSnapshot.dev || dir.ino !== plan.cacheSnapshot.inode || await fs.realpath(current.cacheDir) !== current.cacheDir) throw new Error('캐시 폴더가 변경되었습니다.')
        if (!sameSnapshot(snapshot(await regular(path.join(current.cacheDir, item.name)), item.name), item)) throw new Error('계획 뒤 캐시 파일이 변경되었습니다.')
        await fs.unlink(path.join(current.cacheDir, item.name))
        removed += 1; freedBytes += item.bytes
      } catch (error) {
        skipped.push(...plan.files.slice(index).map(file => ({ path: file.path, reason: error.message })))
        break
      }
    }
    return { removedFiles: removed, freedBytes, skipped }
  } finally {
    await Promise.allSettled(handles.map(handle => handle.close()))
    await directory.close()
  }
}

function videoCacheKey (tracks) {
  return crypto.createHash('sha256').update(JSON.stringify(tracks.map(track => path.resolve(track.path)))).digest('hex').slice(0, 32)
}

async function ownerProject (tracks, userData) {
  const key = videoCacheKey(tracks)
  if (tracks.length === 1) return { projectDir: path.dirname(path.resolve(tracks[0].path)), key }
  const parent = path.join(path.resolve(userData), 'video-cache-projects')
  const media = tracks.map(track => ({ path: path.resolve(track.path) }))
  await fs.mkdir(parent, { recursive: true })
  for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith(`-${key}`)) continue
    try {
      const marker = JSON.parse(await fs.readFile(path.join(parent, entry.name, 'studio-project.json'), 'utf8'))
      if (marker.schemaVersion === 1 && JSON.stringify(marker.media) === JSON.stringify(media)) return { projectDir: path.join(parent, entry.name), key }
    } catch {}
  }
  const label = String(tracks[0].title || path.basename(tracks[0].path, path.extname(tracks[0].path)))
    .replace(/[^\p{L}\p{N}._ -]/gu, '').trim().slice(0, 40) || '플레이리스트'
  const projectDir = path.join(parent, `${label}-외${tracks.length - 1}곡-${key}`)
  await fs.mkdir(projectDir, { recursive: true })
  const marker = path.join(projectDir, 'studio-project.json')
  try {
    await fs.writeFile(marker, JSON.stringify({ schemaVersion: 1, media }) + '\n', { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  return { projectDir, key }
}

async function prepareVideoStorage ({ tracks, userData, dispatch, pid, existingStorage }) {
  const key = videoCacheKey(tracks)
  if (existingStorage && existingStorage.key === key && !existingStorage.released) return existingStorage
  const { projectDir } = await ownerProject(tracks, userData)
  const cacheDir = path.join(projectDir, '.roadmusic', 'cache', 'video', key)
  const project = await dispatch('storage:register', { project: projectDir })
  const lease = await dispatch('storage:lease', { projectId: project.id, operation: 'acquire', pid })
  return { projectId: project.id, projectDir, cacheDir, token: lease.token, key }
}

async function trackVideoCache (storage, dispatch) {
  if (!storage.projectId) return null
  const entry = await dispatch('storage:track', {
    projectId: storage.projectId,
    path: path.relative(storage.projectDir, storage.cacheDir),
    kind: 'cache',
    reproducible: true,
    description: '재생성 가능한 영상 오디오·스펙트럼 캐시'
  })
  storage.entryId = entry.id
  return entry
}

async function releaseVideoStorage (storage, dispatch) {
  if (!storage || !storage.projectId || !storage.token || storage.released) return null
  const result = await dispatch('storage:lease', { projectId: storage.projectId, operation: 'release', token: storage.token })
  storage.released = true
  return result
}

function retainVideoStorage (storage, user) {
  if (!storage) return
  if (!storage.users) storage.users = new Set()
  storage.users.add(user)
}

async function releaseVideoStorageUser (storage, user, dispatch) {
  if (!storage) return null
  storage.users && storage.users.delete(user)
  if (storage.users && storage.users.size) return null
  return releaseVideoStorage(storage, dispatch)
}

module.exports = { videoCacheKey, prepareVideoStorage, trackVideoCache, releaseVideoStorage, retainVideoStorage, releaseVideoStorageUser, previewLegacyVideoCache, cleanupLegacyVideoCache }
