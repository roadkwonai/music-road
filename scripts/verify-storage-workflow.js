#!/usr/bin/env node
'use strict'

// 실제 설치된 ACE만 재사용해, 격리한 프로필에서 생성·영상·저장공간 경계를 확인한다.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const fssync = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { defaultUserData, socketEndpoint, request } = require('../cli/client')

const ROOT = path.resolve(process.argv[2] || path.join('outputs', `storage-live-validation-20261019-${crypto.randomUUID().slice(0, 8)}`))
const DATA = path.join(ROOT, 'profile')
const LOGS = path.join(ROOT, 'logs')
const CLI = path.resolve(__dirname, '../cli/road-music.js')
const SHOWREEL = path.join(os.homedir(), '.local/share/roadmusic-video-tools/showreel')
const SHOWREEL_PYTHON = path.join(SHOWREEL, '.venv/bin/python')
const CAPTION = 'ambient piano, calm, warm acoustic texture, resolved ending'
const CYCLES = [
  { title: '저장공간 검증 연주 1', seed: 7201 },
  { title: '저장공간 검증 연주 2', seed: 7202 }
]

function fail (message) { throw new Error(message) }

function lastJson (text, label) {
  const line = text.trim().split(/\r?\n/).filter(Boolean).at(-1)
  try { return JSON.parse(line) } catch { fail(`${label}: 마지막 stdout 줄이 JSON이 아닙니다`) }
}

async function run (file, args, env, logName) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', value => { stdout += value })
    child.stderr.on('data', value => { stderr += value })
    child.once('error', reject)
    child.once('close', code => resolve({ code, stdout, stderr }))
  })
  await fs.writeFile(path.join(LOGS, `${logName}.stdout`), result.stdout)
  await fs.writeFile(path.join(LOGS, `${logName}.stderr`), result.stderr)
  return result
}

async function main () {
  await fs.mkdir(LOGS, { recursive: true })
  const installedPath = defaultUserData()
  const installed = JSON.parse(await fs.readFile(path.join(installedPath, 'settings.json'), 'utf8'))
  assert.equal(installed.aceInstalled, true, 'ACE-Step이 설치되어 있지 않습니다. 설치하지 않고 중단합니다.')
  const env = {
    ...process.env,
    HF_HUB_OFFLINE: '1',
    ROADMUSIC_DATA_DIR: DATA,
    ROADMUSIC_STUDIO_AUTO_OPEN: '0'
  }
  await fs.mkdir(DATA, { recursive: true })
  await fs.writeFile(path.join(DATA, 'settings.json'), JSON.stringify({
    language: 'ko', engineSetupSkipped: true, aceInstalled: true,
    dataDir: installed.dataDir || installedPath, songsDir: path.join(DATA, 'Songs'),
    autoMp3: false, dropWav: false
  }, null, 2))

  let sequence = 0
  const cli = async (command, params = {}, flags = []) => {
    const result = await run(process.execPath, [CLI, command, '--json', JSON.stringify(params), ...flags], env, `${String(++sequence).padStart(2, '0')}-${command.replace(/:/g, '-')}`)
    let row
    try { row = JSON.parse(result.stdout.trim()) } catch { fail(`${command}: stdout JSON이 아닙니다`) }
    if (!row.ok || result.code !== 0) fail(`${command}: ${JSON.stringify(row.error || row.result)}`)
    return row.result
  }
  const probe = async (file, name) => {
    const result = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', file], env, name)
    if (result.code) fail(`ffprobe 실패: ${file}`)
    const format = JSON.parse(result.stdout).format
    assert.ok(Number(format.duration) > 0, `${file}: 길이가 없습니다`)
    assert.ok(Number(format.size) > 1000, `${file}: 너무 작습니다`)
    const decode = await run('ffmpeg', ['-xerror', '-v', 'error', '-i', file, '-f', 'null', '-'], env, `${name}-decode`)
    if (decode.code) fail(`ffmpeg decode 실패: ${file}`)
    return { path: file, seconds: Number(format.duration), bytes: Number(format.size) }
  }
  const summary = { root: ROOT, dataDir: DATA, caption: CAPTION, cycles: [], storage: {}, checks: [], warnings: [] }
  let service = null
  try {
    summary.cli = { version: await cli('cli:version'), update: await cli('cli:update:check') }
    try {
      summary.initialService = await cli('service:status')
    } catch (error) {
      summary.initialService = { available: false, error: String(error.message || error) }
    }
    service = await cli('service:start')
    assert.equal(service.dataDir, DATA, '격리 프로필이 아닌 서비스가 시작됐습니다')
    summary.service = service
    summary.initial = {
      app: await cli('app:state'), engines: await cli('engines:list'),
      projects: await cli('projects:list'), songs: await cli('songs:list')
    }
    await cli('projects:create', { name: '저장공간 실검증' })

    const composed = await cli('prompt:compose', {
      genre: CAPTION, instruments: ['piano', 'acoustic guitar'], bpm: 72, instrumental: true, lyrics: ''
    })
    assert.ok(composed.style.length <= 512, 'ACE caption 512자 제한 초과')
    const lyricCheck = await cli('lyrics:check', { text: '', targetSeconds: 10 })
    summary.input = { composed, lyricCheck, titleReview: '한국어 제목은 자연스러운 명명이며 연주곡이므로 가사 검수는 해당 없음' }

    for (const cycle of CYCLES) {
      const submitted = await cli('song:generate', {
        title: cycle.title, engine: 'ace', style: CAPTION, instrumental: true,
        targetSeconds: 10, seed: cycle.seed, count: 1,
        parts: { instruments: ['piano', 'acoustic guitar'], bpm: 72, instrumental: true }
      })
      if (submitted.uncertain) {
        summary.warnings.push({ cycle: cycle.title, warning: 'uncertain 생성 응답: 재제출하지 않음' })
        summary.queueAfterUncertain = await cli('queue:list')
        summary.songsAfterUncertain = await cli('songs:list')
        fail('uncertain 생성 응답으로 중단했습니다')
      }
      assert.equal(typeof submitted.jobId, 'string', 'song:generate jobId가 없습니다')
      const waited = await cli('job:wait', { jobId: submitted.jobId, timeoutMs: 3600000 }, ['--events'])
      const song = waited.song || waited
      assert.equal(song.jobId, submitted.jobId, 'job:wait 결과가 제출 jobId와 다릅니다')
      assert.ok(path.isAbsolute(song.dir) && path.isAbsolute(song.audio), '생성 결과 절대 경로가 없습니다')
      const audio = await probe(song.audio, `cycle-${cycle.seed}-audio`)
      const songStorage = await cli('storage:register', { project: song.dir })
      const videoPath = path.join(ROOT, `cycle-${cycle.seed}-spectrum.mp4`)
      const video = await cli('video:render', {
        tracks: [{ dir: song.dir }], name: cycle.title,
        video: { resolution: '720p', fps: 30, renderer: 'cpu', length: { mode: 'once' }, spectrum: { visible: true, kind: 'mirror', barCount: 16 }, tracklist: { visible: false } }
      }, ['--output', videoPath])
      const mp4 = await probe(video.path || videoPath, `cycle-${cycle.seed}-video`)
      summary.cycles.push({ ...cycle, submitted, song, audio, video, mp4, songStorage })
    }

    if (!fssync.existsSync(SHOWREEL_PYTHON)) throw new Error(`Showreel Python이 없습니다: ${SHOWREEL_PYTHON}`)
    const source = summary.cycles[0].song.audio
    const padded = path.join(ROOT, 'showreel-input-12s.wav')
    const pad = await run('ffmpeg', ['-y', '-v', 'error', '-i', source, '-af', 'apad=whole_dur=12', '-t', '12', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', padded], env, 'showreel-pad')
    if (pad.code) fail('Showreel 입력 무음 패딩 실패')
    const showreelProject = path.join(ROOT, 'showreel-cd')
    const create = await run(SHOWREEL_PYTHON, [path.join(__dirname, '../.agents/skills/road-music-showreel-playlist/scripts/cd_presets.py'), 'create', '--style', '가을', '--music', padded, '--instrumental', '--demo-assets', '--out', showreelProject], env, 'showreel-create')
    if (create.code) fail(`Showreel create 실패: ${create.stderr}`)
    const createResult = lastJson(create.stdout, 'Showreel create')
    const registered = await cli('storage:register', { project: createResult.project })
    const before = await cli('storage:list', { projectId: registered.id })
    const render = await run(SHOWREEL_PYTHON, [path.join(__dirname, '../.agents/skills/road-music-showreel-playlist/scripts/cd_presets.py'), 'render', '--project', createResult.project], env, 'showreel-render')
    if (render.code) fail(`Showreel render 실패: ${render.stderr}`)
    const renderResult = lastJson(render.stdout, 'Showreel render')
    const showreelVideo = await probe(renderResult.video, 'showreel-video')
    const after = await cli('storage:list', { projectId: registered.id })
    const afterProject = after.projects[0]
    assert.equal(afterProject.busy, false, 'Showreel lease가 해제되지 않았습니다')
    assert.ok(afterProject.entries.some(entry => entry.relativePath === '.roadmusic/cache/picture'), '실제 picture cache가 등록되지 않았습니다')
    const policy = await cli('storage:policy', { projectId: registered.id, state: 'completed', retainDays: 0 })
    const preview = await run(SHOWREEL_PYTHON, [path.join(__dirname, '../.agents/skills/road-music-showreel-playlist/scripts/cd_presets.py'), 'render', '--project', createResult.project, '--preview'], env, 'showreel-preview')
    if (preview.code) fail(`Showreel preview 실패: ${preview.stderr}`)
    const previewResult = lastJson(preview.stdout, 'Showreel preview')
    const previewVideo = await probe(previewResult.video, 'showreel-preview-video')
    const afterPreview = await cli('storage:list', { projectId: registered.id })
    assert.equal(afterPreview.projects[0].busy, false, '두 번째 Showreel lease가 해제되지 않았습니다')
    assert.equal(afterPreview.projects[0].fileCount, 0, '두 번째 Showreel cache가 정리되지 않았습니다')
    const marker = path.join(createResult.project, '.roadmusic/cache/validation-marker.txt')
    await fs.writeFile(marker, 'storage cleanup validation\n')
    const trackedMarker = await cli('storage:track', {
      projectId: registered.id, path: '.roadmusic/cache/validation-marker.txt', kind: 'cache',
      description: '실제 검증 뒤 제거할 cache marker', reproducible: true
    })
    const cleanupPreview = await cli('storage:preview', { projectId: registered.id, kinds: ['cache'] })
    const cleanup = cleanupPreview.fileCount ? await cli('storage:cleanup', { planId: cleanupPreview.planId }, ['--confirm']) : { removedFiles: 0, skipped: [] }
    assert.equal(fssync.existsSync(marker), false, 'storage cleanup이 명시 cache marker를 제거하지 않았습니다')
    assert.ok(fssync.existsSync(renderResult.video), '정리 뒤 Showreel 완성 MP4가 사라졌습니다')
    summary.storage = { showreelProject: createResult.project, registered, before, after, policy, previewResult, previewVideo, afterPreview, trackedMarker, cleanupPreview, cleanup, showreelVideo }
    summary.checks.push('ACE 2회 생성, 720p spectrum MP4 2개, Showreel CD final·preview 실제 렌더, storage cache 등록·lease 해제·완료 정리를 확인함')
  } finally {
    try {
      const status = await cli('service:status')
      if (status.dataDir === DATA && (!service || status.pid === service.pid)) await cli('service:stop', {}, ['--confirm'])
    } catch (error) { summary.warnings.push({ serviceStop: String(error.message || error) }) }
    await fs.writeFile(path.join(ROOT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  }
  console.log(JSON.stringify({ ok: true, summary: path.join(ROOT, 'summary.json') }))
}

main().catch(async error => {
  await fs.mkdir(ROOT, { recursive: true })
  await fs.writeFile(path.join(ROOT, 'failure.json'), JSON.stringify({ error: error.stack || error.message }, null, 2) + '\n')
  console.error(error.stack || error.message)
  process.exitCode = 1
})
