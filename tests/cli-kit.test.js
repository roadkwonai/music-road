'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const { packageCli } = require('../scripts/package-cli')
const { version } = require('../cli/package.json')

test('CLI ZIP includes install instructions, locked dependencies, and a working schema', { skip: process.platform !== 'darwin' }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-cli-kit-'))
  t.after(() => fs.rm(temp, { recursive: true, force: true }))
  const result = await packageCli(temp)
  assert.ok(result.bytes > 1000)
  const entries = execFileSync('/usr/bin/unzip', ['-Z1', result.path], { encoding: 'utf8' }).trim().split('\n')
  const name = `RoadMusic-CLI-${version}`
  for (const file of ['cli/yue.js', 'python/yue_mlx_setup.py', 'python/yue_mlx_worker.py', 'python/yue_options.py', 'python/yue_stages.py', 'python/yue_score_tools.py', 'python/abc_tools.py', 'docs/yue-mlx.md', 'docs/yue-cli-workflow.md', 'docs/vendor/yue2/official/skills/yue2-music/scripts/abc_tools.py']) {
    assert.ok(entries.includes(`${name}/${file}`), file)
  }
  for (const file of ['docs/README.md', 'docs/assets/brand/banner.svg', 'releases/README.md', 'DESIGN.md', '.agents/skills/harness/SKILL.md', '.agents/skills/road-music-mv/SKILL.md', '.codex/agents/mv_director.toml', '.harness/music-video/pilot-analysis.md']) {
    assert.ok(entries.includes(`${name}/${file}`), file)
  }
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'package-lock.json', 'cli/road-music.js', 'docs/cli-install.md', 'docs/ai-cli.md', 'docs/music-options.md', 'docs/genre-prompts.md', 'docs/music-research.md', 'docs/ace-prompt-guide.md', 'docs/vendor/ace-step-1.5/README.md', 'docs/vendor/ace-step-1.5/manifest.json', 'docs/vendor/ace-step-1.5/LICENSE', 'docs/vendor/ace-step-1.5/en/Tutorial.md', 'docs/vendor/ace-step-1.5/en/INFERENCE.md', 'docs/vendor/ace-step-1.5/en/ace_step_musicians_guide.md', 'docs/vendor/ace-step-1.5/ko/Tutorial.md', 'docs/vendor/ace-step-1.5/ko/INFERENCE.md', 'prompts/cli-workflows.md']) {
    assert.ok(entries.includes(`${name}/${file}`), file)
  }
  assert.deepEqual(entries.filter(file => /(^|\/)(node_modules|\.git|\.omx|\.omc|\.impeccable|__pycache__)(\/|$)|\.pyc$/.test(file)), [])
  for (const file of ['docs/lyrics-tags.md', 'docs/music-review.md', 'docs/model-production-guide.md', 'docs/yue-prompt-guide.md', 'docs/vendor/yue2/manifest.json', 'docs/vendor/yue2/official/docs/generation.md', 'docs/vendor/yue2/mlx/docs/usage.md', 'skills/road-music/SKILL.md', 'skills/road-music-ace/SKILL.md', 'prompts/ace-review.md']) {
    assert.ok(entries.includes(`${name}/${file}`), `AI 음악 제작 자료 누락: ${file}`)
  }
  for (const file of ['skills/road-music-storage/SKILL.md', 'skills/road-music-storage/agents/openai.yaml', 'skills/road-music-storage/references/workflow.md', 'skills/road-music-video-studio/SKILL.md', 'skills/road-music-video-studio/scripts/storage_manager.py', 'skills/road-music-video-studio/scripts/storage_legacy.py', 'skills/road-music-video-studio/scripts/storage_restructure.py', 'skills/road-music-video-studio/scripts/storage_archive_history.py', 'skills/road-music-video-studio/assets/guides/storage.md', 'skills/road-music-video-studio/assets/design/fonts.css']) {
    const bundled = file.replace('skills/road-music-video-studio/', 'skills/music-road-skills/skills/road-music-video-studio/')
    assert.ok(entries.includes(`${name}/${file}`) || entries.includes(`${name}/${bundled}`), `저장공간 CLI 자료 누락: ${file}`)
  }
  await require('../cli/update').inspectArchive(result.path, version)
  assert.equal(entries.some(file => file.startsWith('__MACOSX/') || file.split('/').some(part => part.startsWith('._'))), false)
  if (entries.includes(`${name}/skills/music-road-skills/manifest.json`)) {
    assert.equal(entries.some(file => file.startsWith(`${name}/.agents/skills/road-music-video-studio/`)), false)
    assert.equal(entries.some(file => file.startsWith(`${name}/skills/road-music-video-studio/`)), false)
  }
  const extracted = path.join(temp, 'extracted')
  execFileSync('/usr/bin/ditto', ['-x', '-k', result.path, extracted])
  const kitRoot = path.join(extracted, name)
  if (entries.includes(`${name}/skills/music-road-skills/manifest.json`)) {
    assert.equal(JSON.parse(await fs.readFile(path.join(kitRoot, 'skills/music-road-skills/manifest.json'), 'utf8')).version, JSON.parse(await fs.readFile(path.join(__dirname, '../skills/music-road-skills/manifest.json'), 'utf8')).version)
    for (const file of ['manifest.json', 'skills/road-music-video-studio/SKILL.md', 'skills/road-music-video-studio/assets/guides/ccm.md', 'skills/road-music-video-studio/assets/knowledge/ccm-recipes.json']) {
      assert.deepEqual(await fs.readFile(path.join(kitRoot, 'skills/music-road-skills', file)), await fs.readFile(path.join(__dirname, '../skills/music-road-skills', file)))
    }
  }
  execFileSync(process.execPath, ['--test', 'tests/documentation-links.test.js'], { cwd: kitRoot, stdio: 'pipe' })
  for (const name of ['road-music', 'road-music-ace', 'road-music-storage', 'road-music-production-records']) {
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
  const prepared = JSON.parse(execFileSync(process.execPath, [path.join(kitRoot, 'cli/road-music.js'), 'song:prepare', '--json', JSON.stringify({ engine: 'yue-mlx', style: 'Korean ballad', lyrics: '[Verse]\n오늘도 너를 기다려', seed: '9223372036854775807' })], { cwd: temp, encoding: 'utf8' }))
  assert.equal(prepared.result.valid, true)
  assert.equal(prepared.result.nativeRequest.seed, '9223372036854775807')
  const score = 'X:1\nT:\nM:4/4\nL:1/32\nQ:1/4=80\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nV: Ins clef=treble name="Ins Melody" snm="Inst."\nK:C\n% verse\nV: Vocal\n"C"C32|\nV: Ins\nZ|\n'
  const inspected = JSON.parse(execFileSync(process.execPath, [path.join(kitRoot, 'cli/road-music.js'), 'score:inspect', '--json', JSON.stringify({ text: score })], {
    cwd: temp, env: { ...process.env, ROADMUSIC_DATA_DIR: path.join(temp, 'score-profile'), ROADMUSIC_SCORE_PYTHON: 'python3' }, encoding: 'utf8'
  }))
  assert.equal(inspected.result.bpm, 80)
  const storage = JSON.parse(execFileSync(process.execPath, [path.join(kitRoot, 'cli/road-music.js'), 'storage:list'], {
    cwd: temp, env: { ...process.env, ROADMUSIC_DATA_DIR: path.join(temp, 'storage-profile') }, encoding: 'utf8'
  }))
  assert.deepEqual(storage, { ok: true, result: { projects: [], totals: { totalBytes: 0, reclaimableBytes: 0 }, disk: storage.result.disk } })
  const productionEnv = { ...process.env, ROADMUSIC_DATA_DIR: path.join(temp, 'production-profile') }
  const empty = JSON.parse(execFileSync(process.execPath, [path.join(kitRoot, 'cli/road-music.js'), 'production:projects'], { cwd: temp, env: productionEnv, encoding: 'utf8' }))
  assert.deepEqual(empty.result.projects, [])
  await assert.rejects(fs.access(path.join(productionEnv.ROADMUSIC_DATA_DIR, 'storage.sqlite3')))
  const original = '배포 키트 최초 제작 요청\n원문을 보존합니다.'
  const request = JSON.parse(execFileSync(process.execPath, [path.join(kitRoot, 'cli/road-music.js'), 'production:request', '--stdin'], { cwd: temp, env: productionEnv, input: JSON.stringify({ project: path.join(temp, 'new-work'), domain: 'music', prompt: original }), encoding: 'utf8' }))
  assert.equal(request.ok, true)
  const prompts = JSON.parse(execFileSync(process.execPath, [path.join(kitRoot, 'cli/road-music.js'), 'production:prompts'], { cwd: temp, env: productionEnv, encoding: 'utf8' }))
  assert.equal(prompts.result.mainPrompts[0].prompt, original)

})
