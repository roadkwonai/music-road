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
  for (const file of ['python/yue_mlx_setup.py', 'python/yue_mlx_worker.py', 'docs/yue-mlx.md']) assert.ok(names.includes(file), file)
  for (const file of ['docs/README.md', 'docs/assets/brand/banner.svg', 'releases/README.md']) assert.ok(names.includes(file), file)
  for (const document of ['cli.md', 'cli-reference.md', 'cli-design.md', 'cli-qa-report.md', 'cli-install.md', 'ai-cli.md', 'quickstart.md', 'project-guide.md', 'updates.md', 'music-options.md', 'genre-prompts.md', 'music-research.md', 'ace-prompt-guide.md', 'vendor/ace-step-1.5/README.md', 'vendor/ace-step-1.5/manifest.json', 'vendor/ace-step-1.5/LICENSE', 'vendor/ace-step-1.5/en/Tutorial.md', 'vendor/ace-step-1.5/en/INFERENCE.md', 'vendor/ace-step-1.5/en/ace_step_musicians_guide.md', 'vendor/ace-step-1.5/ko/Tutorial.md', 'vendor/ace-step-1.5/ko/INFERENCE.md']) assert.ok(names.includes(`docs/${document}`), document)
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'prompts/cli-workflows.md']) assert.ok(names.includes(file))
  for (const file of ['docs/lyrics-tags.md', 'docs/music-review.md', 'docs/model-production-guide.md', 'skills/road-music-ace/SKILL.md', 'prompts/ace-review.md']) assert.ok(names.includes(file), file)
  assert.deepEqual(names.filter(name => /(^|\/)(\.omc|\.omx|\.impeccable|__pycache__)(\/|$)|\.pyc$/.test(name)), [])
})
