'use strict'
const net = require('node:net')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { constants } = require('node:fs')
const { AsyncLocalStorage } = require('node:async_hooks')
const { EventEmitter } = require('node:events')
const catalog = require('./cli-catalog')
const appVersion = require('../package.json').version
const cliVersion = require('../cli/package.json').version

const MAX_BYTES = 16 * 1024 * 1024
const endpoint = userData => {
  const key = crypto.createHash('sha256').update(path.resolve(userData)).digest('hex').slice(0, 16)
  return process.platform === 'win32' ? `\\\\.\\pipe\\road-music-${key}` : path.join(os.tmpdir(), `road-music-${key}.sock`)
}
function fail (code, message) { throw Object.assign(new Error(message), { code }) }
function plain (value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function replacePath (value, from, to) {
  if (value === from) return to
  if (Array.isArray(value)) return value.map(item => replacePath(item, from, to))
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePath(item, from, to)]))
  return value
}
function absolute (value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) fail('INVALID_ARGUMENT', `${label}: 절대 경로가 필요합니다.`)
  return path.resolve(value)
}
function inside (root, file) {
  const rel = path.relative(root, file)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}
async function canonical (file) {
  try { return await fs.realpath(file) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const parent = path.dirname(file)
    if (parent === file) return file
    return path.join(await canonical(parent), path.basename(file))
  }
}

const extraCommands = [
  { command: 'cli:schema', description: '모든 명령과 JSON 입력 형식', params: { type: 'object', properties: {} } },
  { command: 'cli:version', description: 'CLI·앱·프로토콜 버전', params: { type: 'object', properties: {} } },
  { command: 'cli:update:check', description: 'GitHub의 CLI 전용 릴리스를 확인', params: { type: 'object', properties: {}, additionalProperties: false } },
  { command: 'cli:update:install', description: '새 폴더에 CLI 전용 릴리스를 설치', params: { type: 'object', properties: { targetDir: { type: 'string', format: 'absolute-path' } }, additionalProperties: false } },
  { command: 'cli:status', description: '서비스 PID, 화면 및 대기열 상태', params: { type: 'object', properties: {} } },
  { command: 'cli:stop', description: '작업 없는 서비스를 종료; 실행 중이면 confirm 필요', params: { type: 'object', properties: {} } },
  { command: 'cli:show', description: '공유 중인 앱 화면 표시', params: { type: 'object', properties: {} } },
  { command: 'app:language', description: '현재 화면 언어를 조회합니다.', params: { type: 'object', properties: {} } },
  { command: 'job:wait', description: '지정 생성 작업의 완료 또는 실패까지 대기', params: { type: 'object', required: ['jobId'], properties: { jobId: { type: 'string' }, timeoutMs: { type: 'integer', minimum: 1, maximum: 3600000 } } } }
]
function getVersion () {
  return { cliVersion, appVersion, protocolVersion: catalog.schema().version }
}
function getSchema () {
  const schema = catalog.schema()
  const commands = [...schema.commands, ...extraCommands]
  return { ...schema, ...getVersion(), commands,
    localCommands: ['cli:schema', 'cli:version', 'cli:update:check', 'cli:update:install', 'prompt:knowledge', ...schema.commands.filter(item => item.local || item.command.startsWith('storage:')).map(item => item.command)],
    request: { command: 'group:action', params: {}, input: ['absolute paths'], output: 'absolute path', confirm: false, overwrite: false },
    transport: 'local JSON Lines', events: 'stderr', completion: 'song:generate returns jobId; job:wait waits for it' }
}

function createBridge ({ ipcMain, dialog, userData, runtime = {} }) {
  const handlers = new Map()
  const context = new AsyncLocalStorage()
  const events = new EventEmitter()
  events.setMaxListeners(100)
  const completed = new Map()
  const clients = new Set()
  const originalHandle = ipcMain.handle.bind(ipcMain)
  let rendererRequest = null
  let librarySwap = null
  const rendererContexts = new Map()
  let stopping = false
  let stoppingNotified = false
  let server = null
  let ownsSocket = false
  let mutations = Promise.resolve()
  let lastEvent = 0
  const activeRequests = new Set()
  const activeOutputs = new Set()
  const rendererContextChannels = new Set(['video:start', 'song:save-srt', 'video:save-settings'])
  const blockedDuringRenderer = new Set(['app:set-language', 'projects:select', 'projects:create', 'projects:rename',
    'songs:import', 'songs:reorder', 'songs:hide', 'songs:compact', 'song:rename', 'song:lyrics', 'song:replace', 'song:restore', 'song:delete',
    'song:background', 'song:background-clear', 'settings:move-models', 'settings:move-songs', 'video:save-settings'])
  const invalidateResults = new Set(['song:rename', 'song:lyrics', 'song:replace', 'song:restore', 'song:delete', 'projects:rename', 'settings:move-songs'])
  const serializeMutation = execute => {
    const task = mutations.then(execute, execute)
    mutations = task.catch(() => {})
    return task
  }
  ipcMain.handle = (channel, handler) => {
    const invoke = async (event, ...args) => {
      const result = await handler(event, ...args)
      if (invalidateResults.has(channel) && (!result || result.ok !== false)) completed.clear()
      return result
    }
    handlers.set(channel, invoke)
    return originalHandle(channel, (event, ...args) => {
      const request = context.getStore()
      if (!request && librarySwap && ['video:prepare', 'video:start', 'song:generate'].includes(channel)) return { ok: false, code: 'BUSY', message: '곡 교체·복구가 끝난 뒤 시작하세요.' }
      if (!request && rendererRequest && blockedDuringRenderer.has(channel)) return { ok: false, code: 'BUSY', message: 'CLI 화면 작업이 끝난 뒤 다시 시도하세요.' }
      if (request) return context.run(request, () => invoke(event, ...args))
      // GUI writes share the CLI queue; read-only refresh IPC must remain reentrant.
      return blockedDuringRenderer.has(channel) ? serializeMutation(() => invoke(event, ...args)) : invoke(event, ...args)
    })
  }
  originalHandle('cli:invoke', async (event, message) => {
    const request = plain(message) && rendererContexts.get(message.token)
    if (!request || !runtime.webContents || event.sender !== runtime.webContents() ||
        !rendererContextChannels.has(message.channel) || !Array.isArray(message.args)) fail('ACCESS_DENIED', '유효한 CLI 렌더러 요청이 아닙니다.')
    const handler = handlers.get(message.channel)
    if (!handler) fail('UNKNOWN_COMMAND', '내부 렌더러 명령을 찾지 못했습니다.')
    return context.run(request, () => handler(event, ...message.args))
  })

  for (const name of ['showOpenDialog', 'showSaveDialog', 'showMessageBox', 'showOpenDialogSync', 'showSaveDialogSync', 'showMessageBoxSync']) {
    const original = dialog[name] && dialog[name].bind(dialog)
    if (!original) continue
    dialog[name] = (...args) => {
      const request = context.getStore()
      if (!request) return original(...args)
      const options = args[args.length - 1] || {}
      if (name.includes('MessageBox')) {
        if (!request.confirm) fail('CONFIRM_REQUIRED', '이 작업에는 --confirm이 필요합니다.')
        return name.endsWith('Sync') ? 1 : Promise.resolve({ response: 1, checkboxChecked: false })
      }
      if (name.includes('SaveDialog')) {
        if (!request.output) fail('INVALID_ARGUMENT', '--output으로 저장할 파일을 지정하세요.')
        const extensions = options.filters && options.filters[0] && options.filters[0].extensions || []
        if (extensions.length && !extensions.includes('*') && !extensions.includes(path.extname(request.output).slice(1).toLowerCase())) fail('INVALID_ARGUMENT', `출력 확장자는 ${extensions.join('/')}이어야 합니다.`)
        return name.endsWith('Sync') ? request.output : Promise.resolve({ canceled: false, filePath: request.output })
      }
      const picked = request.input || (options.properties && options.properties.includes('openDirectory') && request.output ? [request.output] : [])
      if (!picked.length) fail('INVALID_ARGUMENT', '--input으로 파일 또는 폴더를 지정하세요.')
      if (!(options.properties || []).includes('multiSelections') && picked.length !== 1) fail('INVALID_ARGUMENT', '이 명령에는 파일/폴더 하나만 지정할 수 있습니다.')
      if (!(options.properties || []).includes('openDirectory') && options.filters && options.filters[0]) {
        const extensions = options.filters[0].extensions || []
        if (extensions.length && !extensions.includes('*')) for (const file of picked) {
          if (!extensions.includes(path.extname(file).slice(1).toLowerCase())) fail('INVALID_ARGUMENT', `지원하지 않는 파일 형식: ${file}`)
        }
      }
      return name.endsWith('Sync') ? picked : Promise.resolve({ canceled: false, filePaths: picked })
    }
  }

  function publish (channel, payload) {
    if (channel === 'job:started' && payload) completed.delete(payload.jobId)
    if (channel === 'queue:update' && payload) {
      for (const job of [...(payload.waiting || []), ...(payload.current ? [payload.current] : [])]) completed.delete(job.jobId)
    }
    if (channel === 'job:done' || channel === 'job:error') {
      const jobId = payload && payload.jobId
      if (jobId) {
        completed.set(jobId, channel === 'job:done' ? { ok: true, song: payload } : { ok: false, ...payload })
        if (completed.size > 100) completed.delete(completed.keys().next().value)
        events.emit(`job:${jobId}`, completed.get(jobId))
      }
    }
    // Progress is useful to an agent, but hundreds of diffusion events/sec are not.
    if (channel === 'system:stats') return
    if (channel === 'job:event' && payload && payload.type === 'progress') {
      if (Date.now() - lastEvent < 200) return
      lastEvent = Date.now()
    }
    const line = JSON.stringify({ type: 'event', channel, payload }) + '\n'
    for (const client of clients) if (!client.destroyed) {
      if (client.writableLength > MAX_BYTES) client.destroy()
      else client.write(line)
    }
  }
  function notifyStopping () {
    stopping = true
    if (!stoppingNotified) {
      stoppingNotified = true
      publish('service:stopping', { requested: true })
    }
  }

  async function checkPaths (request, entry) {
    const srtSave = request.command === 'song:srt' && request.params.save
    if (request.input !== undefined && entry.dialog !== 'open') fail('INVALID_ARGUMENT', '이 명령은 --input을 사용하지 않습니다.')
    if (request.output !== undefined && !(entry.dialog === 'save' || entry.directory || srtSave)) fail('INVALID_ARGUMENT', '이 명령은 --output을 사용하지 않습니다.')
    if (request.overwrite && !(entry.dialog === 'save' || srtSave)) fail('INVALID_ARGUMENT', '이 명령은 --overwrite를 사용하지 않습니다.')
    if (entry.directory && request.input && request.output) fail('INVALID_ARGUMENT', '폴더는 --input 또는 --output 중 하나로 지정하세요.')
    if (entry.destructive && !request.confirm) fail('CONFIRM_REQUIRED', '이 작업에는 --confirm이 필요합니다.')
    if (request.input !== undefined) {
      if (!Array.isArray(request.input) || !request.input.length) fail('INVALID_ARGUMENT', 'input은 절대 경로 배열이어야 합니다.')
      request.input = request.input.map(file => absolute(file, 'input'))
      for (const file of request.input) {
        const stat = await fs.stat(file).catch(() => null)
        if (!stat || (entry.directory ? !stat.isDirectory() : !stat.isFile())) fail('INVALID_ARGUMENT', `입력 ${entry.directory ? '폴더' : '파일'}를 찾지 못했습니다: ${file}`)
      }
    }
    if (request.output !== undefined) {
      request.output = absolute(request.output, 'output')
      if (entry.directory) {
        await fs.mkdir(request.output, { recursive: true })
        if (!(await fs.stat(request.output)).isDirectory()) fail('INVALID_ARGUMENT', 'output은 폴더여야 합니다.')
      } else {
        const stat = await fs.lstat(request.output).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
        if (stat && (!request.overwrite || !stat.isFile() || stat.isSymbolicLink())) fail('OUTPUT_EXISTS', '출력 파일이 이미 있습니다. 새 경로를 쓰거나 --overwrite를 지정하세요.')
        await fs.mkdir(path.dirname(request.output), { recursive: true })
      }
    }
    if (entry.dialog === 'save' && !request.output) fail('INVALID_ARGUMENT', '--output으로 저장할 파일을 지정하세요.')
    if (entry.dialog === 'open' && !request.input && !(entry.directory && request.output)) fail('INVALID_ARGUMENT', '--input으로 파일/폴더를 지정하세요. 출력 폴더 선택은 --output도 가능합니다.')
    if (!runtime.roots) return
    const roots = await runtime.roots()
    const songRoot = await canonical(roots.songs)
    const p = request.params
    const songPaths = []
    if (p.dir && (request.command.startsWith('song:'))) songPaths.push(p.dir)
    if (p.coverAudio && p.coverAudio.dir) songPaths.push(p.coverAudio.dir)
    if (request.command === 'video:prepare') for (const track of p.tracks || []) songPaths.push(track.path)
    for (const file of songPaths) {
      const location = await canonical(absolute(file, '곡 경로'))
      if (!inside(songRoot, location)) fail('INVALID_ARGUMENT', '현재 곡 라이브러리 내부의 경로만 사용할 수 있습니다.')
      if (path.relative(songRoot, location).split(path.sep).some(part => part.startsWith('.roadmusic-'))) fail('INVALID_ARGUMENT', '백업·임시 폴더는 활성 곡으로 변경할 수 없습니다.')
    }
    if (p.backup && !inside(songRoot, await canonical(absolute(p.backup, '백업 경로')))) fail('INVALID_ARGUMENT', '현재 라이브러리에 보존된 곡 백업만 사용할 수 있습니다.')
    if (request.command.startsWith('song:') && p.dir) {
      const stat = await fs.stat(p.dir).catch(() => null)
      const meta = await fs.stat(path.join(p.dir, 'meta.json')).catch(() => null)
      const missingRecoveryTarget = !stat && ['song:restore', 'song:backups'].includes(request.command)
      if (!missingRecoveryTarget && (!stat || !stat.isDirectory() || !meta || !meta.isFile())) fail('INVALID_ARGUMENT', '곡 목록에서 반환된 실제 곡 폴더를 지정하세요.')
    }
    if (p.recording && p.recording.path && !inside(await canonical(roots.recordings), await canonical(absolute(p.recording.path, '녹음 경로')))) fail('INVALID_ARGUMENT', 'recording:pick으로 불러온 녹음 경로를 사용하세요.')
    if (request.command === 'assets:remove' && !inside(await canonical(roots.assets), await canonical(absolute(p.file, '에셋 경로')))) fail('INVALID_ARGUMENT', '앱 에셋 내부 파일만 제거할 수 있습니다.')
    if (request.output && !entry.directory && inside(songRoot, await canonical(request.output))) fail('INVALID_ARGUMENT', '곡 원본을 보호하기 위해 라이브러리 밖으로 내보내세요.')
    for (const key of ['folder', 'from', ...(request.command.startsWith('projects:') ? ['name', 'to'] : [])]) {
      if (p[key] && (/[\\/]/.test(p[key]) || p[key] === '.' || p[key] === '..')) fail('INVALID_ARGUMENT', `${key}에 경로를 넣을 수 없습니다.`)
    }
    for (const folder of p.folders || []) if (/[\\/]/.test(folder) || folder === '.' || folder === '..') fail('INVALID_ARGUMENT', 'folders는 곡 폴더 이름 배열이어야 합니다.')
  }

  async function dispatch (message) {
    if (!plain(message) || typeof message.command !== 'string') fail('INVALID_ARGUMENT', 'command 문자열이 필요합니다.')
    for (const key of Object.keys(message)) if (!['id', 'command', 'params', 'input', 'output', 'confirm', 'overwrite'].includes(key)) fail('INVALID_ARGUMENT', `알 수 없는 요청 필드: ${key}`)
    for (const key of ['confirm', 'overwrite']) if (message[key] !== undefined && typeof message[key] !== 'boolean') fail('INVALID_ARGUMENT', `${key}는 boolean이어야 합니다.`)
    const request = { ...message, params: message.params === undefined ? {} : message.params }
    if (!plain(request.params)) fail('INVALID_ARGUMENT', 'params는 JSON 객체여야 합니다.')
    if (stopping && !['cli:status', 'cli:schema', 'cli:version', 'cli:update:check', 'cli:update:install'].includes(request.command)) fail('SERVICE_STOPPING', '서비스를 종료하는 중입니다.')
    if (request.command === 'cli:schema') return getSchema()
    if (request.command === 'cli:version') return getVersion()
    if (request.command === 'cli:update:check') return require('../cli/update').check(request.params)
    if (request.command === 'cli:update:install') return require('../cli/update').install(request.params)
    if (request.command === 'cli:status') {
      const status = runtime.status ? runtime.status() : {}
      return { ok: true, pid: process.pid, ...status, ...getVersion(), stopping, busy: Boolean(status.busy || activeRequests.size), requests: [...activeRequests] }
    }
    if (request.command === 'cli:show') { if (runtime.show) runtime.show(); return { ok: true } }
    if (request.command === 'cli:stop') {
      const status = runtime.status ? runtime.status() : {}
      if ((status.busy || status.installing || status.rendering || status.waiting || status.recording || status.transfers || status.preparing || activeRequests.size) && !request.confirm) fail('BUSY', '작업이 있습니다. 끝난 뒤 종료하거나 --confirm으로 중단하세요.')
      notifyStopping()
      setTimeout(() => runtime.quit && runtime.quit(), 100)
      return { ok: true, stopping: true }
    }
    if (request.command === 'job:wait') {
      const { jobId, timeoutMs = 3600000 } = request.params
      if (typeof jobId !== 'string' || !jobId || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) fail('INVALID_ARGUMENT', 'jobId와 유효한 timeoutMs가 필요합니다.')
      if (completed.has(jobId)) return completed.get(jobId)
      let found
      try { found = runtime.jobResult && await runtime.jobResult(jobId) } catch (error) {
        if (completed.has(jobId)) return completed.get(jobId)
        throw error
      }
      if (found) return found
      return new Promise((resolve, reject) => {
        const key = `job:${jobId}`
        const done = result => { clearTimeout(timer); events.removeListener(key, done); resolve(result) }
        const timer = setTimeout(() => { events.removeListener(key, done); reject(Object.assign(new Error('작업 대기 시간이 초과되었습니다. 작업은 계속 실행됩니다.'), { code: 'TIMEOUT' })) }, timeoutMs)
        events.once(key, done)
        if (completed.has(jobId)) done(completed.get(jobId))
      })
    }
    if (request.command === 'app:language') return runtime.language ? runtime.language() : 'ko'
    const entry = catalog.validate(request.command, request.params)
    if (entry.internal) fail('UNKNOWN_COMMAND', '내부 렌더러 전용 명령입니다. 공개 CLI 명령을 사용하세요.')
    request.params = entry.paramsValue
    if (request.command === 'video:cancel') {
      entry.renderer = !request.params.jobId
      entry.args = [request.params.jobId]
    }
    const token = { command: request.command, id: request.id || null }
    activeRequests.add(token)
    const execute = async () => {
      let output = null
      let outputPath = null
      let outputLocked = false
      let staging = null
      let stagedFile = null
      try {
      if (request.output) {
        outputPath = absolute(request.output, 'output')
        output = await canonical(outputPath)
        if (activeOutputs.has(output)) fail('BUSY', '같은 출력 위치를 사용하는 작업이 실행 중입니다.')
        activeOutputs.add(output)
        outputLocked = true
      }
      await checkPaths(request, entry)
      if (rendererRequest && !entry.renderer && blockedDuringRenderer.has(entry.channel)) fail('BUSY', 'CLI 화면 작업이 끝난 뒤 다시 시도하세요.')
      if (entry.renderer && librarySwap && !['player:state', 'player:stop', 'video:state', 'video:cancel', 'recording:state'].includes(request.command)) fail('BUSY', '곡 교체·복구가 끝난 뒤 화면·재생 작업을 시작하세요.')
      if (['song:replace', 'song:restore'].includes(request.command)) {
        librarySwap = request
        if (runtime.reserveLibrary) await runtime.reserveLibrary(request)
      }
      if (output && !entry.directory) {
        staging = await fs.mkdtemp(path.join(path.dirname(outputPath), '.roadmusic-export-'))
        stagedFile = path.join(staging, path.basename(outputPath))
        request.finalOutput = outputPath
        request.output = stagedFile
      }
      if (runtime.before) await runtime.before(request, entry)
      let result
      if (entry.renderer) {
        if (!runtime.renderer) fail('NOT_READY', '앱 화면이 준비되지 않았습니다.')
        if (rendererRequest && !['video:cancel', 'video:state', 'recording:state'].includes(request.command)) fail('BUSY', '다른 화면 작업이 실행 중입니다.')
        const ownContext = !rendererRequest
        if (ownContext) rendererRequest = request
        const rendererToken = crypto.randomBytes(24).toString('hex')
        rendererContexts.set(rendererToken, request)
        try { result = await runtime.renderer(request.command, request.params, rendererToken, request.finalOutput) } finally {
          rendererContexts.delete(rendererToken)
          if (ownContext) rendererRequest = null
        }
      } else {
        const handler = handlers.get(entry.channel)
        if (!handler) fail('UNKNOWN_COMMAND', `구현된 명령이 없습니다: ${request.command}`)
        result = await context.run(request, () => request.command === 'song:generate' && runtime.generate
          ? runtime.generate(request.params) : handler({ sender: runtime.webContents && runtime.webContents() }, ...entry.args))
      }
      if (stagedFile && (!result || result.ok !== false)) {
        if (!(await fs.stat(stagedFile)).isFile()) fail('COMMAND_FAILED', '완성된 출력 파일이 없습니다.')
        if (request.overwrite) await fs.rename(stagedFile, outputPath)
        else {
          try { await fs.link(stagedFile, outputPath) } catch (error) {
            if (error.code === 'EEXIST') fail('OUTPUT_EXISTS', '출력 파일이 이미 있습니다.')
            if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) throw error
            await fs.copyFile(stagedFile, outputPath, constants.COPYFILE_EXCL)
          }
        }
        result = replacePath(result, stagedFile, outputPath)
      }
      if (runtime.after) await runtime.after(request, result)
      return result === undefined ? { ok: true } : result
      } finally {
        if (librarySwap === request) {
          try { if (runtime.releaseLibrary) await runtime.releaseLibrary(request) } finally { librarySwap = null }
        }
        activeRequests.delete(token)
        if (outputLocked) activeOutputs.delete(output)
        if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
      }
    }
    // Serialize settings/library changes; cancellation and job monitoring remain available.
    if (['projects:', 'songs:', 'settings:', 'presets:', 'assets:', 'song:generate', 'song:rename', 'song:lyrics', 'song:replace', 'song:restore', 'song:delete', 'song:background'].some(prefix => request.command.startsWith(prefix))) {
      return serializeMutation(execute)
    }
    return execute()
  }

  async function listen () {
    const address = endpoint(userData)
    if (process.platform !== 'win32') {
      const existing = await fs.lstat(address).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
      if (existing) {
        if (!existing.isSocket() || (process.getuid && existing.uid !== process.getuid())) fail('SOCKET_EXISTS', '다른 소유자의 소켓 또는 파일이 있습니다.')
        const active = await new Promise(resolve => { const probe = net.createConnection(address); probe.once('connect', () => { probe.destroy(); resolve(true) }); probe.once('error', () => resolve(false)) })
        if (active) fail('SERVICE_RUNNING', '같은 데이터 폴더의 서비스가 이미 실행 중입니다.')
        await fs.unlink(address)
      }
    }
    server = net.createServer(socket => {
      clients.add(socket)
      socket.on('error', () => {})
      socket.on('close', () => clients.delete(socket))
      let buffer = ''
      socket.setEncoding('utf8')
      socket.on('data', chunk => {
        buffer += chunk
        if (Buffer.byteLength(buffer) > MAX_BYTES) { socket.destroy(); return }
        let at
        while ((at = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, at); buffer = buffer.slice(at + 1)
          if (!line.trim()) continue
          let request
          try { request = JSON.parse(line) } catch { socket.write(JSON.stringify({ id: null, error: { code: 'INVALID_JSON', message: '올바른 JSON 한 줄을 보내세요.' } }) + '\n'); continue }
          Promise.resolve().then(() => dispatch(request)).then(result => {
            if (!socket.destroyed) socket.write(JSON.stringify({ id: request.id || null, result }) + '\n')
          }, error => {
            if (!socket.destroyed) socket.write(JSON.stringify({ id: request && request.id || null, error: { code: error.code || 'COMMAND_FAILED', message: error.message } }) + '\n')
          })
        }
      })
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(address, resolve) })
    ownsSocket = true
    if (process.platform !== 'win32') await fs.chmod(address, 0o600)
    return address
  }
  async function close () {
    for (const client of clients) client.destroy()
    if (server && server.listening) await new Promise(resolve => server.close(resolve))
    if (ownsSocket && process.platform !== 'win32') await fs.unlink(endpoint(userData)).catch(error => { if (error.code !== 'ENOENT') throw error })
    ownsSocket = false
  }
  return { dispatch, listen, close, publish, notifyStopping, configure: values => Object.assign(runtime, values), rendererBusy: () => Boolean(rendererRequest), outputPending: () => Boolean(context.getStore()?.finalOutput) }
}
module.exports = { endpoint, createBridge, getSchema, getVersion }
