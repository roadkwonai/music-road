'use strict'

const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

async function regularFile (file, fsApi = fs) {
  const stat = await fsApi.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('실제 파일이 필요합니다.')
  return stat
}

async function replaceMetadata ({ dir, meta, verify, fs: fsApi = fs, platform = process.platform } = {}) {
  const target = path.join(dir, 'meta.json')
  const existing = await fsApi.lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('실제 곡 정보 파일이 필요합니다.')
  const previous = existing ? await fsApi.readFile(target, 'utf8') : null
  const stage = `${target}.delivery-${crypto.randomUUID()}.tmp`
  const backup = `${target}.delivery-${crypto.randomUUID()}.bak`
  const text = JSON.stringify(meta, null, 1)
  let movedPrevious = false
  try {
    await fsApi.writeFile(stage, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    if (platform === 'win32' && previous !== null) {
      await fsApi.rename(target, backup)
      movedPrevious = true
    }
    await fsApi.rename(stage, target)
    const stored = JSON.parse(await fsApi.readFile(target, 'utf8'))
    if (!verify(stored)) throw new Error('저장한 곡 정보가 최종 MP3와 일치하지 않습니다.')
    if (movedPrevious) await fsApi.rm(backup, { force: true }).catch(() => {})
    return stored
  } catch (error) {
    await fsApi.rm(stage, { force: true }).catch(() => {})
    try {
      if (movedPrevious) await fsApi.rename(backup, target)
      else if (previous !== null) {
        await fsApi.writeFile(stage, previous, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        await fsApi.rename(stage, target)
      } else await fsApi.rm(target, { force: true })
      if (previous !== null && await fsApi.readFile(target, 'utf8') !== previous) throw new Error('이전 곡 정보 검증에 실패했습니다.')
    } catch (rollback) {
      rollback.cause = error
      throw rollback
    } finally {
      await fsApi.rm(backup, { force: true }).catch(() => {})
      await fsApi.rm(stage, { force: true }).catch(() => {})
    }
    throw error
  }
}

function expectedSeconds (meta) {
  const seconds = Number(meta && meta.seconds)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

async function validateCompressedReplacement ({ wav, mp3, seconds, verifyAudio, fs: fsApi = fs } = {}) {
  const expected = expectedSeconds({ seconds })
  if (!wav || !mp3 || expected === null) return false
  await regularFile(mp3, fsApi)
  await regularFile(wav, fsApi)
  const actual = await verifyAudio(mp3)
  // MP3 encoder padding shifts the displayed duration by a few hundredths of a second.
  return Number.isFinite(actual) && Math.abs(actual - expected) <= 0.25
}

async function removeCompressedSource ({ dir, wav, mp3, meta, fs: fsApi = fs } = {}) {
  if (!wav || !mp3 || !meta || meta.status !== 'done' || path.resolve(meta.audio || '') !== path.resolve(mp3)) return false
  const expected = expectedSeconds(meta)
  if (expected === null) return false
  await regularFile(mp3, fsApi)
  await regularFile(wav, fsApi)
  const saved = JSON.parse(await fsApi.readFile(path.join(dir, 'meta.json'), 'utf8'))
  if (saved.status !== 'done' || path.resolve(saved.audio || '') !== path.resolve(mp3) || expectedSeconds(saved) !== expected) return false
  await fsApi.unlink(wav)
  return true
}

async function removeAceScratch (dir, meta, fsApi = fs) {
  if (!meta || meta.engineId !== 'ace') return false
  const scratch = path.join(dir, '_ace')
  const stat = await fsApi.lstat(scratch).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
  if (!stat) return false
  if (!stat.isDirectory() || stat.isSymbolicLink()) return false
  await fsApi.rm(scratch, { recursive: true, force: true })
  return true
}

async function trustedDeliveryRoot (root, fsApi = fs) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('trusted delivery workspace가 필요합니다.')
  const workspace = path.resolve(root)
  let base, output, marker, packageFile, structureFile
  try {
    [base, output, marker, packageFile, structureFile] = await Promise.all([
      fsApi.lstat(workspace),
      fsApi.lstat(path.join(workspace, 'Output')),
      fsApi.lstat(path.join(workspace, 'cli', 'road-music.js')),
      fsApi.lstat(path.join(workspace, 'package.json')),
      fsApi.lstat(path.join(workspace, '.roadmusic', 'structure.json'))
    ])
  } catch { throw new Error('trusted delivery workspace가 필요합니다.') }
  if (!base.isDirectory() || base.isSymbolicLink() || !output.isDirectory() || output.isSymbolicLink() ||
      !marker.isFile() || marker.isSymbolicLink() || !packageFile.isFile() || packageFile.isSymbolicLink() ||
      !structureFile.isFile() || structureFile.isSymbolicLink()) throw new Error('trusted delivery workspace가 필요합니다.')
  let packageJson, structure
  try {
    packageJson = JSON.parse(await fsApi.readFile(path.join(workspace, 'package.json'), 'utf8'))
    structure = JSON.parse(await fsApi.readFile(path.join(workspace, '.roadmusic', 'structure.json'), 'utf8'))
  } catch { throw new Error('trusted delivery workspace가 필요합니다.') }
  if (!packageJson || packageJson.name !== 'road-music' || !structure || structure.schemaVersion !== 1 ||
      structure.policy !== 'final-only' || structure.owner !== 'road-music' || structure.workspace !== workspace ||
      !['preparing', 'prepared', 'completed'].includes(structure.phase) ||
      typeof structure.planId !== 'string' || !/^[0-9a-f]{48}$/.test(structure.planId)) throw new Error('trusted delivery workspace가 필요합니다.')
  return { workspace, completed: structure.phase === 'completed' }
}

function deliveryVersion (value) {
  const version = value && (value.deliveryVersion || value)
  if (!version || typeof version !== 'object' || !['id', 'stamp', 'groupId', 'projectId'].every(key => typeof version[key] === 'string' && version[key])) {
    throw new Error('delivery response에 검증된 버전 정보가 없습니다.')
  }
  return Object.fromEntries(['id', 'stamp', 'groupId', 'projectId', 'createdAt', 'summary', 'reason']
    .filter(key => typeof version[key] === 'string')
    .map(key => [key, version[key]]))
}

async function recordFinalDelivery ({ deliveryRoot, dir, meta, reason = '', execute, fs: fsApi = fs } = {}) {
  if (!deliveryRoot) return { skipped: true, reason: 'delivery-root-not-configured' }
  if (!meta || meta.status !== 'done' || typeof meta.audio !== 'string' || !path.isAbsolute(meta.audio)) {
    throw new Error('완료된 실제 음원이 필요합니다.')
  }
  await regularFile(meta.audio, fsApi)
  if (typeof dir !== 'string' || !path.isAbsolute(dir) || typeof execute !== 'function') {
    throw new Error('완성본 보관 요청이 올바르지 않습니다.')
  }
  const trusted = await trustedDeliveryRoot(deliveryRoot, fsApi)
  if (!trusted.completed) return { skipped: true, reason: 'delivery-root-not-completed' }
  const root = trusted.workspace
  const result = await execute({ root, dir: path.resolve(dir), reason: typeof reason === 'string' ? reason : '' })
  return { deliveryVersion: deliveryVersion(result) }
}

module.exports = { replaceMetadata, validateCompressedReplacement, removeCompressedSource, removeAceScratch, recordFinalDelivery }
