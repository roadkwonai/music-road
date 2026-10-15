'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

test('service start checks immediately and its 15-minute timer publishes a newly released version', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-monitor-'))
  let userData = root
  await fs.mkdir(path.join(root, 'source/.git'), { recursive: true })
  const original = { fetch: global.fetch, setInterval: global.setInterval, clearInterval: global.clearInterval }
  const token = { unref () {} }
  let interval
  let period
  let cleared = false
  let version = '1.4.0'
  const events = []
  global.setInterval = (callback, ms) => { interval = callback; period = ms; return token }
  global.clearInterval = id => { assert.equal(id, token); cleared = true }
  global.fetch = async () => new Response(JSON.stringify({ tag_name: `v${version}`, draft: false, prerelease: false,
    html_url: `https://github.com/roadkwonai/music-road/releases/tag/v${version}`,
    assets: [{ name: `RoadMusic-${version}-source.zip`, size: 10,
      browser_download_url: `https://github.com/roadkwonai/music-road/releases/download/v${version}/RoadMusic-${version}-source.zip` },
    { name: 'SHA256SUMS.txt', size: 90, browser_download_url: `https://github.com/roadkwonai/music-road/releases/download/v${version}/SHA256SUMS.txt` }]
  }))
  delete require.cache[require.resolve('../electron/app-update')]
  const update = require('../electron/app-update')
  t.after(async () => {
    update.stop()
    userData = null
    Object.assign(global, original)
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  })
  update.init({ app: { getVersion: () => '1.4.0', getAppPath: () => path.join(root, 'source'), getPath: () => userData, isPackaged: false },
    publish: (channel, state) => events.push({ channel, ...state }) })
  update.start()
  await update.check()
  assert.equal(update.status().status, 'idle')
  assert.equal(period, 15 * 60 * 1000)
  version = '1.4.1'
  interval()
  await update.check()
  assert.equal(update.status().version, '1.4.1')
  assert.equal(update.status().available, true)
  assert.ok(events.some(event => event.channel === 'update:status' && event.status === 'available' && event.version === '1.4.1'))
  update.stop()
  assert.equal(cleared, true)
})
