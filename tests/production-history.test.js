'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const history = require('../electron/production-history')

test('song lifecycle records a stable project id and only reviewable metadata', async () => {
  const dir = path.resolve('/tmp/road-music-history/song-a')
  let received
  const result = await history.recordSongEvent({
    dataDir: path.resolve('/tmp/road-music-history/profile'), dir, action: 'song-renamed', reason: 'title-changed',
    before: { title: '이전 제목', lyrics: '이전 가사', privateToken: 'must-not-store' },
    after: { title: '새 제목', lyrics: '새 가사', audio: path.join(dir, '새 제목.mp3'), deliveryVersion: { groupId: 'a'.repeat(64), projectId: 'b'.repeat(64), ignored: true } },
    execute: async payload => { received = payload; return { event: { id: 'event-1' } } }
  })
  assert.deepEqual(result, { event: { id: 'event-1' } })
  assert.equal(received.project_id, history.projectId(dir))
  assert.equal(received.group_id, 'a'.repeat(64))
  assert.equal(received.path, dir)
  assert.deepEqual(received.before, { title: '이전 제목', lyrics: '이전 가사' })
  assert.deepEqual(received.after, { title: '새 제목', lyrics: '새 가사', audio: path.join(dir, '새 제목.mp3'), deliveryVersion: { groupId: 'a'.repeat(64), projectId: 'b'.repeat(64) } })
})

test('song lifecycle rejects unsafe paths and preserves tracker failures for callers', async () => {
  await assert.rejects(history.recordSongEvent({ dataDir: '/tmp/profile', dir: 'relative', action: 'song-generated', execute: async () => ({}) }), { code: 'INVALID_ARGUMENT' })
  const failure = new Error('SQLite write failed')
  await assert.rejects(history.recordSongEvent({
    dataDir: '/tmp/profile', dir: '/tmp/song', action: 'song-generated', execute: async () => { throw failure }
  }), failure)
})

test('song lifecycle binds a generated-audio group without inventing a delivery version', async () => {
  let received
  await history.recordSongEvent({
    dataDir: '/tmp/road-music-history/profile', dir: '/tmp/road-music-history/song-a', action: 'song-generated',
    after: { title: '생성 곡', audio: '/tmp/road-music-history/song-a/generated.mp3' }, groupId: 'b'.repeat(64),
    execute: async payload => { received = payload; return { event: { id: 'event-2' } } }
  })
  assert.equal(received.group_id, 'b'.repeat(64))
  assert.equal(received.after.deliveryVersion, undefined)
})

test('song deletion uses the same stable project identity as event recording', async () => {
  const dir = '/tmp/road-music-history/song-delete'
  let received
  await history.dropSongHistory({ dataDir: '/tmp/road-music-history/profile', dir, execute: async payload => { received = payload; return { removed: true } } })
  assert.deepEqual(received, { project_id: history.projectId(dir), path: dir })
})

test('a stalled history writer times out and a SQLite error preserves its cause', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-history-bounded-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const script = path.join(dir, 'writer.js')
  fs.writeFileSync(script, 'setInterval(() => {}, 1000)')
  await assert.rejects(history.recordSongEvent({ dataDir: path.join(dir, 'profile'), dir, action: 'song-renamed', python: process.execPath, script, timeout: 30 }), { code: 'timeout' })
  fs.writeFileSync(script, 'process.stderr.write(JSON.stringify({error:{code:"SQL_FULL",message:"No disk space"}}));process.exit(2)')
  await assert.rejects(history.recordSongEvent({ dataDir: path.join(dir, 'profile'), dir, action: 'song-renamed', python: process.execPath, script }), { code: 'SQL_FULL', message: 'No disk space' })
})

test('production ledger bridge preserves user prompt separately from engine fields', async () => {
  let received
  const result = await history.recordProduction('request', {
    project: '/tmp/road-music-history/song-prompt', domain: 'music', intent: 'generation',
    prompt: '사용자가 처음 요청한 원문', source: 'user', requestId: 'a'.repeat(48)
  }, {
    dataDir: '/tmp/road-music-history/profile', execute: async payload => { received = payload; return { event: { id: 'prompt-1' } } }
  })
  assert.deepEqual(result, { event: { id: 'prompt-1' } })
  assert.equal(received.action, 'request')
  assert.equal(received.params.prompt, '사용자가 처음 요청한 원문')
  assert.equal(received.params.source, 'user')
  assert.equal(received.params.requestId, 'a'.repeat(48))
})

test('long prompt and lyric JSON travel through stdin without appearing in argv', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'road-private-prompt-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const script = path.join(root, 'stdin-writer.js')
  fs.writeFileSync(script, "let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>raw+=x);process.stdin.on('end',()=>{const p=JSON.parse(raw);process.stdout.write(JSON.stringify({ok:true,result:{payload:p,args:process.argv.slice(2)}})+'\\n')})")
  const prompt = 'private-user-prompt-'.padEnd(65536, 'a')
  const result = await history.recordProduction('request', { project: root, domain: 'music', prompt }, { dataDir: path.join(root, 'profile'), script, python: process.execPath })
  assert.equal(result.payload.prompt, prompt)
  assert.ok(result.args.includes('--stdin'))
  assert.ok(result.args.every(arg => !arg.includes('private-user-prompt-')))
  const event = await history.recordSongEvent({ dataDir: path.join(root, 'profile'), dir: root, action: 'song-lyrics-updated', after: { lyrics: '한'.repeat(20000) }, script, python: process.execPath })
  assert.equal(event.payload.after.lyrics.length, 20000)
  assert.ok(event.args.includes('--stdin'))
})
