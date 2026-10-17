'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8')

function installedContext (paths) {
  const context = { fs, fsp, path, exists: async file => fs.existsSync(file), paths: () => paths,
    MLX_YUE_COMMIT: 'c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8',
    YUE2_MODEL_REVISION: '1a96eca688d6ae5d7f0feb88573fec89920fcd19',
    YUE2_VAE_REVISION: '95535e72a97bc0f09b8ada125d26b4009428c0e8' }
  const start = source.indexOf('async function yueMlxInstalled')
  const end = source.indexOf('async function engineCheck', start)
  vm.runInNewContext(source.slice(start, end), context)
  return context.yueMlxInstalled
}

test('Apple Silicon YuE requires its manifest and every converted-model weight', async t => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'roadmusic-yue-mlx-'))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const model = path.join(root, 'models')
  const vae = path.join(root, 'vae')
  const src = path.join(root, 'src')
  const python = path.join(root, 'venv', 'bin', 'python')
  await fsp.mkdir(path.dirname(python), { recursive: true })
  await fsp.mkdir(model, { recursive: true })
  await fsp.mkdir(vae, { recursive: true })
  await fsp.mkdir(path.join(src, 'src', 'lyra'), { recursive: true })
  await Promise.all([
    fsp.writeFile(python, ''),
    ...['conversion.json', 'config.json', 'ar-8bit.safetensors', 'ar-bf16.safetensors', 'nar-bf16.safetensors', 'qwen.tiktoken'].map(name => fsp.writeFile(path.join(model, name), 'weight')),
    ...['config.json', 'model.safetensors'].map(name => fsp.writeFile(path.join(vae, name), 'weight')),
    fsp.writeFile(path.join(src, 'pyproject.toml'), ''), fsp.writeFile(path.join(src, 'uv.lock'), ''), fsp.writeFile(path.join(src, 'src', 'lyra', 'cli.py'), '')
  ])
  const paths = { yueMlxRoot: root, yueMlxPython: python, yueMlxSrc: src, yueMlxManifest: path.join(root, 'paths.json') }
  const manifest = { schema: 1, precision: '8bit', model, vae, source: {
    runtimeCommit: 'c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8',
    modelRevision: '1a96eca688d6ae5d7f0feb88573fec89920fcd19', vaeRevision: '95535e72a97bc0f09b8ada125d26b4009428c0e8'
  } }
  await fsp.writeFile(paths.yueMlxManifest, JSON.stringify(manifest))
  const installed = installedContext(paths)
  assert.equal(await installed(), true)
  await fsp.unlink(path.join(model, 'ar-bf16.safetensors'))
  assert.equal(await installed(), false)
  await fsp.writeFile(path.join(model, 'ar-bf16.safetensors'), 'weight')
  await fsp.unlink(path.join(src, 'uv.lock'))
  assert.equal(await installed(), false)
  await fsp.writeFile(path.join(src, 'uv.lock'), '')
  await fsp.writeFile(paths.yueMlxManifest, JSON.stringify({ ...manifest, precision: 'bf16' }))
  assert.equal(await installed(), false)
})

test('Apple Silicon setup installs the pinned MLX source and frozen dependencies before model preparation', () => {
  const start = source.indexOf('async function runYueMlxSetup')
  const end = source.indexOf('function uvEnv', start)
  const setup = source.slice(start, end)
  assert.match(setup, /MLX_YUE_URL/)
  assert.match(setup, /\['sync', '--project', p\.yueMlxSrc, '--frozen', '--no-dev', '--python', python\]/)
  assert.match(setup, /spawn\(p\.yueMlxPython, \['-u', p\.yueMlxSetup, p\.yueMlxRoot\]/)
})

test('score validation falls back to the Apple Silicon YuE Python environment', () => {
  const start = source.indexOf("ipcMain.handle('score:check'")
  const end = source.indexOf('// The MIDI last opened', start)
  const handler = source.slice(start, end)
  assert.match(handler, /p\.yueMlxPython/)
  assert.match(handler, /const python = await exists\(p\.python\) \? p\.python : await exists\(p\.yueMlxPython\) \? p\.yueMlxPython : null/)
})

test('completed MLX songs retain the canonical engine id instead of the display label', () => {
  const context = { ENGINES: { ace: {}, yue: {}, 'yue-mlx': {} }, currentJob: { job: { engine: 'yue-mlx' } } }
  const start = source.indexOf('function canonicalEngineId')
  const end = source.indexOf('// On a Mac ACE-Step', start)
  vm.runInNewContext(source.slice(start, end), context)
  assert.equal(context.completedEngineId({ engine: 'YuE2 MLX', engineId: 'yue-mlx' }, {}), 'yue-mlx')
  assert.equal(context.completedEngineId({ engine: 'YuE2 MLX' }, { engine: 'YuE2 MLX' }), 'yue-mlx')
})

test('MLX platform version checks use macOS product versions, including the M5 floor', () => {
  const context = {}
  const start = source.indexOf('function versionAtLeast')
  const end = source.indexOf('// ── engines', start)
  vm.runInNewContext(source.slice(start, end), context)
  assert.equal(context.versionAtLeast('14.1', '14.2'), false)
  assert.equal(context.versionAtLeast('14.2', '14.2'), true)
  assert.equal(context.versionAtLeast('26.1', '26.2'), false)
  assert.equal(context.versionAtLeast('26.2', '26.2'), true)
})

test('generation cannot start while an engine is being installed', async () => {
  let checks = 0
  const context = { installing: 'yue-mlx', setupRunning: 1, activeWork: 0,
    canonicalEngineId: value => value, generationError: () => null, log () {},
    ENGINES: { ace: { name: 'ACE-Step' } }, engineInstalled: async () => { checks += 1; return false } }
  const start = source.indexOf('async function startGeneration')
  const end = source.indexOf('// Lyric timing ACE-Step', start)
  vm.runInNewContext(source.slice(start, end), context)
  const result = await context.startGeneration({ engine: 'ace' })
  assert.equal(result.ok, false)
  assert.match(result.message, /설치/)
  assert.equal(context.activeWork, 0)
  assert.equal(checks, 0)
})

