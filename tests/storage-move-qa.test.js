'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

const main = fsSync.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8')
const storageSource = main.slice(main.indexOf('// Already installed and the C drive'), main.indexOf('// ── playlist video'))
const repos = ['m-a-p/YuE2-3B', 'm-a-p/YuE2-Vae']

const exists = async file => fs.access(file).then(() => true, () => false)
const repoDir = (home, repo) => path.join(home, 'hub', `models--${repo.replace('/', '--')}`)

function yueModelsIn (home) {
  return repos.every(repo => {
    try {
      const dir = repoDir(home, repo)
      const rev = fsSync.readFileSync(path.join(dir, 'refs', 'main'), 'utf8').trim()
      return fsSync.existsSync(path.join(dir, 'snapshots', rev, 'config.json')) &&
        fsSync.existsSync(path.join(dir, 'snapshots', rev, 'model.safetensors'))
    } catch { return false }
  })
}

async function writeModels (home) {
  for (const [index, repo] of repos.entries()) {
    const revision = `revision-${index}`
    const dir = repoDir(home, repo)
    const snapshot = path.join(dir, 'snapshots', revision)
    await fs.mkdir(snapshot, { recursive: true })
    await fs.mkdir(path.join(dir, 'blobs'), { recursive: true })
    for (const name of ['config.json', 'model.safetensors']) {
      const blob = `${index}-${name}`
      await fs.writeFile(path.join(dir, 'blobs', blob), `${repo}:${name}`)
      await fs.symlink(path.join('..', '..', 'blobs', blob), path.join(snapshot, name))
    }
    await fs.mkdir(path.join(dir, 'refs'), { recursive: true })
    await fs.writeFile(path.join(dir, 'refs', 'main'), revision)
  }
}

async function fixture (t, { rename, copyFile, writeSettings } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-storage-move-'))
  const fromModels = path.join(root, 'hf')
  const songs = path.join(root, 'songs')
  const modelParent = path.join(root, 'model-target')
  const songParent = path.join(root, 'song-target')
  await Promise.all([fs.mkdir(modelParent), fs.mkdir(songParent), fs.mkdir(songs, { recursive: true })])
  const handlers = new Map()
  const settings = {}
  const calls = { sendQueue: 0 }
  const fsp = { ...fs, rename: rename || fs.rename, copyFile: copyFile || fs.copyFile }
  const context = {
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    currentJob: null, queue: [], failed: [], win: {}, path, fs: fsSync, fsp,
    YUE_REPOS: repos, yueModelsIn, findYueModels: () => yueModelsIn(fromModels) ? fromModels : null,
    exists, canWrite: async () => true, freeSpaceGb: async () => null,
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [modelParent] }) },
    ensureSongsDir: async () => songs,
    writeSettings: writeSettings || (async patch => Object.assign(settings, patch)),
    sendQueue: () => { calls.sendQueue++ },
    send () {}, log () {}, songsDir: null
  }
  vm.runInNewContext(storageSource, context)
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return { root, fromModels, songs, modelParent, songParent, handlers, context, settings, calls }
}

test('model move transfers only YuE cache entries and leaves unrelated HF files in place', async t => {
  const fx = await fixture(t)
  await writeModels(fx.fromModels)
  const unrelated = path.join(fx.fromModels, 'hub', 'models--other--model')
  await fs.mkdir(unrelated, { recursive: true })
  await fs.writeFile(path.join(fx.fromModels, 'token'), 'keep')
  const result = await fx.handlers.get('settings:move-models')()
  const to = path.join(await fs.realpath(fx.modelParent), 'RoadMusic-models')

  assert.equal(result.ok, true)
  assert.equal(fx.settings.hfHome, to)
  assert.equal(yueModelsIn(to), true)
  assert.equal(await exists(unrelated), true)
  assert.equal(await exists(path.join(fx.fromModels, 'token')), true)
  for (const repo of repos) assert.equal(await exists(repoDir(fx.fromModels, repo)), false)
  assert.equal(await exists(path.join(to, 'hub', 'models--other--model')), false)
})

test('model move rejects a missing source and an existing target before it writes', async t => {
  const fx = await fixture(t)
  let dialogs = 0
  fx.context.dialog.showOpenDialog = async () => { dialogs++; return { canceled: false, filePaths: [fx.modelParent] } }
  assert.equal((await fx.handlers.get('settings:move-models')()).ok, false)
  assert.equal(dialogs, 0)

  await writeModels(fx.fromModels)
  fx.context.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fx.fromModels] })
  const nested = await fx.handlers.get('settings:move-models')()
  assert.equal(nested.ok, false)
  assert.equal(yueModelsIn(fx.fromModels), true)

  fx.context.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fx.modelParent] })
  const to = path.join(await fs.realpath(fx.modelParent), 'RoadMusic-models')
  await fs.mkdir(to)
  const conflict = await fx.handlers.get('settings:move-models')()
  assert.equal(conflict.ok, false)
  assert.equal(yueModelsIn(fx.fromModels), true)
  assert.deepEqual(await fs.readdir(to), [])
})

test('model move keeps both valid copies when saving its new setting fails', async t => {
  const fx = await fixture(t, { writeSettings: async () => { throw new Error('settings disk full') } })
  await writeModels(fx.fromModels)
  const result = await fx.handlers.get('settings:move-models')()
  const to = path.join(await fs.realpath(fx.modelParent), 'RoadMusic-models')
  assert.equal(result.ok, false)
  assert.equal(yueModelsIn(fx.fromModels), true)
  assert.equal(yueModelsIn(to), true)
})

test('song move falls back only for EXDEV, preserves empty folders and internal links', async t => {
  let original
  const fx = await fixture(t, { rename: async (from, to) => {
    if (from === original) {
      const error = new Error('cross device')
      error.code = 'EXDEV'
      throw error
    }
    return fs.rename(from, to)
  } })
  original = await fs.realpath(fx.songs)
  await fs.mkdir(path.join(fx.songs, 'empty'), { recursive: true })
  await fs.mkdir(path.join(fx.songs, 'project'), { recursive: true })
  await fs.writeFile(path.join(fx.songs, 'project', 'audio.mp3'), 'song')
  await fs.symlink('audio.mp3', path.join(fx.songs, 'project', 'cover.mp3'))
  fx.context.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fx.songParent] })

  const result = await fx.handlers.get('settings:move-songs')()
  const to = path.join(await fs.realpath(fx.songParent), 'Road Music Songs')
  assert.equal(result.ok, true)
  assert.equal(fx.settings.songsDir, to)
  assert.equal(await exists(fx.songs), false)
  assert.equal((await fs.stat(path.join(to, 'empty'))).isDirectory(), true)
  assert.equal(await fs.readFile(path.join(to, 'project', 'cover.mp3'), 'utf8'), 'song')
})

test('song move does not copy after a non-EXDEV rename error and retains the source after copy failure', async t => {
  let copies = 0
  const fx = await fixture(t, {
    rename: async () => { const error = new Error('permission denied'); error.code = 'EACCES'; throw error },
    copyFile: async () => { copies++; throw new Error('should not copy') }
  })
  await fs.writeFile(path.join(fx.songs, 'audio.mp3'), 'song')
  fx.context.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fx.songParent] })
  const denied = await fx.handlers.get('settings:move-songs')()
  assert.equal(denied.ok, false)
  assert.equal(copies, 0)
  assert.equal(await exists(fx.songs), true)
  assert.equal(await exists(path.join(fx.songParent, 'Road Music Songs')), false)

  let failingSource
  const failing = await fixture(t, { rename: async (from, to) => {
    if (from === failingSource) { const error = new Error('cross device'); error.code = 'EXDEV'; throw error }
    return fs.rename(from, to)
  }, copyFile: async () => { throw new Error('copy failed') } })
  failingSource = await fs.realpath(failing.songs)
  await fs.writeFile(path.join(failing.songs, 'audio.mp3'), 'song')
  failing.context.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [failing.songParent] })
  const copied = await failing.handlers.get('settings:move-songs')()
  assert.equal(copied.ok, false)
  assert.equal(await exists(failing.songs), true)
  assert.equal(await exists(path.join(failing.songParent, 'Road Music Songs')), false)
})

test('song move restores the original folder when saving the new location fails', async t => {
  const fx = await fixture(t, { writeSettings: async () => { throw new Error('settings disk full') } })
  await fs.writeFile(path.join(fx.songs, 'audio.mp3'), 'song')
  fx.context.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fx.songParent] })

  const result = await fx.handlers.get('settings:move-songs')()
  const to = path.join(await fs.realpath(fx.songParent), 'Road Music Songs')
  assert.equal(result.ok, false)
  assert.equal(await fs.readFile(path.join(fx.songs, 'audio.mp3'), 'utf8'), 'song')
  assert.equal(await exists(to), false)
})

test('song move remaps failed retry and cover paths from the original path spelling and saves the queue', async t => {
  const fx = await fixture(t)
  const retry = path.join(fx.songs, 'project', 'retry')
  const cover = path.join(fx.songs, 'recordings', 'cover.wav')
  const outsideCover = path.join(fx.root, 'outside.wav')
  await fs.mkdir(retry, { recursive: true })
  await fs.mkdir(path.dirname(cover), { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(retry, 'partial.wav'), 'retry'),
    fs.writeFile(cover, 'cover'),
    fs.writeFile(outsideCover, 'outside')
  ])
  const outsideRetry = path.join(fx.songs, 'project', 'outside-cover')
  await fs.mkdir(outsideRetry, { recursive: true })
  fx.context.failed.push(
    { jobId: 'inside', outDir: retry, job: { outDir: retry, cover: { audio: cover } } },
    { jobId: 'outside', outDir: outsideRetry, job: { outDir: outsideRetry, cover: { audio: outsideCover } } }
  )
  fx.context.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fx.songParent] })

  const result = await fx.handlers.get('settings:move-songs')()
  const to = path.join(await fs.realpath(fx.songParent), 'Road Music Songs')
  const [inside, outside] = fx.context.failed
  assert.equal(result.ok, true)
  assert.equal(inside.outDir, path.join(to, 'project', 'retry'))
  assert.equal(inside.job.outDir, inside.outDir)
  assert.equal(inside.job.cover.audio, path.join(to, 'recordings', 'cover.wav'))
  assert.equal(await exists(inside.outDir), true)
  assert.equal(await exists(inside.job.cover.audio), true)
  assert.equal(outside.outDir, path.join(to, 'project', 'outside-cover'))
  assert.equal(outside.job.cover.audio, outsideCover)
  assert.equal(fx.calls.sendQueue, 1)
})
