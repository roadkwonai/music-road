'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8')

async function temporaryRoot (t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'roadmusic-retry-'))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  return root
}

function generationContext ({ songs, recordings }) {
  const queue = []
  const context = {
    fs, fsp, path, crypto, queue, currentJob: null,
    generationError: () => null,
    engineInstalled: async () => true,
    ensureSongsDir: async () => songs,
    recordingsDir: () => recordings,
    exists: async file => fs.existsSync(file),
    cleanParts: parts => parts || null,
    songFolder: async () => path.join(songs, 'new-song'),
    writeMeta: async (dir, meta) => fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta)),
    log () {}, sendQueue () {}, pump () {}
  }
  const code = source.slice(source.indexOf('async function savedCover'), source.indexOf('// Lyric timing ACE-Step'))
  vm.runInNewContext(code, context)
  return { context, queue }
}

test('internal retries retain a validated saved cover source and strength', async t => {
  const root = await temporaryRoot(t)
  const songs = path.join(root, 'Songs')
  const recordings = path.join(root, 'recordings')
  const original = path.join(songs, '20260101000000_original', 'song.wav')
  const outDir = path.join(songs, '20260102000000_retry')
  await fsp.mkdir(path.dirname(original), { recursive: true })
  await fsp.writeFile(original, 'wav')
  const { context, queue } = generationContext({ songs, recordings })

  const result = await context.startGeneration({
    engine: 'ace', title: 'retry', style: 'piano', lyrics: 'line', outDir,
    cover: { audio: original, strength: 0.65, from: '원곡' }
  })

  assert.equal(result.ok, true)
  const written = JSON.parse(await fsp.readFile(path.join(outDir, 'meta.json'), 'utf8'))
  assert.deepEqual(written.cover, { audio: await fsp.realpath(original), strength: 0.65, from: '원곡' })
  assert.equal(JSON.stringify(queue[0].job.cover), JSON.stringify(written.cover))
})

test('internal saved covers reject out-of-library and invalid sources', async t => {
  const root = await temporaryRoot(t)
  const songs = path.join(root, 'Songs')
  const recordings = path.join(root, 'recordings')
  const outside = path.join(root, 'Songs-old', 'song.wav')
  const inside = path.join(songs, '20260101000000_original', 'song.wav')
  await fsp.mkdir(path.dirname(outside), { recursive: true })
  await fsp.mkdir(path.dirname(inside), { recursive: true })
  await fsp.writeFile(outside, 'wav')
  await fsp.writeFile(inside, 'wav')
  const { context } = generationContext({ songs, recordings })

  const result = await context.startGeneration({
    engine: 'ace', title: 'retry', style: 'piano', lyrics: 'line',
    cover: { audio: outside, strength: 0.65, from: '원곡' }
  })

  assert.equal(result.ok, false)
  const invalidStrength = await context.startGeneration({
    engine: 'ace', title: 'retry', style: 'piano', lyrics: 'line',
    cover: { audio: inside, strength: 1.01, from: '원곡' }
  })
  assert.equal(invalidStrength.ok, false)
})

test('recording cleanup retains cover takes referenced by active, waiting, and failed jobs', async t => {
  const root = await temporaryRoot(t)
  const recordings = path.join(root, 'recordings')
  await fsp.mkdir(recordings, { recursive: true })
  const takes = []
  for (let i = 0; i < 34; i++) {
    const stamp = `202001010000${String(i).padStart(2, '0')}`
    const file = path.join(recordings, `${stamp}_take.wav`)
    await fsp.writeFile(file, 'wav')
    takes.push(file)
  }
  const input = path.join(root, 'input.wav')
  await fsp.writeFile(input, 'wav')
  const context = {
    fsp, path,
    userData: () => root,
    currentJob: { job: { cover: { audio: takes[0] } } },
    queue: [{ job: { cover: { audio: takes[1] } } }],
    failed: [{ job: { cover: { audio: takes[2] } } }],
    videoFfmpeg: async () => 'ffmpeg',
    convert: async (_ffmpeg, source, target) => fsp.copyFile(source, target),
    videoTools: { probeSeconds: async () => 2 },
    pathToFileURL: file => new URL(`file://${file}`),
    log () {}
  }
  const code = source.slice(source.indexOf('const recordingsDir ='), source.indexOf('// A short take repeated'))
  vm.runInNewContext(code, context)

  await context.keepRecording(input, 'new')

  for (const take of takes.slice(0, 3)) assert.equal(fs.existsSync(take), true)
  assert.equal(fs.existsSync(takes[3]), false)
})
