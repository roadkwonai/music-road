'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { endpoint, createBridge } = require('../electron/cli-transport')

async function fixture (t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-cli-test-'))
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const dialog = { showSaveDialog: async () => { throw new Error('native dialog must not open') }, showOpenDialog: async () => { throw new Error('native dialog must not open') } }
  const bridge = createBridge({ ipcMain, dialog, userData: root })
  t.after(async () => { await bridge.close(); await fs.rm(root, { recursive: true, force: true }) })
  return { root, ipcMain, dialog, bridge, handlers }
}

test('invokes existing handler and isolates concurrent save paths', async t => {
  const { bridge, ipcMain, dialog, root } = await fixture(t)
  ipcMain.handle('song:save-srt', async (_e, p) => {
    await new Promise(resolve => setTimeout(resolve, p.title === 'one' ? 20 : 1))
    const target = await dialog.showSaveDialog({})
    await fs.writeFile(target.filePath, p.text)
    return { ...target, text: p.text }
  })
  const [one, two] = await Promise.all(['one', 'two'].map(title => bridge.dispatch({ command: 'song:save-srt', params: { title, text: title }, output: path.join(root, title + '.srt') })))
  assert.equal(one.filePath, path.join(root, 'one.srt'))
  assert.equal(two.filePath, path.join(root, 'two.srt'))
})

test('renderer requests receive native paths for URL-only local media', async t => {
  const { bridge } = await fixture(t)
  const file = path.resolve('/tmp/local background.png')
  bridge.configure({ renderer: async (_command, params) => {
    assert.equal(params.video.background.path, file)
    assert.equal(params.video.overlays[0].path, file)
    return { ok: true }
  } })
  const url = require('node:url').pathToFileURL(file).href
  await bridge.dispatch({ command: 'video:configure', params: { video: { background: { kind: 'image', url }, overlays: [{ url }] } } })
})

test('refuses missing path, overwriting and unconfirmed destructive calls before handler', async t => {
  const { bridge, ipcMain, root } = await fixture(t)
  let called = 0
  ipcMain.handle('song:save-srt', async () => { called++; return {} })
  ipcMain.handle('queue:clear', async () => { called++; return {} })
  await assert.rejects(bridge.dispatch({ command: 'song:save-srt', params: { title: 'x', text: 'x' } }), { code: 'INVALID_ARGUMENT' })
  const output = path.join(root, 'existing.srt')
  await fs.writeFile(output, 'preserve')
  await assert.rejects(bridge.dispatch({ command: 'song:save-srt', params: { title: 'x', text: 'x' }, output }), { code: 'OUTPUT_EXISTS' })
  await assert.rejects(bridge.dispatch({ command: 'queue:clear', params: {} }), { code: 'CONFIRM_REQUIRED' })
  assert.equal(called, 0)
  assert.equal(await fs.readFile(output, 'utf8'), 'preserve')
})

test('local JSON Lines server handles split requests and malformed input', async t => {
  const { bridge, ipcMain, root } = await fixture(t)
  ipcMain.handle('queue:list', () => ({ waiting: [], paused: false }))
  await bridge.listen()
  assert.equal((await fs.stat(endpoint(root))).mode & 0o777, 0o600)
  const socket = net.createConnection(endpoint(root))
  t.after(() => socket.destroy())
  let text = ''
  const complete = new Promise(resolve => socket.on('data', chunk => {
    text += chunk
    if (text.trim().split('\n').length === 2) resolve(text.trim().split('\n').map(JSON.parse))
  }))
  socket.write('{bad}\n{"id":"42","command":"queue:')
  socket.write('list","params":{}}\n')
  const rows = await complete
  assert.equal(rows[0].error.code, 'INVALID_JSON')
  assert.equal(rows[1].id, '42')
  assert.deepEqual(rows[1].result, { waiting: [], paused: false })
})

test('song deletion rejects a project folder, a file and a sibling-prefix escape', async t => {
  const { bridge, ipcMain, root } = await fixture(t)
  const songs = path.join(root, 'Songs')
  const project = path.join(songs, 'project')
  const song = path.join(project, 'song')
  await fs.mkdir(song, { recursive: true })
  await fs.writeFile(path.join(song, 'meta.json'), '{}')
  bridge.configure({ roots: () => ({ songs, assets: path.join(root, 'assets'), recordings: path.join(root, 'recordings') }) })
  let called = 0
  ipcMain.handle('song:delete', () => { called++; return { ok: true } })
  for (const dir of [project, path.join(song, 'meta.json'), songs + '-outside']) {
    await assert.rejects(bridge.dispatch({ command: 'song:delete', params: { dir }, confirm: true }), { code: 'INVALID_ARGUMENT' })
  }
  assert.equal(called, 0)
  assert.equal((await bridge.dispatch({ command: 'song:delete', params: { dir: song }, confirm: true })).ok, true)
})

test('completed job events resolve waiting agents and remain queryable', async t => {
  const { bridge } = await fixture(t)
  const waiting = bridge.dispatch({ command: 'job:wait', params: { jobId: 'job-42', timeoutMs: 1000 } })
  bridge.publish('job:done', { jobId: 'job-42', audio: '/tmp/song.wav' })
  assert.equal((await waiting).song.jobId, 'job-42')
  assert.equal((await bridge.dispatch({ command: 'job:wait', params: { jobId: 'job-42' } })).song.audio, '/tmp/song.wav')
})

test('retrying a queued job does not replay its previous failure', async t => {
  const { bridge } = await fixture(t)
  bridge.publish('job:error', { jobId: 'retry-1', message: 'old failure' })
  bridge.publish('queue:update', { waiting: [{ jobId: 'retry-1' }], current: null })
  const wait = bridge.dispatch({ command: 'job:wait', params: { jobId: 'retry-1', timeoutMs: 1000 } })
  bridge.publish('job:done', { jobId: 'retry-1', audio: '/tmp/retry.wav' })
  assert.equal((await wait).ok, true)
})

test('GUI dialogs do not inherit a concurrent renderer CLI output', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-cli-context-'))
  const handlers = new Map()
  const sender = {}
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler) }
  const dialog = { showSaveDialog: async () => ({ canceled: false, filePath: path.join(root, 'gui.mp4') }) }
  const bridge = createBridge({ ipcMain, dialog, userData: root })
  t.after(async () => { await bridge.close(); await fs.rm(root, { recursive: true, force: true }) })
  let started
  const ready = new Promise(resolve => { started = resolve })
  let finish
  bridge.configure({ webContents: () => sender, renderer: async (_command, _params, token) => {
    started(token)
    return new Promise(resolve => { finish = resolve })
  } })
  ipcMain.handle('video:start', () => dialog.showSaveDialog({ filters: [{ extensions: ['mp4'] }] }))
  const request = bridge.dispatch({ command: 'video:render', params: {}, output: path.join(root, 'cli.mp4') })
  const token = await ready
  const gui = await handlers.get('video:start')({ sender }, {})
  assert.equal(gui.filePath, path.join(root, 'gui.mp4'))
  const cli = await handlers.get('cli:invoke')({ sender }, { token, channel: 'video:start', args: [{}] })
  assert.equal(path.basename(cli.filePath), 'cli.mp4')
  assert.notEqual(cli.filePath, gui.filePath)
  await assert.rejects(handlers.get('cli:invoke')({ sender: {} }, { token, channel: 'video:start', args: [{}] }), { code: 'ACCESS_DENIED' })
  await fs.writeFile(cli.filePath, 'video')
  finish({ ok: true, path: cli.filePath })
  assert.equal((await request).path, path.join(root, 'cli.mp4'))
})

test('failed exports preserve the previous file and successful exports commit once', async t => {
  const { bridge, ipcMain, dialog, root } = await fixture(t)
  const output = path.join(root, 'protected.srt')
  await fs.writeFile(output, 'original')
  ipcMain.handle('song:save-srt', async (_event, params) => {
    const target = await dialog.showSaveDialog({ filters: [{ extensions: ['srt'] }] })
    await fs.writeFile(target.filePath, params.text)
    return params.title === 'fail' ? { ok: false, message: 'simulated failure' } : { ok: true, path: target.filePath }
  })
  const payload = { command: 'song:save-srt', params: { title: 'fail', text: 'partial' }, output, overwrite: true }
  assert.equal((await bridge.dispatch(payload)).ok, false)
  assert.equal(await fs.readFile(output, 'utf8'), 'original')
  const result = await bridge.dispatch({ ...payload, params: { title: 'success', text: 'complete' } })
  assert.equal(result.path, output)
  assert.equal(await fs.readFile(output, 'utf8'), 'complete')
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.roadmusic-export-')), [])
})

test('a competing final export preserves the last remembered directory', async t => {
  const { bridge, ipcMain, dialog, root } = await fixture(t)
  const output = path.join(root, 'race.srt')
  let settings = { exportDir: '/previous' }
  const source = await fs.readFile(path.join(__dirname, '../electron/main.js'), 'utf8')
  const context = { cliBridge: bridge, readSettings: async () => settings, writeSettings: async patch => { settings = { ...settings, ...patch } } }
  require('node:vm').runInNewContext(source.slice(source.indexOf('async function rememberExportDir'), source.indexOf("ipcMain.handle('settings:pick-export'")), context)
  bridge.configure({ after: async request => { if (request.finalOutput) await context.rememberExportDir(path.dirname(request.finalOutput)) } })
  ipcMain.handle('song:save-srt', async () => {
    const target = await dialog.showSaveDialog({ filters: [{ extensions: ['srt'] }] })
    await context.rememberExportDir(path.dirname(target.filePath))
    await fs.writeFile(target.filePath, 'complete')
    await fs.writeFile(output, 'competitor')
    return { ok: true, path: target.filePath }
  })
  await assert.rejects(bridge.dispatch({ command: 'song:save-srt', params: { title: 'race', text: 'complete' }, output }), { code: 'OUTPUT_EXISTS' })
  assert.equal(settings.exportDir, '/previous')
  assert.equal(await fs.readFile(output, 'utf8'), 'competitor')
  await fs.unlink(output)
  ipcMain.handle('song:save-srt', async () => {
    const target = await dialog.showSaveDialog({ filters: [{ extensions: ['srt'] }] })
    await context.rememberExportDir(path.dirname(target.filePath))
    await fs.writeFile(target.filePath, 'complete')
    return { ok: true, path: target.filePath }
  })
  await bridge.dispatch({ command: 'song:save-srt', params: { title: 'success', text: 'complete' }, output })
  assert.equal(settings.exportDir, root)
})

test('unused file flags fail before creating folders and save extension must match', async t => {
  const { bridge, ipcMain, dialog, root } = await fixture(t)
  ipcMain.handle('songs:list', () => [])
  ipcMain.handle('song:save-srt', () => dialog.showSaveDialog({ filters: [{ extensions: ['srt'] }] }))
  const output = path.join(root, 'unused', 'out.json')
  await assert.rejects(bridge.dispatch({ command: 'songs:list', params: {}, output }), { code: 'INVALID_ARGUMENT' })
  await assert.rejects(fs.stat(path.dirname(output)), { code: 'ENOENT' })
  await assert.rejects(bridge.dispatch({ command: 'song:save-srt', params: { title: 'x', text: 'x' }, output: path.join(root, 'wrong.mp3') }), { code: 'INVALID_ARGUMENT' })
})

test('job metadata is refreshed after a song file is renamed', async t => {
  const { bridge, ipcMain } = await fixture(t)
  bridge.publish('job:done', { jobId: 'rename-1', audio: '/old.wav' })
  bridge.configure({ jobResult: async () => ({ ok: true, song: { jobId: 'rename-1', audio: '/renamed.wav' } }) })
  ipcMain.handle('song:rename', () => ({ ok: true }))
  await bridge.dispatch({ command: 'song:rename', params: { dir: '/tmp/song', title: 'new' } })
  assert.equal((await bridge.dispatch({ command: 'job:wait', params: { jobId: 'rename-1' } })).song.audio, '/renamed.wav')
})
