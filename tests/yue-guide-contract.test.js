'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { preparePreview } = require('../electron/cli-generation')
const { schema, validate } = require('../electron/cli-catalog')
const base = { title: '준비 검증', engine: 'yue-mlx', style: 'Korean worship, piano, clear vocal', lyrics: '[Verse]\n주님의 사랑을 기억하네\n[Chorus]\n주님께 감사하네', targetSeconds: 180, seed: '831001', mode: 'song', cot: 'full' }
function local(command, input) {
  const run = spawnSync(process.execPath, ['cli/road-music.js', command, '--json', JSON.stringify(input)], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 10000, env: { ...process.env, ROADMUSIC_STUDIO_AUTO_OPEN: '0' } })
  assert.equal(run.status, 0, run.stderr + run.stdout)
  const result = JSON.parse(run.stdout)
  assert.equal(result.ok, true)
  return result.result
}
test('CCM YuE 입력 JSON은 공개 준비 검증을 통과하고 추론을 실행하지 않는다', () => {
  const markdown = fs.readFileSync(path.join(__dirname, '../docs/ccm-prompts.md'), 'utf8')
  const examples = [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1])).filter(value => value.engine === 'yue-mlx' && value.lyrics !== undefined)
  assert.ok(examples.length >= 4)
  for (const input of examples) {
    validate('song:prepare', input)
    const result = local('song:prepare', input)
    assert.equal(result.valid, true, input.title)
    assert.equal(result.engine, 'yue-mlx')
    assert.equal(result.validation.synthesis, 'not-run')
    assert.equal(result.validation.context, 'requires-runtime-tokenizer')
    assert.equal(result.validation.targetSeconds, 'record-only-natural-eos')
    assert.equal(result.nativeRequest.style, result.requests[0].style)
    assert.equal(result.nativeRequest.lyrics, result.requests[0].lyrics)
  }
})
test('목표 초만 바꿔도 YuE 원생 음악 입력은 달라지지 않는다', () => {
  const first = preparePreview({ ...base, targetSeconds: 150 })
  const second = preparePreview({ ...base, targetSeconds: 180 })
  assert.deepEqual(first.nativeRequest, second.nativeRequest)
  assert.notEqual(first.requests[0].targetSeconds, second.requests[0].targetSeconds)
})
test('YuE의 계획·semantic·CFG·ODE는 다른 제어이고 off 기본을 보존한다', () => {
  for (const [cot, cfg] of [['full', 1], ['melody', 1], ['off', 1.01]]) assert.equal(preparePreview({ ...base, cot }).effective.advanced.cfgScale, cfg)
  const result = preparePreview({ ...base, advanced: { abcTemperature: 0.6, temperature: 0.9, cfgScale: 1.2, odeSteps: 24 } })
  assert.equal(result.nativeRequest.abc_sampling.temperature, 0.6)
  assert.equal(result.nativeRequest.semantic_sampling.temperature, 0.9)
  assert.equal(result.nativeRequest.cfg_scale, 1.2)
  assert.equal(result.nativeRequest.generation_config.ode_steps, 24)
  assert.ok(!Object.hasOwn(result.nativeRequest.abc_sampling, 'cfg_scale'))
  assert.equal(preparePreview({ ...base, parts: { strong: true } }).effective.advanced.cfgScale, 1)
  assert.equal(preparePreview({ ...base, parts: { strict: true, strong: true } }).effective.advanced.cfgScale, 1.5)
})
test('계획 없음에는 plan·외부 ABC를 결합하지 않고 렌더로 가사를 바꾸지 않는다', () => {
  assert.throws(() => preparePreview({ ...base, cot: 'off', mode: 'plan' }))
  assert.throws(() => preparePreview({ ...base, cot: 'off', abc: 'X:1' }))
  assert.throws(() => validate('song:render', { dir: '/example/song', abc: 'X:1', lyrics: '수정 가사' }))
  assert.throws(() => validate('song:render', { dir: '/example/song', abc: 'X:1', style: '다른 편곡' }))
  const fields = schema().commands.find(entry => entry.command === 'song:render').params.properties
  assert.ok(!Object.hasOwn(fields, 'lyrics'))
  assert.ok(!Object.hasOwn(fields, 'style'))
})
test('실제 공개 MLX 단계 재사용은 단계 뒤의 허용 옵션만 노출한다', () => {
  const caps = local('yue:capabilities', { engine: 'yue-mlx' }).engines[0]
  assert.equal(Object.keys(caps.sampling).length, 16)
  assert.ok(caps.replayControls.plan.advanced.includes('cfgScale'))
  assert.deepEqual(caps.replayControls.synthesize.advanced, ['odeSteps'])
  assert.deepEqual(caps.replayControls.decode.advanced, [])
  assert.equal(caps.defaultsByMode.off.cfgScale, 1.01)
})

test('승인 계획의 음원화 복사 단위가 승인 ABC 또는 검증 plan을 보존한다', () => {
  const collections = [require('../docs/ccm-recipes.json'), require('../docs/command-recipes.json')]
  for (const id of ['yue-ccm-congregation-full-plan', 'yue-ccm-plan-artifact-review', 'yue-advanced-plan-before-song']) {
    const guide = collections.flatMap(data => data.guides).find(item => item.id === id)
    assert.ok(guide)
    assert.match(guide.prompt, /abc로 명시/)
    assert.match(guide.prompt, /stage:"plan"/)
  }
})

test('새 계획의 ABC 검사는 계획 추론 job 완료 뒤에만 배치한다', () => {
  const guide = require('../docs/ccm-recipes.json').guides.find(item => item.id === 'yue-ccm-special-song-korean-density')
  const steps = guide.commands.map(step => step.command)
  assert.ok(steps.indexOf('song:generate') < steps.indexOf('job:wait'))
  assert.ok(steps.indexOf('job:wait') < steps.indexOf('score:inspect'))
})
