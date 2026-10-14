'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

test('npm package contains runtime files and excludes local session state and caches', () => {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
  }))
  const names = pack.files.map(file => file.path)
  assert.ok(names.includes('cli/road-music.js'))
  assert.ok(names.includes('electron/main.js'))
  assert.ok(names.includes('renderer/index.html'))
  for (const document of ['cli.md', 'cli-reference.md', 'cli-design.md', 'cli-qa-report.md', 'cli-install.md', 'ai-cli.md', 'quickstart.md', 'project-guide.md']) assert.ok(names.includes(`docs/${document}`))
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'prompts/cli-workflows.md']) assert.ok(names.includes(file))
  assert.deepEqual(names.filter(name => /(^|\/)(\.omc|\.omx|\.impeccable|__pycache__)(\/|$)|\.pyc$/.test(name)), [])
})
