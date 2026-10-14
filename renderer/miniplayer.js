'use strict'
// ── mini player ──────────────────────────────────────────────────────────────
// The app's one player. ▶ on a song plays the project's finished songs in list order
// from that song; "전체 듣기" plays them from the top. Title, a small live spectrum,
// previous / play-pause / next, a seek bar, and the lyrics with the line being sung
// lit up (left empty for a song without words). It floats over the app and can be
// dragged anywhere; only one thing plays at a time, so the video preview and the
// mini player pause each other.

const miniPlayer = {
  el: null,
  audio: null,
  list: [], // the songs queued when "전체 듣기" was pressed, in list order
  index: 0,
  dir: null, // the song playing, marked in the library
  analyser: null,
  bins: null,
  frame: 0,
  seeking: false,
  lines: [], // the lyrics on show: { text, label, time, el }
  active: -1,
  lyricsFor: null, // which song the lyrics belong to (a later song may load first)
  touchedAt: 0 // when the reader last scrolled the lyrics themselves
}

const MINI_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>'
const MINI_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>'
const MINI_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'
const MINI_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'

const miniClock = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function buildMiniPlayer () {
  const el = document.createElement('div')
  el.className = 'mini-player hidden'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', '전체 듣기')
  el.innerHTML = `
    <div class="mini-head">
      <span class="mini-badge">듣기</span>
      <span class="mini-count"></span>
      <button class="mini-close" aria-label="닫기" title="닫기">✕</button>
    </div>
    <div class="mini-title"></div>
    <canvas class="mini-spectrum" aria-hidden="true"></canvas>
    <div class="mini-progress">
      <span class="mini-time">0:00</span>
      <input class="mini-seek" type="range" min="0" max="1000" value="0" aria-label="재생 위치">
      <span class="mini-length">0:00</span>
    </div>
    <div class="mini-controls">
      <button class="mini-prev" aria-label="이전 곡" title="이전 곡">${MINI_PREV}</button>
      <button class="mini-toggle" aria-label="재생" title="재생">${MINI_PLAY}</button>
      <button class="mini-next" aria-label="다음 곡" title="다음 곡">${MINI_NEXT}</button>
    </div>
    <div class="mini-lyrics">
      <div class="mini-lyrics-list" tabindex="0" aria-label="가사"></div>
      <div class="mini-lyrics-note"></div>
    </div>`
  document.body.appendChild(el)
  const audio = document.createElement('audio')
  audio.preload = 'auto'
  el.appendChild(audio)
  miniPlayer.el = el
  miniPlayer.audio = audio

  const q = (selector) => el.querySelector(selector)
  q('.mini-close').onclick = closeMiniPlayer
  wireMiniLyrics(q('.mini-lyrics-list'))
  q('.mini-toggle').onclick = () => audio.paused ? playMini() : audio.pause()
  q('.mini-prev').onclick = () => {
    // Like any player: back to the start first, to the previous song on a second press.
    if (audio.currentTime > 3 || miniPlayer.index === 0) audio.currentTime = 0
    else loadMini(miniPlayer.index - 1, true)
  }
  q('.mini-next').onclick = () => {
    if (miniPlayer.index < miniPlayer.list.length - 1) loadMini(miniPlayer.index + 1, true)
  }

  const seek = q('.mini-seek')
  seek.addEventListener('input', () => {
    miniPlayer.seeking = true
    q('.mini-time').textContent = miniClock(seek.value / 1000 * (audio.duration || 0))
  })
  seek.addEventListener('change', () => {
    if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration
    miniPlayer.seeking = false
  })

  audio.addEventListener('timeupdate', showMiniTime)
  audio.addEventListener('timeupdate', syncMiniLyrics)
  audio.addEventListener('seeked', () => syncMiniLyrics(true))
  audio.addEventListener('loadedmetadata', showMiniTime)
  audio.addEventListener('play', showMiniState)
  audio.addEventListener('pause', showMiniState)
  // The ▶ / ❚❚ on the song cards follow the player.
  audio.addEventListener('play', () => renderSongs())
  audio.addEventListener('pause', () => renderSongs())
  audio.addEventListener('ended', () => {
    // On to the next song; after the last one the list stops at its start.
    if (miniPlayer.index < miniPlayer.list.length - 1) loadMini(miniPlayer.index + 1, true)
    else loadMini(0, false)
  })
  audio.addEventListener('error', () => {
    toast(`"${miniPlayer.list[miniPlayer.index].title || '무제'}"을(를) 재생하지 못해 다음 곡으로 넘어갑니다.`, 4000)
    if (miniPlayer.index < miniPlayer.list.length - 1) loadMini(miniPlayer.index + 1, true)
  })

  // Only one thing plays at a time.
  document.addEventListener('play', (event) => {
    if (event.target !== audio && !audio.paused) audio.pause()
  }, true)

  wireMiniDrag(q('.mini-head'))
  window.addEventListener('resize', () => placeMini())
}

// The layer is moved by its top bar and stays where it was left, inside the window.
function wireMiniDrag (handle) {
  const el = miniPlayer.el
  handle.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return
    const box = el.getBoundingClientRect()
    const dx = event.clientX - box.left
    const dy = event.clientY - box.top
    handle.setPointerCapture(event.pointerId)
    el.classList.add('dragging')
    const move = (e) => placeMini(e.clientX - dx, e.clientY - dy)
    const up = () => {
      handle.removeEventListener('pointermove', move)
      el.classList.remove('dragging')
      const at = el.getBoundingClientRect()
      try { localStorage.setItem('miniPlayerAt', JSON.stringify({ left: at.left, top: at.top })) } catch {}
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up, { once: true })
    handle.addEventListener('pointercancel', up, { once: true })
  })
}

function placeMini (left, top) {
  const el = miniPlayer.el
  if (!el || el.classList.contains('hidden')) return
  const box = el.getBoundingClientRect()
  if (left === undefined) {
    left = box.left
    top = box.top
  }
  el.style.left = `${Math.max(8, Math.min(left, window.innerWidth - box.width - 8))}px`
  el.style.top = `${Math.max(8, Math.min(top, window.innerHeight - box.height - 8))}px`
  el.style.right = 'auto'
  el.style.bottom = 'auto'
}

const playable = () => songs.filter((song) => song.audio && !song.unfinished && !song.scoreOnly)

// "전체 듣기": the finished songs of the list, from the top.
function openMiniPlayer () {
  const list = playable()
  if (!list.length) return toast('들을 수 있는 완성된 곡이 없습니다.')
  startMini(list, 0)
}

// Is this song the one the mini player is playing right now?
function miniPlaying (song) {
  return Boolean(miniPlayer.audio && song && miniPlayer.dir === song.dir && !miniPlayer.audio.paused)
}

// ▶ on a song card: pause it if it is playing, carry on if it is paused there,
// otherwise play the list from this song.
function playFromSong (song) {
  if (!song || !song.audio || song.unfinished) return toast('완성된 곡만 들을 수 있습니다.')
  if (miniPlayer.audio && miniPlayer.dir === song.dir && miniPlayer.el && !miniPlayer.el.classList.contains('hidden')) {
    if (miniPlayer.audio.paused) playMini()
    else miniPlayer.audio.pause()
    return
  }
  const list = playable()
  const index = Math.max(0, list.findIndex((s) => s.dir === song.dir))
  startMini(index >= 0 && list[index] && list[index].dir === song.dir ? list : [song], index)
}

// A song about to be renamed, moved or deleted: the player lets go of its file (all
// files when dir is null). With keep, it says where it was, for resumeMini.
function releaseMini (dir, { keep = false } = {}) {
  if (!miniPlayer.audio || !miniPlayer.dir || (dir && miniPlayer.dir !== dir)) return null
  const { audio } = miniPlayer
  const held = { dir: miniPlayer.dir, time: audio.currentTime, playing: !audio.paused }
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  if (!keep) closeMiniPlayer()
  return held
}

function resumeMini (held) {
  const list = playable()
  const index = list.findIndex((s) => s.dir === held.dir)
  if (index < 0) return closeMiniPlayer()
  miniPlayer.list = list
  loadMini(index, false)
  miniPlayer.audio.addEventListener('loadedmetadata', () => {
    miniPlayer.audio.currentTime = held.time
    if (held.playing) playMini()
  }, { once: true })
}

function startMini (list, start = 0) {
  if (!miniPlayer.el) buildMiniPlayer()
  const el = miniPlayer.el
  const wasHidden = el.classList.contains('hidden')
  el.classList.remove('hidden')
  if (wasHidden) {
    let saved = null
    try { saved = JSON.parse(localStorage.getItem('miniPlayerAt') || 'null') } catch {}
    if (saved) placeMini(saved.left, saved.top)
  }
  miniPlayer.list = list
  el.querySelector('.mini-badge').textContent = currentProject ? `♪ ${currentProject}` : '♪ 듣기'
  requestAnimationFrame(() => placeMini())
  loadMini(start, true)
}

function closeMiniPlayer () {
  if (!miniPlayer.el) return
  miniPlayer.audio.pause()
  miniPlayer.el.classList.add('hidden')
  miniPlayer.dir = null
  cancelAnimationFrame(miniPlayer.frame)
  renderSongs()
}

function loadMini (index, play) {
  const song = miniPlayer.list[index]
  if (!song) return
  miniPlayer.index = index
  miniPlayer.dir = song.dir
  const { audio, el } = miniPlayer
  audio.src = song.audioUrl || `file:///${encodeURI(song.audio.replace(/\\/g, '/'))}`
  el.querySelector('.mini-title').textContent = song.title || song.id || '무제'
  el.querySelector('.mini-title').title = song.title || ''
  el.querySelector('.mini-count').textContent = `${index + 1} / ${miniPlayer.list.length}`
  el.querySelector('.mini-prev').disabled = false
  el.querySelector('.mini-next').disabled = index >= miniPlayer.list.length - 1
  loadMiniLyrics(song)
  el.querySelector('.mini-seek').value = 0
  showMiniTime()
  if (play) playMini()
  else showMiniState()
  renderSongs() // the library marks the song playing
}

function playMini () {
  const { audio } = miniPlayer
  // The video preview steps aside.
  if (typeof studio !== 'undefined' && studio.clock && studio.clock.playing && typeof pausePreview === 'function') pausePreview()
  startMiniSpectrum()
  audio.play().catch((error) => toast(`재생하지 못했습니다: ${error.message}`, 5000))
}

function showMiniState () {
  const { audio, el } = miniPlayer
  const button = el.querySelector('.mini-toggle')
  button.innerHTML = audio.paused ? MINI_PLAY : MINI_PAUSE
  button.setAttribute('aria-label', audio.paused ? '재생' : '일시정지')
  button.title = audio.paused ? '재생' : '일시정지'
  el.classList.toggle('playing', !audio.paused)
  if (!audio.paused) drawMiniSpectrum()
}

function showMiniTime () {
  const { audio, el } = miniPlayer
  const length = audio.duration || Number((miniPlayer.list[miniPlayer.index] || {}).seconds) || 0
  el.querySelector('.mini-length').textContent = miniClock(length)
  if (miniPlayer.seeking) return
  el.querySelector('.mini-time').textContent = miniClock(audio.currentTime)
  el.querySelector('.mini-seek').value = length ? Math.round(audio.currentTime / length * 1000) : 0
}

// ── the small spectrum ──
// Web Audio listens to the player; the bars are log-spaced like the video spectrum
// and fall back slowly, so the picture breathes with the music.
function startMiniSpectrum () {
  if (miniPlayer.analyser) {
    if (miniPlayer.context.state === 'suspended') miniPlayer.context.resume()
    return
  }
  try {
    const context = new AudioContext()
    const source = context.createMediaElementSource(miniPlayer.audio)
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.72
    source.connect(analyser)
    analyser.connect(context.destination)
    miniPlayer.context = context
    miniPlayer.analyser = analyser
    miniPlayer.bins = new Uint8Array(analyser.frequencyBinCount)
    miniPlayer.levels = new Float32Array(28)
  } catch (error) {
    window.yue.log(`mini player spectrum unavailable: ${error.message}`)
  }
}

function drawMiniSpectrum () {
  cancelAnimationFrame(miniPlayer.frame)
  const { el, analyser, audio } = miniPlayer
  if (!analyser || el.classList.contains('hidden')) return
  const canvas = el.querySelector('.mini-spectrum')
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (canvas.width !== Math.round(width * ratio)) {
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  const styles = getComputedStyle(document.documentElement)
  const gradient = ctx.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, styles.getPropertyValue('--accent').trim() || '#7c5cff')
  gradient.addColorStop(1, styles.getPropertyValue('--accent-2').trim() || '#ff5c9d')

  const { bins, levels } = miniPlayer
  const count = levels.length
  const nyquist = miniPlayer.context.sampleRate / 2
  const step = () => {
    analyser.getByteFrequencyData(bins)
    ctx.clearRect(0, 0, width, height)
    const gap = 3
    const barWidth = (width - gap * (count - 1)) / count
    for (let i = 0; i < count; i++) {
      // 50 Hz … 14 kHz on a log scale.
      const lo = 50 * Math.pow(14000 / 50, i / count)
      const hi = 50 * Math.pow(14000 / 50, (i + 1) / count)
      const a = Math.floor(lo / nyquist * bins.length)
      const b = Math.max(a + 1, Math.ceil(hi / nyquist * bins.length))
      let peak = 0
      for (let k = a; k < b && k < bins.length; k++) peak = Math.max(peak, bins[k])
      const target = audio.paused ? 0 : peak / 255
      if (i === 0) syncMiniLyrics() // smoother than timeupdate's four times a second
      levels[i] = target > levels[i] ? target : levels[i] * 0.9
      const h = Math.max(2, levels[i] * (height - 2))
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.roundRect(i * (barWidth + gap), height - h, barWidth, h, Math.min(2, barWidth / 2))
      ctx.fill()
    }
    // Keep drawing while playing, and until the bars have settled after a pause.
    if (!audio.paused || levels.some((level) => level > 0.01)) miniPlayer.frame = requestAnimationFrame(step)
  }
  step()
}

// ── lyrics ──
// The song's own lyrics, section by section, each line timed from songCues (ACE-Step's
// record, the score, or an even spread). The line being sung is lit and kept in the
// middle; while the reader drags or scrolls the lyrics, the follow waits a moment so
// they can look ahead. A line clicked (not dragged) plays from there.

const lyricKey = (text) => String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

// Lines as written ([Verse] headings kept as labels), with the times of the cues laid
// on in order. A cue may hold two or three lines sung under a second apart (that is
// when srt.js merges them), so they step through it at most 0.9 s apart.
function timedLyrics (lyrics, cues) {
  const lines = []
  let label = ''
  for (const raw of String(lyrics || '').split(/\r?\n/)) {
    const line = raw.trim()
    const tag = line.match(/^\[([^\]]+)\]$/)
    if (tag) {
      label = tag[1].trim()
      continue
    }
    if (!line) continue
    lines.push({ text: line, label, time: null })
    label = ''
  }
  const sung = cues.flatMap((cue) => {
    const parts = cue.text.split('\n')
    const span = Math.min(0.9, Math.max(0, cue.end - cue.start) / parts.length)
    return parts.map((text, i) => ({ text, time: cue.start + span * i }))
  })
  let at = 0
  let matched = 0
  for (const line of lines) {
    const key = lyricKey(line.text)
    for (let look = at; look < Math.min(sung.length, at + 4); look++) {
      if (lyricKey(sung[look].text) === key) {
        line.time = sung[look].time
        at = look + 1
        matched += 1
        break
      }
    }
  }
  // ACE-Step may write the words a little differently; then its own lines are shown.
  if (sung.length && matched < lines.length / 2) return sung.map((line) => ({ text: line.text, label: '', time: line.time }))
  return lines
}

async function loadMiniLyrics (song) {
  const { el } = miniPlayer
  const list = el.querySelector('.mini-lyrics-list')
  const note = el.querySelector('.mini-lyrics-note')
  miniPlayer.lyricsFor = song.dir
  miniPlayer.lines = []
  miniPlayer.active = -1
  list.scrollTop = 0
  const words = typeof lyricsOf === 'function' ? lyricsOf(song) : ''
  if (!words) {
    // No words (an instrumental, or a song brought in from elsewhere): left empty.
    list.innerHTML = ''
    note.textContent = ''
    return
  }
  list.innerHTML = '<div class="mini-lyrics-empty">가사를 불러오는 중…</div>'
  let timing = { cues: [], method: 'none' }
  try { timing = await songCues(song) } catch {}
  if (miniPlayer.lyricsFor !== song.dir) return // another song took over meanwhile
  const lines = timedLyrics(words, timing.cues || [])
  list.innerHTML = ''
  for (const line of lines) {
    if (line.label) {
      const label = document.createElement('div')
      label.className = 'mini-lyrics-label'
      label.textContent = line.label
      list.appendChild(label)
    }
    const row = document.createElement('div')
    row.className = 'mini-lyrics-line' + (line.time === null ? ' untimed' : '')
    row.textContent = line.text
    list.appendChild(row)
    line.el = row
  }
  miniPlayer.lines = lines
  note.textContent = {
    lrc: '노래하며 기록한 가사 시각으로 맞춥니다',
    score: '악보로 추정한 시각이라 조금 어긋날 수 있어요',
    spread: '시간 정보가 없어 곡 길이로 나눈 대략의 위치예요'
  }[timing.method] || ''
  syncMiniLyrics(true)
}

// Lights the line being sung and, unless the reader is looking around, centres it.
function syncMiniLyrics (force) {
  const { audio, lines, el } = miniPlayer
  if (!lines.length || !el) return
  const now = audio.currentTime + 0.15 // a touch early reads better than late
  let active = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time !== null && lines[i].time <= now) active = i
  }
  if (active === miniPlayer.active && force !== true) return
  if (miniPlayer.active >= 0 && lines[miniPlayer.active]) lines[miniPlayer.active].el.classList.remove('now')
  miniPlayer.active = active
  if (active < 0) return
  const row = lines[active].el
  row.classList.add('now')
  if (Date.now() - miniPlayer.touchedAt < 4000) return
  const list = el.querySelector('.mini-lyrics-list')
  const target = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2
  list.scrollTo({ top: Math.max(0, target), behavior: force === true ? 'auto' : 'smooth' })
}

// Drag (or wheel) to read ahead; a click on a line plays from it.
function wireMiniLyrics (list) {
  const touched = () => { miniPlayer.touchedAt = Date.now() }
  list.addEventListener('wheel', touched, { passive: true })
  list.addEventListener('keydown', touched)
  list.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const startY = event.clientY
    const startTop = list.scrollTop
    let moved = false
    list.setPointerCapture(event.pointerId)
    touched()
    const move = (e) => {
      if (Math.abs(e.clientY - startY) > 4) moved = true
      if (moved) {
        list.classList.add('dragging')
        list.scrollTop = startTop - (e.clientY - startY)
        touched()
      }
    }
    const up = (e) => {
      list.removeEventListener('pointermove', move)
      list.classList.remove('dragging')
      if (moved) return
      const row = document.elementFromPoint(e.clientX, e.clientY)
      const line = row && miniPlayer.lines.find((l) => l.el === row.closest('.mini-lyrics-line'))
      if (line && line.time !== null) {
        miniPlayer.audio.currentTime = Math.max(0, line.time - 0.3)
        miniPlayer.touchedAt = 0 // follow the song again from here
        if (miniPlayer.audio.paused) playMini()
      }
    }
    list.addEventListener('pointermove', move)
    list.addEventListener('pointerup', up, { once: true })
    list.addEventListener('pointercancel', () => list.removeEventListener('pointermove', move), { once: true })
  })
}

function wireMiniPlayer () {
  const button = $('playAll')
  if (button) button.onclick = openMiniPlayer
}
wireMiniPlayer()
