'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const DEFAULT_TIMEOUT = 30_000
const LONG_TIMEOUT = 3_600_000
const VIDEO_RENDER_TIMEOUT = 86_400_000
const MAX_TIMER_TIMEOUT = 2_147_483_647
const LONG_COMMANDS = new Set([
  'job:wait', 'setup:run', 'engines:install', 'song:generate', 'song:render', 'song:resume',
  'album:export', 'video:preview', 'video:prepare', 'video:render', 'video:finish',
  'settings:move-models', 'settings:move-songs'
])
const WAIT_COMMANDS = new Set(['song:generate', 'song:resume', 'song:render'])
const UNCERTAIN_MUTATIONS = new Set([...WAIT_COMMANDS, 'video:render'])
const BATCH_FIELDS = new Set(['id', 'command', 'params', 'input', 'output', 'confirm', 'overwrite', 'timeout'])

class CliError extends Error {
  constructor (code, message) {
    super(message)
    this.code = code
  }
}

function defaultUserData ({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (env.ROADMUSIC_DATA_DIR) return path.resolve(env.ROADMUSIC_DATA_DIR)
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Road Music')
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Road Music')
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Road Music')
}

function socketEndpoint (userData) {
  try {
    const transport = require('../electron/cli-transport')
    if (typeof transport.endpoint === 'function') return transport.endpoint(userData)
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
  }
  const hash = crypto.createHash('sha256').update(userData).digest('hex').slice(0, 16)
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\road-music-${hash}`
    : path.join(os.tmpdir(), `road-music-${hash}.sock`)
}

function parseJsonObject (value, flag) {
  let parsed
  try { parsed = JSON.parse(value) } catch { throw new CliError('invalid_arguments', `${flag} must contain JSON`) }
  if (!isObject(parsed)) throw new CliError('invalid_arguments', `${flag} must be a JSON object`)
  return parsed
}

function isObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function absolutePath (value, flag) {
  if (typeof value !== 'string' || !value) throw new CliError('invalid_arguments', `${flag} requires a path`)
  return path.resolve(value)
}

function timeoutFor (command, value) {
  const longCommand = LONG_COMMANDS.has(command)
  const maximum = command === 'video:render' ? MAX_TIMER_TIMEOUT : (longCommand ? LONG_TIMEOUT : DEFAULT_TIMEOUT)
  const timeout = value === undefined ? (command === 'video:render' ? VIDEO_RENDER_TIMEOUT : (longCommand ? LONG_TIMEOUT : DEFAULT_TIMEOUT)) : Number(value)
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > maximum) {
    throw new CliError('invalid_arguments', `--timeout must be between 1 and ${maximum} ms`)
  }
  return timeout
}

function normalizeCommand (parts) {
  if (parts.length === 1 && parts[0].includes(':')) return parts[0]
  if (parts.length === 2 && !parts[0].includes(':') && !parts[1].includes(':')) return `${parts[0]}:${parts[1]}`
  throw new CliError('invalid_arguments', 'command must be group action or group:action')
}

function normalizeClientCommand (command) {
  const normalized = (command === 'help' || command === 'schema') ? 'cli:schema' : normalizeCommand([command])
  if (!normalized.startsWith('service:')) return { command: normalized, noStart: false }
  if (normalized === 'service:stop') return { command: 'cli:stop', noStart: true }
  if (normalized === 'service:status') return { command: 'cli:status', noStart: true }
  if (normalized === 'service:start') return { command: 'cli:status', noStart: false, start: true }
  if (normalized === 'service:show') return { command: 'cli:show', noStart: false }
  throw new CliError('invalid_arguments', 'service action must be start, stop, status, or show')
}

function parseArgs (argv) {
  const values = []
  const options = { input: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) { values.push(value); continue }
    if (value === '--help') { options.help = true; continue }
    if (['--stdin', '--events', '--confirm', '--overwrite', '--no-start', '--wait'].includes(value)) {
      options[value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true
      continue
    }
    const argument = argv[index + 1]
    if (argument === undefined || argument.startsWith('--')) throw new CliError('invalid_arguments', `${value} requires a value`)
    index += 1
    if (value === '--json') options.params = parseJsonObject(argument, value)
    else if (value === '--file') options.file = absolutePath(argument, value)
    else if (value === '--input') options.input.push(absolutePath(argument, value))
    else if (value === '--output') options.output = absolutePath(argument, value)
    else if (value === '--timeout') options.timeoutValue = argument
    else throw new CliError('invalid_arguments', `unknown option: ${value}`)
  }
  if (options.help && values.length === 0) return { help: true }
  if (values.length === 1 && values[0] === 'batch') return { batch: true, ...options }
  const command = (values.length === 1 && ['help', 'schema'].includes(values[0])) ? 'cli:schema' : normalizeCommand(values)
  if (options.stdin && (options.params || options.file)) throw new CliError('invalid_arguments', '--stdin cannot be combined with --json or --file')
  if (options.params && options.file) throw new CliError('invalid_arguments', '--json cannot be combined with --file')
  return { command, params: options.params, ...options, timeout: timeoutFor(command, options.timeoutValue) }
}

function requestId () {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
}

function request ({ endpoint, id: suppliedId, command, params = {}, input, output, confirm, overwrite, timeout = DEFAULT_TIMEOUT, onEvent }) {
  if (!endpoint) return Promise.reject(new CliError('invalid_arguments', 'socket endpoint is required'))
  if (!isObject(params)) return Promise.reject(new CliError('invalid_arguments', 'params must be an object'))
  if (suppliedId !== undefined && (typeof suppliedId !== 'string' || !suppliedId)) return Promise.reject(new CliError('invalid_arguments', 'id must be a non-empty string'))
  const id = suppliedId || requestId()
  const message = { id, command, params }
  if (input && input.length) message.input = input
  if (output) message.output = output
  if (confirm) message.confirm = true
  if (overwrite) message.overwrite = true
  const frame = JSON.stringify(message) + '\n'
  if (Buffer.byteLength(frame) > MAX_RESPONSE_BYTES) return Promise.reject(new CliError('request_too_large', 'request exceeded 16 MiB'))
  return new Promise((resolve, reject) => {
    let settled = false
    let connected = false
    let serviceStopping = false
    let pending = ''
    const socket = net.createConnection(endpoint)
    socket.setEncoding('utf8')
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      error ? reject(error) : resolve(result)
    }
    const timer = setTimeout(() => finish(new CliError('timeout', `daemon did not respond within ${timeout} ms`)), timeout)
    socket.once('connect', () => {
      connected = true
      socket.write(frame)
    })
    socket.on('error', (error) => {
      const wrapped = new CliError(connected ? 'socket_error' : 'connection', error.message)
      wrapped.phase = connected ? 'request' : 'connect'
      wrapped.errno = error.code
      finish(wrapped)
    })
    socket.on('data', (chunk) => {
      pending += chunk
      if (Buffer.byteLength(pending) > MAX_RESPONSE_BYTES) return finish(new CliError('response_too_large', 'daemon response exceeded 16 MiB'))
      let end
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end)
        pending = pending.slice(end + 1)
        if (!line) continue
        let response
        try { response = JSON.parse(line) } catch { return finish(new CliError('malformed_response', 'daemon returned invalid JSON')) }
        if (response && response.type === 'event') {
          if (response.channel === 'service:stopping' && response.payload && response.payload.requested === true) serviceStopping = true
          if (onEvent) onEvent(response)
          continue
        }
        if (!response || response.id !== id) continue
        if (response.error) return finish(Object.assign(new CliError(response.error.code || 'operation_error', response.error.message || 'operation failed'), { remote: true }))
        if (!Object.prototype.hasOwnProperty.call(response, 'result')) return finish(new CliError('malformed_response', 'daemon response has no result'))
        finish(null, response.result)
      }
    })
    socket.on('end', () => {
      if (!settled) {
        const error = new CliError(serviceStopping ? 'SERVICE_STOPPED' : 'CONNECTION_LOST', serviceStopping ? '서비스가 종료되어 요청 처리 여부를 확인하세요. status/queue/result 후 수동으로 재시도하세요.' : 'daemon closed before responding')
        error.phase = 'request'
        error.errno = serviceStopping ? 'SERVICE_STOPPED' : 'CONNECTION_LOST'
        error.socketClosed = true
        if (serviceStopping) {
          error.retry = false
          error.uncertain = true
        } else if (UNCERTAIN_MUTATIONS.has(command)) {
          error.uncertain = true
          error.message = '요청 처리 여부 불명확; status/queue/result before retry'
        }
        finish(error)
      }
    })
    socket.on('close', () => {
      if (!settled) {
        const error = new CliError(serviceStopping ? 'SERVICE_STOPPED' : 'CONNECTION_LOST', serviceStopping ? '서비스가 종료되어 요청 처리 여부를 확인하세요. status/queue/result 후 수동으로 재시도하세요.' : 'daemon closed before responding')
        error.phase = 'request'
        error.errno = serviceStopping ? 'SERVICE_STOPPED' : 'CONNECTION_LOST'
        error.socketClosed = true
        if (serviceStopping) {
          error.retry = false
          error.uncertain = true
        } else if (UNCERTAIN_MUTATIONS.has(command)) {
          error.uncertain = true
          error.message = '요청 처리 여부 불명확; status/queue/result before retry'
        }
        finish(error)
      }
    })
  })
}

function probe (endpoint, timeout = 1_000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint)
    const timer = setTimeout(() => { socket.destroy(); reject(new CliError('connection', 'daemon did not start')) }, timeout)
    socket.once('connect', () => { clearTimeout(timer); socket.end(); resolve() })
    socket.once('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

function startService ({ userData, env = process.env, spawnProcess = spawn } = {}) {
  let electron
  try { electron = require('electron') } catch { throw new CliError('electron_unavailable', 'Electron is not installed') }
  fs.mkdirSync(userData, { recursive: true })
  const log = fs.openSync(path.join(userData, 'cli-service.log'), 'a')
  const childEnv = { ...env }
  delete childEnv.ELECTRON_RUN_AS_NODE
  const defaultEnv = { ...env }
  delete defaultEnv.ROADMUSIC_DATA_DIR
  if (env.ROADMUSIC_DATA_DIR || path.resolve(userData) !== defaultUserData({ env: defaultEnv })) childEnv.ROADMUSIC_DATA_DIR = userData
  try {
    const child = spawnProcess(electron, [path.resolve(__dirname, '..'), '--roadmusic-service'], {
      detached: true,
      stdio: ['ignore', log, log],
      env: childEnv
    })
    child.on('error', () => {})
    child.unref()
  } finally { fs.closeSync(log) }
}

function timeoutError (timeout) {
  return new CliError('timeout', `daemon did not respond within ${timeout} ms`)
}

function remainingTimeout (deadline, timeout) {
  const remaining = deadline - Date.now()
  if (remaining < 1) throw timeoutError(timeout)
  return remaining
}

function requestPayload (payload, options, deadline, timeout, retried = false) {
  const remaining = remainingTimeout(deadline, timeout)
  const params = payload.command === 'job:wait'
    ? { ...payload.params, timeoutMs: retried || payload.params.timeoutMs === undefined ? remaining : payload.params.timeoutMs }
    : payload.params
  return request({ ...payload, params, timeout: remaining, endpoint: options.endpoint, onEvent: options.onEvent })
}

async function requestWithStartupOnce (payload, options, deadline, timeout, retried) {
  try { return await requestPayload(payload, options, deadline, timeout, retried) } catch (error) {
    if (error.phase !== 'connect' || !['ECONNREFUSED', 'ENOENT'].includes(error.errno) || options.noStart) throw error
  }
  startService(options)
  const startupDeadline = Math.min(deadline, Date.now() + 30_000)
  let lastError
  while (Date.now() < startupDeadline) {
    try { await probe(options.endpoint, Math.min(1_000, startupDeadline - Date.now())); break } catch (error) {
      lastError = error
      const delay = Math.min(100, startupDeadline - Date.now())
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  if (Date.now() >= startupDeadline) {
    const error = new CliError('connection', lastError ? lastError.message : 'daemon did not start')
    error.phase = 'connect'
    error.errno = lastError && lastError.code
    throw error
  }
  return requestPayload(payload, options, deadline, timeout, true)
}

function isTransientWaitError (error) {
  return error && (
    (error.phase === 'connect' && ['ECONNREFUSED', 'ENOENT', 'ECONNRESET'].includes(error.errno)) ||
    (error.phase === 'request' && ['ECONNRESET', 'CONNECTION_LOST'].includes(error.errno))
  )
}

async function requestWithStartup (payload, options) {
  let timeout = payload.timeout || DEFAULT_TIMEOUT
  if (payload.command === 'job:wait' && payload.params.timeoutMs !== undefined) {
    if (!Number.isInteger(payload.params.timeoutMs) || payload.params.timeoutMs < 1 || payload.params.timeoutMs > LONG_TIMEOUT) {
      throw new CliError('invalid_arguments', 'job:wait timeoutMs must be an integer between 1 and 3600000')
    }
    timeout = Math.min(timeout, payload.params.timeoutMs)
  }
  const deadline = payload.deadline ? Math.min(payload.deadline, Date.now() + timeout) : (Date.now() + timeout)
  let lastError
  let retried = false
  while (Date.now() < deadline) {
    try {
      return await requestWithStartupOnce(payload, options, deadline, timeout, retried)
    } catch (error) {
      lastError = error
      if (Date.now() >= deadline) break
      if (payload.command !== 'job:wait' || !isTransientWaitError(error)) throw error
      retried = true
      const delay = Math.min(100, deadline - Date.now())
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  if (payload.command === 'job:wait') throw timeoutError(timeout)
  throw lastError || timeoutError(timeout)
}

async function waitForJob (jobId, options, timeout) {
  const deadline = Date.now() + timeout
  return requestWithStartup({ command: 'job:wait', params: { jobId, timeoutMs: timeout }, timeout, deadline }, options)
}

async function requestServiceStart (payload, options) {
  const timeout = payload.timeout || DEFAULT_TIMEOUT
  const deadline = Date.now() + timeout
  let result = await requestWithStartup({ ...payload, deadline }, options)
  while (result && result.stopping) {
    const remaining = remainingTimeout(deadline, timeout)
    try {
      result = await request({ ...payload, timeout: Math.min(1_000, remaining), endpoint: options.endpoint, onEvent: options.onEvent })
    } catch (error) {
      if (!isTransientWaitError(error)) throw error
      return requestWithStartup({ ...payload, deadline }, options)
    }
    if (!result.stopping) return result
    const delay = Math.min(100, deadline - Date.now())
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
  }
  return result
}

async function paramsFor (parsed, options) {
  if (parsed.params) return parsed.params
  let source
  if (parsed.file) {
    if (fs.statSync(parsed.file).size > MAX_RESPONSE_BYTES) throw new CliError('input_too_large', '--file exceeded 16 MiB')
    source = fs.readFileSync(parsed.file, 'utf8')
  }
  else if (parsed.stdin) source = await readStream(options.stdin || process.stdin)
  else return {}
  return parseJsonObject(source, parsed.file ? '--file' : '--stdin')
}

function readStream (stream) {
  return new Promise((resolve, reject) => {
    let text = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      text += chunk
      if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
        stream.destroy(new CliError('input_too_large', 'stdin exceeded 16 MiB'))
      }
    })
    stream.once('end', () => resolve(text))
    stream.once('error', reject)
  })
}

function errorShape (error) {
  return { code: error.code || 'operation_error', message: error.message || 'operation failed', ...(error.uncertain ? { uncertain: true } : {}), ...(error.retry === false ? { retry: false } : {}) }
}

function writeJson (stream, value) {
  stream.write(JSON.stringify(value) + '\n')
}

function failedResult (result) {
  const remote = result && result.error
  return {
    code: (remote && typeof remote === 'object' && remote.code) || result.code || 'operation_failed',
    message: (remote && typeof remote === 'object' && remote.message) || (typeof remote === 'string' && remote) || result.message || 'operation failed',
    details: result
  }
}

function localSchema (params = {}) {
  const catalog = require('../electron/cli-catalog')
  let schema = catalog.schema()
  try {
    const transport = require('../electron/cli-transport')
    if (typeof transport.getSchema === 'function') schema = transport.getSchema()
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
  }
  if (params.command === undefined) return schema
  if (typeof params.command !== 'string') throw new CliError('invalid_arguments', 'schema command must be a string')
  const normalized = normalizeClientCommand(params.command)
  const command = schema.commands.find(item => item.command === normalized.command)
  if (!command) throw new CliError('invalid_arguments', `unknown command: ${params.command}`)
  return command
}

async function waitForJobs (result, options, timeout) {
  const jobs = Array.isArray(result.jobs) ? result.jobs : (typeof result.jobId === 'string' ? [{ jobId: result.jobId }] : null)
  if (!jobs || !jobs.length || jobs.some(job => !job || typeof job.jobId !== 'string' || !job.jobId)) {
    throw new CliError('operation_error', '--wait requires a response with jobs')
  }
  const songs = []
  let failed = false
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index]
    try {
      const completed = await waitForJob(job.jobId, options, timeout)
      songs.push(completed)
      if (completed && completed.ok === false) failed = true
    } catch (error) {
      failed = true
      songs.push({ ok: false, jobId: job.jobId, error: errorShape(error) })
      if (error.code === 'SERVICE_STOPPED') {
        for (const pending of jobs.slice(index + 1)) songs.push({ ok: false, jobId: pending.jobId, error: errorShape(error) })
        break
      }
    }
  }
  return failed ? { ok: false, message: '작업 대기중단/실패', songs } : { ok: true, songs }
}

async function * batchLines (options) {
  if (options.stdinText !== undefined) {
    yield * options.stdinText.split(/\r?\n/)
    return
  }
  const readline = require('node:readline')
  const reader = readline.createInterface({ input: options.stdin || process.stdin, crlfDelay: Infinity })
  for await (const line of reader) yield line
}

async function runBatch (parsed, options) {
  let failed = false
  let argumentError = false
  for await (const line of batchLines(options)) {
    if (!line.trim()) continue
    let itemId
    try {
      const item = JSON.parse(line)
      if (!isObject(item) || typeof item.command !== 'string') throw new CliError('invalid_arguments', 'batch line requires command')
      if (item.id !== undefined && (typeof item.id !== 'string' || !item.id)) throw new CliError('invalid_arguments', 'batch id must be a non-empty string')
      itemId = item.id
      if (Object.keys(item).some(field => !BATCH_FIELDS.has(field))) throw new CliError('invalid_arguments', 'batch line has unknown fields')
      const normalized = normalizeClientCommand(item.command)
      const command = normalized.command
      if (item.params !== undefined && !isObject(item.params)) throw new CliError('invalid_arguments', 'batch params must be an object')
      if (item.input !== undefined && (!Array.isArray(item.input) || item.input.some(value => typeof value !== 'string' || !path.isAbsolute(value)))) throw new CliError('invalid_arguments', 'batch input must be absolute paths')
      if (item.output !== undefined && (typeof item.output !== 'string' || !path.isAbsolute(item.output))) throw new CliError('invalid_arguments', 'batch output must be an absolute path')
      if (![undefined, true, false].includes(item.confirm) || ![undefined, true, false].includes(item.overwrite)) throw new CliError('invalid_arguments', 'batch confirm and overwrite must be booleans')
      const timeout = timeoutFor(command, item.timeout)
      const requestOptions = { ...options, noStart: options.noStart || normalized.noStart }
      const payload = { id: item.id, command, params: item.params === undefined ? {} : item.params, input: item.input, output: item.output, confirm: item.confirm === true, overwrite: item.overwrite === true, timeout }
      const result = command === 'cli:schema'
        ? localSchema(item.params === undefined ? {} : item.params)
        : (normalized.start ? await requestServiceStart(payload, requestOptions) : await requestWithStartup(payload, requestOptions))
      const responseId = item.id === undefined ? {} : { id: item.id }
      if (result && result.ok === false) { failed = true; writeJson(options.stdout, { ...responseId, ok: false, error: failedResult(result) }) } else writeJson(options.stdout, { ...responseId, ok: true, result })
    } catch (error) {
      failed = true
      if (error.code === 'invalid_arguments' || error.code === 'INVALID_ARGUMENT') argumentError = true
      writeJson(options.stdout, { ...(itemId === undefined ? {} : { id: itemId }), ok: false, error: errorShape(error) })
    }
  }
  return argumentError ? 2 : (failed ? 1 : 0)
}

async function run (argv = process.argv.slice(2), supplied = {}) {
  const options = {
    stdout: supplied.stdout || process.stdout,
    stderr: supplied.stderr || process.stderr,
    stdin: supplied.stdin || process.stdin,
    userData: supplied.userData || defaultUserData({ env: supplied.env || process.env }),
    ...supplied
  }
  try {
    const parsed = parseArgs(argv)
    if (parsed.help && !parsed.command) { writeJson(options.stdout, { ok: true, result: { usage: 'road-music <group> <action> [--json JSON|--file FILE|--stdin] [--input FILE] [--output FILE] [--confirm] [--overwrite] [--wait] [--timeout MS] [--events] [--no-start]; video:render defaults to 86400000 ms and accepts up to 2147483647 ms' } }); return 0 }
    if (parsed.batch && (parsed.params || parsed.file || parsed.stdin || parsed.input.length || parsed.output || parsed.confirm || parsed.overwrite || parsed.wait || parsed.timeoutValue !== undefined)) {
      throw new CliError('invalid_arguments', 'batch accepts only --events and --no-start')
    }
    const normalized = parsed.command ? normalizeClientCommand(parsed.command) : null
    if (normalized && (normalized.command === 'cli:schema' || parsed.help)) {
      const params = parsed.help ? { command: normalized.command } : await paramsFor(parsed, options)
      writeJson(options.stdout, { ok: true, result: localSchema(params) })
      return 0
    }
    if (parsed.wait && !WAIT_COMMANDS.has(parsed.command)) throw new CliError('invalid_arguments', '--wait is only available for song generate, resume, or render')
    options.endpoint = options.endpoint || socketEndpoint(options.userData)
    options.noStart = parsed.noStart
    options.onEvent = parsed.events ? (event) => writeJson(options.stderr, event) : undefined
    if (parsed.batch) return runBatch(parsed, options)
    const params = await paramsFor(parsed, options)
    options.noStart = options.noStart || normalized.noStart
    const payload = { command: normalized.command, params, input: parsed.input, output: parsed.output, confirm: parsed.confirm, overwrite: parsed.overwrite, timeout: parsed.timeout }
    let result = normalized.start ? await requestServiceStart(payload, options) : await requestWithStartup(payload, options)
    if (result && result.ok === false) {
      writeJson(options.stdout, { ok: false, error: failedResult(result) })
      return 1
    }
    if (parsed.wait) result = await waitForJobs(result, options, parsed.timeout)
    if (result && result.ok === false) {
      writeJson(options.stdout, { ok: false, error: failedResult(result) })
      return 1
    }
    writeJson(options.stdout, { ok: true, result })
    return 0
  } catch (error) {
    const argumentError = error.code === 'invalid_arguments' || error.code === 'INVALID_ARGUMENT' || error.code === 'UNKNOWN_COMMAND'
    writeJson(options.stdout, { ok: false, error: errorShape(error) })
    return argumentError ? 2 : 1
  }
}

module.exports = { CliError, defaultUserData, parseArgs, request, run, socketEndpoint, startService }
