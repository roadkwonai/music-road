'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const knowledge = require('../electron/prompt-knowledge')
const { validate } = require('../electron/cli-catalog')
const { run } = require('../cli/client')

test('lists only the bundled prompt-knowledge topics with an explicit non-application policy', () => {
  const result = knowledge.read()
  assert.deepEqual(result.topics.map(item => item.topic), Object.keys(knowledge.documents).filter(topic => fs.existsSync(path.join(__dirname, '..', knowledge.documents[topic].source))))
  assert.deepEqual(result.policy, { preserveUserInput: true, autoApply: false, suggestionsRequireApproval: true })
  for (const topic of result.topics) {
    assert.equal(topic.version, require('../package.json').version)
    assert.equal(topic.appVersion, require('../package.json').version)
    assert.equal(topic.cliVersion, require('../cli/package.json').version)
  }
  assert.equal(result.content, undefined)
})

test('returns the exact UTF-8 document for a fixed topic', () => {
  const result = knowledge.read({ topic: 'ccm' })
  const source = path.join(__dirname, '..', result.source)
  assert.equal(result.topic, 'ccm')
  assert.equal(result.content, fs.readFileSync(source, 'utf8'))
  assert.deepEqual(Buffer.from(result.content, 'utf8'), fs.readFileSync(source))
  assert.equal(result.policy.preserveUserInput, true)
  assert.equal(result.version, require('../package.json').version)
  assert.equal(result.appVersion, require('../package.json').version)
  assert.equal(result.cliVersion, require('../cli/package.json').version)
})

test('rejects unknown topics and any unneeded input fields in every entry point', async () => {
  for (const params of [{ topic: 'outside' }, { topic: 'ccm', lyrics: '원문' }, { style: 'modern worship' }]) {
    assert.throws(() => knowledge.read(params), { code: 'INVALID_ARGUMENT' })
    assert.throws(() => validate('prompt:knowledge', params), { code: 'INVALID_ARGUMENT' })
  }
  let spawns = 0
  let stdout = ''
  const code = await run(['prompt:knowledge', '--json', '{"topic":"ccm"}'], {
    endpoint: path.join(__dirname, 'missing.sock'),
    spawnProcess: () => { spawns += 1; return { on: () => {}, unref: () => {} } },
    stdout: { write: text => { stdout += text } }
  })
  assert.equal(code, 0)
  assert.equal(spawns, 0)
  assert.equal(JSON.parse(stdout).result.topic, 'ccm')
})

test('model-production knowledge is available through schema and CLI without starting a service', async () => {
  validate('prompt:knowledge', { topic: 'models' })
  assert.ok(knowledge.read().topics.some(topic => topic.topic === 'models'))
  const expected = fs.readFileSync(path.join(__dirname, '..', 'docs', 'model-production-guide.md'), 'utf8')
  let spawns = 0
  let stdout = ''
  const code = await run(['prompt:knowledge', '--json', '{"topic":"models"}'], {
    endpoint: path.join(__dirname, 'missing-model-knowledge.sock'),
    spawnProcess: () => { spawns += 1; return { on: () => {}, unref: () => {} } },
    stdout: { write: text => { stdout += text } }
  })
  assert.equal(code, 0)
  assert.equal(spawns, 0)
  const result = JSON.parse(stdout).result
  assert.equal(result.topic, 'models')
  assert.equal(result.source, 'docs/model-production-guide.md')
  assert.equal(result.content, expected)
  assert.deepEqual(result.policy, { preserveUserInput: true, autoApply: false, suggestionsRequireApproval: true })
})

test('guide UI is read-only and never assigns a guide result to lyric or style inputs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8')
  const start = source.indexOf('let knowledgeRequest')
  const guide = source.slice(start, source.indexOf('// Show what the machine', start))
  assert.match(guide, /knowledgeContent'\)\.textContent/)
  assert.doesNotMatch(guide, /\$\('(lyrics|style)'\)\.value\s*=/)
  assert.match(guide, /event\.key === 'Escape'/)
  assert.match(guide, /request !== knowledgeRequest/)
  assert.match(guide, /trigger\.focus\(\)/)
})

test('desktop build bundles the local guidance files used by prompt knowledge', () => {
  const files = require('../package.json').build.files
  for (const pattern of ['docs/**', 'AGENTS.md', 'skills/road-music-ace/**', 'prompts/ace-review.md', 'prompts/cli-workflows.md']) {
    assert.ok(files.includes(pattern), `${pattern} must be packaged`)
  }
})
