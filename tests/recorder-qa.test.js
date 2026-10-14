'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')

const recorderSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'recorder.js'), 'utf8')
const classes = () => ({ add () {}, remove () {}, toggle () {} })

function recorderContext ({ Recorder, saveRecording = async () => ({ ok: true, path: '/takes/take.wav', url: 'file:///takes/take.wav', seconds: 2 }), timers = globalThis } = {}) {
  const elements = new Map()
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { classList: classes(), pause () {}, removeAttribute () {}, getContext: () => ({ clearRect () {}, fillRect () {} }), clientWidth: 1, clientHeight: 1 })
    return elements.get(id)
  }
  const toasts = []
  const tracks = [{ stopped: 0, stop () { this.stopped++ } }]
  const stream = { getTracks: () => tracks }
  const context = {
    window: { yue: { saveRecording }, devicePixelRatio: 1 },
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    MediaRecorder: Recorder,
    Blob,
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    performance: { now: () => 0 },
    $: element,
    toast: (message) => toasts.push(message),
    clock: () => '0:00',
    MAC: false,
    enginesInstalled: { ace: true },
    openEngines: () => {},
    coverFrom: null,
    document: { querySelectorAll: () => [] },
    currentEngine: () => 'ace',
    applyEngineUi: () => {},
    showCover: () => {},
    console
  }
  vm.runInNewContext(recorderSource, context)
  return { context, stream, tracks, toasts }
}

test('recorder setup failures stop a stream acquired from getUserMedia', async () => {
  class ConstructionFailure {
    constructor () { throw new Error('codec unavailable') }
  }
  const construction = recorderContext({ Recorder: ConstructionFailure })
  const constructionResult = await construction.context.startRecording()
  assert.deepEqual({ ...constructionResult }, { ok: false, code: 'recorder_start_failed', error: '녹음을 시작하지 못했습니다: codec unavailable' })
  assert.equal(construction.tracks[0].stopped, 1)

  class StartFailure {
    start () { throw new Error('device lost') }
  }
  const start = recorderContext({ Recorder: StartFailure })
  const startResult = await start.context.startRecording()
  assert.deepEqual({ ...startResult }, { ok: false, code: 'recorder_start_failed', error: '녹음을 시작하지 못했습니다: device lost' })
  assert.equal(start.tracks[0].stopped, 1)
})

test('recorder returns save and too-short failures to every concurrent stopper', async () => {
  class Recorder {
    start () { this.ondataavailable({ data: new Blob(['x'.repeat(2001)]) }) }
    stop () { this.onstop() }
  }
  const failedSave = recorderContext({ Recorder, saveRecording: async () => ({ ok: false, code: 'WRITE_FAILED', message: 'disk full' }) })
  await failedSave.context.startRecording()
  const first = failedSave.context.stopRecording()
  const second = failedSave.context.stopRecording()
  assert.equal(first, second)
  assert.deepEqual({ ...(await first) }, { ok: false, code: 'WRITE_FAILED', error: 'disk full' })

  class ShortRecorder {
    start () { this.ondataavailable({ data: new Blob(['tiny']) }) }
    stop () { this.onstop() }
  }
  const short = recorderContext({ Recorder: ShortRecorder })
  await short.context.startRecording()
  assert.deepEqual({ ...(await short.context.stopRecording()) }, { ok: false, code: 'recording_too_short', error: '녹음이 너무 짧습니다. 1초 이상 녹음해 주세요.' })
})

test('recorder timeout settles concurrent stoppers with a structured failure', async () => {
  const callbacks = new Map()
  let nextTimer = 0
  const timers = {
    setTimeout (callback, delay) { const id = ++nextTimer; callbacks.set(id, { callback, delay }); return id },
    clearTimeout (id) { callbacks.delete(id) }
  }
  class SilentRecorder {
    start () {}
    stop () {}
  }
  const { context, tracks } = recorderContext({ Recorder: SilentRecorder, timers })
  await context.startRecording()
  const first = context.stopRecording()
  const second = context.stopRecording()
  assert.equal(first, second)
  const timeout = [...callbacks.values()].find(timer => timer.delay === 30000)
  assert.ok(timeout)
  timeout.callback()
  assert.deepEqual({ ...(await first) }, { ok: false, code: 'stop_timeout', error: '녹음을 멈추는 데 시간이 너무 오래 걸렸습니다.' })
  assert.equal(tracks[0].stopped, 1)
})
