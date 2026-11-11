'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const exec = promisify(execFile)
const update = require('../cli/update')

// 고정 번호는 CLI 버전을 올릴 때마다 깨졌다. 설치본은 현재 cli/package.json, 공개 Release는 그 다음 패치로 둔다.
const CURRENT = require('../cli/package.json').version
const NEXT = CURRENT.replace(/\d+$/, patch => String(Number(patch) + 1))
const repo = 'roadkwonai/music-road'
const api = `https://api.github.com/repos/${repo}/releases`
const releaseBase = `https://github.com/${repo}/releases/download/cli-v${NEXT}/`

async function makeKit (root, version = NEXT, { npmFailure = false } = {}) {
  const kit = path.join(root, `RoadMusic-CLI-${version}`)
  await fs.mkdir(path.join(kit, 'cli'), { recursive: true })
  await fs.writeFile(path.join(kit, 'package.json'), JSON.stringify({ name: 'road-music', version: '1.4.0' }))
  await fs.writeFile(path.join(kit, 'package-lock.json'), JSON.stringify({ name: 'road-music', version: '1.4.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'road-music', version: '1.4.0' } } }))
  await fs.writeFile(path.join(kit, 'cli', 'package.json'), JSON.stringify({ name: 'road-music-cli', version, private: true }))
  await fs.writeFile(path.join(kit, 'cli', 'road-music.js'), npmFailure
    ? 'process.exitCode = 1\n'
    : `process.stdout.write(JSON.stringify({ ok: true, result: { cliVersion: ${JSON.stringify(version)}, appVersion: '1.4.0' } }) + '\\n')\n`)
  const archive = path.join(root, `RoadMusic-CLI-${version}.zip`)
  await exec('/usr/bin/zip', ['-qr', archive, path.basename(kit)], { cwd: root })
  return { archive, kit }
}

function release (asset, version = NEXT, overrides = {}) {
  const digest = crypto.createHash('sha256').update(asset).digest('hex')
  const name = `RoadMusic-CLI-${version}.zip`
  const manifest = `${digest}  ${name}\n`
  return {
    tag_name: `cli-v${version}`, draft: false, prerelease: false,
    html_url: `https://github.com/${repo}/releases/tag/cli-v${version}`,
    assets: [
      { name, size: asset.length, browser_download_url: `${releaseBase}${name}` },
      { name: 'SHA256SUMS.txt', size: Buffer.byteLength(manifest), browser_download_url: `${releaseBase}SHA256SUMS.txt` }
    ],
    ...overrides,
    _manifest: manifest
  }
}

async function fixture (t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-cli-update-'))
  const cliHome = path.join(root, 'cli-home')
  const kit = await makeKit(root, options.version || NEXT, options)
  const asset = await fs.readFile(kit.archive)
  const stable = release(asset, options.version || NEXT, options.release)
  const previous = global.fetch
  const oldHome = process.env.ROADMUSIC_CLI_HOME
  process.env.ROADMUSIC_CLI_HOME = cliHome
  global.fetch = async (url) => {
    const value = String(url)
    if (value === api) return new Response(JSON.stringify(options.releases || [stable]))
    if (value === `${releaseBase}SHA256SUMS.txt`) return new Response(stable._manifest)
    if (value === `${releaseBase}RoadMusic-CLI-${options.version || NEXT}.zip`) return new Response(options.asset || asset)
    throw new Error(`unexpected fetch: ${value}`)
  }
  t.after(async () => {
    global.fetch = previous
    if (oldHome === undefined) delete process.env.ROADMUSIC_CLI_HOME
    else process.env.ROADMUSIC_CLI_HOME = oldHome
    await fs.rm(root, { recursive: true, force: true })
  })
  return { root, cliHome, asset, stable, kit }
}

test('check selects only the highest stable cli-v release with its matching assets', async t => {
  const f = await fixture(t)
  const old = release(f.asset, CURRENT)
  const skipped = release(f.asset, '9.0.0', { prerelease: true })
  const saved = global.fetch
  global.fetch = async url => String(url) === api ? new Response(JSON.stringify([old, skipped, f.stable])) : saved(url)
  const result = await update.check()
  assert.deepEqual(result, {
    current: CURRENT, available: true, version: NEXT,
    releaseUrl: `https://github.com/roadkwonai/music-road/releases/tag/cli-v${NEXT}`,
    notes: '',
    asset: { name: `RoadMusic-CLI-${NEXT}.zip`, size: f.asset.length, url: `${releaseBase}RoadMusic-CLI-${NEXT}.zip`, sumsUrl: `${releaseBase}SHA256SUMS.txt` },
    installable: true
  })
  void old; void skipped
})

test('check records the observed CLI version without changing the update result', async t => {
  const f = await fixture(t)
  let captured
  const result = await update.check({}, { dataDir: path.join(f.root, 'profile'), recordProduction: async value => { captured = value; return { ok: true } } })
  assert.equal(result.available, true)
  assert.equal(captured.action, 'component-record')
  assert.equal(captured.params.componentId, 'road-music-cli:current')
  assert.equal(captured.params.installedVersion, CURRENT)
  assert.equal(captured.params.latestVersion, NEXT)
  assert.equal(captured.params.checkStatus, 'update-available')
  assert.equal(typeof captured.params.checkedAt, 'number')
})

test('check rejects extra parameters and does not use app v tags as CLI updates', async t => {
  await assert.rejects(update.check({ ignored: true }), { code: 'INVALID_ARGUMENT' })
  const f = await fixture(t)
  const appRelease = release(f.asset, '9.9.9', { tag_name: 'v9.9.9', html_url: `https://github.com/${repo}/releases/tag/v9.9.9` })
  const saved = global.fetch
  global.fetch = async url => String(url) === api ? new Response(JSON.stringify([appRelease, f.stable])) : saved(url)
  const result = await update.check()
  assert.equal(result.available, true)
  assert.equal(result.version, NEXT)
  void appRelease
})

test('check continues past an app-only first release page to find the latest CLI release', async t => {
  const f = await fixture(t)
  const apps = Array.from({ length: 30 }, (_, index) => ({ tag_name: `v1.${index}.0`, draft: false, prerelease: false, assets: [] }))
  const saved = global.fetch
  global.fetch = async url => {
    const value = String(url)
    if (value === api) return new Response(JSON.stringify(apps))
    if (value === `${api}?page=2&per_page=30`) return new Response(JSON.stringify([f.stable]))
    return saved(url)
  }
  assert.equal((await update.check()).version, NEXT)
})

test('install verifies the release archive, npm setup and new CLI before atomically recording its path', async t => {
  const f = await fixture(t)
  const result = await update.install({ targetDir: path.join(f.root, 'installed') })
  assert.equal(result.cliVersion, NEXT)
  assert.equal(result.appVersion, '1.4.0')
  assert.equal(result.cliPath, path.join(f.root, 'installed', 'cli', 'road-music.js'))
  assert.match(result.command, /road-music\.js/)
  const active = JSON.parse(await fs.readFile(path.join(f.cliHome, 'current.json'), 'utf8'))
  assert.deepEqual(active, { cliVersion: NEXT, cliPath: result.cliPath })
  await fs.access(result.cliPath)
})

test('install keeps existing targets untouched when checksum or npm verification fails', async t => {
  const f = await fixture(t, { asset: Buffer.from('tampered') })
  const target = path.join(f.root, 'existing')
  await fs.mkdir(target)
  await fs.writeFile(path.join(target, 'keep.txt'), 'keep')
  await assert.rejects(update.install({ targetDir: target }), /targetDir/)
  assert.equal(await fs.readFile(path.join(target, 'keep.txt'), 'utf8'), 'keep')
})

test('install rejects every Git checkout target even when the CLI runs from outside that checkout', async t => {
  const f = await fixture(t)
  const original = process.cwd()
  t.after(() => process.chdir(original))
  process.chdir(f.root)
  const sourceRoot = path.join(f.root, 'source-checkout')
  await fs.mkdir(path.join(sourceRoot, '.git'), { recursive: true })
  const sourceTarget = path.join(sourceRoot, 'new-cli-update-target')
  const otherRoot = path.join(f.root, 'other-checkout')
  const otherTarget = path.join(otherRoot, 'nested-cli')
  await fs.mkdir(otherRoot)
  await fs.writeFile(path.join(otherRoot, '.git'), 'gitdir: nowhere\n')
  for (const target of [sourceTarget, otherTarget]) {
    await assert.rejects(update.install({ targetDir: target }), /Git 작업 폴더/)
    await assert.rejects(fs.access(target))
  }
})

test('install removes only its staging folder when new CLI validation fails', async t => {
  const f = await fixture(t, { npmFailure: true })
  const target = path.join(f.root, 'new-target')
  await assert.rejects(update.install({ targetDir: target }), /검증/)
  await assert.rejects(fs.access(target))
  assert.deepEqual((await fs.readdir(f.root)).filter(name => name.startsWith('.road-music-cli-stage-')), [])
})

test('install accepts GitHub checksum CDN redirects only to its approved hosts', async t => {
  const f = await fixture(t)
  const saved = global.fetch
  const cdn = 'https://release-assets.githubusercontent.com/road-music-cli-sums'
  global.fetch = async url => {
    const value = String(url)
    if (value === api) return new Response(JSON.stringify([f.stable]))
    if (value === `${releaseBase}SHA256SUMS.txt`) return new Response(null, { status: 302, headers: { location: cdn } })
    if (value === cdn) return new Response(f.stable._manifest)
    return saved(url)
  }
  const result = await update.install({ targetDir: path.join(f.root, 'redirected') })
  assert.equal(result.cliVersion, NEXT)
})

test('default target is reused only after its completed-install marker verifies', async t => {
  const f = await fixture(t)
  const first = await update.install()
  const second = await update.install()
  assert.equal(second.cliPath, first.cliPath)
  await fs.rm(path.join(f.cliHome, 'current.json'))
  await fs.rm(path.join(f.cliHome, NEXT, '.road-music-cli-install.json'))
  await assert.rejects(update.install(), /완료 표식/)
})

test('default target with a legacy or different release checksum is preserved and requires a new folder', async t => {
  const f = await fixture(t)
  const first = await update.install()
  const markerPath = path.join(f.cliHome, NEXT, '.road-music-cli-install.json')
  const original = JSON.parse(await fs.readFile(markerPath, 'utf8'))
  await fs.writeFile(markerPath, JSON.stringify({ cliVersion: NEXT, appVersion: '1.4.0' }))
  await assert.rejects(update.install(), /배포 체크섬/)
  await fs.writeFile(markerPath, JSON.stringify(original))
  const saved = global.fetch
  global.fetch = async url => String(url) === `${releaseBase}SHA256SUMS.txt`
    ? new Response(`${'0'.repeat(64)}  RoadMusic-CLI-${NEXT}.zip\n`) : saved(url)
  await assert.rejects(update.install(), /배포 체크섬/)
  assert.equal(await fs.readFile(markerPath, 'utf8'), JSON.stringify(original))
  await fs.access(first.cliPath)
})

test('install refuses symlink entries inside an otherwise valid CLI root before extraction', async t => {
  const f = await fixture(t)
  await fs.symlink('package.json', path.join(f.kit.kit, 'linked-package'))
  const archive = path.join(f.root, `RoadMusic-CLI-${NEXT}.zip`)
  await fs.rm(archive)
  await exec('/usr/bin/zip', ['-qry', archive, `RoadMusic-CLI-${NEXT}`], { cwd: f.root })
  const bytes = await fs.readFile(archive)
  const digest = crypto.createHash('sha256').update(bytes).digest('hex')
  const manifest = `${digest}  RoadMusic-CLI-${NEXT}.zip\n`
  global.fetch = async url => {
    const value = String(url)
    if (value === api) return new Response(JSON.stringify([{ ...f.stable, assets: [
      { name: `RoadMusic-CLI-${NEXT}.zip`, size: bytes.length, browser_download_url: `${releaseBase}RoadMusic-CLI-${NEXT}.zip` },
      { name: 'SHA256SUMS.txt', size: Buffer.byteLength(manifest), browser_download_url: `${releaseBase}SHA256SUMS.txt` }
    ] }]))
    if (value.endsWith('SHA256SUMS.txt')) return new Response(manifest)
    return new Response(bytes)
  }
  await assert.rejects(update.install({ targetDir: path.join(f.root, 'target') }), /심볼릭/)
})


test('archive safety rejects links and metadata outside the kit root', async t => {
  const f = await fixture(t)
  await fs.symlink('cli/road-music.js', path.join(f.kit.kit, 'inside-link'))
  await exec('/usr/bin/zip', ['-qry', f.kit.archive, path.basename(f.kit.kit)], { cwd: f.root })
  await assert.rejects(update.inspectArchive(f.kit.archive, NEXT), /심볼릭 링크/)
  await fs.mkdir(path.join(f.root, '__MACOSX'))
  await fs.writeFile(path.join(f.root, '__MACOSX', 'metadata'), 'metadata')
  await exec('/usr/bin/zip', ['-qr', f.kit.archive, '__MACOSX'], { cwd: f.root })
  await assert.rejects(update.inspectArchive(f.kit.archive, NEXT), /최상위 폴더/)
})


test('archive safety inspects complete listings larger than a log tail', async t => {
  const f = await fixture(t)
  const notes = path.join(f.kit.kit, 'notes')
  await fs.mkdir(notes)
  for (let index = 0; index < 800; index++) await fs.writeFile(path.join(notes, String(index).padStart(4, '0') + '-' + 'x'.repeat(80) + '.txt'), 'x')
  await exec('/usr/bin/zip', ['-qr', f.kit.archive, path.basename(f.kit.kit)], { cwd: f.root })
  const listing = await exec('/usr/bin/unzip', ['-Z1', f.kit.archive])
  assert.ok(Buffer.byteLength(listing.stdout) > 64 * 1024)
  await update.inspectArchive(f.kit.archive, NEXT)
})


test('a lower public CLI version records manual transition instead of latest', async t => {
  const f = await fixture(t)
  const lower = { ...f.stable, tag_name: 'cli-v0.0.9', html_url: 'https://github.com/' + repo + '/releases/tag/cli-v0.0.9', assets: f.stable.assets.map(item => ({ ...item, name: item.name.replace(NEXT, '0.0.9'), browser_download_url: item.browser_download_url.replaceAll(NEXT, '0.0.9') })) }
  global.fetch = async () => new Response(JSON.stringify([lower]))
  let captured
  const result = await update.check({}, { dataDir: path.join(f.root, 'profile'), recordProduction: async value => { captured = value; return { ok: true } } })
  assert.equal(result.available, false)
  assert.equal(result.installable, false)
  assert.equal(result.version, '0.0.9')
  assert.match(result.reason, /수동 설치/)
  assert.equal(captured.params.checkStatus, 'release-reset-required')
})

test('no CLI release is recorded as no-release rather than up-to-date', async t => {
  const f = await fixture(t)
  global.fetch = async () => new Response('[]')
  let captured
  const result = await update.check({}, { dataDir: path.join(f.root, 'profile'), recordProduction: async value => { captured = value; return { ok: true } } })
  assert.equal(result.version, null)
  assert.equal(result.available, false)
  assert.equal(captured.params.checkStatus, 'no-release')
})
