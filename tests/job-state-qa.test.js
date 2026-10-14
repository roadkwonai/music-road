'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8')

async function queueContext (t, extra = {}) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'roadmusic-state-'))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const context = { fs, fsp, path, crypto: require('node:crypto'), process, userData: () => root,
    queue: [], failed: [], jobResults: new Map(), currentJob: null, paused: false,
    queueRestored: false, log () {}, sendQueue () {}, pump () {}, hasAudio: async () => false,
    ensureSongsDir: async () => root, exists: async file => fs.existsSync(file),
    within: (child, parent) => child !== parent && !path.relative(parent, child).startsWith('..'), ...extra }
  const code = source.slice(source.indexOf('const queueFile ='), source.indexOf('// Hand the next waiting song'))
  vm.runInNewContext(code, context)
  return { root, context }
}

test('queue persistence leaves the previous state intact if final replacement fails', async t => {
  const wrapped = Object.create(fs)
  wrapped.renameSync = () => { throw Object.assign(new Error('permission'), { code: 'EACCES' }) }
  const { root, context } = await queueContext(t, { fs: wrapped, queueRestored: true })
  const previous = '{"paused":true,"items":[]}'
  await fsp.writeFile(path.join(root, 'queue.json'), previous)
  context.paused = false
  context.saveQueue()
  assert.equal(await fsp.readFile(path.join(root, 'queue.json'), 'utf8'), previous)
})

test('failed jobs and terminal outcomes survive queue restoration', async t => {
  const { root, context } = await queueContext(t)
  const job = { jobId: 'failed-1', outDir: path.join(root, 'old'), title: 'failed', job: { engine: 'ace' }, message: 'engine error' }
  await fsp.writeFile(path.join(root, 'queue.json'), JSON.stringify({ paused: true, items: [], failed: [job], results: [['failed-1', { ok: false, jobId: 'failed-1', message: 'engine error' }]] }))
  await context.restoreQueue()
  assert.equal(context.failed[0].jobId, 'failed-1')
  assert.equal(context.jobResults.get('failed-1').message, 'engine error')
})

test('a retry rejected before submission keeps its failed card available', async t => {
  const { context } = await queueContext(t)
  const item = { jobId: 'failed-1', title: 'failed', job: { engine: 'ace' }, message: 'error' }
  context.failed.push(item)
  let retry
  context.ipcMain = { handle: (_channel, handler) => { retry = handler } }
  context.resumable = async () => false
  context.startGeneration = async () => ({ ok: false, message: 'engine is missing' })
  vm.runInNewContext(source.slice(source.indexOf("ipcMain.handle('queue:retry'"), source.indexOf("ipcMain.handle('queue:dismiss'")), context)
  assert.equal((await retry(null, 'failed-1')).ok, false)
  assert.equal(context.failed[0], item)
})

test('a failed GUI enqueue preserves the worker job already running', async () => {
  const active = { jobId: 'running-A', title: 'already running' }
  let generate
  const context = { currentJob: active, log () {},
    ipcMain: { handle: (_channel, handler) => { generate = handler } },
    startGeneration: async () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) } }
  vm.runInNewContext(source.slice(source.indexOf("ipcMain.handle('song:generate'"), source.indexOf("ipcMain.handle('ui:log'")), context)
  const result = await generate(null, { title: 'new-B' })
  assert.equal(result.ok, false)
  assert.match(result.message, /disk full/)
  assert.equal(context.currentJob, active)
})
