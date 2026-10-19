'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { spawnSync } = require('node:child_process')

test('packaged app Python helpers do not modify signed bundle resources', async t => {
  const source = await fs.readFile(path.join(__dirname, '../electron/main.js'), 'utf8')
  const bootstrap = source.slice(0, source.indexOf("const { spawn, execFile }"))
  const env = { ...process.env }
  delete env.PYTHONDONTWRITEBYTECODE
  delete env.PYTHONPYCACHEPREFIX
  vm.runInNewContext(bootstrap, { require: () => ({ app: { isPackaged: true } }), process: { env } })
  assert.equal(env.PYTHONDONTWRITEBYTECODE, '1')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-signed-python-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.writeFile(path.join(root, 'signed_helper.py'), 'value = 7\n')
  const result = spawnSync('python3', ['-c', 'import signed_helper; assert signed_helper.value == 7'], { cwd: root, env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(await fs.readdir(root), ['signed_helper.py'])
  const development = {}
  vm.runInNewContext(bootstrap, { require: () => ({ app: { isPackaged: false } }), process: { env: development } })
  assert.equal(development.PYTHONDONTWRITEBYTECODE, undefined)
})
