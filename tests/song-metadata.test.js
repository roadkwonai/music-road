'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { writeSongLyrics, recoverMetadata } = require('../electron/song-metadata')

async function fixture (t, meta = { title: '나를 믿어', lyrics: '', request: { lyrics: '원문' } }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-song-metadata-'))
  const dir = path.join(root, 'song')
  await fs.mkdir(dir)
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8')
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return { dir, meta, read: async () => JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8')) }
}

function failingFs (method, failureAt = 1) {
  let calls = 0
  return new Proxy(fs, { get (target, key) {
    if (key !== method) return target[key]
    return async (...args) => {
      calls += 1
      if (calls === failureAt) throw Object.assign(new Error(`${method} failed`), { code: 'EIO' })
      return target[key](...args)
    }
  } })
}

test('preserves Korean lyrics exactly, other metadata, empty lyrics, and idempotent saves', async t => {
  const { dir, meta, read } = await fixture(t)
  const lyrics = '[Chorus]\r\n나는 나를 믿어  \n\n남들 눈치 보며\n'
  const first = await writeSongLyrics({ dir, lyrics })
  assert.equal(first.updated, true)
  assert.deepEqual(await read(), { ...meta, lyrics })
  const second = await writeSongLyrics({ dir, lyrics })
  assert.equal(second.updated, false)
  await writeSongLyrics({ dir, lyrics: '' })
  assert.deepEqual(await read(), meta)
})

test('rejects metadata symlinks and never follows them', async t => {
  if (process.platform === 'win32') t.skip('Windows symlink creation needs privileges')
  const { dir } = await fixture(t)
  const outside = path.join(path.dirname(dir), 'outside.json')
  await fs.writeFile(outside, JSON.stringify({ lyrics: 'outside' }))
  await fs.unlink(path.join(dir, 'meta.json'))
  await fs.symlink(outside, path.join(dir, 'meta.json'))
  await assert.rejects(writeSongLyrics({ dir, lyrics: '가사' }), { code: 'UNSAFE_METADATA' })
  assert.deepEqual(JSON.parse(await fs.readFile(outside, 'utf8')), { lyrics: 'outside' })
})

test('POSIX replacement failure keeps the prior metadata and removes its stage file', async t => {
  const { dir, meta, read } = await fixture(t)
  await assert.rejects(writeSongLyrics({ dir, lyrics: '새 가사', fs: failingFs('rename') }), { code: 'METADATA_SAVE_FAILED' })
  assert.deepEqual(await read(), meta)
  assert.deepEqual((await fs.readdir(dir)).sort(), ['meta.json'])
})

test('stage write failure leaves the original metadata untouched', async t => {
  const { dir, meta, read } = await fixture(t)
  const mocked = new Proxy(fs, { get (target, key) {
    if (key !== 'open') return target[key]
    return async (...args) => {
      const handle = await target.open(...args)
      return { close: () => handle.close(), writeFile: async () => { throw Object.assign(new Error('write failed'), { code: 'EIO' }) } }
    }
  } })
  await assert.rejects(writeSongLyrics({ dir, lyrics: '새 가사', fs: mocked }), { code: 'METADATA_SAVE_FAILED' })
  assert.deepEqual(await read(), meta)
  assert.deepEqual((await fs.readdir(dir)).sort(), ['meta.json'])
})

test('a partial stage write is removed after its handle fails', async t => {
  const { dir, meta, read } = await fixture(t)
  const mocked = new Proxy(fs, { get (target, key) {
    if (key !== 'open') return target[key]
    return async (...args) => {
      const handle = await target.open(...args)
      return {
        close: () => handle.close(),
        writeFile: async () => {
          await handle.writeFile('partial metadata', 'utf8')
          throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
        }
      }
    }
  } })
  await assert.rejects(writeSongLyrics({ dir, lyrics: '새 가사', fs: mocked }), { code: 'METADATA_SAVE_FAILED' })
  assert.deepEqual(await read(), meta)
  assert.deepEqual((await fs.readdir(dir)).sort(), ['meta.json'])
})

test('an existing stage name is never removed when exclusive creation reports EEXIST', async t => {
  const { dir, meta, read } = await fixture(t)
  let stage
  const mocked = new Proxy(fs, { get (target, key) {
    if (key !== 'open') return target[key]
    return async (file) => {
      stage = file
      await target.writeFile(file, 'do not delete', { flag: 'wx' })
      throw Object.assign(new Error('already exists'), { code: 'EEXIST' })
    }
  } })
  await assert.rejects(writeSongLyrics({ dir, lyrics: '새 가사', fs: mocked }), { code: 'METADATA_SAVE_FAILED' })
  assert.deepEqual(await read(), meta)
  assert.equal(await fs.readFile(stage, 'utf8'), 'do not delete')
})

test('Windows phase-one failure leaves the prior metadata intact', async t => {
  const { dir, meta, read } = await fixture(t)
  await assert.rejects(writeSongLyrics({ dir, lyrics: '새 가사', platform: 'win32', fs: failingFs('rename') }), { code: 'METADATA_SAVE_FAILED' })
  assert.deepEqual(await read(), meta)
  assert.equal(await fs.stat(path.join(dir, '.meta-before-lyrics.json')).catch(() => null), null)
})

test('Windows phase-two failure restores the original metadata', async t => {
  const { dir, meta, read } = await fixture(t)
  await assert.rejects(writeSongLyrics({ dir, lyrics: '새 가사', platform: 'win32', fs: failingFs('rename', 2) }), { code: 'METADATA_SAVE_FAILED' })
  assert.deepEqual(await read(), meta)
  assert.equal(await fs.stat(path.join(dir, '.meta-before-lyrics.json')).catch(() => null), null)
})

test('Windows rollback failure preserves the backup path for manual recovery', async t => {
  const { dir, meta } = await fixture(t)
  const originalRename = fs.rename
  let calls = 0
  const mocked = new Proxy(fs, { get (target, key) {
    if (key !== 'rename') return target[key]
    return async (...args) => {
      calls += 1
      if (calls === 2 || calls === 3) throw Object.assign(new Error('rename failed'), { code: 'EIO' })
      return originalRename(...args)
    }
  } })
  await assert.rejects(
    writeSongLyrics({ dir, lyrics: '다른 가사', platform: 'win32', fs: mocked }),
    error => error.code === 'METADATA_SAVE_FAILED' && error.backupPath === path.join(dir, '.meta-before-lyrics.json')
  )
  await fs.access(path.join(dir, '.meta-before-lyrics.json'))
  await assert.rejects(fs.access(path.join(dir, 'meta.json')))
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, '.meta-before-lyrics.json'), 'utf8')), meta)
})

test('recovers only a valid regular backup when meta.json is absent', async t => {
  const { dir, meta } = await fixture(t)
  const backup = path.join(dir, '.meta-before-lyrics.json')
  await fs.rename(path.join(dir, 'meta.json'), backup)
  const result = await recoverMetadata({ dir, platform: 'win32' })
  assert.equal(result.recovered, true)
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8')), meta)
  await assert.rejects(fs.access(backup))
})

test('recovery rejects corrupt or symlink backups and keeps an existing metadata file authoritative', async t => {
  const { dir, meta } = await fixture(t)
  const backup = path.join(dir, '.meta-before-lyrics.json')
  await fs.writeFile(backup, '{broken')
  await fs.unlink(path.join(dir, 'meta.json'))
  await assert.rejects(recoverMetadata({ dir, platform: 'win32' }), { code: 'UNSAFE_METADATA' })
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta))
  assert.deepEqual(await recoverMetadata({ dir, platform: 'win32' }), { recovered: false, metaPath: path.join(dir, 'meta.json') })
  if (process.platform !== 'win32') {
    await fs.unlink(backup)
    const outside = path.join(path.dirname(dir), 'outside.json')
    await fs.writeFile(outside, JSON.stringify(meta))
    await fs.unlink(path.join(dir, 'meta.json'))
    await fs.symlink(outside, backup)
    await assert.rejects(recoverMetadata({ dir, platform: 'win32' }), { code: 'UNSAFE_METADATA' })
  }
})
