'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')

const source = (name) => fs.readFileSync(path.join(__dirname, '..', 'renderer', name), 'utf8')
const classes = () => ({ add () {}, remove () {}, toggle () {}, contains: () => true })

function cliContext (extra = {}) {
  const context = { window: {}, Promise, Number, String, Boolean, Object, Array, Set, URL, encodeURIComponent,
    document: { querySelector: () => ({ classList: classes(), click () {} }) }, ...extra }
  context.window.RoadLyricsCheck = require('../renderer/lyricscheck.js')
  context.window.RoadSections = require('../renderer/sections.js')
  context.cleanLyrics = require('../renderer/prompt.js').cleanLyrics
  const prompt = require('../renderer/prompt.js')
  context.composeStyle = prompt.composeStyle
  context.INSTRUMENTS = prompt.INSTRUMENTS
  context.STRUCTURES = prompt.STRUCTURES
  vm.runInNewContext(source('cli-api.js'), context)
  return context
}

test('renderer rejects network file URLs and UNC media before loading them', async () => {
  const context = cliContext({ studio: { frame: null } })
  for (const media of [{ url: 'file://attacker/share/logo.png' }, { url: 'file:////attacker/share/logo.png' },
    { url: 'file:///%2Fattacker/share/logo.png' }, { path: '//attacker/share/logo.png' }, { path: '\\\\attacker\\share\\logo.png' }]) {
    await assert.rejects(context.window.RoadCLI.call('video:configure', { video: { background: { kind: 'image', ...media } } }), /로컬 파일/)
  }
})

test('catalog and lyric helpers use the real renderer modules', async () => {
  const context = cliContext()
  const catalog = await context.window.RoadCLI.call('renderer:catalog')
  assert.ok(catalog.actions.includes('video:render'))
  assert.equal((await context.window.RoadCLI.call('unknown')).code, 'unknown_command')
  assert.deepEqual(await context.window.RoadCLI.call('lyrics:clean', { text: '가사' }), { text: '가사', notes: [] })
  const sections = await context.window.RoadCLI.call('lyrics:sections', { text: '[Verse]\n가사' })
  assert.equal(sections.text, '[Verse]\n가사')
  assert.equal(sections.changed, false)
})

test('video preview keeps the requested track order and applies its video settings', async () => {
  const listed = [
    { dir: '/songs/a', folder: 'a', title: 'A', audio: '/songs/a/a.wav' },
    { dir: '/songs/b', folder: 'b', title: 'B', audio: '/songs/b/b.wav' }
  ]
  let prepared = null
  const context = cliContext({
    EQ_PRESETS: [['flat', 'Flat', [0, 0, 0, 0, 0, 0, 0]]],
    studio: { video: { background: { kind: 'none' }, length: { mode: 'once', count: 1, minutes: 1 }, spectrum: {}, eq: {}, tracklist: {}, overlays: [] }, frame: null, cycle: null, clock: {} },
    songs: [],
    currentProject: null,
    localStorage: { setItem () {} },
    pickKey: () => `videoPicks:${context.currentProject || ''}`,
    writeControls () {},
    duration: () => 12,
    prepareStudio: async () => {
      prepared = context.studio.cliTracks.map(song => song.dir)
      context.studio.cycle = { id: 'cycle', chapters: [{ title: 'B', start: 0 }, { title: 'A', start: 6 }] }
      return true
    },
    window: {
      RoadStudioReady: Promise.resolve(),
      yue: { projects: async () => ({ current: '프로젝트' }), listSongs: async () => listed }
    }
  })
  const result = await context.window.RoadCLI.call('video:preview', {
    tracks: ['/songs/b', '/songs/a'],
    video: { fps: 60, resolution: '720p', renderer: 'cpu', length: { mode: 'repeat', count: 2 }, spectrum: { barCount: 128 } }
  })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(prepared, ['/songs/b', '/songs/a'])
  assert.equal(context.studio.video.fps, 60)
  assert.equal(context.studio.video.resolution, '720p')
  assert.deepEqual(result.chapters, [{ title: 'B', start: 0 }, { title: 'A', start: 6 }])
})

test('video commands reject a concurrent render before changing state', async () => {
  let listed = false
  const studio = { frame: {}, video: {}, cycle: null, clock: {} }
  const context = cliContext({ studio, window: { RoadStudioReady: Promise.resolve(), yue: { listSongs: async () => { listed = true; return [] } } } })
  const result = await context.window.RoadCLI.call('video:preview', { tracks: ['/songs/a'] })
  assert.equal(result.code, 'busy')
  assert.equal(listed, false)
})

test('video configure merges and saves settings without reading songs', async () => {
  let saved = null
  let listed = false
  const context = cliContext({
    studio: { video: { background: { kind: 'none' }, length: { mode: 'once', count: 1, minutes: 1 }, spectrum: {}, eq: {}, tracklist: {}, overlays: [] }, frame: null, cycle: null, clock: {} },
    writeControls () {},
    window: { RoadStudioReady: Promise.resolve(), yue: {
      listSongs: async () => { listed = true; return [] },
      saveVideoSettings: async (video) => { saved = video; return { ok: true } }
    } }
  })
  const result = await context.window.RoadCLI.call('video:configure', { video: { resolution: '720p' }, save: true })
  assert.equal(result.ok, true)
  assert.equal(result.video.resolution, '720p')
  assert.equal(saved.resolution, '720p')
  assert.equal(listed, false)
})

test('video cancellation during prepare stops before rendering', async () => {
  const listed = [{ dir: '/songs/a', folder: 'a', title: 'A', audio: '/songs/a/a.wav' }]
  let resolvePrepare
  let rendered = false
  const context = cliContext({
    studio: { video: { background: { kind: 'none' }, length: { mode: 'once', count: 1, minutes: 1 }, spectrum: {}, eq: {}, tracklist: {}, overlays: [] }, frame: null, cycle: null, clock: {} },
    songs: [], currentProject: null, localStorage: { setItem () {} },
    pickKey: () => 'videoPicks:project', writeControls () {}, duration: () => 0,
    prepareStudio: () => new Promise(resolve => { resolvePrepare = () => { context.studio.cycle = { chapters: [] }; resolve(true) } }),
    renderVideo: async () => { rendered = true; return { ok: true } },
    window: { RoadStudioReady: Promise.resolve(), yue: { projects: async () => ({ current: 'project' }), listSongs: async () => listed } }
  })
  const pending = context.window.RoadCLI.call('video:render', { tracks: ['/songs/a'] })
  await new Promise(resolve => setImmediate(resolve))
  const cancellation = await context.window.RoadCLI.call('video:cancel')
  assert.deepEqual({ ...cancellation }, { ok: true, cancellationRequested: true, stage: 'prepare', pending: true, message: '준비가 끝나면 중단됩니다.' })
  resolvePrepare()
  const result = await pending
  assert.equal(result.code, 'cancelled')
  assert.equal(rendered, false)
})

test('SRT save failure is returned as a command failure', async () => {
  const song = { dir: '/songs/a', folder: 'a', id: 'a', title: 'A' }
  const context = cliContext({
    songs: [], songCues: async () => ({ cues: [], method: 'estimated' }), toSrt: () => '1\n00:00:00,000 --> 00:00:01,000\nA\n',
    window: { yue: { listSongs: async () => [song], saveSrt: async () => ({ ok: false, message: 'disk full', code: 'WRITE_FAILED' }) } }
  })
  const result = await context.window.RoadCLI.call('song:srt', { dir: '/songs/a', save: true })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'WRITE_FAILED')
})

test('player next waits for playback and returns a rejected play promise', async () => {
  let loaded = null
  const audio = { readyState: 1, paused: true, currentTime: 0, duration: 0, play: async () => { throw new Error('blocked by browser') } }
  const context = cliContext({
    miniPlayer: { audio, list: [{ dir: '/songs/a' }, { dir: '/songs/b' }], index: 0, dir: '/songs/a' },
    loadMini: (index) => { loaded = index },
    window: {}
  })
  const result = await context.window.RoadCLI.call('player:next')
  assert.equal(loaded, 1)
  assert.equal(result.ok, false)
  assert.match(result.error, /blocked by browser/)
})

test('recorder shares concurrent stop work and reports microphone permission errors', async () => {
  const elements = new Map()
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { classList: classes(), pause () {}, removeAttribute () {}, getContext: () => ({ clearRect () {}, fillRect () {} }), clientWidth: 1, clientHeight: 1 })
    return elements.get(id)
  }
  class FakeRecorder {
    constructor () { this.state = 'recording' }
    start () { this.ondataavailable({ data: new Blob(['x'.repeat(2001)]) }) }
    stop () { setTimeout(() => this.onstop(), 0) }
  }
  const stream = { getTracks: () => [{ stop () {} }] }
  const context = {
    window: { yue: { saveRecording: async () => ({ ok: true, path: '/takes/take.wav', url: 'file:///takes/take.wav', seconds: 2 }) }, devicePixelRatio: 1 },
    navigator: { mediaDevices: { getUserMedia: async () => stream } }, MediaRecorder: FakeRecorder, Blob,
    setTimeout, clearTimeout, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, performance: { now: () => 0 },
    $: element, toast: () => {}, clock: () => '0:00', MAC: false, enginesInstalled: { ace: true }, openEngines: () => {}, coverFrom: null,
    document: { querySelectorAll: () => [] }, currentEngine: () => 'ace', applyEngineUi: () => {}, showCover: () => {}, console
  }
  vm.runInNewContext(source('recorder.js'), context)
  assert.equal((await context.startRecording()).ok, true)
  const first = context.stopRecording()
  const second = context.stopRecording()
  assert.equal(first, second)
  const take = await first
  assert.equal(take.path, '/takes/take.wav')
  context.navigator.mediaDevices.getUserMedia = async () => { const error = new Error('denied'); error.name = 'NotAllowedError'; throw error }
  const denied = await context.startRecording()
  assert.equal(denied.code, 'permission')
})
