'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { validate } = require('../electron/cli-catalog')
const { prepareRequests } = require('../electron/cli-generation')
const { parseArgs } = require('../cli/client')
const document = fs.readFileSync(path.join(__dirname, '..', 'docs/hymn-remake-guide.md'), 'utf8')

test('리메이크 후보는 20개 고유 ID와 각 원전의 직접 출처를 갖는다', () => {
  const rows = [...document.matchAll(/^\| (H\d{2}) \| ([^\n]+)$/gm)]
  assert.deepEqual(rows.map(row => row[1]), Array.from({ length: 20 }, (_, index) => `H${String(index + 1).padStart(2, '0')}`))
  for (const [, id, row] of rows) {
    const urls = [...row.matchAll(/\]\((https:\/\/[^)]+)\)/g)]
    assert.ok(urls.length >= 2, `${id}: 가사와 선율을 확인할 근거가 필요합니다`)
  }
})

test('리메이크 편곡 16개는 지원 옵션·caption 길이를 지키고 원문을 바꾸지 않는다', () => {
  const rows = [...document.matchAll(/^\| (R\d{2}) \| (H\d{2}) \| ([^|]+) \| `([^`]+)` \| (\d+) \| `([^`]+)` \| (보컬|연주곡) \|$/gm)]
  assert.deepEqual(rows.map(row => row[1]), Array.from({ length: 16 }, (_, index) => `R${String(index + 1).padStart(2, '0')}`))
  const lyrics = '[Verse]\n제공한 가사를 그대로\n[Chorus]\n주의 은혜 기억하리'
  for (const [, id, hymn, title, style, bpm, instruments, kind] of rows) {
    assert.ok(Number(hymn.slice(1)) >= 1 && Number(hymn.slice(1)) <= 20)
    const input = { title: title.trim(), engine: 'ace', style, lyrics: kind === '보컬' ? lyrics : '',
      instrumental: kind === '연주곡', count: 1, targetSeconds: 180,
      parts: { instruments: instruments.split(', '), bpm: Number(bpm), strict: false } }
    const before = JSON.stringify(input)
    const { paramsValue } = validate('song:generate', input)
    const [request] = prepareRequests(paramsValue)
    assert.equal(JSON.stringify(input), before, `${id}: 점검이 원본 입력을 수정했습니다`)
    if (kind === '보컬') assert.equal(request.lyrics, lyrics, `${id}: 표준 가사 원문 변경`)
    assert.ok(Array.from(request.style).length <= 512, `${id}: caption 잘림`)
    assert.ok(Array.from(request.lyrics).length <= 4096, `${id}: 가사 잘림`)
    for (const tag of style.split(', ')) assert.ok(request.style.includes(tag), `${id}: 태그 누락 ${tag}`)
  }
})

test('리메이크 JSON 예시와 공개 지식 조회는 실제 스키마를 통과한다', () => {
  const blocks = [...document.matchAll(/```json\n([\s\S]*?)```/g)]
  assert.equal(blocks.length, 2)
  for (const [, block] of blocks) {
    const input = JSON.parse(block)
    const { paramsValue } = validate('song:generate', input)
    const [request] = prepareRequests(paramsValue)
    assert.ok(input.coverAudio || input.recording)
    assert.equal(input.targetSeconds, undefined, '참조 입력을 일반 길이로 덮어쓰면 안 됩니다')
    assert.ok(Array.from(request.style).length <= 512)
  }
  for (const topic of ['genres', 'ccm', 'hymn-remake', 'ace', 'lyrics', 'review']) {
    const parsed = parseArgs(['prompt:knowledge', '--json', JSON.stringify({ topic })])
    validate(parsed.command, parsed.params)
  }
})
