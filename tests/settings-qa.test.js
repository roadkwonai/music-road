'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')

test('concurrent settings updates preserve unrelated fields', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-settings-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const file = path.join(root, 'settings.json')
  await fs.writeFile(file, '{"language":"ko"}')
  const text = await fs.readFile(path.join(__dirname, '../electron/main.js'), 'utf8')
  const context = { fsp: fs, path, crypto: require('node:crypto'), process, userData: () => root, paths: () => ({ settings: file }) }
  vm.runInNewContext(text.slice(text.indexOf('async function readSettings'), text.indexOf('// ── helpers')), context)
  await Promise.all([context.writeSettings({ autoMp3: true }), context.writeSettings({ project: '새 프로젝트' })])
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { language: 'ko', autoMp3: true, project: '새 프로젝트' })
})
