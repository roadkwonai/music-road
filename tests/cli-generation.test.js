'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { prepareRequests } = require('../electron/cli-generation')

test('uses the same prompt builder for instrumental instruments and BPM', () => {
  const [job] = prepareRequests({ style: 'jazz', instrumental: true, bpm: 90, parts: { instruments: ['piano'], structure: 'loop' } })
  assert.equal(job.engine, 'ace')
  assert.match(job.style, /90 BPM/)
  assert.match(job.style, /piano/)
  assert.match(job.style, /no vocals/)
  assert.equal((job.lyrics.match(/\[Chorus\]/g) || []).length, 2)
})

test('batch requests keep separate titles and seeds without changing the input', () => {
  const input = { title: '밤', style: 'jazz', lyrics: '[Verse]\n밤길을 걸어요', seed: 12, count: 3 }
  const jobs = prepareRequests(input)
  assert.deepEqual(jobs.map(job => job.title), ['밤 A', '밤 B', '밤 C'])
  assert.deepEqual(jobs.map(job => job.seed), [12, 13, 14])
  assert.equal(input.count, 3)
  assert.equal(jobs[0].count, undefined)
  assert.throws(() => prepareRequests({ ...input, count: 9 }))
})

test('does not enqueue unusable empty lyrics or style, and preserves effect prose', () => {
  assert.throws(() => prepareRequests({ style: 'jazz', lyrics: '[Verse]' }), /가사/)
  assert.throws(() => prepareRequests({ instrumental: true }), /스타일/)
  const [job] = prepareRequests({ soundEffect: true, targetSeconds: 3, style: 'A short whoosh sweeps from left to right.' })
  assert.equal(job.style, 'A short whoosh sweeps from left to right.')
  assert.equal(job.soundEffect, true)
})

test('strong instrument guidance preserves expert overrides', () => {
  const input = { style: 'jazz', instrumental: true, parts: { strict: true, strong: true } }
  assert.equal(prepareRequests(input)[0].advanced.cfgScale, 1.5)
  assert.equal(prepareRequests({ ...input, advanced: { cfgScale: 2 } })[0].advanced.cfgScale, 2)
})

test('MLX YuE2 requests retain their engine, lyrics, target and explicit sampling', () => {
  const input = { title: '맥 발라드', engine: 'yue-mlx', style: 'Korean piano ballad, female vocal',
    lyrics: '[Verse]\n너 없는 저녁에\n불을 켜고 기다려', targetSeconds: 180, seed: 42,
    advanced: { temperature: 1, cfgScale: 1 }, cot: 'full' }
  const [job] = prepareRequests(input)
  assert.equal(job.engine, 'yue-mlx')
  assert.equal(job.lyrics, input.lyrics)
  assert.equal(job.targetSeconds, 180)
  assert.deepEqual(job.advanced, input.advanced)
  assert.equal(job.advanced.minTokens, undefined)
  assert.equal(job.cot, 'full')
})

test('generation requests retain the original user prompt metadata separately', () => {
  const requestId = 'b'.repeat(48)
  const [job] = prepareRequests({ style: 'jazz', lyrics: '[Verse]\n밤길', requestPrompt: '따뜻한 밤의 재즈 곡을 만들어줘', requestId })
  assert.equal(job.requestPrompt, '따뜻한 밤의 재즈 곡을 만들어줘')
  assert.equal(job.requestId, requestId)
  assert.match(job.style, /jazz/)
  assert.notEqual(job.requestPrompt, job.style)
})
