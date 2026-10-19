'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

async function fixture (t, saved, options = {}) {
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
  isBusy: () => false, publish: () => {}, ...options })
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

test('초기화 전의 높은 버전은 0.1.0을 자동 다운그레이드 대상으로 알리지 않고 수동 전환을 안내한다', async t => {
  let recorded
  const { update, setVersion } = await fixture(t, { current: '0.0.9', version: '0.0.10' }, { recordProduction: async value => { recorded = value; return { ok: true } } })
  const original = global.fetch
  t.after(() => { global.fetch = original })
  global.fetch = async () => new Response(JSON.stringify({ tag_name: 'v0.1.0', draft: false, prerelease: false,
    html_url: 'https://github.com/roadkwonai/music-road/releases/tag/v0.1.0', assets: [] }))
  for (const current of ['0.1.1', '0.1.2', '1.4.4']) {
    setVersion(current)
    const result = await update.check()
    assert.equal(result.available, false)
    assert.equal(result.installable, false)
    assert.equal(result.status, 'idle')
    assert.equal(result.version, '0.1.0')
    assert.match(result.reason, /자동 업데이트를 하지 않습니다/)
    assert.match(result.reason, /수동 설치/)
    assert.equal(recorded.params.checkStatus, 'release-reset-required')
  }
})

test('업데이트 화면은 수동 전환 사유를 최신 버전 안내보다 먼저 표시한다', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../renderer/app.js'), 'utf8')
  assert.match(renderer, /if \(info\.reason\) return info\.reason/)
  assert.match(renderer, /updateTitle'\)\.textContent = available \? '새 버전이 나왔습니다' : '업데이트'/)
})


test('수동 전환 화면은 실제 버전을 보존하고 GitHub 이동만 제공한다', async () => {
  const vm = require('node:vm')
  const source = await fs.readFile(path.join(__dirname, '../renderer/app.js'), 'utf8')
  const code = source.slice(source.indexOf('function updateMessage ('), source.indexOf('// ── system gauges'))
  const elements = new Map()
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set()
      elements.set(id, { textContent: '', disabled: false, style: {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name), remove: name => classes.delete(name) } })
    }
    return elements.get(id)
  }
  const context = vm.createContext({ $: element })
  vm.runInContext('let updateInfo = null;\n' + code, context)
  const manual = { current: '0.1.2', version: '0.1.0', status: 'idle', mode: 'mac-app', reason: '초기화 배포 전환은 수동 설치로 진행하세요.', page: 'https://github.com/roadkwonai/music-road/releases/tag/v0.1.0' }
  context.renderUpdate(manual, { open: true })
  assert.equal(element('updateFrom').textContent, '버전 0.1.2')
  assert.equal(element('updateTo').textContent, '버전 0.1.0')
  assert.equal(element('updateStatus').textContent, manual.reason)
  assert.equal(element('updateTitle').textContent, '업데이트')
  assert.equal(element('updateAction').disabled, true)
  assert.equal(element('updateBadge').classList.contains('hidden'), true)
  assert.equal(element('updatePage').classList.contains('hidden'), false)
  context.renderUpdate({ current: '0.1.0', status: 'idle' })
  assert.equal(element('updateStatus').textContent, '아직 공개 버전을 확인하지 않았습니다.')
  context.renderUpdate({ current: '0.1.0', version: '0.1.0', status: 'idle' })
  assert.match(element('updateStatus').textContent, /마지막 확인/)
  assert.doesNotMatch(element('updateStatus').textContent, /최신 버전/)
  context.renderUpdate({ ...manual, current: '0.1.0', version: '0.1.1', status: 'available', reason: null })
  assert.equal(element('updateTitle').textContent, '새 버전이 나왔습니다')
  assert.equal(element('updateAction').disabled, false)
})


test('앱 정식 배포가 없으면 최신으로 기록하지 않는다', async t => {
  let recorded
  const { update } = await fixture(t, { current: '0.0.9', version: '0.0.10' }, { recordProduction: async value => { recorded = value; return { ok: true } } })
  const original = global.fetch
  t.after(() => { global.fetch = original })
  global.fetch = async () => new Response('null', { status: 404 })
  const result = await update.check()
  assert.equal(result.status, 'no-release')
  assert.equal(result.available, false)
  assert.equal(recorded.params.checkStatus, 'no-release')
})
