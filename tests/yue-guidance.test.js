'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const knowledge = require('../electron/prompt-knowledge')
const { validate } = require('../electron/cli-catalog')
const { run } = require('../cli/client')
const { prepareRequests } = require('../electron/cli-generation')

const root = path.resolve(__dirname, '..')

test('YuE source snapshots match the source kit runtime pins and their original bytes', () => {
  const directory = path.join(root, 'docs/vendor/yue2')
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
  const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8')
  assert.equal(manifest.sources.official.ref, main.match(/const YUE_URL = '.*\/tags\/([^']+)\.zip'/)[1])
  assert.equal(manifest.sources.mlx.revision, main.match(/const MLX_YUE_COMMIT = '([a-f0-9]{40})'/)[1])
  assert.equal(manifest.sources.model.revision, main.match(/const YUE2_MODEL_REVISION = '([a-f0-9]{40})'/)[1])
  assert.equal(manifest.sources.vae.revision, main.match(/const YUE2_VAE_REVISION = '([a-f0-9]{40})'/)[1])
  const names = manifest.files.map(file => file.path)
  assert.equal(new Set(names).size, names.length)
  for (const required of ['official/README.md', 'official/docs/generation.md', 'official/skills/yue2-music/SKILL.md', 'official/LICENSE', 'official/MODEL_LICENSE', 'mlx/README.md', 'mlx/LICENSE', 'mlx/vendor/yue/LICENSE', 'models/pinned-model/README.md', 'models/pinned-vae/README.md', 'current/LICENSE', 'current/MODEL_LICENSE', 'legacy/README.md']) {
    assert.ok(names.includes(required), required)
  }
  for (const file of manifest.files) {
    assert.ok(!path.isAbsolute(file.path) && !file.path.split('/').includes('..'), file.path)
    const source = manifest.sources[file.sourceId]
    assert.match(source.revision, /^[a-f0-9]{40}$/)
    const expected = source.repository.startsWith('https://github.com/')
      ? `${source.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/${source.revision}/${file.source}`
      : `${source.repository}/resolve/${source.revision}/${file.source}`
    assert.equal(file.url, expected)
    const bytes = fs.readFileSync(path.join(directory, file.path))
    assert.equal(bytes.length, file.bytes, file.path)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
  }
})

test('YuE production guidance is available through the public schema and CLI without starting a service', async () => {
  validate('prompt:knowledge', { topic: 'yue' })
  assert.ok(knowledge.read().topics.some(topic => topic.topic === 'yue'))
  let stdout = ''
  let spawns = 0
  const code = await run(['prompt:knowledge', '--json', '{"topic":"yue"}'], {
    endpoint: path.join(__dirname, 'missing-yue-guidance.sock'),
    spawnProcess: () => { spawns += 1; return { on: () => {}, unref: () => {} } },
    stdout: { write: text => { stdout += text } }
  })
  assert.equal(code, 0)
  assert.equal(spawns, 0)
  const result = JSON.parse(stdout).result
  assert.equal(result.source, 'docs/yue-prompt-guide.md')
  assert.equal(result.content, fs.readFileSync(path.join(root, result.source), 'utf8'))
  assert.deepEqual(result.policy, { preserveUserInput: true, autoApply: false, suggestionsRequireApproval: true })
  assert.equal(knowledge.read({ topic: 'ace' }).source, 'docs/ace-prompt-guide.md')
})

test('the YuE guide example is a public MLX request and keeps its Korean lyrics through preparation', () => {
  const guide = fs.readFileSync(path.join(root, 'docs/yue-prompt-guide.md'), 'utf8')
  const examples = [...guide.matchAll(/```json\n([\s\S]*?)```/g)]
  assert.ok(examples.length > 0)
  for (const [, text] of examples) {
    const input = JSON.parse(text)
    const { paramsValue } = validate('song:generate', input)
    const jobs = prepareRequests(paramsValue)
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].engine, 'yue-mlx')
    assert.equal(jobs[0].lyrics, input.lyrics)
    assert.equal(jobs[0].cot, input.cot)
    assert.equal(jobs[0].targetSeconds, input.targetSeconds)
  }
})
