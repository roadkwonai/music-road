#!/usr/bin/env node
'use strict'
// Runs real release updates in disposable installations, never the user's app.
const fs = require('node:fs/promises')
const syncFs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { parseArgs } = require('../cli/client')

const repository = path.resolve(__dirname, '..')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until (read, accept, timeoutMs, label, pollMs = 200) {
  const deadline = Date.now() + timeoutMs
  let value
  while (Date.now() < deadline) {
    value = await read()
    if (accept(value)) return value
    await pause(pollMs)
  }
  throw new Error(`${label}: ${JSON.stringify(value)}`)
}
function command (file, args, env, cwd, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', value => { stdout += value })
    child.stderr.on('data', value => { stderr += value })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}
async function freePort () {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function connectRenderer (port) {
  const targets = await until(async () => {
    try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() } catch { return [] }
  }, rows => rows.some(row => row.type === 'page'), 30000, 'renderer debug connection')
  const target = targets.find(row => row.type === 'page')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const task = pending.get(message.id)
    if (!task) return
    clearTimeout(task.timer); pending.delete(message.id)
    if (message.error) task.reject(new Error(JSON.stringify(message.error)))
    else task.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('renderer closed')) }
    pending.clear()
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  return {
    call,
    evaluate: async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    },
    close: () => socket.close()
  }
}

async function main () {
  if (process.platform !== 'darwin') throw new Error('This live release test requires macOS')
  const options = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, args) => {
    if (index % 2 === 0) rows.push([value.replace(/^--/, ''), args[index + 1]])
    return rows
  }, []))
  const mode = options.mode || 'cli'
  assert.ok(['gui', 'cli', 'source'].includes(mode), 'mode must be gui, cli or source')
  const expected = options['expected-version']
  assert.match(expected || '', /^\d+\.\d+\.\d+$/)
  if (mode !== 'source') assert.ok(path.isAbsolute(options['baseline-app'] || ''), 'baseline-app must be absolute')
  const output = path.join(repository, 'dist/update-e2e')
  await fs.mkdir(output, { recursive: true })
  const root = await fs.realpath(await fs.mkdtemp(path.join(output, `${mode}-`)))
  const data = path.join(root, 'data')
  await fs.mkdir(data)
  const env = { ...process.env, ROADMUSIC_DATA_DIR: data, ROAD_MUSIC_NODE: process.execPath }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  const run = async (file, args, cwd, timeout) => {
    const result = await command(file, args, env, cwd, timeout)
    assert.equal(result.code, 0, `${file}: ${result.stderr.slice(-3000) || result.stdout.slice(-3000)}`)
    return result.stdout.trim()
  }
  const cli = async (name, params = {}, { optional = false, flags = [] } = {}) => {
    const timeout = ['update:install', 'update:download'].includes(name) ? 1800000
      : name === 'video:render' ? 120000
      : name === 'update:watch' ? Math.min(3600000, (params.timeoutMs || 3000) + 5000) : 15000
    const args = [name, '--json', JSON.stringify(params), '--no-start', '--timeout', String(timeout), ...flags]
    parseArgs(args) // Invalid test arguments must fail, rather than look like a stopped service.
    const result = await command(process.execPath, [path.join(repository, 'cli/road-music.js'), ...args], env, repository, timeout + 5000)
    const row = JSON.parse(result.stdout.trim())
    if (!row.ok && optional && (row.error.code === 'SERVICE_STOPPED' ||
      (row.error.code === 'connection' && /ENOENT|ECONNREFUSED|ECONNRESET/.test(row.error.message)))) return null
    assert.equal(row.ok, true, `${name}: ${result.stdout} ${result.stderr}`)
    assert.equal(result.code, 0)
    return row.result
  }
  let bundle = null
  let source = null
  let executable
  let args
  const port = await freePort()
  if (mode === 'source') {
    source = path.join(root, 'source')
    await run('git', ['clone', '--branch', 'v1.4.0', 'https://github.com/roadkwonai/music-road.git', source])
    await run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], source, 300000)
    executable = path.join(source, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    args = [source, '--roadmusic-service']
  } else {
    bundle = path.join(root, 'Road Music.app')
    await run('/usr/bin/ditto', [options['baseline-app'], bundle])
    executable = path.join(bundle, 'Contents/MacOS/Road Music')
    args = mode === 'cli' ? ['--roadmusic-service'] : [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1']
  }
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ language: 'ko', engineSetupSkipped: true,
    songsDir: path.join(data, 'Songs'), updateSentinel: 'keep-settings' }))
  for (const folder of ['Songs', 'models']) {
    await fs.mkdir(path.join(data, folder))
    await fs.writeFile(path.join(data, folder, 'preserved.txt'), `keep-${folder}`)
  }
  const log = syncFs.openSync(path.join(root, 'app.log'), 'a')
  let launched
  let renderer
  let oldPid
  let success = false
  const evidence = { mode, expected, root }
  try {
    launched = spawn(executable, args, { env, cwd: source || root, stdio: ['ignore', log, log] })
    const started = await until(() => cli('service:status', {}, { optional: true }), Boolean, 45000, 'baseline service')
    oldPid = started.pid
    evidence.before = (await cli('app:state')).version
    assert.equal(evidence.before, '1.4.0')
    if (mode === 'gui') renderer = await connectRenderer(port)
    const originalAudio = path.join(root, 'before-update.wav')
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=1', originalAudio])
    await cli('projects:create', { name: '업데이트 이전 검증' })
    await cli('songs:import', {}, { flags: ['--input', originalAudio] })
    const originalSongs = await cli('songs:list')
    assert.equal(originalSongs.length, 1)
    if (options.notification === 'periodic') {
      const initial = await until(() => cli('update:status'), state => state.status !== 'checking', 45000, 'initial update check')
      assert.equal(initial.available, false, 'start the periodic test before publishing the next release')
      const start = Date.now()
      console.log(JSON.stringify({ phase: 'waiting-for-real-periodic-notification', root, before: evidence.before, expected }))
      let alarm
      if (initial.status === 'error') {
        evidence.initialCheckError = initial.error
        await until(() => cli('update:status'), state => state.available && state.version === expected, 1200000, 'periodic recovery after initial server error', 2000)
        alarm = await cli('update:watch', { timeoutMs: 3000 }, { flags: ['--events'] })
      } else {
        alarm = await cli('update:watch', { timeoutMs: 1200000 }, { flags: ['--events'] })
      }
      assert.equal(alarm.version, expected)
      assert.equal(alarm.changed, true)
      const elapsedMs = Date.now() - start
      assert.ok(elapsedMs >= 870000, `periodic notification arrived too early: ${elapsedMs}`)
      evidence.notification = { status: alarm.status, version: alarm.version, trigger: '15-minute-periodic', elapsedMs }
    } else {
      const available = await until(() => cli('update:status'), state => state.available && state.version === expected, 60000, 'automatic startup notification')
      evidence.notification = { status: available.status, version: available.version, trigger: 'startup' }
    }
    if (renderer) {
      await until(() => renderer.evaluate('!document.getElementById("updateOpen").classList.contains("hidden")'), Boolean, 15000, 'GUI update badge')
      assert.equal(await renderer.evaluate('!document.getElementById("updateBadge").classList.contains("hidden")'), true)
      assert.equal(await renderer.evaluate('document.getElementById("update").classList.contains("hidden")'), true)
      await renderer.evaluate('document.getElementById("updateOpen").click()')
      assert.ok((await renderer.evaluate('document.getElementById("updateTo").textContent')).includes(expected))
      await pause(250)
      const screenshot = await renderer.call('Page.captureScreenshot', { format: 'png' })
      await fs.writeFile(path.join(root, 'notification.png'), Buffer.from(screenshot.data, 'base64'))
      await renderer.evaluate('document.getElementById("updateAction").click()')
    } else {
      const alarm = await cli('update:watch', { timeoutMs: 3000 }, { flags: ['--events'] })
      assert.equal(alarm.version, expected)
      assert.equal(alarm.changed, true)
      if (options['busy-check'] === 'true') {
        assert.equal((await cli('update:download', {}, { flags: ['--events'] })).status, 'downloaded')
        const rendering = cli('video:render', { tracks: [originalSongs[0].dir], name: '업데이트 진행 작업 보호',
          video: { resolution: '720p', fps: 30, renderer: 'cpu', length: { mode: 'repeat', count: 30 },
            spectrum: { visible: true, kind: 'bars', barCount: 16 } } },
        { flags: ['--output', path.join(root, 'protected-render.mp4')] })
        rendering.catch(() => {})
        await until(() => cli('service:status'), state => state.rendering || state.requests?.some(item => item.command === 'video:render'), 15000, 'active video render')
        const blocked = await cli('update:install')
        assert.equal(blocked.status, 'error', JSON.stringify(blocked))
        assert.match(blocked.error, /진행 중|작업/)
        assert.equal((await cli('service:status')).pid, oldPid)
        assert.equal((await cli('app:state')).version, evidence.before)
        await rendering
        evidence.busyProtection = { installationBlocked: true, oldProcessPreserved: true, renderCompleted: true }
      }
      const installed = await cli('update:install', {}, { flags: ['--events'] })
      assert.equal(installed.status, 'installing', JSON.stringify(installed))
    }
    const after = await until(async () => {
      const state = await cli('app:state', {}, { optional: true })
      const service = state ? await cli('service:status', {}, { optional: true }) : null
      return state && service ? { state, service } : null
    }, row => row && row.state.version === expected && row.service.pid !== oldPid, 180000, 'new app version and PID')
    assert.equal(after.service.visible, mode === 'gui')
    evidence.after = { version: after.state.version, pidChanged: after.service.pid !== oldPid, visible: after.service.visible }
    const installed = await until(() => cli('update:status'), state => state.installerResult?.ok === true, 15000, 'installer result')
    assert.equal(installed.installerResult.version, expected)
    if (bundle) {
      const info = JSON.parse(await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(bundle, 'Contents/Info.plist')]))
      assert.equal(info.CFBundleShortVersionString, expected)
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
      assert.ok((await fs.stat(installed.installerResult.backup)).isDirectory())
      evidence.backup = true
    } else {
      assert.equal(await run('git', ['status', '--porcelain'], source), '')
      assert.equal(JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8')).version, expected)
    }
    for (const folder of ['Songs', 'models']) assert.equal(await fs.readFile(path.join(data, folder, 'preserved.txt'), 'utf8'), `keep-${folder}`)
    assert.equal(JSON.parse(await fs.readFile(path.join(data, 'settings.json'), 'utf8')).updateSentinel, 'keep-settings')
    assert.equal((await cli('projects:list')).current, '업데이트 이전 검증')
    assert.equal((await cli('songs:list'))[0].dir, originalSongs[0].dir)
    evidence.originalSongPreserved = true
    await cli('projects:create', { name: '업데이트 이후 검증' })
    const audio = path.join(root, 'input.wav')
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', audio])
    await cli('songs:import', {}, { flags: ['--input', audio] })
    const songs = await cli('songs:list')
    assert.equal(songs.length, 1)
    const mp3 = path.join(root, 'after-update.mp3')
    await cli('song:export', { dir: songs[0].dir, format: 'mp3' }, { flags: ['--output', mp3] })
    await run('ffmpeg', ['-v', 'error', '-i', mp3, '-f', 'null', '-'])
    evidence.preserved = ['songs', 'models', 'settings']
    evidence.afterUpdateExport = true
    evidence.ok = true
    success = true
  } finally {
    renderer?.close()
    await cli('service:stop', {}, { optional: true }).catch(error => { evidence.cleanupError = error.message })
    if (launched && launched.exitCode === null) launched.kill('SIGTERM')
    syncFs.closeSync(log)
    await fs.writeFile(path.join(root, 'result.json'), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify(evidence))
    if (!success) console.error(`Diagnostic log: ${path.join(root, 'app.log')}`)
  }
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1 })
