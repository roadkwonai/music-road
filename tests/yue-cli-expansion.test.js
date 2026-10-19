'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { validate } = require('../electron/cli-catalog')
const { prepareRequests, preparePreview } = require('../electron/cli-generation')
const { instrumentPhrase } = require('../renderer/prompt')

const base = { engine: 'yue-mlx', title: '검증', style: 'Korean rock ballad, female vocal', lyrics: '[Verse]\n창을 열어 너를 불러', seed: 42 }

test('four or sixteen instruments never become a trio, including repeated players', () => {
  for (const length of [4, 16]) {
    const names = Array.from({ length }, (_, index) => index % 2 ? 'violin' : 'cello')
    assert.doesNotMatch(instrumentPhrase(names), /trio/)
    const input = validate('song:generate', { ...base, parts: { instruments: names } }).paramsValue
    assert.equal(prepareRequests(input)[0].parts.instruments.length, length)
  }
})

test('all native YuE sampling controls reach the prepared job without clamping', () => {
  const advanced = { temperature: 0, topP: 0.01, topK: 1024, repetitionPenalty: 0.9, penaltyWindow: 80,
    minTokens: 0, maxTokens: 12000, abcTemperature: 0, abcTopP: 0.8, abcTopK: 20,
    abcRepetitionPenalty: 1.01, abcPenaltyWindow: 80, abcMinTokens: 0, abcMaxTokens: 5000, cfgScale: 0, odeSteps: 96 }
  const input = validate('song:generate', { ...base, advanced }).paramsValue
  assert.deepEqual(prepareRequests(input)[0].advanced, advanced)
  for (const bad of [{ minTokens: 501, maxTokens: 500 }, { abcMinTokens: 200, abcMaxTokens: 100 },
    { minTokens: 9001 }, { abcMinTokens: 4097 }, { penaltyWindow: 101 }, { temperature: NaN }]) {
    assert.throws(() => validate('song:generate', { ...base, advanced: bad }), { code: 'INVALID_ARGUMENT' })
  }
})

test('large native seeds remain exact across candidate increments', () => {
  const input = validate('song:generate', { ...base, seed: '9223372036854775807', count: 2 }).paramsValue
  assert.deepEqual(prepareRequests(input).map(job => job.seed), ['9223372036854775807', '0'])
  assert.throws(() => validate('song:generate', { ...base, seed: '9223372036854775808' }))
})

test('detailed instrumentation is a preserved style intention, not a separate audio mixer', () => {
  const input = validate('song:generate', { ...base, parts: {
    instrumentation: [{ instrument: 'piano', role: 'accompaniment', technique: 'sparse chords', section: 'Verse' },
      { instrument: 'gayageum', role: 'response', section: 'Chorus' }, { instrument: 'electric guitar', role: 'lead' },
      { instrument: 'bass guitar', role: 'bass' }, { instrument: 'drums', role: 'rhythm' }],
    vocal: ['clear solo female vocal'], dynamics: ['restrained verse', 'soaring final chorus'], mix: ['dry forward lead']
  } }).paramsValue
  const preview = preparePreview(input)
  assert.equal(preview.valid, true)
  assert.ok(preview.requests[0].style.includes(base.style))
  for (const tag of ['piano', 'gayageum', 'electric guitar', 'bass guitar', 'drums', 'clear solo female vocal', 'dry forward lead']) {
    assert.ok(preview.requests[0].style.includes(tag), tag)
  }
  assert.equal(preview.effective.advanced.cfgScale, 1)
  assert.equal(preview.effective.advanced.odeSteps, 32)
  assert.equal(preview.validation.context, 'requires-runtime-tokenizer')
})

test('preview exposes destructive style cleanup and generation refuses to silently lose it', () => {
  const input = { ...base, style: 'Korean rock ballad, a solo female singer holds a powerful sustained high note only in the final chorus' }
  const preview = preparePreview(input)
  assert.equal(preview.valid, false)
  assert.ok(preview.errors.some(error => /스타일|style/i.test(error)))
  assert.ok(preview.changes.style.dropped.some(tag => tag.includes('high note')))
  assert.throws(() => prepareRequests(input), { code: 'INVALID_ARGUMENT' })
  const bracketed = { ...base, style: 'Korean ballad, [female vocal]' }
  assert.equal(preparePreview(bracketed).valid, false)
  assert.throws(() => prepareRequests(bracketed), { code: 'INVALID_ARGUMENT' })
})
