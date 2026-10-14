'use strict'

const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { parseArgs } = require('../cli/client')
const { validate } = require('../electron/cli-catalog')
const { prepareRequests } = require('../electron/cli-generation')
const { cleanLyrics } = require('../renderer/prompt')
const { getSchema } = require('../electron/cli-transport')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const schema = getSchema()
const publicCommands = new Set(schema.commands.map(entry => entry.command))

test('ACE 공식 가이드 스냅샷은 엔진 고정 버전과 원문 해시를 보존한다', () => {
  const directory = 'docs/vendor/ace-step-1.5'
  const manifest = JSON.parse(read(`${directory}/manifest.json`))
  const commit = read('electron/main.js').match(/const ACE_COMMIT = '([a-f0-9]{40})'/)[1]
  assert.equal(manifest.commit, commit, 'ACE 버전 변경 시 공식 문서와 적용 가이드도 함께 갱신하세요')
  assert.deepEqual(manifest.files.map(file => file.path).sort(), ['LICENSE', 'en/INFERENCE.md', 'en/Tutorial.md', 'en/ace_step_musicians_guide.md', 'ko/INFERENCE.md', 'ko/Tutorial.md'])
  for (const file of manifest.files) {
    const data = fs.readFileSync(path.join(root, directory, file.path))
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, file.path)
    assert.equal(data.length, file.bytes, file.path)
    assert.equal(file.url, `https://raw.githubusercontent.com/ace-step/ACE-Step-1.5/${commit}/${file.source}`)
  }
  assert.match(read(`${directory}/LICENSE`), /Copyright \(c\) 2026 ACEStep/)
})

function shellWords (line) {
  const words = []
  let word = ''
  let quote = null
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quote) {
      if (char === quote) quote = null
      else word += char
      continue
    }
    if (char === "'" || char === '"') { quote = char; continue }
    if (/\s/.test(char)) {
      if (word) { words.push(word); word = '' }
      continue
    }
    if (char === '\\' && index + 1 < line.length) { word += line[index + 1]; index += 1; continue }
    word += char
  }
  if (quote) throw new Error(`닫히지 않은 따옴표: ${line}`)
  if (word) words.push(word)
  return words
}

function validateDocumentCommand (argv) {
  const parsed = parseArgs(argv)
  if (parsed.batch || parsed.params === undefined) return
  if (parsed.command === 'cli:schema') {
    if (parsed.params.command !== undefined) assert.ok(publicCommands.has(parsed.params.command), `알 수 없는 스키마 명령: ${parsed.params.command}`)
    return
  }
  if (parsed.command === 'job:wait') {
    const entry = schema.commands.find(item => item.command === parsed.command)
    assert.ok(entry, 'job:wait 스키마가 없습니다')
    assert.equal(typeof parsed.params.jobId, 'string')
    assert.ok(parsed.params.jobId.length > 0)
    assert.deepEqual(Object.keys(parsed.params).filter(key => !Object.hasOwn(entry.params.properties, key)), [])
    if (parsed.params.timeoutMs !== undefined) assert.ok(Number.isInteger(parsed.params.timeoutMs) && parsed.params.timeoutMs >= 1 && parsed.params.timeoutMs <= 3600000)
    return
  }
  validate(parsed.command, parsed.params)
}

test('CLI 레퍼런스는 공개 스키마의 모든 명령을 포함한다', () => {
  const reference = read('docs/cli-reference.md')
  for (const command of publicCommands) assert.match(reference, new RegExp('`' + command.replace(':', '\\:') + '`'))
})

test('CLI 사용법의 --json 예제는 파서와 스키마를 통과한다', () => {
  const guide = ['README.md', 'docs/cli.md', 'docs/quickstart.md', 'docs/music-options.md', 'docs/ace-prompt-guide.md', 'docs/lyrics-tags.md'].map(read).join('\n')
  const commands = guide.split('\n')
    .filter(line => line.includes('node cli/road-music.js') && line.includes('--json'))
    .map(line => shellWords(line.slice(line.indexOf('node cli/road-music.js') + 'node cli/road-music.js'.length).trim()))
  assert.ok(commands.length > 0, '검증할 CLI JSON 예제가 없습니다')
  for (const argv of commands) validateDocumentCommand(argv)
})

test('가사 태그 문서의 전달 결과와 권장 예시는 실제 정리 결과와 일치한다', () => {
  const document = read('docs/lyrics-tags.md')
  const rows = [...document.matchAll(/^\| `(\[[^\]]+\])` \| (?:`(\[[^\]]+\])`|(삭제)) \|/gm)]
  assert.ok(rows.length >= 30, '공식 태그의 전달 결과 표가 부족합니다')
  for (const [, input, output] of rows) {
    const result = cleanLyrics(`${input}\n실제로 부를 가사`).text
    const tags = result.split('\n').filter(line => line.startsWith('['))
    assert.deepEqual(tags, output ? [output] : [], input)
    assert.ok(result.includes('실제로 부를 가사'), `${input}: 가사 손실`)
  }
  const examples = [...document.matchAll(/```lyrics\n([\s\S]*?)```/g)]
  assert.ok(examples.length > 0, '검증할 태그 배치 예시가 없습니다')
  for (const [, lyrics] of examples) {
    const before = lyrics.trim().split('\n').filter(Boolean)
    const after = cleanLyrics(lyrics).text.split('\n').filter(Boolean)
    assert.deepEqual(after, before, '권장 예시의 태그나 가사가 정리 과정에서 바뀝니다')
  }
})

test('음악 옵션 가이드의 JSON 예제는 생성 입력 검증과 정규화를 통과한다', () => {
  const guide = ['docs/music-options.md', 'docs/ace-prompt-guide.md'].map(read).join('\n')
  const blocks = [...guide.matchAll(/```json\n([\s\S]*?)```/g)]
  assert.ok(blocks.length > 0, '검증할 음악 생성 예제가 없습니다')
  for (const [, block] of blocks) {
    const input = JSON.parse(block)
    const { paramsValue } = validate('song:generate', input)
    const requests = prepareRequests(paramsValue)
    assert.equal(requests.length, input.count || 1)
    for (const request of requests) {
      assert.ok(request.style.trim(), `${input.title}: 스타일이 비었습니다`)
      assert.ok(request.lyrics.trim(), `${input.title}: 가사가 비었습니다`)
      if (request.engine === 'ace') {
        assert.ok(Array.from(request.style).length <= 512, `${input.title}: ACE caption이 잘립니다`)
        assert.ok(Array.from(request.lyrics).length <= 4096, `${input.title}: ACE 가사가 잘립니다`)
      }
    }
  }
})

test('CLI 사용법의 JSONL 배치 예제는 공개 명령 스키마를 통과한다', () => {
  const guide = read('docs/cli.md')
  const blocks = [...guide.matchAll(/```json\n([\s\S]*?)```/g)].map(match => match[1])
  const rows = blocks.flatMap(block => block.trim().split('\n')).map(line => JSON.parse(line)).filter(value => value.command)
  assert.ok(rows.length > 0, '검증할 배치 예제가 없습니다')
  for (const row of rows) {
    assert.ok(publicCommands.has(row.command), `알 수 없는 배치 명령: ${row.command}`)
    if (row.command !== 'job:wait' && row.command !== 'cli:schema') validate(row.command, row.params || {})
  }
})
