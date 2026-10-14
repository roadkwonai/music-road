'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('Windows source installs do not offer a Unix-only automatic installer', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'road-update-platform-'))
  fs.mkdirSync(path.join(root, 'app/.git'), { recursive: true })
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  t.after(() => { Object.defineProperty(process, 'platform', descriptor); fs.rmSync(root, { recursive: true, force: true }) })
  Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' })
  const update = require('../electron/app-update')
  update.init({ app: { getVersion: () => '1.4.0', getAppPath: () => path.join(root, 'app'), getPath: () => root, isPackaged: false } })
  assert.equal(update.status().mode, 'unsupported')
})
