'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { PassThrough } = require('node:stream')
const { openStudio, readSession, safeSession, sessionPath, studioRoot } = require('../cli/studio')

function tempDirectory () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'road-music-studio-'))
}

function child (pid = 1234) {
  const process = new EventEmitter()
  process.pid = pid
  process.stderr = new PassThrough()
  process.unref = () => {}
  return process
}

function opener (code = 0) {
  const opened = new EventEmitter()
  opened.unref = () => {}
  process.nextTick(() => {
    opened.emit('spawn')
    setImmediate(() => opened.emit('exit', code))
  })
  return opened
}

test('uses updated installed skills when the CLI kit does not bundle the studio', () => {
  const root = tempDirectory()
  try {
    const codexHome = path.join(root, 'codex-home')
    const installed = path.join(codexHome, 'skills', 'road-music-video-studio')
    fs.mkdirSync(path.join(installed, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(installed, 'scripts', 'studio.py'), '# installed studio')
    assert.equal(studioRoot(root, { CODEX_HOME: codexHome }), installed)
    const bundled = path.join(root, 'skills', 'music-road-skills', 'skills', 'road-music-video-studio')
    fs.mkdirSync(path.join(bundled, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(bundled, 'scripts', 'studio.py'), '# bundled studio without compatibility links')
    assert.equal(studioRoot(root, { CODEX_HOME: codexHome }), bundled)
    const project = path.join(root, '.agents', 'skills', 'road-music-video-studio')
    fs.mkdirSync(path.join(project, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(project, 'scripts', 'studio.py'), '# project override')
    assert.equal(studioRoot(root, { CODEX_HOME: codexHome }), project)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('rejects malformed or expired saved studio sessions', () => {
  const expiresAt = Math.floor(Date.now() / 1000)
  assert.equal(safeSession({ schemaVersion: 1, url: 'https://example.com', project: '/tmp/project', pid: 1, expiresAt: expiresAt + 1 }), null)
  assert.equal(safeSession({ schemaVersion: 1, url: 'http://127.0.0.1:8000/?token=short', project: '/tmp/project', pid: 1, expiresAt: expiresAt + 1 }), null)
  assert.equal(safeSession({ schemaVersion: 1, url: 'http://127.0.0.1:8000/?token=valid_token_12345', project: '/tmp/project', pid: 1, expiresAt }), null)
})

test('reuses a matching server in the shared Ego page without spawning Python', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    const result = await openStudio({
      userData,
      spawnProcess: (command, args) => {
        assert.equal(command, 'ego-browser')
        assert.deepEqual(args.slice(0, 2), ['nodejs', '-e'])
        assert.match(args[2], /const name="Road Music 제작실"/)
        assert.match(args[2], /await taskSpace\(name\)/)
        assert.match(args[2], /task\.page\("p1"\)/)
        assert.match(args[2], new RegExp(`const target=${JSON.stringify(session.url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
        assert.match(args[2], /page\.goto\(target\)/)
        assert.match(args[2], /const reuse=true/)
        assert.match(args[2], /existing\.createdBy!=="agent"/)
        assert.match(args[2], /item\.createdBy==="agent"/)
        assert.match(args[2], /claimTaskSpace\(existing\.id\)/)
        assert.doesNotMatch(args[2], /newPage|takeOverTaskSpace/)
        return opener()
      },
      requestStudioState: async (url) => {
        assert.equal(url, 'http://127.0.0.1:45678/api/state?token=reused_token_1234')
        return { application: 'road-music-video-studio', project }
      }
    })
    assert.deepEqual(result, { url: session.url, project: fs.realpathSync(project), reused: true })
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('creates the local project, records a ready session, and opens once', async () => {
  const root = tempDirectory()
  const userData = tempDirectory()
  const studio = path.join(root, '.agents', 'skills', 'road-music-video-studio')
  fs.mkdirSync(path.join(studio, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(studio, 'scripts', 'studio.py'), '')
  const project = path.join(userData, 'video-studio')
  const calls = []
  let nextPid = 200
  const spawnProcess = (command, args, options) => {
    calls.push({ command, args, options })
    if (command === 'ego-browser') {
      return opener()
    }
    const started = child(nextPid++)
    if (args.includes('init')) {
      fs.mkdirSync(project, { recursive: true })
      fs.writeFileSync(path.join(project, 'studio-project.json'), '{"schemaVersion":1}')
      process.nextTick(() => started.emit('exit', 0))
    } else {
      process.nextTick(() => started.stderr.write(JSON.stringify({ event: 'studio-ready', url: 'http://127.0.0.1:41111/?token=ready_token_12345', project }) + '\n'))
    }
    return started
  }
  try {
    const result = await openStudio({ userData, root, spawnProcess, readyTimeout: 500 })
    const canonicalProject = fs.realpathSync(project)
    assert.deepEqual(result, { url: 'http://127.0.0.1:41111/?token=ready_token_12345', project: canonicalProject, reused: false })
    assert.deepEqual(calls.map(call => call.command), ['python3', 'python3', 'ego-browser'])
    assert.equal(calls[1].args.includes('--session-file'), true)
    assert.equal(calls[1].options.env.ROADMUSIC_DATA_DIR, userData)
    assert.equal(calls[1].options.env.ROADMUSIC_CLI_ROOT, path.resolve(__dirname, '..'))
    assert.deepEqual(readSession(userData), {
      schemaVersion: 1, url: 'http://127.0.0.1:41111/?token=ready_token_12345', project: canonicalProject, pid: 201,
      expiresAt: readSession(userData).expiresAt
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(userData, { recursive: true, force: true })
  }
})

test('does not report success when the browser opener exits unsuccessfully after spawn', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    await assert.rejects(openStudio({
      userData,
      spawnProcess: () => opener(1),
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    }), /브라우저 열기 실패 \(1\)/)
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('opens the studio in the configured Ego task space without reloading the current page', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    await openStudio({
      userData,
      env: { ROADMUSIC_STUDIO_BROWSER: 'ego', ROADMUSIC_EGO_TASK_SPACE: '18' },
      spawnProcess: (command, args, options) => {
        assert.equal(command, 'ego-browser')
        assert.equal(args[0], 'nodejs')
        assert.equal(args[1], '-e')
        assert.match(args[2], /taskSpace\(18\)/)
        assert.match(args[2], /task\.page\("p1"\)/)
        assert.match(args[2], /page\.url\(\) !== "http:\/\/127\.0\.0\.1:45678\/\?token=reused_token_1234"/)
        assert.match(args[2], /page\.goto\("http:\/\/127\.0\.0\.1:45678\/\?token=reused_token_1234"\)/)
        assert.deepEqual(options, { detached: true, stdio: 'ignore', shell: false })
        return opener()
      },
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    })
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('uses the shared Ego task space when no numeric task space is configured', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    await openStudio({
      userData,
      env: { ROADMUSIC_EGO_TASK_SPACE: 'not-a-number' },
      spawnProcess: (command, args) => {
        assert.equal(command, 'ego-browser')
        assert.match(args[2], /const name="Road Music 제작실"/)
        assert.match(args[2], /await taskSpace\(name\)/)
        assert.match(args[2], /const reuse=true/)
        assert.match(args[2], /if\(!reuse\)throw new Error/)
        assert.doesNotMatch(args[2], /newPage|takeOverTaskSpace/)
        return opener()
      },
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    })
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('claims only an agent-created completed Road Music page', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    let script = ''
    await openStudio({
      userData,
      env: {},
      spawnProcess: (command, args) => {
        script = args[2]
        assert.equal(command, 'ego-browser')
        assert.match(args[2], /const reuse=true/)
        assert.match(args[2], /item\.name===name/)
        assert.match(args[2], /item\.name\.startsWith\("Road Music"\)/)
        assert.match(args[2], /item\.recentTabTitles\.some/)
        assert.match(args[2], /Showreel 플레이리스트 프리셋/)
        assert.match(args[2], /Showreel 스타일 선택/)
        assert.match(args[2], /JIZURA 가사 가독성 검수/)
        assert.match(args[2], /if\(exact\.length>1\)throw/)
        assert.match(args[2], /if\(fallback\.length>1\)throw/)
        assert.match(args[2], /claimTaskSpace\(existing\.id\)/)
        assert.match(args[2], /pickRoadMusicTab=async task/)
        assert.match(args[2], /task\.tabs\(\)/)
        assert.match(args[2], /task\.adopt\(tab\.page,\{as:"p1"\}\)/)
        assert.match(args[2], /127\\\.0\\\.0\\\.1/)
        assert.match(args[2], /file:\\\/\\\/.*\\\/review\\\.html/)
        return opener()
      },
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    })
    const tab = {}; const managed = { url: async () => session.url, title: async () => 'Road Music 영상 제작실' }
    const adopted = []
    const task = {
      tabs: async () => [{ page: tab, url: session.url, title: 'Road Music 영상 제작실', active: true, openedBy: 'unknown' }],
      adopt: async (page, options) => { adopted.push({ page, options }); return managed },
      page: () => assert.fail('unmanaged tab must be adopted')
    }
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    await new AsyncFunction('listTaskSpaces', 'claimTaskSpace', 'taskSpace', script)(
      async () => [{ id: 18, name: 'Road Music 전체 흐름 검수 20261018', createdBy: 'agent', ownership: 'user', recentTabTitles: ['Road Music 영상 제작실'] }],
      async id => { assert.equal(id, 18); return task },
      async () => assert.fail('completed agent page must be claimed')
    )
    assert.deepEqual(adopted, [{ page: tab, options: { as: 'p1' } }])
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('reuses the same Ego page for results, review, guide, and view/hash routes', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    let script = ''
    await openStudio({
      userData,
      spawnProcess: (command, args) => { assert.equal(command, 'ego-browser'); script = args[2]; return opener() },
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    })
    assert.match(script, /guide\\\/\(\?:\[a-z0-9-\]\+\\\/\)\?/)
    assert.match(script, /view=\(\?:list\|large\)/)
    assert.match(script, /Road Music 환경 상태/)
    assert.match(script, /Road Music 공개 명령 레퍼런스/)
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    for (const suffix of ['results/?token=reused_token_1234&view=large#lyrics','works/?token=reused_token_1234','works/'+ 'a'.repeat(64)+'/?token=reused_token_1234#work-storyboards','storage/?token=reused_token_1234','dashboard/?token=reused_token_1234','status/?token=reused_token_1234','reference/?token=reused_token_1234','recipes/?token=reused_token_1234&engine=YuE','ccm/?token=reused_token_1234&engine=ACE&tag=%EA%B8%B0%EB%8F%84']) {
      const current = 'http://127.0.0.1:45678/'+suffix
      const title = suffix.startsWith('works/') ? 'Road Music 음악 그룹' : 'Road Music 완성 결과'
      const navigated = []
      const page = { url: async () => current, title: async () => title, goto: async value => navigated.push(value) }
      const task = { tabs: async () => [{ label: 'p1', page, url: current, title, active: true }], page: label => { assert.equal(label, 'p1'); return page } }
      const existing = { id: 18, name: 'Road Music 전체 흐름 검수', createdBy: 'agent', ownership: 'agent', recentTabTitles: [title] }
      await new AsyncFunction('listTaskSpaces', 'claimTaskSpace', 'taskSpace', script)(async () => [existing], async () => assert.fail('claim is unnecessary'), async () => task)
      assert.deepEqual(navigated, [session.url])
    }
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('adopts an unlabeled agent-owned Road Music tab before navigating it', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    let script = ''
    await openStudio({
      userData,
      env: {},
      spawnProcess: (command, args) => { script = args[2]; return opener() },
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    })
    const tab = {}; const managed = { url: async () => session.url, title: async () => 'Road Music 영상 제작실' }
    const adopted = []
    const task = {
      tabs: async () => [{ page: tab, url: session.url, title: 'Road Music 영상 제작실', active: true, openedBy: 'unknown' }],
      adopt: async (page, options) => { adopted.push({ page, options }); return managed },
      page: () => assert.fail('unlabeled agent tab must be adopted')
    }
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    await new AsyncFunction('listTaskSpaces', 'claimTaskSpace', 'taskSpace', script)(
      async () => [{ id: 19, name: 'Road Music 제작실', createdBy: 'agent', ownership: 'agent', recentTabTitles: ['Road Music 영상 제작실'] }],
      async () => assert.fail('agent-owned tab must not be claimed'),
      async id => { assert.equal(id, 19); return task }
    )
    assert.deepEqual(adopted, [{ page: tab, options: { as: 'p1' } }])
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('does not claim a completed page when reuse is disabled', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    await openStudio({
      userData,
      env: { ROADMUSIC_EGO_REUSE_ROAD_MUSIC_PAGE: '0' },
      spawnProcess: (command, args) => {
        assert.equal(command, 'ego-browser')
        assert.match(args[2], /const reuse=false/)
        assert.match(args[2], /if\(!reuse\)throw new Error/)
        return opener()
      },
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    })
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('uses the system browser only when explicitly requested', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    await openStudio({
      userData,
      platform: 'darwin',
      env: { ROADMUSIC_STUDIO_BROWSER: 'system' },
      spawnProcess: (command, args) => {
        assert.equal(command, 'open')
        assert.deepEqual(args, [session.url])
        return opener()
      },
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    })
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('surfaces a browser opener error', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  try {
    await assert.rejects(openStudio({
      userData,
      spawnProcess: () => {
        const opened = new EventEmitter()
        opened.unref = () => {}
        process.nextTick(() => opened.emit('error', new Error('open command unavailable')))
        return opened
      },
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    }), /open command unavailable/)
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('stops only its timed-out browser opener', async () => {
  const userData = tempDirectory()
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(project)
  const session = { schemaVersion: 1, url: 'http://127.0.0.1:45678/?token=reused_token_1234', project, pid: 12, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  fs.writeFileSync(sessionPath(userData), JSON.stringify(session))
  let killed = 0
  try {
    await assert.rejects(openStudio({
      userData,
      browserTimeout: 20,
      spawnProcess: () => {
        const opened = new EventEmitter()
        opened.unref = () => {}
        opened.kill = signal => { assert.equal(signal, 'SIGTERM'); killed += 1 }
        process.nextTick(() => opened.emit('spawn'))
        return opened
      },
      requestStudioState: async () => ({ application: 'road-music-video-studio', project })
    }), /브라우저 열기 시간이 초과되었습니다/)
    assert.equal(killed, 1)
  } finally { fs.rmSync(userData, { recursive: true, force: true }) }
})

test('stops only its timed-out project initializer', async () => {
  const root = tempDirectory()
  const userData = tempDirectory()
  const studio = path.join(root, '.agents', 'skills', 'road-music-video-studio')
  fs.mkdirSync(path.join(studio, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(studio, 'scripts', 'studio.py'), '')
  let killed = 0
  try {
    await assert.rejects(openStudio({
      userData,
      root,
      initTimeout: 20,
      spawnProcess: () => {
        const started = child(300)
        started.kill = signal => { assert.equal(signal, 'SIGTERM'); killed += 1 }
        return started
      }
    }), /제작실 초기화 시간이 초과되었습니다/)
    assert.equal(killed, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(userData, { recursive: true, force: true })
  }
})

test('reports a failed project initializer before starting the server', async () => {
  const root = tempDirectory()
  const userData = tempDirectory()
  const studio = path.join(root, '.agents', 'skills', 'road-music-video-studio')
  fs.mkdirSync(path.join(studio, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(studio, 'scripts', 'studio.py'), '')
  try {
    await assert.rejects(openStudio({
      userData,
      root,
      spawnProcess: () => {
        const started = child(301)
        process.nextTick(() => started.emit('exit', 2))
        return started
      }
    }), /제작실 초기화 실패 \(2\)/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(userData, { recursive: true, force: true })
  }
})
