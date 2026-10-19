'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { run } = require('../cli/client')
const { capabilities } = require('../cli/yue')

test('preparation and rejection run locally without starting Electron or submitting generation', async () => {
  let stdout = '', spawns = 0
  const input = { engine: 'yue-mlx', style: 'Korean ballad', lyrics: '[Verse]\n오늘도 너를 기다려', advanced: { cfgScale: 0, temperature: 0, abcTopK: 40 } }
  const code = await run(['song:prepare', '--json', JSON.stringify(input)], {
    spawnProcess: () => { spawns++; throw new Error('Unexpected service startup') },
    stdout: { write: text => { stdout += text } }
  })
  assert.equal(code, 0)
  assert.equal(spawns, 0)
  const result = JSON.parse(stdout).result
  assert.equal(result.valid, true)
  assert.equal(result.nativeRequest.abc_sampling.top_k, 40)
  assert.equal(result.validation.synthesis, 'not-run')
})

test('Windows runtime detection follows the app dataDir and explicit pythonPath', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-yue-cap-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const userData = path.join(root, 'data'), moved = path.join(root, 'moved')
  await fs.mkdir(userData)
  for (const dataRoot of [userData, moved]) {
    const python = path.join(dataRoot, 'runtime', 'venv', 'Scripts', 'python.exe')
    await fs.mkdir(path.dirname(python), { recursive: true }); await fs.writeFile(python, 'fixture')
    await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({ dataDir: dataRoot }))
    const r = await capabilities({ engine: 'yue' }, { userData, env: { ...process.env, ROADMUSIC_SCORE_PYTHON: 'python3' } })
    assert.equal(r.engines[0].installation.detected, true)
    assert.deepEqual(r.engines[0].operations.replay, [])
  }
  const explicit = path.join(root, 'selected-python.exe'); await fs.writeFile(explicit, 'fixture')
  await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({ pythonPath: explicit }))
  const r = await capabilities({ engine: 'yue' }, { userData, env: { ...process.env, ROADMUSIC_SCORE_PYTHON: 'python3' } })
  assert.equal(r.engines[0].installation.detected, true)
})

test('documentation JSON and shell input examples conform to their public schemas', async () => {
  const { validate } = require('../electron/cli-catalog')
  const source = await fs.readFile(path.join(__dirname, '../docs/yue-cli-workflow.md'), 'utf8')
  for (const [, text] of source.matchAll(/```json\n([\s\S]*?)```/g)) {
    validate('song:generate', { engine: 'yue-mlx', style: 'Korean ballad', lyrics: '[Verse]\n오늘도 너를 기다려', ...JSON.parse(text) })
  }
  for (const [, command, text] of source.matchAll(/road-music\.js\s+([a-z:-]+)[^\n]*?--json\s+'([^']+)'/g)) {
    validate(command, JSON.parse(text))
  }
})

test('MLX precision detection follows environment and saved shared model locations', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-yue-model-cap-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const engine = path.join(root, 'engine'), shared = path.join(root, 'shared'), override = path.join(root, 'override')
  for (const directory of [engine, shared, override]) await fs.mkdir(directory)
  await fs.writeFile(path.join(shared, 'ar-bf16.safetensors'), 'fixture')
  await fs.writeFile(path.join(override, 'ar-8bit.safetensors'), 'fixture')
  await fs.writeFile(path.join(engine, 'paths.json'), JSON.stringify({ model: shared }))
  const env = { ...process.env, ROADMUSIC_YUE_MLX_ROOT: engine, ROADMUSIC_SCORE_PYTHON: 'python3' }
  delete env.ROADMUSIC_YUE_MLX_MODELS
  const saved = await capabilities({ engine: 'yue-mlx' }, { env })
  assert.deepEqual(saved.engines[0].precisionAvailability, { '8bit': false, bf16: true, '4bit': false })
  const selected = await capabilities({ engine: 'yue-mlx' }, { env: { ...env, ROADMUSIC_YUE_MLX_MODELS: override } })
  assert.deepEqual(selected.engines[0].precisionAvailability, { '8bit': true, bf16: false, '4bit': false })
})
