'use strict'
// ── 편집 모드 ────────────────────────────────────────────────────────────────────
// A full-window editor for the playlist video. The studio's own preview (the stage
// with its background picture/clip and canvas) is moved in here while it is open, so
// what is placed here is drawn by the very code the render uses:
//   centre  — the stage, bigger; click to pick the spectrum or a picture, drag to move,
//             corners to resize, wheel to zoom, arrows to nudge, centre guides snap
//   left    — assets: pictures brought in (copied to the app folder); drag one onto the
//             stage, or double-click it, to place it
//   right   — the picked item's numbers (position, size, opacity, when it shows)
//   bottom  — the timeline: songs, backgrounds, one lane per picture (drag a bar to
//             move it in time, its ends to trim it), and the playhead
// Placement is kept in studio.video (spectrum.position 'free' + cx/cy, overlays) and
// saved with the other video settings.

const ed = {
  open: false,
  sel: null, // { type: 'spectrum' } | { type: 'tracklist' } | { type: 'overlay', id }
  assets: [],
  home: null, // where the stage and transport live in the studio panel
  loop: 0,
  drag: null,
  timeline: null
}

const edEl = (id) => document.getElementById(id)
const clamp01 = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const pct = (v) => Math.round(v * 1000) / 10
const newId = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// ── open / close ──
async function openEditor () {
  if (ed.open) return
  ed.open = true
  const stage = studioEl('vStage')
  const transport = document.querySelector('.studio .v-transport')
  // The studio's "영상 제작 옵션" (under the assets) and equalizer (under the
  // inspector) come along too: the same controls and the same settings the render uses.
  const options = document.querySelector('.studio .v-section[data-fold="options"]')
  const eq = document.querySelector('.studio .v-section[data-fold="eq"]')
  const home = (el) => el ? [el.parentNode, el.nextSibling] : null
  ed.home = { stage: home(stage), transport: home(transport), options: home(options), eq: home(eq) }
  edEl('edStageSlot').appendChild(stage)
  edEl('edTransportSlot').appendChild(transport)
  if (options) edEl('edOptionsSlot').appendChild(options)
  if (eq) edEl('edEqSlot').appendChild(eq)
  stage.appendChild(edEl('edLayer'))
  edEl('editor').classList.remove('hidden')
  document.body.classList.add('editing')
  fitStage()
  await loadAssets()
  editorRefresh()
  ed.loop = requestAnimationFrame(editorTick)
}

function closeEditor () {
  if (!ed.open) return
  ed.open = false
  cancelAnimationFrame(ed.loop)
  if (document.fullscreenElement || ed.full) setEditorFullScreen(false)
  const stage = studioEl('vStage')
  edEl('edHome').appendChild(edEl('edLayer'))
  stage.style.width = ''
  const [sp, sn] = ed.home.stage
  sp.insertBefore(stage, sn)
  const [tp, tn] = ed.home.transport
  tp.insertBefore(document.querySelector('#editor .v-transport'), tn)
  // Back in the order they came out of: the equalizer sits after the options.
  for (const [key, slot] of [['eq', 'edEqSlot'], ['options', 'edOptionsSlot']]) {
    if (!ed.home[key]) continue
    const [parent, next] = ed.home[key]
    parent.insertBefore(document.querySelector(`#${slot} .v-section`), next)
  }
  edEl('editor').classList.add('hidden')
  document.body.classList.remove('editing')
  ed.sel = null
  redraw()
}

async function setEditorFullScreen (on) {
  const result = await window.yue.setFullScreen(on)
  ed.full = Boolean(result && result.full)
  edEl('edFull').textContent = ed.full ? '전체화면 끝내기' : '전체화면'
  setTimeout(fitStage, 300)
}

// The stage as large as the centre allows, at 16:9.
function fitStage () {
  if (!ed.open) return
  const wrap = edEl('edStageWrap').getBoundingClientRect()
  const width = Math.max(240, Math.min(wrap.width - 8, (wrap.height - 8) * 16 / 9))
  studioEl('vStage').style.width = `${Math.floor(width)}px`
  renderHandles()
}

// Called by studio.js when the preview is prepared or the songs change.
function editorRefresh () {
  if (!ed.open) return
  edEl('edInfo').textContent = studio.cycle
    ? `${studio.titles.length}곡 · ${clock(duration())}`
    : '곡을 고르고 "미리보기 준비"를 누르면 타임라인이 나옵니다'
  renderAssets()
  renderInspector()
  renderTimeline()
  renderHandles()
}

function editorRendered () {}

function editorTick () {
  if (!ed.open) return
  const head = edEl('edPlayhead')
  if (head && studio.cycle) head.style.left = `${(clockTime() / duration()) * 100}%`
  ed.loop = requestAnimationFrame(editorTick)
}

// ── what can be picked ──
const spectrumOn = () => spectrumStyle().visible
const overlays = () => studio.video.overlays || (studio.video.overlays = [])
const overlayById = (id) => overlays().find((o) => o.id === id)

// The spectrum's box in 0–1 frame coordinates (a circle: the square it can reach).
function spectrumRect () {
  const style = spectrumStyle()
  if (style.kind === 'circle') {
    const { cx, cy } = circleCentre(style, 1, 1)
    const reach = 0.13 + style.size * 0.55
    return { x: cx - reach * 9 / 16, y: cy - reach, w: reach * 2 * 9 / 16, h: reach * 2, circle: true }
  }
  const box = spectrumBox(style)
  return { x: box.x, y: box.y, w: box.width, h: box.height }
}

function overlayRect (o) {
  const h = o.w * o.ar * 16 / 9
  return { x: o.x - o.w / 2, y: o.y - h / 2, w: o.w, h }
}

// The tracklist's box (tracklist.js): centre and size as shares of the frame.
function tracklistRect () {
  const t = tracklistStyle()
  return { x: t.cx - t.w / 2, y: t.cy - t.h / 2, w: t.w, h: t.h }
}
const tracklistOn = () => tracklistStyle().visible

const selRect = () => !ed.sel ? null
  : ed.sel.type === 'spectrum' ? spectrumRect()
    : ed.sel.type === 'tracklist' ? tracklistRect()
      : overlayById(ed.sel.id) ? overlayRect(overlayById(ed.sel.id)) : null

function edSelect (sel) {
  ed.sel = sel
  renderHandles()
  renderInspector()
  renderTimeline()
}

// ── changes ──
function changed ({ timeline = false } = {}) {
  redraw()
  saveVideo()
  renderHandles()
  renderInspector()
  if (timeline) renderTimeline()
}

// The spectrum goes to hand placement the first time it is moved or resized.
function freeSpectrum () {
  const style = spectrumStyle()
  if (style.position === 'free' && Number.isFinite(style.cx)) return
  const r = spectrumRect()
  studio.video.spectrum = { ...studio.video.spectrum, position: 'free', cx: r.x + r.w / 2, cy: r.y + r.h / 2 }
  studioEl('sPosition').value = 'free'
}

function setSpectrum (patch) {
  freeSpectrum()
  studio.video.spectrum = { ...studio.video.spectrum, ...patch }
  studioEl('sPosition').value = studio.video.spectrum.position
  if ('size' in patch) studioEl('sSize').value = studio.video.spectrum.size
  if ('width' in patch) studioEl('sWidth').value = studio.video.spectrum.width
  changed()
}

function setTracklist (patch, opts) {
  studio.video.tracklist = { ...tracklistStyle(), ...patch }
  changed(opts)
}

function setOverlay (id, patch, opts) {
  const o = overlayById(id)
  if (!o) return
  Object.assign(o, patch)
  changed(opts)
}

function moveBy (dx, dy) {
  if (!ed.sel) return
  if (ed.sel.type === 'spectrum') {
    const s = (freeSpectrum(), spectrumStyle())
    setSpectrum({ cx: clamp01(s.cx + dx, -0.5, 1.5), cy: clamp01(s.cy + dy, -0.5, 1.5) })
  } else if (ed.sel.type === 'tracklist') {
    const t = tracklistStyle()
    setTracklist({ cx: clamp01(t.cx + dx, -0.5, 1.5), cy: clamp01(t.cy + dy, -0.5, 1.5) })
  } else {
    const o = overlayById(ed.sel.id)
    if (o) setOverlay(o.id, { x: clamp01(o.x + dx, -0.5, 1.5), y: clamp01(o.y + dy, -0.5, 1.5) })
  }
}

function scaleBy (factor) {
  if (!ed.sel) return
  if (ed.sel.type === 'spectrum') {
    const s = spectrumStyle()
    if (s.kind === 'circle') setSpectrum({ size: clamp01(s.size * factor, 0.03, 0.9) })
    else setSpectrum({ width: clamp01(s.width * factor, 0.05, 1.5), size: clamp01(s.size * factor, 0.03, 0.9) })
  } else if (ed.sel.type === 'tracklist') {
    const t = tracklistStyle()
    setTracklist({ w: clamp01(t.w * factor, 0.08, 1), h: clamp01(t.h * factor, 0.08, 1) })
  } else {
    const o = overlayById(ed.sel.id)
    if (o) setOverlay(o.id, { w: clamp01(o.w * factor, 0.02, 2) })
  }
}

// The tracklist is not removed, only hidden: its place and look are kept.
function showTracklist (visible) {
  setTracklist({ visible }, { timeline: true })
  if (visible) edSelect({ type: 'tracklist' })
  else if (ed.sel && ed.sel.type === 'tracklist') edSelect(null)
  renderAssets()
}

function removeOverlay (id) {
  const list = overlays()
  const at = list.findIndex((o) => o.id === id)
  if (at < 0) return
  list.splice(at, 1)
  if (ed.sel && ed.sel.id === id) ed.sel = null
  changed({ timeline: true })
}

// A picture onto the video: at a point (a drop) or in the middle, the whole video long.
function placeAsset (asset, x = 0.5, y = 0.5) {
  const img = new Image()
  img.onload = () => {
    const ar = img.naturalHeight / img.naturalWidth || 1
    // A quarter of the width, but never taller than half the frame.
    const w = Math.min(0.25, (0.5 * 9 / 16) / ar)
    const o = { id: newId(), path: asset.path, url: asset.url, name: asset.name, x, y, w, ar, opacity: 1, start: 0, end: null }
    overlays().push(o)
    edSelect({ type: 'overlay', id: o.id })
    changed({ timeline: true })
  }
  img.onerror = () => toast('이미지를 읽지 못했습니다.')
  img.src = asset.url
}

// ── the stage: pick, move, resize, zoom ──
function stagePoint (event) {
  const r = studioEl('vStage').getBoundingClientRect()
  return { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height }
}

const inside = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

// What a click means: the item already picked keeps the click while it is under the
// pointer (so a picked picture can be dragged even where the spectrum's box covers it);
// otherwise pictures showing now, newest first, then the tracklist, then the spectrum —
// whose box is mostly empty space above the bars — then pictures hidden at this moment.
function hitTest (p) {
  const current = selRect()
  if (current && inside(p, current)) return ed.sel
  const now = clockTime()
  for (const o of [...overlays()].reverse()) {
    if (overlayShown(o, now) && inside(p, overlayRect(o))) return { type: 'overlay', id: o.id }
  }
  if (tracklistOn() && inside(p, tracklistRect())) return { type: 'tracklist' }
  if (spectrumOn() && inside(p, spectrumRect())) return { type: 'spectrum' }
  for (const o of [...overlays()].reverse()) if (inside(p, overlayRect(o))) return { type: 'overlay', id: o.id }
  return null
}

const SNAP = 0.008
function snapCentre (cx, cy) {
  const gx = Math.abs(cx - 0.5) < SNAP
  const gy = Math.abs(cy - 0.5) < SNAP
  edEl('edGuideX').classList.toggle('hidden', !gx)
  edEl('edGuideY').classList.toggle('hidden', !gy)
  return { cx: gx ? 0.5 : cx, cy: gy ? 0.5 : cy }
}

function wireStage () {
  const layer = edEl('edLayer')
  layer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const p = stagePoint(event)
    const corner = event.target.dataset && event.target.dataset.corner
    if (!corner) {
      const hit = hitTest(p)
      if (!hit) { edSelect(null); return }
      if (!ed.sel || ed.sel.type !== hit.type || ed.sel.id !== hit.id) edSelect(hit)
    }
    event.preventDefault()
    layer.setPointerCapture(event.pointerId)
    const start = selRect()
    const o = ed.sel && ed.sel.type === 'overlay' ? overlayById(ed.sel.id) : null
    ed.drag = { corner, from: p, start, origin: o ? { x: o.x, y: o.y } : null, moved: false }
    if (ed.sel && ed.sel.type === 'spectrum') {
      freeSpectrum()
      const s = spectrumStyle()
      ed.drag.origin = { x: s.cx, y: s.cy }
    } else if (ed.sel && ed.sel.type === 'tracklist') {
      const t = tracklistStyle()
      ed.drag.origin = { x: t.cx, y: t.cy }
    }
  })
  layer.addEventListener('pointermove', (event) => {
    const d = ed.drag
    if (!d || !ed.sel) return
    const p = stagePoint(event)
    d.moved = true
    if (!d.corner) {
      const { cx, cy } = snapCentre(d.origin.x + (p.x - d.from.x), d.origin.y + (p.y - d.from.y))
      if (ed.sel.type === 'spectrum') setSpectrum({ cx, cy })
      else if (ed.sel.type === 'tracklist') setTracklist({ cx, cy })
      else setOverlay(ed.sel.id, { x: cx, y: cy })
      return
    }
    // Resizing: the opposite corner stays where it is.
    const r = d.start
    const fx = d.corner.includes('w') ? r.x + r.w : r.x
    const fy = d.corner.includes('n') ? r.y + r.h : r.y
    if (ed.sel.type === 'spectrum') {
      const s = spectrumStyle()
      if (s.kind === 'circle') {
        const cx = r.x + r.w / 2
        const cy = r.y + r.h / 2
        const reach = Math.max(Math.abs(p.y - cy), Math.abs(p.x - cx) * 16 / 9)
        setSpectrum({ size: clamp01((reach - 0.13) / 0.55, 0.03, 0.9) })
      } else {
        const w = clamp01(Math.abs(p.x - fx), 0.05, 1.5)
        const h = clamp01(Math.abs(p.y - fy), 0.03, 0.9)
        const cx = p.x < fx ? fx - w / 2 : fx + w / 2
        const cy = p.y < fy ? fy - h / 2 : fy + h / 2
        setSpectrum({ width: w, size: h, cx, cy })
      }
    } else if (ed.sel.type === 'tracklist') {
      // Width and height each follow the pointer: the rows grow to fill the box.
      const w = clamp01(Math.abs(p.x - fx), 0.08, 1)
      const h = clamp01(Math.abs(p.y - fy), 0.08, 1)
      setTracklist({ w, h, cx: p.x < fx ? fx - w / 2 : fx + w / 2, cy: p.y < fy ? fy - h / 2 : fy + h / 2 })
    } else {
      const o = overlayById(ed.sel.id)
      const w = clamp01(Math.abs(p.x - fx), 0.02, 2)
      const h = w * o.ar * 16 / 9
      const cx = p.x < fx ? fx - w / 2 : fx + w / 2
      const cy = (d.corner.includes('n') ? fy - h / 2 : fy + h / 2)
      setOverlay(o.id, { w, x: cx, y: cy })
    }
  })
  const end = () => {
    if (ed.drag && ed.drag.moved) renderTimeline()
    ed.drag = null
    edEl('edGuideX').classList.add('hidden')
    edEl('edGuideY').classList.add('hidden')
  }
  layer.addEventListener('pointerup', end)
  layer.addEventListener('pointercancel', end)
  layer.addEventListener('wheel', (event) => {
    if (!ed.sel) {
      const hit = hitTest(stagePoint(event))
      if (!hit) return
      edSelect(hit)
    }
    event.preventDefault()
    scaleBy(event.deltaY < 0 ? 1.05 : 1 / 1.05)
  }, { passive: false })
  // Pictures dragged in from the asset list.
  layer.addEventListener('dragover', (event) => {
    if (event.dataTransfer.types.includes('text/roadmusic-asset')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  })
  layer.addEventListener('drop', (event) => {
    const file = event.dataTransfer.getData('text/roadmusic-asset')
    const asset = ed.assets.find((a) => a.path === file)
    if (!asset) return
    event.preventDefault()
    const p = stagePoint(event)
    placeAsset(asset, p.x, p.y)
  })
}

function renderHandles () {
  if (!ed.open) return
  const box = edEl('edBox')
  const r = selRect()
  box.classList.toggle('hidden', !r)
  if (!r) return
  box.style.left = `${r.x * 100}%`
  box.style.top = `${r.y * 100}%`
  box.style.width = `${r.w * 100}%`
  box.style.height = `${r.h * 100}%`
  box.classList.toggle('spectrum', ed.sel.type === 'spectrum')
  box.classList.toggle('tracklist', ed.sel.type === 'tracklist')
}

// ── keys ──
function wireKeys () {
  document.addEventListener('keydown', (event) => {
    if (!ed.open) return
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)
    if (event.key === 'Escape') {
      if (ed.sel) edSelect(null)
      else closeEditor()
      return
    }
    if (typing) return
    const step = event.shiftKey ? 0.02 : 0.002
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[event.key] && ed.sel) {
      event.preventDefault()
      moveBy(...moves[event.key])
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && ed.sel && ed.sel.type === 'overlay') {
      event.preventDefault()
      removeOverlay(ed.sel.id)
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && ed.sel && ed.sel.type === 'tracklist') {
      event.preventDefault()
      showTracklist(false)
    } else if (event.key === ' ') {
      event.preventDefault()
      studio.clock.playing ? pausePreview() : playPreview()
    } else if ((event.key === '+' || event.key === '=') && ed.sel) scaleBy(1.05)
    else if (event.key === '-' && ed.sel) scaleBy(1 / 1.05)
  })
}

// ── assets ──
async function loadAssets () {
  const result = await window.yue.listAssets()
  ed.assets = result.ok ? result.assets : []
}

// The tracklist sits at the top of the assets: always there, shown or hidden.
function tracklistAsset () {
  const on = tracklistOn()
  const item = document.createElement('div')
  item.className = `ed-asset ed-asset-tracklist${on ? ' on' : ''}`
  item.title = on ? '영상에 보이는 중 · 누르면 고릅니다' : '두 번 누르거나 "넣기"를 누르면 영상에 나타납니다'
  item.innerHTML = '<div class="ed-tl-icon"><i></i><i></i><i></i></div><span>트랙리스트</span><button class="ghost small ed-asset-toggle"></button>'
  const toggle = item.querySelector('.ed-asset-toggle')
  toggle.textContent = on ? '숨기기' : '넣기'
  toggle.onclick = (event) => {
    event.stopPropagation()
    showTracklist(!on)
  }
  item.onclick = () => { if (tracklistOn()) edSelect({ type: 'tracklist' }) }
  item.ondblclick = () => { if (!tracklistOn()) showTracklist(true) }
  return item
}

function renderAssets () {
  const list = edEl('edAssetList')
  list.innerHTML = ''
  list.appendChild(tracklistAsset())
  if (!ed.assets.length) {
    list.insertAdjacentHTML('beforeend', '<p class="muted tiny">불러온 이미지가 없습니다.</p>')
    return
  }
  for (const asset of ed.assets) {
    const item = document.createElement('div')
    item.className = 'ed-asset'
    item.draggable = true
    item.title = `${asset.name}\n미리보기로 끌어다 놓거나 두 번 누르면 가운데에 붙습니다.`
    item.innerHTML = '<img alt=""><span></span><button class="ed-asset-x" title="에셋에서 빼기 (붙인 곳에서도 빠집니다)">×</button>'
    item.querySelector('img').src = asset.url
    item.querySelector('span').textContent = asset.name
    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/roadmusic-asset', asset.path)
      event.dataTransfer.effectAllowed = 'copy'
    })
    item.addEventListener('dblclick', () => placeAsset(asset))
    item.querySelector('.ed-asset-x').onclick = async (event) => {
      event.stopPropagation()
      const used = overlays().filter((o) => o.path === asset.path).length
      if (!confirm(used ? `"${asset.name}"을(를) 에셋에서 뺄까요?\n영상에 붙인 ${used}곳에서도 빠집니다. (원본 파일은 그대로)`
        : `"${asset.name}"을(를) 에셋에서 뺄까요? (원본 파일은 그대로)`)) return
      const result = await window.yue.removeAsset(asset.path)
      if (!result.ok) return toast(result.message)
      ed.assets = result.assets
      studio.video.overlays = overlays().filter((o) => o.path !== asset.path)
      if (ed.sel && ed.sel.type === 'overlay' && !overlayById(ed.sel.id)) ed.sel = null
      changed({ timeline: true })
      renderAssets()
    }
    list.appendChild(item)
  }
}

async function importAssets () {
  const result = await window.yue.importAssets()
  if (!result.ok) return result.canceled ? null : toast(result.message || '불러오지 못했습니다.')
  ed.assets = result.assets
  renderAssets()
  toast(`이미지 ${result.added.length}개를 불러왔습니다. 미리보기로 끌어다 놓으세요.`)
}

// ── inspector ──
function numberField (label, value, onInput, { step = 0.1, min, max, suffix = '%' } = {}) {
  const row = document.createElement('label')
  row.className = 'ed-field'
  row.innerHTML = `<span></span><input type="number"><em></em>`
  row.querySelector('span').textContent = label
  row.querySelector('em').textContent = suffix
  const input = row.querySelector('input')
  input.step = String(step)
  if (min !== undefined) input.min = String(min)
  if (max !== undefined) input.max = String(max)
  input.value = String(value)
  input.addEventListener('change', () => {
    const v = Number(input.value)
    if (Number.isFinite(v)) onInput(v)
  })
  return row
}

function buttonRow (buttons) {
  const row = document.createElement('div')
  row.className = 'ed-buttons'
  for (const [text, fn, cls] of buttons) {
    const b = document.createElement('button')
    b.className = `ghost small ${cls || ''}`
    b.textContent = text
    b.onclick = fn
    row.appendChild(b)
  }
  return row
}

function renderInspector () {
  const box = edEl('edProps')
  box.innerHTML = ''
  const note = (text) => {
    const p = document.createElement('p')
    p.className = 'muted tiny'
    p.textContent = text
    box.appendChild(p)
  }
  if (!ed.sel) {
    note('미리보기에서 스펙트럼, 트랙리스트나 이미지를 눌러 고르세요. 끌어서 옮기고, 모서리로 크기를 바꾸고, 휠로 확대·축소합니다. 화살표 키로 미세하게 움직입니다(Shift: 크게).')
    box.appendChild(buttonRow([
      ['스펙트럼 고르기', () => edSelect({ type: 'spectrum' })],
      tracklistOn() ? ['트랙리스트 고르기', () => edSelect({ type: 'tracklist' })] : ['트랙리스트 넣기', () => showTracklist(true)]
    ]))
    if (overlays().length) {
      note('붙인 이미지')
      for (const o of overlays()) box.appendChild(buttonRow([[o.name || '이미지', () => edSelect({ type: 'overlay', id: o.id })]]))
    }
    return
  }
  if (ed.sel.type === 'spectrum') {
    const s = spectrumStyle()
    const r = spectrumRect()
    const title = document.createElement('h4')
    title.textContent = '스펙트럼'
    box.appendChild(title)
    if (!s.visible) note('스펙트럼이 꺼져 있습니다. 오른쪽 패널의 스펙트럼 스위치로 켜세요.')
    box.appendChild(numberField('가로 위치', pct(r.x + r.w / 2), (v) => setSpectrum({ cx: v / 100 })))
    box.appendChild(numberField('세로 위치', pct(r.y + r.h / 2), (v) => setSpectrum({ cy: v / 100 })))
    if (s.kind !== 'circle') box.appendChild(numberField('너비', pct(s.width), (v) => setSpectrum({ width: clamp01(v / 100, 0.05, 1.5) })))
    box.appendChild(numberField(s.kind === 'circle' ? '크기' : '높이', pct(s.size), (v) => setSpectrum({ size: clamp01(v / 100, 0.03, 0.9) })))
    box.appendChild(buttonRow([
      ['가로 가운데', () => setSpectrum({ cx: 0.5 })],
      ['세로 가운데', () => setSpectrum({ cy: 0.5 })]
    ]))
    box.appendChild(buttonRow([['하단 기본 위치로', () => {
      studio.video.spectrum = { ...studio.video.spectrum, position: 'bottom', cx: null, cy: null }
      studioEl('sPosition').value = 'bottom'
      changed()
    }]]))
    spectrumLook(box, s)
    return
  }
  if (ed.sel.type === 'tracklist') {
    tracklistInspector(box, note)
    return
  }
  const o = overlayById(ed.sel.id)
  if (!o) return
  const title = document.createElement('h4')
  title.textContent = o.name || '이미지'
  box.appendChild(title)
  box.appendChild(numberField('가로 위치', pct(o.x), (v) => setOverlay(o.id, { x: v / 100 })))
  box.appendChild(numberField('세로 위치', pct(o.y), (v) => setOverlay(o.id, { y: v / 100 })))
  box.appendChild(numberField('크기(너비)', pct(o.w), (v) => setOverlay(o.id, { w: clamp01(v / 100, 0.02, 2) })))
  box.appendChild(numberField('투명도', Math.round((o.opacity == null ? 1 : o.opacity) * 100),
    (v) => setOverlay(o.id, { opacity: clamp01(v / 100) }), { step: 1, min: 0, max: 100 }))
  const total = studio.cycle ? duration() : null
  box.appendChild(numberField('시작', Math.round((o.start || 0) * 10) / 10, (v) => {
    const start = Math.max(0, total ? Math.min(v, total - 0.5) : v)
    setOverlay(o.id, { start, end: o.end != null && o.end <= start ? null : o.end }, { timeline: true })
  }, { step: 0.5, min: 0, suffix: '초' }))
  const endRow = numberField('끝', o.end == null ? '' : Math.round(o.end * 10) / 10, (v) => {
    setOverlay(o.id, { end: v > (o.start || 0) ? v : null }, { timeline: true })
  }, { step: 0.5, min: 0, suffix: '초' })
  endRow.querySelector('input').placeholder = '끝까지'
  box.appendChild(endRow)
  box.appendChild(buttonRow([
    ['지금부터', () => setOverlay(o.id, { start: Math.round(clockTime() * 10) / 10 }, { timeline: true })],
    ['지금까지', () => setOverlay(o.id, { end: Math.max((o.start || 0) + 0.5, Math.round(clockTime() * 10) / 10) }, { timeline: true })],
    ['처음~끝', () => setOverlay(o.id, { start: 0, end: null }, { timeline: true })]
  ]))
  box.appendChild(buttonRow([
    ['가운데로', () => setOverlay(o.id, { x: 0.5, y: 0.5 })],
    ['앞으로', () => { const l = overlays(); const i = l.indexOf(o); if (i < l.length - 1) { l.splice(i, 1); l.splice(i + 1, 0, o); changed({ timeline: true }) } }],
    ['뒤로', () => { const l = overlays(); const i = l.indexOf(o); if (i > 0) { l.splice(i, 1); l.splice(i - 1, 0, o); changed({ timeline: true }) } }]
  ]))
  box.appendChild(buttonRow([['이미지 빼기', () => removeOverlay(o.id), 'danger']]))
  note('Delete 키로도 뺄 수 있습니다. 이미지는 스펙트럼 아래에, 배경 어둡게의 영향 없이 그대로 보입니다.')
}

// The tracklist: where, how big, and its look. Colours, the title and the backing
// redraw as they change without rebuilding this panel, so a colour picker stays open.
function tracklistInspector (box, note) {
  const t = tracklistStyle()
  const title = document.createElement('h4')
  title.textContent = '트랙리스트'
  box.appendChild(title)
  if (!t.visible) note('트랙리스트가 숨겨져 있습니다. 아래 "보이기"를 누르면 영상에 나타납니다.')
  box.appendChild(numberField('가로 위치', pct(t.cx), (v) => setTracklist({ cx: v / 100 })))
  box.appendChild(numberField('세로 위치', pct(t.cy), (v) => setTracklist({ cy: v / 100 })))
  box.appendChild(numberField('너비', pct(t.w), (v) => setTracklist({ w: clamp01(v / 100, 0.08, 1) })))
  box.appendChild(numberField('높이', pct(t.h), (v) => setTracklist({ h: clamp01(v / 100, 0.08, 1) })))
  box.appendChild(buttonRow([
    ['가로 가운데', () => setTracklist({ cx: 0.5 })],
    ['세로 가운데', () => setTracklist({ cy: 0.5 })],
    ['왼쪽 기본 위치', () => setTracklist({ cx: TRACKLIST_DEFAULTS.cx, cy: TRACKLIST_DEFAULTS.cy, w: TRACKLIST_DEFAULTS.w, h: TRACKLIST_DEFAULTS.h })]
  ]))
  const look = (patch) => {
    studio.video.tracklist = { ...tracklistStyle(), ...patch }
    redraw()
    saveVideo()
  }
  const sub = document.createElement('h5')
  sub.textContent = '모양·색상'
  box.appendChild(sub)
  const row = (label, control) => {
    const el = document.createElement('label')
    el.className = 'ed-field ed-look'
    el.innerHTML = '<span></span>'
    el.querySelector('span').textContent = label
    el.appendChild(control)
    box.appendChild(el)
    return control
  }
  const heading = document.createElement('input')
  heading.type = 'text'
  heading.maxLength = 40
  heading.value = t.title
  heading.placeholder = '(제목 없음)'
  heading.addEventListener('input', () => look({ title: heading.value }))
  row('제목', heading)
  const colors = document.createElement('div')
  colors.className = 'ed-colors'
  const pick = (value, key, tip) => {
    const el = document.createElement('input')
    el.type = 'color'
    el.value = value
    el.title = tip
    el.addEventListener('input', () => look({ [key]: el.value }))
    colors.appendChild(el)
  }
  pick(t.color, 'color', '글자색')
  pick(t.accent, 'accent', '지금 곡 강조색')
  row('글자·강조', colors)
  const bg = document.createElement('input')
  bg.type = 'range'
  bg.min = '0'
  bg.max = '0.9'
  bg.step = '0.05'
  bg.value = String(t.bg || 0)
  bg.addEventListener('input', () => look({ bg: Number(bg.value) }))
  row('바탕 어둡게', bg)
  box.appendChild(buttonRow([
    t.visible ? ['숨기기', () => showTracklist(false), 'danger'] : ['보이기', () => showTracklist(true)]
  ]))
  note('지금 재생 중인 곡이 강조됩니다. 곡이 많으면 지금 곡이 보이도록 목록이 넘어갑니다. Delete 키로 숨길 수 있습니다.')
}

// The spectrum's look, as in the studio panel's "스펙트럼" section (kept in step with
// it). Colours and glow redraw as they are dragged without rebuilding this panel, so
// the colour picker stays open; the bar count rebuilds the analysis like the panel does.
function spectrumLook (box, s) {
  const title = document.createElement('h5')
  title.textContent = '모양·색상'
  box.appendChild(title)
  const look = (patch, { rebuild = false } = {}) => {
    studio.video.spectrum = { ...studio.video.spectrum, ...patch }
    writeControls()
    redraw()
    saveVideo()
    renderHandles()
    if (rebuild) renderInspector()
  }
  const row = (label, control) => {
    const el = document.createElement('label')
    el.className = 'ed-field ed-look'
    el.innerHTML = '<span></span>'
    el.querySelector('span').textContent = label
    el.appendChild(control)
    box.appendChild(el)
    return control
  }
  const select = (options, value) => {
    const el = document.createElement('select')
    for (const [v, text] of options) {
      const option = document.createElement('option')
      option.value = String(v)
      option.textContent = text
      el.appendChild(option)
    }
    el.value = String(value)
    return el
  }
  const kind = row('모양', select([['bars', '막대'], ['mirror', '미러 막대'], ['line', '선형 파형'], ['circle', '원형']], s.kind))
  kind.onchange = () => look({ kind: kind.value }, { rebuild: true })

  const layout = row('좌우 대칭', select([['left', '좌 (저음 왼쪽)'], ['center', '중앙 (대칭)'], ['right', '우 (저음 오른쪽)']], spectrumLayout(s)))
  layout.onchange = () => look({ layout: layout.value, symmetric: layout.value === 'center' })

  const bars = row('막대 수', select([8, 16, 24, 32, 48, 64, 96, 128].map((n) => [n, `${n}개`]), s.barCount))
  bars.onchange = () => {
    look({ barCount: Number(bars.value) })
    // A new bar count means a new analysis of the songs (the same as the panel's).
    reanalyseSoon()
  }

  const colors = document.createElement('div')
  colors.className = 'ed-colors'
  const pick = (value, key, tip) => {
    const el = document.createElement('input')
    el.type = 'color'
    el.value = value
    el.title = tip
    el.addEventListener('input', () => look({ [key]: el.value }))
    colors.appendChild(el)
  }
  pick(s.color1, 'color1', '아래쪽 색')
  pick(s.color2, 'color2', '위쪽 색')
  row('색상', colors)

  const glow = document.createElement('input')
  glow.type = 'range'
  glow.min = '0'
  glow.max = '1'
  glow.step = '0.05'
  glow.value = String(s.glow)
  glow.addEventListener('input', () => look({ glow: Number(glow.value) }))
  row('글로우', glow)

  const gainBox = document.createElement('div')
  gainBox.className = 'ed-gain'
  const gain = document.createElement('input')
  gain.type = 'range'
  gain.min = '0.3'
  gain.max = '3'
  gain.step = '0.05'
  gain.value = String(s.gain || 1)
  const gainText = document.createElement('em')
  gainText.textContent = `×${(s.gain || 1).toFixed(1)}`
  gain.addEventListener('input', () => {
    gainText.textContent = `×${Number(gain.value).toFixed(1)}`
    look({ gain: Number(gain.value) })
  })
  gainBox.append(gain, gainText)
  row('진폭', gainBox)
}

// ── timeline ──
function renderTimeline () {
  if (!ed.open) return
  const box = edEl('edTimeline')
  if (!studio.cycle) {
    box.innerHTML = '<div class="ed-tl-empty">곡을 고르고 위의 "미리보기 준비"를 누르면 곡·배경·이미지 타임라인이 나옵니다.</div>'
    return
  }
  const total = duration()
  const at = (s) => `${clamp01(s / total) * 100}%`
  const span = (a, b) => `left:${at(a)};width:${clamp01((b - a) / total) * 100}%`
  // Ruler: a tick every 10 s … 10 min, about a dozen across.
  const stepChoices = [5, 10, 15, 30, 60, 120, 300, 600]
  const step = stepChoices.find((s) => total / s <= 14) || 900
  let ticks = ''
  for (let s = 0; s <= total; s += step) ticks += `<span class="ed-tick" style="left:${at(s)}">${clock(s)}</span>`
  const fps = studio.cycle.fps
  const songs = studio.cycle.chapters.map((c, i) => {
    const end = i + 1 < studio.cycle.chapters.length ? studio.cycle.chapters[i + 1].start : total
    return `<div class="ed-clip song" style="${span(c.start, end)}" title="${esc(c.title)}">${esc(c.title)}</div>`
  }).join('')
  const runs = studio.runs
    ? studio.runs.map((r) => `<div class="ed-clip bg" style="${span(r.start / fps, r.end / fps)}" title="${esc(r.background.name || '기본 배경')}">${esc(r.background.kind === 'none' ? '기본 배경' : r.background.name || '배경')}</div>`).join('')
    : `<div class="ed-clip bg" style="${span(0, total)}">${esc(studio.video.background.kind === 'none' ? '기본 배경 (그라데이션)' : `스튜디오 배경: ${studio.video.background.name || ''}`)}</div>`
  const lanes = overlays().map((o) => {
    const end = o.end == null ? total : Math.min(o.end, total)
    const sel = ed.sel && ed.sel.type === 'overlay' && ed.sel.id === o.id ? ' selected' : ''
    return `<div class="ed-lane"><div class="ed-lane-name" title="${esc(o.name || '')}">${esc(o.name || '이미지')}</div>` +
      `<div class="ed-track" data-track="overlay"><div class="ed-clip img${sel}" data-id="${o.id}" style="${span(o.start || 0, end)}">` +
      `<i class="ed-trim l" data-edge="start"></i><span>${esc(o.name || '이미지')}</span><i class="ed-trim r" data-edge="end"></i></div></div></div>`
  }).join('')
  box.innerHTML = `
    <div class="ed-lane ruler"><div class="ed-lane-name">${clock(total)}</div><div class="ed-track ed-ruler" data-track="ruler">${ticks}</div></div>
    <div class="ed-lane"><div class="ed-lane-name">곡</div><div class="ed-track" data-track="songs">${songs}</div></div>
    <div class="ed-lane"><div class="ed-lane-name">배경</div><div class="ed-track" data-track="bg">${runs}</div></div>
    ${tracklistOn() ? `<div class="ed-lane"><div class="ed-lane-name">트랙리스트</div><div class="ed-track" data-track="tracklist"><div class="ed-clip tracklist${ed.sel && ed.sel.type === 'tracklist' ? ' selected' : ''}" style="${span(0, total)}">트랙리스트</div></div></div>` : ''}
    ${lanes || '<div class="ed-lane"><div class="ed-lane-name">이미지</div><div class="ed-track"><span class="ed-tl-hint">왼쪽 에셋에서 이미지를 미리보기로 끌어다 놓으면 여기에 줄이 생깁니다.</span></div></div>'}
    <div class="ed-playhead-area"><div id="edPlayhead" class="ed-playhead"></div></div>`
  wireTimeline(box, total)
}

function wireTimeline (box, total) {
  const timeAt = (event, track) => {
    const r = track.getBoundingClientRect()
    return clamp01((event.clientX - r.left) / r.width) * total
  }
  box.querySelectorAll('.ed-track').forEach((track) => {
    track.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      if (event.target.closest('.ed-clip.tracklist')) {
        edSelect({ type: 'tracklist' })
        return
      }
      const clip = event.target.closest('.ed-clip.img')
      if (clip) {
        // A picture's bar: move it, or drag one end to trim.
        const o = overlayById(clip.dataset.id)
        if (!o) return
        if (!ed.sel || ed.sel.id !== o.id) { ed.sel = { type: 'overlay', id: o.id }; renderHandles(); renderInspector() }
        const edge = event.target.dataset.edge
        const t0 = timeAt(event, track)
        const start0 = o.start || 0
        const end0 = o.end == null ? total : o.end
        track.setPointerCapture(event.pointerId)
        const move = (e) => {
          const dt = timeAt(e, track) - t0
          if (edge === 'start') o.start = clamp01(start0 + dt, 0, end0 - 0.5)
          else if (edge === 'end') { const e2 = clamp01(end0 + dt, start0 + 0.5, total); o.end = e2 >= total - 0.05 ? null : e2 }
          else {
            const len = end0 - start0
            const s = clamp01(start0 + dt, 0, total - len)
            o.start = s
            o.end = end0 >= total - 0.05 && s + len >= total - 0.05 ? null : s + len
          }
          const end = o.end == null ? total : o.end
          clip.style.left = `${(o.start / total) * 100}%`
          clip.style.width = `${((end - o.start) / total) * 100}%`
          redraw()
        }
        const up = () => {
          track.removeEventListener('pointermove', move)
          o.start = Math.round(o.start * 10) / 10
          if (o.end != null) o.end = Math.round(o.end * 10) / 10
          changed({ timeline: true })
        }
        track.addEventListener('pointermove', move)
        track.addEventListener('pointerup', up, { once: true })
        return
      }
      // Anywhere else on the timeline: move the playhead there (and follow the drag).
      seekPreview(timeAt(event, track))
      track.setPointerCapture(event.pointerId)
      const move = (e) => seekPreview(timeAt(e, track))
      track.addEventListener('pointermove', move)
      track.addEventListener('pointerup', () => track.removeEventListener('pointermove', move), { once: true })
    })
  })
}

// ── wiring ──
function wireEditor () {
  studioEl('vEditor').onclick = openEditor
  edEl('edClose').onclick = closeEditor
  edEl('edFull').onclick = () => setEditorFullScreen(!ed.full)
  edEl('edPrepare').onclick = () => prepareStudio()
  edEl('edRender').onclick = () => {
    if (!studio.cycle) return toast('먼저 "미리보기 준비"를 눌러 곡을 준비해 주세요.')
    closeEditor()
    renderVideo()
  }
  edEl('edImport').onclick = importAssets
  wireStage()
  wireKeys()
  window.addEventListener('resize', () => fitStage())
}
wireEditor()
