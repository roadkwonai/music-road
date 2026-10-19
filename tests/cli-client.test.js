'use strict'

const assert = require('node:assert/strict')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const test = require('node:test')
const { PassThrough } = require('node:stream')
const { defaultUserData, parseArgs, request, run, socketEndpoint, startService } = require('../cli/client')

test('reports the local CLI and application versions without starting Electron', async () => {
  let spawns = 0
  let stdout = ''
  const versions = {
    cliVersion: require('../cli/package.json').version,
    appVersion: require('../package.json').version,
    protocolVersion: 2
  }
  for (const argv of [['--version'], ['version'], ['cli:version']]) {
    stdout = ''
    const code = await run(argv, {
      endpoint: path.join(os.tmpdir(), 'road-music-version-missing.sock'),
      spawnProcess: () => { spawns += 1; return { on: () => {}, unref: () => {} } },
      stdout: { write: text => { stdout += text } }
    })
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(stdout), { ok: true, result: versions })
  }
  assert.equal(spawns, 0)
})

test('keeps the local version response in batch mode without starting Electron', async () => {
  let stdout = ''
  const code = await run(['batch'], {
    stdinText: '{"id":"local","command":"version"}',
    endpoint: path.join(os.tmpdir(), 'road-music-version-batch-missing.sock'),
    spawnProcess: () => { throw new Error('must not start Electron') },
    stdout: { write: text => { stdout += text } }
  })
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(stdout), {
    id: 'local', ok: true, result: {
      cliVersion: require('../cli/package.json').version,
      appVersion: require('../package.json').version,
      protocolVersion: 2
    }
  })
})

test('runs CLI update commands locally in single and batch mode without starting Electron', async t => {
  const update = require('../cli/update')
  const original = { check: update.check, install: update.install }
  const calls = []
  update.check = async params => { calls.push(['check', params]); return { available: false, current: '0.1.0' } }
  update.install = async params => { calls.push(['install', params]); return { cliVersion: '0.1.1', appVersion: '1.4.0', cliPath: '/tmp/road-music-cli/cli/road-music.js' } }
  t.after(() => Object.assign(update, original))
  let stdout = ''
  const supplied = {
    endpoint: path.join(os.tmpdir(), 'road-music-cli-update-missing.sock'),
    spawnProcess: () => { throw new Error('must not start Electron') },
    stdout: { write: text => { stdout += text } }
  }
  assert.equal(await run(['cli:update:check'], supplied), 0)
  assert.deepEqual(JSON.parse(stdout), { ok: true, result: { available: false, current: '0.1.0' } })
  stdout = ''
  assert.equal(await run(['batch'], {
    ...supplied,
    stdout: { write: text => { stdout += text } },
    stdinText: '{"id":"install","command":"cli:update:install","params":{"targetDir":"/tmp/road-music-cli"}}'
  }), 0)
  assert.deepEqual(JSON.parse(stdout), {
    id: 'install', ok: true,
    result: { cliVersion: '0.1.1', appVersion: '1.4.0', cliPath: '/tmp/road-music-cli/cli/road-music.js' }
  })
  assert.deepEqual(calls, [['check', {}], ['install', { targetDir: '/tmp/road-music-cli' }]])
})

function tempSocket () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-music-cli-'))
  return { dir, socket: path.join(dir, 'service.sock') }
}

async function withServer (handler, body) {
  const { dir, socket } = tempSocket()
  const server = net.createServer((client) => {
    let pending = ''
    client.on('data', (chunk) => {
      pending += chunk
      let end
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end)
        pending = pending.slice(end + 1)
        if (line) handler(JSON.parse(line), client)
      }
    })
  })
  await new Promise((resolve) => server.listen(socket, resolve))
  try { return await body(socket) } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('parses command flags and absolute file paths', () => {
  const parsed = parseArgs(['songs', 'list', '--json', '{"limit":2}', '--input', 'song.wav', '--output', 'out.zip', '--confirm'])
  assert.equal(parsed.command, 'songs:list')
  assert.deepEqual(parsed.params, { limit: 2 })
  assert.deepEqual(parsed.input, [path.resolve('song.wav')])
  assert.equal(parsed.output, path.resolve('out.zip'))
  assert.equal(parsed.confirm, true)
  assert.equal(socketEndpoint(path.join(os.tmpdir(), 'road-music-test')).includes('road-music-'), true)
  assert.equal(parseArgs(['job:wait']).timeout, 3_600_000)
  assert.equal(parseArgs(['songs:list']).timeout, 30_000)
  assert.equal(parseArgs(['video:render']).timeout, 86_400_000)
  assert.equal(parseArgs(['video:render', '--timeout', '43200000']).timeout, 43_200_000)
  assert.throws(() => parseArgs(['video:render', '--timeout', '2147483648']), (error) => error.code === 'invalid_arguments')
  assert.equal(parseArgs(['cli:update:check']).timeout, 30_000)
  assert.equal(parseArgs(['cli:update:install']).timeout, 1_800_000)
  assert.throws(() => parseArgs(['cli:update:install', '--timeout', '1800001']), (error) => error.code === 'invalid_arguments')
})

test('writes standardized JSON result and forwards events to stderr', async () => {
  await withServer((message, client) => {
    client.write(JSON.stringify({ type: 'event', channel: 'progress', payload: { value: 1 } }) + '\n')
    client.end(JSON.stringify({ id: message.id, result: { songs: ['A'] } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    let stderr = ''
    const code = await run(['songs:list', '--events', '--no-start'], {
      endpoint,
      stdout: { write: (text) => { stdout += text } },
      stderr: { write: (text) => { stderr += text } }
    })
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(stdout), { ok: true, result: { songs: ['A'] } })
    assert.deepEqual(JSON.parse(stderr), { type: 'event', channel: 'progress', payload: { value: 1 } })
  })
})

test('turns server errors into operation failures', async () => {
  await withServer((message, client) => {
    client.end(JSON.stringify({ id: message.id, error: { code: 'invalid', message: 'bad input' } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['songs:list', '--no-start'], { endpoint, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 1)
    assert.deepEqual(JSON.parse(stdout), { ok: false, error: { code: 'invalid', message: 'bad input' } })
  })
})

test('keeps a failed result message and details in JSON output', async () => {
  await withServer((message, client) => {
    client.end(JSON.stringify({ id: message.id, result: { ok: false, message: '작업 실패', details: { retry: false } } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['songs:list', '--no-start'], { endpoint, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 1)
    assert.deepEqual(JSON.parse(stdout).error, { code: 'operation_failed', message: '작업 실패', details: { ok: false, message: '작업 실패', details: { retry: false } } })
  })
})

test('rejects --wait before it can invoke an unsupported command', async () => {
  let called = false
  await withServer(() => { called = true }, async (endpoint) => {
    let stdout = ''
    const code = await run(['songs:list', '--wait', '--no-start'], { endpoint, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 2)
    assert.equal(called, false)
    assert.equal(JSON.parse(stdout).error.code, 'invalid_arguments')
  })
})

test('waits for every generated job and retains completed songs', async () => {
  const received = []
  await withServer((message, client) => {
    received.push(message)
    if (message.command === 'song:generate') client.end(JSON.stringify({ id: message.id, result: { ok: true, jobs: [{ jobId: 'one' }, { jobId: 'two' }] } }) + '\n')
    else client.end(JSON.stringify({ id: message.id, result: { ok: true, song: { jobId: message.params.jobId } } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['song:generate', '--wait', '--no-start'], { endpoint, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(stdout), { ok: true, result: { ok: true, songs: [{ ok: true, song: { jobId: 'one' } }, { ok: true, song: { jobId: 'two' } }] } })
    assert.deepEqual(received.map(request => request.command), ['song:generate', 'job:wait', 'job:wait'])
  })
})

test('does not mask a failed generate response by waiting for jobs', async () => {
  let calls = 0
  await withServer((message, client) => {
    calls += 1
    client.end(JSON.stringify({ id: message.id, result: { ok: false, message: 'engine failed', details: { engine: 'ace' } } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['song:generate', '--wait', '--no-start'], { endpoint, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 1)
    assert.equal(calls, 1)
    assert.equal(JSON.parse(stdout).error.message, 'engine failed')
  })
})

test('applies --timeout separately to each waited job', async () => {
  const received = []
  await withServer((message, client) => {
    received.push(message)
    if (message.command === 'song:generate') client.end(JSON.stringify({ id: message.id, result: { ok: true, jobs: [{ jobId: 'one' }] } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['song:generate', '--wait', '--timeout', '5', '--no-start'], { endpoint, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 1)
    assert.deepEqual(received.map(request => request.command), ['song:generate', 'job:wait'])
    assert.ok(received[1].params.timeoutMs > 0 && received[1].params.timeoutMs <= 5)
    const details = JSON.parse(stdout).error.details
    assert.equal(details.message, '작업 대기중단/실패')
    assert.equal(details.songs[0].error.code, 'timeout')
  })
})

test('retries an interrupted job wait after the service restarts', async () => {
  const { dir, socket } = tempSocket()
  let waits = 0
  const server = net.createServer((client) => {
    let pending = ''
    client.on('data', (chunk) => {
      pending += chunk
      const end = pending.indexOf('\n')
      if (end === -1) return
      const message = JSON.parse(pending.slice(0, end))
      if (message.command === 'song:generate') {
        client.end(JSON.stringify({ id: message.id, result: { ok: true, jobId: 'restartable' } }) + '\n')
      } else {
        waits += 1
        if (waits === 1) {
          client.destroy()
          server.close(() => server.listen(socket))
        } else {
          client.end(JSON.stringify({ id: message.id, result: { ok: true, song: { jobId: 'restartable' } } }) + '\n')
        }
      }
    })
  })
  await new Promise((resolve) => server.listen(socket, resolve))
  try {
    let stdout = ''
    const code = await run(['song:generate', '--wait', '--no-start'], { endpoint: socket, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 0)
    assert.equal(waits, 2)
    assert.equal(JSON.parse(stdout).result.songs[0].song.jobId, 'restartable')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('does not retry a disconnected generation request', async () => {
  let calls = 0
  await withServer((message, client) => {
    assert.equal(message.command, 'song:generate')
    calls += 1
    client.destroy()
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['song:generate', '--no-start'], { endpoint, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 1)
    assert.equal(calls, 1)
    assert.deepEqual(JSON.parse(stdout).error, {
      code: 'CONNECTION_LOST',
      message: '요청 처리 여부 불명확; status/queue/result before retry',
      uncertain: true
    })
  })
})

test('does not retry a job wait when the daemon returns malformed JSON', async () => {
  let waits = 0
  await withServer((message, client) => {
    if (message.command === 'song:generate') client.end(JSON.stringify({ id: message.id, result: { ok: true, jobId: 'bad-json' } }) + '\n')
    else {
      waits += 1
      client.end('{not json}\n')
    }
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['song:generate', '--wait', '--no-start'], { endpoint, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 1)
    assert.equal(waits, 1)
    assert.equal(JSON.parse(stdout).error.details.songs[0].error.code, 'malformed_response')
  })
})

test('stops a job wait without restarting after an explicit service stop event', async () => {
  let waits = 0
  let spawns = 0
  await withServer((message, client) => {
    assert.equal(message.command, 'job:wait')
    waits += 1
    client.write(JSON.stringify({ type: 'event', channel: 'service:stopping', payload: { requested: true } }) + '\n')
    client.end()
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['job:wait', '--json', '{"jobId":"stopped"}'], {
      endpoint,
      spawnProcess: () => { spawns += 1; return { on: () => {}, unref: () => {} } },
      stdout: { write: (text) => { stdout += text } }
    })
    assert.equal(code, 1)
    assert.equal(waits, 1)
    assert.equal(spawns, 0)
    assert.deepEqual(JSON.parse(stdout).error, {
      code: 'SERVICE_STOPPED',
      message: '서비스가 종료되어 요청 처리 여부를 확인하세요. status/queue/result 후 수동으로 재시도하세요.',
      uncertain: true,
      retry: false
    })
  })
})

test('uses a public job wait timeoutMs as the request and client deadline', async () => {
  const received = []
  await withServer((message) => {
    received.push(message)
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['job:wait', '--json', '{"jobId":"short","timeoutMs":10}', '--no-start'], {
      endpoint,
      stdout: { write: (text) => { stdout += text } }
    })
    assert.equal(code, 1)
    assert.equal(received.length, 1)
    assert.equal(received[0].params.timeoutMs, 10)
    assert.equal(JSON.parse(stdout).error.code, 'timeout')
  })
})

test('rejects an invalid public job wait timeoutMs before starting a service', async () => {
  const { dir, socket } = tempSocket()
  let spawns = 0
  try {
    let stdout = ''
    const code = await run(['job:wait', '--json', '{"jobId":"bad","timeoutMs":0}'], {
      endpoint: socket,
      userData: dir,
      spawnProcess: () => { spawns += 1; return { on: () => {}, unref: () => {} } },
      stdout: { write: (text) => { stdout += text } }
    })
    assert.equal(code, 2)
    assert.equal(spawns, 0)
    assert.equal(JSON.parse(stdout).error.code, 'invalid_arguments')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('marks every submitted job interrupted without waiting again after service stop', async () => {
  const received = []
  let spawns = 0
  await withServer((message, client) => {
    received.push(message)
    if (message.command === 'song:generate') {
      client.end(JSON.stringify({ id: message.id, result: { ok: true, jobs: [{ jobId: 'one' }, { jobId: 'two' }] } }) + '\n')
      return
    }
    client.write(JSON.stringify({ type: 'event', channel: 'service:stopping', payload: { requested: true } }) + '\n')
    client.end()
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['song:generate', '--wait'], {
      endpoint,
      spawnProcess: () => { spawns += 1; return { on: () => {}, unref: () => {} } },
      stdout: { write: (text) => { stdout += text } }
    })
    assert.equal(code, 1)
    assert.deepEqual(received.map(message => message.command), ['song:generate', 'job:wait'])
    assert.equal(spawns, 0)
    const songs = JSON.parse(stdout).error.details.songs
    assert.deepEqual(songs.map(song => song.jobId), ['one', 'two'])
    assert.deepEqual(songs.map(song => song.error.code), ['SERVICE_STOPPED', 'SERVICE_STOPPED'])
  })
})

test('retries direct and batch job waits after a disconnected request', async () => {
  let waits = 0
  await withServer((message, client) => {
    assert.equal(message.command, 'job:wait')
    waits += 1
    if (waits === 1 || waits === 3) client.destroy()
    else client.end(JSON.stringify({ id: message.id, result: { ok: true, jobId: message.params.jobId } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['job:wait', '--json', '{"jobId":"direct"}', '--no-start'], { endpoint, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 0)
    assert.equal(waits, 2)
    assert.equal(JSON.parse(stdout).result.jobId, 'direct')

    stdout = ''
    const batchCode = await run(['batch', '--no-start'], {
      endpoint,
      stdinText: '{"id":"batch-wait","command":"job:wait","params":{"jobId":"batch"}}',
      stdout: { write: (text) => { stdout += text } }
    })
    assert.equal(batchCode, 0)
    assert.equal(waits, 4)
    assert.deepEqual(JSON.parse(stdout), { id: 'batch-wait', ok: true, result: { ok: true, jobId: 'batch' } })
  })
})

test('does not exceed a job wait deadline while an automatic service start is pending', async () => {
  const { dir, socket } = tempSocket()
  let serverStarted = false
  let requests = 0
  const server = net.createServer((client) => {
    client.on('data', () => { requests += 1 })
  })
  let startTimer
  const spawnProcess = () => {
    startTimer = setTimeout(() => server.listen(socket, () => { serverStarted = true }), 50)
    return { on: () => {}, unref: () => {} }
  }
  try {
    let stdout = ''
    const code = await run(['job:wait', '--timeout', '20'], {
      endpoint: socket,
      userData: dir,
      spawnProcess,
      stdout: { write: (text) => { stdout += text } }
    })
    assert.equal(code, 1)
    assert.equal(JSON.parse(stdout).error.code, 'timeout')
    await new Promise(resolve => setTimeout(resolve, 70))
    assert.equal(serverStarted, true)
    assert.equal(requests, 0)
  } finally {
    clearTimeout(startTimer)
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('service start waits for a stopping service before reporting a new status', async () => {
  const { dir, socket } = tempSocket()
  let stoppingServer
  let nextServer
  let starts = 0
  stoppingServer = net.createServer((client) => {
    client.once('data', (chunk) => {
      const message = JSON.parse(chunk)
      client.end(JSON.stringify({ id: message.id, result: { ok: true, pid: 'dying', stopping: true } }) + '\n')
      setTimeout(() => stoppingServer.close(), 25)
    })
  })
  await new Promise((resolve) => stoppingServer.listen(socket, resolve))
  const spawnProcess = () => {
    starts += 1
    nextServer = net.createServer((client) => {
      client.once('data', (chunk) => {
        const message = JSON.parse(chunk)
        client.end(JSON.stringify({ id: message.id, result: { ok: true, pid: 'new', stopping: false } }) + '\n')
      })
    })
    nextServer.listen(socket)
    return { on: () => {}, unref: () => {} }
  }
  try {
    let stdout = ''
    let opened = 0
    const code = await run(['service:start'], { endpoint: socket, userData: dir, spawnProcess, openStudio: async () => { opened += 1 }, stdout: { write: (text) => { stdout += text } } })
    assert.equal(code, 0)
    assert.equal(starts, 1)
    assert.equal(opened, 1)
    assert.equal(JSON.parse(stdout).result.pid, 'new')
  } finally {
    if (stoppingServer.listening) await new Promise((resolve) => stoppingServer.close(resolve))
    if (nextServer && nextServer.listening) await new Promise((resolve) => nextServer.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('opens the studio only after a successful interactive service start', async () => {
  await withServer((message, client) => {
    client.end(JSON.stringify({ id: message.id, result: { ok: true, pid: 'ready', stopping: false } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    let stderr = ''
    let opened = 0
    const base = { endpoint, stdout: { write: text => { stdout += text } }, stderr: { write: text => { stderr += text } } }
    assert.equal(await run(['service:start'], { ...base, openStudio: async () => { opened += 1 } }), 0)
    assert.equal(opened, 1)
    assert.deepEqual(JSON.parse(stdout), { ok: true, result: { ok: true, pid: 'ready', stopping: false } })
    stdout = ''
    assert.equal(await run(['service:start'], { ...base, env: { ROADMUSIC_STUDIO_AUTO_OPEN: '0' }, openStudio: async () => { throw new Error('must not open') } }), 0)
    assert.equal(stderr, '')
    stdout = ''
    assert.equal(await run(['service:start'], { ...base, openStudio: async () => { const error = new Error('제작실 없음'); error.code = 'studio_unavailable'; throw error } }), 0)
    assert.deepEqual(JSON.parse(stderr), { type: 'warning', channel: 'studio:open', error: { code: 'studio_unavailable', message: '제작실 없음' } })
  })
})

test('does not open the studio for a batch service start alias', async () => {
  await withServer((message, client) => {
    client.end(JSON.stringify({ id: message.id, result: { command: message.command } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['batch'], {
      endpoint,
      stdinText: '{"id":"start","command":"service:start"}',
      openStudio: async () => { throw new Error('must not open') },
      stdout: { write: text => { stdout += text } }
    })
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(stdout), { id: 'start', ok: true, result: { command: 'cli:status' } })
  })
})

test('batch responds to each stdin JSONL line before stdin closes', async () => {
  await withServer((message, client) => {
    client.end(JSON.stringify({ id: message.id, result: { command: message.command } }) + '\n')
  }, async (endpoint) => {
    const stdin = new PassThrough()
    let stdout = ''
    const running = run(['batch', '--no-start'], { endpoint, stdin, stdout: { write: (text) => { stdout += text } } })
    stdin.write('{"id":"one","command":"songs:list","params":{}}\n')
    await new Promise(resolve => setTimeout(resolve, 15))
    assert.deepEqual(JSON.parse(stdout), { id: 'one', ok: true, result: { command: 'songs:list' } })
    stdin.end()
    assert.equal(await running, 0)
  })
})

test('batch applies service aliases locally and rejects unknown fields before requesting', async () => {
  const received = []
  await withServer((message, client) => {
    received.push(message)
    client.end(JSON.stringify({ id: message.id, result: { command: message.command } }) + '\n')
  }, async (endpoint) => {
    let stdout = ''
    const code = await run(['batch', '--no-start'], {
      endpoint,
      stdinText: [
        '{"id":"status","command":"service:status"}',
        '{"id":"schema","command":"schema","params":{"command":"service:start"}}',
        '{"id":"bad","command":"songs:list","paramz":{}}'
      ].join('\n'),
      stdout: { write: (text) => { stdout += text } }
    })
    const lines = stdout.trim().split('\n').map(JSON.parse)
    assert.equal(code, 2)
    assert.deepEqual(received.map(message => message.command), ['cli:status'])
    assert.deepEqual(lines[0], { id: 'status', ok: true, result: { command: 'cli:status' } })
    assert.equal(lines[1].id, 'schema')
    assert.equal(lines[1].ok, true)
    assert.equal(lines[1].result.command, 'cli:status')
    assert.equal(lines[2].id, 'bad')
    assert.equal(lines[2].error.code, 'invalid_arguments')
  })
})

test('service start help reports the cli status schema locally', async () => {
  let stdout = ''
  const code = await run(['service:start', '--help'], { stdout: { write: (text) => { stdout += text } } })
  assert.equal(code, 0)
  assert.equal(JSON.parse(stdout).result.command, 'cli:status')
})

test('service startup preserves the GUI default data directory environment', () => {
  const env = { ...process.env }
  delete env.ROADMUSIC_DATA_DIR
  const spawned = []
  const spawnProcess = (executable, args, options) => {
    spawned.push({ executable, args, options })
    return { on: () => {}, unref: () => {} }
  }
  startService({ userData: defaultUserData({ env }), env, spawnProcess })
  assert.equal(Object.hasOwn(spawned[0].options.env, 'ROADMUSIC_DATA_DIR'), false)

  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'road-music-service-'))
  try {
    startService({ userData: custom, env, spawnProcess })
    assert.equal(spawned[1].options.env.ROADMUSIC_DATA_DIR, custom)
  } finally {
    fs.rmSync(custom, { recursive: true, force: true })
  }
})

test('accepts UTF-8 JSON split across socket packets', async () => {
  await withServer((message, client) => {
    const line = Buffer.from(JSON.stringify({ id: message.id, result: { title: '가요' } }) + '\n')
    const split = line.indexOf(Buffer.from('가')) + 1
    client.write(line.subarray(0, split))
    client.end(line.subarray(split))
  }, async (endpoint) => {
    assert.deepEqual(await request({ endpoint, command: 'songs:list', params: {} }), { title: '가요' })
  })
})

test('request rejects when the daemon does not answer before timeout', async () => {
  await withServer(() => {}, async (endpoint) => {
    await assert.rejects(
      request({ endpoint, command: 'songs:list', params: {}, timeout: 25 }),
      (error) => error.code === 'timeout'
    )
  })
})

test('maintenance history uses the same bounded timeout as maintenance listing', () => {
  assert.equal(parseArgs(['storage:maintenance-history']).timeout, 180_000)
  assert.equal(parseArgs(['storage:maintenance-history', '--timeout', '150000']).timeout, 150_000)
  assert.throws(() => parseArgs(['storage:maintenance-history', '--timeout', '180001']), error => error.code === 'invalid_arguments')
})
