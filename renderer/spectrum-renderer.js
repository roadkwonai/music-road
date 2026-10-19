'use strict'
// ── shared spectrum renderer ─────────────────────────────────────────────────
// The only code that draws the spectrum. The preview calls it on a small canvas; the
// final render calls it on a full-size one, frame by frame. Every position and size
// comes from normalised 0–1 coordinates times the canvas size, and every value from
// the per-frame cache, so a paused preview frame and the same frame of the MP4 have
// the same bars, gaps, colours and glow (스펙트럼 WYSIWYG 지시서 §7).
// Nothing here reads a clock: time enters only as frameIndex / fps.

const SPECTRUM_DEFAULTS = Object.freeze({
  visible: true,
  kind: 'bars', // bars | mirror | line | circle | cd
  symmetric: true, // kept for settings saved before `layout`
  layout: null, // where the low end sits: 'left' | 'center' (mirrored) | 'right'
  barCount: 64, // an analysis setting: changing it rebuilds the cache
  position: 'bottom', // bottom | center | free (placed by hand in the editor: cx, cy)
  cx: null, // centre of the spectrum in 0–1 frame coordinates, with position 'free'
  cy: null,
  size: 0.3, // height of the spectrum as a share of the frame
  width: 0.82, // width as a share of the frame
  color1: '#7c5cff',
  color2: '#ff5c9d',
  glow: 0.5,
  gain: 1, // 진폭: how tall the bars move (×), applied when drawing — no re-analysis
  dim: 0.25, // darkens a background image or video under the spectrum
  cover: null // cover pixels live in rc.coverImage; this keeps saved styles serialisable
})

// Time → frame, the same formula as electron/spectrum-analysis.js (§5.3); a unit
// test holds the two together.
const frameAt = (seconds, fps) => Math.max(0, Math.floor(seconds * fps + 1e-7))

const placedByHand = (style) => style.position === 'free' && Number.isFinite(style.cx) && Number.isFinite(style.cy)

// Where the spectrum sits, in 0–1 frame coordinates.
function spectrumBox (style) {
  const width = style.width
  const height = style.size
  if (placedByHand(style)) return { x: style.cx - width / 2, y: style.cy - height / 2, width, height }
  const x = (1 - width) / 2
  const y = style.position === 'center' ? 0.5 - height / 2 : 0.93 - height
  return { x, y, width, height }
}

// The circle's centre, in pixels.
function circleCentre (style, w, h) {
  if (placedByHand(style)) return { cx: style.cx * w, cy: style.cy * h }
  return { cx: w / 2, cy: style.position === 'center' ? h / 2 : 0.58 * h }
}

// The CD shares the circular spectrum's placement. `reach` includes its largest
// possible reactive ring, pulse, and glow so an export band cannot crop it.
function cdGeometry (style, w, h) {
  const { cx, cy } = circleCentre(style, w, h)
  const radius = style.size * h / 2
  const ring = h * 0.024
  const pulse = h * 0.014
  const stroke = Math.max(1, h * 0.005) / 2
  const glow = style.glow > 0 ? style.glow * 0.03 * h * 1.6 : 0
  return { cx, cy, radius, reach: radius + ring + pulse + stroke + glow + h * 0.012 + 4 }
}

// Symmetric shapes put the low end in the middle and spread outwards. The full
// spectrum is folded to half as many bars (the louder of each pair) and mirrored, so
// the bar count on screen stays the same and nothing is dropped.
// Where the low end sits. Settings from before 0.75 only say whether it was symmetric.
function spectrumLayout (style) {
  if (['left', 'center', 'right'].includes(style.layout)) return style.layout
  return style.symmetric ? 'center' : 'left'
}

// left: lows → highs from left to right; right: the same mirrored, lows on the right;
// center: as described above. true/false are the old symmetric flag.
function arrange (values, layout) {
  const mode = layout === true ? 'center' : layout === false ? 'left' : layout
  if (mode === 'right') return Array.from(values).reverse()
  if (mode !== 'center') return Array.from(values)
  const half = []
  for (let i = 0; i + 1 < values.length; i += 2) half.push(Math.max(values[i], values[i + 1]))
  return [...half.slice().reverse(), ...half]
}

function drawBackdrop (ctx, style, background, rc) {
  const { width: w, height: h } = rc
  if (!background || background.kind === 'none') {
    // No picture: a deep gradient with a soft glow behind the spectrum.
    const base = ctx.createLinearGradient(0, 0, 0, h)
    base.addColorStop(0, '#0d0f1a')
    base.addColorStop(1, '#171027')
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    const box = spectrumBox(style)
    const gx = (box.x + box.width / 2) * w
    const gy = (box.y + box.height / 2) * h
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 0.6 * w)
    glow.addColorStop(0, hexAlpha(style.color1, 0.18))
    glow.addColorStop(1, hexAlpha(style.color1, 0))
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)
  } else if (style.dim > 0) {
    // The picture itself is composited underneath (CSS in the preview, ffmpeg in the
    // render); only the darkening is drawn here.
    // 0 leaves the picture as it is; 1 blacks it out completely.
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, style.dim)})`
    ctx.fillRect(0, 0, w, h)
  }
}

function hexAlpha (hex, alpha) {
  const value = String(hex || '#ffffff').replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value.padEnd(6, '0')
  const n = parseInt(full.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

// 진폭. Bar heights are levels on a decibel scale, so most music already sits in the
// upper half and plain multiplying only pins every bar to the top. Below 1 the bars
// are scaled down; above 1 the quiet end of the scale is cut away (as if the floor
// were raised), so quiet moments drop and loud ones still reach the top — the bars
// move further instead of standing still at full height.
function amplitude (gain) {
  const a = Number.isFinite(gain) && gain > 0 ? gain : 1
  if (a <= 1) return (v) => Math.max(0, Math.min(1, v * a))
  const floor = 1 - 1 / a
  return (v) => Math.max(0, Math.min(1, (v - floor) / (1 - floor)))
}

function drawSpectrum (ctx, values, style, rc) {
  if (!style.visible || (!values && style.kind !== 'cd')) return
  const { width: w, height: h } = rc
  const box = spectrumBox(style)
  const px = box.x * w
  const py = box.y * h
  const pw = box.width * w
  const ph = box.height * h
  const bars = arrange(values || [], spectrumLayout(style)).map(amplitude(style.gain))
  const count = bars.length
  ctx.save()
  if (style.glow > 0) {
    ctx.shadowColor = hexAlpha(style.color2, 0.85)
    ctx.shadowBlur = style.glow * 0.03 * h
  }
  const vertical = ctx.createLinearGradient(0, py + ph, 0, py)
  vertical.addColorStop(0, style.color1)
  vertical.addColorStop(1, style.color2)

  if (style.kind === 'cd') {
    drawCd(ctx, bars, style, rc)
    ctx.restore()
    return
  }

  if (style.kind === 'circle') {
    const { cx, cy } = circleCentre(style, w, h)
    const radius = 0.13 * h
    const reach = style.size * h * 0.55
    const stroke = Math.max(1, ((2 * Math.PI * radius) / count) * 0.55)
    const radial = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius + reach)
    radial.addColorStop(0, style.color1)
    radial.addColorStop(1, style.color2)
    ctx.strokeStyle = radial
    ctx.lineWidth = stroke
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (i / count) * Math.PI * 2
      const length = Math.max(0.004 * h, bars[i] * reach)
      ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
      ctx.lineTo(cx + Math.cos(angle) * (radius + length), cy + Math.sin(angle) * (radius + length))
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.lineWidth = Math.max(1, 0.004 * h)
    ctx.strokeStyle = hexAlpha(style.color1, 0.6)
    ctx.beginPath()
    ctx.arc(cx, cy, radius - 0.01 * h, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    return
  }

  const slot = pw / count
  if (style.kind === 'line') {
    const baseline = style.position === 'center' ? py + ph / 2 : py + ph
    const lift = style.position === 'center' ? ph / 2 : ph
    const points = bars.map((v, i) => [px + slot * (i + 0.5), baseline - Math.max(0, v) * lift])
    const trace = () => {
      ctx.moveTo(points[0][0], points[0][1])
      for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1]
        const [x1, y1] = points[i]
        ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      }
      ctx.lineTo(points[points.length - 1][0], points[points.length - 1][1])
    }
    ctx.beginPath()
    ctx.moveTo(px, baseline)
    ctx.lineTo(points[0][0], points[0][1])
    trace()
    ctx.lineTo(px + pw, baseline)
    ctx.closePath()
    const fill = ctx.createLinearGradient(0, baseline - lift, 0, baseline)
    fill.addColorStop(0, hexAlpha(style.color2, 0.45))
    fill.addColorStop(1, hexAlpha(style.color1, 0.05))
    ctx.fillStyle = fill
    ctx.fill()
    ctx.beginPath()
    trace()
    ctx.strokeStyle = vertical
    ctx.lineWidth = Math.max(1, 0.005 * h)
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.restore()
    return
  }

  // bars and mirror bars
  const barWidth = slot * 0.72
  const corner = barWidth * 0.4
  const floor = 0.004 * h
  ctx.fillStyle = vertical
  ctx.beginPath()
  for (let i = 0; i < count; i++) {
    const x = px + i * slot + (slot - barWidth) / 2
    if (style.kind === 'mirror') {
      const length = Math.max(floor, bars[i] * ph)
      roundRect(ctx, x, py + ph / 2 - length / 2, barWidth, length, corner)
    } else {
      const length = Math.max(floor, bars[i] * ph)
      roundRect(ctx, x, py + ph - length, barWidth, length, corner)
    }
  }
  ctx.fill()
  ctx.restore()
}

function coverSize (image) {
  const width = Number(image && (image.naturalWidth || image.videoWidth || image.width))
  const height = Number(image && (image.naturalHeight || image.videoHeight || image.height))
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? { width, height } : null
}

function clipCdFace (ctx, radius, hub) {
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.arc(0, 0, hub, 0, Math.PI * 2)
  ctx.clip('evenodd')
}

function drawCdCover (ctx, image, radius, hub, angle) {
  const size = coverSize(image)
  if (!size) return false
  const side = Math.min(size.width, size.height)
  try {
    ctx.save()
    clipCdFace(ctx, radius, hub)
    ctx.rotate(angle)
    ctx.drawImage(image, (size.width - side) / 2, (size.height - side) / 2, side, side, -radius, -radius, radius * 2, radius * 2)
    ctx.restore()
    return true
  } catch (_) {
    ctx.restore()
    return false
  }
}

function drawCdFallback (ctx, radius, hub, angle) {
  const metal = ctx.createLinearGradient(-radius, -radius, radius, radius)
  metal.addColorStop(0, '#252b38')
  metal.addColorStop(0.24, '#aeb9c9')
  metal.addColorStop(0.48, '#414b5d')
  metal.addColorStop(0.72, '#e6edf5')
  metal.addColorStop(1, '#1d2330')
  ctx.save()
  clipCdFace(ctx, radius, hub)
  ctx.fillStyle = metal
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
  ctx.rotate(angle)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = Math.max(1, radius * 0.025)
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.68, -0.8, 0.3)
  ctx.stroke()
  ctx.restore()
}

function cdAngle (rc) {
  const fps = Number.isFinite(rc.fps) && rc.fps > 0 ? rc.fps : 30
  const frame = Number.isFinite(rc.frameIndex) ? rc.frameIndex : 0
  const cycleFrames = Number.isFinite(rc.cycleFrames) && rc.cycleFrames > 0 ? rc.cycleFrames : null
  const turns = cycleFrames ? Math.max(1, Math.round((cycleFrames / fps) / 12)) : null
  return cycleFrames ? (frame / cycleFrames) * turns * Math.PI * 2 : ((frame / fps) / 12) * Math.PI * 2
}

function drawCd (ctx, bars, style, rc) {
  const { cx, cy, radius } = cdGeometry(style, rc.width, rc.height)
  const angle = cdAngle(rc)
  const energy = bars.length ? bars.reduce((sum, value) => sum + value, 0) / bars.length : 0
  const ringRadius = radius + rc.height * (0.024 + energy * 0.014)
  const pulse = rc.height * (0.004 + energy * 0.01)
  const hub = Math.max(radius * 0.105, rc.height * 0.012)

  ctx.save()
  ctx.translate(cx, cy)
  if (!drawCdCover(ctx, rc.coverImage, radius, hub, angle) && style.cover == null) drawCdFallback(ctx, radius, hub, angle)
  ctx.shadowColor = hexAlpha(style.color2, 0.9)
  ctx.shadowBlur = style.glow * 0.03 * rc.height
  ctx.strokeStyle = hexAlpha(style.color2, 0.8)
  ctx.lineWidth = Math.max(1, rc.height * 0.005)
  ctx.beginPath()
  ctx.arc(0, 0, ringRadius + pulse, 0, Math.PI * 2)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(245, 249, 255, 0.76)'
  ctx.lineWidth = Math.max(1, rc.height * 0.003)
  ctx.beginPath()
  ctx.arc(0, 0, radius - ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(230, 238, 250, 0.9)'
  ctx.lineWidth = Math.max(1, hub * 0.22)
  ctx.beginPath()
  ctx.arc(0, 0, hub * 1.34, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function roundRect (ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

// One whole frame: backdrop (or the dimming over a picture), then the spectrum.
function renderFrame (ctx, values, style, background, rc) {
  ctx.clearRect(0, 0, rc.width, rc.height)
  drawBackdrop(ctx, style, background, rc)
  drawSpectrum(ctx, values, style, rc)
}

// The horizontal strip, in pixels, that the spectrum can ever paint into — its tallest
// bars plus the glow around them. The render sends only this strip per frame and
// ffmpeg places it back at the same height, over the unchanging layer.
function spectrumBand (style, rc) {
  const h = rc.height
  const margin = Math.ceil((style.glow > 0 ? style.glow * 0.03 * h * 1.6 : 0) + 0.012 * h + 4)
  let top
  let bottom
  if (style.kind === 'circle') {
    const { cy } = circleCentre(style, rc.width, h)
    const reach = 0.13 * h + style.size * h * 0.55 + 0.004 * h
    top = cy - reach
    bottom = cy + reach
  } else if (style.kind === 'cd') {
    const { cy, reach } = cdGeometry(style, rc.width, h)
    top = cy - reach
    bottom = cy + reach
  } else {
    const box = spectrumBox(style)
    top = box.y * h
    bottom = (box.y + box.height) * h
  }
  const y = Math.max(0, Math.floor(top - margin))
  return { y, height: Math.min(h, Math.ceil(bottom + margin)) - y }
}

// The two render layers, drawn with the functions above so they compose to exactly
// what renderFrame paints in the preview.
function drawLayer (ctx, style, background, rc) {
  ctx.clearRect(0, 0, rc.width, rc.height)
  drawBackdrop(ctx, style, background, rc)
}

function drawBand (ctx, values, style, rc, bandY) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.setTransform(1, 0, 0, 1, 0, -bandY)
  drawSpectrum(ctx, values, style, rc)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

if (typeof module !== 'undefined') {
  module.exports = { SPECTRUM_DEFAULTS, frameAt, spectrumBox, circleCentre, cdGeometry, spectrumBand, arrange, spectrumLayout, amplitude, renderFrame,
    drawSpectrum, drawBackdrop, drawLayer, drawBand, cdAngle }
}
