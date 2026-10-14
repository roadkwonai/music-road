'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const update = require('../electron/app-update')

function app (dir, version = '1.3.1') {
  return {
    getVersion: () => version,
    getPath: () => dir,
    getAppPath: () => path.join(dir, 'app'),
    isPackaged: true
  }
}

test('GitHub 최신 안정 릴리스의 현재 플랫폼 자산만 업데이트로 제시한다', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-update-'))
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }) })
  const platform = process.platform === 'darwin' ? `mac-${process.arch}` : 'unsupported'
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.github.com/repos/roadkwonai/music-road/releases/latest')
    return new Response(JSON.stringify({
      tag_name: 'v1.3.2', draft: false, prerelease: false,
      body: '고쳤습니다', html_url: 'https://github.com/roadkwonai/music-road/releases/tag/v1.3.2',
      assets: platform === 'unsupported' ? [] : [
        { name: `RoadMusic-1.3.2-${platform}.dmg`, size: 12, browser_download_url: 'https://github.com/roadkwonai/music-road/releases/download/v1.3.2/RoadMusic-1.3.2-' + platform + '.dmg' },
        { name: 'SHA256SUMS.txt', size: 90, browser_download_url: 'https://github.com/roadkwonai/music-road/releases/download/v1.3.2/SHA256SUMS.txt' }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  update.init({ app: app(dir), publish: () => {}, isBusy: () => false })
  const state = await update.check()
  assert.equal(state.current, '1.3.1')
  assert.equal(state.version, '1.3.2')
  assert.equal(state.status, process.platform === 'darwin' ? 'available' : 'unsupported')
  assert.equal(state.page, 'https://github.com/roadkwonai/music-road/releases/tag/v1.3.2')
  assert.equal(state.available, process.platform === 'darwin')
})

test('태그나 자산 이름이 엄격한 형식이 아니면 릴리스를 설치 대상으로 쓰지 않는다', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-update-'))
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }) })
  global.fetch = async () => new Response(JSON.stringify({ tag_name: 'latest', draft: false, prerelease: false, assets: [] }), { status: 200 })
  update.init({ app: app(dir), publish: () => {}, isBusy: () => false })
  const state = await update.check()
  assert.equal(state.status, 'no-release')
  assert.equal(state.available, false)
})

test('이전 설치 도우미 실패는 재시도를 막지 않는 상태 정보로 복원한다', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-update-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.mkdirSync(path.join(dir, 'updates'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'updates', 'installer-result.json'), JSON.stringify({ ok: false, version: '1.3.2', error: '교체 실패' }))
  update.init({ app: app(dir), publish: () => {}, isBusy: () => false })
  const state = update.status()
  assert.notEqual(state.status, 'error')
  assert.equal(state.installerResult.ok, false)
  assert.match(state.installerResult.error, /교체 실패/)
})

test('설치 실패 기록이 있어도 다음 확인은 새 릴리스 상태로 진행한다', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-update-'))
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }) })
  fs.mkdirSync(path.join(dir, 'updates'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'updates', 'installer-result.json'), JSON.stringify({ ok: false, error: '이전 실패' }))
  global.fetch = async () => new Response(JSON.stringify({ tag_name: 'v1.3.2', draft: false, prerelease: false, body: '', html_url: 'https://github.com/roadkwonai/music-road/releases/tag/v1.3.2', assets: [] }), { status: 200 })
  update.init({ app: app(dir), publish: () => {}, isBusy: () => false })
  const state = await update.check()
  assert.notEqual(state.status, 'error')
  assert.equal(state.installerResult.ok, false)
})
