'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const app = fs.readFileSync(path.join(__dirname, '..', 'renderer/app.js'), 'utf8')
const html = fs.readFileSync(path.join(__dirname, '..', 'renderer/index.html'), 'utf8')

function classList () {
  return { add () {}, remove () {}, toggle () {} }
}

function engineContext ({ saved = null, installed = {} } = {}) {
  const elements = {
    engine: { value: 'ace', options: [{ value: 'yue' }, { value: 'yue-mlx' }, { value: 'ace' }] },
    planOnly: { disabled: false, title: '', dataset: {} },
    importScore: { disabled: false, title: '', dataset: {} },
    advanced: { open: false, classList: classList(), dataset: {} },
    target: { value: '', options: [{ value: '' }, { value: '180' }, { value: 'custom' }] },
    targetCustom: { min: '', max: '' },
    targetCustomRow: { classList: classList() },
    targetHint: { textContent: '', classList: classList() }
  }
  const context = vm.createContext({
    Object, String, RegExp, $: id => elements[id], document: { getElementById: id => elements[id], querySelector () {} },
    window: {}, localStorage: { getItem: () => saved }, toast () {}, updateTarget () {}, showLyricsCheckHint () {}
  })
  const start = app.indexOf('const ENGINE_NAMES')
  const end = app.indexOf('// ── library', start)
  vm.runInContext(app.slice(start, end), context)
  vm.runInContext(`enginesInstalled = ${JSON.stringify({ yue: false, 'yue-mlx': false, ace: false, ...installed })}`, context)
  return { context, elements }
}

test('Apple Silicon YuE2 is separately selectable from Windows NVIDIA YuE2', () => {
  assert.match(html, /option value="yue">YuE2 \(Windows · NVIDIA\)<\/option>/)
  assert.match(html, /option value="yue-mlx">YuE2 \(Apple Silicon\)<\/option>/)

  const { context, elements } = engineContext({ saved: 'yue', installed: { 'yue-mlx': true, ace: true } })
  context.showEngineChoice()
  assert.equal(elements.engine.value, 'yue-mlx')
  assert.equal(elements.engine.options[0].textContent, 'YuE2 (Windows · NVIDIA) (설치 필요)')
  assert.equal(elements.engine.options[1].textContent, 'YuE2 (Apple Silicon)')
  assert.equal(context.currentEngine(), 'yue-mlx')
})

test('score actions prefer the installed Apple Silicon YuE2 runtime', () => {
  const { context, elements } = engineContext({ installed: { 'yue-mlx': true, ace: true } })
  context.useScoreEngine()
  assert.equal(elements.engine.value, 'yue-mlx')
  assert.equal(elements.planOnly.disabled, false)
  assert.equal(elements.importScore.disabled, false)

  elements.engine.value = 'yue'
  context.useScoreEngine()
  assert.equal(elements.engine.value, 'yue-mlx')
})

test('song metadata engineId keeps MLX distinct when cloning or reusing a song', () => {
  const { context } = engineContext()
  assert.equal(vm.runInContext("engineIdFromSong({ engineId: 'yue-mlx', engine: 'ACE-Step 1.5' })", context), 'yue-mlx')
  assert.equal(vm.runInContext("engineIdFromSong({ engine: 'yue2-infer' })", context), 'yue')
  assert.equal(vm.runInContext("engineIdFromSong({ engine: 'ACE-Step 1.5' })", context), 'ace')

  Object.assign(context, { ONLY_LISTED: '', NO_VOICE: '', STRONG_CFG: 2, LONG_FORM: '', FILLER_SECTIONS: '' })
  const start = app.indexOf('function userRequest (')
  const end = app.indexOf('function readTarget ()', start)
  vm.runInContext(app.slice(start, end), context)
  const saved = context.userRequest({ engineId: 'yue-mlx', engine: 'ACE-Step 1.5', targetSeconds: 180, advanced: { maxTokens: 4500, minTokens: 3600 } })
  assert.equal(saved.engine, 'yue-mlx')
  assert.deepEqual({ ...saved.advanced }, { maxTokens: 4500, minTokens: 3600 })
})

test('MLX YuE2 keeps a requested length without auto-injecting token limits', () => {
  const start = app.indexOf('const TOKENS_PER_SECOND')
  const end = app.indexOf('function readAdvanced ()', start)
  const context = vm.createContext({ Math, MAX_SONG_TOKENS: 9000 })
  vm.runInContext(app.slice(start, end), context)

  const mlx = context.generationLengthPlan('yue-mlx', 180, { lyrics: '[Verse]\n테스트' })
  assert.equal(mlx.requestedTarget, 180)
  assert.equal(mlx.naturalEos, true)
  assert.equal(mlx.length, null)

  const cuda = context.generationLengthPlan('yue', 180, { lyrics: '[Verse]\n테스트' })
  assert.equal(cuda.requestedTarget, 180)
  assert.equal(cuda.naturalEos, false)
  assert.equal(cuda.length.maxTokens, 4500)
  assert.equal(cuda.length.minTokens, 3690)
})

test('MLX resume keeps the prior attempt and clearly starts a new generation', async () => {
  const { context } = engineContext()
  let question = ''
  let notice = ''
  Object.assign(context, {
    running: false,
    warmed: true,
    plans: new Map(),
    confirm: text => { question = text; return true },
    estimate: () => ({ total: 1 }),
    toast: text => { notice = text }
  })
  context.window.yue = { resume: async () => ({ ok: true, jobId: 'new-attempt', position: 0 }) }
  const start = app.indexOf('async function resume (')
  const end = app.indexOf('// Long paths', start)
  vm.runInContext(app.slice(start, end), context)

  await context.resume({ dir: '/songs/old', title: '미완성', engineId: 'yue-mlx', stages: ['semantic'] })
  assert.match(question, /이전 시도를 보존하고 새로 다시 생성할까요/)
  assert.equal(notice, '이전 시도를 보존하고 새로 다시 생성하는 중입니다.')
  assert.deepEqual([...context.plans.keys()], ['new-attempt'])
})
