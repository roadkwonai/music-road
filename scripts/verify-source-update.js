#!/usr/bin/env node
'use strict'

// Exercises source updates through an isolated local annotated-tag fixture.
// It never creates, changes, or relies on a public release tag or Git history.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const helper = path.resolve(__dirname, '../electron/update-installer.js')
const oldVersion = '0.1.0'
const newVersion = '0.1.1'
const updateRef = `refs/roadmusic-update/v${newVersion}`
const commandTimeout = 120_000
const installerTimeout = 16 * 60_000

function command (file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGTERM') } catch {}
      setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 500).unref()
    }, options.timeoutMs || commandTimeout)
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => {
      clearTimeout(timer)
      if (timedOut) return reject(new Error(`${path.basename(file)} 실행 시간이 초과되었습니다.`))
      resolve({ code, stdout, stderr })
    })
  })
}

async function run (file, args, options) {
  const result = await command(file, args, options)
  assert.equal(result.code, 0, `${file} ${args.join(' ')}\n${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

function git (root, args) { return run('/usr/bin/git', ['-C', root, ...args]) }
function pause (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function processGone (pid, limit = 5_000) {
  const deadline = Date.now() + limit
  while (Date.now() < deadline) {
    try { process.kill(pid, 0) } catch (error) { if (error.code === 'ESRCH') return true; throw error }
    await pause(50)
  }
  return false
}

async function stopLaunched (marker) {
  let launches = []
  try { launches = (await fs.readFile(marker, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse) } catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const { pid } of launches) {
    if (!Number.isSafeInteger(pid) || pid <= 0) continue
    try { process.kill(pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  for (const { pid } of launches) assert.equal(await processGone(pid), true, `재시작 프로세스 ${pid}가 종료되지 않았습니다.`)
  return launches
}

async function writeLauncher (base) {
  const launcher = path.join(base, 'external-launcher.js')
  await fs.writeFile(launcher, `#!/usr/bin/env node
'use strict'
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const root = path.resolve(process.cwd(), process.argv[2] || '.')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const marker = process.env.SOURCE_UPDATE_MARKER
if (marker) fs.appendFileSync(marker, JSON.stringify({ pid: process.pid, version, root, dataDir: process.env.ROADMUSIC_DATA_DIR || null }) + '\\n')
if (process.env.SOURCE_UPDATE_FAIL_VERSION === version) process.exit(71)
const dataDir = path.resolve(process.env.ROADMUSIC_DATA_DIR || '')
const endpoint = path.join(os.tmpdir(), 'road-music-' + crypto.createHash('sha256').update(dataDir).digest('hex').slice(0, 16) + '.sock')
try { fs.unlinkSync(endpoint) } catch (error) { if (error.code !== 'ENOENT') throw error }
const server = net.createServer(socket => {
  let pending = ''
  socket.setEncoding('utf8')
  socket.on('data', chunk => {
    pending += chunk
    let end
    while ((end = pending.indexOf('\\n')) !== -1) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1)
      if (!line) continue
      const request = JSON.parse(line)
      socket.write(JSON.stringify({ id: request.id, result: { pid: process.pid, update: { current: version } } }) + '\\n')
    }
  })
})
function stop () {
  server.close(() => { try { fs.unlinkSync(endpoint) } catch (error) { if (error.code !== 'ENOENT') process.exitCode = 1 } })
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
server.listen(endpoint)
`)
  await fs.chmod(launcher, 0o700)
  return launcher
}

async function writeFixtureHelper (base, origin) {
  const fixture = path.join(base, 'update-installer-fixture.js')
  const source = await fs.readFile(helper, 'utf8')
  const patched = source.replace(
    /const ORIGINS = new Set\(\[[\s\S]*?\]\)\n/,
    `const ORIGINS = new Set([${JSON.stringify(origin)}])\n`
  )
  assert.notEqual(patched, source, '검증용 helper에서 로컬 원격 저장소를 허용하지 못했습니다.')
  await fs.writeFile(fixture, patched, { mode: 0o700 })
  return fixture
}

async function writeGitFixture (base) {
  const origin = path.join(base, 'source-origin.git')
  const seed = path.join(base, 'source-seed')
  const manifest = JSON.parse(await fs.readFile(path.resolve(__dirname, '../package.json'), 'utf8'))
  const lock = JSON.parse(await fs.readFile(path.resolve(__dirname, '../package-lock.json'), 'utf8'))
  manifest.version = oldVersion
  lock.version = oldVersion
  lock.packages[''].version = oldVersion

  await run('/usr/bin/git', ['init', '--bare', '-b', 'main', origin])
  await run('/usr/bin/git', ['init', '-b', 'main', seed])
  await git(seed, ['config', 'user.name', 'Road Music source update fixture'])
  await git(seed, ['config', 'user.email', 'fixture@invalid'])
  await fs.writeFile(path.join(seed, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await fs.writeFile(path.join(seed, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
  await fs.writeFile(path.join(seed, '.gitignore'), 'node_modules/\n')
  await fs.writeFile(path.join(seed, 'README.md'), 'Isolated source update fixture.\n')
  await git(seed, ['add', '.gitignore', 'package.json', 'package-lock.json', 'README.md'])
  await git(seed, ['commit', '-m', `fixture v${oldVersion}`])
  const oldReleaseCommit = await git(seed, ['rev-parse', 'HEAD'])

  manifest.version = newVersion
  lock.version = newVersion
  lock.packages[''].version = newVersion
  await fs.writeFile(path.join(seed, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await fs.writeFile(path.join(seed, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
  await fs.appendFile(path.join(seed, 'README.md'), `Fixture release ${newVersion}.\n`)
  await git(seed, ['add', 'package.json', 'package-lock.json', 'README.md'])
  await git(seed, ['commit', '-m', `fixture v${newVersion}`])
  const newReleaseCommit = await git(seed, ['rev-parse', 'HEAD'])
  await git(seed, ['tag', '-a', `v${newVersion}`, '-m', `fixture v${newVersion}`])
  await git(seed, ['remote', 'add', 'origin', origin])
  await git(seed, ['push', '--follow-tags', 'origin', 'main'])
  return { origin, oldReleaseCommit, newReleaseCommit }
}

async function cloneRelease (base, name, fixture) {
  const root = path.join(base, name)
  await run('/usr/bin/git', ['clone', '--no-checkout', '--single-branch', fixture.origin, root])
  await git(root, ['checkout', '--detach', fixture.oldReleaseCommit])
  assert.equal(await git(root, ['remote', 'get-url', 'origin']), fixture.origin)
  assert.equal(await git(root, ['rev-parse', 'HEAD']), fixture.oldReleaseCommit)
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version, oldVersion)
  await fs.mkdir(path.join(root, 'node_modules'), { recursive: true })
  await fs.writeFile(path.join(root, 'node_modules', 'old-dependency-sentinel'), 'old dependencies')
  assert.equal(await git(root, ['status', '--porcelain', '--untracked-files=all']), '')
  return root
}

async function prepareData (base, name) {
  const dataDir = path.join(base, `${name}-data`)
  await fs.mkdir(path.join(dataDir, 'songs'), { recursive: true })
  await fs.mkdir(path.join(dataDir, 'models'), { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(dataDir, 'settings.json'), 'settings-sentinel'),
    fs.writeFile(path.join(dataDir, 'songs', 'song.txt'), 'song-sentinel'),
    fs.writeFile(path.join(dataDir, 'models', 'model.bin'), 'model-sentinel')
  ])
  return dataDir
}

async function assertSentinels (dataDir) {
  assert.equal(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8'), 'settings-sentinel')
  assert.equal(await fs.readFile(path.join(dataDir, 'songs', 'song.txt'), 'utf8'), 'song-sentinel')
  assert.equal(await fs.readFile(path.join(dataDir, 'models', 'model.bin'), 'utf8'), 'model-sentinel')
}

async function assertNoResidue (base, root) {
  const entries = await fs.readdir(base)
  const prefix = `.${path.basename(root)}.`
  assert.equal(entries.some(name => name.startsWith(prefix) && (name.includes('.update-') || name.includes('.node_modules.before-update-'))), false, 'staging 또는 의존성 백업이 남았습니다.')
}

async function installer (fixtureHelper, root, dataDir, launcher, marker, extraEnv = {}) {
  const waiting = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  await new Promise((resolve, reject) => { waiting.once('spawn', resolve); waiting.once('error', reject) })
  waiting.kill('SIGTERM')
  await new Promise(resolve => waiting.once('close', resolve))
  const payload = { mode: 'source', pid: waiting.pid, version: newVersion, root, userData: dataDir, execPath: launcher }
  const result = await command(process.execPath, [fixtureHelper, JSON.stringify(payload)], {
    env: { ...process.env, ...extraEnv, ROADMUSIC_DATA_DIR: dataDir, SOURCE_UPDATE_MARKER: marker }, timeoutMs: installerTimeout
  })
  const durable = JSON.parse(await fs.readFile(path.join(dataDir, 'updates', 'installer-result.json'), 'utf8'))
  return { ...result, durable }
}

async function successCase (base, fixtureHelper, fixture, launcher) {
  const root = await cloneRelease(base, 'success-source', fixture)
  const dataDir = await prepareData(base, 'success')
  const marker = path.join(base, 'success-launches.jsonl')
  try {
    const result = await installer(fixtureHelper, root, dataDir, launcher, marker)
    assert.equal(result.code, 0, `${result.stderr}\n${JSON.stringify(result.durable)}`)
    assert.equal(result.durable.ok, true)
    assert.equal(result.durable.version, newVersion)
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version, newVersion)
    assert.equal(await git(root, ['rev-parse', 'HEAD']), fixture.newReleaseCommit)
    assert.equal(await git(root, ['cat-file', '-t', updateRef]), 'tag')
    assert.equal(await git(root, ['cat-file', '-t', `refs/tags/v${newVersion}`]), 'tag')
    assert.equal(await git(root, ['rev-parse', `${updateRef}^{commit}`]), fixture.newReleaseCommit)
    await fs.access(path.join(root, 'node_modules', 'electron', 'package.json'))
    await assert.rejects(fs.access(path.join(root, 'node_modules', 'old-dependency-sentinel')))
    assert.equal(await git(root, ['status', '--porcelain', '--untracked-files=all']), '')
    await assertSentinels(dataDir)
    const launches = await stopLaunched(marker)
    assert.equal(launches.length, 1)
    assert.deepEqual(launches[0], { pid: launches[0].pid, version: newVersion, root, dataDir })
    await assertNoResidue(base, root)
  } finally { await stopLaunched(marker) }
  return '격리 Git fast-forward·실제 npm ci·의존성 교체·재시작·데이터 보존'
}

async function rejectedCase (base, fixtureHelper, fixture, launcher, name, prepare, expected) {
  const root = await cloneRelease(base, `${name}-source`, fixture)
  const dataDir = await prepareData(base, name)
  const marker = path.join(base, `${name}-launches.jsonl`)
  await prepare(root)
  const oldHead = await git(root, ['rev-parse', 'HEAD'])
  try {
    const result = await installer(fixtureHelper, root, dataDir, launcher, marker)
    assert.notEqual(result.code, 0)
    assert.equal(result.durable.ok, false)
    assert.match(result.durable.error, expected)
    assert.equal(await git(root, ['rev-parse', 'HEAD']), oldHead)
    assert.equal(await fs.readFile(path.join(root, 'node_modules', 'old-dependency-sentinel'), 'utf8'), 'old dependencies')
    await assertSentinels(dataDir)
    await assertNoResidue(base, root)
  } finally { await stopLaunched(marker) }
}

async function rollbackCase (base, fixtureHelper, fixture, launcher) {
  const root = await cloneRelease(base, 'rollback-source', fixture)
  const dataDir = await prepareData(base, 'rollback')
  const marker = path.join(base, 'rollback-launches.jsonl')
  const oldHead = await git(root, ['rev-parse', 'HEAD'])
  try {
    const result = await installer(fixtureHelper, root, dataDir, launcher, marker, { SOURCE_UPDATE_FAIL_VERSION: newVersion })
    assert.notEqual(result.code, 0)
    assert.equal(result.durable.ok, false)
    assert.match(result.durable.error, /바로 종료/)
    assert.equal(await git(root, ['rev-parse', 'HEAD']), oldHead)
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version, oldVersion)
    assert.equal(await fs.readFile(path.join(root, 'node_modules', 'old-dependency-sentinel'), 'utf8'), 'old dependencies')
    await assertSentinels(dataDir)
    const launches = await stopLaunched(marker)
    assert.ok(launches.some(entry => entry.version === newVersion), '새 버전 시작 시도가 없습니다.')
    assert.ok(launches.some(entry => entry.version === oldVersion), '이전 버전 재시작이 없습니다.')
    assert.equal(launches.filter(entry => entry.version === oldVersion).length, 1, '이전 버전은 한 번만 재시작해야 합니다.')
    await assertNoResidue(base, root)
  } finally { await stopLaunched(marker) }
  return '새 버전 기동 실패 시 HEAD·node_modules 롤백과 이전 버전 재시작'
}

async function main () {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-source-update-')))
  try {
    const launcher = await writeLauncher(base)
    const fixture = await writeGitFixture(base)
    const fixtureHelper = await writeFixtureHelper(base, fixture.origin)
    const checks = [await successCase(base, fixtureHelper, fixture, launcher)]
    await rejectedCase(base, fixtureHelper, fixture, launcher, 'dirty', async root => { await fs.appendFile(path.join(root, 'README.md'), '\nsource update dirty sentinel\n') }, /변경되거나 추적되지 않은 파일/)
    checks.push('dirty 작업 트리 거부')
    await rejectedCase(base, fixtureHelper, fixture, launcher, 'diverged', async root => {
      await git(root, ['config', 'user.email', 'verify@example.test']); await git(root, ['config', 'user.name', 'source update verifier'])
      await fs.writeFile(path.join(root, 'local-divergence.txt'), 'local divergence\n')
      await git(root, ['add', 'local-divergence.txt']); await git(root, ['commit', '-m', 'local divergence'])
    }, /exited 1/)
    checks.push('diverged HEAD 거부')
    checks.push(await rollbackCase(base, fixtureHelper, fixture, launcher))
    process.stdout.write(`${JSON.stringify({ ok: true, checks })}\n`)
  } finally {
    await fs.rm(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

main().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1 })
