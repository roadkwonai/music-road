'use strict'

// Small bridge for the profile SQLite ledger.  Song media and its meta.json remain
// the producer's source of truth; this records only the reviewable change summary.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

class ProductionHistoryError extends Error {
  constructor (code, message) {
    super(message)
    this.code = code
  }
}

const HASH = /^[a-f0-9]{64}$/
const MAX_OUTPUT_BYTES = 1024 * 1024

function managementScript (options = {}) {
  if (options.script) return path.resolve(options.script)
  const root = require('../cli/studio').studioRoot(options.root, options.env || process.env)
  if (!root) throw new ProductionHistoryError('history_unavailable', '제작 이력 SQLite 도구를 찾을 수 없습니다.')
  const script = path.join(root, 'scripts', 'management_db.py')
  if (!fs.existsSync(script)) throw new ProductionHistoryError('history_unavailable', '제작 이력 SQLite 도구를 찾을 수 없습니다.')
  return script.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
}

function projectId (dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new ProductionHistoryError('INVALID_ARGUMENT', '절대 곡 경로가 필요합니다.')
  return crypto.createHash('sha256').update(path.resolve(dir)).digest('hex')
}

function groupId (meta = {}, explicitGroupId) {
  if (typeof explicitGroupId === 'string' && HASH.test(explicitGroupId)) return explicitGroupId
  const value = meta && meta.deliveryVersion && meta.deliveryVersion.groupId
  return typeof value === 'string' && HASH.test(value) ? value : null
}

function snapshot (meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}
  const value = {}
  for (const key of ['title', 'lyrics', 'audio', 'mp3', 'status', 'engineId', 'seconds', 'jobId', 'style', 'requestPrompt', 'requestId', 'elapsedMs', 'mediaSeconds', 'aiSummary', 'resultSummary', 'errorSummary']) {
    if (Object.prototype.hasOwnProperty.call(meta, key)) value[key] = meta[key]
  }
  if (meta.deliveryVersion && typeof meta.deliveryVersion === 'object') {
    value.deliveryVersion = Object.fromEntries(['id', 'groupId', 'projectId', 'stamp'].filter(key => typeof meta.deliveryVersion[key] === 'string').map(key => [key, meta.deliveryVersion[key]]))
  }
  return value
}

function ledgerScript (options = {}) {
  if (options.script) return path.resolve(options.script)
  const root = require('../cli/studio').studioRoot(options.root, options.env || process.env)
  if (!root) throw new ProductionHistoryError('history_unavailable', '제작 원장 SQLite 도구를 찾을 수 없습니다.')
  const script = path.join(root, 'scripts', 'production_ledger.py')
  if (!fs.existsSync(script)) throw new ProductionHistoryError('history_unavailable', '제작 원장 SQLite 도구를 찾을 수 없습니다.')
  return script.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
}

async function recordProduction (action, params, { dataDir, python = 'python3', execute, ...options } = {}) {
  if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) throw new ProductionHistoryError('INVALID_ARGUMENT', '프로필 데이터 경로가 필요합니다.')
  if (typeof action !== 'string' || !action) throw new ProductionHistoryError('INVALID_ARGUMENT', '제작 원장 동작명이 필요합니다.')
  const payload = { ...params }
  if (execute) return execute({ action, params: payload })
  return runJson(python, [ledgerScript(options), action, '--data-dir', path.resolve(dataDir), '--stdin'], { ...options, input: JSON.stringify(payload) })
}

function parseResponse (stdout, stderr, code) {
  if (code !== 0 && !String(stdout).trim()) {
    try {
      const failure = JSON.parse(String(stderr).trim())
      if (failure.error?.message) throw new ProductionHistoryError(failure.error.code || 'history_failed', failure.error.message)
    } catch (error) { if (error instanceof ProductionHistoryError) throw error }
  }
  const lines = String(stdout).trim().split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) throw new ProductionHistoryError('history_protocol', '제작 이력 도구가 JSON 한 줄을 반환하지 않았습니다.')
  let response
  try { response = JSON.parse(lines[0]) } catch { throw new ProductionHistoryError('history_protocol', '제작 이력 도구의 JSON 응답이 올바르지 않습니다.') }
  if (!response || response.ok !== true) {
    const error = response && response.error && typeof response.error === 'object' ? response.error : {}
    throw new ProductionHistoryError(typeof error.code === 'string' ? error.code : 'history_failed', typeof error.message === 'string' ? error.message : String(stderr).trim() || `제작 이력 도구가 종료되었습니다 (${code})`)
  }
  if (code !== 0) throw new ProductionHistoryError('history_failed', String(stderr).trim() || `제작 이력 도구가 종료되었습니다 (${code})`)
  if (response.event && typeof response.event === 'object') return { event: response.event }
  if (response.result && typeof response.result === 'object') return response.result
  throw new ProductionHistoryError('history_protocol', '제작 이력 결과가 없습니다.')
}

function runJson (python, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout ?? 15_000
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000) return reject(new ProductionHistoryError('INVALID_ARGUMENT', '제작 이력 저장 시간 제한이 올바르지 않습니다.'))
    const child = (options.spawnProcess || spawn)(python, args, { cwd: options.cwd || process.cwd(), env: options.env || process.env, shell: false, stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], windowsHide: true })
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      error ? reject(error) : resolve(value)
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish(new ProductionHistoryError('timeout', '제작 이력 저장 시간이 초과됐습니다. 저장공간 상태에서 추적 기록을 확인하세요.'))
    }, timeout)
    let stdout = ''; let stderr = ''
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk; if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) { child.kill('SIGTERM'); finish(new ProductionHistoryError('response_too_large', '제작 이력 응답이 안전 한도를 초과했습니다.')) } })
    child.stderr.on('data', chunk => { stderr += chunk; if (Buffer.byteLength(stderr) > MAX_OUTPUT_BYTES) stderr = stderr.slice(0, MAX_OUTPUT_BYTES) })
    child.once('error', error => finish(new ProductionHistoryError('history_unavailable', error.message)))
    child.once('close', code => { try { finish(null, parseResponse(stdout, stderr, code)) } catch (error) { finish(error) } })
    if (options.input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(options.input) }
  })
}

async function recordSongEvent ({ dataDir, dir, action, before, after, reason = '', meta, groupId: explicitGroupId, python = 'python3', execute, ...options } = {}) {
  if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) throw new ProductionHistoryError('INVALID_ARGUMENT', '프로필 데이터 경로가 필요합니다.')
  if (typeof action !== 'string' || !action || action.length > 80) throw new ProductionHistoryError('INVALID_ARGUMENT', '제작 이력 동작명이 필요합니다.')
  const payload = { action, project_id: projectId(dir), before: snapshot(before), after: snapshot(after), reason: String(reason || '').slice(0, 1000), path: path.resolve(dir) }
  const linkedGroup = groupId(meta || after || before, explicitGroupId)
  if (linkedGroup) payload.group_id = linkedGroup
  if (execute) return execute(payload)
  const script = managementScript(options)
  return runJson(python, [script, 'record-event', '--data-dir', path.resolve(dataDir), '--stdin'], { ...options, input: JSON.stringify(payload) })
}

async function dropSongHistory ({ dataDir, dir, python = 'python3', execute, ...options } = {}) {
  if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) throw new ProductionHistoryError('INVALID_ARGUMENT', '프로필 데이터 경로가 필요합니다.')
  const payload = { project_id: projectId(dir), path: path.resolve(dir) }
  if (execute) return execute(payload)
  const script = managementScript(options)
  return runJson(python, [script, 'drop-project', '--data-dir', path.resolve(dataDir), '--stdin'], { ...options, input: JSON.stringify(payload) })
}

module.exports = { ProductionHistoryError, managementScript, ledgerScript, projectId, groupId, snapshot, recordSongEvent, dropSongHistory, recordProduction }
