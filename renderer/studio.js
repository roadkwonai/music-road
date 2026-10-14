'use strict'
// ── video studio (right column) ──────────────────────────────────────────────
// Turns finished songs into a playlist video. The preview and the render draw with
// the same function (spectrum-renderer.js) from the same per-frame cache (built in
// the main process), so what is seen here is what the MP4 contains.
//
// Time in the preview comes from a master clock, not from the audio element: the
// frame shown is frameAt(clock). The audio is started alongside and nudged back if
// it drifts. The render uses no clock at all — it walks frame 0, 1, 2, …

const VIDEO_DEFAULTS = Object.freeze({
  source: 'selected',
  background: { kind: 'none', path: null, url: null, name: '' },
  length: { mode: 'once', count: 10, minutes: 60 },
  resolution: '1080p',
  fps: 30,
  renderer: 'gpu',
  spectrum: { ...SPECTRUM_DEFAULTS },
  eq: { on: false, preset: 'flat', gains: [0, 0, 0, 0, 0, 0, 0] },
  // Pictures placed on the video in the editor (editor.js): where, how big, how
  // opaque and when. x, y are the centre and w the width, as shares of the frame;
  // ar is the picture's height / width; start/end are seconds of the playlist
  // (end null = to the end).
  overlays: [],
  // The songs listed on the video (tracklist.js), placed in the editor.
  tracklist: { ...TRACKLIST_DEFAULTS }
})

// ── equalizer ──
// Seven peaking bands. The preview runs them in Web Audio and the render in ffmpeg's
// equalizer (electron/video.js EQ_BANDS / EQ_Q): both are the RBJ cookbook peaking
// biquad with the same centre, Q and gain, so what is heard here is what the MP4
// carries. Only the sound changes; the spectrum is drawn from the original track.
const EQ_BANDS = [60, 150, 400, 1000, 3000, 8000, 16000]
const EQ_Q = 1.1
const EQ_RANGE = 10
const EQ_PRESETS = [
  ['flat', '플랫', [0, 0, 0, 0, 0, 0, 0]],
  ['bass', '저음 강조', [6, 4, 1, 0, 0, 0, 0]],
  ['vocal', '보컬 강조', [-2, -1, 1, 3, 3, 1, 0]],
  ['treble', '고음 강조', [0, 0, 0, 1, 3, 5, 6]],
  ['warm', '따뜻하게', [3, 2, 1, 0, -1, -2, -3]],
  ['clear', '선명하게', [-1, 0, 0, 1, 2, 3, 3]],
  ['dance', '댄스', [5, 3, 0, -1, 1, 3, 4]],
  ['lofi', '로파이', [3, 2, 0, -1, -4, -7, -9]]
]
const eqAudio = { context: null, filters: [] }

// The analysis behind the bars (electron/spectrum-analysis.js DEFAULT_ANALYSIS): bars
// are log-spaced from 40 Hz to 16 kHz, a bar's height is its level from −90 to −10 dBFS
// mapped onto 0…1, and each bar is blended with its neighbours (smoothing 0.65).
const BAR_SPAN = { min: 40, max: 16000, db: 80, smoothing: 0.65, rate: 48000 }

// The equalizer's gain in dB at a frequency: the same peaking biquads the preview's Web
// Audio and the render's ffmpeg run (checked against both).
function eqDbAt (hz, gains) {
  let total = 0
  const w = (2 * Math.PI * hz) / BAR_SPAN.rate
  EQ_BANDS.forEach((f0, i) => {
    if (!gains[i]) return
    const A = Math.pow(10, gains[i] / 40)
    const w0 = (2 * Math.PI * f0) / BAR_SPAN.rate
    const alpha = Math.sin(w0) / (2 * EQ_Q)
    const b = [1 + alpha * A, -2 * Math.cos(w0), 1 - alpha * A]
    const a = [1 + alpha / A, -2 * Math.cos(w0), 1 - alpha / A]
    const size = (c) => Math.hypot(c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w), c[1] * Math.sin(w) + c[2] * Math.sin(2 * w))
    total += 20 * Math.log10(size(b) / size(a))
  })
  return total
}

// How far the EQ moves each bar: its gain at the bar's centre, as a share of the
// 80 dB the bar height spans, blended with the neighbours as the analysis blends the
// bars. Because the level stages are linear, this is what analysing the equalised
// sound would give (bar-centre approximation aside). null when the EQ changes nothing.
function eqBarShape () {
  const eq = studio.video.eq
  const count = studio.barCount
  if (!count || !eq.on || eq.gains.every((g) => g === 0)) return null
  const key = `${count}:${eq.gains.join(',')}`
  if (studio.eqShape && studio.eqShape.key === key) return studio.eqShape.shape
  const ratio = BAR_SPAN.max / BAR_SPAN.min
  const raw = Array.from({ length: count }, (_, bar) =>
    eqDbAt(BAR_SPAN.min * ratio ** ((bar + 0.5) / count), eq.gains) / BAR_SPAN.db)
  const spread = BAR_SPAN.smoothing
  const shape = new Float32Array(count)
  for (let bar = 0; bar < count; bar++) {
    const left = raw[Math.max(0, bar - 1)]
    const right = raw[Math.min(count - 1, bar + 1)]
    shape[bar] = raw[bar] * (1 - spread / 2) + (left + right) * (spread / 4)
  }
  studio.eqShape = { key, shape }
  return shape
}

const studio = {
  video: JSON.parse(JSON.stringify(VIDEO_DEFAULTS)),
  cycle: null, // the prepared continuous track
  frames: null, // Float32Array, frameCount × barCount
  barCount: 0,
  preparedKey: '',
  clock: { playing: false, anchorPerf: 0, anchorTime: 0 },
  shown: -1, // frame currently on the preview canvas
  frame: null, // the render in progress
  loop: 0
}

const studioEl = (id) => document.getElementById(id)
const NO_BACKGROUND = Object.freeze({ kind: 'none', path: null, url: null, name: '' })

// Output sizes, as in electron/video.js RESOLUTIONS.
const RESOLUTION_SIZES = {
  '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '2160p': [3840, 2160]
}

// ── settings ──
function spectrumStyle () {
  return { ...SPECTRUM_DEFAULTS, ...studio.video.spectrum }
}

// 진폭 reads as a multiple of the analysed height.
function showGain (value) {
  studioEl('sGainValue').textContent = `×${(Number(value) || 1).toFixed(1)}`
}

// "배경 어둡게" reads 0% (the picture as it is) to 100% (black).
function showDim (value) {
  studioEl('sDimValue').textContent = `${Math.round((Number(value) || 0) * 100)}%`
}

let saveTimer = 0
function saveVideo () {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => window.yue.saveVideoSettings(studio.video), 400)
}

function writeControls () {
  const v = studio.video
  const s = spectrumStyle()
  studioEl('vSource').value = v.source
  studioEl('vLength').value = ['once', 'repeat', 'minutes'].includes(v.length.mode) ? v.length.mode : 'once'
  studioEl('vRepeat').value = v.length.count || 10
  studioEl('vHours').value = Math.floor((v.length.minutes || 60) / 60)
  studioEl('vMins').value = (v.length.minutes || 60) % 60
  showLengthInputs()
  studioEl('vResolution').value = v.resolution
  studioEl('vFps').value = String(v.fps)
  for (const radio of document.querySelectorAll('input[name="vRenderer"]')) radio.checked = radio.value === v.renderer
  studioEl('sVisible').checked = s.visible
  studioEl('sKind').value = s.kind
  studioEl('sLayout').value = spectrumLayout(s)
  studioEl('sBars').value = String(s.barCount)
  studioEl('sPosition').value = s.position
  studioEl('sSize').value = s.size
  studioEl('sWidth').value = s.width
  studioEl('sColor1').value = s.color1
  studioEl('sColor2').value = s.color2
  studioEl('sGlow').value = s.glow
  studioEl('sGain').value = s.gain
  showGain(s.gain)
  studioEl('sDim').value = s.dim
  showDim(s.dim)
  showBackground()
  showEq()
}

function showLengthInputs () {
  const mode = studioEl('vLength').value
  studioEl('vRepeatRow').classList.toggle('hidden', mode !== 'repeat')
  studioEl('vTimeRow').classList.toggle('hidden', mode !== 'minutes')
}

// Reads the length controls into the settings: a repeat count, or hours and minutes.
function readLength () {
  const mode = studioEl('vLength').value
  const count = Math.max(1, Math.min(1000, Math.round(Number(studioEl('vRepeat').value) || 1)))
  const minutes = Math.max(1, Math.min(600,
    (Math.round(Number(studioEl('vHours').value) || 0) * 60) + Math.round(Number(studioEl('vMins').value) || 0)))
  studio.video.length = { mode, count, minutes }
}

// ── preview drawing ──
function previewSize () {
  const canvas = studioEl('vCanvas')
  const box = studioEl('vStage').getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  // A proxy resolution for the preview; the drawing is resolution-independent.
  const width = Math.max(2, Math.round(box.width * ratio))
  const height = Math.round((width * 9) / 16)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  return { width, height }
}

// One frame's bars, with the equalizer applied (`shape`, see eqBarShape). The render
// passes the shape it started with, so moving the EQ meanwhile cannot change the video.
function rowAt (frame, shape = eqBarShape()) {
  if (!studio.frames || !studio.barCount) return null
  const last = studio.frames.length / studio.barCount - 1
  const index = Math.min(Math.max(0, frame), last)
  const row = studio.frames.subarray(index * studio.barCount, (index + 1) * studio.barCount)
  if (!shape || shape.length !== row.length) return row
  const out = new Float32Array(row.length)
  // A silent bar stays silent: the boost lifts what is playing, not the floor.
  for (let i = 0; i < row.length; i++) out[i] = row[i] > 0 ? Math.max(0, Math.min(1, row[i] + shape[i])) : 0
  return out
}

function drawPreview (frame, force = false) {
  if (!force && frame === studio.shown) return
  studio.shown = frame
  const canvas = studioEl('vCanvas')
  const size = previewSize()
  const ctx = canvas.getContext('2d')
  const fps = studio.cycle ? studio.cycle.fps : studio.video.fps
  const rc = { width: size.width, height: size.height, fps, frameIndex: frame, pixelRatio: window.devicePixelRatio || 1 }
  const style = spectrumStyle()
  ctx.clearRect(0, 0, rc.width, rc.height)
  drawBackdrop(ctx, style, stageAt(frame).background, rc)
  drawOverlays(ctx, frame / fps, rc)
  drawTracklist(ctx, frame / fps, rc)
  drawSpectrum(ctx, rowAt(frame), style, rc)
}

// ── pictures on the video (placed in editor.js) ──
// Drawn over the backdrop and under the spectrum, as ffmpeg stacks them in the render
// (electron/video.js overlayBox: the same even-pixel rounding).
const overlayImages = new Map()

function overlayImage (overlay) {
  let img = overlayImages.get(overlay.url)
  if (!img) {
    img = new Image()
    img.onload = () => redraw()
    img.src = overlay.url
    overlayImages.set(overlay.url, img)
  }
  return img.complete && img.naturalWidth ? img : null
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2)
function overlayBox (overlay, width, height) {
  const w = even(overlay.w * width)
  const h = even(w * overlay.ar)
  return { x: Math.round(overlay.x * width - w / 2), y: Math.round(overlay.y * height - h / 2), w, h }
}

const overlayShown = (overlay, seconds) =>
  seconds >= (overlay.start || 0) && (overlay.end == null || seconds < overlay.end)

function drawOverlays (ctx, seconds, rc) {
  for (const overlay of studio.video.overlays || []) {
    if (!overlayShown(overlay, seconds)) continue
    const img = overlayImage(overlay)
    if (!img) continue
    const box = overlayBox(overlay, rc.width, rc.height)
    ctx.save()
    ctx.globalAlpha = overlay.opacity == null ? 1 : overlay.opacity
    ctx.drawImage(img, box.x, box.y, box.w, box.h)
    ctx.restore()
  }
}

const redraw = () => drawPreview(studio.shown < 0 ? 0 : studio.shown, true)

// ── master clock ──
function clockTime () {
  const c = studio.clock
  return c.playing ? c.anchorTime + (performance.now() - c.anchorPerf) / 1000 : c.anchorTime
}

function duration () {
  return studio.cycle ? studio.cycle.frameCount / studio.cycle.fps : 0
}

function showTime (time) {
  const total = duration()
  studioEl('vTime').textContent = `${clock(time)} / ${clock(total)}`
  if (!studio.seeking) studioEl('vSeek').value = String(frameAt(time, studio.cycle ? studio.cycle.fps : 30))
}

function tick () {
  if (!studio.clock.playing) return
  let time = clockTime()
  if (time >= duration()) {
    pausePreview()
    seekPreview(duration() - 1 / studio.cycle.fps)
    return
  }
  const audio = studioEl('vAudio')
  // The clock leads; the audio is pulled back into line if it wanders.
  if (!audio.paused && Math.abs(audio.currentTime - time) > 0.08) audio.currentTime = time
  if (audio.paused && audio.readyState >= 2) audio.play().catch(() => {})
  syncStage(time)
  drawPreview(frameAt(time, studio.cycle.fps))
  showTime(time)
  studio.loop = requestAnimationFrame(tick)
}

function playPreview () {
  if (!studio.cycle) return
  if (clockTime() >= duration() - 0.05) studio.clock.anchorTime = 0
  studio.clock.anchorPerf = performance.now()
  studio.clock.playing = true
  const audio = studioEl('vAudio')
  connectEq()
  audio.currentTime = studio.clock.anchorTime
  audio.play().catch(() => {})
  syncStage(studio.clock.anchorTime, true)
  studioEl('vPlay').textContent = '❚❚'
  cancelAnimationFrame(studio.loop)
  studio.loop = requestAnimationFrame(tick)
}

function pausePreview () {
  studio.clock.anchorTime = clockTime()
  studio.clock.playing = false
  cancelAnimationFrame(studio.loop)
  studioEl('vAudio').pause()
  studioEl('vBgVideo').pause()
  studioEl('vPlay').textContent = '▶'
}

function seekPreview (time) {
  const t = Math.max(0, Math.min(duration(), time))
  studio.clock.anchorTime = t
  studio.clock.anchorPerf = performance.now()
  const audio = studioEl('vAudio')
  if (audio.src) audio.currentTime = t
  syncStage(t, true)
  drawPreview(frameAt(t, studio.cycle ? studio.cycle.fps : 30), true)
  showTime(t)
}

// ── background ──
// The studio's background is the default. A song with a picture or clip of its own
// (the square box in the song list) shows that instead while it plays. `runs` say
// which background covers which frames; neighbouring songs showing the same thing
// share a run, so the studio's video plays on across them instead of restarting.
// The render gets the same runs (electron/video.js timelineInputs).
const sameBackground = (a, b) => a.kind === b.kind && (a.kind === 'none' || a.path === b.path)

function refreshRuns () {
  studio.runs = null
  if (!studio.cycle || !studio.trackFolders) return
  const own = studio.trackFolders.map((folder) => {
    const song = songs.find((s) => s.folder === folder)
    return (song && song.background) || null
  })
  if (!own.some(Boolean)) return
  const { fps, frameCount, chapters } = studio.cycle
  const runs = []
  chapters.forEach((chapter, i) => {
    const start = i === 0 ? 0 : Math.min(frameCount, Math.round(chapter.start * fps))
    const background = own[i] || studio.video.background
    const last = runs[runs.length - 1]
    if (!last || !sameBackground(last.background, background)) runs.push({ start, background })
  })
  runs.forEach((run, i) => { run.end = i + 1 < runs.length ? runs[i + 1].start : frameCount })
  studio.runs = runs.filter((run) => run.end > run.start)
}

// The background on screen at a frame, and when (in seconds) its run began.
function stageAt (frame) {
  const runs = studio.runs
  if (!runs || !runs.length) return { background: studio.video.background, start: 0, index: -1 }
  let index = runs.findIndex((run) => frame < run.end)
  if (index < 0) index = runs.length - 1
  return { background: runs[index].background, start: runs[index].start / studio.cycle.fps, index }
}

function showStage (bg) {
  const image = studioEl('vBgImage')
  const video = studioEl('vBgVideo')
  image.classList.toggle('hidden', bg.kind !== 'image')
  video.classList.toggle('hidden', bg.kind !== 'video')
  if (bg.kind === 'image' && image.getAttribute('src') !== bg.url) image.src = bg.url
  if (bg.kind === 'video' && video.getAttribute('src') !== bg.url) video.src = bg.url
  if (bg.kind !== 'video') { video.pause(); video.removeAttribute('src'); video.load() }
  if (bg.kind !== 'image') image.removeAttribute('src')
}

// Keeps the picture or clip behind the preview canvas in step with the clock: a new
// run swaps it, and a clip plays from its run's start (as it does in the render).
function syncStage (time, force = false) {
  const fps = studio.cycle ? studio.cycle.fps : 30
  const at = stageAt(frameAt(time, fps))
  const changed = at.index !== studio.stageIndex || at.background !== studio.stageBg
  if (changed) {
    studio.stageIndex = at.index
    studio.stageBg = at.background
    showStage(at.background)
  }
  if (at.background.kind !== 'video' || !(changed || force)) return
  const video = studioEl('vBgVideo')
  const place = () => {
    if (video.duration) video.currentTime = Math.max(0, time - at.start) % video.duration
    if (studio.clock.playing) video.play().catch(() => {})
    else video.pause()
  }
  if (video.readyState >= 1) place()
  else video.addEventListener('loadedmetadata', place, { once: true })
}

const dimUseless = () => studio.video.background.kind === 'none' && !songs.some((song) => song.background)

function showBackground () {
  const bg = studio.video.background
  studioEl('vBgName').textContent = bg.kind === 'none' ? '없음 (기본 그라데이션)' : bg.name || bg.path
  studioEl('vBgName').title = bg.path || ''
  studioEl('sDim').disabled = dimUseless()
  refreshRuns()
  studio.stageIndex = null
  syncStage(clockTime(), true)
}

// The song list changed (a refresh, or a background put on or taken off a song).
function studioSongsChanged () {
  if (!window.RoadCLIBusy) studio.cliTracks = null
  const shape = () => JSON.stringify((studio.runs || []).map((run) => [run.start, run.background.path]))
  const before = shape()
  refreshRuns()
  studioEl('sDim').disabled = dimUseless()
  if (shape() === before) return
  studio.stageIndex = null
  syncStage(clockTime(), true)
  redraw()
  showStudioInfo()
  if (typeof editorRefresh === 'function') editorRefresh()
}

const BG_BOX_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h10v2H5v9.6l3.6-4.4 2.6 3.1 3.1-3.9L19 17.2V12h2v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm15-3h2v3h3v2h-3v3h-2V7h-3V5h3z"/></svg>'

// The square between a song's tick box and its title: a picture or clip for that song
// alone. Click to put one on (or change it); the × takes it off again.
function studioBackgroundBox (song) {
  if (studioEl('studio').classList.contains('hidden')) return null
  const bg = song.background
  const box = document.createElement('button')
  box.className = `v-bg${bg ? ' set' : ''}`
  box.setAttribute('aria-label', bg ? `이 곡의 영상 배경: ${bg.name}` : '이 곡의 영상 배경 넣기')
  box.dataset.tip = bg
    ? `이 곡의 영상 배경: ${bg.name}\n플레이리스트 영상에서 이 곡이 나오는 동안 보입니다.\n누르면 다른 파일로 바꿉니다.`
    : '이 곡의 영상 배경 넣기 (이미지 또는 영상)\n플레이리스트 영상에서 이 곡이 나오는 동안 이 배경이 보입니다. 넣지 않은 곡은 스튜디오의 배경을 씁니다.'
  const thumb = document.createElement('span')
  thumb.className = 'v-bg-thumb'
  if (bg && bg.kind === 'image') {
    thumb.style.backgroundImage = `url("${bg.url}")`
  } else if (bg && bg.kind === 'video') {
    const clip = document.createElement('video')
    clip.muted = true
    clip.preload = 'metadata'
    clip.src = `${bg.url}#t=0.5`
    thumb.appendChild(clip)
    const mark = document.createElement('span')
    mark.className = 'v-bg-kind'
    mark.textContent = '▶'
    thumb.appendChild(mark)
  } else {
    thumb.innerHTML = BG_BOX_ICON
  }
  box.appendChild(thumb)
  box.onclick = async (event) => {
    event.stopPropagation()
    box.disabled = true
    const result = await window.yue.songBackground(song.dir)
    box.disabled = false
    if (!result.ok) {
      if (!result.canceled) toast(result.message || '배경을 넣지 못했습니다.', 6000)
      return
    }
    song.background = result.background
    renderSongs()
    toast(`"${song.title || '무제'}"에 영상 배경을 넣었습니다. 플레이리스트 영상에서 이 곡이 나오는 동안 보입니다.`, 5000)
  }
  if (bg) {
    const clear = document.createElement('span')
    clear.className = 'v-bg-clear'
    clear.textContent = '×'
    clear.dataset.tip = '이 곡의 영상 배경 빼기\n(원래 고른 파일은 지우지 않습니다)'
    clear.onclick = async (event) => {
      event.stopPropagation()
      const result = await window.yue.clearSongBackground(song.dir)
      if (!result.ok) return toast(result.message || '배경을 빼지 못했습니다.', 6000)
      song.background = null
      renderSongs()
      toast('이 곡의 영상 배경을 뺐습니다. 스튜디오의 배경을 씁니다.')
    }
    box.appendChild(clear)
  }
  return box
}

async function pickBackground (kind) {
  const result = await window.yue.videoBackground(kind)
  if (!result.ok) return
  studio.video.background = { kind: result.kind, path: result.path, url: result.url,
    name: result.path.split(/[\\/]/).pop() }
  showBackground()
  redraw()
  showStudioInfo()
  saveVideo()
}

// ── equalizer ──
function readEq (saved) {
  const eq = { ...VIDEO_DEFAULTS.eq, ...(saved || {}) }
  const gains = Array.isArray(eq.gains) && eq.gains.length === EQ_BANDS.length
    ? eq.gains.map((g) => Math.max(-EQ_RANGE, Math.min(EQ_RANGE, Number(g) || 0)))
    : VIDEO_DEFAULTS.eq.gains.slice()
  return { on: Boolean(eq.on), preset: presetFor(gains), gains }
}

// The preset these gains are, or 'custom' once a band has been moved by hand.
function presetFor (gains) {
  const found = EQ_PRESETS.find(([, , preset]) => preset.every((g, i) => g === gains[i]))
  return found ? found[0] : 'custom'
}

const bandLabel = (hz) => hz >= 1000 ? `${hz / 1000}k` : String(hz)
const dbText = (db) => `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(db)}dB`

// The preview's <audio> is routed through the filters the first time it plays. A
// media element can be wired into Web Audio only once, so the chain then stays; off
// means every band at 0 dB, which passes the sound through untouched.
function connectEq () {
  if (eqAudio.context) {
    if (eqAudio.context.state === 'suspended') eqAudio.context.resume().catch(() => {})
    return
  }
  try {
    const context = new AudioContext()
    let node = context.createMediaElementSource(studioEl('vAudio'))
    eqAudio.filters = EQ_BANDS.map((frequency) => {
      const filter = context.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = frequency
      filter.Q.value = EQ_Q
      filter.gain.value = 0
      node.connect(filter)
      node = filter
      return filter
    })
    node.connect(context.destination)
    eqAudio.context = context
    applyEq()
  } catch (error) {
    window.yue.log(`equalizer unavailable: ${error.message}`)
  }
}

function applyEq () {
  if (!eqAudio.context) return
  const eq = studio.video.eq
  eqAudio.filters.forEach((filter, i) =>
    filter.gain.setTargetAtTime(eq.on ? eq.gains[i] : 0, eqAudio.context.currentTime, 0.02))
}

function buildEq () {
  const select = studioEl('eqPreset')
  select.innerHTML = ''
  for (const [id, name] of [...EQ_PRESETS, ['custom', '사용자 설정']]) {
    const option = document.createElement('option')
    option.value = id
    option.textContent = name
    if (id === 'custom') option.disabled = true
    select.appendChild(option)
  }
  const board = studioEl('eqBoard')
  board.innerHTML = `<div class="eq-scale"><span style="top:0">+${EQ_RANGE}dB</span><span style="top:50%">0dB</span>` +
    `<span style="top:100%">−${EQ_RANGE}dB</span></div><div class="eq-bands"><div class="eq-lines">` +
    '<i style="top:0"></i><i style="top:50%"></i><i style="top:100%"></i></div></div>'
  const bands = board.querySelector('.eq-bands')
  EQ_BANDS.forEach((hz, i) => {
    const band = document.createElement('div')
    band.className = 'eq-band'
    band.innerHTML = '<div class="eq-track" tabindex="0" role="slider" aria-orientation="vertical">' +
      '<div class="eq-fill"></div><div class="eq-knob"></div></div><span class="eq-freq"></span>'
    band.querySelector('.eq-freq').textContent = bandLabel(hz)
    const track = band.querySelector('.eq-track')
    track.setAttribute('aria-label', `${bandLabel(hz)}Hz`)
    track.setAttribute('aria-valuemin', String(-EQ_RANGE))
    track.setAttribute('aria-valuemax', String(EQ_RANGE))
    // Half-dB steps; the top of the track is +10 dB, the bottom −10.
    const fromY = (y) => {
      const box = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (y - box.top) / box.height))
      setBand(i, Math.round((EQ_RANGE - ratio * 2 * EQ_RANGE) * 2) / 2)
    }
    track.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      track.focus()
      track.setPointerCapture(event.pointerId)
      fromY(event.clientY)
    })
    track.addEventListener('pointermove', (event) => {
      if (track.hasPointerCapture(event.pointerId)) fromY(event.clientY)
    })
    track.addEventListener('dblclick', () => setBand(i, 0))
    track.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 2 : 0.5
      const now = studio.video.eq.gains[i]
      const next = { ArrowUp: now + step, ArrowRight: now + step, ArrowDown: now - step, ArrowLeft: now - step,
        PageUp: now + 2, PageDown: now - 2, Home: EQ_RANGE, End: -EQ_RANGE, Delete: 0, Backspace: 0 }[event.key]
      if (next === undefined) return
      event.preventDefault()
      setBand(i, next)
    })
    bands.appendChild(band)
  })
}

// Moving a band turns the equalizer on: nobody drags a slider expecting no change.
function setBand (i, db) {
  const value = Math.max(-EQ_RANGE, Math.min(EQ_RANGE, db))
  const eq = studio.video.eq
  if (eq.gains[i] === value && eq.on) return
  const gains = eq.gains.slice()
  gains[i] = value
  studio.video.eq = { on: true, preset: presetFor(gains), gains }
  showEq()
  applyEq()
  redraw()
  saveVideo()
}

function showEq () {
  const board = studioEl('eqBoard')
  if (!board || !board.firstChild) return
  const eq = studio.video.eq
  studioEl('eqOn').checked = eq.on
  studioEl('eqPreset').value = eq.preset
  board.classList.toggle('off', !eq.on)
  board.querySelectorAll('.eq-band').forEach((band, i) => {
    const db = eq.gains[i]
    const at = ((EQ_RANGE - db) / (2 * EQ_RANGE)) * 100 // % from the top
    const fill = band.querySelector('.eq-fill')
    fill.style.top = `${Math.min(50, at)}%`
    fill.style.height = `${Math.abs(at - 50)}%`
    band.querySelector('.eq-knob').style.top = `${at}%`
    const track = band.querySelector('.eq-track')
    track.setAttribute('aria-valuenow', String(db))
    track.setAttribute('aria-valuetext', dbText(db))
    track.title = `${bandLabel(EQ_BANDS[i])}Hz ${dbText(db)}\n드래그로 조절 · 더블클릭하면 0dB`
  })
}

// ── folding panels ──
// Each studio panel folds from its title; the choice is remembered.
function wireFolds () {
  for (const section of document.querySelectorAll('.v-section[data-fold]')) {
    const key = `studioFold:${section.dataset.fold}`
    const button = section.querySelector('.v-fold')
    const show = (folded) => {
      section.classList.toggle('folded', folded)
      button.setAttribute('aria-expanded', String(!folded))
    }
    try { show(localStorage.getItem(key) === '1') } catch {}
    button.onclick = () => {
      const folded = !section.classList.contains('folded')
      show(folded)
      try { localStorage.setItem(key, folded ? '1' : '0') } catch {}
    }
  }
}

// ── preparing the audio and the spectrum cache ──
// ── picking songs for the video ──
// "체크한 곡": the songs ticked in the list, in list order (drag to reorder). The
// ticks are kept per project, in this browser's storage.
const pickKey = () => `videoPicks:${currentProject || ''}`
function picks () {
  if (!studio.picks || studio.picksFor !== pickKey()) {
    let saved = []
    try { saved = JSON.parse(localStorage.getItem(pickKey()) || '[]') } catch {}
    studio.picks = new Set(Array.isArray(saved) ? saved : [])
    studio.picksFor = pickKey()
  }
  return studio.picks
}

function savePicks () {
  try { localStorage.setItem(pickKey(), JSON.stringify([...picks()])) } catch {}
}

// One selection is shared by batch audio export and the video playlist.
function studioCheckbox (song) {
  if (!song.audio || song.unfinished) return null
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.className = 'v-pick'
  box.title = '일괄 저장·영상에 사용할 곡 선택'
  box.checked = picks().has(song.folder)
  box.onclick = (event) => event.stopPropagation()
  box.onchange = () => {
    studio.cliTracks = null
    if (box.checked) picks().add(song.folder)
    else picks().delete(song.folder)
    savePicks()
    useChecked()
    showPickCount()
    showStudioInfo()
  }
  return box
}

function useChecked () {
  studio.cliTracks = null
  if (studio.video.source === 'checked') return
  studio.video.source = 'checked'
  studioEl('vSource').value = 'checked'
  saveVideo()
}

function showPickCount () {
  const count = songs.filter((song) => song.audio && !song.unfinished && picks().has(song.folder)).length
  studioEl('songSelectionCount').textContent = `${count}곡 선택`
  studioEl('exportSelected').disabled = count === 0
  studioEl('vPickCount').textContent = studio.video.source === 'checked'
    ? `체크한 곡 ${count}곡`
    : `곡 앞 체크박스로 영상에 넣을 곡을 고르세요 (체크 ${count}곡)`
}

function setSongPicks (all) {
  studio.cliTracks = null
  picks().clear()
  if (all) for (const song of songs) if (song.audio && !song.unfinished) picks().add(song.folder)
  savePicks()
  if (all) useChecked()
  renderSongs()
  showPickCount()
  showStudioInfo()
}

function studioTracks () {
  const finished = (song) => song && song.audio && !song.unfinished
  // The CLI may request a deliberate playlist order.  Checkboxes remain a UI
  // convenience, but must not reorder an explicit automation request.
  if (Array.isArray(studio.cliTracks)) return studio.cliTracks.filter(finished)
  if (studio.video.source === 'project') return songs.filter(finished)
  if (studio.video.source === 'checked') return songs.filter((song) => finished(song) && picks().has(song.folder))
  return finished(selected) ? [selected] : []
}

function tracksKey (tracks) {
  return JSON.stringify([tracks.map((t) => t.audio), studio.video.fps, spectrumStyle().barCount])
}

function busy (text, fraction) {
  studioEl('vBusy').classList.toggle('hidden', text === null)
  if (text === null) return
  studioEl('vBusyText').textContent = text
  studioEl('vBusyBar').style.width = `${Math.round((fraction || 0) * 100)}%`
}

async function prepareStudio ({ quiet = false } = {}) {
  const tracks = studioTracks()
  if (!tracks.length) {
    if (!quiet) toast(studio.video.source === 'project'
      ? '이 프로젝트에는 완성곡이 없습니다.'
      : studio.video.source === 'checked'
        ? '영상에 넣을 곡을 목록에서 체크해주세요.'
        : '영상으로 만들 완성곡을 목록에서 먼저 선택해주세요.', 6000)
    return false
  }
  const key = tracksKey(tracks)
  const keepTime = studio.cycle ? clockTime() : 0
  pausePreview()
  studioEl('vPrepare').disabled = true
  busy('음원을 합치는 중…', 0)
  const result = await window.yue.videoPrepare({
    tracks: tracks.map((song) => ({ path: song.audio, title: song.title || '무제' })),
    fps: studio.video.fps,
    analysis: { barCount: spectrumStyle().barCount }
  })
  busy(null)
  studioEl('vPrepare').disabled = false
  if (!result.ok) {
    showProblem(result.message, null, '영상 미리보기를 준비하지 못했습니다')
    return false
  }
  studio.cycle = result.cycle
  studio.barCount = result.header.barCount
  // A copy, so the Float32 view starts on an aligned offset.
  studio.frames = new Float32Array(result.frames.slice().buffer)
  studio.preparedKey = key
  studio.titles = tracks.map((song) => song.title || '무제')
  studio.trackFolders = tracks.map((song) => song.folder)
  refreshRuns()
  studio.stageIndex = null
  const audio = studioEl('vAudio')
  audio.src = result.cycle.audioUrl
  studioEl('vEmpty').classList.add('hidden')
  studioEl('vSeek').max = String(result.cycle.frameCount - 1)
  for (const id of ['vPlay', 'vSeek', 'vRender']) studioEl(id).disabled = false
  showStudioInfo()
  seekPreview(Math.min(keepTime, duration()))
  if (typeof editorRefresh === 'function') editorRefresh()
  return true
}

// The same rule as electron/video.js targetSeconds.
function targetSeconds () {
  const length = studio.video.length
  if (length.mode === 'repeat') return duration() * Math.max(1, Math.round(Number(length.count) || 1))
  if (length.mode === 'minutes') return Math.max(1, Number(length.minutes) || 1) * 60
  return duration()
}

const longClock = (seconds) => seconds >= 3600
  ? `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
  : clock(seconds)

function showStudioInfo () {
  showPickCount()
  if (!studio.cycle) return
  const target = targetSeconds()
  const lines = [
    `${studio.titles.length}곡 · ${clock(duration())} · ${studio.cycle.fps}fps · ${studio.cycle.frameCount.toLocaleString()}프레임 · 막대 ${studio.barCount}개`
  ]
  if (studio.video.length.mode === 'repeat') {
    lines.push(`영상 길이 ${longClock(target)} — 재생목록을 ${Math.round(target / duration())}번 반복합니다`)
  } else if (studio.video.length.mode === 'minutes') {
    lines.push(target > duration()
      ? `영상 길이 ${longClock(target)} — 재생목록을 약 ${(target / duration()).toFixed(1)}번 반복합니다 (마지막 곡은 시간에 맞춰 끊김)`
      : `영상 길이 ${longClock(target)} — 재생목록 앞부분만 씁니다`)
  }
  if (studio.runs) {
    const own = studio.trackFolders.filter((folder) => (songs.find((s) => s.folder === folder) || {}).background).length
    lines.push(`곡별 배경 ${own}곡 — 그 곡이 나오는 동안 곡에 넣은 배경이 보입니다`)
  }
  const stale = studio.preparedKey && studio.preparedKey !== tracksKey(studioTracks())
  if (stale) lines.push('⚠ 곡 선택이나 설정이 바뀌었습니다. "미리보기 준비"를 다시 누르세요.')
  studioEl('vInfo').textContent = lines.join('\n')
}

// Bar count and fps are analysis settings: the cache is rebuilt, a moment after the
// last change (§11).
let reanalyseTimer = 0
function reanalyseSoon () {
  clearTimeout(reanalyseTimer)
  if (!studio.cycle) return showStudioInfo()
  reanalyseTimer = setTimeout(() => prepareStudio({ quiet: true }), 400)
}

// ── rendering ──
async function renderVideo ({ name: requestedName, cliToken = null, finalOutput = null } = {}) {
  if (studio.frame) return { ok: false, error: 'render already in progress', code: 'busy' }
  if (!studio.cycle) return { ok: false, error: 'preview is not prepared', code: 'not_prepared' }
  if (studio.preparedKey !== tracksKey(studioTracks()) && !confirm(
    '곡 선택이나 설정이 미리보기와 다릅니다. 지금 미리보기에 준비된 곡으로 영상을 만들까요?')) return { ok: false, error: 'render cancelled', code: 'cancelled' }
  pausePreview()
  // The look is fixed at the start, so adjusting the panel meanwhile cannot change
  // the video halfway through.
  const style = JSON.parse(JSON.stringify(spectrumStyle()))
  const shape = eqBarShape()
  const background = { ...studio.video.background }
  refreshRuns()
  const runs = studio.runs
  const [outWidth, outHeight] = RESOLUTION_SIZES[studio.video.resolution] || RESOLUTION_SIZES['1080p']
  const video = {
    background: { kind: background.kind, path: background.path },
    // Songs with their own background: which one covers which frames, and how dark.
    runs: runs ? runs.map((run) => ({ start: run.start, end: run.end,
      background: { kind: run.background.kind, path: run.background.path, name: run.background.name } })) : undefined,
    dim: style.dim,
    // The equalizer, as heard in the preview; null leaves the sound as it is.
    eq: studio.video.eq.on && studio.video.eq.gains.some((g) => g !== 0) ? studio.video.eq.gains.slice() : null,
    spectrum: { visible: style.visible },
    band: spectrumBand(style, { width: outWidth, height: outHeight }),
    overlays: (studio.video.overlays || []).map((o) => ({ path: o.path, name: o.name, x: o.x, y: o.y, w: o.w, ar: o.ar,
      opacity: o.opacity == null ? 1 : o.opacity, start: o.start || 0, end: o.end == null ? null : o.end })),
    length: { ...studio.video.length },
    resolution: studio.video.resolution,
    renderer: studio.video.renderer
  }
  // The tracklist goes in as one picture per song, after the editor's pictures.
  try {
    video.overlays.push(...await tracklistOverlays(outWidth, outHeight))
  } catch (error) {
    showProblem(error.message, null, '영상을 만들지 못했습니다')
    return { ok: false, error: error.message, code: 'render_error' }
  }
  const name = requestedName || (studio.video.source === 'project'
    ? `${currentProject || '플레이리스트'} 플레이리스트`
    : (studio.titles[0] || '영상'))
  const request = { cycleId: studio.cycle.id, video, name }
  const start = cliToken && window.roadCliInvoke
    ? await window.roadCliInvoke(cliToken, 'video:start', [request]) : await window.yue.videoStart(request)
  if (!start.ok) {
    if (start.blocked) showProblem(start.message, null, '저장할 수 없는 폴더')
    else if (!start.canceled) showProblem(start.message, null, '영상을 만들지 못했습니다')
    return { ok: false, error: start.message || 'video start failed', code: start.canceled ? 'cancelled' : 'render_error' }
  }
  const { jobId, plan } = start
  const job = { jobId, cancelled: false }
  studio.frame = job
  setRendering(true)
  const began = performance.now()
  try {
    // CPU mode keeps the canvases in main memory (software raster); GPU mode lets
    // Chromium draw on the graphics card and reads each frame back.
    const options = { alpha: true, willReadFrequently: video.renderer === 'cpu' }
    const rc = (frameIndex) => ({ width: plan.width, height: plan.height, fps: plan.fps, frameIndex, pixelRatio: 1 })
    // The unchanging layer, once.
    const full = new OffscreenCanvas(plan.width, plan.height)
    const fullCtx = full.getContext('2d', options)
    // With per-song backgrounds the layer is the plain gradient, used for the songs
    // that end up with no picture at all; ffmpeg darkens the pictures itself.
    drawLayer(fullCtx, style, runs ? NO_BACKGROUND : background, rc(0))
    await window.yue.videoLayer(jobId, fullCtx.getImageData(0, 0, plan.width, plan.height).data)
    if (plan.still) {
      progress(0, 1, began, '정지 화면 영상 만드는 중…')
    } else {
      // Then only the spectrum's strip, frame by frame, at the height ffmpeg puts it back.
      const band = new OffscreenCanvas(plan.width, plan.bandHeight)
      const ctx = band.getContext('2d', options)
      // Frames go to the loopback server when there is one (see main.js), else by IPC.
      // Several are in flight at once; the main process writes them in order.
      let viaHttp = Boolean(start.port)
      const send = (frame, pixels) => viaHttp
        ? fetch(`http://127.0.0.1:${start.port}/frame/${jobId}/${start.token}/${frame}`,
          { method: 'POST', body: pixels, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } })
          .catch(() => {
            viaHttp = false
            return window.yue.videoFrame(jobId, frame, pixels)
          })
        : window.yue.videoFrame(jobId, frame, pixels)
      const pending = []
      const spent = { draw: 0, read: 0, wait: 0 } // where the time goes, for the log
      for (let frame = 0; frame < plan.renderFrames; frame++) {
        if (job.cancelled || job.failed) break
        const t0 = performance.now()
        drawBand(ctx, rowAt(frame, shape), style, rc(frame), plan.bandY)
        const t1 = performance.now()
        const pixels = ctx.getImageData(0, 0, plan.width, plan.bandHeight).data
        const t2 = performance.now()
        pending.push(send(frame, pixels))
        // A few frames in flight keep drawing and encoding busy at the same time.
        if (pending.length >= 4) await pending.shift()
        const t3 = performance.now()
        spent.draw += t1 - t0
        spent.read += t2 - t1
        spent.wait += t3 - t2
        if (frame % 15 === 0) progress(frame, plan.renderFrames, began)
      }
      await Promise.all(pending)
      const per = (ms) => (ms / Math.max(1, plan.renderFrames)).toFixed(1)
      window.yue.log(`video timing per frame (${viaHttp ? 'http' : 'ipc'}): draw ${per(spent.draw)}ms, readback ${per(spent.read)}ms, send ${per(spent.wait)}ms`)
    }
    if (job.cancelled && !job.failed) {
      await window.yue.videoCancel(jobId)
      toast('영상 만들기를 취소했습니다.')
      return { ok: false, error: 'render cancelled', code: 'cancelled' }
    }
    progress(plan.renderFrames, plan.renderFrames, began,
      plan.loop ? '반복 구간을 이어 붙이는 중…' : '마무리하는 중…')
    const result = await window.yue.videoFinish(jobId)
    if (!result.ok) {
      showProblem(result.message, null, '영상을 만들지 못했습니다')
      if (result.gpuFailed) {
        studio.video.renderer = 'cpu'
        writeControls()
        saveVideo()
      }
      return result
    }
    const displayed = finalOutput ? { ...result, path: finalOutput } : result
    showResult(displayed, start.chapters, performance.now() - began)
    if (runs || (studio.video.overlays || []).length) {
      studioEl('vResultCheck').textContent = runs
        ? '미리보기 일치 검사: 곡별 배경이 있어 건너뜁니다'
        : '미리보기 일치 검사: 붙인 이미지가 있어 건너뜁니다'
    }
    else if (!plan.still) {
      const verification = verifyRender({ result, plan, style, background, shape })
      if (cliToken) await verification
    }
    if (typeof editorRendered === 'function') editorRendered(displayed)
    return { ok: true, ...result, chapters: start.chapters }
  } catch (error) {
    await window.yue.videoCancel(jobId).catch(() => {})
    showProblem(`영상을 만들다 멈췄습니다: ${error.message}`, null, '영상을 만들지 못했습니다')
    return { ok: false, error: error.message, code: 'render_error' }
  } finally {
    studio.frame = null
    setRendering(false)
  }
}

// After a render: the preview's way of drawing (one canvas, everything at once)
// against the finished MP4, at the frames the 지시서 names — first, 1 s, 10 s,
// middle, 1 s before the end. The score shows in the result panel and the log.
async function verifyRender ({ result, plan, style, background, shape }) {
  if (background.kind === 'video') {
    studioEl('vResultCheck').textContent = '미리보기 일치 검사: 영상 배경은 프레임마다 달라 건너뜁니다'
    return
  }
  const last = plan.renderFrames - 1
  const picks = [...new Set([0, plan.fps, plan.fps * 10, Math.floor(last / 2), last - plan.fps]
    .filter((frame) => frame >= 0 && frame <= last))]
  const canvas = new OffscreenCanvas(plan.width, plan.height)
  const ctx = canvas.getContext('2d', { alpha: true })
  const scores = []
  studioEl('vResultCheck').textContent = '미리보기와 최종 영상 비교 중…'
  for (const frame of picks) {
    renderFrame(ctx, rowAt(frame, shape), style, background,
      { width: plan.width, height: plan.height, fps: plan.fps, frameIndex: frame, pixelRatio: 1 })
    const check = await window.yue.videoCompare({
      output: result.path, frame, fps: plan.fps, width: plan.width, height: plan.height,
      rgba: ctx.getImageData(0, 0, plan.width, plan.height).data,
      background: { kind: background.kind, path: background.path }
    })
    if (check.ok) scores.push({ frame, ssim: check.ssim })
  }
  if (!scores.length) {
    studioEl('vResultCheck').textContent = '미리보기 일치 검사를 하지 못했습니다'
    return
  }
  // Neighbouring frames look alike, so a high score alone cannot rule out an
  // off-by-one; the preview frame must match its own MP4 frame best (§14.3: 0 frames).
  // The probe is the frame whose bars differ most from both neighbours: during a held
  // note two adjacent frames can be indistinguishable, and the test would prove nothing.
  let offset = null
  let probe = null
  let motion = 0
  const step = Math.max(1, Math.floor(last / 3000))
  const diff = (a, b) => {
    const ra = rowAt(a, shape)
    const rb = rowAt(b, shape)
    let sum = 0
    for (let i = 0; i < ra.length; i++) sum += Math.abs(ra[i] - rb[i])
    return sum
  }
  for (let frame = 1; frame < last; frame += step) {
    const change = Math.min(diff(frame, frame - 1), diff(frame, frame + 1))
    if (change > motion) {
      motion = change
      probe = frame
    }
  }
  if (probe !== null) {
    renderFrame(ctx, rowAt(probe, shape), style, background,
      { width: plan.width, height: plan.height, fps: plan.fps, frameIndex: probe, pixelRatio: 1 })
    const rgba = ctx.getImageData(0, 0, plan.width, plan.height).data
    const around = []
    for (const shift of [-1, 0, 1]) {
      const check = await window.yue.videoCompare({
        output: result.path, frame: probe, against: probe + shift, fps: plan.fps,
        width: plan.width, height: plan.height, rgba, background: { kind: background.kind, path: background.path }
      })
      if (check.ok) around.push({ shift, ssim: check.ssim })
    }
    if (around.length === 3) offset = around.reduce((best, x) => x.ssim > best.ssim ? x : best).shift
  }
  const worst = Math.min(...scores.map((s) => s.ssim))
  const label = (frame) => frame === 0 ? '첫 프레임' : `${clock(frame / plan.fps)}`
  studioEl('vResultCheck').textContent =
    `미리보기 일치도 (SSIM, 1이 완전 일치): ${scores.map((s) => `${label(s.frame)} ${s.ssim.toFixed(4)}`).join(' · ')}` +
    (worst >= 0.99 ? ' ✓' : ' — 기준(0.99)보다 낮습니다') +
    (offset === null ? '' : offset === 0 ? ' · 프레임 위치 오차 0 ✓' : ` · 프레임이 ${offset}칸 어긋났습니다`)
  window.yue.log(`video preview/render SSIM ${scores.map((s) => `#${s.frame}=${s.ssim.toFixed(5)}`).join(' ')} frame offset ${offset}`)
}

function setRendering (on) {
  studioEl('vRender').disabled = on
  studioEl('vPrepare').disabled = on
  studioEl('vCancel').classList.toggle('hidden', !on)
  studioEl('vProgress').classList.toggle('hidden', !on)
  if (on) studioEl('vResult').classList.add('hidden')
}

function progress (done, total, began, note) {
  const elapsed = (performance.now() - began) / 1000
  const rate = done > 0 ? done / elapsed : 0
  const left = rate > 0 ? (total - done) / rate : 0
  studioEl('vProgressBar').style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`
  studioEl('vProgressText').textContent = note ||
    `${done.toLocaleString()} / ${total.toLocaleString()} 프레임 · ${rate.toFixed(0)}fps · ` +
    `지난 시간 ${clock(elapsed)} · 남은 시간 약 ${clock(left)}`
}

function showResult (result, chapters, ms) {
  const box = studioEl('vResult')
  box.classList.remove('hidden')
  studioEl('vResultText').textContent =
    `✓ 영상을 만들었습니다 · 길이 ${clock(result.seconds || result.expectedSeconds)} · 걸린 시간 ${clock(ms / 1000)}\n${result.path}`
  studioEl('vResultText').style.whiteSpace = 'pre-line'
  studioEl('vChapters').textContent = chapters.join('\n')
  studioEl('vOpen').onclick = () => window.yue.reveal(result.path.replace(/[\\/][^\\/]+$/, ''))
  studioEl('vCopyChapters').onclick = async () => {
    await navigator.clipboard.writeText(chapters.join('\n'))
    toast('유튜브 설명란에 붙여 넣을 타임스탬프를 복사했습니다.')
  }
}

// ── wiring ──
async function initStudio () {
  const saved = await window.yue.videoSettings()
  if (saved) {
    studio.video = { ...studio.video, ...saved,
      background: { ...VIDEO_DEFAULTS.background, ...(saved.background || {}) },
      length: { ...VIDEO_DEFAULTS.length, ...(saved.length || {}) },
      spectrum: { ...SPECTRUM_DEFAULTS, ...(saved.spectrum || {}) },
      eq: readEq(saved.eq),
      overlays: Array.isArray(saved.overlays) ? saved.overlays.filter((o) => o && o.path && o.url && o.ar > 0) : [],
      tracklist: { ...TRACKLIST_DEFAULTS, ...(saved.tracklist || {}) } }
  }
  writeControls()
  showPickCount()
  renderSongs() // the list may have been drawn before these settings arrived

  // The studio column can be put away when only making songs.
  const panel = studioEl('studio')
  try { if (localStorage.getItem('studioOpen') === '0') panel.classList.add('hidden') } catch {}
  studioEl('studioToggle').onclick = () => {
    panel.classList.toggle('hidden')
    try { localStorage.setItem('studioOpen', panel.classList.contains('hidden') ? '0' : '1') } catch {}
    if (!panel.classList.contains('hidden')) redraw()
    renderSongs()
  }

  // ffmpeg stopped mid-render: stop drawing; videoFinish then reports why.
  window.yue.onVideoFailed(({ jobId, message }) => {
    if (studio.frame && studio.frame.jobId === jobId) studio.frame.failed = message
  })

  window.yue.onVideoProgress(({ stage, fraction }) => {
    busy(stage === 'audio' ? '음원을 합치는 중…' : '스펙트럼 분석 중…', fraction)
  })

  studioEl('vPrepare').onclick = () => prepareStudio()
  studioEl('vPlay').onclick = () => studio.clock.playing ? pausePreview() : playPreview()
  const seek = studioEl('vSeek')
  seek.addEventListener('input', () => {
    studio.seeking = true
    const fps = studio.cycle ? studio.cycle.fps : 30
    const wasPlaying = studio.clock.playing
    if (wasPlaying) pausePreview()
    seekPreview(Number(seek.value) / fps)
    studio.resumeAfterSeek = studio.resumeAfterSeek || wasPlaying
  })
  seek.addEventListener('change', () => {
    studio.seeking = false
    if (studio.resumeAfterSeek) playPreview()
    studio.resumeAfterSeek = false
  })

  studioEl('vSource').onchange = (event) => {
    studio.cliTracks = null
    studio.video.source = event.target.value
    saveVideo()
    showPickCount()
    showStudioInfo()
  }
  studioEl('vPickAll').onclick = () => setSongPicks(true)
  studioEl('vPickNone').onclick = () => setSongPicks(false)
  studioEl('vBgPickImage').onclick = () => pickBackground('image')
  studioEl('vBgPickVideo').onclick = () => pickBackground('video')
  studioEl('vBgClear').onclick = () => {
    studio.video.background = { ...VIDEO_DEFAULTS.background }
    showBackground()
    redraw()
    showStudioInfo()
    saveVideo()
  }
  for (const id of ['vLength', 'vRepeat', 'vHours', 'vMins']) {
    studioEl(id).addEventListener(id === 'vLength' ? 'change' : 'input', () => {
      readLength()
      showLengthInputs()
      showStudioInfo()
      saveVideo()
    })
  }
  studioEl('vResolution').onchange = (event) => { studio.video.resolution = event.target.value; saveVideo() }
  studioEl('vFps').onchange = (event) => {
    studio.video.fps = Number(event.target.value)
    saveVideo()
    reanalyseSoon()
  }
  for (const radio of document.querySelectorAll('input[name="vRenderer"]')) {
    radio.onchange = () => { studio.video.renderer = radio.value; saveVideo() }
    // On a Mac the GPU option encodes with VideoToolbox (electron/video.js).
    if (MAC && radio.value === 'gpu') radio.nextSibling.textContent = ' GPU (Apple)'
  }

  // Visual settings redraw at once; the cache stays as it is (§6).
  const visual = {
    sVisible: (el) => ({ visible: el.checked }),
    sKind: (el) => ({ kind: el.value }),
    sLayout: (el) => ({ layout: el.value, symmetric: el.value === 'center' }),
    sPosition: (el) => ({ position: el.value }),
    sSize: (el) => ({ size: Number(el.value) }),
    sWidth: (el) => ({ width: Number(el.value) }),
    sColor1: (el) => ({ color1: el.value }),
    sColor2: (el) => ({ color2: el.value }),
    sGlow: (el) => ({ glow: Number(el.value) }),
    sGain: (el) => {
      showGain(el.value)
      return { gain: Number(el.value) }
    },
    sDim: (el) => {
      showDim(el.value)
      return { dim: Number(el.value) }
    }
  }
  for (const [id, read] of Object.entries(visual)) {
    const el = studioEl(id)
    el.addEventListener('input', () => {
      studio.video.spectrum = { ...studio.video.spectrum, ...read(el) }
      redraw()
      saveVideo()
    })
  }
  studioEl('sBars').onchange = (event) => {
    studio.video.spectrum = { ...studio.video.spectrum, barCount: Number(event.target.value) }
    saveVideo()
    reanalyseSoon()
  }

  wireFolds()
  buildEq()
  showEq()
  studioEl('eqOn').onchange = (event) => {
    studio.video.eq = { ...studio.video.eq, on: event.target.checked }
    showEq()
    applyEq()
    redraw()
    saveVideo()
  }
  studioEl('eqPreset').onchange = (event) => {
    const preset = EQ_PRESETS.find(([id]) => id === event.target.value)
    if (!preset) return showEq()
    studio.video.eq = { on: true, preset: preset[0], gains: preset[2].slice() }
    showEq()
    applyEq()
    redraw()
    saveVideo()
  }

  studioEl('vRender').onclick = renderVideo
  studioEl('vCancel').onclick = () => {
    if (studio.frame) studio.frame.cancelled = true
  }

  new ResizeObserver(() => redraw()).observe(studioEl('vStage'))
  redraw()
}

const studioReady = initStudio()
window.RoadStudioReady = studioReady
