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
