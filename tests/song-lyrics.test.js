'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const vm = require('node:vm')
const { createBridge } = require('../electron/cli-transport')
const { commands, validate } = require('../electron/cli-catalog')

async function fixture (t) {
  assert.ok(commands['song:lyrics'], 'song:lyrics must be a public command')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-song-lyrics-'))
  const dir = path.join(root, 'Songs', 'project', 'song')
  await fs.mkdir(dir, { recursive: true })
  const meta = { title: '나를 믿어', imported: true, lyrics: '', seconds: 3,
    request: { lyrics: 'original generation input' }, audio: path.join(dir, '나를 믿어.mp3') }
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta))
  await fs.writeFile(meta.audio, Buffer.from([0, 1, 255, 42]))
  const guiHandlers = new Map()
  const ipcMain = { handle: (channel, handler) => guiHandlers.set(channel, handler) }
  const bridge = createBridge({ ipcMain, dialog: {}, userData: path.join(root, 'data') })
  bridge.configure({ roots: () => ({ songs: path.join(root, 'Songs') }) })
  const source = await fs.readFile(path.join(__dirname, '../electron/main.js'), 'utf8')
  const start = source.indexOf("ipcMain.handle('song:lyrics',")
  assert.notEqual(start, -1, 'lyrics handler must be implemented')
  const context = { ipcMain, fsp: fs, path, crypto, performance: require('node:perf_hooks').performance, songMetadata: require('../electron/song-metadata'), WIN: false, currentJob: null, queue: [], log () {},
    readSongMeta: async (songDir) => JSON.parse(await fs.readFile(path.join(songDir, 'meta.json'), 'utf8')),
    trackSongLifecycle: async () => ({ recorded: true }),
    trackProduction: async (action, params) => ({ requestId: params.requestId || 'a'.repeat(48), taskId: params.taskId }) }
  vm.runInNewContext(source.slice(start, source.indexOf("ipcMain.handle('song:reveal'", start)), context)
  t.after(async () => { await bridge.close(); await fs.rm(root, { recursive: true, force: true }) })
  const read = async () => JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'))
  return { root, dir, meta, ipcMain, guiHandlers, bridge, context, read }
}

test('lyrics updates preserve exact text, audio and generation provenance, including explicit clearing', async t => {
  const { dir, meta, bridge, read } = await fixture(t)
  const lyrics = '[Chorus]\r\n나는 나를 믿어  \n\n남들 눈치 보며\n'
  for (let i = 0; i < 2; i++) {
    const result = await bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics } })
    assert.equal(result.ok, true)
    assert.deepEqual(await read(), { ...meta, lyrics })
    assert.deepEqual(await fs.readFile(meta.audio), Buffer.from([0, 1, 255, 42]))
  }
  await bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '' } })
  assert.deepEqual(await read(), meta)
})

test('lyrics writes reject invalid payloads, escaped paths, symlink metadata and active generation', async t => {
  const { root, dir, meta, bridge, context, read } = await fixture(t)
  for (const params of [{ dir }, { dir, lyrics: null }, { dir, lyrics: 1 },
    { dir, lyrics: '가'.repeat(20001) }, { dir, lyrics: '가사', audio: '/other.mp3' }]) {
    assert.throws(() => validate('song:lyrics', params), { code: 'INVALID_ARGUMENT' })
  }
  const outside = path.join(root, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'meta.json'), '{}')
  await assert.rejects(bridge.dispatch({ command: 'song:lyrics', params: { dir: outside, lyrics: '가사' } }), { code: 'INVALID_ARGUMENT' })
  context.currentJob = { outDir: dir }
  assert.equal((await bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '가사' } })).ok, false)
  context.currentJob = null
  context.queue = [{ outDir: dir }]
  assert.equal((await bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '가사' } })).ok, false)
  context.queue = []
  assert.deepEqual(await read(), meta)
  if (process.platform !== 'win32') {
    await fs.unlink(path.join(dir, 'meta.json'))
    await fs.symlink(path.join(outside, 'meta.json'), path.join(dir, 'meta.json'))
    assert.equal((await bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '가사' } })).ok, false)
    assert.equal(await fs.readFile(path.join(outside, 'meta.json'), 'utf8'), '{}')
  }
})

test('failed metadata replacement preserves the previous file and removes staging files', async t => {
  const { dir, meta, bridge, context, read } = await fixture(t)
  context.fsp = { ...fs, rename: async () => { throw Object.assign(new Error('disk failure'), { code: 'EIO' }) } }
  const result = await bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '새 가사' } })
  assert.equal(result.ok, false)
  assert.deepEqual(await read(), meta)
  assert.deepEqual((await fs.readdir(dir)).sort(), ['meta.json', '나를 믿어.mp3'].sort())
})

test('Windows lyrics writes preserve metadata through the backup-based writer', async t => {
  const { dir, meta, bridge, context, read } = await fixture(t)
  context.WIN = true
  const result = await bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '새 가사' } })
  assert.equal(result.ok, true)
  assert.deepEqual(await read(), { ...meta, lyrics: '새 가사' })
  assert.deepEqual((await fs.readdir(dir)).sort(), ['meta.json', '나를 믿어.mp3'].sort())
})

test('lyrics writes serialize with renames and invalidate cached job metadata', async t => {
  const { dir, bridge, ipcMain, read } = await fixture(t)
  bridge.publish('job:done', { jobId: 'lyrics-job', song: { lyrics: 'stale' } })
  bridge.configure({ jobResult: async () => ({ ok: true, song: await read() }) })
  ipcMain.handle('song:rename', async () => {
    const meta = await read()
    await new Promise(resolve => setTimeout(resolve, 25))
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ ...meta, title: 'changed title' }))
    return { ok: true }
  })
  await Promise.all([
    bridge.dispatch({ command: 'song:rename', params: { dir, title: 'changed title' } }),
    bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '확정 가사' } })
  ])
  assert.equal((await read()).title, 'changed title')
  assert.equal((await read()).lyrics, '확정 가사')
  // Refill the cache to exercise lyrics invalidation separately from rename invalidation.
  bridge.publish('job:done', { jobId: 'lyrics-job', song: { lyrics: 'stale again' } })
  await bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '확정 가사' } })
  assert.equal((await bridge.dispatch({ command: 'job:wait', params: { jobId: 'lyrics-job' } })).song.lyrics, '확정 가사')
})

test('lyrics updates are blocked during a renderer operation', async t => {
  const { dir, bridge } = await fixture(t)
  let ready; let finish
  const started = new Promise(resolve => { ready = resolve })
  bridge.configure({ renderer: async () => { ready(); return new Promise(resolve => { finish = resolve }) } })
  const rendering = bridge.dispatch({ command: 'video:preview', params: {} })
  await started
  try {
    await assert.rejects(bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '가사' } }), { code: 'BUSY' })
  } finally { finish({ ok: true }); await rendering }
})

test('GUI rename cannot overwrite a concurrent CLI lyrics update with stale metadata', async t => {
  const { dir, bridge, ipcMain, guiHandlers, read } = await fixture(t)
  let ready
  const started = new Promise(resolve => { ready = resolve })
  ipcMain.handle('song:rename', async () => {
    const meta = await read()
    ready()
    await new Promise(resolve => setTimeout(resolve, 25))
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ ...meta, title: 'GUI title' }))
    return { ok: true }
  })
  const rename = guiHandlers.get('song:rename')({}, { dir, title: 'GUI title' })
  await started
  await Promise.all([rename, bridge.dispatch({ command: 'song:lyrics', params: { dir, lyrics: '확정 가사' } })])
  assert.equal((await read()).title, 'GUI title')
  assert.equal((await read()).lyrics, '확정 가사')
})

test('refresh displays updated imported lyrics in the already open song info window', async () => {
  const source = await fs.readFile(path.join(__dirname, '../renderer/app.js'), 'utf8')
  const elements = new Map()
  const element = () => ({ textContent: '', disabled: false, children: [],
    dataset: {},
    classList: { contains: () => false, remove () {} },
    append (...children) { this.children.push(...children) },
    appendChild (child) { this.children.push(child) },
    querySelector (selector) { return this[selector] ||= element() } })
  const $ = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id) }
  const context = { $, document: { createElement: element }, selected: { dir: '/song', lyrics: '' },
    window: { yue: { listSongs: async () => [{ dir: '/song', title: '나를 믿어', audio: '/song/final.mp3', imported: true, lyrics: '확정 가사\n둘째 줄' }], hiddenSongs: async () => [] } },
    lyricSections: require('../renderer/srt').lyricSections,
    renderProjects: async () => {}, renderSongs () {}, engineIdFromSong: () => null }
  vm.runInNewContext('let infoRows = [];\n' +
    source.slice(source.indexOf('function lyricsOf ('), source.indexOf('async function resume (')) +
    source.slice(source.indexOf('function renderSongMeta ('), source.indexOf('// "가사 점검"')) +
    source.slice(source.indexOf('function openSongInfo ('), source.indexOf('function wireSongInfo (')) +
    source.slice(source.indexOf('async function refresh ()'), source.indexOf('// ── generation')), context)
  await context.refresh()
  assert.equal($('nowTitle').textContent, '나를 믿어')
  assert.equal($('songInfoLyrics').textContent, '확정 가사\n둘째 줄')
  assert.equal($('songInfoCopy').disabled, false)
  assert.equal($('reuseSong').disabled, true)
  assert.equal($('exportSrt').disabled, false)
  assert.match($('exportSrt').dataset.tip, /악보가 없어/)
  assert.equal($('coverSong').disabled, false)
  assert.ok($('songMeta').children.some(row => row.querySelector('.meta-key').textContent === '가사'))
})
