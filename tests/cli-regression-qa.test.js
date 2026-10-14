'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { request, socketEndpoint } = require('../cli/client')
const { createBridge } = require('../electron/cli-transport')

const cliPath = path.resolve(__dirname, '../cli/road-music.js')

function runCli (dataDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, ROADMUSIC_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''; let stderr = ''
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', value => { stdout += value })
    child.stderr.on('data', value => { stderr += value })
    child.once('error', reject)
    child.once('close', code => resolve({ code, row: JSON.parse(stdout.trim()), stderr }))
  })
}

test('rejects internal transport commands that the public schema omits', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-cli-internal-'))
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const dialog = {}
  const bridge = createBridge({ ipcMain, dialog, userData: root })
  let invoked = false
  ipcMain.handle('video:frame', () => { invoked = true; return true })
  t.after(async () => { await bridge.close(); await fs.rm(root, { recursive: true, force: true }) })

  await assert.rejects(
    bridge.dispatch({ command: 'video:frame', params: { jobId: 'render-1', index: 0, data: [0, 0, 0, 0] } }),
    { code: 'UNKNOWN_COMMAND' }
  )
  assert.equal(invoked, false)
})

test('restores a paused saved queue before the renderer lists and sweeps partial songs', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-cli-queue-'))
  const dataDir = path.join(root, 'data')
  const songsDir = path.join(root, 'songs')
  const projectDir = path.join(songsDir, 'QA')
  const outDir = path.join(projectDir, '20990101000000_paused')
  const jobId = 'paused-job'
  let servicePid = null
  const job = { cmd: 'generate', engine: 'yue', jobId, outDir, id: 'song', title: 'paused',
    style: 'ambient', lyrics: '', instrumental: true, soundEffect: false, seed: 1 }
  await fs.mkdir(outDir, { recursive: true })
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(path.join(outDir, 'meta.json'), JSON.stringify({ ...job, status: 'queued' }))
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({
    language: 'ko', engineSetupSkipped: true, dataDir, hfHome: path.join(dataDir, 'models'), songsDir, project: 'QA'
  }))
  await fs.writeFile(path.join(dataDir, 'queue.json'), JSON.stringify({
    paused: true, items: [{ jobId, outDir, title: 'paused', job }]
  }))
  t.after(async () => {
    await runCli(dataDir, ['service:stop', '--confirm']).catch(() => {})
    let socketDown = false
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { await request({ endpoint: socketEndpoint(dataDir), command: 'cli:status', timeout: 100 }) } catch { socketDown = true; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    let processDown = !servicePid
    for (let attempt = 0; servicePid && attempt < 50; attempt += 1) {
      try { process.kill(servicePid, 0) } catch { processDown = true; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (socketDown && processDown) await fs.rm(root, { recursive: true, force: true })
    else console.error(`회귀 로그 보존: ${root}`)
  })

  const started = await runCli(dataDir, ['service:start'])
  assert.equal(started.code, 0, started.stderr)
  servicePid = started.row.result.pid
  const queue = await runCli(dataDir, ['queue:list', '--no-start'])
  assert.equal(queue.code, 0, queue.stderr)
  assert.equal(queue.row.result.paused, true)
  assert.deepEqual(queue.row.result.waiting, [{ jobId, title: 'paused' }])
  assert.ok((await fs.stat(outDir)).isDirectory())
})

test('a worker process failure remains retryable after service restart', { skip: process.platform === 'win32' }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-cli-worker-failure-'))
  const dataDir = path.join(root, 'data')
  const python = path.join(dataDir, 'engines', 'ace-step', 'venv', 'bin', 'python')
  const model = path.join(dataDir, 'engines', 'ace-step', 'src', 'checkpoints', 'acestep-v15-turbo', 'model.safetensors')
  await fs.mkdir(path.dirname(python), { recursive: true })
  await fs.mkdir(path.dirname(model), { recursive: true })
  await fs.writeFile(model, 'test fixture')
  await fs.writeFile(python, '#!/bin/sh\nread ignored_job\nprintf "synthetic worker failure\\n" >&2\nexit 21\n', { mode: 0o755 })
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({ language: 'ko', aceInstalled: true, dataDir, songsDir: path.join(dataDir, 'Songs') }))
  let pid
  const stop = async () => {
    await runCli(dataDir, ['service:stop', '--confirm']).catch(() => {})
    for (let attempt = 0; pid && attempt < 50; attempt++) {
      try { process.kill(pid, 0) } catch { return }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  t.after(async () => { await stop(); await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })
  pid = (await runCli(dataDir, ['service:start'])).row.result.pid
  const submitted = await runCli(dataDir, ['song:generate', '--json', '{"style":"ambient piano","instrumental":true,"targetSeconds":10}'])
  const jobId = submitted.row.result.jobId
  assert.ok(jobId)
  const result = await runCli(dataDir, ['job:wait', '--json', JSON.stringify({ jobId, timeoutMs: 5000 }), '--timeout', '5000'])
  assert.equal(result.row.ok, false)
  assert.ok((await runCli(dataDir, ['queue:list'])).row.result.failed.some(job => job.jobId === jobId))
  await stop()
  pid = (await runCli(dataDir, ['service:start'])).row.result.pid
  assert.ok((await runCli(dataDir, ['queue:list'])).row.result.failed.some(job => job.jobId === jobId))
})
