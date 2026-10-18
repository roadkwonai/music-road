'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { run } = require('../cli/client')
const { commands, validate } = require('../electron/cli-catalog')
const { parseArgs, prepareSkillsBundle, setupCli } = require('../scripts/setup-cli')

async function fixture (t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-music-skills-cli-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const manager = path.join(root, 'skills', 'road-music-skills-update', 'scripts')
  await fs.mkdir(manager, { recursive: true })
  await fs.writeFile(path.join(manager, 'manage.cjs'), "'use strict'\nconst calls = []\nexports.calls = calls\nexports.execute = async (action, params) => { calls.push({ action, params }); if (action === 'watch') await new Promise(resolve => setTimeout(resolve, params.timeoutMs)); params.onEvent?.({ event: 'stage', action }); return { action, target: params.target, source: params.source, timeoutMs: params.timeoutMs } }\n")
  const studio = path.join(root, 'skills', 'road-music-video-studio', 'scripts')
  await fs.mkdir(studio, { recursive: true })
  await fs.writeFile(path.join(studio, 'studio.py'), "'use strict'\nconst fs = require('node:fs')\nconst args = process.argv.slice(2)\nconst value = key => args[args.indexOf(key) + 1]\nif (args[0] === 'init') fs.mkdirSync(value('--out'), { recursive: true })\nprocess.stderr.write('{\\\"event\\\":\\\"studio-')\nsetTimeout(() => { process.stderr.write('ready\\\",\\\"url\\\":\\\"http://127.0.0.1:43100/\\\"}\\n'); process.stdout.write(JSON.stringify({ status: 'ok', args }) + '\\n') }, 5)\n")
  return root
}

test('skills and motion commands are public local CLI commands with constrained inputs', () => {
  for (const command of ['skills:status', 'skills:check', 'skills:install', 'skills:update', 'skills:watch', 'motion:handoff', 'motion:studio']) assert.ok(commands[command], command)
  assert.throws(() => validate('skills:install', { target: 'relative' }), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => validate('motion:handoff', { music: '/tmp/music.mp3', out: '/tmp/project', mode: 'shell-code' }), { code: 'INVALID_ARGUMENT' })
  assert.doesNotThrow(() => validate('motion:handoff', { out: '/tmp/project' }))
  assert.doesNotThrow(() => validate('motion:handoff', { music: '/tmp/music.mp3', out: '/tmp/project', mode: 'showreel-motion', host: 'antigravity' }))
  assert.doesNotThrow(() => validate('motion:studio', { project: '/tmp/project', review: true }))
})

test('shared music skill keeps music-only requests separate from the completed-music HTML handoff', () => {
  const skill = require('node:fs').readFileSync(path.join(__dirname, '..', 'skills', 'road-music', 'SKILL.md'), 'utf8')
  assert.match(skill, /음악과 HTML 모션그래픽 제작을 함께 요청했을 때만/)
  assert.match(skill, /job:wait/)
  assert.match(skill, /songs:list/)
  assert.match(skill, /motion:handoff/)
  assert.match(skill, /nextCommand/)
})

test('skills install uses the bundled source, keeps stdout to one JSON line, and sends events to stderr', async t => {
  const root = await fixture(t)
  const target = path.join(root, 'installed')
  let stdout = ''; let stderr = ''
  const code = await run(['skills:install', '--host', 'antigravity', '--skills-target', target, '--events'], {
    skillsRoot: root,
    stdout: { write: value => { stdout += value } },
    stderr: { write: value => { stderr += value } }
  })
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(stdout), { ok: true, result: { action: 'install', target, source: root } })
  const events = stderr.trim().split('\n').map(JSON.parse)
  assert.deepEqual(events.map(event => event.channel), ['skills:started', 'stage', 'skills:completed'])
  const manager = require(path.join(root, 'skills', 'road-music-skills-update', 'scripts', 'manage.cjs'))
  assert.equal(manager.calls[0].action, 'install')
  assert.equal(manager.calls[0].params.host, 'antigravity')
})

test('skills update uses the manager release path unless a source is explicitly supplied', async t => {
  const root = await fixture(t)
  const target = path.join(root, 'installed')
  let stdout = ''
  const code = await run(['skills:update', '--json', JSON.stringify({ target })], {
    skillsRoot: root,
    stdout: { write: value => { stdout += value } }
  })
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(stdout), { ok: true, result: { action: 'update', target } })
  const manager = require(path.join(root, 'skills', 'road-music-skills-update', 'scripts', 'manage.cjs'))
  assert.equal(manager.calls[0].action, 'update')
  assert.equal(manager.calls[0].params.source, undefined)
})

test('skills watch maps common and batch timeouts to the manager and waits for the requested interval', async t => {
  const root = await fixture(t)
  const target = path.join(root, 'installed')
  let stdout = ''
  const started = Date.now()
  assert.equal(await run(['skills:watch', '--timeout', '25', '--json', JSON.stringify({ target })], {
    skillsRoot: root, stdout: { write: value => { stdout += value } }
  }), 0)
  assert.ok(Date.now() - started >= 20)
  assert.equal(JSON.parse(stdout).result.timeoutMs, 25)
  stdout = ''
  const batchStarted = Date.now()
  assert.equal(await run(['batch'], {
    skillsRoot: root, stdout: { write: value => { stdout += value } },
    stdinText: JSON.stringify({ id: 'watch', command: 'skills:watch', params: { target }, timeout: 22 })
  }), 0)
  assert.ok(Date.now() - batchStarted >= 18)
  assert.equal(JSON.parse(stdout).result.timeoutMs, 22)
})

test('motion handoff only passes fixed studio arguments and returns the studio JSON response', async t => {
  const root = await fixture(t)
  const music = path.join(root, 'song.mp3')
  const out = path.join(root, 'project')
  await fs.writeFile(music, 'audio')
  let stdout = ''
  const code = await run(['motion:handoff', '--json', JSON.stringify({ music, out, mode: 'showreel-cd', host: 'codex' })], {
    skillsRoot: root,
    python: process.execPath,
    stdout: { write: value => { stdout += value } }
  })
  assert.equal(code, 0)
  assert.equal(stdout.trim().split('\n').length, 1)
  const row = JSON.parse(stdout)
  assert.equal(row.ok, true)
  assert.deepEqual(row.result.args.slice(1), ['--out', out, '--music', music, '--mode', 'showreel-cd', '--host', 'codex'])
  assert.deepEqual(row.result.nextCommand, { command: 'motion:studio', params: { project: out, host: 'codex', open: true } })
  assert.equal((await fs.stat(out)).isDirectory(), true)
})

test('motion handoff can create a project before an audio file is chosen', async t => {
  const root = await fixture(t)
  const out = path.join(root, 'project-without-music')
  let stdout = ''
  const code = await run(['motion:handoff', '--json', JSON.stringify({ out })], {
    skillsRoot: root, python: process.execPath, stdout: { write: value => { stdout += value } }
  })
  assert.equal(code, 0)
  const row = JSON.parse(stdout)
  assert.deepEqual(row.result.args.slice(1), ['--out', out])
  assert.deepEqual(row.result.nextCommand, { command: 'motion:studio', params: { project: out, host: 'codex', open: true } })
})

test('motion studio forwards a partial studio-ready event and the review flag', async t => {
  const root = await fixture(t)
  const project = path.join(root, 'project')
  await fs.mkdir(project)
  let stdout = ''; let stderr = ''
  const code = await run(['motion:studio', '--events', '--json', JSON.stringify({ project, review: true, timeout: 30 })], {
    skillsRoot: root,
    python: process.execPath,
    stdout: { write: value => { stdout += value } },
    stderr: { write: value => { stderr += value } }
  })
  assert.equal(code, 0)
  assert.equal(stdout.trim().split('\n').length, 1)
  const row = JSON.parse(stdout)
  assert.equal(row.ok, true)
  assert.ok(row.result.args.includes('--review'))
  const ready = stderr.trim().split('\n').map(JSON.parse).find(event => event.channel === 'studio-ready')
  assert.deepEqual(ready, { type: 'event', channel: 'studio-ready', payload: { url: 'http://127.0.0.1:43100/' } })
})

test('setup CLI parses host and explicit target and delegates bundled skill installation after npm ci', async t => {
  const parsed = parseArgs(['--host', 'antigravity-cli', '--skills-target', '/tmp/agent-skills'])
  assert.deepEqual(parsed, { host: 'antigravity-cli', target: '/tmp/agent-skills' })
  assert.throws(() => parseArgs(['--skills-target', 'relative/skills']), /절대 경로/)
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'road-music-setup-'))
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }))
  await fs.writeFile(path.join(projectRoot, '.git'), 'gitdir: /fixture')
  const calls = []
  const result = await setupCli({
    nodeVersion: '24.0.0', root: projectRoot, host: 'codex', target: '/tmp/codex-skills',
    npmCi: async options => { calls.push(['npm', options.cwd]) },
    runGit: async ({ cwd }) => {
      calls.push(['git', cwd])
      const bundle = path.join(cwd, 'skills', 'music-road-skills')
      await fs.mkdir(bundle, { recursive: true })
      await fs.writeFile(path.join(bundle, 'manifest.json'), '{}')
    },
    installSkills: async (command, params, options) => { calls.push(['skills', command, params, options.skillsRoot]); return { installed: true } }
  })
  assert.equal(result.skills.installed, true)
  assert.deepEqual(calls, [
    ['npm', projectRoot],
    ['git', projectRoot],
    ['skills', 'skills:install', { host: 'codex', target: '/tmp/codex-skills' }, path.join(projectRoot, 'skills', 'music-road-skills')]
  ])
})

test('prepares only the missing skills submodule in a source checkout and rejects a bare kit missing its bundle', async t => {
  const source = await fs.mkdtemp(path.join(os.tmpdir(), 'road-music-source-'))
  const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'road-music-bare-'))
  t.after(() => Promise.all([fs.rm(source, { recursive: true, force: true }), fs.rm(bare, { recursive: true, force: true })]))
  await fs.writeFile(path.join(source, '.git'), 'gitdir: /fixture')
  const calls = []
  const root = await prepareSkillsBundle({
    projectRoot: source,
    runGit: async ({ cwd }) => {
      calls.push(cwd)
      const bundle = path.join(cwd, 'skills', 'music-road-skills')
      await fs.mkdir(bundle, { recursive: true })
      await fs.writeFile(path.join(bundle, 'manifest.json'), '{}')
    }
  })
  assert.equal(root, path.join(source, 'skills', 'music-road-skills'))
  assert.deepEqual(calls, [source])
  await prepareSkillsBundle({ projectRoot: source, runGit: async () => { throw new Error('already prepared') } })
  await assert.rejects(prepareSkillsBundle({ projectRoot: bare }), /배포 ZIP은 누락된 번들을 복구할 수 없으므로/)
})
