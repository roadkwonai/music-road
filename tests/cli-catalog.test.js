'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { commands, schema, validate } = require('../electron/cli-catalog')

test('accepts the free geometry values saved by the editor', () => {
  assert.doesNotThrow(() => validate('video:configure', { video: {
    spectrum: { position: 'free', cx: -0.1, cy: 1.2, size: 0.8, width: 1.2 },
    tracklist: { cx: -0.1, cy: 1.2, w: 0.8, h: 0.6 },
    overlays: [{ path: '/tmp/logo.png', x: -0.1, y: 1.2, w: 1.5, ar: 15 }]
  } }))
})

test('media settings reject remote URLs before loading an image or video', () => {
  for (const video of [{ background: { kind: 'image', url: 'http://localhost/private' } },
    { overlays: [{ path: '/tmp/logo.png', url: 'https://example.com/image.png' }] }]) {
    assert.throws(() => validate('video:configure', { video }), error => error.code === 'INVALID_ARGUMENT')
  }
})

test('media settings reject network file URLs, UNC paths, and out-of-range opacity', () => {
  const invalid = ['file://attacker/share/logo.png', 'file:////attacker/share/logo.png', 'file:///%2Fattacker/share/logo.png']
  for (const url of invalid) assert.throws(() => validate('video:configure', { video: { background: { kind: 'image', url } } }), { code: 'INVALID_ARGUMENT' })
  for (const mediaPath of ['//attacker/share/logo.png', '\\\\attacker\\share\\logo.png']) {
    assert.throws(() => validate('video:configure', { video: { overlays: [{ path: mediaPath }] } }), { code: 'INVALID_ARGUMENT' })
  }
  for (const opacity of [-0.5, 1.5]) assert.throws(() => validate('video:configure', { video: { overlays: [{ path: '/tmp/logo.png', opacity }] } }), { code: 'INVALID_ARGUMENT' })
  for (const url of ['file:///tmp/logo.png', 'file://localhost/tmp/logo.png']) assert.doesNotThrow(() => validate('video:configure', { video: { background: { kind: 'image', url } } }))
})

test('local file URLs become native media paths without changing the input', () => {
  const { pathToFileURL } = require('node:url')
  const native = require('node:path').resolve('/tmp/한글 로고.png')
  const params = { video: { background: { kind: 'image', url: pathToFileURL(native).href }, overlays: [{ url: pathToFileURL(native).href }] } }
  const result = validate('video:render', params)
  assert.equal(result.paramsValue.video.background.path, native)
  assert.equal(result.paramsValue.video.overlays[0].path, native)
  assert.equal(params.video.background.path, undefined)
  assert.equal(params.video.overlays[0].path, undefined)
})

test('catalog exposes every invoke channel from preload', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'electron', 'preload.js'), 'utf8')
  const channels = [...source.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m => m[1])
  const missing = channels.filter(channel => !Object.values(commands).some(entry => entry.channel === channel))
  assert.deepEqual(missing, [])
  assert.ok(schema().commands.length >= channels.length)
})

test('maps object and positional IPC arguments', () => {
  assert.deepEqual(validate('projects:rename', { from: 'a', to: 'b' }).args, [{ from: 'a', to: 'b' }])
  assert.deepEqual(validate('queue:move', { jobId: '42', delta: -1 }).args, [{ jobId: '42', delta: -1 }])
  assert.deepEqual(validate('song:rename', { dir: '/tmp/song', title: 'new' }).args, [{ dir: '/tmp/song', title: 'new' }])
})

test('normalizes generation defaults without accepting arbitrary keys', () => {
  const result = validate('song:generate', { lyrics: '첫 줄\n둘째 줄' })
  assert.equal(result.args[0].engine, 'ace')
  assert.equal(result.args[0].title, '첫 줄')
  assert.throws(() => validate('song:generate', { nope: true }), e => e.code === 'INVALID_ARGUMENT')
})

test('rejects invalid enum, finite number, range, and prototype parameters', () => {
  assert.throws(() => validate('engines:install', { id: 'cuda' }), e => e.code === 'INVALID_ARGUMENT')
  assert.throws(() => validate('queue:move', { jobId: 'x', delta: Infinity }), e => e.code === 'INVALID_ARGUMENT')
  assert.throws(() => validate('song:generate', { targetSeconds: 0 }), e => e.code === 'INVALID_ARGUMENT')
  const polluted = Object.create(null)
  Object.defineProperty(polluted, '__proto__', { value: {}, enumerable: true })
  assert.throws(() => validate('songs:list', polluted), e => e.code === 'INVALID_ARGUMENT')
})

test('marks destructive and dialog operations for transport policy', () => {
  assert.equal(commands['song:delete'].destructive, true)
  assert.equal(commands['song:delete'].params.required.includes('dir'), true)
  assert.equal(commands['song:save-srt'].dialog, 'save')
  assert.equal(commands['setup:pick-location'].directory, true)
})

test('accepts renderer and real generation payload shapes', () => {
  assert.equal(validate('lyrics:clean', { text: '2024' }).args[0].text, '2024')
  assert.equal(validate('video:render', {
    tracks: ['/tmp/song'], video: { resolution: '720p', fps: 30, renderer: 'cpu',
      spectrum: { visible: true, barCount: 64 }, eq: { on: true, gains: [0, 0, 0, 0, 0, 0, 0] }, length: { mode: 'once' } }
  }).args[0].video.resolution, '720p')
  assert.equal(validate('song:generate', { engine: 'ace', instrumental: true,
    parts: { genre: 'jazz', instruments: ['piano'], bpm: 90, structure: '' },
    coverAudio: { dir: '/x', strength: 0.8 } }).args[0].engine, 'ace')
  assert.doesNotThrow(() => validate('presets:save', { preset: { name: 'x', style: 'jazz', parts: { bpm: 90 } } }))
  assert.doesNotThrow(() => validate('settings:set', { patch: { autoMp3: true, dropWav: false } }))
})

test('rejects invalid nested schemas and exposes normalized generation params', () => {
  const generated = validate('song:generate', { lyrics: '첫 줄', seed: null, count: 2 })
  assert.equal(generated.paramsValue.engine, 'ace')
  assert.equal(generated.paramsValue.count, 2)
  assert.throws(() => validate('song:generate', { engine: 'bogus' }), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => validate('song:generate', { parts: { bpm: 39 } }), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => validate('video:render', { video: { eq: { gains: [0, 0, 0, 0, 0, 0, 11] } } }), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => validate('video:prepare', { tracks: [{ path: '/tmp/a' }], fps: 24 }), { code: 'INVALID_ARGUMENT' })
})

test('keeps internal pixel transport out of the public schema', () => {
  assert.ok(!schema().commands.some(entry => entry.command === 'video:frame'))
  assert.ok(schema({ includeInternal: true }).commands.some(entry => entry.command === 'video:frame'))
  assert.notEqual(commands['song:generate'].description, commands['song:export'].description)
})
