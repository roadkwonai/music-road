'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { resolveBaselineVersion } = require('../scripts/verify-update-e2e')
const { bundleVersion } = require('../scripts/verify-mac-update-rollback')

test('실제 기준 설치본 버전만 업데이트 검증의 기준으로 사용한다', () => {
  assert.equal(resolveBaselineVersion('0.1.0'), '0.1.0')
  assert.equal(resolveBaselineVersion('0.1.2', '0.1.2'), '0.1.2')
  assert.throws(() => resolveBaselineVersion('0.1.0', '1.4.0'), /실제 버전/)
  assert.throws(() => resolveBaselineVersion('not-a-version'), /버전 형식/)
})

test('롤백 검증은 기준 앱 Info.plist의 실제 버전을 사용한다', () => {
  assert.equal(bundleVersion({ CFBundleIdentifier: 'dev.roadkwon.roadmusic', CFBundleShortVersionString: '0.1.0', CFBundleVersion: '0.1.0' }), '0.1.0')
  assert.throws(() => bundleVersion({ CFBundleIdentifier: 'dev.roadkwon.roadmusic', CFBundleShortVersionString: '0.1', CFBundleVersion: '0.1' }), { name: 'AssertionError' })
  assert.throws(() => bundleVersion({ CFBundleIdentifier: 'other.app', CFBundleShortVersionString: '0.1.0', CFBundleVersion: '0.1.0' }), { name: 'AssertionError' })
})

test('실제 업데이트 검증 스크립트는 초기화 전 1.4.0 기준값에 의존하지 않는다', async () => {
  const source = await fs.readFile(path.join(__dirname, '../scripts/verify-update-e2e.js'), 'utf8')
  const rollback = await fs.readFile(path.join(__dirname, '../scripts/verify-mac-update-rollback.js'), 'utf8')
  assert.match(source, /options\['baseline-ref'\] \|\| 'v0\.1\.0'/)
  assert.doesNotMatch(source, /baseline-version'\] \|\| '1\.4\.0'/)
  assert.doesNotMatch(rollback, /const oldVersion = '1\.4\.0'/)
})
