'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const knowledge = require('../electron/prompt-knowledge')
const { validate } = require('../electron/cli-catalog')
const { run } = require('../cli/client')

const ccmRecipes = require('../docs/ccm-recipes.json')

test('lists only the bundled prompt-knowledge topics with an explicit non-application policy', () => {
  const result = knowledge.read()
  assert.deepEqual(result.topics.map(item => item.topic), Object.keys(knowledge.documents).filter(topic => fs.existsSync(path.join(__dirname, '..', knowledge.documents[topic].source))))
  assert.deepEqual(result.policy, { preserveUserInput: true, autoApply: false, suggestionsRequireApproval: true })
  for (const topic of result.topics) {
    assert.equal(topic.version, require('../package.json').version)
    assert.equal(topic.appVersion, require('../package.json').version)
    assert.equal(topic.cliVersion, require('../cli/package.json').version)
  }
  assert.equal(result.content, undefined)
})

test('returns the exact UTF-8 document for a fixed topic', () => {
  const result = knowledge.read({ topic: 'ccm' })
  const source = path.join(__dirname, '..', result.source)
  assert.equal(result.topic, 'ccm')
  assert.equal(result.content, fs.readFileSync(source, 'utf8'))
  assert.deepEqual(Buffer.from(result.content, 'utf8'), fs.readFileSync(source))
  assert.equal(result.policy.preserveUserInput, true)
  assert.equal(result.version, require('../package.json').version)
  assert.equal(result.appVersion, require('../package.json').version)
  assert.equal(result.cliVersion, require('../cli/package.json').version)
})

test('rejects unknown topics and any unneeded input fields in every entry point', async () => {
  for (const params of [{ topic: 'outside' }, { topic: 'ccm', lyrics: '원문' }, { style: 'modern worship' }]) {
    assert.throws(() => knowledge.read(params), { code: 'INVALID_ARGUMENT' })
    assert.throws(() => validate('prompt:knowledge', params), { code: 'INVALID_ARGUMENT' })
  }
  let spawns = 0
  let stdout = ''
  const code = await run(['prompt:knowledge', '--json', '{"topic":"ccm"}'], {
    endpoint: path.join(__dirname, 'missing.sock'),
    spawnProcess: () => { spawns += 1; return { on: () => {}, unref: () => {} } },
    stdout: { write: text => { stdout += text } }
  })
  assert.equal(code, 0)
  assert.equal(spawns, 0)
  assert.equal(JSON.parse(stdout).result.topic, 'ccm')
})

test('model-production knowledge is available through schema and CLI without starting a service', async () => {
  validate('prompt:knowledge', { topic: 'models' })
  assert.ok(knowledge.read().topics.some(topic => topic.topic === 'models'))
  const expected = fs.readFileSync(path.join(__dirname, '..', 'docs', 'model-production-guide.md'), 'utf8')
  let spawns = 0
  let stdout = ''
  const code = await run(['prompt:knowledge', '--json', '{"topic":"models"}'], {
    endpoint: path.join(__dirname, 'missing-model-knowledge.sock'),
    spawnProcess: () => { spawns += 1; return { on: () => {}, unref: () => {} } },
    stdout: { write: text => { stdout += text } }
  })
  assert.equal(code, 0)
  assert.equal(spawns, 0)
  const result = JSON.parse(stdout).result
  assert.equal(result.topic, 'models')
  assert.equal(result.source, 'docs/model-production-guide.md')
  assert.equal(result.content, expected)
  assert.deepEqual(result.policy, { preserveUserInput: true, autoApply: false, suggestionsRequireApproval: true })
})

test('YuE 중심 CCM 고급 레시피는 공개 명령·엔진 계약을 지킨다', () => {
  assert.equal(ccmRecipes.schemaVersion, 1)
  assert.equal(ccmRecipes.styles.length, 48)
  assert.ok(ccmRecipes.guides.length >= 52)
  assert.equal(ccmRecipes.guides.filter(guide => guide.engine === 'ACE').length, 16)
  assert.ok(ccmRecipes.guides.filter(guide => guide.engine === 'YuE').length >= 36)
  const commands = new Set(require('../electron/cli-catalog').schema().commands.map(command => command.command))
  commands.add('job:wait') // 공개 비동기 작업 완료 확인은 생성 jobId의 lifecycle 명령이다.
  const styles = new Set(ccmRecipes.styles.map(style => style.style))
  for (const style of ccmRecipes.styles) {
    assert.ok(style.id && style.title && style.style && style.purpose && style.description && style.source)
    assert.ok(Array.isArray(style.tags) && style.tags.length > 1)
  }
  for (const guide of ccmRecipes.guides) {
    for (const field of ['id', 'title', 'summary', 'category', 'purpose', 'style', 'prompt', 'useWhen', 'avoidWhen', 'expected']) assert.ok(guide[field], `${guide.id}: ${field}`)
    assert.ok(styles.has(guide.style), `${guide.id}: filter style is not in the CCM style catalog`)
    assert.ok(Array.isArray(guide.tags) && guide.tags.length >= 2)
    assert.ok(Array.isArray(guide.fields) && guide.fields.length > 0)
    assert.ok(Array.isArray(guide.ingredients) && guide.ingredients.length > 0)
    assert.ok(Array.isArray(guide.variations) && guide.variations.length >= 2)
    assert.ok(Array.isArray(guide.checks) && guide.checks.length >= 3)
    for (const command of guide.commands) assert.ok(commands.has(command.command), `${guide.id}: unknown command ${command.command}`)
    if (guide.commands.some(command => command.command === 'song:generate')) assert.ok(guide.commands.some(command => command.command === 'job:wait'), `${guide.id}: generation must be followed by job:wait`)
    if (guide.engine === 'ACE') assert.match(guide.prompt, /ACE/)
    else {
      assert.match(guide.prompt, /engine:"yue" 또는 engine:"yue-mlx"|engine:"yue-mlx"/)
      for (const variation of guide.variations) assert.match(variation.prompt, /engine:"yue" 또는 engine:"yue-mlx"|engine:"yue-mlx"/)
    }
  }
  const partial = ccmRecipes.guides.find(guide => guide.id === 'yue-partial')
  assert.ok(partial)
  assert.ok(partial.commands.some(command => command.command === 'song:generate'))
  assert.ok(!partial.commands.some(command => command.command === 'song:render'))
  assert.match(partial.prompt, /새.*생성|song:generate/)
  const smallChurch = ccmRecipes.guides.find(guide => guide.id === 'ace-testimony')
  assert.match(smallChurch.title, /작은 교회 피아노 특송/)
  assert.match(smallChurch.prompt, /가사가 있으면 그대로 유지/)
})

test('advanced prompt knowledge is available through the local CLI schema', () => {
  for (const topic of ['ccm-advanced', 'ccm-recipes', 'reference-recipes', 'yue-advanced']) {
    validate('prompt:knowledge', { topic })
    const result = knowledge.read({ topic })
    assert.equal(result.topic, topic)
    assert.ok(result.content.length > 0)
  }
})

test('CCM 고급 문서는 엔진 경계와 대표 복사 예시를 직접 설명한다', () => {
  const advanced = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ccm-advanced.md'), 'utf8')
  assert.ok((advanced.match(/```prompt/g) || []).length >= 6)
  assert.match(advanced, /ACE 전용/)
  assert.match(advanced, /job:wait/)
  assert.match(advanced, /외부 전송은 하지 마/)
})

test('guide UI is read-only and never assigns a guide result to lyric or style inputs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8')
  const start = source.indexOf('let knowledgeRequest')
  const guide = source.slice(start, source.indexOf('// Show what the machine', start))
  assert.match(guide, /knowledgeContent'\)\.textContent/)
  assert.doesNotMatch(guide, /\$\('(lyrics|style)'\)\.value\s*=/)
  assert.match(guide, /event\.key === 'Escape'/)
  assert.match(guide, /request !== knowledgeRequest/)
  assert.match(guide, /trigger\.focus\(\)/)
})

test('desktop build bundles the local guidance files used by prompt knowledge', () => {
  const files = require('../package.json').build.files
  for (const pattern of ['docs/**', 'AGENTS.md', 'skills/road-music/**', 'skills/road-music-ace/**', 'prompts/ace-review.md', 'prompts/cli-workflows.md']) {
    assert.ok(files.includes(pattern), `${pattern} must be packaged`)
  }
})

test('48개 CCM 스타일의 영문 태그와 악기 이름은 원문·공개 계약을 보존한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'docs/ccm-prompts.md'), 'utf8')
  const originals = new Map([...source.matchAll(/^\|\s*(C\d{2})\s*\|[^|]+\|\s*`([^`]+)`\s*\|/gm)].map(match => [match[1], match[2]]))
  assert.equal(originals.size, 48)
  const instruments = new Set(require('../electron/cli-catalog').schema().commands.find(item => item.command === 'song:generate').params.properties.parts.properties.instruments.items.enum)
  for (const item of ccmRecipes.styles) {
    assert.equal(item.stylePrompt, originals.get(item.id), item.id)
    assert.match(item.description, /[가-힣]/, item.id)
    assert.equal(typeof item.instrumental, 'boolean', item.id)
    assert.ok(item.instruments.length > 0, item.id)
    for (const name of item.instruments) assert.ok(instruments.has(name), item.id + ': ' + name)
  }
})
