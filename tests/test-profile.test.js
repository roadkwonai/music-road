'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createTestProfile, TestProfileError } = require('../cli/test-profile')
const { run } = require('../cli/client')

async function temporary (callback) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'road-music-test-profile-')))
  try { await callback(root) } finally { await fs.rm(root, { recursive: true, force: true }) }
}

test('test profile pins only the shared runtime and keeps a fresh library', async () => temporary(async root => {
  const source = path.join(root, 'source')
  const runtime = path.join(root, 'shared-runtime')
  const models = path.join(root, 'shared-models')
  const target = path.join(root, 'isolated')
  await fs.mkdir(runtime, { recursive: true })
  await fs.mkdir(models, { recursive: true })
  await fs.mkdir(path.join(runtime, 'engines', 'ace-step', 'venv', 'bin'), { recursive: true })
  await fs.mkdir(path.join(runtime, 'engines', 'ace-step', 'src', 'checkpoints', 'acestep-v15-turbo'), { recursive: true })
  await fs.writeFile(path.join(runtime, 'engines', 'ace-step', 'venv', 'bin', 'python'), '')
  await fs.writeFile(path.join(runtime, 'engines', 'ace-step', 'src', 'checkpoints', 'acestep-v15-turbo', 'model.safetensors'), '')
  const original = {
    dataDir: runtime,
    hfHome: models,
    pythonPath: path.join(runtime, 'venv', 'bin', 'python'),
    songsDir: path.join(source, 'Songs'),
    project: '기존 작업',
    deliveryRoot: path.join(root, 'Output'),
    aceInstalled: true,
    apiToken: 'must-not-copy'
  }
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(path.join(source, 'settings.json'), JSON.stringify(original))

  const result = await createTestProfile({ directory: target }, { userData: source })
  const settings = JSON.parse(await fs.readFile(path.join(target, 'settings.json'), 'utf8'))
  assert.deepEqual(settings, {
    dataDir: runtime,
    hfHome: models,
    pythonPath: original.pythonPath,
    songsDir: path.join(target, 'Songs'),
    autoMp3: true,
    dropWav: true,
    aceInstalled: true
  })
  assert.equal(await fs.readFile(path.join(source, 'settings.json'), 'utf8'), JSON.stringify(original))
  assert.deepEqual(result.env, { ROADMUSIC_DATA_DIR: target })
  assert.equal(result.runtimeDir, runtime)
  assert.ok(result.scopeWarnings.every(item => typeof item === 'string'))
  assert.deepEqual((await fs.readdir(target)).sort(), ['Songs', 'settings.json'])
}))

test('test profile infers the existing Hugging Face home without copying models', async () => temporary(async root => {
  const source = path.join(root, 'source')
  const target = path.join(root, 'isolated')
  const sharedHf = path.join(root, 'hf-cache')
  await fs.mkdir(source, { recursive: true })
  await fs.mkdir(sharedHf, { recursive: true })
  await fs.writeFile(path.join(source, 'settings.json'), JSON.stringify({ identity: 'do-not-copy', aceInstalled: true }))

  await createTestProfile({ directory: target }, { userData: source, env: { HF_HOME: sharedHf } })
  const settings = JSON.parse(await fs.readFile(path.join(target, 'settings.json'), 'utf8'))
  assert.equal(settings.dataDir, source)
  assert.equal(settings.hfHome, sharedHf)
  assert.equal('identity' in settings, false)
  assert.equal('aceInstalled' in settings, false)
}))

test('test profile rejects existing, symlink, and shared-runtime destinations', async () => temporary(async root => {
  const source = path.join(root, 'source')
  const runtime = path.join(root, 'runtime')
  await fs.mkdir(source, { recursive: true })
  await fs.mkdir(runtime, { recursive: true })
  await fs.writeFile(path.join(source, 'settings.json'), JSON.stringify({ dataDir: runtime }))
  const options = { userData: source }
  const existing = path.join(root, 'existing'); await fs.mkdir(existing)
  await assert.rejects(createTestProfile({ directory: existing }, options), error => error instanceof TestProfileError && error.code === 'test_profile_exists')
  await assert.rejects(createTestProfile({ directory: path.join(runtime, 'engines', 'test') }, options), error => error.code === 'test_profile_unsafe_path')
  const linked = path.join(root, 'linked'); await fs.symlink(path.join(root, 'outside'), linked)
  await assert.rejects(createTestProfile({ directory: path.join(linked, 'test') }, options), error => error.code === 'test_profile_unsafe_path')
}))

test('test profile fails closed when the source settings are malformed', async () => temporary(async root => {
  const source = path.join(root, 'source')
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(path.join(source, 'settings.json'), '{')
  await assert.rejects(createTestProfile({ directory: path.join(root, 'isolated') }, { userData: source }), error => error.code === 'test_profile_source_invalid')
}))

test('CLI runs setup:test-profile locally without starting a service', async () => temporary(async root => {
  const source = path.join(root, 'source')
  const target = path.join(root, 'isolated')
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(path.join(source, 'settings.json'), '{}')
  let stdout = ''
  const code = await run(['setup:test-profile', '--json', JSON.stringify({ directory: target })], {
    userData: source,
    stdout: { write: text => { stdout += text } },
    env: {}
  })
  assert.equal(code, 0)
  const response = JSON.parse(stdout)
  assert.equal(response.ok, true)
  assert.equal(response.result.targetDir, target)
}))
