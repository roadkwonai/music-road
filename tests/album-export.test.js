'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { validate } = require('../electron/cli-catalog')

const main = require('node:fs').readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8')
const handlerSource = main.slice(main.indexOf("ipcMain.handle('album:export'"), main.indexOf('// One-shot cleanup', main.indexOf("ipcMain.handle('album:export'")))

test('CLI accepts an optional absolute selection list, including an empty list for the handler to reject', () => {
  assert.deepEqual(validate('album:export', { format: 'mp3', dirs: [] }).args, [{ format: 'mp3', dirs: [] }])
  assert.throws(() => validate('album:export', { format: 'mp3', dirs: ['relative/song'] }), { code: 'INVALID_ARGUMENT' })
})

async function fixture (t, { songs = [], dialogResult, ffmpeg = null, destination: chosenDestination } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-album-export-'))
  const destination = chosenDestination || path.join(root, 'exports')
  if (!chosenDestination) await fs.mkdir(destination)
  let handler
  const calls = { dialog: 0, convert: [] }
  const context = {
    ipcMain: { handle: (_channel, fn) => { handler = fn } },
    projectName: () => '프로젝트',
    listSongs: async () => songs,
    dialog: { showOpenDialog: async () => {
      calls.dialog++
      return dialogResult || { canceled: false, filePaths: [destination] }
    } },
    win: {}, exportBase: async () => destination, canWrite: async () => true,
    path, fsp: fs,
    exists: async file => fs.access(file).then(() => true, () => false),
    findFfmpeg: async () => ffmpeg,
    audioFiles: async dir => {
      const files = await fs.readdir(dir)
      return {
        wav: files.includes('audio.wav') ? path.join(dir, 'audio.wav') : null,
        mp3: files.includes('audio.mp3') ? path.join(dir, 'audio.mp3') : null
      }
    },
    audioName: title => title,
    convert: async (_ffmpeg, from, to, args) => {
      calls.convert.push({ from, to, args })
      await fs.copyFile(from, to)
    },
    send () {}, log () {}, rememberExportDir: async () => {}
  }
  vm.runInNewContext(handlerSource, context)
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return { root, destination, handler, calls }
}

async function song (root, folder, title, createdAt, extension = 'mp3') {
  const dir = path.join(root, folder)
  await fs.mkdir(dir)
  await fs.writeFile(path.join(dir, `audio.${extension}`), `${title}-${extension}`)
  return { dir, folder, title, createdAt, audio: path.join(dir, `audio.${extension}`), unfinished: false, position: null }
}

test('copies only selected completed songs once in the album running order', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-album-songs-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const a = await song(root, 'a', 'A', '2026-01-01')
  const b = await song(root, 'b', 'B', '2026-01-02')
  const c = await song(root, 'c', 'C', '2026-01-03')
  const { destination, handler } = await fixture(t, { songs: [c, b, a] })
  const result = await handler({}, { format: 'mp3', dirs: [c.dir, c.dir, a.dir] })
  assert.equal(result.ok, true)
  assert.equal(result.count, 2)
  assert.deepEqual(await fs.readdir(result.path), ['01. A.mp3', '02. C.mp3'])
  assert.equal(await fs.readFile(path.join(result.path, '01. A.mp3'), 'utf8'), 'A-mp3')
  assert.equal(await fs.readFile(path.join(result.path, '02. C.mp3'), 'utf8'), 'C-mp3')
  assert.equal(result.path.startsWith(destination), true)
})

test('keeps the existing all-finished-song export when dirs is omitted', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-album-all-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const a = await song(root, 'a', 'A', '2026-01-01')
  const b = await song(root, 'b', 'B', '2026-01-02')
  const { handler } = await fixture(t, { songs: [b, a] })
  const result = await handler({}, { format: 'mp3' })
  assert.equal(result.ok, true)
  assert.deepEqual(await fs.readdir(result.path), ['01. A.mp3', '02. B.mp3'])
})

test('rejects an empty or foreign selected list before opening a folder or writing files', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-album-invalid-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const a = await song(root, 'a', 'A', '2026-01-01')
  const { destination, handler, calls } = await fixture(t, { songs: [a] })
  for (const dirs of [[], [path.join(root, 'outside')], 'not-an-array']) {
    const result = await handler({}, { format: 'mp3', dirs })
    assert.equal(result.ok, false)
    assert.match(result.message, /완성곡/)
  }
  assert.equal(calls.dialog, 0)
  assert.deepEqual(await fs.readdir(destination), [])
})

test('returns cancel and format errors without creating an album', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-album-cancel-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const a = await song(root, 'a', 'A', '2026-01-01')
  const { destination, handler } = await fixture(t, { songs: [a], dialogResult: { canceled: true, filePaths: [] } })
  const invalid = await handler({}, { format: 'flac' })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.message, '알 수 없는 형식입니다.')
  const canceled = await handler({}, { format: 'mp3', dirs: [a.dir] })
  assert.equal(canceled.ok, false)
  assert.equal(canceled.canceled, true)
  assert.deepEqual(await fs.readdir(destination), [])
})

test('keeps conversion metadata arguments and reports WAV rebuilt from MP3 as lossy', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-album-convert-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const wav = await song(root, 'wav', 'WAV', '2026-01-01', 'wav')
  const mp3 = await song(root, 'mp3', 'MP3', '2026-01-02', 'mp3')
  const { handler, calls } = await fixture(t, { songs: [wav, mp3], ffmpeg: '/ffmpeg' })
  const mp3Result = await handler({}, { format: 'mp3', dirs: [wav.dir] })
  assert.equal(mp3Result.lossy, 0)
  assert.deepEqual([...calls.convert[0].args], ['-b:a', '320k', '-metadata', 'title=WAV', '-metadata', 'album=프로젝트', '-metadata', 'track=1/1', '-id3v2_version', '3'])
  const wavResult = await handler({}, { format: 'wav', dirs: [mp3.dir] })
  assert.equal(wavResult.lossy, 1)
  assert.deepEqual([...calls.convert[1].args], ['-c:a', 'pcm_s24le', '-metadata', 'title=MP3', '-metadata', 'album=프로젝트', '-metadata', 'track=1/1'])
})

test('concurrent exports claim separate album directories before writing tracks', async t => {
  const shared = await fs.mkdtemp(path.join(os.tmpdir(), 'road-album-concurrent-'))
  const destination = path.join(shared, 'exports')
  await fs.mkdir(destination)
  t.after(() => fs.rm(shared, { recursive: true, force: true }))
  const firstSongs = []
  const secondSongs = []
  const first = await fixture(t, { songs: firstSongs, destination })
  const second = await fixture(t, { songs: secondSongs, destination })
  firstSongs.push(await song(first.root, 'first', '첫 곡', '2026-01-01'))
  secondSongs.push(await song(second.root, 'second', '둘째 곡', '2026-01-01'))

  const [firstResult, secondResult] = await Promise.all([
    first.handler({}, { format: 'mp3' }),
    second.handler({}, { format: 'mp3' })
  ])

  assert.equal(firstResult.ok, true)
  assert.equal(secondResult.ok, true)
  assert.notEqual(firstResult.path, secondResult.path)
  assert.deepEqual(await fs.readdir(firstResult.path), ['01. 첫 곡.mp3'])
  assert.deepEqual(await fs.readdir(secondResult.path), ['01. 둘째 곡.mp3'])
})
