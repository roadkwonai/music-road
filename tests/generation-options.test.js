'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { generationError } = require('../renderer/generation-options')
const { validate } = require('../electron/cli-catalog')

test('accepts automatic, short, and custom lengths within each engine limit', () => {
  for (const targetSeconds of [undefined, null, 1, 5, 7.5, 30, 60, 360]) {
    assert.equal(generationError({ engine: 'ace', targetSeconds }), null)
  }
  for (const targetSeconds of [undefined, null, 20, 30, 60, 360]) {
    assert.equal(generationError({ engine: 'yue', targetSeconds }), null)
  }
  assert.equal(generationError({ engine: 'ace', targetSeconds: 600 }), null)
  for (const targetSeconds of [0, -1, NaN, Infinity, '', '30', 601]) {
    assert.ok(generationError({ engine: 'ace', targetSeconds }))
  }
  assert.ok(generationError({ engine: 'yue', targetSeconds: 361 }))
  assert.ok(generationError({ engine: 'yue', targetSeconds: 5 }))
})

test('effects require ACE-Step, an explicit short length, and no score or cover', () => {
  const effect = { engine: 'ace', soundEffect: true, targetSeconds: 5, style: 'short electronic chime' }
  assert.equal(generationError(effect), null)
  for (const extra of [{ engine: 'yue' }, { targetSeconds: null }, { targetSeconds: 31 },
    { mode: 'plan' }, { abc: 'score' }, { coverAudio: {} }, { recording: {} }, { style: ' ' }, { style: undefined }]) {
    assert.ok(generationError({ ...effect, ...extra }))
  }
  assert.equal(validate('song:generate', effect).args[0].soundEffect, true)
  assert.throws(() => validate('song:generate', { ...effect, engine: 'yue' }))
  const empty = { ...effect, style: '', parts: { genre: 'door slam' } }
  assert.ok(generationError(empty))
  assert.throws(() => validate('song:generate', empty))
})

test('custom length survives restoring saved settings and invalid input stays invalid', () => {
  const elements = {
    target: { value: '', options: ['', '30', '60', '120', '180', '240', '300', '360', 'custom'].map(value => ({ value })) },
    targetCustom: { value: '', max: '', classList: { toggle () {} } },
    targetCustomRow: { classList: { toggle () {} } }
  }
  let engine = 'ace'
  const context = { $: id => elements[id], currentEngine: () => engine, showLyricsCheckHint () {} }
  const source = fs.readFileSync(require('node:path').join(__dirname, '../renderer/app.js'), 'utf8')
  vm.runInNewContext(source.slice(source.indexOf('function readTarget ('), source.indexOf('function lengthPlan (')), context)
  context.setTarget(7.5)
  assert.equal(elements.target.value, 'custom')
  assert.equal(context.readTarget(), 7.5)
  elements.targetCustom.value = ''
  assert.ok(Number.isNaN(context.readTarget()))
  context.setTarget(30)
  assert.equal(elements.target.value, '30')
  assert.equal(context.readTarget(), 30)
  context.setTarget(null)
  assert.equal(context.readTarget(), null)
  elements.target.options.push({ value: '5' })
  context.setTarget(5)
  engine = 'yue'
  context.updateTarget()
  assert.equal(context.readTarget(), null)
})

test('effect descriptions bypass music arrangement and strict instrument clauses', () => {
  const context = {}
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../renderer/prompt.js'), 'utf8'), context)
  const description = 'A short whoosh sweeps from left to right.'
  const result = context.composeStyle({ genre: description, soundEffect: true, instrumental: true,
    strict: true, instruments: ['piano'], bpm: 120 })
  assert.equal(result.style, description)
  assert.equal(result.notes.length, 0)
  assert.equal(validate('prompt:compose', { soundEffect: true, genre: description }).args[0].soundEffect, true)
})

test('effect mode hides lyric warnings for lyrics left in the editor', () => {
  let hidden = false
  const elements = {
    lyricsCheckHint: { classList: { add (name) { hidden = name === 'hidden' } } },
    instrumental: { checked: false }, soundEffect: { checked: true }, lyrics: { value: '기존 노래 가사' }
  }
  const source = fs.readFileSync(require('node:path').join(__dirname, '../renderer/app.js'), 'utf8')
  const start = source.indexOf('function showLyricsCheckHint ()')
  const end = source.indexOf('\nfunction ', start + 1)
  const context = { $: id => elements[id], lyricsFindings () { throw new Error('Effects must not check lyrics') } }
  vm.runInNewContext(source.slice(start, end), context)
  context.showLyricsCheckHint()
  assert.equal(hidden, true)
})
