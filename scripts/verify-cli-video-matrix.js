#!/usr/bin/env node
'use strict'

// Exercises the public video:render pipeline with pairwise short option combinations.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { request, socketEndpoint } = require('../cli/client')

const cliPath = path.resolve(__dirname, '../cli/road-music.js')
const icon = path.resolve(__dirname, '../build/icon.png')
const sizes = { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '2160p': [3840, 2160] }
const rows = []
const failures = []
let root
let dataDir
let servicePid = null

function processResult (executable, args, env) {
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

async function rawCli (args) {
  const run = await processResult(process.execPath, [cliPath, ...args], { ...process.env, ROADMUSIC_DATA_DIR: dataDir })
  let row
  try { row = JSON.parse(run.stdout.trim()) } catch { throw new Error(`Invalid CLI JSON: ${run.stdout}\n${run.stderr}`) }
  return { ...run, row }
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
  const run = await processResult('ffmpeg', ['-v', 'error', '-y', ...args], process.env)
  assert.equal(run.code, 0, run.stderr)
}

async function probe (file) {
  const run = await processResult('ffprobe', ['-v', 'error', '-show_entries',
    'stream=codec_type,codec_name,width,height,avg_frame_rate,color_space,color_range:format=duration', '-of', 'json', file], process.env)
  assert.equal(run.code, 0, run.stderr)
  return JSON.parse(run.stdout)
}

function fpsValue (fraction) {
  const [numerator, denominator = '1'] = String(fraction).split('/').map(Number)
  return numerator / denominator
}

function inside (rootDir, file) {
  const relative = path.relative(rootDir, file)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function waitForRender () {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = await cli('service:status')
    if (status.requests.some(item => item.command === 'video:render')) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('video:render never became active')
}

async function waitForRenderJob () {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const status = await cli('service:status')
    if (status.rendering > 0 && status.requests.some(item => item.command === 'video:render')) return status
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('video render job never became active')
}

async function waitForIdle () {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await cli('service:status')
    if (!status.busy && status.rendering === 0 && !status.requests.some(item => item.command === 'video:render')) return status
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('video service did not return to idle')
}

async function waitForSsim (before) {
  const logFile = path.join(dataDir, 'app.log')
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const text = await fs.readFile(logFile, 'utf8').catch(() => '')
    const lines = text.split(/\r?\n/).filter(line => line.includes('video preview/render SSIM'))
    if (lines.length > before) {
      const line = lines.at(-1)
      const scores = [...line.matchAll(/#\d+=([0-9.]+)/g)].map(match => Number(match[1]))
      assert.ok(scores.length >= 2, line)
      assert.ok(scores.every(score => score >= 0.99), line)
      assert.match(line, /frame offset 0/)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('preview/render SSIM verification did not finish')
}

async function ssimCount () {
  const text = await fs.readFile(path.join(dataDir, 'app.log'), 'utf8').catch(() => '')
  return text.split(/\r?\n/).filter(line => line.includes('video preview/render SSIM')).length
}

function assertCoverage (cases) {
  const expected = {
    kind: ['bars', 'mirror', 'line', 'circle'],
    resolution: ['720p', '1080p', '1440p', '2160p'],
    fps: [30, 60], renderer: ['cpu', 'gpu'], length: ['once', 'repeat', 'minutes'],
    background: ['none', 'image', 'video', 'per-song']
  }
  for (const [key, values] of Object.entries(expected)) {
    const actual = new Set(cases.map(item => item[key]))
    for (const value of values) assert.ok(actual.has(value), `matrix misses ${key}=${value}`)
  }
  for (const value of expected.kind) assert.equal(cases.filter(item => item.kind === value).length, 2)
  for (const value of expected.resolution) assert.equal(cases.filter(item => item.resolution === value).length, 2)
  assert.equal(cases.filter(item => item.fps === 30).length, 4)
  assert.equal(cases.filter(item => item.renderer === 'cpu').length, 4)
}

async function waitForServiceDown () {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await request({ endpoint: socketEndpoint(dataDir), command: 'cli:status', timeout: 100 }) } catch { return true }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
}

async function stopped () {
  if (!await waitForServiceDown()) return false
  for (let attempt = 0; servicePid && attempt < 50; attempt += 1) {
    try { process.kill(servicePid, 0) } catch { return true }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return !servicePid
}

async function main () {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-video-matrix-'))
  dataDir = path.join(root, 'data')
  const songsDir = path.join(dataDir, 'Songs')
  const fixtures = path.join(root, 'fixtures')
  const outputs = path.join(root, 'outputs')
  await fs.mkdir(fixtures, { recursive: true })
  await fs.mkdir(outputs, { recursive: true })
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({
    language: 'ko', engineSetupSkipped: true, dataDir, hfHome: path.join(dataDir, 'models'), songsDir
  }, null, 1))
  console.log(`VIDEO_MATRIX_ROOT ${root}`)

  const schema = await rawCli(['schema'])
  assert.equal(schema.code, 0)
  const renderSchema = schema.row.result.commands.find(entry => entry.command === 'video:render')
  assert.ok(renderSchema && renderSchema.renderer && renderSchema.dialog === 'save')
  assert.equal(schema.row.result.commands.some(entry => entry.command === 'video:frame'), false)

  const service = await cli('service:start')
  servicePid = service.pid
  assert.equal(service.dataDir, dataDir)
  await cli('projects:create', { name: 'Matrix' })
  await cli('projects:create', { name: 'Matrix Other' })
  await cli('projects:select', { name: 'Matrix' })

  const audioA = path.join(fixtures, 'matrix-a.wav')
  const audioB = path.join(fixtures, 'matrix-b.wav')
  const backgroundVideo = path.join(fixtures, 'solid-background.mp4')
  const urlOnlyImage = path.join(fixtures, '한글 배경 이미지.png')
  const urlOnlyImageUrl = pathToFileURL(urlOnlyImage).href
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ar', '48000', '-ac', '2', audioA])
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=1', '-ar', '48000', '-ac', '2', audioB])
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x234567:s=96x54:d=1', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', backgroundVideo])
  await fs.copyFile(icon, urlOnlyImage)
  assert.equal((await cli('songs:import', {}, ['--input', audioA, '--input', audioB])).count, 2)
  let songs = await cli('songs:list')
  const first = songs.find(song => song.source === path.basename(audioA))
  const second = songs.find(song => song.source === path.basename(audioB))
  assert.ok(first && second)
  await cli('song:rename', { dir: first.dir, title: 'Matrix A' })
  await cli('song:rename', { dir: second.dir, title: 'Matrix B' })
  songs = await cli('songs:list')
  const songA = songs.find(song => song.title === 'Matrix A')
  const songB = songs.find(song => song.title === 'Matrix B')
  assert.ok(songA && songB)

  const matrix = [
    { id: 'bars-720-cpu', kind: 'bars', resolution: '720p', fps: 30, renderer: 'cpu', length: 'once', background: 'none', tracks: [songA, songB], bars: 16, eq: { on: false, preset: 'flat', gains: [0, 0, 0, 0, 0, 0, 0] }, ssim: true },
    { id: 'mirror-1080-gpu', kind: 'mirror', resolution: '1080p', fps: 60, renderer: 'gpu', length: 'repeat', count: 2, background: 'image', tracks: [songA, songB], bars: 32, eq: { on: true, preset: 'custom', gains: [2, 1, 0, 0, 0, -1, -2] }, overlay: true, busy: true, urlOnly: true },
    { id: 'line-1440-gpu', kind: 'line', resolution: '1440p', fps: 30, renderer: 'gpu', length: 'once', background: 'video', tracks: [songA, songB], bars: 48, eq: { on: true, preset: 'warm', gains: [3, 2, 1, 0, -1, -2, -3] } },
    { id: 'circle-2160-cpu-free', kind: 'circle', resolution: '2160p', fps: 60, renderer: 'cpu', length: 'once', background: 'none', tracks: [songA, songB], bars: 64, eq: { on: false, preset: 'flat', gains: [0, 0, 0, 0, 0, 0, 0] }, geometry: { position: 'free', cx: -0.25, cy: 1.1, width: 1.2, size: 0.16 } },
    { id: 'bars-720-gpu-minute', kind: 'bars', resolution: '720p', fps: 30, renderer: 'gpu', length: 'minutes', minutes: 1, background: 'none', tracks: [songA, songB], bars: 24, visible: false, eq: { on: true, preset: 'warm', gains: [3, 2, 1, 0, -1, -2, -3] } },
    { id: 'mirror-1080-cpu-songbg', kind: 'mirror', resolution: '1080p', fps: 60, renderer: 'cpu', length: 'repeat', count: 2, background: 'per-song', tracks: [songA, songB], bars: 96, eq: { on: false, preset: 'flat', gains: [0, 0, 0, 0, 0, 0, 0] } },
    { id: 'line-1440-cpu-cache', kind: 'line', resolution: '1440p', fps: 30, renderer: 'cpu', length: 'once', background: 'image', tracks: [songA, songB], bars: 16, eq: { on: true, preset: 'custom', gains: [-2, -1, 0, 1, 2, 1, 0] }, cache: true },
    { id: 'circle-2160-gpu-order', kind: 'circle', resolution: '2160p', fps: 60, renderer: 'gpu', length: 'once', background: 'video', tracks: [songB, songA], bars: 128, eq: { on: false, preset: 'warm', gains: [3, 2, 1, 0, -1, -2, -3] }, order: true }
  ]
  assertCoverage(matrix)
  console.log('CASE\tKIND\tRES\tFPS\tENC\tLENGTH\tBACKGROUND')
  for (const item of matrix) console.log(`${item.id}\t${item.kind}\t${item.resolution}\t${item.fps}\t${item.renderer}\t${item.length}\t${item.background}`)

  for (const item of matrix) {
    const output = path.join(outputs, `${item.id}.mp4`)
    let background = { kind: 'none', path: null, url: null, name: '' }
    if (item.background === 'image') background = item.urlOnly
      ? { kind: 'image', url: urlOnlyImageUrl, name: path.basename(urlOnlyImage) }
      : { kind: 'image', path: icon, name: path.basename(icon) }
    if (item.background === 'video') background = { kind: 'video', path: backgroundVideo, name: path.basename(backgroundVideo) }
    if (item.background === 'per-song') await cli('song:background', { dir: songA.dir }, ['--input', icon])
    const spectrum = { visible: item.visible !== false, kind: item.kind, barCount: item.bars,
      position: 'bottom', width: 0.8, size: 0.2, color1: '#44aaff', color2: '#ff66aa', glow: 0.4, gain: 1, dim: 0.35,
      ...(item.geometry || {}) }
    const video = {
      source: 'checked', background, resolution: item.resolution, fps: item.fps, renderer: item.renderer,
      length: { mode: item.length, ...(item.count ? { count: item.count } : {}), ...(item.minutes ? { minutes: item.minutes } : {}) },
      spectrum, eq: item.eq,
      overlays: item.overlay ? [{ id: 'matrix-logo', ...(item.urlOnly ? { url: urlOnlyImageUrl } : { path: icon }), name: 'Road Music', x: 0.85, y: 0.18, w: 0.1, ar: 1, opacity: 0.85, start: 0, end: null }] : [],
      tracklist: item.overlay ? { visible: true, cx: 0.78, cy: 0.62, w: 0.32, h: 0.44, title: 'Matrix', color: '#ffffff', accent: '#44aaff', bg: 0.55 } : { visible: false }
    }
    const beforeSsim = item.ssim ? await ssimCount() : 0
    let rendered
    let concurrentError
    try {
      const rendering = cli('video:render', { tracks: item.tracks.map(song => song.dir), video, name: item.id }, ['--output', output])
      if (item.busy) {
        try {
          await waitForRender()
          await cliError('app:set-language', { lang: 'en' }, [], 'BUSY')
          await cliError('projects:select', { name: 'Matrix Other' }, [], 'BUSY')
        } catch (error) { concurrentError = error }
      }
      rendered = await rendering
      if (concurrentError) throw concurrentError
      const actual = await fs.realpath(output)
      assert.equal(await fs.realpath(rendered.path), actual)
      assert.ok(inside(await fs.realpath(root), actual))
      assert.ok((await fs.stat(actual)).size > 10_000)
      const info = await probe(actual)
      const videoStream = info.streams.find(stream => stream.codec_type === 'video')
      const audioStream = info.streams.find(stream => stream.codec_type === 'audio')
      assert.ok(videoStream && audioStream)
      assert.equal(videoStream.codec_name, 'h264')
      assert.equal(audioStream.codec_name, 'aac')
      assert.deepEqual([videoStream.width, videoStream.height], sizes[item.resolution])
      assert.ok(Math.abs(fpsValue(videoStream.avg_frame_rate) - item.fps) < 0.01)
      assert.equal(videoStream.color_space, 'bt709')
      assert.equal(videoStream.color_range, 'tv')
      const duration = Number(info.format.duration)
      assert.ok(Math.abs(duration - rendered.expectedSeconds) < 0.2, `${item.id}: ${duration} != ${rendered.expectedSeconds}`)
      assert.ok(Math.abs(rendered.seconds - rendered.expectedSeconds) < 0.2)
      const state = await cli('video:state')
      assert.equal(state.resolution, item.resolution)
      assert.equal(state.fps, item.fps)
      assert.equal(state.renderer, item.renderer)
      assert.equal(state.length.mode, item.length)
      assert.equal(state.spectrum.kind, item.kind)
      assert.equal(state.spectrum.visible, item.visible !== false)
      assert.equal(state.eq.on, item.eq.on)
      assert.equal(state.background.kind, item.background === 'per-song' ? 'none' : item.background)
      if (item.urlOnly) {
        assert.equal(background.path, undefined)
        assert.equal(video.overlays[0].path, undefined)
        assert.equal(await fs.realpath(state.background.path), await fs.realpath(urlOnlyImage))
        assert.equal(await fs.realpath(state.overlays[0].path), await fs.realpath(urlOnlyImage))
        assert.equal(state.background.url, urlOnlyImageUrl)
        assert.equal(state.overlays[0].url, urlOnlyImageUrl)
      }
      if (item.background === 'per-song') {
        const refreshed = await cli('songs:list')
        assert.equal(refreshed.find(song => song.dir === songA.dir).background.kind, 'image')
      }
      if (item.geometry) {
        assert.equal(state.spectrum.cx, item.geometry.cx)
        assert.equal(state.spectrum.cy, item.geometry.cy)
        assert.equal(state.spectrum.width, item.geometry.width)
      }
      if (item.busy) {
        assert.equal(await cli('app:language'), 'ko')
        assert.equal((await cli('projects:list')).current, 'Matrix')
      }
      if (item.order) {
        assert.match(rendered.chapters[0], /Matrix B/)
        assert.match(rendered.chapters[1], /Matrix A/)
        const chapters = await cli('video:chapters')
        assert.deepEqual(chapters.map(chapter => chapter.title), ['Matrix B', 'Matrix A'])
        assert.equal(chapters[0].start, 0)
        assert.ok(chapters[1].start > chapters[0].start)
      }
      if (item.ssim) await waitForSsim(beforeSsim)
      rows.push({ id: item.id, status: 'verified', seconds: duration, bytes: (await fs.stat(actual)).size })
      console.log(`VERIFIED ${item.id} ${duration.toFixed(3)}s ${(await fs.stat(actual)).size}B`)
    } catch (error) {
      failures.push({ id: item.id, error: error.stack || error.message })
      rows.push({ id: item.id, status: 'blocked', detail: String(error.message || error).split('\n')[0] })
      console.log(`BLOCKED ${item.id} ${String(error.message || error).split('\n')[0]}`)
    } finally {
      if (item.background === 'per-song') await cli('song:background-clear', { dir: songA.dir }).catch(() => {})
    }
  }

  const log = await fs.readFile(path.join(dataDir, 'app.log'), 'utf8')
  assert.match(log, /video prepared .*"reusedAudio":true.*"reusedAnalysis":true/)
  assert.equal(rows.filter(row => row.status === 'verified').length, matrix.length)

  const sentinel = path.join(outputs, 'cancelled-render.mp4')
  const sentinelBytes = Buffer.from('existing output must survive cancellation\n')
  await fs.writeFile(sentinel, sentinelBytes)
  const beforeWork = new Set((await fs.readdir(os.tmpdir())).filter(name => name.startsWith('roadmusic-render-')))
  const cancelVideo = {
    background: { kind: 'none', path: null, url: null, name: '' },
    resolution: '2160p', fps: 60, renderer: 'cpu', length: { mode: 'minutes', minutes: 1 },
    spectrum: { visible: true, kind: 'circle', barCount: 128, position: 'center', width: 0.9, size: 0.5,
      color1: '#44aaff', color2: '#ff66aa', glow: 0.6, gain: 1.2, dim: 0.4 },
    eq: { on: false, preset: 'flat', gains: [0, 0, 0, 0, 0, 0, 0] }, overlays: [], tracklist: { visible: false }
  }
  const rendering = rawCli(['video:render', '--json', JSON.stringify({
    tracks: [songA.dir, songB.dir], video: cancelVideo, name: 'cancel matrix'
  }), '--output', sentinel, '--overwrite'])
  await waitForRenderJob()
  await new Promise(resolve => setTimeout(resolve, 100))
  const cancellation = await cli('video:cancel')
  assert.equal(cancellation.cancellationRequested, true)
  assert.equal(cancellation.stage, 'render')
  const cancelled = await rendering
  assert.notEqual(cancelled.code, 0)
  assert.equal(cancelled.row.ok, false)
  assert.equal(cancelled.row.error.code, 'cancelled')
  assert.deepEqual(await fs.readFile(sentinel), sentinelBytes)
  await waitForIdle()
  assert.equal((await cli('video:state')).playing, false)
  assert.equal((await cli('video:cancel')).active, false)
  await cli('video:configure', { video: { resolution: '720p' } })
  const outputNames = await fs.readdir(outputs)
  assert.ok(!outputNames.some(name => name.startsWith('.roadmusic-export-') || name.endsWith('.rendering.mp4')))
  const afterWork = new Set((await fs.readdir(os.tmpdir())).filter(name => name.startsWith('roadmusic-render-')))
  assert.deepEqual([...afterWork].filter(name => !beforeWork.has(name)), [])
  rows.push({ id: 'render-cancel-overwrite', status: 'verified', bytes: sentinelBytes.length })
  console.log('VERIFIED render-cancel-overwrite sentinel-preserved staging-clean idle')
}

main().catch(error => {
  if (!failures.length) failures.push({ id: 'harness', error: error.stack || error.message })
  process.exitCode = 1
}).finally(async () => {
  if (dataDir) await cli('service:stop', {}, ['--confirm']).catch(() => {})
  const serviceStopped = dataDir ? await stopped() : true
  const safe = root && path.basename(root).startsWith('roadmusic-video-matrix-') && path.dirname(root) === os.tmpdir()
  if (!failures.length && serviceStopped && safe) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  else if (root) console.error(`VIDEO_MATRIX_LOGS ${root}`)
  console.log(JSON.stringify({ ok: failures.length === 0, rows, failures, serviceStopped }))
})
