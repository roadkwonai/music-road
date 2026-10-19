#!/usr/bin/env node
'use strict'

// Lightweight real-Electron CLI QA. Every writable path is under one disposable root.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { request, socketEndpoint } = require('../cli/client')

const cliPath = path.resolve(__dirname, '../cli/road-music.js')
const playAudio = process.argv.includes('--player')
const outcomes = []
const failures = []
let root
let dataDir
let songsDir
let servicePid = null

function result (name, status, detail) {
  outcomes.push({ name, status, detail })
  console.log(`${status.toUpperCase()} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function group (name, body) {
  try {
    await body()
    result(name, 'verified')
  } catch (error) {
    const detail = error && (error.stack || error.message) || String(error)
    failures.push({ name, detail })
    result(name, 'blocked', String(error.message || error).split('\n')[0])
  }
}

function processResult (executable, args, { env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', value => { stdout += value })
    child.stderr.on('data', value => { stderr += value })
    child.once('error', reject)
    child.once('close', code => resolve({ code, stdout, stderr }))
    if (input === undefined) child.stdin.end()
    else child.stdin.end(input)
  })
}

function jsonRow (run, label) {
  const lines = run.stdout.trim().split(/\r?\n/).filter(Boolean)
  assert.equal(lines.length, 1, `${label}: expected one JSON line; stdout=${run.stdout}; stderr=${run.stderr}`)
  try { return JSON.parse(lines[0]) } catch { throw new Error(`${label}: invalid JSON: ${run.stdout}\n${run.stderr}`) }
}

async function rawCli (args, options = {}) {
  const run = await processResult(process.execPath, [cliPath, ...args], {
    env: { ...process.env, ROADMUSIC_DATA_DIR: dataDir }, input: options.input
  })
  return { ...run, row: jsonRow(run, args.join(' ')) }
}

async function cli (command, params = {}, flags = []) {
  const run = await rawCli([command, '--json', JSON.stringify(params), ...flags])
  assert.equal(run.code, 0, `${command}: ${JSON.stringify(run.row)}\n${run.stderr}`)
  assert.equal(run.row.ok, true, `${command}: ${JSON.stringify(run.row)}`)
  return run.row.result
}

async function cliError (command, params = {}, flags = [], code) {
  const run = await rawCli([command, '--json', JSON.stringify(params), ...flags])
  assert.notEqual(run.code, 0, `${command} unexpectedly succeeded: ${run.stdout}`)
  assert.equal(run.row.ok, false, `${command}: ${JSON.stringify(run.row)}`)
  if (code) assert.equal(run.row.error.code, code, `${command}: ${JSON.stringify(run.row)}`)
  return run.row.error
}

async function ffmpeg (args) {
  const run = await processResult('ffmpeg', ['-v', 'error', '-y', ...args], { env: process.env })
  assert.equal(run.code, 0, run.stderr)
}

async function treeSnapshot (dir, base = dir, rows = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name)
    const relative = path.relative(base, file)
    if (entry.isDirectory()) {
      rows.push({ path: relative, type: 'directory' })
      await treeSnapshot(file, base, rows)
    } else if (entry.isFile()) {
      const data = await fs.readFile(file)
      rows.push({ path: relative, type: 'file', size: data.length,
        sha256: crypto.createHash('sha256').update(data).digest('hex') })
    }
  }
  return rows
}

function midiFixture () {
  const events = [
    0x00, 0xff, 0x03, 0x06, ...Buffer.from('Melody'),
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x00, 0xc0, 0x00
  ]
  for (const note of [60, 62, 64, 67]) events.push(0x00, 0x90, note, 0x64, 0x60, 0x80, note, 0x00)
  events.push(0x00, 0xff, 0x2f, 0x00)
  const header = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96])
  const track = Buffer.alloc(8)
  track.write('MTrk', 0, 'ascii')
  track.writeUInt32BE(events.length, 4)
  return Buffer.concat([header, track, Buffer.from(events)])
}

async function interactiveBatch () {
  const child = spawn(process.execPath, [cliPath, 'batch', '--no-start'], {
    env: { ...process.env, ROADMUSIC_DATA_DIR: dataDir }, stdio: ['pipe', 'pipe', 'pipe']
  })
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  let buffer = ''; let stderr = ''; const rows = []; const waiters = []
  const push = row => waiters.length ? waiters.shift()(row) : rows.push(row)
  child.stdout.on('data', chunk => {
    buffer += chunk
    let end
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
      if (line) push(JSON.parse(line))
    }
  })
  child.stderr.on('data', chunk => { stderr += chunk })
  const next = () => rows.length ? Promise.resolve(rows.shift()) : new Promise(resolve => waiters.push(resolve))
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => resolve(code))
  })
  child.stdin.write('{"id":"one","command":"projects:list","params":{}}\n')
  const first = await Promise.race([next(), new Promise((_, reject) => setTimeout(() => reject(new Error('batch first response timeout')), 2000))])
  assert.equal(first.id, 'one')
  assert.equal(first.ok, true)
  child.stdin.write('{"id":"two","command":"projects:create","params":{}}\n')
  const second = await Promise.race([next(), new Promise((_, reject) => setTimeout(() => reject(new Error('batch second response timeout')), 2000))])
  assert.equal(second.id, 'two')
  assert.equal(second.ok, false)
  assert.equal(second.error.code, 'INVALID_ARGUMENT')
  child.stdin.end()
  assert.equal(await closed, 2, stderr)
}

async function waitForServiceDown () {
  const endpoint = socketEndpoint(dataDir)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await request({ endpoint, command: 'cli:status', timeout: 100 }) } catch { return true }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
}

async function serviceStopped () {
  const socketDown = await waitForServiceDown()
  if (!socketDown) return false
  if (!servicePid) return true
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { process.kill(servicePid, 0) } catch { return true }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
}

async function main () {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-cli-extended-'))
  dataDir = path.join(root, 'data')
  songsDir = path.join(dataDir, 'Songs')
  const fixtures = path.join(root, 'fixtures')
  const exportsDir = path.join(root, 'exports')
  await fs.mkdir(fixtures, { recursive: true })
  await fs.mkdir(exportsDir, { recursive: true })
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({
    language: 'ko', engineSetupSkipped: true, dataDir, hfHome: path.join(dataDir, 'models'), songsDir
  }, null, 1))
  console.log(`임시 검증 루트: ${root}`)

  await group('CLI 구문·도움말·no-start', async () => {
    const help = await rawCli(['--help'])
    assert.equal(help.code, 0)
    assert.match(help.row.result.usage, /--no-start/)
    const schema = await rawCli(['schema'])
    assert.equal(schema.code, 0)
    assert.ok(schema.row.result.commands.some(entry => entry.command === 'songs:import'))
    const commandHelp = await rawCli(['songs:list', '--help'])
    assert.equal(commandHelp.row.result.command, 'songs:list')
    assert.equal((await rawCli(['songs:list', '--no-start'])).row.error.code, 'connection')
    assert.equal((await rawCli(['songs:list', '--json', '{bad}'])).code, 2)
    assert.equal((await rawCli(['songs:list', '--unknown', 'x'])).row.error.code, 'invalid_arguments')
  })

  await group('서비스 기동·단일 인스턴스·상태', async () => {
    const started = await rawCli(['service:start'])
    assert.equal(started.code, 0)
    servicePid = started.row.result.pid
    assert.equal(started.row.result.dataDir, dataDir)
    const again = await rawCli(['service:start'])
    assert.equal(again.row.result.pid, servicePid)
    const status = await cli('service:status')
    assert.equal(status.pid, servicePid)
    assert.equal(status.visible, false)
    assert.equal((await cli('app:state')).ready, true)
    assert.ok(Array.isArray(await cli('engines:list')))
    assert.equal((await cli('setup:location')).dataDir, dataDir)
    assert.ok((await cli('about:info')).electron)
  })

  await group('실제 스키마·필수 인수·내부 명령 차단', async () => {
    const schema = await cli('cli:schema')
    const commands = new Map(schema.commands.map(entry => [entry.command, entry]))
    assert.deepEqual(commands.get('projects:rename').params.required, ['from', 'to'])
    assert.deepEqual(commands.get('job:wait').params.required, ['jobId'])
    assert.equal(commands.has('video:frame'), false)
    assert.equal(commands.has('video:prepare'), false)
    await cliError('projects:create', {}, [], 'INVALID_ARGUMENT')
    await cliError('songs:list', { extra: true }, [], 'INVALID_ARGUMENT')
    await cliError('video:frame', { jobId: 'render-1', index: 0, data: [0, 0, 0, 0] }, [], 'UNKNOWN_COMMAND')
  })

  await group('프로젝트 생성·조회·이름 변경·선택·file/stdin', async () => {
    const createFile = path.join(fixtures, 'project.json')
    await fs.writeFile(createFile, JSON.stringify({ name: 'QA Alpha' }))
    const created = await rawCli(['projects:create', '--file', createFile])
    assert.equal(created.code, 0)
    assert.equal(created.row.result.current, 'QA Alpha')
    assert.equal((await cli('projects:create', { name: 'QA Beta' })).current, 'QA Beta')
    const renamed = await rawCli(['projects:rename', '--stdin'], { input: JSON.stringify({ from: 'QA Alpha', to: 'QA Gamma' }) })
    assert.equal(renamed.code, 0)
    await cli('projects:select', { name: 'QA Gamma' })
    const listed = await cli('projects:list')
    assert.equal(listed.current, 'QA Gamma')
    assert.deepEqual(listed.projects.map(project => project.name).filter(name => name.startsWith('QA ')).sort(), ['QA Beta', 'QA Gamma'])
    await cliError('projects:create', { name: 'QA Gamma' })
  })

  await group('실제 JSONL 대화형 배치', interactiveBatch)

  const wav = path.join(fixtures, 'fixture-one.wav')
  const flac = path.join(fixtures, 'fixture-two.flac')
  const mp3 = path.join(fixtures, 'fixture-three.mp3')
  const image = path.join(fixtures, 'background.png')
  await group('FFmpeg WAV·FLAC·MP3 합성 픽스처', async () => {
    await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.4', wav])
    await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=550:duration=1.5', flac])
    await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=1.6', '-b:a', '128k', mp3])
    await ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=32x32:d=0.1', '-frames:v', '1', image])
    for (const file of [wav, flac, mp3, image]) assert.ok((await fs.stat(file)).size > 50)
  })

  let songs = []
  await group('곡 가져오기 WAV·FLAC 변환·MP3·상세', async () => {
    const imported = await cli('songs:import', {}, ['--input', wav, '--input', flac, '--input', mp3])
    assert.equal(imported.count, 3)
    assert.deepEqual(imported.failures, [])
    songs = await cli('songs:list')
    assert.equal(songs.length, 3)
    assert.ok(songs.some(song => song.source === path.basename(flac) && /\.wav$/i.test(song.audio)))
    assert.ok(songs.some(song => song.source === path.basename(wav) && /\.wav$/i.test(song.audio)))
    assert.ok(songs.some(song => song.source === path.basename(mp3) && /\.mp3$/i.test(song.audio)))
    assert.equal((await cli('song:detail', { dir: songs[0].dir })).dir, songs[0].dir)
  })

  await group('곡 이름·순서·숨김·복원', async () => {
    await cli('song:rename', { dir: songs[0].dir, title: 'QA 이름 변경' })
    songs = await cli('songs:list')
    const renamed = songs.find(song => song.title === 'QA 이름 변경')
    assert.ok(renamed)
    const reversed = songs.map(song => song.folder).reverse()
    await cli('songs:reorder', { folders: reversed })
    assert.deepEqual((await cli('songs:list')).map(song => song.folder), reversed)
    await cli('songs:hide', { folder: renamed.folder, hide: true })
    assert.ok((await cli('songs:hidden')).some(song => song.folder === renamed.folder))
    assert.ok(!(await cli('songs:list')).some(song => song.folder === renamed.folder))
    await cli('songs:hide', { folder: renamed.folder, hide: false })
    assert.ok((await cli('songs:list')).some(song => song.folder === renamed.folder))
    songs = await cli('songs:list')
  })

  let asset
  await group('에셋 가져오기·목록', async () => {
    const imported = await cli('assets:import', {}, ['--input', image])
    assert.equal(imported.added.length, 1)
    asset = imported.assets.find(item => item.path === imported.added[0])
    assert.ok(asset)
    assert.ok((await cli('assets:list')).assets.some(item => item.path === asset.path))
  })

  await group('곡 이미지 배경 설정·지우기', async () => {
    const song = songs[0]
    const set = await cli('song:background', { dir: song.dir }, ['--input', image])
    assert.equal(set.ok, true)
    assert.ok(set.background && set.background.path.startsWith(song.dir))
    await cli('song:background-clear', { dir: song.dir })
    const names = await fs.readdir(song.dir)
    assert.ok(!names.some(name => /^background\./.test(name)))
  })

  await group('영상 옵션 부분 병합·저장·오류·라운드트립', async () => {
    const video = {
      resolution: '720p', fps: 30, renderer: 'cpu', length: { mode: 'repeat', count: 2 },
      spectrum: { visible: true, kind: 'mirror', barCount: 16, position: 'bottom' },
      eq: { on: true, preset: 'custom', gains: [1, 0, 0, 0, 0, 0, -1] },
      tracklist: { visible: true, title: 'QA' },
      overlays: [{ id: 'qa', path: asset.path, name: asset.name, x: 0.5, y: 0.5, w: 0.2, opacity: 0.8, start: 0, end: null }]
    }
    const configured = await cli('video:configure', { video, save: true })
    assert.equal(configured.video.resolution, '720p')
    assert.equal(configured.video.eq.on, true)
    await cli('video:save-settings', { video: { resolution: '1080p', eq: { on: false } } })
    const saved = await cli('video:settings')
    assert.equal(saved.resolution, '1080p')
    assert.equal(saved.eq.on, false)
    assert.equal(saved.fps, 30)
    const state = await cli('video:state')
    assert.equal(state.prepared, false)
    await cliError('video:configure', { video: { spectrum: { barCount: 7 } } }, [], 'INVALID_ARGUMENT')
    await cliError('video:configure', { video: { overlays: [{ path: asset.path, start: 2, end: 1 }] } })
  })

  await group('프리셋 저장·폴더 이동·갱신·삭제', async () => {
    await cli('presets:save', { preset: { name: 'QA Preset', style: 'jazz', folder: '', parts: { genre: 'jazz', instruments: ['piano'] } } })
    await cli('presets:move', { name: 'QA Preset', folder: 'QA Folder' })
    await cli('presets:save', { preset: { name: 'QA Preset', style: 'ambient', folder: 'QA Folder' } })
    let presets = await cli('presets:list')
    assert.equal(presets.filter(preset => preset.name === 'QA Preset').length, 1)
    assert.equal(presets.find(preset => preset.name === 'QA Preset').style, 'ambient')
    await cli('presets:delete', { name: 'QA Preset' }, ['--confirm'])
    presets = await cli('presets:list')
    assert.ok(!presets.some(preset => preset.name === 'QA Preset'))
  })

  await group('녹음 파일 선택·격리 복사', async () => {
    const picked = await cli('recording:pick', {}, ['--input', wav])
    assert.equal(picked.ok, true)
    assert.ok(picked.path.startsWith(path.join(dataDir, 'recordings')))
    assert.ok(picked.seconds >= 1)
    assert.ok((await fs.stat(picked.path)).size > 1000)
  })

  const abc = 'X:1\nT:QA\nM:4/4\nL:1/16\nQ:1/4=120\nV: Vocal\nV: Ins\nK:C\nV: Vocal\nC4D4E4F4|\nV: Ins\nZ|\n'
  await group('ABC·MIDI 열기·MIDI 순수 변환', async () => {
    const abcFile = path.join(fixtures, 'fixture.abc')
    const midiFile = path.join(fixtures, 'fixture.mid')
    await fs.writeFile(abcFile, abc)
    await fs.writeFile(midiFile, midiFixture())
    const openedAbc = await cli('score:open', {}, ['--input', abcFile])
    assert.equal(openedAbc.kind, 'abc')
    assert.equal(openedAbc.text, abc)
    const openedMidi = await cli('score:open', {}, ['--input', midiFile])
    assert.equal(openedMidi.kind, 'midi')
    assert.match(openedMidi.result.abc, /^X:1/m)
    assert.ok(openedMidi.choice.vocal)
    const converted = await cli('score:convert', { choice: openedMidi.choice })
    assert.match(converted.result.abc, /V: Vocal/)
    const unavailable = await cliError('score:check', { text: abc })
    assert.match(unavailable.message, /실행 환경|악보 검사/)
    result('YuE 공식 ABC 검사', 'not_run', '격리된 데이터 루트에 Python 실행 환경이 없음')
  })

  await group('테스트 메타데이터 SRT 반환·저장·악보 조회', async () => {
    songs = await cli('songs:list')
    const song = songs[0]
    const metaFile = path.join(song.dir, 'meta.json')
    const meta = JSON.parse(await fs.readFile(metaFile, 'utf8'))
    await fs.writeFile(metaFile, JSON.stringify({ ...meta, imported: false, instrumental: false,
      lyrics: '[Verse]\n첫 줄\n둘째 줄', style: 'qa style', engine: 'yue', seconds: 12 }, null, 1))
    const returned = await cli('song:srt', { dir: song.dir })
    assert.match(returned.text, /첫 줄/)
    assert.match(returned.text, /-->/)
    const srtFile = path.join(exportsDir, 'fixture.srt')
    const saved = await cli('song:srt', { dir: song.dir, save: true }, ['--output', srtFile])
    assert.equal(saved.saved.path, srtFile)
    assert.match(await fs.readFile(srtFile, 'utf8'), /둘째 줄/)
    await fs.writeFile(path.join(song.dir, 'score.abc'), abc)
    assert.equal((await cli('song:score', { dir: song.dir })).abc, abc)
    assert.equal((await cli('song:clone', { dir: song.dir })).request.style, 'qa style')
    const renderError = await cliError('song:render', { dir: song.dir, abc })
    assert.match(renderError.message, /엔진|설치/)
  })

  await group('설정 부분 병합·내보내기 폴더', async () => {
    await cli('settings:set', { patch: { autoMp3: true } })
    await cli('settings:set', { patch: { dropWav: false } })
    const settings = await cli('settings:get')
    assert.equal(settings.autoMp3, true)
    assert.equal(settings.dropWav, false)
    const picked = await cli('settings:pick-export', {}, ['--output', exportsDir])
    assert.equal(picked.path, exportsDir)
    const raw = JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8'))
    assert.equal(raw.language, 'ko')
    assert.equal(raw.songsDir, songsDir)
    assert.equal(raw.exportDir, exportsDir)
  })

  await group('언어 변경·리로드 후 상태', async () => {
    assert.equal(await cli('app:language'), 'ko')
    assert.equal((await cli('app:set-language', { lang: 'en' })).ok, true)
    assert.equal(await cli('app:language'), 'en')
    assert.ok((await cli('renderer:catalog')).actions.includes('video:configure'))
    assert.equal((await cli('app:set-language', { lang: 'ko' })).ok, true)
    assert.equal(await cli('app:language'), 'ko')
  })

  await group('에셋 제거·원본 보존', async () => {
    await cli('assets:remove', { file: asset.path }, ['--confirm'])
    assert.ok(!(await cli('assets:list')).assets.some(item => item.path === asset.path))
    assert.ok((await fs.stat(image)).isFile())
  })

  await group('실제 임시 곡 휴지통 이동', async () => {
    songs = await cli('songs:list')
    const disposable = songs.find(song => song.source === path.basename(mp3))
    assert.ok(disposable)
    await cli('song:delete', { dir: disposable.dir }, ['--confirm'])
    assert.ok(!(await cli('songs:list')).some(song => song.dir === disposable.dir))
    await assert.rejects(fs.stat(disposable.dir), { code: 'ENOENT' })
  })

  await group('임시 곡 라이브러리 이동', async () => {
    const before = songsDir
    const beforeStat = await fs.stat(before)
    const beforeTree = await treeSnapshot(before)
    const parent = path.join(root, 'moved-library-parent')
    const moved = await cli('settings:move-songs', {}, ['--output', parent, '--confirm'])
    const settings = await cli('settings:get')
    songsDir = settings.songsDir
    const expected = await fs.realpath(path.join(parent, 'Road Music Songs'))
    const returned = await fs.realpath(moved.path)
    const configured = await fs.realpath(songsDir)
    assert.equal(returned, expected)
    assert.equal(configured, expected)
    assert.equal((await fs.stat(configured)).ino, beforeStat.ino)
    assert.deepEqual(await treeSnapshot(configured), beforeTree)
    await assert.rejects(fs.stat(before), { code: 'ENOENT' })
    songs = await cli('songs:list')
    assert.equal(songs.length, 2)
    for (const song of songs) {
      const relative = path.relative(configured, await fs.realpath(song.dir))
      assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
    }
  })

  await group('플레이어 비재생 상태', async () => {
    const state = await cli('player:state')
    assert.equal(state.playing, false)
    await cli('player:stop')
  })
  if (playAudio) {
    await group('플레이어 실제 오디오 명령', async () => {
      songs = await cli('songs:list')
      const played = await cli('player:play', { dir: songs[0].dir })
      assert.equal(played.playing, true)
      await cli('player:seek', { seconds: 0.1 })
      await cli('player:pause')
      await cli('player:next')
      await cli('player:previous')
      await cli('player:stop')
    })
  } else result('플레이어 실제 오디오 명령', 'not_run', '--player 옵션에서만 실행')

  await group('설치되지 않은 엔진의 안전한 생성 거부', async () => {
    const error = await cliError('song:generate', { title: 'QA no engine', style: 'ambient', instrumental: true, engine: 'yue' })
    assert.match(error.message, /엔진|모델|설치/)
    const queue = await cli('queue:list')
    assert.equal(queue.current, null)
    assert.deepEqual(queue.waiting, [])
  })

  await group('서비스 종료·저장된 빈 대기 작업 복원', async () => {
    await cli('queue:pause', { value: true })
    await cli('service:stop', {}, ['--confirm'])
    assert.equal(await waitForServiceDown(), true)

    const project = (await fs.readdir(songsDir)).find(name => name === 'QA Gamma')
    assert.ok(project)
    const partial = path.join(songsDir, project, '20990101000000_QA waiting')
    const jobId = 'qa-waiting-job'
    await fs.mkdir(partial, { recursive: true })
    const job = { cmd: 'generate', engine: 'yue', jobId, outDir: partial, id: 'song', title: 'QA waiting',
      style: 'ambient', lyrics: '', instrumental: true, soundEffect: false, seed: 1 }
    await fs.writeFile(path.join(partial, 'meta.json'), JSON.stringify({ ...job, status: 'queued' }, null, 1))
    await fs.writeFile(path.join(dataDir, 'queue.json'), JSON.stringify({ paused: true,
      items: [{ jobId, outDir: partial, title: 'QA waiting', job }] }, null, 1))

    const restarted = await rawCli(['service:start'])
    assert.equal(restarted.code, 0)
    servicePid = restarted.row.result.pid
    const queue = await cli('queue:list')
    assert.equal(queue.paused, true)
    assert.equal(queue.waiting[0].jobId, jobId)
    assert.ok((await fs.stat(partial)).isDirectory())
  })

  await group('일시정지 생성 큐·timeout·busy 종료 보호', async () => {
    await cli('queue:clear', {}, ['--confirm'])
    await cli('queue:pause', { value: true })
    const settingsFile = path.join(dataDir, 'settings.json')
    const settings = JSON.parse(await fs.readFile(settingsFile, 'utf8'))
    await fs.writeFile(settingsFile, JSON.stringify({ ...settings, setupDone: true }, null, 1))
    await fs.mkdir(path.join(dataDir, 'runtime', 'venv', 'bin'), { recursive: true })
    await fs.writeFile(path.join(dataDir, 'runtime', 'venv', 'bin', 'python'), '')
    for (const repo of ['m-a-p--YuE2-3B', 'm-a-p--YuE2-Vae']) {
      const model = path.join(dataDir, 'models', 'hub', `models--${repo}`)
      await fs.mkdir(path.join(model, 'refs'), { recursive: true })
      await fs.mkdir(path.join(model, 'snapshots', 'qa'), { recursive: true })
      await fs.writeFile(path.join(model, 'refs', 'main'), 'qa')
      await fs.writeFile(path.join(model, 'snapshots', 'qa', 'config.json'), '{}')
      await fs.writeFile(path.join(model, 'snapshots', 'qa', 'model.safetensors'), '')
    }
    const queued = []
    for (const title of ['QA paused one', 'QA paused two', 'QA paused three']) {
      queued.push(await cli('song:generate', { title, style: 'ambient', instrumental: true, engine: 'yue' }))
    }
    const ids = queued.map(item => item.jobId)
    assert.ok(ids.every(Boolean))
    let queue = await cli('queue:list')
    assert.equal(queue.paused, true)
    assert.deepEqual(queue.waiting.map(item => item.jobId), ids)
    await cli('queue:move', { jobId: ids[2], delta: -2 })
    assert.deepEqual((await cli('queue:list')).waiting.map(item => item.jobId), [ids[2], ids[0], ids[1]])
    await cli('queue:reorder', { ids: [ids[1], ids[2], ids[0]] })
    assert.deepEqual((await cli('queue:list')).waiting.map(item => item.jobId), [ids[1], ids[2], ids[0]])
    const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'queue.json'), 'utf8'))
    const removedDir = saved.items.find(item => item.jobId === ids[2]).outDir
    await cli('queue:remove', { jobId: ids[2] }, ['--confirm'])
    queue = await cli('queue:list')
    assert.deepEqual(queue.waiting.map(item => item.jobId), [ids[1], ids[0]])
    await assert.rejects(fs.stat(removedDir), { code: 'ENOENT' })
    await cliError('job:wait', { jobId: ids[1], timeoutMs: 25 }, [], 'timeout')
    await cliError('service:stop', {}, [], 'BUSY')
    await cli('queue:clear', {}, ['--confirm'])
    assert.deepEqual((await cli('queue:list')).waiting, [])
  })

  await group('실패 작업 재시도·dismiss·partial 원본 보존', async () => {
    await cli('service:stop', {}, ['--confirm'])
    assert.equal(await waitForServiceDown(), true)
    const project = (await fs.readdir(songsDir)).find(name => name === 'QA Gamma')
    assert.ok(project)
    const retryDir = path.join(songsDir, project, '20990101000002_QA retry')
    const dismissDir = path.join(songsDir, project, '20990101000003_QA dismiss')
    for (const [dir, title] of [[retryDir, 'QA retry'], [dismissDir, 'QA dismiss']]) {
      await fs.mkdir(path.join(dir, 'plan'), { recursive: true })
      await fs.writeFile(path.join(dir, 'plan', 'plan_manifest.json'), JSON.stringify({ title }))
      await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ title, status: 'failed', engine: 'yue', style: 'ambient', instrumental: true }, null, 1))
    }
    const failed = [
      { jobId: 'qa-retry-old', outDir: retryDir, title: 'QA retry', message: 'fixture retry',
        job: { cmd: 'generate', engine: 'yue', jobId: 'qa-retry-old', outDir: retryDir, id: 'song', title: 'QA retry', style: 'ambient', lyrics: '', instrumental: true, soundEffect: false, seed: 3 } },
      { jobId: 'qa-dismiss-old', outDir: dismissDir, title: 'QA dismiss', message: 'fixture dismiss',
        job: { cmd: 'generate', engine: 'yue', jobId: 'qa-dismiss-old', outDir: dismissDir, id: 'song', title: 'QA dismiss', style: 'ambient', lyrics: '', instrumental: true, soundEffect: false, seed: 4 } }
    ]
    await fs.writeFile(path.join(dataDir, 'queue.json'), JSON.stringify({ paused: true, items: [], failed, results: [] }, null, 1))
    const restarted = await rawCli(['service:start'])
    assert.equal(restarted.code, 0)
    servicePid = restarted.row.result.pid
    assert.deepEqual((await cli('queue:list')).failed.map(item => item.jobId), ['qa-retry-old', 'qa-dismiss-old'])

    const retried = await cli('queue:retry', { jobId: 'qa-retry-old' })
    assert.ok(retried.jobId && retried.jobId !== 'qa-retry-old')
    let queue = await cli('queue:list')
    assert.equal(queue.paused, true)
    assert.deepEqual(queue.waiting.map(item => item.jobId), [retried.jobId])
    assert.deepEqual(queue.failed.map(item => item.jobId), ['qa-dismiss-old'])
    const persisted = JSON.parse(await fs.readFile(path.join(dataDir, 'queue.json'), 'utf8'))
    assert.equal(await fs.realpath(persisted.items[0].outDir), await fs.realpath(retryDir))
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(retryDir, 'plan', 'plan_manifest.json'), 'utf8')), { title: 'QA retry' })

    await cli('queue:dismiss', { jobId: 'qa-dismiss-old' })
    queue = await cli('queue:list')
    assert.deepEqual(queue.failed, [])
    assert.ok((await fs.stat(dismissDir)).isDirectory())
    await cli('queue:remove', { jobId: retried.jobId }, ['--confirm'])
    assert.deepEqual((await cli('queue:list')).waiting, [])
    assert.ok((await fs.stat(retryDir)).isDirectory())
  })

  await group('실패·터미널 작업 결과 8/64개 재시작 영속', async () => {
    await cli('service:stop', {}, ['--confirm'])
    assert.equal(await waitForServiceDown(), true)
    const failed = Array.from({ length: 10 }, (_, index) => ({
      jobId: `qa-failed-${index}`, title: `failed ${index}`, message: `failure ${index}`,
      job: { cmd: 'generate', engine: 'yue', jobId: `qa-failed-${index}`, title: `failed ${index}`, style: 'qa' }
    }))
    const results = Array.from({ length: 66 }, (_, index) => [
      `qa-terminal-${index}`, { ok: false, jobId: `qa-terminal-${index}`, message: `terminal ${index}` }
    ])
    await fs.writeFile(path.join(dataDir, 'queue.json'), JSON.stringify({ paused: false, items: [], failed, results }, null, 1))

    const verifyRestored = async () => {
      const queue = await cli('queue:list')
      assert.equal(queue.failed.length, 8)
      assert.deepEqual(queue.failed.map(item => item.jobId), failed.slice(0, 8).map(item => item.jobId))
      for (const index of [2, 65]) {
        const error = await cliError('job:wait', { jobId: `qa-terminal-${index}` })
        assert.equal(error.details.jobId, `qa-terminal-${index}`)
        assert.equal(error.details.message, `terminal ${index}`)
      }
      await cliError('job:wait', { jobId: 'qa-terminal-0' }, [], 'JOB_NOT_FOUND')
    }

    let restarted = await rawCli(['service:start'])
    assert.equal(restarted.code, 0)
    servicePid = restarted.row.result.pid
    await verifyRestored()
    await cli('service:stop', {}, ['--confirm'])
    assert.equal(await waitForServiceDown(), true)
    restarted = await rawCli(['service:start'])
    assert.equal(restarted.code, 0)
    servicePid = restarted.row.result.pid
    await verifyRestored()
  })

  result('실제 곡 생성·모델 설치·모델 이동', 'not_run', '격리·경량 검증 범위에서 제외')
  result('영상 preview/prepare/render·GPU·프레임 내부 명령', 'not_run', '다른 검증 실행과 GPU/생성 경합 방지')
  result('브라우저·shell open·feedback·notice open', 'not_run', '외부 부작용 명령 제외')

  if (failures.length) throw new Error(`${failures.length}개 기능군 실패`)
}

main().catch(error => {
  if (!failures.length) failures.push({ name: 'harness', detail: error.stack || error.message })
  process.exitCode = 1
}).finally(async () => {
  if (dataDir) {
    try { await cli('service:stop', {}, ['--confirm']) } catch {}
  }
  const stopped = dataDir ? await serviceStopped() : true
  const safeRoot = root && path.basename(root).startsWith('roadmusic-cli-extended-') && path.dirname(root) === os.tmpdir()
  if (!failures.length && stopped && safeRoot) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  else if (root) console.error(`검증 로그 보존: ${root}`)
  console.log(JSON.stringify({ ok: failures.length === 0, outcomes, failures, serviceStopped: stopped }, null, 2))
})
