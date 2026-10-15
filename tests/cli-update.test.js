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

const repo = 'roadkwonai/music-road'
const api = `https://api.github.com/repos/${repo}/releases`
const releaseBase = `https://github.com/${repo}/releases/download/cli-v0.1.1/`

async function makeKit (root, version = '0.1.1', { npmFailure = false } = {}) {
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

function release (asset, version = '0.1.1', overrides = {}) {
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
  const kit = await makeKit(root, options.version || '0.1.1', options)
  const asset = await fs.readFile(kit.archive)
  const stable = release(asset, options.version || '0.1.1', options.release)
  const previous = global.fetch
  const oldHome = process.env.ROADMUSIC_CLI_HOME
  process.env.ROADMUSIC_CLI_HOME = cliHome
  global.fetch = async (url) => {
    const value = String(url)
    if (value === api) return new Response(JSON.stringify(options.releases || [stable]))
    if (value === `${releaseBase}SHA256SUMS.txt`) return new Response(stable._manifest)
    if (value === `${releaseBase}RoadMusic-CLI-${options.version || '0.1.1'}.zip`) return new Response(options.asset || asset)
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
  const old = release(f.asset, '0.1.0')
  const skipped = release(f.asset, '9.0.0', { prerelease: true })
  const saved = global.fetch
  global.fetch = async url => String(url) === api ? new Response(JSON.stringify([old, skipped, f.stable])) : saved(url)
  const result = await update.check()
  assert.deepEqual(result, {
    current: '0.1.0', available: true, version: '0.1.1',
    releaseUrl: 'https://github.com/roadkwonai/music-road/releases/tag/cli-v0.1.1',
    notes: '',
    asset: { name: 'RoadMusic-CLI-0.1.1.zip', size: f.asset.length, url: `${releaseBase}RoadMusic-CLI-0.1.1.zip`, sumsUrl: `${releaseBase}SHA256SUMS.txt` },
    installable: true
  })
  void old; void skipped
})

test('check rejects extra parameters and does not use app v tags as CLI updates', async t => {
  await assert.rejects(update.check({ ignored: true }), { code: 'INVALID_ARGUMENT' })
  const f = await fixture(t)
  const appRelease = release(f.asset, '9.9.9', { tag_name: 'v9.9.9', html_url: `https://github.com/${repo}/releases/tag/v9.9.9` })
  const saved = global.fetch
  global.fetch = async url => String(url) === api ? new Response(JSON.stringify([appRelease, f.stable])) : saved(url)
  const result = await update.check()
  assert.equal(result.available, true)
  assert.equal(result.version, '0.1.1')
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
  assert.equal((await update.check()).version, '0.1.1')
})

test('install verifies the release archive, npm setup and new CLI before atomically recording its path', async t => {
  const f = await fixture(t)
  const result = await update.install({ targetDir: path.join(f.root, 'installed') })
  assert.equal(result.cliVersion, '0.1.1')
  assert.equal(result.appVersion, '1.4.0')
  assert.equal(result.cliPath, path.join(f.root, 'installed', 'cli', 'road-music.js'))
  assert.match(result.command, /road-music\.js/)
  const active = JSON.parse(await fs.readFile(path.join(f.cliHome, 'current.json'), 'utf8'))
  assert.deepEqual(active, { cliVersion: '0.1.1', cliPath: result.cliPath })
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
  const sourceTarget = path.join(path.resolve(__dirname, '..'), 'new-cli-update-target')
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
  assert.equal(result.cliVersion, '0.1.1')
})

test('default target is reused only after its completed-install marker verifies', async t => {
  const f = await fixture(t)
  const first = await update.install()
  const second = await update.install()
  assert.equal(second.cliPath, first.cliPath)
  await fs.rm(path.join(f.cliHome, 'current.json'))
  await fs.rm(path.join(f.cliHome, '0.1.1', '.road-music-cli-install.json'))
  await assert.rejects(update.install(), /완료 표식/)
})

test('install refuses symlink entries inside an otherwise valid CLI root before extraction', async t => {
  const f = await fixture(t)
  await fs.symlink('package.json', path.join(f.kit.kit, 'linked-package'))
  const archive = path.join(f.root, 'RoadMusic-CLI-0.1.1.zip')
  await fs.rm(archive)
  await exec('/usr/bin/zip', ['-qry', archive, 'RoadMusic-CLI-0.1.1'], { cwd: f.root })
  const bytes = await fs.readFile(archive)
  const digest = crypto.createHash('sha256').update(bytes).digest('hex')
  const manifest = `${digest}  RoadMusic-CLI-0.1.1.zip\n`
  global.fetch = async url => {
    const value = String(url)
    if (value === api) return new Response(JSON.stringify([{ ...f.stable, assets: [
      { name: 'RoadMusic-CLI-0.1.1.zip', size: bytes.length, browser_download_url: `${releaseBase}RoadMusic-CLI-0.1.1.zip` },
      { name: 'SHA256SUMS.txt', size: Buffer.byteLength(manifest), browser_download_url: `${releaseBase}SHA256SUMS.txt` }
    ] }]))
    if (value.endsWith('SHA256SUMS.txt')) return new Response(manifest)
    return new Response(bytes)
  }
  await assert.rejects(update.install({ targetDir: path.join(f.root, 'target') }), /심볼릭/)
})
