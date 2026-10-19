'use strict'

const assert = require('node:assert/strict')
const fsSync = require('node:fs')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { prepareVideoStorage, trackVideoCache, releaseVideoStorage, retainVideoStorage, releaseVideoStorageUser, previewLegacyVideoCache, cleanupLegacyVideoCache } = require('../electron/video-storage')
const { dispatch: storageDispatch } = require('../cli/storage')

test('uses a completed song folder as the single-track cache owner', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-video-storage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const song = path.join(root, 'song')
  const audio = path.join(song, 'song.wav')
  await fs.mkdir(song); await fs.writeFile(audio, 'audio')
  const calls = []
  const dispatch = async (command, params) => {
    calls.push({ command, params })
    if (command === 'storage:register') return { id: 'project' }
    if (command === 'storage:lease') return command && { token: 'lease', pid: process.pid }
    return { id: 'entry' }
  }
  const storage = await prepareVideoStorage({ tracks: [{ path: audio }], userData: path.join(root, 'profile'), dispatch, pid: process.pid })
  const reused = await prepareVideoStorage({ tracks: [{ path: audio }], userData: path.join(root, 'profile'), dispatch, pid: process.pid, existingStorage: storage })
  assert.equal(reused, storage)
  assert.equal(calls.filter(call => call.command === 'storage:lease').length, 1)
  assert.equal(calls[0].params.project, song)
  assert.match(storage.cacheDir, /song\/\.roadmusic\/cache\/video\//)
  await fs.mkdir(storage.cacheDir, { recursive: true })
  await fs.writeFile(path.join(storage.cacheDir, 'cycle.f32'), 'cache')
  await trackVideoCache(storage, dispatch)
  await releaseVideoStorage(storage, dispatch)
  assert.deepEqual(calls.slice(1).map(call => call.command), ['storage:lease', 'storage:track', 'storage:lease'])
  assert.equal(calls.at(-1).params.token, 'lease')
})

test('creates a marker-only owner for a multi-track cache without copying sources', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-video-storage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const tracks = ['one', 'two'].map(name => ({ path: path.join(root, `${name}.wav`), title: name }))
  await Promise.all(tracks.map(track => fs.writeFile(track.path, 'audio')))
  const calls = []
  const dispatch = async (command, params) => {
    calls.push({ command, params })
    if (command === 'storage:register') return { id: 'playlist' }
    if (command === 'storage:lease') return { token: 'lease' }
    return { id: 'entry' }
  }
  const storage = await prepareVideoStorage({ tracks, userData: path.join(root, 'profile'), dispatch, pid: process.pid })
  const marker = JSON.parse(await fs.readFile(path.join(storage.projectDir, 'studio-project.json'), 'utf8'))
  assert.deepEqual(marker.media.map(item => item.path), tracks.map(item => item.path))
  assert.equal(await fs.readFile(tracks[0].path, 'utf8'), 'audio')
  assert.match(path.basename(storage.projectDir), /^one-외1곡-/)
  const renamed = await prepareVideoStorage({ tracks: tracks.map((track, index) => ({ ...track, title: `새 제목 ${index}` })), userData: path.join(root, 'profile'), dispatch, pid: process.pid, existingStorage: null })
  assert.equal(renamed.projectDir, storage.projectDir)
  assert.match(storage.cacheDir, /\.roadmusic\/cache\/video\//)
})

test('registers, locks, tracks, and releases a video cache through the storage core', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-video-storage-core-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const song = path.join(root, 'song')
  const audio = path.join(song, 'song.wav')
  const userData = path.join(root, 'profile')
  await fs.mkdir(song); await fs.writeFile(audio, 'audio')
  await fs.writeFile(path.join(song, 'meta.json'), JSON.stringify({ title: '완성곡' }))
  const dispatch = (command, params) => storageDispatch(command, params, { root: path.resolve(__dirname, '..'), userData })
  const storage = await prepareVideoStorage({ tracks: [{ path: audio }], userData, dispatch, pid: process.pid })
  assert.ok(storage.projectId)
  await fs.mkdir(storage.cacheDir, { recursive: true })
  await fs.writeFile(path.join(storage.cacheDir, 'cycle.spectrum'), 'cache')
  const entry = await trackVideoCache(storage, dispatch)
  assert.equal(entry.kind, 'cache')
  assert.equal((await releaseVideoStorage(storage, dispatch)).released, true)
})

test('does not permit video preparation to continue without storage registration and lease', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-video-storage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const audio = path.join(root, 'song.wav')
  await fs.writeFile(audio, 'audio')
  await assert.rejects(prepareVideoStorage({
    tracks: [{ path: audio }], userData: path.join(root, 'profile'), pid: process.pid,
    dispatch: async () => { throw new Error('storage unavailable') }
  }), /storage unavailable/)
})

test('keeps a lease releasable after a transient release failure', async () => {
  const storage = { projectId: 'project', token: 'lease' }
  let attempts = 0
  const dispatch = async () => {
    attempts += 1
    if (attempts === 1) throw new Error('temporary failure')
    return { released: true }
  }
  await assert.rejects(releaseVideoStorage(storage, dispatch), /temporary failure/)
  assert.equal(storage.released, undefined)
  assert.equal((await releaseVideoStorage(storage, dispatch)).released, true)
  assert.equal(storage.released, true)
})

test('releases a shared storage lease only after its final cycle or render user leaves', async () => {
  const storage = { projectId: 'project', token: 'lease' }
  retainVideoStorage(storage, 'prepared:30fps')
  retainVideoStorage(storage, 'prepared:60fps')
  let calls = 0
  const dispatch = async () => { calls += 1; return { released: true } }
  assert.equal(await releaseVideoStorageUser(storage, 'prepared:30fps', dispatch), null)
  assert.equal(calls, 0)
  assert.equal((await releaseVideoStorageUser(storage, 'prepared:60fps', dispatch)).released, true)
  assert.equal(calls, 1)
})

test('records the export directory before starting and registering a render job', () => {
  const source = fsSync.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8')
  const start = source.indexOf("ipcMain.handle('video:start'")
  const end = source.indexOf("ipcMain.handle('video:frame'", start)
  const handler = source.slice(start, end)
  assert.ok(handler.indexOf('await rememberExportDir') < handler.indexOf('new videoTools.RenderJob'))
})

async function legacyCycle (cache, id = '0123456789abcdef0123') {
  const seconds = 1; const fps = 30; const frameCount = 30
  const wav = Buffer.alloc(44 + seconds * 48000 * 4)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(192000, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34)
  wav.write('data', 36); wav.writeUInt32LE(seconds * 48000 * 4, 40)
  const meta = { seconds, frameCount, fps, sampleRate: 48000, chapters: [], sourceHash: id }
  const settingsHash = 'abcdef0123456789abcd'
  const header = { version: 1, sourceHash: id, durationSeconds: seconds, sampleRate: 48000, fps, frameCount, barCount: 8, analysisSettingsHash: settingsHash }
  await fs.writeFile(path.join(cache, `${id}.json`), JSON.stringify(meta))
  await fs.writeFile(path.join(cache, `${id}.wav`), wav)
  await fs.writeFile(path.join(cache, `${id}.f32`), Buffer.alloc(seconds * 48000 * 4))
  await fs.writeFile(path.join(cache, `${id}_${settingsHash}.bin`), Buffer.concat([Buffer.from(JSON.stringify(header) + '\n'), Buffer.alloc(frameCount * 8 * 4)]))
  return { id, settingsHash }
}

test('previews and clears only a complete validated legacy shared video cache', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'road-video-legacy-')))
  const cache = path.join(root, 'video-cache')
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(cache); await legacyCycle(cache)
  await fs.writeFile(path.join(cache, 'keep.txt'), 'unknown')
  const plan = await previewLegacyVideoCache(root)
  assert.equal(plan.fileCount, 4)
  assert.equal(plan.blocked.length, 1)
  const cleaned = await cleanupLegacyVideoCache(plan)
  assert.deepEqual(cleaned, { removedFiles: 4, freedBytes: plan.bytes, skipped: [] })
  assert.equal(await fs.readFile(path.join(cache, 'keep.txt'), 'utf8'), 'unknown')
  assert.equal((await fs.readdir(cache)).length, 1)
})

test('protects legacy cache symlinks and rejects a changed preview before deleting any file', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'road-video-legacy-')))
  const cache = path.join(root, 'video-cache')
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(cache); const { id } = await legacyCycle(cache)
  await fs.symlink(path.join(cache, `${id}.f32`), path.join(cache, 'linked.f32'))
  const plan = await previewLegacyVideoCache(root)
  assert.ok(plan.blocked.some(item => item.name === 'linked.f32' && /symlink/.test(item.reason)))
  await fs.appendFile(path.join(cache, `${id}.f32`), 'changed')
  await assert.rejects(cleanupLegacyVideoCache(plan), /변경/)
  assert.equal((await fs.stat(path.join(cache, `${id}.json`))).isFile(), true)
  assert.equal((await fs.lstat(path.join(cache, 'linked.f32'))).isSymbolicLink(), true)
})

test('shared cache plan rejects an equal-size overwrite and handles missing cache as empty', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'road-video-legacy-')))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  assert.equal((await previewLegacyVideoCache(root)).fileCount, 0)
  assert.equal((await cleanupLegacyVideoCache(await previewLegacyVideoCache(root))).removedFiles, 0)
  const cache = path.join(root, 'video-cache'); await fs.mkdir(cache)
  const { id } = await legacyCycle(cache)
  const plan = await previewLegacyVideoCache(root)
  const file = path.join(cache, `${id}.f32`)
  const data = await fs.readFile(file); data[0] ^= 1
  await fs.writeFile(file, data)
  await assert.rejects(cleanupLegacyVideoCache(plan), /변경/)
  assert.equal((await fs.readdir(cache)).length, 4)
})

test('partial shared cache failure reports exact removed files and preserves remaining files', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'road-video-legacy-')))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const cache = path.join(root, 'video-cache'); await fs.mkdir(cache); await legacyCycle(cache)
  const plan = await previewLegacyVideoCache(root)
  const unlink = fs.unlink; let calls = 0; let result
  try {
    fs.unlink = async file => { if (++calls === 2) throw new Error('injected disk failure'); return unlink(file) }
    result = await cleanupLegacyVideoCache(plan)
  } finally { fs.unlink = unlink }
  assert.equal(result.removedFiles, 1)
  assert.equal(result.freedBytes, plan.files[0].bytes)
  assert.equal(result.skipped.length, 3)
  assert.equal((await fs.readdir(cache)).length, 3)
})
