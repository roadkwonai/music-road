'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const { assertSkillsBundle, packageCli, packageFilter } = require('../scripts/package-cli')
const { version } = require('../cli/package.json')

test('CLI npm package declares the bundled motion-graphics skills without adding them to the desktop build', () => {
  const manifest = require('../package.json')
  assert.ok(manifest.files.includes('skills/music-road-skills/**'))
  assert.ok(manifest.files.includes('scripts/setup-cli.js'))
  assert.ok(!manifest.build.files.includes('skills/music-road-skills/**'))
  assert.equal(packageFilter('/fixture/skills/music-road-skills/.git'), false)
  assert.equal(packageFilter('/fixture/skills/music-road-skills/manifest.json'), true)
})

test('release ZIP creation fails closed when the required skill bundle is absent', { skip: process.platform !== 'darwin' }, async t => {
  const bundle = path.join(__dirname, '..', 'skills', 'music-road-skills')
  try { await fs.access(bundle); return } catch {}
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-cli-release-'))
  t.after(() => fs.rm(temp, { recursive: true, force: true }))
  await assert.rejects(packageCli(temp, undefined, { requireSkillsBundle: true }), /music-road-skills 번들/)
})

test('release ZIP requires the bundle manifest, updater, and HTML studio files', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-incomplete-skills-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'skills', 'music-road-skills'), { recursive: true })
  await assert.rejects(assertSkillsBundle(root), /완전한 skills\/music-road-skills 번들/)
})

test('CLI ZIP includes install instructions, locked dependencies, and a working schema', { skip: process.platform !== 'darwin' }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-cli-kit-'))
  t.after(() => fs.rm(temp, { recursive: true, force: true }))
  const result = await packageCli(temp)
  assert.ok(result.bytes > 1000)
  const entries = execFileSync('/usr/bin/unzip', ['-Z1', result.path], { encoding: 'utf8' }).trim().split('\n')
  const name = `RoadMusic-CLI-${version}`
  for (const file of ['python/yue_mlx_setup.py', 'python/yue_mlx_worker.py', 'docs/yue-mlx.md']) {
    assert.ok(entries.includes(`${name}/${file}`), file)
  }
  for (const file of ['docs/README.md', 'docs/assets/brand/banner.svg', 'releases/README.md', 'release/2026-10-18-cli-0-1-1-skills-studio.md']) {
    assert.ok(entries.includes(`${name}/${file}`), file)
  }
  try {
    await fs.access(path.join(__dirname, '..', 'skills', 'music-road-skills', 'manifest.json'))
    assert.ok(entries.includes(`${name}/skills/music-road-skills/manifest.json`), 'bundled skills manifest')
    assert.ok(entries.includes(`${name}/skills/music-road-skills/README.md`), 'bundled skills README')
  } catch {}
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'package-lock.json', 'cli/road-music.js', 'docs/cli-install.md', 'docs/ai-cli.md', 'docs/music-options.md', 'docs/genre-prompts.md', 'docs/music-research.md', 'docs/ace-prompt-guide.md', 'docs/vendor/ace-step-1.5/README.md', 'docs/vendor/ace-step-1.5/manifest.json', 'docs/vendor/ace-step-1.5/LICENSE', 'docs/vendor/ace-step-1.5/en/Tutorial.md', 'docs/vendor/ace-step-1.5/en/INFERENCE.md', 'docs/vendor/ace-step-1.5/en/ace_step_musicians_guide.md', 'docs/vendor/ace-step-1.5/ko/Tutorial.md', 'docs/vendor/ace-step-1.5/ko/INFERENCE.md', 'prompts/cli-workflows.md']) {
    assert.ok(entries.includes(`${name}/${file}`), file)
  }
  assert.deepEqual(entries.filter(file => /(^|\/)(node_modules|\.git|\.omx|\.omc|\.impeccable|__pycache__)(\/|$)|\.pyc$/.test(file)), [], 'noGitMetadata')
  for (const file of ['docs/lyrics-tags.md', 'docs/music-review.md', 'docs/model-production-guide.md', 'docs/yue-prompt-guide.md', 'docs/vendor/yue2/manifest.json', 'skills/road-music/SKILL.md', 'skills/road-music-ace/SKILL.md', 'prompts/ace-review.md']) {
    assert.ok(entries.includes(`${name}/${file}`), `AI 음악 제작 자료 누락: ${file}`)
  }
  const extracted = path.join(temp, 'extracted')
  execFileSync('/usr/bin/ditto', ['-x', '-k', result.path, extracted])
  const kitRoot = path.join(extracted, name)
  for (const name of ['road-music', 'road-music-ace']) {
    const skillPath = path.join(kitRoot, 'skills', name, 'SKILL.md')
    const skill = await fs.readFile(skillPath, 'utf8')
    assert.equal(skill.match(/^name: (.+)$/m)[1], name)
    for (const [, reference] of skill.matchAll(/\]\(([^)]+)\)/g)) {
      const target = path.resolve(path.dirname(skillPath), reference.split('#')[0])
      assert.ok(target.startsWith(kitRoot + path.sep), `키트 밖 스킬 참조: ${reference}`)
      await fs.access(target)
    }
  }
  const row = JSON.parse(execFileSync(process.execPath, [path.join(extracted, name, 'cli/road-music.js'), 'schema'], { cwd: temp, encoding: 'utf8' }))
  assert.equal(row.ok, true)
  const source = require('../electron/cli-transport').getSchema()
  assert.deepEqual(row.result.commands.map(item => item.command), source.commands.map(item => item.command))
})
