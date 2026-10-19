'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')

const META = 'meta.json'
const BACKUP = '.meta-before-lyrics.json'

function failure (message, code, options = {}) {
  const error = new Error(message, { cause: options.cause })
  error.code = code
  if (options.backupPath) error.backupPath = options.backupPath
  return error
}

async function regularFile (fsApi, file, { missing = false } = {}) {
  let stat
  try {
    stat = await fsApi.lstat(file)
  } catch (error) {
    if (missing && error.code === 'ENOENT') return null
    throw error
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw failure('실제 곡 정보 파일이 필요합니다.', 'UNSAFE_METADATA')
  return stat
}

async function readMeta (fsApi, file) {
  await regularFile(fsApi, file)
  let meta
  try {
    meta = JSON.parse(await fsApi.readFile(file, 'utf8'))
  } catch (error) {
    throw failure('올바른 곡 정보가 아닙니다.', 'UNSAFE_METADATA', { cause: error })
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw failure('올바른 곡 정보가 아닙니다.', 'UNSAFE_METADATA')
  return meta
}

async function removeRegularFile (fsApi, file) {
  const stat = await regularFile(fsApi, file, { missing: true })
  if (stat) await fsApi.unlink(file)
}

async function cleanupStage (fsApi, file, created) {
  if (!created) return
  try { await removeRegularFile(fsApi, file) } catch {}
}

async function setWindowsHidden (file, platform, hide) {
  if (platform !== 'win32') return { hidden: null }
  if (hide) {
    await hide(file)
    return { hidden: true }
  }
  // Tests can exercise the Windows replacement protocol on another OS. Attribute
  // restoration is only attempted on Windows where attrib is available.
  if (process.platform !== 'win32') return { hidden: false }
  await new Promise((resolve, reject) => execFile('attrib', ['+h', file], error => error ? reject(error) : resolve()))
  return { hidden: true }
}

async function recoverMetadata ({ dir, platform = process.platform, fs: fsApi = fs } = {}) {
  if (!dir || typeof dir !== 'string') throw failure('곡 폴더가 필요합니다.', 'INVALID_ARGUMENT')
  const metaPath = path.join(dir, META)
  const backupPath = path.join(dir, BACKUP)
  const meta = await regularFile(fsApi, metaPath, { missing: true })
  // A completed save wins over a stale journal. Do not roll back a later success.
  if (meta) return { recovered: false, metaPath }
  if (platform !== 'win32') return { recovered: false, metaPath }
  const backup = await regularFile(fsApi, backupPath, { missing: true })
  if (!backup) return { recovered: false, metaPath }
  await readMeta(fsApi, backupPath)
  try {
    await fsApi.rename(backupPath, metaPath)
  } catch (error) {
    throw failure('곡 정보 복구에 실패했습니다.', 'METADATA_RECOVERY_FAILED', { cause: error, backupPath })
  }
  return { recovered: true, metaPath }
}

async function writeSongLyrics ({ dir, lyrics, platform = process.platform, fs: fsApi = fs, hide } = {}) {
  if (!dir || typeof dir !== 'string' || typeof lyrics !== 'string') throw failure('곡 폴더와 가사가 필요합니다.', 'INVALID_ARGUMENT')
  const metaPath = path.join(dir, META)
  const backupPath = path.join(dir, BACKUP)
  const meta = await readMeta(fsApi, metaPath)
  if (meta.lyrics === lyrics) return { updated: false, metaPath }

  const stat = await regularFile(fsApi, metaPath)
  const stagePath = path.join(dir, `.meta-lyrics-${crypto.randomUUID()}.json`)
  let stageCreated = false
  try {
    let stage
    try {
      stage = await fsApi.open(stagePath, 'wx', stat.mode & 0o777)
      stageCreated = true
      await stage.writeFile(JSON.stringify({ ...meta, lyrics }, null, 1), 'utf8')
      await stage.close()
      stage = null
    } catch (error) {
      if (stage) await stage.close().catch(() => {})
      throw failure('곡 정보를 저장하지 못했습니다.', 'METADATA_SAVE_FAILED', { cause: error })
    }
    if (platform !== 'win32') {
      try {
        await fsApi.rename(stagePath, metaPath)
      } catch (error) {
        throw failure('곡 정보를 저장하지 못했습니다.', 'METADATA_SAVE_FAILED', { cause: error })
      }
      stageCreated = false
      return { updated: true, metaPath }
    }

    // A left-over regular journal is from a completed save or a prior interrupted one.
    // The current meta is authoritative, so discard it before creating a fresh journal.
    await removeRegularFile(fsApi, backupPath)
    try {
      await fsApi.rename(metaPath, backupPath)
    } catch (error) {
      throw failure('곡 정보를 저장하지 못했습니다.', 'METADATA_SAVE_FAILED', { cause: error })
    }
    try {
      await fsApi.rename(stagePath, metaPath)
      stageCreated = false
    } catch (error) {
      let current
      try {
        current = await regularFile(fsApi, metaPath, { missing: true })
      } catch (stateError) {
        throw failure('곡 정보를 저장하지 못했고 이전 정보도 보존 경로에서 확인해야 합니다.', 'METADATA_SAVE_FAILED', { cause: stateError, backupPath })
      }
      if (!current) {
        try {
          await fsApi.rename(backupPath, metaPath)
        } catch (rollbackError) {
          throw failure('곡 정보를 저장하지 못했고 이전 정보도 자동 복구하지 못했습니다.', 'METADATA_SAVE_FAILED', { cause: rollbackError, backupPath })
        }
      }
      throw failure('곡 정보를 저장하지 못했습니다.', 'METADATA_SAVE_FAILED', { cause: error })
    }
    let backupRetained = false
    try { await removeRegularFile(fsApi, backupPath) } catch { backupRetained = true }
    let hidden = null
    try {
      ({ hidden } = await setWindowsHidden(metaPath, platform, hide))
    } catch {
      hidden = false
    }
    return { updated: true, metaPath, backupRetained, hidden }
  } finally {
    await cleanupStage(fsApi, stagePath, stageCreated)
  }
}

module.exports = { BACKUP, META, recoverMetadata, writeSongLyrics }
