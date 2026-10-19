'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8')
function handler (name, next, overrides = {}) {
  const records = []; let fn; let clock = 100
  const context = {
    ipcMain: { handle: (_name, value) => { fn = value } }, performance: { now: () => { clock += 17; return clock } },
    crypto, path, Date, currentJob: null, queue: [], WIN: false, log: () => {},
    fsp: { realpath: async dir => dir }, readSongMeta: async () => ({ title: '원제', lyrics: '원문' }),
    songMetadata: { writeSongLyrics: async () => ({ updated: true }) },
    trackProduction: async (action, params) => { records.push({ action, params }); return action === 'request' ? { requestId: 'b'.repeat(48) } : { taskId: params.taskId } },
    trackSongLifecycle: async () => ({ recorded: true }), ...overrides
  }
  vm.runInNewContext(source.slice(source.indexOf(`ipcMain.handle('${name}'`), source.indexOf(`ipcMain.handle('${next}'`)), context)
  return { fn, records }
}

test('lyrics request links the returned ID and records measured successful work', async () => {
  const { fn, records } = handler('song:lyrics', 'song:reveal')
  const result = await fn(null, { dir: '/tmp/song', lyrics: '새 가사', requestPrompt: '후렴만 부드럽게' })
  assert.equal(result.ok, true)
  assert.equal(records[0].params.prompt, '후렴만 부드럽게')
  assert.equal(records.find(row => row.action === 'task-start').params.requestId, 'b'.repeat(48))
  const done = records.find(row => row.action === 'task-finish').params
  assert.equal(done.status, 'succeeded'); assert.ok(done.elapsedMs > 0)
})

test('unchanged and busy lyric edits always terminate their task without counting a successful revision', async () => {
  for (const busy of [false, true]) {
    const { fn, records } = handler('song:lyrics', 'song:reveal', busy ? { currentJob: { outDir: '/tmp/song' } } : {})
    const result = await fn(null, { dir: '/tmp/song', lyrics: '원문', requestPrompt: '가사 확인' })
    assert.equal(result.ok, !busy)
    assert.equal(records.filter(row => row.action === 'task-finish').length, 1)
    assert.notEqual(records.find(row => row.action === 'task-finish').params.status, 'succeeded')
  }
})

test('worker dispatch waits for running persistence before sending input', async () => {
  const events = []; let release
  const pending = new Promise(resolve => { release = resolve })
  const ctx = { currentJob: null, queue: [{ outDir: '/tmp/song', job: { engine: 'ace', taskId: 'a'.repeat(48), requestPrompt: 'private prompt' } }], paused: false,
    startWorker: () => {}, worker: { stdin: { write: text => { assert.equal(JSON.parse(text).requestPrompt, undefined); assert.equal(JSON.parse(text).taskId, undefined); events.push('worker') } } },
    trackProduction: async () => { events.push('record-start'); await pending; events.push('record-done') },
    performance: { now: () => 500 }, log: () => {}, send: () => {}, sendQueue: () => {} }
  vm.runInNewContext(source.slice(source.indexOf('async function pump () {'), source.indexOf('// The prompt builder\'s fields')), ctx)
  const run = ctx.pump(); assert.deepEqual(events, ['record-start'])
  release(); await run; assert.deepEqual(events, ['record-start', 'record-done', 'worker'])
})

test('generated-file inventory streams batches and preserves intermediate WAV roles', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'road-production-files-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (let i = 0; i < 205; i++) fs.writeFileSync(path.join(root, `${i}.abc`), 'metadata')
  fs.writeFileSync(path.join(root, 'working.wav'), 'intermediate')
  fs.writeFileSync(path.join(root, 'final.wav'), 'final')
  fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'))
  const batches = []
  const ctx = { path, fsp, log: () => {}, send: () => {}, trackProduction: async (action, params) => { assert.equal(action, 'files-record'); batches.push(params.files) } }
  vm.runInNewContext(source.slice(source.indexOf('async function recordProductionFiles ('), source.indexOf('async function dropSongLifecycle')), ctx)
  await ctx.recordProductionFiles('a'.repeat(48), root, [path.join(root, 'final.wav')])
  assert.deepEqual(batches.map(rows => rows.length), [200, 7])
  const files = batches.flat()
  assert.equal(files.find(row => row.path.endsWith('working.wav')).role, 'intermediate')
  assert.equal(files.find(row => row.path.endsWith('final.wav')).role, 'final')
  assert.ok(files.every(row => !row.path.includes('/outside/')))
})


test('file recording failures remain visible on the completed task', async () => {
  let terminal
  const ctx={productionInventories:new Map(),deliveryPython:async()=>'/python',userData:()=>'/profile',log:()=>{},send:()=>{},
    productionHistory:{recordProduction:async(action,params)=>{if(action==='files-record')throw Error('SQLITE_FULL');terminal=params;return {taskId:params.taskId}}}}
  vm.runInNewContext(source.slice(source.indexOf('async function trackProduction ('),source.indexOf('async function recordProductionFiles (')),ctx)
  await ctx.trackProduction('files-record',{taskId:'a'.repeat(48),files:[]})
  await ctx.trackProduction('task-finish',{taskId:'a'.repeat(48),status:'succeeded'})
  assert.equal(terminal.fileInventoryComplete,false)
  assert.match(terminal.fileInventoryWarning,/SQLITE_FULL/)
  assert.equal(ctx.productionInventories.size,0)
})

test('filesystem inventory failures remain visible on the completed task', async () => {
  let terminal
  const ctx = { path, productionInventories: new Map(), deliveryPython: async () => '/python', userData: () => '/profile', log: () => {}, send: () => {},
    fsp: { readdir: async () => { throw Error('EACCES') } },
    productionHistory: { recordProduction: async (action, params) => { terminal = params; return { taskId: params.taskId } } } }
  vm.runInNewContext(source.slice(source.indexOf('async function trackProduction ('), source.indexOf('async function dropSongLifecycle')), ctx)
  await ctx.recordProductionFiles('a'.repeat(48), '/project')
  await ctx.trackProduction('task-finish', { taskId: 'a'.repeat(48), status: 'succeeded' })
  assert.equal(terminal.fileInventoryComplete, false)
  assert.match(terminal.fileInventoryWarning, /EACCES/)
  assert.equal(ctx.productionInventories.size, 0)
})

test('generated-song final audio hash failure aborts completion before lifecycle recording', async () => {
  const ctx = {
    currentJob: null, path, pathToFileURL: require('node:url').pathToFileURL, app: { getVersion: () => '0.1.0' }, log: () => {},
    completedEngineId: () => 'ace',
    fsp: { readFile: async () => JSON.stringify({ title: '해시 실패' }) }, jobPlaceholder: () => ({ title: '해시 실패' }),
    autoConvert: async () => ({ dropWav: false }), nameAudio: async () => ({ wav: null, mp3: '/tmp/final.mp3' }),
    songDelivery: { replaceMetadata: async () => {} }, tidySong: async () => {}, recordCompletedSong: async () => null,
    libraryMedia: { sha256: async () => { throw Error('EIO') } },
    trackSongLifecycle: async () => { throw Error('lifecycle must not run') }
  }
  vm.runInNewContext(source.slice(source.indexOf('async function saveSong ('), source.indexOf('// ── ffmpeg ──')), ctx)
  await assert.rejects(ctx.saveSong({ jobId: 'job-1', audio: '/tmp/worker.wav', meta: { id: 'song', seconds: 1 } }), /EIO/)
})
