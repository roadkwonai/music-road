'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const { packageCli } = require('../scripts/package-cli')
const { version } = require('../package.json')

test('CLI ZIP includes install instructions, locked dependencies, and a working schema', { skip: process.platform !== 'darwin' }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-cli-kit-'))
  t.after(() => fs.rm(temp, { recursive: true, force: true }))
  const result = await packageCli(temp)
  assert.ok(result.bytes > 1000)
  const entries = execFileSync('/usr/bin/unzip', ['-Z1', result.path], { encoding: 'utf8' }).trim().split('\n')
  const name = `RoadMusic-${version}-cli`
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'package-lock.json', 'cli/road-music.js', 'docs/cli-install.md', 'docs/ai-cli.md', 'prompts/cli-workflows.md']) {
    assert.ok(entries.includes(`${name}/${file}`), file)
  }
  assert.deepEqual(entries.filter(file => /(^|\/)(node_modules|\.git|\.omx|\.omc|\.impeccable|__pycache__)(\/|$)|\.pyc$/.test(file)), [])
  const extracted = path.join(temp, 'extracted')
  execFileSync('/usr/bin/ditto', ['-x', '-k', result.path, extracted])
  const row = JSON.parse(execFileSync(process.execPath, [path.join(extracted, name, 'cli/road-music.js'), 'schema'], { encoding: 'utf8' }))
  assert.equal(row.ok, true)
  assert.equal(row.result.commands.length, 111)
})
