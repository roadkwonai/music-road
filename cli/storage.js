'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024
const DEFAULT_TIMEOUT = 30_000

class StorageError extends Error {
  constructor (code, message) {
    super(message)
    this.code = code
  }
}

function storageScript (options = {}, filename = 'storage_manager.py') {
  if (options.script) return path.resolve(options.script)
  const root = require('./studio').studioRoot(options.root, options.env || process.env)
  if (!root) throw new StorageError('storage_unavailable', 'Road Music 저장공간 관리 도구를 찾을 수 없습니다.')
  const script = path.join(root, 'scripts', filename)
  if (!fs.existsSync(script)) throw new StorageError('storage_unavailable', 'Road Music 저장공간 관리 도구를 찾을 수 없습니다.')
  return script.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
}

function parseResponse (stdout, stderr, code) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) throw new StorageError('storage_protocol', '저장공간 관리 도구가 JSON 한 줄을 반환하지 않았습니다.')
  let response
  try { response = JSON.parse(lines[0]) } catch { throw new StorageError('storage_protocol', '저장공간 관리 도구가 올바른 JSON을 반환하지 않았습니다.') }
  if (!response || typeof response !== 'object' || Array.isArray(response) || typeof response.ok !== 'boolean') {
    throw new StorageError('storage_protocol', '저장공간 관리 도구 응답 형식이 올바르지 않습니다.')
  }
  if (!response.ok) {
    const error = response.error && typeof response.error === 'object' ? response.error : {}
    throw new StorageError(typeof error.code === 'string' ? error.code : 'storage_error', typeof error.message === 'string' ? error.message : (stderr.trim() || `저장공간 관리 명령이 종료되었습니다 (${code})`))
  }
  if (code !== 0) throw new StorageError('storage_failed', stderr.trim() || `저장공간 관리 명령이 종료되었습니다 (${code})`)
  if (!Object.prototype.hasOwnProperty.call(response, 'result')) throw new StorageError('storage_protocol', '저장공간 관리 결과가 없습니다.')
  return response.result
}

function runPython (executable, args, options) {
  const cliRoot = path.resolve(options.root || path.join(__dirname, '..'))
  const cliEnv = fs.existsSync(path.join(cliRoot, 'cli', 'road-music.js')) ? { ROADMUSIC_CLI_ROOT: cliRoot } : {}
  return new Promise((resolve, reject) => {
    let child
    let settled = false
    let timer
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      error ? reject(error) : resolve(result)
    }
    const terminate = () => {
      if (!child || child.exitCode !== null) return
      child.kill('SIGTERM')
      const force = setTimeout(() => child.kill('SIGKILL'), 1_000)
      force.unref()
    }
    try {
      child = (options.spawnProcess || spawn)(executable, args, {
        cwd: options.root ? path.resolve(options.root) : path.resolve(__dirname, '..'),
        env: { ...(options.env || process.env), ...cliEnv, ...(options.userData ? { ROADMUSIC_DATA_DIR: path.resolve(options.userData) } : {}) },
        shell: false,
        stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']
      })
    } catch (error) { finish(new StorageError('storage_unavailable', error.message)); return }
    let stdout = ''
    let stderr = ''
    const timeout = options.timeout === undefined ? DEFAULT_TIMEOUT : options.timeout
    timer = setTimeout(() => { terminate(); finish(new StorageError('timeout', `저장공간 관리 도구가 ${timeout} ms 안에 응답하지 않았습니다.`)) }, timeout)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
        terminate()
        finish(new StorageError('response_too_large', '저장공간 관리 도구 응답이 16 MiB를 초과했습니다.'))
      }
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
      if (Buffer.byteLength(stderr) > MAX_OUTPUT_BYTES) stderr = stderr.slice(0, MAX_OUTPUT_BYTES)
    })
    child.once('error', error => finish(new StorageError('storage_unavailable', error.message)))
    child.once('close', code => {
      try { finish(null, parseResponse(stdout, stderr, code)) } catch (error) { finish(error) }
    })
    if (options.input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(options.input) }
  })
}

async function dispatch (command, params = {}, options = {}, confirm = false) {
  const catalog = require('../electron/cli-catalog')
  if (command === 'storage:lease' && params && params.operation === 'acquire' && params.pid === undefined) {
    throw new StorageError('INVALID_ARGUMENT', 'storage:lease acquire requires the producer pid')
  }
  const entry = catalog.validate(command, params)
  if (!command.startsWith('storage:') && !command.startsWith('production:') && !command.startsWith('works:')) throw new StorageError('invalid_arguments', 'storage 명령이 필요합니다.')
  if (entry.destructive && !confirm) throw new StorageError('invalid_arguments', `${command}에는 --confirm이 필요합니다.`)
  const production = command.startsWith('production:')
  const works = command.startsWith('works:')
  const stdin = production || works
  const action = command.slice(command.indexOf(':') + 1)
  const args = [storageScript(options, production ? (command === 'production:activity' ? 'production_activity.py' : 'production_ledger.py') : works ? 'work_library.py' : 'storage_manager.py'), action,
    ...(stdin ? ['--data-dir', path.resolve(options.userData || require('./client').defaultUserData({ env: options.env || process.env })), '--stdin'] : ['--json', JSON.stringify(entry.paramsValue)])]
  if (confirm) args.push('--confirm')
  return runPython(options.python || 'python3', args, stdin ? { ...options, input: JSON.stringify(entry.paramsValue) } : options)
}

module.exports = { StorageError, dispatch, storageScript }
