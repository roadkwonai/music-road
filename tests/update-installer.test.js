'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { safeVersion, isRoadMusicBundle, run } = require('../electron/update-installer')

test('설치 도우미는 엄격한 버전과 Road Music 번들 식별자만 허용한다', () => {
  assert.equal(safeVersion('1.3.2'), true)
  assert.equal(safeVersion('1.3.2-beta'), false)
  assert.equal(isRoadMusicBundle({ CFBundleIdentifier: 'dev.roadkwon.roadmusic', CFBundleShortVersionString: '1.3.2' }, '1.3.2'), true)
  assert.equal(isRoadMusicBundle({ CFBundleIdentifier: 'other.app', CFBundleShortVersionString: '1.3.2' }, '1.3.2'), false)
})

test('설치 도우미 명령은 제한 시간을 넘기면 종료한다', async () => {
  await assert.rejects(
    run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 30 }),
    /시간이 초과/
  )
})

test('SIGTERM을 무시하는 설치 명령도 제한 시간 안에 강제 종료한다', async () => {
  await assert.rejects(
    run(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { timeoutMs: 30 }),
    /시간이 초과/
  )
})

test('기본 설치 로그는 stdout 마지막 64KiB만 보존한다', async () => {
  const size = 72 * 1024
  const output = await run(process.execPath, ['-e', `process.stdout.write('x'.repeat(${size}))`])
  assert.equal(Buffer.byteLength(output), 64 * 1024)
})

test('명시한 stdout 한도 안의 큰 설치 검사 출력은 처음부터 끝까지 보존한다', async () => {
  const size = 72 * 1024
  const output = await run(process.execPath, ['-e', `process.stdout.write('x'.repeat(${size}))`], { maxOutputBytes: 128 * 1024 })
  assert.equal(Buffer.byteLength(output), size)
})

test('명시한 stdout 한도를 넘긴 설치 검사 출력은 자식을 종료하고 실패한다', async () => {
  await assert.rejects(
    run(process.execPath, ['-e', "process.stdout.write('x'.repeat(96 * 1024)); setInterval(() => {}, 1000)"], { maxOutputBytes: 64 * 1024, timeoutMs: 5000 }),
    /stdout이 65536 바이트 한도를 초과/
  )
})

test('stdout 한도 초과는 기존 제한 시간 타이머를 해제해 종료 경로를 하나만 유지한다', async () => {
  const fs = require('node:fs')
  const vm = require('node:vm')
  const { EventEmitter } = require('node:events')
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: () => {} })
  const timers = []
  const sandbox = {
    module: { exports: {} }, Buffer,
    process: { platform: 'win32' },
    setTimeout: (callback, ms) => { const timer = { callback, ms, cleared: false }; timers.push(timer); return timer },
    clearTimeout: timer => { timer.cleared = true },
    require: name => name === 'child_process' ? { spawn: () => child } : require(name)
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../electron/update-installer'), 'utf8'), sandbox)
  const result = sandbox.module.exports.run('fixture', [], { timeoutMs: 20, maxOutputBytes: 1 })
  const timeout = timers.find(timer => timer.ms === 20)
  child.stdout.emit('data', Buffer.from('xx'))
  assert.equal(timeout.cleared, true)
  const grace = timers.find(timer => timer.ms === 1000)
  grace.callback()
  child.emit('close', 0)
  await assert.rejects(result, /stdout이 1 바이트 한도를 초과/)
  assert.ok(timers.every(timer => timer.cleared))
})

test('설치 명령은 exit 뒤 남은 stdout을 close까지 수집한다', async () => {
  const fs = require('node:fs')
  const vm = require('node:vm')
  const { EventEmitter } = require('node:events')
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() })
  const sandbox = { module: { exports: {} }, process, setTimeout, clearTimeout,
    require: name => name === 'child_process' ? { spawn: () => child } : require(name) }
  vm.runInNewContext(fs.readFileSync(require.resolve('../electron/update-installer'), 'utf8'), sandbox)
  let settled = false
  const result = sandbox.module.exports.run('fixture', [], { timeoutMs: 1000 }).then(value => { settled = true; return value })
  child.emit('exit', 0)
  await Promise.resolve()
  const settledBeforeClose = settled
  child.stdout.emit('data', Buffer.from('RoadMusic-CLI-0.1.1/cli/road-music.js\n'))
  child.emit('close', 0)
  assert.equal(await result, 'RoadMusic-CLI-0.1.1/cli/road-music.js')
  assert.equal(settledBeforeClose, false)
})

test('새 앱을 종료할 수 없으면 수동 복구를 기록하고 도우미의 자식 핸들을 해제한다', async () => {
  const fs = require('node:fs')
  const vm = require('node:vm')
  const { EventEmitter } = require('node:events')
  const child = Object.assign(new EventEmitter(), { pid: 12345, exitCode: null, signalCode: null })
  let unrefs = 0
  child.unref = () => { unrefs++ }
  const timers = []
  const signals = []
  const sandbox = {
    module: { exports: {} },
    require: name => name === 'child_process' ? { spawn: () => child } : require(name),
    process: { kill: (pid, signal) => signals.push([pid, signal]) },
    setTimeout: (callback, ms) => { const timer = { callback, ms }; timers.push(timer); return timer },
    clearTimeout: () => {}
  }
  const source = fs.readFileSync(require.resolve('../electron/update-installer'), 'utf8')
  vm.runInNewContext(source + '\nmodule.exports.testLaunch = launch', sandbox)
  const launched = sandbox.module.exports.testLaunch('unused', [], {}, { userData: '/unused', version: '1.4.3' })
  const rejected = assert.rejects(launched, error => error.unsafeToRollback === true && /준비 완료/.test(error.message))
  const finishing = timers.find(timer => timer.ms === 45000).callback()
  timers.find(timer => timer.ms === 1000).callback()
  timers.find(timer => timer.ms === 3000).callback()
  await finishing
  await rejected
  assert.equal(unrefs, 1)
  assert.deepEqual(signals, [[-child.pid, 'SIGTERM'], [-child.pid, 'SIGKILL']])
})
