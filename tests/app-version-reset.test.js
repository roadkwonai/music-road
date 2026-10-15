'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

async function fixture (t, saved) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-version-reset-'))
  const archive = path.join(root, 'cached.download')
  await fs.writeFile(archive, 'cached')
  await fs.mkdir(path.join(root, 'updates'))
  await fs.writeFile(path.join(root, 'updates/update-state.json'), JSON.stringify({
    status: 'downloaded', available: true, installable: true, ...saved,
    asset: { name: `RoadMusic-${saved.version}-mac-${process.arch}.dmg`, path: archive,
      url: `https://github.com/roadkwonai/music-road/releases/download/v${saved.version}/RoadMusic-${saved.version}-mac-${process.arch}.dmg` }
  }))
  delete require.cache[require.resolve('../electron/app-update')]
  const update = require('../electron/app-update')
  let current = '0.1.0'
  let data = root
  update.init({ app: { getVersion: () => current, getPath: () => data,
    getAppPath: () => path.join(root, 'Road Music.app/Contents/Resources/app.asar'), isPackaged: true },
  isBusy: () => false, publish: () => {} })
  t.after(async () => { data = null; update.stop(); await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }) })
  return { update, root, setVersion: version => { current = version } }
}

test('버전 초기화 전 앱에서 내려받은 업데이트 캐시는 새 앱에서 복원하지 않는다', async t => {
  const { update } = await fixture(t, { current: '1.4.0', version: '1.4.4' })
  assert.equal(update.status().available, false)
  assert.equal(update.status().status, 'idle')
  assert.equal(update.status().asset, null)
  assert.equal((await update.install()).status, 'error')
})

test('현재 앱과 같거나 낮은 버전의 저장된 업데이트를 복원하지 않는다', async t => {
  for (const version of ['0.1.0', '0.0.9']) {
    const { update } = await fixture(t, { current: '0.1.0', version })
    assert.equal(update.status().available, false)
    assert.equal(update.status().status, 'idle')
  }
})

test('설치 직전에도 현재 앱보다 높은 버전인지 다시 확인한다', { skip: process.platform !== 'darwin' }, async t => {
  const { update, setVersion } = await fixture(t, { current: '0.1.0', version: '0.1.1' })
  assert.equal(update.status().status, 'downloaded')
  setVersion('0.2.0')
  const result = await update.install()
  assert.equal(result.status, 'error')
  assert.equal(result.available, false)
  assert.match(result.error, /현재 앱보다 높은/)
})

test('1.4.x 기존 설치본은 0.1.0을 자동 다운그레이드 대상으로 알리지 않는다', async t => {
  const { update, setVersion } = await fixture(t, { current: '0.0.9', version: '0.0.10' })
  setVersion('1.4.4')
  const original = global.fetch
  t.after(() => { global.fetch = original })
  global.fetch = async () => new Response(JSON.stringify({ tag_name: 'v0.1.0', draft: false, prerelease: false,
    html_url: 'https://github.com/roadkwonai/music-road/releases/tag/v0.1.0', assets: [] }))
  const result = await update.check()
  assert.equal(result.available, false)
  assert.equal(result.installable, false)
  assert.equal(result.status, 'idle')
  assert.equal(result.version, '0.1.0')
})
