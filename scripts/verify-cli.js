#!/usr/bin/env node
'use strict'
// Exercises the real Electron/ffmpeg path in a disposable library. --generation reuses installed models.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { defaultUserData, socketEndpoint, request } = require('../cli/client')

async function processResult (executable, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', value => { stdout += value })
    child.stderr.on('data', value => { stderr += value })
    child.once('error', reject)
    child.once('close', code => resolve({ code, stdout, stderr }))
  })
}

async function main () {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-cli-verify-'))
  const dataDir = path.join(root, 'data')
  const env = { ...process.env, ROADMUSIC_DATA_DIR: dataDir }
  const cliPath = path.resolve(__dirname, '../cli/road-music.js')
  const cli = async (command, params = {}, flags = [], expected = true) => {
    const result = await processResult(process.execPath, [cliPath, command, '--json', JSON.stringify(params), ...flags], env)
    let row
    try { row = JSON.parse(result.stdout.trim()) } catch { throw new Error(`Invalid CLI output: ${result.stdout}\n${result.stderr}`) }
    assert.equal(row.ok, expected, `${command}: ${JSON.stringify(row)}`)
    if (expected) assert.equal(result.code, 0)
    else assert.notEqual(result.code, 0)
    return expected ? row.result : row.error
  }
  const settings = { language: 'ko', engineSetupSkipped: true, songsDir: path.join(dataDir, 'Songs') }
  if (process.argv.includes('--generation')) {
    const installed = JSON.parse(await fs.readFile(path.join(defaultUserData(), 'settings.json'), 'utf8'))
    assert.equal(installed.aceInstalled, true, 'ACE-Step must be installed before generation verification')
    settings.dataDir = installed.dataDir || defaultUserData()
    settings.aceInstalled = true
  }
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify(settings))
  let passed = false
  let servicePid = null
  try {
    const schema = await cli('cli:schema')
    assert.ok(schema.commands.some(entry => entry.command === 'video:render'))
    const service = await cli('service:start')
    servicePid = service.pid
    assert.equal(service.dataDir, dataDir)
    assert.match((await cli('about:info')).os, process.platform === 'darwin' ? /^macOS / : /.+/)
    await cli('video:configure', { video: { resolution: '720p' }, save: true })
    assert.equal((await cli('video:settings')).resolution, '720p')
    await cli('video:save-settings', { video: { eq: { on: true } } })
    assert.equal((await cli('video:state')).resolution, '720p')
    assert.equal((await cli('video:state')).eq.on, true)
    await cli('projects:create', { name: 'CLI 검증' })
    assert.equal((await cli('projects:list')).current, 'CLI 검증')
    console.log('PASS 서비스·스키마·프로젝트')

    const input = path.join(root, '한글 음원 1.wav')
    const second = path.join(root, '한글 음원 2.wav')
    for (const [file, frequency] of [[input, 440], [second, 660]]) {
      const result = await processResult('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=1.5`, file], env)
      assert.equal(result.code, 0, result.stderr)
    }
    assert.equal((await cli('songs:import', {}, ['--input', input, '--input', second])).count, 2)
    let songs = await cli('songs:list')
    assert.equal(songs.length, 2)
    await cli('song:rename', { dir: songs[0].dir, title: '검증 곡' })
    songs = await cli('songs:list')
    const exportPath = path.join(root, '내보내기.mp3')
    assert.equal((await cli('song:export', { dir: songs[0].dir, title: '검증 곡', format: 'mp3' }, ['--output', exportPath])).path, exportPath)
    assert.ok((await fs.stat(exportPath)).size > 1000)
    assert.equal((await cli('song:export', { dir: songs[0].dir }, ['--output', exportPath], false)).code, 'OUTPUT_EXISTS')
    const album = await cli('album:export', { format: 'wav' }, ['--output', path.join(root, '앨범')])
    assert.equal(album.count, 2)
    assert.equal((await cli('recording:pick', {}, ['--input', input])).ok, true)
    console.log('PASS 음악 불러오기·이름 변경·MP3·앨범·녹음 파일')

    assert.equal((await cli('lyrics:numbers', { text: '2024년' })).text, '이천이십사년')
    assert.match((await cli('prompt:compose', { genre: 'jazz', instruments: ['piano'], bpm: 90, instrumental: true })).style, /90 BPM/)
    await cli('presets:save', { preset: { name: 'CLI 재즈', style: 'jazz', instrumental: true, parts: { genre: 'jazz', instruments: ['piano'] } } })
    assert.ok((await cli('presets:list')).some(preset => preset.name === 'CLI 재즈'))
    assert.ok((await cli('renderer:catalog')).presets.length > 0)
    await cli('settings:set', { patch: { autoMp3: true, dropWav: false } })
    assert.equal((await cli('settings:get')).autoMp3, true)
    const metaPath = path.join(songs[0].dir, 'meta.json')
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
    await fs.writeFile(metaPath, JSON.stringify({ ...meta, imported: false, lyrics: '[Verse]\n밤길을 걸어요', style: 'jazz' }))
    const srtPath = path.join(root, '가사.srt')
    const srt = await cli('song:srt', { dir: songs[0].dir, save: true }, ['--output', srtPath])
    assert.match(srt.text, /-->/)
    assert.match(await fs.readFile(srtPath, 'utf8'), /밤길을 걸어요/)
    console.log('PASS 가사·프롬프트·프리셋·설정·SRT')

    const options = { resolution: '720p', fps: 30, renderer: 'cpu', length: { mode: 'once' },
      spectrum: { visible: true, kind: 'mirror', barCount: 16 }, eq: { on: true, gains: [1, 0, 0, 0, 0, 0, 0] },
      tracklist: { visible: true }, overlays: [{ path: path.resolve(__dirname, '../build/icon.png'), x: 0.85, y: 0.15, w: 0.1, ar: 1, opacity: 0.8, start: 0, end: null }] }
    const tracks = songs.slice().reverse().map(song => song.dir)
    const preview = await cli('video:preview', { tracks, video: options })
    assert.equal(preview.prepared, true)
    const videoPath = path.join(root, '스펙트럼.mp4')
    const rendering = cli('video:render', { tracks, video: options, name: 'CLI 검증' }, ['--output', videoPath])
    let busy = false
    for (let index = 0; index < 20; index++) {
      const status = await cli('service:status')
      if (status.requests.some(item => item.command === 'video:render')) { busy = true; break }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    if (busy) assert.equal((await cli('service:stop', {}, [], false)).code, 'BUSY')
    const video = await rendering
    assert.ok((await fs.stat(videoPath)).size > 1000)
    assert.ok(video.chapters)
    const chapters = await cli('video:chapters')
    assert.equal(chapters[0].title, songs[songs.length - 1].title)
    await cli('video:cancel')
    await cli('editor:open'); await cli('editor:close')
    console.log('PASS 720p 스펙트럼·EQ·로고·트랙리스트 MP4·챕터·종료 보호')
    if (process.argv.includes('--gpu')) {
      const output = path.join(root, 'GPU 영상.mp4')
      const gpuVideo = await cli('video:render', { tracks, video: { ...options, renderer: 'gpu', overlays: [], tracklist: { visible: false } } }, ['--output', output])
      assert.equal(gpuVideo.ok, true)
      assert.ok((await fs.stat(output)).size > 1000)
      console.log('PASS GPU 영상 인코딩')
    }

    await cli('queue:pause', { value: true })
    assert.equal((await cli('queue:list')).paused, true)
    await cli('queue:pause', { value: false })
    assert.equal((await cli('song:delete', { dir: path.dirname(songs[0].dir) }, ['--confirm'], false)).code, 'INVALID_ARGUMENT')
    assert.equal((await cli('song:generate', { style: 'jazz', instrumental: true, engine: 'yue', soundEffect: true, targetSeconds: 3 }, [], false)).code, 'INVALID_ARGUMENT')
    if (process.argv.includes('--generation')) {
      const generating = cli('song:generate', { title: 'CLI 생성 검증', style: 'ambient piano, calm', instrumental: true, targetSeconds: 10, seed: 42, count: 2 }, ['--wait', '--events'])
      for (let index = 0; index < 30; index++) {
        if ((await cli('queue:list')).current) break
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      await cli('song:cancel', { jobId: 'wrong-job-id' }, [], false)
      const generated = await generating
      assert.equal(generated.songs.length, 2)
      assert.notEqual(generated.songs[0].song.jobId, generated.songs[1].song.jobId)
      assert.notEqual(generated.songs[0].song.dir, generated.songs[1].song.dir)
      const song = generated.songs[0].song
      assert.ok(song.jobId)
      assert.ok((await fs.stat(song.audio)).size > 1000)
      assert.equal((await cli('job:wait', { jobId: song.jobId })).song.jobId, song.jobId)
      console.log('PASS 실제 ACE-Step 2곡 생성·완료 대기·재조회')
      const generateOne = async params => {
        const result = await cli('song:generate', params, ['--wait', '--events'])
        assert.equal(result.songs.length, 1)
        const made = result.songs[0].song
        const probe = await processResult('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', made.audio], env)
        assert.equal(probe.code, 0, probe.stderr)
        assert.ok(Number(JSON.parse(probe.stdout).format.duration) > 0)
        return made
      }
      const vocal = await generateOne({ title: '가사 검증', style: 'gentle Korean acoustic pop, female vocal, piano',
        lyrics: '[Verse]\n아침 햇살 따라\n천천히 걸어요', targetSeconds: 10, seed: 42 })
      const subtitle = await cli('song:srt', { dir: vocal.dir })
      assert.match(subtitle.text, /-->/)
      const effect = await generateOne({ title: '효과음 검증', style: 'short gentle electronic notification chime',
        soundEffect: true, targetSeconds: 2, seed: 43 })
      assert.equal(effect.soundEffect, true)
      assert.ok(Math.abs(effect.seconds - 2) < 0.2)
      const covered = await generateOne({ title: '커버 검증', style: 'calm acoustic guitar', instrumental: true,
        seed: 44, coverAudio: { dir: song.dir, title: song.title, strength: 0.6 } })
      assert.equal(covered.cover.strength, 0.6)
      const source = await cli('recording:pick', {}, ['--input', song.audio])
      const recorded = await generateOne({ title: '녹음 원본 검증', style: 'warm piano jazz', instrumental: true,
        seed: 45, recording: { path: source.path, strength: 0.8, targetSeconds: 15 } })
      assert.equal(recorded.cover.from, '녹음')
      console.log('PASS 보컬·가사 자막·2초 효과음·소리 커버·녹음 파일 기반 생성')
    }
    passed = true
    console.log('CLI 통합 검증 완료')
  } finally {
    await cli('service:stop', {}, ['--confirm']).catch(() => {})
    for (let index = 0; index < 30; index++) {
      try { await request({ endpoint: socketEndpoint(dataDir), command: 'cli:status', timeout: 1000 }) } catch { break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    for (let index = 0; servicePid && index < 50; index++) {
      try { process.kill(servicePid, 0) } catch { break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (passed) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    else console.error(`검증 로그 보존: ${root}`)
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
