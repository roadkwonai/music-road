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
