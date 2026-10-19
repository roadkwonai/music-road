#!/usr/bin/env node
'use strict'

// Exercises the packaged macOS rollback path with disposable copies only.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const asar = require('@electron/asar')

const repository = path.resolve(__dirname, '..')
const helper = path.join(repository, 'electron', 'update-installer.js')
const oldVersion = '1.4.0'
const candidateVersion = '9.9.9'
const bundleId = 'dev.roadkwon.roadmusic'
const defaultBaseline = path.join(repository, 'dist', 'update-e2e-baseline', 'Road Music.app')
const proofPath = path.join(repository, 'dist', 'verify-mac-update-rollback.json')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

function option (name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return null
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires an absolute .app path`)
  return value
}

function command (file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGTERM') } catch {}
      setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 500).unref()
    }, options.timeoutMs || 30_000)
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

async function plist (bundle) {
  return JSON.parse(await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(bundle, 'Contents', 'Info.plist')]))
}

async function verifyBundle (bundle, version) {
  const info = await plist(bundle)
  assert.equal(info.CFBundleIdentifier, bundleId)
  assert.equal(info.CFBundleShortVersionString, version)
  assert.equal(info.CFBundleVersion, version)
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
  return info
}

async function waitFor (read, accept, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let value
  while (Date.now() < deadline) {
    value = await read()
    if (accept(value)) return value
    await pause(200)
  }
  throw new Error(`${label}: ${JSON.stringify(value)}`)
}

async function gone (pid, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { process.kill(pid, 0) } catch (error) {
      if (error.code === 'ESRCH') return true
      throw error
    }
    await pause(100)
  }
  return false
}

async function readLines (file) {
  try { return (await fs.readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse) } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function stopOwned(marker) {
  const launches = await readLines(marker)
  for (const { pid } of launches) {
    if (!Number.isSafeInteger(pid) || pid <= 0) continue
    try { process.kill(pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  for (const { pid } of launches) assert.equal(await gone(pid), true, `소유한 재시작 프로세스 ${pid}가 종료되지 않았습니다.`)
}

async function deadOwnedPid () {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  child.kill('SIGTERM')
  await new Promise(resolve => child.once('close', resolve))
  assert.equal(await gone(child.pid), true)
  return child.pid
}

async function writeSentinels (dataDir) {
  await fs.mkdir(path.join(dataDir, 'Songs'), { recursive: true })
  await fs.mkdir(path.join(dataDir, 'models'), { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({ engineSetupSkipped: true, updateSentinel: 'keep-settings' })),
    fs.writeFile(path.join(dataDir, 'Songs', 'preserved.txt'), 'keep-songs'),
    fs.writeFile(path.join(dataDir, 'models', 'preserved.txt'), 'keep-models')
  ])
}

async function assertSentinels (dataDir) {
  assert.equal(JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')).updateSentinel, 'keep-settings')
  assert.equal(await fs.readFile(path.join(dataDir, 'Songs', 'preserved.txt'), 'utf8'), 'keep-songs')
  assert.equal(await fs.readFile(path.join(dataDir, 'models', 'preserved.txt'), 'utf8'), 'keep-models')
}

async function wrapOldExecutable (bundle, marker) {
  const info = await plist(bundle)
  const macos = path.join(bundle, 'Contents', 'MacOS')
  const executable = path.join(macos, info.CFBundleExecutable)
  const native = `${executable}.native`
  await fs.rename(executable, native)
  await fs.writeFile(executable, `#!/bin/sh\nprintf '{"pid":%s,"version":"${oldVersion}"}\\n' "$$" >> "${marker}"\nexec "$(dirname "$0")/${info.CFBundleExecutable}.native" "$@"\n`, { mode: 0o755 })
  await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle])
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
}

async function createCandidate (base, baseline) {
  const source = path.join(base, 'candidate-source')
  const app = path.join(source, 'Road Music.app')
  const contents = path.join(base, 'candidate-asar')
  const dmg = path.join(base, `RoadMusic-${candidateVersion}-mac-${process.arch}.dmg`)
  await run('/usr/bin/ditto', [baseline, app])
  await fs.mkdir(contents)
  await Promise.all([
    fs.writeFile(path.join(contents, 'package.json'), JSON.stringify({ name: 'road-music-rollback-candidate', main: 'main.js' })),
    fs.writeFile(path.join(contents, 'main.js'), `const app = require('electron').app
if (process.env.ROADMUSIC_DATA_DIR) app.setPath('userData', process.env.ROADMUSIC_DATA_DIR)
app.whenReady().then(() => app.exit(71))
`)
  ])
  await asar.createPackage(contents, path.join(app, 'Contents', 'Resources', 'app.asar'))
  assert.equal(JSON.parse((await asar.extractFile(path.join(app, 'Contents', 'Resources', 'app.asar'), 'package.json')).toString()).main, 'main.js')
  const plistPath = path.join(app, 'Contents', 'Info.plist')
  await run('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleShortVersionString ${candidateVersion}`, '-c', `Set :CFBundleVersion ${candidateVersion}`, '-c', 'Delete :ElectronAsarIntegrity', plistPath])
  await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app])
  await verifyBundle(app, candidateVersion)
  await run('/usr/bin/hdiutil', ['create', '-volname', 'Road Music candidate', '-srcfolder', source, '-ov', '-format', 'UDZO', dmg], { timeoutMs: 120_000 })
  await run('/usr/bin/hdiutil', ['verify', dmg], { timeoutMs: 120_000 })
  return dmg
}

async function wrongBundleCase (base, baseline) {
  const source = path.join(base, 'wrong-source')
  const candidate = path.join(source, 'Road Music.app')
  const installed = path.join(base, 'wrong-installed', 'Road Music.app')
  const dataDir = path.join(base, 'wrong-data')
  const marker = path.join(base, 'wrong-old-launches.jsonl')
  const dmg = path.join(base, `RoadMusic-${candidateVersion}-wrong-id-${process.arch}.dmg`)
  await fs.mkdir(path.dirname(installed), { recursive: true })
  await Promise.all([run('/usr/bin/ditto', [baseline, candidate]), run('/usr/bin/ditto', [baseline, installed])])
  await writeSentinels(dataDir)
  await wrapOldExecutable(installed, marker)
  const plistPath = path.join(candidate, 'Contents', 'Info.plist')
  await run('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleShortVersionString ${candidateVersion}`, '-c', `Set :CFBundleVersion ${candidateVersion}`, '-c', 'Set :CFBundleIdentifier dev.roadkwon.roadmusic.wrong', plistPath])
  await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', candidate])
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', candidate])
  await run('/usr/bin/hdiutil', ['create', '-volname', 'Road Music wrong identifier', '-srcfolder', source, '-ov', '-format', 'UDZO', dmg], { timeoutMs: 120_000 })
  await run('/usr/bin/hdiutil', ['verify', dmg], { timeoutMs: 120_000 })
  try {
    const result = await command(process.execPath, [helper, JSON.stringify({
      mode: 'mac-app', pid: await deadOwnedPid(), version: candidateVersion, dmg,
      bundle: await fs.realpath(installed), userData: dataDir, dataDir, service: true
    })], { env: { ...process.env, ROADMUSIC_DATA_DIR: dataDir }, timeoutMs: 180_000 })
    assert.notEqual(result.code, 0, '식별자가 다른 번들은 설치 성공으로 끝날 수 없습니다.')
    const durable = JSON.parse(await fs.readFile(path.join(dataDir, 'updates', 'installer-result.json'), 'utf8'))
    assert.equal(durable.ok, false)
    assert.match(durable.error, /식별자 또는 버전/)
    await verifyBundle(installed, oldVersion)
    const launches = await readLines(marker)
    assert.equal(launches.length, 1, '거부된 후보 뒤 이전 앱은 한 번만 재시작해야 합니다.')
    await assertSentinels(dataDir)
    return { durable, installedVersion: (await plist(installed)).CFBundleShortVersionString, oldLaunches: launches.length }
  } finally {
    await stopOwned(marker)
  }
}

async function main () {
  assert.equal(process.platform, 'darwin', 'macOS에서만 실행할 수 있습니다.')
  const requested = option('--baseline-app') || defaultBaseline
  assert.ok(path.isAbsolute(requested), '--baseline-app must be absolute')
  const baseline = await fs.realpath(requested)
  const proof = { baseline, oldVersion, candidateVersion, helper, startedAt: new Date().toISOString() }
  let root
  let marker
  let dataDir
  try {
    await verifyBundle(baseline, oldVersion)
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'road-music-mac-rollback-')))
    const installed = path.join(root, 'installed', 'Road Music.app')
    dataDir = path.join(root, 'data')
    marker = path.join(root, 'old-launches.jsonl')
    await fs.mkdir(path.dirname(installed), { recursive: true })
    await run('/usr/bin/ditto', [baseline, installed])
    await writeSentinels(dataDir)
    await wrapOldExecutable(installed, marker)
    const dmg = await createCandidate(root, baseline)
    const pid = await deadOwnedPid()
    const payload = { mode: 'mac-app', pid, version: candidateVersion, dmg, bundle: await fs.realpath(installed), userData: dataDir, dataDir, service: true }
    const helperResult = await command(process.execPath, [helper, JSON.stringify(payload)], {
      env: { ...process.env, ROADMUSIC_DATA_DIR: dataDir }, timeoutMs: 180_000
    })
    assert.notEqual(helperResult.code, 0, '즉시 종료 후보 앱은 설치 성공으로 끝날 수 없습니다.')
    const durable = JSON.parse(await fs.readFile(path.join(dataDir, 'updates', 'installer-result.json'), 'utf8'))
    assert.equal(durable.ok, false)
    assert.equal(durable.version, candidateVersion)
    assert.match(durable.error, /바로 종료/)
    await verifyBundle(installed, oldVersion)
    const cli = async (name, optional = false) => {
      const result = await command(process.execPath, [path.join(repository, 'cli', 'road-music.js'), name, '--no-start', '--timeout', '30000'], {
        env: { ...process.env, ROADMUSIC_DATA_DIR: dataDir }, cwd: repository, timeoutMs: 35_000
      })
      const rows = result.stdout.trim().split('\n').filter(Boolean)
      assert.equal(rows.length, 1, `${name} stdout must be exactly one JSON line`)
      const row = JSON.parse(rows[0])
      if (row.ok) return row.result
      if (optional && row.error?.code === 'connection') return null
      throw new Error(`${name}: ${rows[0]} ${result.stderr}`)
    }
    const state = await waitFor(() => cli('app:state', true), Boolean, 45_000, '롤백된 네이티브 앱 서비스')
    assert.equal(state.version, oldVersion)
    const [engines, projects, songs] = await Promise.all([cli('engines:list'), cli('projects:list'), cli('songs:list')])
    await assertSentinels(dataDir)
    const launches = await readLines(marker)
    assert.equal(launches.length, 1, '이전 앱은 한 번만 재시작해야 합니다.')
    assert.equal(launches[0].version, oldVersion)
    proof.rollback = { durable, helperExit: helperResult.code, installedVersion: (await plist(installed)).CFBundleShortVersionString, oldLaunches: launches.length }
    proof.cli = { appVersion: state.version, engines: Array.isArray(engines) ? engines.length : null, projects: projects.current || null, songs: Array.isArray(songs) ? songs.length : null }
    proof.sentinels = ['settings', 'songs', 'models']
    proof.wrongBundle = await wrongBundleCase(root, baseline)
    proof.ok = true
  } finally {
    if (marker) await stopOwned(marker).catch(error => { proof.cleanupError = error.message })
    if (root) await fs.rm(root, { recursive: true, force: true })
    proof.finishedAt = new Date().toISOString()
    await fs.mkdir(path.dirname(proofPath), { recursive: true })
    await fs.writeFile(proofPath, JSON.stringify(proof, null, 2))
  }
  console.log(JSON.stringify(proof))
}

if (require.main === module) main().catch(async error => {
  const result = { ok: false, error: error.stack || error.message, finishedAt: new Date().toISOString() }
  await fs.mkdir(path.dirname(proofPath), { recursive: true })
  await fs.writeFile(proofPath, JSON.stringify(result, null, 2)).catch(() => {})
  console.error(result.error)
  process.exitCode = 1
})
