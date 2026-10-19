'use strict'

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const net = require('net')
const crypto = require('crypto')
const os = require('os')
const { spawn } = require('child_process')

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const BUNDLE_ID = 'dev.roadkwon.roadmusic'
const ORIGINS = new Set([
  'https://github.com/roadkwonai/music-road.git',
  'https://github.com/roadkwonai/music-road',
  'git@github.com:roadkwonai/music-road.git'
])

const safeVersion = value => VERSION.test(String(value || ''))
const isRoadMusicBundle = (info, version) => info?.CFBundleIdentifier === BUNDLE_ID && info?.CFBundleShortVersionString === version && safeVersion(version)

function commandTimeout (file, args) {
  if (path.basename(file) === 'npm') return 15 * 60_000
  if (path.basename(file) === 'git' && args.includes('fetch')) return 2 * 60_000
  if (['hdiutil', 'ditto', 'codesign'].includes(path.basename(file))) return 2 * 60_000
  return 30_000
}

function run (file, args, options = {}) {
  const { timeoutMs: requestedTimeout, maxOutputBytes, ...spawnOptions } = options
  if (maxOutputBytes !== undefined && (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1)) {
    return Promise.reject(new Error('maxOutputBytes는 양의 안전한 정수여야 합니다.'))
  }
  return new Promise((resolve, reject) => {
    const timeoutMs = requestedTimeout || commandTimeout(file, args)
    const child = spawn(file, args, { ...spawnOptions, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; let err = ''
    let timedOut = false
    let outputExceeded = false
    let outputBytes = 0
    let settled = false
    let grace = null
    let force = null
    const append = (previous, data) => `${previous}${data}`.slice(-64 * 1024)
    const terminate = (signal) => {
      if (process.platform !== 'win32') { try { process.kill(-child.pid, signal) } catch {} }
      try { child.kill(signal) } catch {}
    }
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(stop)
      if (grace) clearTimeout(grace)
      if (force) clearTimeout(force)
      if (error) reject(error)
      else resolve(value)
    }
    const stop = setTimeout(() => {
      timedOut = true
      terminate('SIGTERM')
      grace = setTimeout(() => {
        terminate('SIGKILL')
        force = setTimeout(() => finish(new Error(`${path.basename(file)} 실행 시간이 초과되었습니다.`)), 250)
      }, 1000)
    }, timeoutMs)
    const outputLimitError = () => new Error(`${path.basename(file)} stdout이 ${maxOutputBytes} 바이트 한도를 초과했습니다.`)
    const stopForOutputLimit = () => {
      if (outputExceeded || timedOut || settled) return
      outputExceeded = true
      clearTimeout(stop)
      terminate('SIGTERM')
      grace = setTimeout(() => {
        terminate('SIGKILL')
        force = setTimeout(() => finish(outputLimitError()), 250)
      }, 1000)
    }
    child.stdout.on('data', data => {
      if (maxOutputBytes === undefined) {
        out = append(out, data)
        return
      }
      if (outputExceeded) return
      outputBytes += Buffer.byteLength(data)
      if (outputBytes > maxOutputBytes) return stopForOutputLimit()
      out += data
    })
    child.stderr.on('data', data => { err = append(err, data) })
    child.on('error', error => finish(error))
    child.on('close', code => {
      if (timedOut) return finish(new Error(`${path.basename(file)} 실행 시간이 초과되었습니다.`))
      if (outputExceeded) return finish(outputLimitError())
      return code === 0 ? finish(null, out.trim()) : finish(new Error(`${path.basename(file)} exited ${code}: ${err.slice(-1000) || out.slice(-1000)}`))
    })
  })
}

function appReady (userData, pid, version) {
  const key = crypto.createHash('sha256').update(path.resolve(userData)).digest('hex').slice(0, 16)
  const endpoint = path.join(os.tmpdir(), `road-music-${key}.sock`)
  const id = crypto.randomBytes(8).toString('hex')
  return new Promise(resolve => {
    const socket = net.createConnection(endpoint)
    socket.setEncoding('utf8')
    let pending = ''
    let settled = false
    const finish = ready => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(ready)
    }
    const timer = setTimeout(() => finish(false), 1000)
    socket.once('connect', () => socket.write(JSON.stringify({ id, command: 'cli:status', params: {} }) + '\n'))
    socket.on('data', chunk => {
      pending += chunk
      if (Buffer.byteLength(pending) > 16 * 1024 * 1024) return finish(false)
      let end
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1)
        if (!line) continue
        let message
        try { message = JSON.parse(line) } catch { return finish(false) }
        if (message.id !== id) continue
        finish(message.result?.pid === pid && message.result?.update?.current === version)
      }
    })
    socket.once('error', () => finish(false))
    socket.once('end', () => finish(false))
    socket.once('close', () => finish(false))
  })
}

function stopLaunchedChild (child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise(resolve => {
    let killTimer
    let finalTimer
    const finish = stopped => { clearTimeout(killTimer); clearTimeout(finalTimer); child.removeListener('exit', exited); resolve(stopped) }
    const exited = () => finish(true)
    const signal = value => {
      try { process.kill(-child.pid, value) } catch { try { child.kill(value) } catch {} }
    }
    child.once('exit', exited)
    signal('SIGTERM')
    killTimer = setTimeout(() => signal('SIGKILL'), 1000)
    finalTimer = setTimeout(() => finish(false), 3000)
  })
}

function launch (file, args, options, readiness) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { ...options, detached: true, stdio: 'ignore' })
    let settled = false
    let pollTimer = null
    let healthySince = null
    const finish = async (error) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      clearTimeout(pollTimer)
      if (error) {
        if (!(await stopLaunchedChild(child))) error.unsafeToRollback = true
        child.unref()
        reject(error)
      } else { child.unref(); resolve({ pid: child.pid, appReady: true }) }
    }
    const deadline = setTimeout(() => finish(new Error('새 앱의 준비 완료 응답 시간이 초과되었습니다.')), 45000)
    child.once('error', finish)
    child.once('exit', (code, signal) => finish(new Error(`재시작한 앱이 바로 종료되었습니다 (${signal || code}).`)))
    child.once('spawn', () => {
      const poll = async () => {
        if (settled) return
        const ready = await appReady(readiness.userData, child.pid, readiness.version)
        if (settled) return
        healthySince = ready ? (healthySince || Date.now()) : null
        if (healthySince && Date.now() - healthySince >= 1500) return finish()
        pollTimer = setTimeout(() => poll().catch(finish), 200)
      }
      poll().catch(finish)
    })
  })
}

async function waitForExit (pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('업데이트 대상 프로세스 ID가 올바르지 않습니다.')
  const deadline = Date.now() + 2 * 60_000
  while (true) {
    try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 250)) } catch (error) {
      if (error.code === 'ESRCH') return
      throw error
    }
    if (Date.now() > deadline) throw new Error('기존 앱 종료 대기 시간이 초과되었습니다.')
  }
}

function resultPath (payload) { return path.join(payload.userData, 'updates', 'installer-result.json') }
async function record (payload, result) {
  await fsp.mkdir(path.dirname(resultPath(payload)), { recursive: true, mode: 0o700 })
  await fsp.writeFile(resultPath(payload), JSON.stringify({ ...result, at: new Date().toISOString() }), { mode: 0o600 })
}

function launchEnvironment (payload) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  if (payload.dataDir) env.ROADMUSIC_DATA_DIR = payload.dataDir
  return env
}

async function installMac (payload) {
  if (!payload.bundle || !path.isAbsolute(payload.bundle) || payload.bundle.startsWith('/Volumes/')) throw new Error('앱이 /Applications 같은 쓰기 가능한 위치에 있어야 합니다.')
  const plist = await run('/usr/bin/hdiutil', ['attach', payload.dmg, '-nobrowse', '-readonly', '-plist'])
  const mount = (plist.match(/<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/) || [])[1]
  if (!mount) throw new Error('DMG 마운트 위치를 읽지 못했습니다.')
  try {
    const app = (await fsp.readdir(mount)).find(name => name.endsWith('.app'))
    if (!app) throw new Error('DMG에 앱 번들이 없습니다.')
    const source = path.join(mount, app)
    const info = JSON.parse(await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(source, 'Contents', 'Info.plist')]))
    if (!isRoadMusicBundle(info, payload.version)) throw new Error('다운로드한 앱의 식별자 또는 버전이 일치하지 않습니다.')
    if (!info.CFBundleExecutable || path.basename(info.CFBundleExecutable) !== info.CFBundleExecutable) throw new Error('앱 실행 파일 정보가 올바르지 않습니다.')
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', source])

    const parent = path.dirname(payload.bundle)
    const stage = path.join(parent, `.${path.basename(payload.bundle)}.${process.pid}.new`)
    const backup = path.join(parent, `.${path.basename(payload.bundle)}.${Date.now()}.backup`)
    await fsp.rm(stage, { recursive: true, force: true })
    await run('/usr/bin/ditto', [source, stage])
    try {
      await fsp.rename(payload.bundle, backup)
      await fsp.rename(stage, payload.bundle)
    } catch (error) {
      if (!fs.existsSync(payload.bundle) && fs.existsSync(backup)) await fsp.rename(backup, payload.bundle)
      throw error
    }
    try {
      const launched = await launch(path.join(payload.bundle, 'Contents', 'MacOS', info.CFBundleExecutable), payload.service ? ['--roadmusic-service'] : [], { env: launchEnvironment(payload) }, { userData: payload.userData, version: payload.version })
      return { backup, ...launched }
    } catch (error) {
      if (error.unsafeToRollback) throw error
      await fsp.rm(payload.bundle, { recursive: true, force: true })
      await fsp.rename(backup, payload.bundle)
      throw error
    }
  } finally {
    await run('/usr/bin/hdiutil', ['detach', mount]).catch(() => {})
  }
}

function git (root, args) { return run('/usr/bin/git', ['-C', root, ...args]) }
async function cleanAt (root, expected) {
  if ((await git(root, ['rev-parse', 'HEAD'])) !== expected) return false
  return !(await git(root, ['status', '--porcelain', '--untracked-files=all']))
}

async function swapDependencies (root, stage) {
  const live = path.join(root, 'node_modules')
  const prepared = path.join(stage, 'node_modules')
  const backup = path.join(path.dirname(root), `.${path.basename(root)}.node_modules.before-update-${process.pid}`)
  if (!fs.existsSync(prepared)) throw new Error('준비한 의존성 폴더가 없습니다.')
  if (fs.existsSync(live)) await fsp.rename(live, backup)
  try { await fsp.rename(prepared, live) } catch (error) {
    if (!fs.existsSync(live) && fs.existsSync(backup)) await fsp.rename(backup, live)
    throw error
  }
  return backup
}

async function restoreSource (root, old, commit, depsBackup) {
  if (!(await cleanAt(root, commit))) return false
  await git(root, ['reset', '--merge', old])
  const live = path.join(root, 'node_modules')
  if (depsBackup && fs.existsSync(depsBackup)) {
    await fsp.rm(live, { recursive: true, force: true })
    await fsp.rename(depsBackup, live)
  }
  return true
}

async function installSource (payload) {
  const root = payload.root
  if (!root || !fs.existsSync(path.join(root, '.git'))) throw new Error('Git 체크아웃에서만 소스 업데이트를 지원합니다. 최신 저장소를 다시 복제하세요.')
  if (!ORIGINS.has((await git(root, ['remote', 'get-url', 'origin'])).trim())) throw new Error('공식 GitHub origin에서만 자동 업데이트할 수 있습니다.')
  if (await git(root, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('변경되거나 추적되지 않은 파일이 있어 소스 업데이트를 중단했습니다.')

  const ref = `refs/roadmusic-update/v${payload.version}`
  await git(root, ['fetch', '--no-tags', 'origin', `refs/tags/v${payload.version}:${ref}`])
  const commit = await git(root, ['rev-parse', `${ref}^{commit}`])
  const old = await git(root, ['rev-parse', 'HEAD'])
  await git(root, ['merge-base', '--is-ancestor', old, commit])
  if (JSON.parse(await git(root, ['show', `${commit}:package.json`])).version !== payload.version) throw new Error('릴리스 태그와 package.json 버전이 다릅니다.')

  const stage = path.join(path.dirname(root), `.${path.basename(root)}.update-${process.pid}`)
  let depsBackup = null
  let launched
  try {
    await git(root, ['worktree', 'add', '--detach', stage, commit])
    await run('npm', ['ci', '--include=dev'], { cwd: stage })
    if (!(await cleanAt(root, old))) throw new Error('준비 중 작업 폴더가 변경되어 업데이트를 취소했습니다.')
    await git(root, ['merge', '--ff-only', commit])
    try {
      depsBackup = await swapDependencies(root, stage)
      launched = await launch(payload.execPath, payload.service ? ['.', '--roadmusic-service'] : ['.'], { cwd: root, env: launchEnvironment(payload) }, { userData: payload.userData, version: payload.version })
    } catch (error) {
      if (error.unsafeToRollback) throw error
      if (!(await restoreSource(root, old, commit, depsBackup))) throw new Error(`${error.message} (새 변경이 있어 자동 복구하지 않았습니다.)`)
      throw error
    }
    if (depsBackup) await fsp.rm(depsBackup, { recursive: true, force: true })
    return launched
  } finally {
    await git(root, ['worktree', 'remove', '--force', stage]).catch(() => {})
  }
}

async function main (payload) {
  await waitForExit(Number(payload.pid))
  if (!safeVersion(payload.version)) throw new Error('잘못된 업데이트 버전입니다.')
  if (payload.mode === 'mac-app') return installMac(payload)
  if (payload.mode === 'source') return installSource(payload)
  throw new Error('이 설치 방식은 자동 업데이트를 지원하지 않습니다.')
}

async function restartExisting (payload) {
  const args = payload.service ? ['.', '--roadmusic-service'] : ['.']
  if (payload.mode === 'source' && payload.root && payload.execPath) {
    const version = JSON.parse(await fsp.readFile(path.join(payload.root, 'package.json'), 'utf8')).version
    return launch(payload.execPath, args, { cwd: payload.root, env: launchEnvironment(payload) }, { userData: payload.userData, version })
  }
  if (payload.mode !== 'mac-app' || !payload.bundle) return
  const plist = path.join(payload.bundle, 'Contents', 'Info.plist')
  const info = JSON.parse(await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist]))
  if (!info.CFBundleExecutable || path.basename(info.CFBundleExecutable) !== info.CFBundleExecutable) throw new Error('기존 앱 실행 파일 정보가 올바르지 않습니다.')
  return launch(path.join(payload.bundle, 'Contents', 'MacOS', info.CFBundleExecutable), payload.service ? ['--roadmusic-service'] : [], { env: launchEnvironment(payload) }, { userData: payload.userData, version: info.CFBundleShortVersionString })
}

if (require.main === module) {
  let payload
  try { payload = JSON.parse(process.argv[2] || '{}') } catch { process.exitCode = 1 }
  if (payload) main(payload).then(result => record(payload, { ok: true, version: payload.version, ...result })).catch(async error => {
    let recoveryError = null
    if (!error.unsafeToRollback) {
      try { await restartExisting(payload) } catch (failure) { recoveryError = String(failure.message || failure) }
    }
    await record(payload, { ok: false, version: payload.version, error: String(error.message || error), recoveryError,
      manualRecovery: Boolean(error.unsafeToRollback || recoveryError) }).catch(() => {})
    process.exitCode = 1
  })
}

module.exports = { safeVersion, isRoadMusicBundle, run, main }
