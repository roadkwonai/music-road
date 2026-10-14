'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { parseArgs } = require('../cli/client')
const { validate } = require('../electron/cli-catalog')
const { getSchema } = require('../electron/cli-transport')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const schema = getSchema()
const publicCommands = new Set(schema.commands.map(entry => entry.command))

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
  const guide = ['README.md', 'docs/cli.md', 'docs/quickstart.md'].map(read).join('\n')
  const commands = guide.split('\n')
    .filter(line => line.includes('node cli/road-music.js') && line.includes('--json'))
    .map(line => shellWords(line.slice(line.indexOf('node cli/road-music.js') + 'node cli/road-music.js'.length).trim()))
  assert.ok(commands.length > 0, '검증할 CLI JSON 예제가 없습니다')
  for (const argv of commands) validateDocumentCommand(argv)
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
