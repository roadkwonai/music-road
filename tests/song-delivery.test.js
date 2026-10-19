'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const delivery = require('../electron/song-delivery')

async function fixture (t) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'roadmusic-delivery-'))
  t.after(() => fsp.rm(dir, { recursive: true, force: true }))
  return dir
}

async function trustedWorkspace (root, phase = 'completed') {
  await Promise.all([
    fsp.mkdir(path.join(root, 'Output'), { recursive: true }),
    fsp.mkdir(path.join(root, 'cli'), { recursive: true }),
    fsp.mkdir(path.join(root, '.roadmusic'), { recursive: true })
  ])
  await Promise.all([
    fsp.writeFile(path.join(root, 'cli', 'road-music.js'), '// workspace marker'),
    fsp.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'road-music' })),
    fsp.writeFile(path.join(root, '.roadmusic', 'structure.json'), JSON.stringify({ schemaVersion: 1, policy: 'final-only', owner: 'road-music', workspace: root, phase, planId: 'a'.repeat(48) }))
  ])
}

test('metadata replacement verifies the new final audio and restores the old metadata on failure', async t => {
  const dir = await fixture(t)
  const file = path.join(dir, 'meta.json')
  const previous = { status: 'done', audio: '/old.wav', seconds: 12 }
  await fsp.writeFile(file, JSON.stringify(previous))
  await assert.rejects(delivery.replaceMetadata({ dir, meta: { status: 'done', audio: '/new.mp3', seconds: 12 }, verify: () => false }))
  assert.deepEqual(JSON.parse(await fsp.readFile(file, 'utf8')), previous)
  const next = { status: 'done', audio: '/new.mp3', seconds: 12 }
  assert.deepEqual(await delivery.replaceMetadata({ dir, meta: next, verify: stored => stored.audio === next.audio }), next)
})

test('metadata replacement never follows a metadata symlink', async t => {
  const dir = await fixture(t)
  const outside = path.join(dir, 'outside.json')
  await fsp.writeFile(outside, '{"outside":true}')
  await fsp.symlink(outside, path.join(dir, 'meta.json'))
  await assert.rejects(delivery.replaceMetadata({ dir, meta: { status: 'done' }, verify: () => true }), /실제 곡 정보/)
  assert.equal(await fsp.readFile(outside, 'utf8'), '{"outside":true}')
})

test('removes only the generated WAV after the MP3, duration, and stored metadata all agree', async t => {
  const dir = await fixture(t)
  const wav = path.join(dir, 'song.wav')
  const mp3 = path.join(dir, 'song.mp3')
  await Promise.all([fsp.writeFile(wav, 'wav'), fsp.writeFile(mp3, 'mp3')])
  const meta = { status: 'done', audio: mp3, seconds: 12 }
  await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta))
  assert.equal(await delivery.validateCompressedReplacement({ wav, mp3, seconds: 12, verifyAudio: async () => 12.04 }), true)
  assert.equal(await delivery.removeCompressedSource({ dir, wav, mp3, meta }), true)
  assert.equal(fs.existsSync(wav), false)
  assert.equal(fs.existsSync(mp3), true)
})

test('keeps the WAV when the MP3 duration or stored metadata cannot prove the replacement', async t => {
  const dir = await fixture(t)
  const wav = path.join(dir, 'song.wav')
  const mp3 = path.join(dir, 'song.mp3')
  await Promise.all([fsp.writeFile(wav, 'wav'), fsp.writeFile(mp3, 'mp3')])
  const meta = { status: 'done', audio: mp3, seconds: 12 }
  await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ ...meta, audio: wav }))
  assert.equal(await delivery.validateCompressedReplacement({ wav, mp3, seconds: 12, verifyAudio: async () => 12.4 }), false)
  assert.equal(await delivery.removeCompressedSource({ dir, wav, mp3, meta }), false)
  assert.equal(fs.existsSync(wav), true)
})

test('ACE scratch is removed only for a verified ACE completion', async t => {
  const dir = await fixture(t)
  const scratch = path.join(dir, '_ace')
  await fsp.mkdir(scratch)
  await fsp.writeFile(path.join(scratch, 'temp.wav'), 'scratch')
  assert.equal(await delivery.removeAceScratch(dir, { engineId: 'yue' }), false)
  assert.equal(fs.existsSync(scratch), true)
  assert.equal(await delivery.removeAceScratch(dir, { engineId: 'ace' }), true)
  assert.equal(fs.existsSync(scratch), false)
})

test('records a completed song only in a configured trusted delivery workspace', async t => {
  const dir = await fixture(t)
  const root = path.join(dir, 'workspace')
  const song = path.join(dir, 'song')
  const audio = path.join(song, 'final.mp3')
  await Promise.all([trustedWorkspace(root), fsp.mkdir(song, { recursive: true })])
  await fsp.writeFile(audio, 'mp3')
  const meta = { status: 'done', audio, title: '완성곡', jobId: 'job-1', seconds: 12 }
  let received
  const result = await delivery.recordFinalDelivery({
    deliveryRoot: root,
    dir: song,
    meta,
    reason: '최종 보관',
    execute: async request => {
      received = request
      return { id: 'v1', stamp: '20261019-030405', groupId: 'a'.repeat(64), projectId: 'song', files: [{ path: '/large' }], changes: [{ field: 'lyrics' }] }
    }
  })
  assert.deepEqual(result.deliveryVersion, { id: 'v1', stamp: '20261019-030405', groupId: 'a'.repeat(64), projectId: 'song' })
  assert.deepEqual(received, { root, dir: song, reason: '최종 보관' })
})

test('never sends an incomplete or untrusted song to the delivery bridge', async t => {
  const dir = await fixture(t)
  const song = path.join(dir, 'song')
  const audio = path.join(song, 'final.mp3')
  await fsp.mkdir(song)
  await fsp.writeFile(audio, 'mp3')
  let called = false
  assert.deepEqual(await delivery.recordFinalDelivery({ dir: song, meta: { status: 'done', audio }, execute: async () => { called = true } }), { skipped: true, reason: 'delivery-root-not-configured' })
  await assert.rejects(delivery.recordFinalDelivery({
    deliveryRoot: dir,
    dir: song,
    meta: { status: 'done', audio },
    execute: async () => { called = true }
  }), /trusted delivery workspace/)
  const marked = path.join(dir, 'marked')
  await trustedWorkspace(marked)
  await fsp.writeFile(path.join(marked, '.roadmusic', 'structure.json'), JSON.stringify({ schemaVersion: 1, policy: 'final-only', owner: 'road-music', workspace: dir, planId: 'a'.repeat(48) }))
  await assert.rejects(delivery.recordFinalDelivery({
    deliveryRoot: marked,
    dir: song,
    meta: { status: 'done', audio },
    execute: async () => { called = true }
  }), /trusted delivery workspace/)
  await assert.rejects(delivery.recordFinalDelivery({
    deliveryRoot: dir,
    dir: song,
    meta: { status: 'queued', audio },
    execute: async () => { called = true }
  }), /완료된 실제 음원/)
  assert.equal(called, false)
})

test('skips the delivery bridge until the final-only migration is completed', async t => {
  const dir = await fixture(t)
  const root = path.join(dir, 'workspace')
  const song = path.join(dir, 'song')
  const audio = path.join(song, 'final.mp3')
  await Promise.all([trustedWorkspace(root, 'prepared'), fsp.mkdir(song, { recursive: true })])
  await fsp.writeFile(audio, 'mp3')
  let called = false
  assert.deepEqual(await delivery.recordFinalDelivery({
    deliveryRoot: root,
    dir: song,
    meta: { status: 'done', audio },
    execute: async () => { called = true }
  }), { skipped: true, reason: 'delivery-root-not-completed' })
  assert.equal(called, false)
})

test('rejects a malformed delivery response before source metadata changes', async t => {
  const dir = await fixture(t)
  const root = path.join(dir, 'workspace')
  const song = path.join(dir, 'song')
  const audio = path.join(song, 'final.mp3')
  await Promise.all([trustedWorkspace(root), fsp.mkdir(song, { recursive: true })])
  await fsp.writeFile(audio, 'mp3')
  await assert.rejects(delivery.recordFinalDelivery({
    deliveryRoot: root,
    dir: song,
    meta: { status: 'done', audio },
    execute: async () => ({ deliveryVersion: { id: 'v1' } })
  }), /delivery response/)
})
