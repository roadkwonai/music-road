'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { run } = require('../cli/client')
const { studioRoot } = require('../cli/studio')
const catalog = require('../electron/cli-catalog')
const { getSchema } = require('../electron/cli-transport')

const requestId = 'a'.repeat(48)
const versionId = 'b'.repeat(64)

function params (extra = {}) {
  return { project: '/tmp/work', requestId, target: 'music', intent: 'review', prompt: '후렴의 드럼을 더 강하게 검토해 주세요.', baseVersionId: versionId, ...extra }
}

test('studio agent commands are local and validate only the public request contract', () => {
  const names = ['studio:agent:status', 'studio:agent:bind', 'studio:conversation:history', 'studio:draft:get', 'studio:draft:set', 'studio:request:submit', 'studio:request:status', 'studio:request:update']
  for (const name of names) assert.ok(getSchema().localCommands.includes(name), name)
  assert.deepEqual(catalog.validate('studio:request:submit', params({ range: { start: 12.5, end: 18 } })).paramsValue.range, { start: 12.5, end: 18 })
  assert.throws(() => catalog.validate('studio:request:submit', params({ prompt: '' })), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => catalog.validate('studio:request:submit', params({ baseVersionId: 'bad' })), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => catalog.validate('studio:request:submit', params({ range: { start: -1, end: 2 } })), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => catalog.validate('studio:request:submit', params({ extra: true })), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => catalog.validate('studio:request:update', { project: '/tmp/work', requestId, status: 'saved' }), { code: 'INVALID_ARGUMENT' })
  assert.equal(catalog.validate('studio:request:submit', params({ target: 'chat' })).paramsValue.intent, 'review')
  assert.throws(() => catalog.validate('studio:request:submit', params({ target: 'chat', intent: 'produce' })), { code: 'INVALID_ARGUMENT' })
  assert.deepEqual(catalog.validate('studio:conversation:history', { project: '/tmp/work', cursor: 'opaque-turn-cursor', limit: 5 }).paramsValue, { project: '/tmp/work', cursor: 'opaque-turn-cursor', limit: 5 })
  for (const value of [{ limit: 0 }, { limit: 21 }, { threadId: 'a-different-chat' }, { method: 'turn/start' }, { cursor: '' }]) {
    assert.throws(() => catalog.validate('studio:conversation:history', { project: '/tmp/work', ...value }), { code: 'INVALID_ARGUMENT' })
  }
  assert.deepEqual(catalog.validate('studio:draft:set', { project: '/tmp/work', scope: 'detail', draft: { target: 'lyrics', intent: 'review', prompt: '미전송 초안', revisedLyrics: '원문과 다른 수정안\n', rangeStart: '1.', rangeEnd: '', requestId, status: 'uncertain' } }).paramsValue.draft.rangeStart, '1.')
  for (const value of [{ scope: 'other', draft: {} }, { scope: 'detail', draft: { method: 'turn/start' } }, { scope: 'detail', draft: { prompt: '가'.repeat(12001) } }, { scope: 'detail', draft: { requestId: 'other' } }, { scope: 'detail', draft: { rangeStart: 1 } }, { scope: 'detail', draft: { status: 'generated' } }]) {
    assert.throws(() => catalog.validate('studio:draft:set', { project: '/tmp/work', ...value }), { code: 'INVALID_ARGUMENT' })
  }
})

test('studio agent commands use the local Python runner in direct and batch modes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'road-studio-agent-cli-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const script = path.join(root, 'fixture.js')
  fs.writeFileSync(script, "const fs=require('node:fs');const i=process.argv.indexOf('--data-dir');process.stdout.write(JSON.stringify({ok:true,result:{action:process.argv[2],dataDir:process.argv[i+1],params:JSON.parse(fs.readFileSync(0,'utf8'))}})+'\\n')")
  const options = { storageOptions: { script, python: process.execPath }, userData: path.join(root, 'profile'), spawnProcess: () => { throw new Error('Electron must not start') } }
  let output = ''
  assert.equal(await run(['studio:request:submit', '--json', JSON.stringify(params())], { ...options, stdout: { write: text => { output += text } } }), 0)
  assert.deepEqual(JSON.parse(output).result, { action: 'request-submit', dataDir: options.userData, params: params() })
  output = ''
  assert.equal(await run(['batch', '--no-start'], { ...options, stdinText: JSON.stringify({ id: 'status', command: 'studio:request:status', params: { project: '/tmp/work', requestId } }), stdout: { write: text => { output += text } } }), 0)
  assert.deepEqual(JSON.parse(output).result, { action: 'request-status', dataDir: options.userData, params: { project: '/tmp/work', requestId } })
  for (const [command, commandParams, action] of [
    ['studio:agent:status', { project: '/tmp/work' }, 'agent-status'],
    ['studio:agent:bind', { project: '/tmp/work' }, 'agent-bind'],
    ['studio:request:update', { project: '/tmp/work', requestId, status: 'reviewing' }, 'request-update'],
    ['studio:conversation:history', { project: '/tmp/work', cursor: 'older-page', limit: 5 }, 'conversation-history'],
    ['studio:draft:get', { project: '/tmp/work', scope: 'detail' }, 'draft-get'],
    ['studio:draft:set', { project: '/tmp/work', scope: 'detail', draft: { target: 'video', intent: 'review', prompt: '재시작 뒤 남을 초안', status: '' } }, 'draft-set']
  ]) {
    output = ''
    assert.equal(await run([command, '--json', JSON.stringify(commandParams)], { ...options, stdout: { write: text => { output += text } } }), 0)
    assert.equal(JSON.parse(output).result.action, action)
  }
})

for (const name of ['test_studio_agent.py', 'test_studio_agent_http.py', 'test_codex_history.py']) {
  test(`studio agent regression: ${name}`, () => {
    const result = spawnSync('python3', [path.join(studioRoot(), 'scripts', name)], { encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  })
}

test('studio agent UI regression', () => {
  const result = spawnSync(process.execPath, [path.join(studioRoot(), 'scripts', 'test_studio_agent_ui.mjs')], { encoding: 'utf8', timeout: 15000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})
