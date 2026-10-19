'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { run } = require('../cli/client')
const catalog = require('../electron/cli-catalog')
const { getSchema } = require('../electron/cli-transport')

test('work favorites are strict local commands without Electron startup', async t => {
  for (const name of ['works:list', 'works:favorite']) assert.ok(getSchema().localCommands.includes(name), name)
  assert.throws(() => catalog.validate('works:favorite', { groupId: 'x', favorite: true }), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => catalog.validate('works:list', { favoritesOnly: 'true' }), { code: 'INVALID_ARGUMENT' })
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'road-works-cli-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const script = path.join(root, 'fixture.js')
  fs.writeFileSync(script, "process.stdout.write(JSON.stringify({ok:true,result:{action:process.argv[2],params:JSON.parse(require('node:fs').readFileSync(0,'utf8')),profile:process.env.ROADMUSIC_DATA_DIR}})+'\\n')")
  const options = { storageOptions: { script, python: process.execPath }, userData: path.join(root, 'profile'), spawnProcess: () => { throw Error('Electron must not start') } }
  let output = ''
  assert.equal(await run(['works:favorite', '--json', JSON.stringify({ groupId: 'a'.repeat(64), favorite: true })], { ...options, stdout: { write: text => { output += text } } }), 0)
  assert.equal(JSON.parse(output).result.params.favorite, true)
  assert.equal(JSON.parse(output).result.profile, options.userData)
  output = ''
  assert.equal(await run(['batch', '--no-start'], { ...options, stdinText: '{"command":"works:list","params":{"favoritesOnly":true}}', stdout: { write: text => { output += text } } }), 0)
  assert.equal(JSON.parse(output).result.action, 'list')
  assert.equal(JSON.parse(output).result.params.favoritesOnly, true)
})
