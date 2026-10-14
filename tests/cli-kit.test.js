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
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'package-lock.json', 'cli/road-music.js', 'docs/cli-install.md', 'docs/ai-cli.md', 'docs/music-options.md', 'docs/genre-prompts.md', 'docs/music-research.md', 'docs/ace-prompt-guide.md', 'docs/vendor/ace-step-1.5/README.md', 'docs/vendor/ace-step-1.5/manifest.json', 'docs/vendor/ace-step-1.5/LICENSE', 'docs/vendor/ace-step-1.5/en/Tutorial.md', 'docs/vendor/ace-step-1.5/en/INFERENCE.md', 'docs/vendor/ace-step-1.5/en/ace_step_musicians_guide.md', 'docs/vendor/ace-step-1.5/ko/Tutorial.md', 'docs/vendor/ace-step-1.5/ko/INFERENCE.md', 'prompts/cli-workflows.md']) {
    assert.ok(entries.includes(`${name}/${file}`), file)
  }
  assert.deepEqual(entries.filter(file => /(^|\/)(node_modules|\.git|\.omx|\.omc|\.impeccable|__pycache__)(\/|$)|\.pyc$/.test(file)), [])
  for (const file of ['docs/lyrics-tags.md', 'docs/music-review.md', 'skills/road-music-ace/SKILL.md', 'prompts/ace-review.md']) {
    assert.ok(entries.includes(`${name}/${file}`), `AI 음악 제작 자료 누락: ${file}`)
  }
  const extracted = path.join(temp, 'extracted')
  execFileSync('/usr/bin/ditto', ['-x', '-k', result.path, extracted])
  const kitRoot = path.join(extracted, name)
  const skillPath = path.join(kitRoot, 'skills/road-music-ace/SKILL.md')
  const skill = await fs.readFile(skillPath, 'utf8')
  for (const [, reference] of skill.matchAll(/\]\(([^)]+)\)/g)) {
    const target = path.resolve(path.dirname(skillPath), reference.split('#')[0])
    assert.ok(target.startsWith(kitRoot + path.sep), `키트 밖 스킬 참조: ${reference}`)
    await fs.access(target)
  }
  const row = JSON.parse(execFileSync(process.execPath, [path.join(extracted, name, 'cli/road-music.js'), 'schema'], { encoding: 'utf8' }))
  assert.equal(row.ok, true)
  const source = require('../electron/cli-transport').getSchema()
  assert.deepEqual(row.result.commands.map(item => item.command), source.commands.map(item => item.command))
})
