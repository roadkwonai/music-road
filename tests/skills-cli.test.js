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
  await fs.writeFile(path.join(manager, 'manage.cjs'), "'use strict'\nexports.execute = async (action, params) => { params.onEvent?.({ event: 'stage', action }); return { action, target: params.target, source: params.source, timeoutMs: params.timeoutMs } }\n")
  const studio = path.join(root, 'skills', 'road-music-video-studio', 'scripts')
  await fs.mkdir(studio, { recursive: true })
  await fs.writeFile(path.join(studio, 'studio.py'), "'use strict'\nconst fs = require('node:fs')\nconst args = process.argv.slice(2)\nconst value = key => args[args.indexOf(key) + 1]\nconst project = args[0] === 'init' ? value('--out') + '--actual' : value('--project')\nif (args[0] === 'init') fs.mkdirSync(project, { recursive: true })\nprocess.stderr.write(JSON.stringify({ event: 'studio-ready' }) + '\\n')\nprocess.stdout.write(JSON.stringify({ status: 'ok', project, args }) + '\\n')\n")
  return root
}

test('skills and motion commands are catalogued locally with constrained parameters', () => {
  for (const command of ['skills:status', 'skills:check', 'skills:install', 'skills:update', 'skills:watch', 'motion:handoff', 'motion:studio']) assert.ok(commands[command], command)
  assert.throws(() => validate('skills:install', { target: 'relative' }), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => validate('motion:handoff', { out: '/tmp/project', mode: 'shell-code' }), { code: 'INVALID_ARGUMENT' })
  assert.doesNotThrow(() => validate('motion:studio', { project: '/tmp/project', review: true }))
})

test('skills install uses the local bundle, forwards events, and accepts host flags', async t => {
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
  assert.deepEqual(stderr.trim().split('\n').map(JSON.parse).map(event => event.channel), ['skills:started', 'stage', 'skills:completed'])
})

test('motion handoff uses fixed arguments and returns a follow-up studio command', async t => {
  const root = await fixture(t)
  const music = path.join(root, 'song.mp3')
  const out = path.join(root, 'project')
  await fs.writeFile(music, 'audio')
  let stdout = ''; let stderr = ''
  const code = await run(['motion:handoff', '--events', '--json', JSON.stringify({ music, out, mode: 'showreel-cd', host: 'codex' })], {
    skillsRoot: root, python: process.execPath, stdout: { write: value => { stdout += value } }, stderr: { write: value => { stderr += value } }
  })
  assert.equal(code, 0)
  const result = JSON.parse(stdout).result
  assert.deepEqual(result.args.slice(1), ['--out', out, '--music', music, '--mode', 'showreel-cd', '--host', 'codex'])
  assert.deepEqual(result.nextCommand, { command: 'motion:studio', params: { project: `${out}--actual`, host: 'codex', open: true } })
  const events = stderr.trim().split('\n').map(JSON.parse)
  assert.deepEqual(events.find(event => event.channel === 'motion:started').payload, { command: 'motion:handoff', requestedProject: out })
  assert.deepEqual(events.find(event => event.channel === 'motion:completed').payload, { command: 'motion:handoff', project: `${out}--actual`, requestedProject: out })
})

test('setup CLI prepares only a missing skills bundle and installs into the requested target', async t => {
  assert.deepEqual(parseArgs(['--host', 'antigravity-cli', '--skills-target', '/tmp/agent-skills']), { host: 'antigravity-cli', target: '/tmp/agent-skills' })
  assert.throws(() => parseArgs(['--skills-target', 'relative/skills']), /절대 경로/)
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-music-setup-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.writeFile(path.join(root, '.git'), 'gitdir: /fixture')
  const calls = []
  const result = await setupCli({
    nodeVersion: '24.0.0', root, target: '/tmp/codex-skills',
    npmCi: async ({ cwd }) => { calls.push(['npm', cwd]) },
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
    ['npm', root],
    ['git', root],
    ['skills', 'skills:install', { host: 'codex', target: '/tmp/codex-skills' }, path.join(root, 'skills', 'music-road-skills')]
  ])
  await prepareSkillsBundle({ projectRoot: root, runGit: async () => { throw new Error('already prepared') } })
})
