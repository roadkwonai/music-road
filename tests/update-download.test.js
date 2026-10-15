'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

async function fixture (t, fetchAsset) {
  delete require.cache[require.resolve('../electron/app-update')]
  const update = require('../electron/app-update')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-download-'))
  let userData = root
  await fs.mkdir(path.join(root, 'app', '.git'), { recursive: true })
  const originalFetch = global.fetch
  t.after(async () => { update.stop(); userData = null; global.fetch = originalFetch; await new Promise(resolve => setTimeout(resolve, 20)); await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }) })
  const name = process.platform === 'darwin' ? `RoadMusic-1.4.0-mac-${process.arch}.dmg` : 'RoadMusic-1.4.0-source.zip'
  const base = 'https://github.com/roadkwonai/music-road/releases/download/v1.4.0/'
  const bytes = Buffer.from('verified release bytes')
  const digest = crypto.createHash('sha256').update(bytes).digest('hex')
  const manifest = `${digest}  ${name}\n`
  const release = {
    tag_name: 'v1.4.0', draft: false, prerelease: false,
    html_url: 'https://github.com/roadkwonai/music-road/releases/tag/v1.4.0',
    assets: [{ name, size: bytes.length, browser_download_url: base + name },
      { name: 'SHA256SUMS.txt', size: manifest.length, browser_download_url: base + 'SHA256SUMS.txt' }]
  }
  const calls = []
  global.fetch = async url => {
    calls.push(url)
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify(release))
    if (url === base + 'SHA256SUMS.txt') return new Response(manifest)
    assert.equal(url, base + name)
    return fetchAsset ? fetchAsset(bytes) : new Response(bytes)
  }
  let quits = 0
  update.init({ app: { getVersion: () => '1.3.1', getPath: () => userData,
    getAppPath: () => path.join(root, 'app'), isPackaged: process.platform === 'darwin', quit: () => { quits++ } },
  isBusy: () => false, publish: () => {} })
  return { update, root, bytes, calls, quits: () => quits }
}

test('verified download survives a version recheck and rejects on-disk tampering before install', async t => {
  const f = await fixture(t)
  assert.equal((await f.update.check()).status, 'available')
  const downloaded = await f.update.download()
  assert.equal(downloaded.status, 'downloaded')
  assert.deepEqual(await fs.readFile(downloaded.asset.path), f.bytes)
  assert.equal((await f.update.check()).status, 'downloaded')
  await fs.writeFile(downloaded.asset.path, 'changed bytes')
  const installed = await f.update.install()
  assert.equal(installed.status, 'error')
  assert.match(installed.error, /손상|변경/)
  assert.equal(f.quits(), 0)
})

test('checksum failure removes partial download without publishing an installer', async t => {
  const f = await fixture(t, bytes => new Response(Buffer.alloc(bytes.length)))
  await f.update.check()
  const result = await f.update.download()
  assert.equal(result.status, 'error')
  assert.match(result.error, /무결성/)
  assert.deepEqual((await fs.readdir(path.join(f.root, 'updates'))).filter(name => /\.(part|download)$/.test(name)), [])
  assert.equal(f.quits(), 0)
})

test('download rejects a redirect whose host only resembles GitHub CDN', async t => {
  const f = await fixture(t, () => new Response(null, { status: 302,
    headers: { location: 'https://github-production-release-asset-attacker.example/installer' } }))
  await f.update.check()
  const result = await f.update.download()
  assert.equal(result.status, 'error')
  assert.match(result.error, /허용되지/)
  assert.ok(f.calls.every(url => !url.includes('attacker.example')))
})

test('a periodic check during download preserves progress and does not fetch latest again', async t => {
  let streamController
  let bytes
  const f = await fixture(t, data => {
    bytes = data
    return new Response(new ReadableStream({ start (controller) { streamController = controller } }))
  })
  await f.update.check()
  const downloading = f.update.download()
  for (let attempt = 0; !streamController && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(streamController)
  assert.equal((await f.update.check()).status, 'downloading')
  assert.equal(f.calls.filter(url => url.endsWith('/releases/latest')).length, 1)
  streamController.enqueue(bytes)
  streamController.close()
  assert.equal((await downloading).status, 'downloaded')
})
