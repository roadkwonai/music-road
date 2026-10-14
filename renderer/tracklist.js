'use strict'
// ---------------------------------------------------------------------------
// The tracklist on the video: the playlist's songs in a box, the one playing now
// highlighted. Placed and styled in the editor (editor.js) like the spectrum.
//
// The same drawTracklistBox() paints the preview and the render, so the two match.
// The render does not draw it per frame: the box only changes when a song changes,
// so one picture per song is written (tracklistOverlays) and handed to ffmpeg as
// timed overlays — the same path as pictures placed in the editor.
//
// Settings live in studio.video.tracklist; cx, cy are the box's centre and w, h its
// size, as shares of the frame.
// ---------------------------------------------------------------------------

const TRACKLIST_DEFAULTS = Object.freeze({
  visible: false,
  cx: 0.17, cy: 0.33, w: 0.25, h: 0.46,
  title: 'TRACKLIST',
  color: '#ffffff',
  accent: '#7c5cff',
  bg: 0 // the box's own dark backing, 0–1
})
const TRACKLIST_MAX_ROWS = 12
const TRACKLIST_MIN_ROWS = 7

function tracklistStyle () {
  return { ...TRACKLIST_DEFAULTS, ...(studio.video.tracklist || {}) }
}

// The songs and when each starts, in seconds of the playlist.
function tracklistChapters () {
  if (studio.cycle && Array.isArray(studio.cycle.chapters) && studio.cycle.chapters.length) return studio.cycle.chapters
  return (studio.titles || []).map((title, i) => ({ title, start: i, seconds: 1 }))
}

function chapterAt (chapters, seconds) {
  let at = 0
  chapters.forEach((chapter, i) => { if (seconds >= chapter.start) at = i })
  return at
}

const pad2 = (n) => String(n).padStart(2, '0')
// hexAlpha() and roundRect() come from spectrum-renderer.js.

// Cut a title to fit, with an ellipsis.
function fitText (ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(text.slice(0, mid) + '…').width <= width) lo = mid
    else hi = mid - 1
  }
  return lo ? text.slice(0, lo) + '…' : ''
}

// Paints the box at box = {x, y, w, h} in pixels. With more songs than fit, the list
// scrolls so the current one stays in view.
function drawTracklistBox (ctx, box, chapters, current, style) {
  if (!chapters.length || box.w < 8 || box.h < 8) return
  const rows = Math.min(chapters.length, TRACKLIST_MAX_ROWS)
  // Rows keep a steady height: a short list sits at the top instead of stretching.
  const rowH = box.h / (Math.max(rows, TRACKLIST_MIN_ROWS) + 1.6)
  const font = Math.max(6, Math.min(rowH * 0.5, box.w * 0.07))
  const pad = Math.max(4, rowH * 0.3)
  ctx.save()
  if (style.bg > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, style.bg)})`
    ctx.beginPath()
    roundRect(ctx, box.x, box.y, box.w, box.h, Math.min(16, rowH * 0.4))
    ctx.fill()
  }
  ctx.textBaseline = 'middle'
  const family = '"Pretendard", "Malgun Gothic", "Segoe UI", sans-serif'
  // heading
  const titleFont = font * 0.9
  ctx.font = `700 ${titleFont}px ${family}`
  ctx.fillStyle = style.color
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${titleFont * 0.22}px`
  ctx.fillText(fitText(ctx, String(style.title || ''), box.w - pad * 2), box.x + pad, box.y + rowH * 0.6)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
  // which rows show
  let first = 0
  if (chapters.length > rows) first = Math.max(0, Math.min(chapters.length - rows, current - Math.floor(rows / 2)))
  const top = box.y + rowH * 1.4
  for (let r = 0; r < rows; r++) {
    const i = first + r
    const y = top + r * rowH
    const now = i === current
    if (now) {
      ctx.fillStyle = hexAlpha(style.accent, 0.35)
      ctx.beginPath()
      roundRect(ctx, box.x + pad * 0.4, y + rowH * 0.08, box.w - pad * 0.8, rowH * 0.84, rowH * 0.18)
      ctx.fill()
    }
    const mid = y + rowH / 2
    ctx.font = `${now ? 700 : 500} ${font * 0.82}px ${family}`
    ctx.fillStyle = hexAlpha(style.color, now ? 0.95 : 0.5)
    const num = pad2(i + 1)
    ctx.fillText(num, box.x + pad, mid)
    const numW = ctx.measureText('00').width + font * 0.6
    ctx.font = `${now ? 700 : 400} ${font}px ${family}`
    ctx.fillStyle = hexAlpha(style.color, now ? 1 : 0.82)
    ctx.fillText(fitText(ctx, String(chapters[i].title || ''), box.w - pad * 2 - numW), box.x + pad + numW, mid)
  }
  ctx.restore()
}

// The preview: drawn over the pictures and spectrum, as the render stacks it.
function drawTracklist (ctx, seconds, rc) {
  const style = tracklistStyle()
  if (!style.visible) return
  let chapters = tracklistChapters()
  // Nothing prepared yet: sample rows in the editor, so the box can still be placed.
  if (!chapters.length && typeof ed !== 'undefined' && ed.open) {
    chapters = [1, 2, 3, 4, 5].map((n) => ({ title: tr(`곡 제목 ${n}`), start: n - 1, seconds: 1 }))
  }
  const box = { x: (style.cx - style.w / 2) * rc.width, y: (style.cy - style.h / 2) * rc.height,
    w: style.w * rc.width, h: style.h * rc.height }
  drawTracklistBox(ctx, box, chapters, chapterAt(chapters, seconds), style)
}

// The render: one picture per song at the video's own size, written to disk and
// returned as timed overlays (electron/video.js overlayBox/overlayWhen). `cycle` makes
// a looped or repeated video highlight the right song on every pass.
async function tracklistOverlays (outWidth, outHeight) {
  const style = tracklistStyle()
  const chapters = tracklistChapters()
  if (!style.visible || !studio.cycle || !chapters.length) return []
  const even = (n) => Math.max(2, Math.round(n / 2) * 2)
  const W = even(style.w * outWidth)
  const H = even(style.h * outHeight)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const cycleSeconds = studio.cycle.frameCount / studio.cycle.fps
  const out = []
  for (let i = 0; i < chapters.length; i++) {
    ctx.clearRect(0, 0, W, H)
    drawTracklistBox(ctx, { x: 0, y: 0, w: W, h: H }, chapters, i, style)
    const saved = await window.yue.writeTracklistImage(i, canvas.toDataURL('image/png'), i === 0)
    if (!saved || !saved.ok) throw new Error((saved && saved.message) || '트랙리스트 그림을 만들지 못했습니다.')
    const end = i + 1 < chapters.length ? chapters[i + 1].start : cycleSeconds
    out.push({ path: saved.path, name: 'tracklist', x: style.cx, y: style.cy, w: style.w, ar: H / W,
      opacity: 1, start: chapters[i].start, end, cycle: cycleSeconds })
  }
  return out
}
