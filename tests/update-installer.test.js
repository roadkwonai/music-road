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
