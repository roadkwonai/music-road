'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const test = require('node:test')
const catalog = require('../electron/cli-catalog')
const { run } = require('../cli/client')
const { dispatch } = require('../cli/storage')

function fixture () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-storage-cli-'))
  const script = path.join(dir, 'storage-fixture.js')
  fs.writeFileSync(script, "const action = process.argv[2]; const params = JSON.parse(process.argv[4]); process.stdout.write(JSON.stringify({ ok: true, result: { action, params, confirm: process.argv.includes('--confirm') } }) + '\\n')")
  return { dir, script }
}

test('publishes music-group, MV removal and sweep storage commands', () => {
  const commands = catalog.schema().commands.filter(item => item.command.startsWith('storage:'))
  assert.deepEqual(commands.map(item => item.command), [
    'storage:list', 'storage:register', 'storage:track', 'storage:policy', 'storage:pin',
    'storage:preview', 'storage:cleanup', 'storage:history', 'storage:lease',
    'storage:legacy', 'storage:adopt-preview', 'storage:adopt',
    'storage:maintenance-list', 'storage:maintenance-preview', 'storage:maintenance-cleanup', 'storage:maintenance-history', 'storage:status',
    'storage:migrate', 'storage:events', 'storage:tracking', 'storage:reconcile-preview', 'storage:reconcile-cleanup', 'storage:project-remove-preview', 'storage:group-remove-preview', 'storage:entity-remove', 'storage:entity-recover',
    'storage:overview', 'storage:versions', 'storage:version-diff', 'storage:file-remove-preview', 'storage:file-remove', 'storage:project-finish-preview', 'storage:project-finish',
    'storage:restructure-status', 'storage:restructure-preview', 'storage:restructure-cleanup',
    'storage:mv-list', 'storage:mv-preview', 'storage:mv-cleanup',
    'storage:sweep-preview', 'storage:sweep-cleanup'
  ])
  assert.equal(commands.find(item => item.command === 'storage:cleanup').destructive, true)
  assert.equal(commands.find(item => item.command === 'storage:adopt').destructive, true)
  for (const command of ['storage:reconcile-cleanup', 'storage:entity-remove', 'storage:entity-recover']) assert.equal(commands.find(item => item.command === command).destructive, true)
  assert.throws(() => catalog.validate('storage:events', { cursor: 0 }), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => catalog.validate('storage:events', { root: '/tmp' }), { code: 'INVALID_ARGUMENT' })
  assert.deepEqual(catalog.validate('storage:overview', {}).paramsValue, {})
  assert.deepEqual(catalog.validate('storage:overview', { refreshWorkspace: true }).paramsValue, { refreshWorkspace: true })
  assert.throws(() => catalog.validate('storage:overview', { refreshWorkspace: 'true' }), /must be a boolean/)
  assert.throws(() => catalog.validate('storage:policy', { projectId: 'p', maxCacheBytes: -1 }), /below the minimum/)
  assert.throws(() => catalog.validate('storage:cleanup', { planId: 'p', confirm: true }), /Unknown parameter/)
  assert.throws(() => catalog.validate('storage:adopt', { planId: 'p', confirm: true }), /Unknown parameter/)
  assert.throws(() => catalog.validate('storage:lease', { projectId: 'p', operation: 'acquire' }), /producer pid/)
  assert.deepEqual(catalog.validate('storage:versions', { groupId: 'a'.repeat(64), limit: 50, offset: 0 }).paramsValue, { groupId: 'a'.repeat(64), limit: 50, offset: 0 })
  assert.throws(() => catalog.validate('storage:versions', { groupId: 'not-a-hash' }), /invalid format/)
  assert.throws(() => catalog.validate('storage:version-diff', { fromId: 'a'.repeat(64), toId: 'bad' }), /invalid format/)
  assert.deepEqual(catalog.validate('storage:restructure-preview', {}).paramsValue, {})
  assert.throws(() => catalog.validate('storage:restructure-cleanup', { planId: 'plan' }), /invalid format/)
})

test('runs legacy adoption with the shared storage core action and confirm flag', async t => {
  const { dir, script } = fixture()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const result = await dispatch('storage:adopt', { planId: 'legacy-plan' }, {
    python: process.execPath, script, userData: path.join(dir, 'profile')
  }, true)
  assert.deepEqual(result, { action: 'adopt', params: { planId: 'legacy-plan' }, confirm: true })
})

test('rejects unconfirmed legacy adoption before the child process runs', async () => {
  let started = false
  await assert.rejects(dispatch('storage:adopt', { planId: 'legacy-plan' }, {
    script: '/tmp/storage-legacy-fixture.py',
    spawnProcess: () => { started = true; throw new Error('child must not start') }
  }), { code: 'invalid_arguments' })
  assert.equal(started, false)
})

test('runs storage cleanup locally with the Python confirm flag', async t => {
  const { dir, script } = fixture()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const result = await dispatch('storage:cleanup', { planId: 'a'.repeat(48) }, {
    python: process.execPath, script, userData: path.join(dir, 'profile')
  }, true)
  assert.deepEqual(result, { action: 'cleanup', params: { planId: 'a'.repeat(48) }, confirm: true })
})

test('runs storage requests locally in direct and batch modes without starting Electron', async t => {
  const { dir, script } = fixture()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const storageOptions = { python: process.execPath, script, userData: path.join(dir, 'profile') }
  let stdout = ''
  assert.equal(await run(['storage:list'], {
    storageOptions,
    spawnProcess: () => { throw new Error('must not start Electron') },
    stdout: { write: text => { stdout += text } }
  }), 0)
  assert.deepEqual(JSON.parse(stdout), { ok: true, result: { action: 'list', params: {}, confirm: false } })

  stdout = ''
  assert.equal(await run(['batch'], {
    storageOptions,
    spawnProcess: () => { throw new Error('must not start Electron') },
    stdinText: '{"id":"cleanup","command":"storage:cleanup","params":{"planId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"confirm":true}',
    stdout: { write: text => { stdout += text } }
  }), 0)
  assert.deepEqual(JSON.parse(stdout), { id: 'cleanup', ok: true, result: { action: 'cleanup', params: { planId: 'a'.repeat(48) }, confirm: true } })
})

test('rejects unconfirmed storage cleanup before the child process runs', async t => {
  const { dir, script } = fixture()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  let stdout = ''
  assert.equal(await run(['storage:cleanup', '--json', '{"planId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'], {
    storageOptions: { python: process.execPath, script, userData: path.join(dir, 'profile') },
    stdout: { write: text => { stdout += text } }
  }), 2)
  assert.equal(JSON.parse(stdout).error.code, 'invalid_arguments')
})

test('requires the real producer PID before acquiring a storage lease', async () => {
  let started = false
  await assert.rejects(dispatch('storage:lease', { projectId: 'project', operation: 'acquire' }, {
    script: '/tmp/storage-fixture.py',
    spawnProcess: () => { started = true; throw new Error('child must not start') }
  }), { code: 'INVALID_ARGUMENT' })
  assert.equal(started, false)
})

test('bounds local storage child failures and timeouts', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-storage-child-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const failed = path.join(dir, 'failed.js')
  const stalled = path.join(dir, 'stalled.js')
  fs.writeFileSync(failed, "process.stdout.write(JSON.stringify({ok:true,result:{}}) + '\\n'); process.exit(1)")
  fs.writeFileSync(stalled, 'setTimeout(() => {}, 10000)')
  await assert.rejects(dispatch('storage:list', {}, { python: process.execPath, script: failed }), { code: 'storage_failed' })
  await assert.rejects(dispatch('storage:list', {}, { python: process.execPath, script: stalled, timeout: 20 }), { code: 'timeout' })
})

test('uses the shared storage core from an isolated profile', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-storage-core-'))
  const project = path.join(dir, 'project')
  const cache = path.join(project, '.roadmusic', 'cache', 'render.tmp')
  fs.mkdirSync(path.dirname(cache), { recursive: true })
  fs.writeFileSync(path.join(project, 'studio-project.json'), '{"schemaVersion":1,"media":[]}')
  fs.writeFileSync(cache, 'temporary output')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const storageOptions = { userData: path.join(dir, 'profile'), root: path.resolve(__dirname, '..') }
  const call = async (argv) => {
    let stdout = ''
    assert.equal(await run(argv, { storageOptions, stdout: { write: text => { stdout += text } } }), 0)
    return JSON.parse(stdout).result
  }
  const registered = await call(['storage:register', '--json', JSON.stringify({ project })])
  const lease = await call(['storage:lease', '--json', JSON.stringify({ projectId: registered.id, operation: 'acquire', pid: process.pid })])
  assert.equal(lease.pid, process.pid)
  const released = await call(['storage:lease', '--json', JSON.stringify({ projectId: registered.id, operation: 'release', token: lease.token })])
  assert.equal(released.released, true)
  const entry = await call(['storage:track', '--json', JSON.stringify({ projectId: registered.id, path: '.roadmusic/cache/render.tmp', kind: 'cache', reproducible: true })])
  const listed = await call(['storage:list', '--json', JSON.stringify({ projectId: registered.id })])
  assert.equal(listed.projects[0].entries[0].id, entry.id)
  const preview = await call(['storage:preview', '--json', JSON.stringify({ projectId: registered.id })])
  assert.equal(preview.fileCount, 1)
  const cleanup = await call(['storage:cleanup', '--json', JSON.stringify({ planId: preview.planId }), '--confirm'])
  assert.equal(cleanup.removedFiles, 1)
  assert.equal(fs.existsSync(cache), false)
})

test('adopts a verified legacy picture cache through the public CLI', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-storage-legacy-'))
  const project = path.join(dir, 'project')
  const out = path.join(project, 'out')
  const final = path.join(out, 'native.mp4')
  const picture = path.join(out, 'native-picture.mp4')
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(project, 'production.json'), '{"schemaVersion":1}')
  fs.writeFileSync(path.join(project, 'playlist.json'), '{"schemaVersion":1}')
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000', '-t', '0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', final], { stdio: 'ignore' })
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=10', '-t', '0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', picture], { stdio: 'ignore' })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const storageOptions = { userData: path.join(dir, 'profile'), root: path.resolve(__dirname, '..') }
  const call = async (argv) => {
    let stdout = ''
    assert.equal(await run(argv, { storageOptions, stdout: { write: text => { stdout += text } } }), 0)
    return JSON.parse(stdout).result
  }
  const registered = await call(['storage:register', '--json', JSON.stringify({ project })])
  const legacy = await call(['storage:legacy', '--json', JSON.stringify({ projectId: registered.id })])
  assert.equal(legacy.candidates.length, 1, JSON.stringify(legacy))
  const preview = await call(['storage:adopt-preview', '--json', JSON.stringify({ projectId: registered.id, candidateIds: [legacy.candidates[0].id] })])
  const adopted = await call(['storage:adopt', '--json', JSON.stringify({ planId: preview.planId }), '--confirm'])
  assert.equal(adopted.movedFiles, 1)
  assert.equal(fs.existsSync(final), true)
  assert.equal(fs.existsSync(picture), false)
  const cleanupPreview = await call(['storage:preview', '--json', JSON.stringify({ projectId: registered.id })])
  assert.equal(cleanupPreview.fileCount, 1)
})

test('maintenance stays local, rejects arbitrary roots, and bounds longer execution time', async t => {
  const { parseArgs } = require('../cli/client')
  assert.equal(parseArgs(['storage:maintenance-list']).timeout, 180000)
  assert.equal(parseArgs(['storage:restructure-preview']).timeout, 180000)
  assert.equal(parseArgs(['storage:restructure-cleanup', '--json', `{"planId":"${'a'.repeat(48)}"}`, '--confirm']).timeout, 900000)
  assert.deepEqual(catalog.validate('storage:maintenance-list', {}).paramsValue, {})
  assert.deepEqual(catalog.validate('storage:maintenance-list', { includeRetirement: true }).paramsValue, { includeRetirement: true })
  assert.deepEqual(catalog.validate('storage:maintenance-list', { scope: 'retirement' }).paramsValue, { scope: 'retirement' })
  assert.deepEqual(catalog.validate('storage:maintenance-list', { scope: 'git' }).paramsValue, { scope: 'git' })
  assert.throws(() => catalog.validate('storage:maintenance-list', { includeRetirement: 'true' }), /must be a boolean/)
  assert.equal(parseArgs(['storage:maintenance-cleanup', '--json', '{"planId":"plan"}', '--confirm']).timeout, 900000)
  assert.throws(() => parseArgs(['storage:maintenance-cleanup', '--timeout', '900001']), /--timeout/)
  assert.throws(() => catalog.validate('storage:maintenance-preview', { scope: 'git', root: '/tmp' }), /Unknown parameter/)
  assert.deepEqual(catalog.validate('storage:maintenance-preview', { scanId: 'a'.repeat(48), scope: 'artifacts', candidateIds: ['candidate'] }).paramsValue, { scanId: 'a'.repeat(48), scope: 'artifacts', candidateIds: ['candidate'] })
  assert.deepEqual(catalog.validate('storage:maintenance-preview', { scanId: 'a'.repeat(48), scope: 'retirement', candidateIds: ['candidate'] }).paramsValue, { scanId: 'a'.repeat(48), scope: 'retirement', candidateIds: ['candidate'] })
  assert.throws(() => catalog.validate('storage:maintenance-cleanup', { planId: 'p', confirm: true }), /Unknown parameter/)
  const { dir, script } = fixture(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  let output = ''
  const code = await run(['storage:maintenance-cleanup', '--json', '{"planId":"plan"}', '--confirm'], {
    storageOptions: { python: process.execPath, script, userData: path.join(dir, 'profile') },
    spawnProcess: () => { throw new Error('must not start Electron') }, stdout: { write: value => { output += value } }
  })
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(output).result, { action: 'maintenance-cleanup', params: { planId: 'plan' }, confirm: true })
})


test('MV and bulk cleanup require explicit plans and never accept filesystem paths', async () => {
  for (const command of ['storage:mv-cleanup', 'storage:sweep-cleanup']) {
    assert.equal(catalog.commands[command].destructive, true)
    assert.throws(() => catalog.validate(command, { planId: 'p', root: '/tmp' }), /Unknown parameter/)
    let started = false
    await assert.rejects(dispatch(command, { planId: 'p' }, {
      spawnProcess: () => { started = true; throw new Error('must not start') }
    }), { code: 'invalid_arguments' })
    assert.equal(started, false)
  }
  assert.throws(() => catalog.validate('storage:mv-preview', { projectIds: ['p'] }), /scanId/)
  assert.throws(() => catalog.validate('storage:sweep-preview', { deleteFinals: true }), /Unknown parameter/)
})
