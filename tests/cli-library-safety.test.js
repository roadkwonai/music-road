'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { createBridge } = require('../electron/cli-transport')

test('a library swap blocks new playback/video in both CLI and GUI while allowing its internal state checks', { timeout: 3000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-swap-lock-'))
  const dir = path.join(root, 'Songs', 'QA', 'song')
  const file = path.join(root, 'new.mp3')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'meta.json'), '{}'); await fs.writeFile(file, 'fixture')
  const gui = new Map()
  const ipcMain = { handle: (name, fn) => gui.set(name, fn) }
  const bridge = createBridge({ ipcMain, dialog: {}, userData: path.join(root, 'data') })
  t.after(async () => { await bridge.close(); await fs.rm(root, { recursive: true, force: true }) })
  let ready; let finish; let released = 0
  const started = new Promise(resolve => { ready = resolve })
  bridge.configure({ roots: () => ({ songs: path.join(root, 'Songs') }), renderer: async () => ({ ok: true }),
    reserveLibrary: async () => {}, releaseLibrary: async () => { released++ } })
  ipcMain.handle('song:replace', async () => { ready(); await new Promise(resolve => { finish = resolve }); return { ok: true } })
  ipcMain.handle('video:prepare', () => ({ ok: true }))
  const pending = bridge.dispatch({ command: 'song:replace', params: { dir }, input: [file] })
  await started
  try {
    for (const command of ['player:play', 'video:preview', 'song:info']) {
      await assert.rejects(bridge.dispatch({ command, params: command === 'video:preview' ? {} : { dir } }), { code: 'BUSY' })
    }
    assert.equal((await bridge.dispatch({ command: 'player:state', params: {} })).ok, true)
    assert.equal((await gui.get('video:prepare')({}, {})).code, 'BUSY')
  } finally { finish(); await pending }
  assert.equal(released, 1)
  assert.equal((await bridge.dispatch({ command: 'player:play', params: { dir } })).ok, true)
})

test('main playback protection canonicalizes a directory alias before comparing the playing song', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-swap-alias-'))
  const dir = path.join(root, 'song'); await fs.mkdir(dir)
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const source = await fs.readFile(path.join(__dirname, '../electron/main.js'), 'utf8')
  const reserved = source.indexOf('    reserveLibrary: async')
  const start = reserved >= 0 ? reserved : source.indexOf('    before: async')
  const end = reserved >= 0 ? source.indexOf('    releaseLibrary:', start) : source.indexOf('    after:', start)
  const context = { fsp: fs, path, renderJobs: new Map(), recordingActive: false, fileTransferTasks: 0,
    updateBlocksWork: () => false, win: { webContents: { executeJavaScript: async () => {} } },
    cliBridge: { dispatch: async () => ({ dir, playing: true }) } }
  const callbacks = vm.runInNewContext('({' + source.slice(start, end) + '})', context)
  const guard = callbacks.reserveLibrary || callbacks.before
  await assert.rejects(guard({ command: 'song:replace', params: { dir: `${dir}/../song/.` } }, {}), { code: 'BUSY' })
})
