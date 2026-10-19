'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { PassThrough } = require('node:stream')
const { validate } = require('../electron/cli-catalog')
const { run } = require('../cli/client')

async function withServer (handler, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-update-cli-'))
  const socket = path.join(dir, 'service.sock')
  const server = net.createServer((client) => {
    let pending = ''
    client.on('data', (chunk) => {
      pending += chunk
      const end = pending.indexOf('\n')
      if (end < 0) return
      const request = JSON.parse(pending.slice(0, end))
      handler(request, client)
    })
  })
  await new Promise(resolve => server.listen(socket, resolve))
  try { return await body(socket) } finally {
    await new Promise(resolve => server.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('업데이트 공개 명령은 상태 조회와 제한된 watch 입력만 허용한다', () => {
  for (const command of ['update:status', 'update:download', 'update:install']) {
    assert.doesNotThrow(() => validate(command, {}))
  }
  assert.doesNotThrow(() => validate('update:watch', { timeoutMs: 3_600_000 }))
  assert.throws(() => validate('update:watch', { timeoutMs: 0 }), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => validate('update:open-page', { page: 'https://roadkwon.dev/apps/roadmusic' }), { code: 'INVALID_ARGUMENT' })
})

test('update:watch는 제한된 시간과 상태 이벤트를 CLI 계약대로 전달한다', async () => {
  await withServer((request, client) => {
    assert.equal(request.command, 'update:watch')
    assert.ok(request.params.timeoutMs >= 1 && request.params.timeoutMs <= 50)
    client.write(JSON.stringify({ type: 'event', channel: 'update:status', payload: { status: 'available', version: '1.4.0' } }) + '\n')
    client.write(JSON.stringify({ id: request.id, result: { status: 'available', version: '1.4.0', changed: true } }) + '\n')
  }, async (endpoint) => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    let out = ''; let events = ''
    stdout.on('data', chunk => { out += chunk })
    stderr.on('data', chunk => { events += chunk })
    const code = await run(['update:watch', '--events', '--timeout', '50', '--no-start'], { endpoint, stdout, stderr })
    assert.equal(code, 0)
    assert.equal(JSON.parse(out).result.status, 'available')
    assert.equal(JSON.parse(events).channel, 'update:status')
  })
})

test('update:install 연결 손실은 자동 재제출 대상이 아님을 표시한다', async () => {
  await withServer((_request, client) => client.end(), async (endpoint) => {
    const stdout = new PassThrough()
    let out = ''
    stdout.on('data', chunk => { out += chunk })
    const code = await run(['update:install', '--no-start'], { endpoint, stdout })
    const result = JSON.parse(out)
    assert.equal(code, 1)
    assert.equal(result.error.uncertain, true)
  })
})
