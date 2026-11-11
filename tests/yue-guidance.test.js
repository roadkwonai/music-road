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

test('song:prepare reports official YuE2 guide checks for YuE without changing the request', () => {
  const { preparePreview } = require('../electron/cli-generation')
  const clean = preparePreview({ engine: 'yue-mlx', style: 'Korean traditional trot, mature solo female vocal, accordion, brass and drums', lyrics: '[Verse]\n아침상을 마주 보고\n[Chorus]\n함께라서 좋아요', bpm: 108 })
  assert.equal(clean.officialGuide.advice, 0)
  assert.equal(clean.officialGuide.basis, 'docs/yue-prompt-guide.md#official-correction')

  const input = { engine: 'yue', style: 'make a song, ballad without drums', lyrics: '사랑해 (속삭이듯)\n너를', cot: 'melody', abc: 'X:1\nQ:1/4=90\nK:C\nV:Vocal\n"C"c d e|' }
  const flagged = preparePreview(input)
  const status = Object.fromEntries(flagged.officialGuide.checks.map(item => [item.id, item.status]))
  for (const id of ['style-genre-instruments', 'style-vocal', 'style-tempo', 'style-positive-description', 'style-no-instruction', 'lyrics-sections', 'lyrics-no-annotations', 'abc-tempo-consistency', 'melody-abc-chord-free']) assert.equal(status[id], 'advice', id)
  assert.ok(flagged.valid, 'official guide advice must not block preparation')
  assert.equal(flagged.requests[0].lyrics, '사랑해 (속삭이듯)\n너를')

  const instrumental = preparePreview({ engine: 'yue-mlx', style: 'calm piano', instrumental: true, bpm: 70, parts: { strict: true, instruments: ['piano'] } })
  const byId = Object.fromEntries(instrumental.officialGuide.checks.map(item => [item.id, item.status]))
  assert.equal(byId['style-positive-description'], 'pass', 'CLI-added no-vocals text is not the user style')
  assert.equal(byId['lyrics-sections'], 'not-applicable')
  assert.equal(preparePreview({ engine: 'ace', style: 'pop', lyrics: '[Verse]\nhi' }).officialGuide, undefined)

  const guide = fs.readFileSync(path.join(root, 'docs/yue-prompt-guide.md'), 'utf8')
  for (const item of flagged.officialGuide.checks) assert.ok(guide.includes(`\`${item.id}\``), `${item.id} is documented`)
  for (const anchor of ['<a id="official-correction"></a>', '<a id="official-report"></a>']) assert.ok(guide.includes(anchor))
})

test('song:prepare does not take a section tag as the inferred title', () => {
  const title = lyrics => validate('song:prepare', { engine: 'yue-mlx', style: 'pop', lyrics }).paramsValue.title
  assert.equal(title('[Verse]\n너를 불러'), '너를 불러')
  assert.equal(title('# 내 노래\n[Verse]\n가사'), '내 노래')
  assert.equal(title('[Verse]'), '무제')
})
