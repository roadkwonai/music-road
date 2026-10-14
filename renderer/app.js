'use strict'

const $ = (id) => document.getElementById(id)
const MAC = navigator.platform.startsWith('Mac')
const PRESETS = [
  { name: '시티팝', style: 'Korean, 1980s city pop, groovy funk bass, Rhodes electric piano, bright brass stabs, clean funky guitar cutting, analog synth pads, tight disco drums, sweet airy Korean female vocal, nostalgic night drive mood, 112 BPM' },
  { name: '트로트', style: 'Korean trot, ppongjjak, upbeat cheerful festival mood, electric organ, bright saxophone fills, brass section, synth strings, shuffle drums with strong backbeat, walking electric bass, warm mature Korean female trot vocal with kkeokgi bending and wide vibrato, 128 BPM' },
  { name: '발라드', style: 'Korean ballad, emotional piano, lush string section, soft electric guitar solo, slow build to a big chorus, tender Korean female vocal with airy head voice, sorrowful and warm, 68 BPM' },
  { name: 'K-pop 댄스', style: 'K-pop dance pop, punchy synth bass, bright plucks, trap-influenced hi-hats, big layered chorus with group vocals, confident young Korean female vocal, glossy modern production, 124 BPM' },
  { name: 'R&B', style: 'Korean R&B, smooth Rhodes chords, mellow bass groove, laid-back drums, subtle vinyl texture, breathy soulful Korean female vocal with rich harmonies, late night mood, 86 BPM' },
  { name: '어쿠스틱 포크', style: 'Korean acoustic folk, fingerpicked steel string guitar, soft cajon, warm upright bass, gentle strings, intimate Korean female vocal, sunny afternoon mood, 96 BPM' },
  { name: '신스웨이브', style: 'synthwave retro pop, analog synth arpeggio, gated reverb drums, fat bass synth, neon 1980s atmosphere, dreamy Korean female vocal with reverb, 108 BPM' },
  { name: '록 밴드', style: 'Korean modern rock band, distorted electric guitars, driving bass, energetic live drums, anthemic chorus, powerful Korean female rock vocal, 142 BPM' },
  { name: '재즈 보사노바', style: 'bossa nova jazz, nylon string guitar, brushed drums, upright bass, soft flugelhorn, relaxed swing feel, smooth Korean female jazz vocal, cafe mood, 92 BPM' },
  { name: '동요', style: 'Korean childrens song, bright xylophone, playful piano, light percussion, simple cheerful melody, clear friendly Korean female vocal, happy and innocent mood, 116 BPM' },
  { name: '크리스마스 캐롤', style: 'Korean, christmas carol, festive holiday pop, sleigh bells, glockenspiel, warm piano, pizzicato and lush strings, soft brushed drums, cozy snowy winter night, bright warm Korean female vocal with gentle backing harmonies, 104 BPM' }
]

// Instrumental work has its own vocabulary; these replace the vocal presets while
// 연주곡 is on. None of them mention a voice.
const INSTRUMENTAL_PRESETS = [
  { name: '피아노 솔로', style: 'solo piano, intimate close-miked grand piano, gentle pedal, expressive rubato, warm and reflective, 72 BPM' },
  { name: '클래식 기타 듀오', style: 'classical guitar duo, two nylon string guitars, interlocking arpeggios and melody, intimate recital recording, 88 BPM' },
  { name: '피아노 트리오', style: 'classical piano trio, piano violin and cello, chamber music, balanced acoustic blend, flowing dialogue between the three, 92 BPM' },
  { name: '현악 4중주', style: 'string quartet, two violins viola and cello, classical chamber music, clean acoustic recording in a small hall, elegant counterpoint, 96 BPM' },
  { name: '피아노 + 첼로', style: 'cello and piano duo, singing cello melody over warm piano accompaniment, romantic chamber music, close intimate recording, 68 BPM' },
  { name: '플루트 + 기타', style: 'flute and classical guitar duo, airy flute melody over nylon string guitar, pastoral chamber music, light and clear, 100 BPM' },
  { name: '피아노 2대', style: 'two pianos, interlocking parts between both instruments, bright concert hall, rhythmic and virtuosic, 112 BPM' },
  { name: '실내 관현악', style: 'chamber orchestra, small string section with woodwinds and light brass, classical concert hall, refined dynamics, 100 BPM' },
  { name: '오케스트라', style: 'cinematic orchestra, sweeping strings, warm brass, timpani, woodwind counter-melody, film score, wide dynamic range, 88 BPM' },
  { name: '로파이 BGM', style: 'lo-fi hip hop beat, dusty Rhodes piano, soft vinyl crackle, muted bass, laid-back drums, study background music, 78 BPM' },
  { name: '재즈 트리오', style: 'jazz piano trio, upright bass walking lines, brushed drums, swinging feel, late night club, 118 BPM' },
  { name: '앰비언트', style: 'ambient soundscape, slow evolving synth pads, soft granular texture, deep reverb, calm and spacious, very slow, 60 BPM' },
  { name: '기타 연주', style: 'fingerstyle acoustic guitar, steel string, warm room recording, gentle percussive taps, folk instrumental, 92 BPM' },
  { name: '신스웨이브', style: 'synthwave instrumental, analog arpeggios, gated reverb drums, fat bass synth, neon night drive, 110 BPM' },
  { name: '게임 BGM', style: 'game background music, bright chiptune-inspired synths, driving rhythm, loopable adventure theme, 132 BPM' },
  { name: '캐롤 연주', style: 'christmas carol instrumental, sleigh bells, celesta and glockenspiel melody, warm piano, pizzicato strings, music box sparkle, cozy festive winter mood, 100 BPM' },
  {
    name: '국악 느낌',
    style: 'Korean historical drama soundtrack, east asian traditional flavour, ' +
      'plucked zither and bamboo flute timbres, hand drum, pentatonic melody, ' +
      'meditative and spacious, 76 BPM',
    note: '실제 국악기 연주가 아니라 국악 분위기를 흉내 낸 소리입니다. ' +
      '가야금 농현, 대금 청울림, 자진모리 같은 장단은 재현되지 않습니다.'
  }
]

const STAGES = {
  plan: { label: '작곡 (악보 만드는 중)' },
  semantic: { label: '노래 생성 중' },
  synth: { label: '소리로 바꾸는 중' },
  decode: { label: '파일로 저장 중' }
}
const ORDER = ['plan', 'semantic', 'synth', 'decode']

// Measured on an RTX 3050 in fast mode (CUDA graphs). Token counts come from four
// finished songs: 55/408/475/898 lyric characters produced 1526/4395/5147/6456
// song tokens, so length drives the estimate and the bar no longer stalls at 50%.
const SPEED = { plan: 14, semantic: 30, synthPerToken: 0.034, decode: 8, load: 55 }
const MAX_SONG_TOKENS = 9000 // generation cap in the model's sampling config (~6 min)
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

function estimate (lyrics, { firstRun = true } = {}) {
  const chars = (lyrics || '').replace(/^\s*\[.*\]\s*$/gm, '').replace(/\s/g, '').length
  const tokens = {
    plan: clamp(Math.round(500 + 3 * chars), 700, 4096),
    semantic: clamp(Math.round(1200 + 7 * chars), 1500, 9000)
  }
  const seconds = {
    plan: tokens.plan / SPEED.plan,
    semantic: tokens.semantic / SPEED.semantic,
    synth: tokens.semantic * SPEED.synthPerToken,
    decode: SPEED.decode
  }
  const total = ORDER.reduce((sum, key) => sum + seconds[key], 0) + (firstRun ? SPEED.load : 0)
  const weights = {}
  for (const key of ORDER) weights[key] = seconds[key] / total
  return { tokens, seconds, weights, total }
}

// ACE-Step on an RTX 3050 8GB (measured: 3:00 and 4:18 songs took 2:29 and 3:03):
// about 73 s plus 0.43 s per second of song. The first song of a session also starts
// the engine and loads the models, about 2.5 minutes more. Without a target the
// model picks the length from the lyrics.
const ACE_STAGES = { plan: '곡 구성 짜는 중', synth: '노래 만드는 중', decode: '저장하고 가사 시각 맞추는 중' }

function aceEstimate (targetSeconds, lyrics, { firstRun = true } = {}) {
  const chars = (lyrics || '').replace(/^\s*\[.*\]\s*$/gm, '').replace(/\s/g, '').length
  const song = targetSeconds || clamp(60 + chars * 0.35, 60, 300)
  const seconds = { plan: 20 + song * 0.06, semantic: 0, synth: 38 + song * 0.33, decode: 15 + song * 0.035 }
  const total = ORDER.reduce((sum, key) => sum + seconds[key], 0) + (firstRun ? 150 : 0)
  const weights = {}
  for (const key of ORDER) weights[key] = seconds[key] / total
  return { tokens: { plan: 100, semantic: 1 }, seconds, weights, total, labels: ACE_STAGES }
}

let plan = estimate('')

// Prompt helpers (style tags, structure, lyric cleanup, score analysis) live in prompt.js.

let songs = []
let selected = null
let running = false
let jobStart = 0
let warmed = false // the model only pays its ~1 minute load cost on the first song
let currentProject = null
let runningJob = null // {jobId, title} of the song being made, shown atop the library
let queueState = { current: null, waiting: [] }
const plans = new Map() // jobId → time estimate, so a queued song keeps its own

const fmtGb = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)}GB`
const esc = (text) => String(text == null ? '' : text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── AI engines ───────────────────────────────────────────────────────────────
// The engine screen: each engine with what it needs, what this PC has, and an
// install button. A PC that cannot run an engine gets told why, and which cards can,
// instead of a download that fails later.
let engineList = []
let enginesInstalled = { yue: false, ace: false }
let enginesRepair = { yue: false } // installed once, model files gone
let installingEngine = null
let engineFirstRun = false

const engineCard = (id) => document.querySelector(`.engine-card[data-engine="${id}"]`)

function wireSetup () {
  window.yue.onSetupStep(({ step, status, detail }) => {
    const card = engineCard(installingEngine)
    if (!card) return
    const li = card.querySelector(`li[data-step="${step}"]`)
    if (li) {
      li.classList.remove('run', 'done')
      li.classList.add(status === 'run' ? 'run' : 'done')
      if (detail) li.querySelector('.detail').textContent = detail
    }
    const order = [...card.querySelectorAll('li[data-step]')].map((item) => item.dataset.step)
    const index = order.indexOf(step)
    if (index >= 0 && status === 'done') card.querySelector('.engine-bar').style.width = `${((index + 1) / order.length) * 100}%`
  })
  window.yue.onSetupProgress(({ step, got, total }) => {
    const card = engineCard(installingEngine)
    const li = card && card.querySelector(`li[data-step="${step}"] .detail`)
    if (li && total) li.textContent = `${fmtGb(got)} / ${fmtGb(total)}`
  })
  window.yue.onSetupLog((line) => {
    const log = $('setupLog')
    log.textContent = (log.textContent + '\n' + line).split('\n').slice(-400).join('\n')
    log.scrollTop = log.scrollHeight
  })
  $('setupLogToggle').onclick = () => $('setupLog').classList.toggle('hidden')
  $('pickLocation').onclick = async () => {
    if (installingEngine) return toast('설치하는 중에는 위치를 바꿀 수 없습니다.')
    const result = await window.yue.pickLocation()
    if (!result.ok) return result.canceled ? null : toast(result.message, 6000)
    await showLocation()
    await renderEngines() // 새 드라이브의 여유 공간으로 다시 점검한다
  }
  $('engineClose').onclick = async () => {
    if (installingEngine) return toast('설치가 끝날 때까지 기다려 주세요.')
    $('setup').classList.add('hidden')
    if (engineFirstRun) {
      engineFirstRun = false
      if (!enginesInstalled.yue && !enginesInstalled.ace) await window.yue.skipEngines()
      await startApp()
    }
    showEngineChoice()
  }
  $('openEngines').onclick = () => openEngines()
}

async function openEngines ({ firstRun = false } = {}) {
  engineFirstRun = firstRun
  $('engineClose').textContent = firstRun ? '엔진 없이 시작' : '닫기'
  $('setupError').classList.add('hidden')
  $('setup').classList.remove('hidden')
  await showLocation()
  await renderEngines()
}

async function renderEngines () {
  const box = $('engineCards')
  box.innerHTML = '<p class="muted">컴퓨터 사양을 확인하는 중…</p>'
  engineList = await window.yue.engines()
  for (const engine of engineList) {
    enginesInstalled[engine.id] = engine.installed
    enginesRepair[engine.id] = Boolean(engine.repair)
  }
  box.innerHTML = ''
  for (const engine of engineList) box.appendChild(buildEngineCard(engine))
  if (engineFirstRun) {
    $('engineClose').textContent = enginesInstalled.yue || enginesInstalled.ace ? '시작하기' : '엔진 없이 시작'
  }
}

function buildEngineCard (engine) {
  const card = document.createElement('section')
  card.className = 'engine-card'
  card.dataset.engine = engine.id
  const [state, label] = engine.installed ? ['installed', '설치됨']
    : engine.repair ? ['blocked', '모델 파일 없음']
      : engine.check.ok ? ['ready', '설치 가능'] : ['blocked', '이 PC에는 설치할 수 없음']
  card.innerHTML = `
    <div class="engine-head"><h2></h2><span class="engine-status ${state}"></span></div>
    <p class="engine-tagline"></p>
    <dl class="engine-specs">
      <dt>용량</dt><dd class="spec-size"></dd>
      <dt>설치 가능</dt><dd class="spec-ok"></dd>
      <dt>설치 불가</dt><dd class="spec-no"></dd>
    </dl>
    <div class="engine-check preflight"></div>
    <ul class="steps hidden"></ul>
    <div class="bar hidden"><div class="engine-bar"></div></div>
    <div class="engine-actions"><button class="engine-install"></button></div>`
  card.querySelector('h2').textContent = engine.name
  card.querySelector('.engine-status').textContent = label
  card.querySelector('.engine-tagline').textContent = engine.tagline
  card.querySelector('.spec-size').textContent = `약 ${engine.downloadGb}GB 내려받기 · 여유 공간 ${engine.needGb}GB 필요`
  card.querySelector('.spec-ok').textContent = engine.supported
  card.querySelector('.spec-no').textContent = engine.unsupported

  // This PC, line by line: the card, the disk, then anything that blocks or warns.
  const { check } = engine
  const rows = []
  const line = (cls, mark, text) => rows.push(
    `<div class="row"><span class="mark ${cls}">${mark}</span><span class="${cls === 'good' ? '' : cls}">${esc(text)}</span></div>`)
  const gpuProblem = check.problems.some((text) => /그래픽카드|세대|BF16|NVIDIA|맥의 메모리/.test(text))
  line(check.gpu.ok && !gpuProblem ? 'good' : 'bad', check.gpu.ok && !gpuProblem ? '✓' : '✕',
    check.gpu.ok ? `이 PC의 그래픽카드: ${check.gpu.name} (${check.gpu.vramGb > 0 ? `${check.gpu.vramGb}GB` : '메모리 확인 불가'})` : '이 PC의 그래픽카드: NVIDIA 그래픽카드 없음')
  if (check.freeGb !== null) {
    const enough = check.freeGb >= check.needGb
    line(enough ? 'good' : 'bad', enough ? '✓' : '✕', `${check.drive} 여유 공간 ${check.freeGb}GB (필요 ${check.needGb}GB)`)
  }
  if (engine.repair) line('bad', '✕', '설치되어 있지만 모델 파일을 찾지 못했습니다. "다시 받기"를 누르면 빠진 파일만 받습니다.')
  for (const text of check.problems) line('bad', '✕', text)
  for (const text of check.warnings) line('warn', '!', text)
  card.querySelector('.engine-check').innerHTML = rows.join('')

  card.querySelector('.steps').innerHTML = engine.steps.map(([id, text]) =>
    `<li data-step="${id}"><span class="dot"></span><b>${esc(text)}</b><span class="detail"></span></li>`).join('')
  const button = card.querySelector('.engine-install')
  button.className = `engine-install ${engine.installed ? 'ghost' : 'primary'}`
  button.textContent = engine.installed ? '다시 설치' : engine.repair ? '다시 받기' : check.ok ? '설치' : '설치할 수 없음'
  if (!check.ok) button.classList.add('blocked')
  button.onclick = () => installEngine(engine)
  return card
}

async function installEngine (engine) {
  if (installingEngine) return toast('다른 엔진을 설치하는 중입니다.')
  if (!engine.check.ok) return warnCannotInstall(engine, engine.check.problems)
  const again = engine.installed || engine.repair
  if (!confirm(again
    ? `${engine.name}을(를) 다시 설치할까요?\n받아 둔 모델은 가능한 한 다시 쓰고, 빠진 파일만 받습니다.`
    : `${engine.name}을(를) 설치합니다.\n약 ${engine.downloadGb}GB를 내려받고, 인터넷 속도에 따라 10~40분 걸립니다.\n` +
      engine.check.warnings.map((text) => `\n! ${text}\n`).join('') + '\n계속할까요?')) return
  installingEngine = engine.id
  const card = engineCard(engine.id)
  card.classList.add('installing')
  card.querySelector('.steps').classList.remove('hidden')
  card.querySelector('.bar').classList.remove('hidden')
  card.querySelector('.engine-bar').style.width = '0%'
  for (const button of document.querySelectorAll('.engine-install')) button.disabled = true
  $('engineClose').disabled = true
  $('setupError').classList.add('hidden')
  const result = await window.yue.installEngine(engine.id)
  installingEngine = null
  $('engineClose').disabled = false
  if (!result.ok) {
    card.classList.remove('installing')
    for (const button of document.querySelectorAll('.engine-install')) button.disabled = false
    if (result.blocked) return warnCannotInstall(engine, result.problems)
    $('setupError').textContent = `${engine.name} 설치에 실패했습니다.\n${result.message || ''}`
    $('setupError').classList.remove('hidden')
    $('setupLog').classList.remove('hidden')
    return
  }
  toast(`${engine.name} 설치를 마쳤습니다. 곡 만들기의 "엔진"에서 고를 수 있습니다.`, 6000)
  enginesInstalled[engine.id] = true
  localStorageSet('engine', engine.id)
  await renderEngines()
  showEngineChoice()
}

// Why not, and what would work — the same words the card shows, in one place.
function warnCannotInstall (engine, problems) {
  showProblem([
    `${engine.name}은(는) 이 PC에 설치할 수 없습니다.`,
    '',
    ...problems.map((text) => `• ${text}`),
    '',
    `설치 가능한 그래픽카드: ${engine.supported}`,
    `설치할 수 없는 경우: ${engine.unsupported}`,
    `필요한 여유 공간: ${engine.needGb}GB (설치 위치를 다른 드라이브로 바꿀 수 있습니다)`
  ].join('\n'), null, '설치할 수 없습니다')
}

function localStorageSet (key, value) {
  try { localStorage.setItem(key, value) } catch {}
}

// The engine picked for the next song: the one used last if it is installed,
// otherwise whichever is.
function currentEngine () {
  return $('engine').value === 'ace' ? 'ace' : 'yue'
}

function showEngineChoice () {
  const select = $('engine')
  let saved = null
  try { saved = localStorage.getItem('engine') } catch {}
  for (const option of select.options) {
    const name = option.value === 'ace' ? 'ACE-Step 1.5' : 'YuE2'
    option.textContent = enginesInstalled[option.value] ? name : `${name} (설치 필요)`
  }
  const pick = enginesInstalled[saved] ? saved
    : enginesInstalled.yue ? 'yue' : enginesInstalled.ace ? 'ace' : (saved || 'yue')
  select.value = pick
  applyEngineUi()
}

// A cover or an imported score is sung by YuE2: switch to it when it is installed.
function useScoreEngine () {
  if (currentEngine() !== 'ace') return
  if (enginesInstalled.yue) {
    $('engine').value = 'yue'
    applyEngineUi()
    toast('악보로 만드는 곡이라 엔진을 YuE2로 바꿨습니다.', 5000)
  } else {
    toast('악보로 만드는 곡은 YuE2 엔진이 필요합니다. "AI 엔진"에서 YuE2를 설치해 주세요.', 7000)
  }
}

// Scores belong to YuE2. With ACE-Step the score buttons and YuE2's expert settings
// step back, saying why.
function applyEngineUi () {
  const ace = currentEngine() === 'ace'
  for (const id of ['planOnly', 'importScore']) {
    const button = $(id)
    // A disabled button gets no hover events, so the plain title carries the reason.
    if (button.dataset.title === undefined) button.dataset.title = button.title || ''
    button.disabled = ace
    button.title = ace ? '악보 기능은 YuE2 엔진에서만 쓸 수 있습니다' : button.dataset.title
  }
  $('advanced').classList.toggle('engine-off', ace)
  $('advanced').dataset.tip = ace ? '고급 설정은 YuE2 엔진용입니다. ACE-Step에는 쓰이지 않습니다.' : ''
  if (ace && $('advanced').open) $('advanced').open = false
  updateTarget()
}

// ── library ──────────────────────────────────────────────────────────────────
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'
const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'

// Songs are heard in the mini player (miniplayer.js), the one player in the app.
function playButton (song) {
  const button = document.createElement('button')
  const active = miniPlaying(song)
  button.className = 'play' + (active ? ' playing' : '')
  button.title = active ? '멈춤' : '미리듣기'
  button.innerHTML = active ? PAUSE_ICON : PLAY_ICON
  button.onclick = (event) => {
    event.stopPropagation() // 카드 선택과 겹치지 않게
    toggle(song)
  }
  return button
}

// Takes a song out of the list only. Its folder and files stay where they are, and it
// can be put back from "목록에서 뺀 곡" at the bottom of the list.
const UNLIST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h12v2H4zm0 5h12v2H4zm0 5h7v2H4zm10 0h7v2h-7z"/></svg>'
const UNLIST_TIP = '목록에서만 빼기\n원본 파일은 지워지지 않고 그대로 남아요.\n목록 맨 아래 "목록에서 뺀 곡"에서 다시 넣을 수 있어요.'

function unlistButton (song) {
  const button = document.createElement('button')
  button.className = 'unlist'
  button.dataset.tip = UNLIST_TIP
  button.setAttribute('aria-label', '목록에서만 빼기 (원본 파일은 지우지 않음)')
  button.innerHTML = UNLIST_ICON
  button.onclick = (event) => {
    event.stopPropagation()
    setListed(song, false)
  }
  return button
}

// Deletes a song from its row: the folder goes to the Recycle Bin.
const REMOVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z"/></svg>'

function removeButton (song) {
  const button = document.createElement('button')
  button.className = 'remove'
  button.dataset.tip = '삭제\n곡 폴더를 휴지통으로 옮겨요.'
  button.setAttribute('aria-label', '삭제 (휴지통으로 이동)')
  button.innerHTML = REMOVE_ICON
  button.onclick = async (event) => {
    event.stopPropagation()
    if (!confirm(`"${song.title || '무제'}"을(를) 삭제할까요? (휴지통으로 이동)`)) return
    await deleteSongs([song])
  }
  return button
}

// Several at once ("선택 삭제"): each folder goes to the Recycle Bin; a song that is
// being made or waits in the queue is refused by main and reported.
async function deleteSongs (list) {
  let removed = 0
  const failed = []
  for (const song of list) {
    releaseMini(song.dir)
    const result = await window.yue.remove(song.dir)
    if (result && result.ok) {
      removed++
      if (selected && selected.dir === song.dir) {
        selected = null
        $('player').classList.add('hidden')
      }
    } else {
      failed.push(`${song.title || '무제'}: ${(result && result.message) || '삭제하지 못했습니다.'}`)
    }
  }
  await refresh()
  if (failed.length) showProblem(failed.join('\n'), null, `${removed}곡 삭제 · ${failed.length}곡은 지우지 못했습니다`)
  else toast(removed > 1 ? `${removed}곡을 휴지통으로 옮겼습니다.` : '곡을 휴지통으로 옮겼습니다.')
  return removed
}

// "선택 삭제" mode: every row gets a tick box, and the bar above the list deletes them.
let deleteMode = false
const deletePicks = new Set() // song.dir

function setDeleteMode (on) {
  deleteMode = on
  deletePicks.clear()
  $('deleteBar').classList.toggle('hidden', !on)
  $('selectDelete').classList.toggle('active', on)
  showDeleteCount()
  renderSongs()
}

function showDeleteCount () {
  $('deleteCount').textContent = `${deletePicks.size}곡 선택`
  $('deleteDo').disabled = deletePicks.size === 0
}

function deletePickBox (song, card) {
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.className = 'del-pick'
  box.checked = deletePicks.has(song.dir)
  card.classList.toggle('del-picked', box.checked)
  box.onclick = (event) => event.stopPropagation()
  box.onchange = () => {
    if (box.checked) deletePicks.add(song.dir)
    else deletePicks.delete(song.dir)
    card.classList.toggle('del-picked', box.checked)
    showDeleteCount()
  }
  return box
}

function wireDeleteMode () {
  $('selectDelete').onclick = () => setDeleteMode(!deleteMode)
  $('deleteCancel').onclick = () => setDeleteMode(false)
  $('deletePickAll').onclick = () => {
    const all = songs.every((song) => deletePicks.has(song.dir))
    deletePicks.clear()
    if (!all) for (const song of songs) deletePicks.add(song.dir)
    showDeleteCount()
    renderSongs()
  }
  $('deleteDo').onclick = async () => {
    const list = songs.filter((song) => deletePicks.has(song.dir))
    if (!list.length) return
    if (!confirm(`선택한 ${list.length}곡을 삭제할까요?\n곡 폴더가 휴지통으로 옮겨집니다.`)) return
    $('deleteDo').disabled = true
    await deleteSongs(list)
    setDeleteMode(false)
  }
}

async function setListed (song, listed) {
  const result = await window.yue.hideSong(song.folder, !listed)
  if (!result.ok) return toast(result.message || '목록을 바꾸지 못했습니다.', 6000)
  const title = song.title || '무제'
  if (!listed) releaseMini(song.dir)
  if (!listed && selected && selected.dir === song.dir) {
    selected = null
    $('player').classList.add('hidden')
  }
  await refresh()
  toast(listed
    ? `"${title}"을(를) 목록에 다시 넣었습니다.`
    : `"${title}"을(를) 목록에서 뺐습니다. 원본 파일은 그대로 있습니다.`, 4000)
}

// Songs taken out of the list, folded at the bottom so they can be put back.
let hiddenSongs = []
let showHidden = false

function hiddenSection () {
  const box = document.createElement('div')
  box.className = 'hidden-songs'
  const head = document.createElement('button')
  head.className = 'hidden-toggle'
  head.textContent = `${showHidden ? '▾' : '▸'} 목록에서 뺀 곡 ${hiddenSongs.length}곡`
  head.dataset.tip = '목록에서만 뺀 곡들입니다. 원본 파일은 그대로 있어요.'
  head.onclick = () => {
    showHidden = !showHidden
    renderSongs()
  }
  box.appendChild(head)
  if (showHidden) {
    for (const song of hiddenSongs) {
      const row = document.createElement('div')
      row.className = 'hidden-song'
      row.innerHTML = '<span class="name"></span><button class="ghost small">다시 넣기</button>'
      row.querySelector('.name').textContent = song.title || '무제'
      row.querySelector('button').onclick = () => setListed(song, true)
      box.appendChild(row)
    }
  }
  return box
}

// A speech-bubble tooltip for controls marked data-tip. It is fixed to the window so
// the scrolling song list cannot clip it, and it shows at once, unlike title=.
function wireTips () {
  const tip = document.createElement('div')
  tip.className = 'tip hidden'
  document.body.appendChild(tip)
  let owner = null
  const hide = () => {
    owner = null
    tip.classList.add('hidden')
  }
  document.addEventListener('mouseover', (event) => {
    const el = event.target.closest ? event.target.closest('[data-tip]') : null
    if (el === owner) return
    if (!el) return hide()
    owner = el
    tip.textContent = el.dataset.tip
    tip.classList.remove('hidden')
    const at = el.getBoundingClientRect()
    const size = tip.getBoundingClientRect()
    const left = Math.max(8, Math.min(at.left + at.width / 2 - size.width / 2, window.innerWidth - size.width - 8))
    const below = at.top - size.height - 10 < 8
    tip.style.left = `${left}px`
    tip.style.top = `${below ? at.bottom + 10 : at.top - size.height - 10}px`
    tip.style.setProperty('--arrow', `${at.left + at.width / 2 - left}px`)
    tip.classList.toggle('below', below)
  })
  document.addEventListener('mousedown', hide)
  document.addEventListener('scroll', hide, true)
  window.addEventListener('blur', hide)
}

// ▶ on a song: the mini player plays the list from that song (or pauses it).
function toggle (song) {
  if (!miniPlaying(song)) select(song)
  playFromSong(song)
}

// The song being made and the ones waiting sit at the top of the library, so the
// whole pipeline is visible in one column.
function runningCard () {
  const card = document.createElement('div')
  card.className = 'song making'
  card.innerHTML = `
    <div class="song-info">
      <div class="name" id="runTitle"></div>
      <div class="sub"><span id="runStage">준비 중</span> <span class="muted" id="runMeta"></span></div>
      <div class="bar"><div id="runBar"></div></div>
    </div>
    <button class="drop" id="runCancel" title="취소">✕</button>`
  card.querySelector('#runTitle').textContent = runningJob.title || '무제'
  if (runningJob.cancelling) markCancelling(card)
  card.querySelector('#runCancel').onclick = async (event) => {
    event.stopPropagation()
    if (!confirm('지금 만들고 있는 곡을 취소할까요?')) return
    runningJob.cancelling = true
    markCancelling(card)
    await window.yue.cancel()
  }
  return card
}

// The handle marks a card as draggable; the whole card can be dragged, though.
const GRIP = '<span class="grip" aria-hidden="true" title="끌어서 순서 바꾸기"></span>'

function sortable (card, group, id, count) {
  if (count < 2) return
  card.dataset.sortGroup = group
  card.dataset.sortId = id
  card.insertAdjacentHTML('afterbegin', GRIP)
  card.classList.add('sortable')
}

function waitingCard (item, index, total) {
  const card = document.createElement('div')
  card.className = 'song waiting'
  card.innerHTML = '<div class="song-info"><div class="name"></div><div class="sub"></div></div>' +
    '<button class="drop" title="대기 취소">✕</button>'
  card.querySelector('.name').textContent = item.title
  card.querySelector('.sub').textContent = queueState.paused
    ? `일시정지됨 · ${index + 1}번째`
    : `대기 중 · ${index + 1}번째`
  sortable(card, 'queue', item.jobId, total)
  card.querySelector('.drop').onclick = async (event) => {
    event.stopPropagation()
    const result = await window.yue.queueRemove(item.jobId)
    if (!result.ok) toast(result.message)
  }
  return card
}

function failedCard (item) {
  const card = document.createElement('div')
  card.className = 'song failed'
  card.innerHTML = '<div class="song-info"><div class="name"></div><div class="sub"></div></div>' +
    '<button class="retry" title="다시 시도">↻</button><button class="drop" title="목록에서 지우기">✕</button>'
  card.querySelector('.name').textContent = item.title
  card.querySelector('.sub').textContent = `실패 · ${item.message || '알 수 없는 오류'}`
  card.querySelector('.retry').onclick = async (event) => {
    event.stopPropagation()
    const result = await window.yue.queueRetry(item.jobId)
    if (!result.ok) toast(result.message)
  }
  card.querySelector('.drop').onclick = async (event) => {
    event.stopPropagation()
    await window.yue.queueDismiss(item.jobId)
  }
  return card
}

function renderSongs () {
  // Redrawing mid-drag would pull the card from under the pointer; the drag shows
  // whatever changed once it ends.
  if (Sortable.active) {
    Sortable.pending = true
    return
  }
  const list = $('songs')
  $('songSelectionBar').classList.toggle('hidden', deleteMode)
  if (typeof showPickCount === 'function') showPickCount()
  const waiting = queueState.waiting || []
  const broken = queueState.failed || []
  $('queueClear').classList.toggle('hidden', waiting.length === 0)
  $('queuePause').classList.toggle('hidden', waiting.length === 0 && !queueState.paused)
  $('queuePause').textContent = queueState.paused ? '재개' : '일시정지'
  if (!songs.length && !runningJob && !waiting.length && !broken.length) {
    list.innerHTML = hiddenSongs.length
      ? '<div class="empty">목록이 비어 있습니다.<br>뺀 곡은 아래에서 다시 넣을 수 있어요.</div>'
      : '<div class="empty">아직 만든 곡이 없습니다.<br>가사와 스타일을 적고<br>곡 만들기를 눌러보세요.</div>'
    if (hiddenSongs.length) list.appendChild(hiddenSection())
    return
  }
  list.innerHTML = ''
  if (runningJob) list.appendChild(runningCard())
  waiting.forEach((item, index) => list.appendChild(waitingCard(item, index, waiting.length)))
  broken.forEach((item) => list.appendChild(failedCard(item)))
  for (const song of songs) {
    const card = document.createElement('div')
    card.className = 'song' + (selected && selected.dir === song.dir ? ' active' : '') +
      (typeof miniPlayer !== 'undefined' && miniPlayer.dir === song.dir ? ' mini-now' : '')
    const length = song.seconds ? `${Math.floor(song.seconds / 60)}:${String(Math.round(song.seconds % 60)).padStart(2, '0')}` : ''
    card.innerHTML = '<div class="song-info"><div class="name"></div><div class="sub"></div></div>'
    card.querySelector('.name').textContent = song.title || song.id || '무제'
    // An unfinished song says how far it got, so resuming feels like continuing.
    const STAGE_NAMES = { plan: '악보', semantic: '노래', synth: '합성', decode: '저장' }
    const done = (song.stages || []).map((stage) => STAGE_NAMES[stage]).filter(Boolean)
    card.querySelector('.sub').textContent = song.scoreOnly
      ? '악보만 · 눌러서 악보 보기'
      : song.unfinished
        ? `미완성 · ${done.length ? `${done.join('·')} 완료 · ` : ''}눌러서 이어 만들기`
        : [song.imported ? '불러온 곡' : '', length, (song.createdAt || '').replace('T', ' ').slice(0, 16)].filter(Boolean).join(' · ')
    if (song.unfinished) {
      card.classList.add('unfinished')
      // A cancelled or failed song stays so it can be finished later — or thrown away.
      const drop = document.createElement('button')
      drop.className = 'drop'
      drop.title = '이 미완성 곡 삭제'
      drop.textContent = '✕'
      drop.onclick = async (event) => {
        event.stopPropagation()
        if (!confirm(`미완성 곡 "${song.title || '무제'}"을(를) 삭제할까요?\n(휴지통으로 이동)`)) return
        const result = await window.yue.remove(song.dir)
        if (!result.ok) return toast(result.message || '삭제하지 못했습니다.', 6000)
        await refresh()
        toast('미완성 곡을 삭제했습니다.')
      }
      card.appendChild(drop)
    } else {
      card.appendChild(playButton(song)) // 목록에서 바로 들어볼 수 있게
      card.appendChild(unlistButton(song))
      card.appendChild(removeButton(song))
    }
    if (deleteMode) {
      card.prepend(deletePickBox(song, card))
    } else if (!song.unfinished && typeof studioCheckbox === 'function') {
      // With "체크한 곡" chosen in the video studio, finished songs get a tick box.
      // Beside it, the square for the song's own video background.
      const bg = studioBackgroundBox(song)
      if (bg) card.prepend(bg)
      const box = studioCheckbox(song)
      if (box) card.prepend(box)
    }
    sortable(card, 'songs', song.folder, songs.length)
    card.onclick = () => {
      if (deleteMode) {
        const box = card.querySelector('.del-pick')
        box.checked = !box.checked
        box.onchange()
        return
      }
      if (song.scoreOnly) openScore(song)
      else if (song.unfinished) resume(song)
      else select(song)
    }
    list.appendChild(card)
  }
  if (hiddenSongs.length) list.appendChild(hiddenSection())
  if (typeof studioSongsChanged === 'function') studioSongsChanged()
}

// When each lyric line is sung: ACE-Step recorded it; YuE2's songs are timed from
// the score; anything else is spread over the song (renderer/srt.js).
async function songCues (song) {
  const recorded = song.lrc ? await window.yue.lrc(song.dir) : null
  if (recorded && recorded.ok) return cuesFromLrc(recorded.lrc, Number(song.seconds) || 0)
  const score = song.score ? await window.yue.score(song.dir) : null
  return lyricCues({ lyrics: song.lyrics, abc: score && score.ok ? score.abc : null, seconds: Number(song.seconds) || 0 })
}

// The words a song was sung with, or '' for an instrumental or imported one.
function lyricsOf (song) {
  if (!song || song.imported || song.instrumental || !song.lyrics) return ''
  return lyricSections(song.lyrics).some((section) => section.lines.length) ? song.lyrics : ''
}

function select (song) {
  selected = song
  $('player').classList.remove('hidden')
  $('nowTitle').textContent = song.title || song.id
  // A file brought in from elsewhere has no lyrics or style to copy.
  $('reuseSong').disabled = Boolean(song.imported)
  $('reuseSong').title = song.imported ? '불러온 곡에는 복제할 가사·스타일이 없습니다' : ''
  // Lyric subtitles need sung words; the tip says how the times will be found.
  const words = lyricsOf(song)
  $('exportSrt').disabled = !words
  const srtTip = !words
    ? (song.imported ? '불러온 곡에는 가사 정보가 없습니다' : '가사가 없는 곡(연주곡)입니다')
    : song.lrc
      ? '가사 자막(SRT) 저장\nACE-Step이 노래하며 기록한 가사 시각을 씁니다.'
    : song.score
      ? '가사 자막(SRT) 저장\n악보의 구간과 박자로 줄마다 시간을 추정합니다. 실제 노래와 조금 어긋날 수 있어요.'
      : '가사 자막(SRT) 저장\n악보가 없어 곡 길이에 맞춰 시간을 나눕니다. 편집기에서 맞춰 주세요.'
  $('exportSrt').dataset.tip = srtTip
  $('exportSrt').title = words ? '' : srtTip
  // Only a song that kept its score can be covered: the score is the tune.
  // With a score YuE2 sings the same tune; without one ACE-Step remakes it from the
  // song's sound.
  $('coverSong').disabled = !song.audio
  $('coverSong').title = song.score
    ? '원곡의 악보(멜로디)로 스타일만 바꿔 다시 만들기'
    : '원곡 소리를 바탕으로 스타일·가사를 바꿔 다시 만들기 (ACE-Step 1.5)'
  renderSongMeta(song)
  renderSongs()
  if (typeof showStudioInfo === 'function') showStudioInfo() // the video studio notes a changed selection
}

async function resume (song) {
  const names = { plan: '악보', semantic: '노래 생성', synth: '음향 합성' }
  const done = (song.stages || []).map((stage) => names[stage]).filter(Boolean)
  const detail = done.length
    ? `${done.join(', ')}까지 끝나 있어 그다음부터 이어집니다.`
    : '처음부터 만듭니다.'
  const question = running
    ? `"${song.title || '무제'}"를 대기열에 넣어 이어서 완성할까요?\n${detail}`
    : `"${song.title || '무제'}"를 이어서 완성할까요?\n${detail}`
  if (!confirm(question)) return
  const estimated = estimate(song.lyrics || '', { firstRun: !warmed })
  const result = await window.yue.resume(song.dir)
  if (!result.ok) return toast(result.message)
  plans.set(result.jobId, estimated)
  toast(result.position > 0
    ? `대기열 ${result.position}번째로 넣었습니다`
    : '이어서 만드는 중입니다', 5000)
}

// Long paths are cut in the middle: the drive and the last folders are what tell two
// locations apart. The full path is in the tooltip.
function shortPath (full) {
  if (!full) return ''
  const parts = full.split(/[\\/]/).filter(Boolean)
  return parts.length <= 3 ? full : `${parts[0]}\\…\\${parts.slice(-2).join('\\')}`
}

async function showLocations () {
  const settings = await window.yue.getSettings()
  $('songsDirText').textContent = shortPath(settings.songsDir) || '—'
  $('songsDirText').title = settings.songsDir || ''
  $('exportDirText').textContent = settings.exportDir
    ? shortPath(settings.exportDir)
    : '음악 폴더 (마지막 위치 기억)'
  $('exportDirText').title = settings.exportDir || settings.musicDir || ''
}

// Everything needed to reproduce a take, kept together and readable.
function renderSongMeta (song) {
  const rows = [
    ['길이', song.seconds
      ? (song.targetSeconds ? `${clock(song.seconds)} (목표 ${clock(song.targetSeconds)})` : clock(song.seconds))
      : null],
    ['형식', song.format === 'mp3' ? 'MP3 320kbps' : song.format === 'wav' ? '무손실 WAV' : null],
    ['시드', song.seed],
    ['작곡 방식', { full: '전체 (코드 + 멜로디)', melody: '멜로디만', off: '악보 없이' }[song.cot]],
    ['연주곡', song.instrumental ? '예 (보컬 차단)' : null],
    ['고급 설정', song.advanced && Object.keys(song.advanced).length
      ? Object.entries(song.advanced).map(([key, value]) => `${key}=${value}`).join(', ')
      : '기본값'],
    ['스타일', song.style],
    ['가사', song.lyrics ? song.lyrics.replace(/\n+/g, ' / ').slice(0, 300) : null],
    ['악보', song.score ? '있음 ([악보 보기]에서 확인)' : null],
    song.cover && song.cover.from === '녹음'
      ? ['만든 바탕', `내 녹음 (닮은 정도 ${{ 1: '많이 닮게', 0.8: '보통', 0.6: '자유롭게' }[song.cover.strength] || song.cover.strength})`]
      : ['커버 원곡', song.cover && song.cover.from
        ? `${song.cover.from} (원곡 소리로 · 닮은 정도 ${{ 1: '많이 닮게', 0.8: '보통', 0.6: '자유롭게' }[song.cover.strength] || song.cover.strength})`
        : null],
    ['만든 때', (song.createdAt || '').replace('T', ' ')],
    ['걸린 시간', song.wallSeconds ? `${Math.round(song.wallSeconds / 60)}분` : null],
    ['엔진', song.engine],
    ['프로그램', song.appVersion ? `Road Music ${song.appVersion}` : null],
    ['폴더', song.dir]
  ]
  $('songMeta').innerHTML = ''
  for (const [label, value] of rows) {
    if (value == null || value === '') continue
    const row = document.createElement('div')
    row.className = 'meta-row'
    row.innerHTML = '<span class="meta-key"></span><span class="meta-value"></span>'
    row.querySelector('.meta-key').textContent = label
    row.querySelector('.meta-value').textContent = String(value)
    $('songMeta').appendChild(row)
  }
  infoRows = rows
}

// "가사 점검" (lyricscheck.js): what may come out off the beat or mumbled, shown under
// the lyrics as a count while typing, and listed line by line in its own window.
function lyricsFindings () {
  const target = readTarget() || null
  return window.RoadLyricsCheck.checkLyrics($('lyrics').value, { targetSeconds: target })
}

function showLyricsCheckHint () {
  const hint = $('lyricsCheckHint')
  if ($('instrumental').checked || $('soundEffect').checked || !$('lyrics').value.trim()) return hint.classList.add('hidden')
  const { findings } = lyricsFindings()
  const warns = findings.filter((f) => f.level === 'warn').length
  hint.classList.remove('hidden')
  hint.classList.toggle('ok', findings.length === 0)
  hint.textContent = findings.length === 0 ? '가사 점검 ✓'
    : warns ? `가사 점검: 주의 ${warns}개` : `가사 점검: 참고 ${findings.length}개`
}

// Put the caret on a line of the lyrics and bring it into view.
function selectLyricsLine (index) {
  const box = $('lyrics')
  const lines = box.value.split('\n')
  const start = lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0)
  box.focus()
  box.setSelectionRange(start, start + (lines[index] || '').length)
  const lineHeight = parseFloat(getComputedStyle(box).lineHeight) || 20
  box.scrollTop = Math.max(0, index * lineHeight - box.clientHeight / 3)
}

function openLyricsCheck () {
  if (!$('lyrics').value.trim()) return toast('점검할 가사가 없습니다.')
  const { findings, sungLines, syllables, estimate } = lyricsFindings()
  const lines = $('lyrics').value.split('\n')
  $('lyricsCheckSummary').textContent = findings.length
    ? `${sungLines}줄 · ${syllables}음절 · 부르는 데 약 ${Math.max(1, Math.round(estimate / 6) / 10)}분 — 확인할 곳 ${findings.length}개`
    : `${sungLines}줄 · ${syllables}음절 · 부르는 데 약 ${Math.max(1, Math.round(estimate / 6) / 10)}분 — 걸리는 곳이 없습니다.`
  const fixes = $('lyricsCheckFixes')
  fixes.innerHTML = ''
  const fixButton = (label, run) => {
    const button = document.createElement('button')
    button.className = 'ghost small'
    button.textContent = label
    button.onclick = () => { run(); openLyricsCheck() }
    fixes.appendChild(button)
  }
  if (findings.some((f) => f.fix === 'numbers')) {
    fixButton('숫자를 한글 읽기로 바꾸기', () => {
      const box = $('lyrics')
      box.focus()
      box.select()
      const fixed = window.RoadLyricsCheck.numbersToHangul(box.value)
      if (!document.execCommand('insertText', false, fixed)) box.value = fixed
      updatePreview()
      showLyricsCheckHint()
    })
  }
  if (findings.some((f) => f.fix === 'sections')) fixButton('구간 나누기', () => $('autoSections').click())
  const list = $('lyricsCheckList')
  list.innerHTML = ''
  for (const finding of findings) {
    const item = document.createElement('li')
    item.className = finding.level
    item.innerHTML = '<span class="lc-line"></span><span class="lc-mark"></span><span class="lc-text"></span>'
    item.querySelector('.lc-line').textContent = `${finding.line + 1}번째 줄`
    item.querySelector('.lc-mark').textContent = finding.level === 'warn' ? '!' : 'i'
    item.querySelector('.lc-text').textContent = finding.message
    const quote = document.createElement('span')
    quote.className = 'lc-quote'
    quote.textContent = (lines[finding.line] || '').trim()
    item.querySelector('.lc-text').appendChild(quote)
    item.onclick = () => {
      $('lyricsCheck').classList.add('hidden')
      selectLyricsLine(finding.line)
    }
    list.appendChild(item)
  }
  $('lyricsCheck').classList.remove('hidden')
}

function wireLyricsCheck () {
  let timer = null
  const later = () => { clearTimeout(timer); timer = setTimeout(showLyricsCheckHint, 400) }
  $('lyrics').addEventListener('input', later)
  $('target').addEventListener('change', showLyricsCheckHint)
  $('instrumental').addEventListener('change', showLyricsCheckHint)
  $('lyricsCheckOpen').onclick = openLyricsCheck
  $('lyricsCheckHint').onclick = openLyricsCheck
  $('lyricsCheckClose').onclick = () => $('lyricsCheck').classList.add('hidden')
  $('lyricsCheck').onclick = (event) => { if (event.target === $('lyricsCheck')) $('lyricsCheck').classList.add('hidden') }
  showLyricsCheckHint()
}

// ── notice popup ──
// A free app shows the site's notices in a small box at the bottom right, a little
// after it opens. "오늘 그만 보기" hides it until tomorrow.
const NOTICE_HIDE_KEY = 'noticeHiddenOn'
const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD, local time
let notices = []
let noticeAt = 0

// Notices are written in Markdown (and sometimes pasted with escapes); the box shows
// a few plain lines of it.
function noticePlain (text) {
  return String(text || '')
    .replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/^\s*[-+]\s+/gm, '· ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function showNotice (index) {
  noticeAt = (index + notices.length) % notices.length
  const notice = notices[noticeAt]
  $('noticeTitle').textContent = notice.title
  $('noticeDate').textContent = notice.date || ''
  const plain = noticePlain(notice.body)
  // The body often starts by repeating the title.
  $('noticeBody').textContent = plain.startsWith(notice.title) ? plain.slice(notice.title.length).trim() : plain
  $('noticeCount').textContent = notices.length > 1 ? `${noticeAt + 1}/${notices.length}` : ''
  $('noticePrev').classList.toggle('hidden', notices.length < 2)
  $('noticeNext').classList.toggle('hidden', notices.length < 2)
}

async function startNotices () {
  try {
    if (localStorage.getItem(NOTICE_HIDE_KEY) === today()) return
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 6000))
  const result = await window.yue.latestNotices().catch(() => null)
  if (!result || !result.ok || !result.notices.length) return
  notices = result.notices
  showNotice(0)
  $('noticePop').classList.remove('hidden')
}

function wireNotices () {
  const close = () => $('noticePop').classList.add('hidden')
  const open = (event) => {
    if (event) event.preventDefault()
    const notice = notices[noticeAt]
    if (notice) window.yue.openNotice(notice.url)
  }
  $('noticeClose').onclick = close
  $('noticeToday').onclick = () => {
    localStorageSet(NOTICE_HIDE_KEY, today())
    close()
  }
  $('noticeMore').onclick = open
  $('noticeTitle').onclick = open
  $('noticePrev').onclick = () => showNotice(noticeAt - 1)
  $('noticeNext').onclick = () => showNotice(noticeAt + 1)
  startNotices()
}

// "크게 보기": the same details in a wide window, with the lyrics whole.
let infoRows = []
function openSongInfo () {
  if (!selected) return
  const song = selected
  $('songInfoTitle').textContent = song.title || '무제'
  $('songInfoSub').textContent = [song.engine, (song.createdAt || '').replace('T', ' ').slice(0, 16)].filter(Boolean).join(' · ')
  const box = $('songInfoMeta')
  box.innerHTML = ''
  for (const [label, value] of infoRows) {
    if (value == null || value === '' || label === '가사') continue
    const key = document.createElement('span')
    key.className = 'meta-key'
    key.textContent = label
    const val = document.createElement('span')
    val.className = 'meta-value'
    val.textContent = String(value)
    box.append(key, val)
  }
  $('songInfoLyrics').textContent = song.lyrics || (song.instrumental ? '(연주곡 — 가사 없음)' : '(가사 없음)')
  $('songInfoCopy').disabled = !song.lyrics
  $('songInfo').classList.remove('hidden')
}

function wireSongInfo () {
  $('songInfoOpen').onclick = (event) => {
    event.preventDefault() // the button sits in the <summary>: open the window, not the fold
    openSongInfo()
  }
  $('songInfoClose').onclick = () => $('songInfo').classList.add('hidden')
  $('songInfo').onclick = (event) => { if (event.target === $('songInfo')) $('songInfo').classList.add('hidden') }
  $('songInfoCopy').onclick = async () => {
    if (!selected || !selected.lyrics) return
    try {
      await navigator.clipboard.writeText(selected.lyrics)
      toast('가사를 복사했습니다.')
    } catch {
      toast('가사를 복사하지 못했습니다.')
    }
  }
}

async function renderProjects () {
  const state = await window.yue.projects()
  currentProject = state.current
  const select = $('project')
  select.innerHTML = ''
  for (const project of state.projects) {
    const option = document.createElement('option')
    option.value = project.name
    option.textContent = `${project.name} (${project.songs})`
    option.selected = project.name === state.current
    select.appendChild(option)
  }
}

async function refresh () {
  await renderProjects()
  songs = await window.yue.listSongs()
  hiddenSongs = await window.yue.hiddenSongs()
  if (!hiddenSongs.length) showHidden = false
  if (selected) selected = songs.find((s) => s.dir === selected.dir) || null
  renderSongs()
  if (typeof showStudioInfo === 'function') showStudioInfo()
}

// ── generation ───────────────────────────────────────────────────────────────
function stageProgress (stage, fraction) {
  let base = 0
  for (const key of ORDER) {
    if (key === stage) break
    base += plan.weights[key]
  }
  return Math.min(0.995, base + plan.weights[stage] * clamp(fraction, 0, 1))
}

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

// A title made up from lyrics: at most `max` characters, cut at a space where one is
// near, so "창문을 열면 불빛이 흘러 한강 위로…" becomes "창문을 열면 불빛이 흘러".
function shortTitle (text, max = 20) {
  const line = String(text || '').replace(/\s+/g, ' ').trim()
  if (line.length <= max) return line
  const cut = line.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space >= max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.·…]+$/, '')
}

const minutes = (seconds) => seconds >= 3600
  ? `${Math.floor(seconds / 3600)}시간 ${Math.round((seconds % 3600) / 60)}분`
  : `${Math.max(1, Math.round(seconds / 60))}분`

// The engine checks for a cancel between steps; while it is still starting up, or
// preparing the first song on the graphics card, that can take a minute. The card
// says so, rather than looking as if the button did nothing.
function markCancelling (card) {
  card.querySelector('#runStage').textContent = '취소하는 중…'
  card.querySelector('#runMeta').textContent = '지금 단계가 끝나는 대로 멈춥니다'
  card.querySelector('#runCancel').disabled = true
}

function showProgress (stage, fraction, note) {
  // Writes into the card at the top of the library; nothing to do before it exists.
  const bar = $('runBar')
  if (!bar) return
  if (runningJob && runningJob.cancelling) return
  $('runStage').textContent = (plan.labels && plan.labels[stage]) || (STAGES[stage] ? STAGES[stage].label : stage)
  const done = stageProgress(stage, fraction)
  bar.style.width = `${(done * 100).toFixed(1)}%`
  const elapsed = (Date.now() - jobStart) / 1000
  // Blend the up-front estimate with the pace this run is actually keeping, so a
  // slower or faster machine converges instead of showing a fixed guess.
  const projected = done > 0.05 ? elapsed / done : plan.total
  const totalSeconds = done > 0.05 ? (projected + plan.total) / 2 : plan.total
  const eta = `약 ${minutes(Math.max(0, totalSeconds - elapsed))} 남음`
  $('runMeta').textContent = note ? `${note} · ${eta}` : eta
}

function setRunning (on) {
  running = on
  // The button stays available while a song is being made: pressing it adds the next
  // song to the queue instead of starting a second one.
  $('generate').textContent = on ? '대기열에 추가' : '곡 만들기'
  $('generateHint').textContent = on ? '오른쪽에서 진행 상황을 볼 수 있습니다' : ''
}

function wireJobs () {
  window.yue.onQueue((state) => {
    queueState = state
    renderSongs()
  })
  window.yue.onJobStarted(({ jobId, title }) => {
    runningJob = { jobId, title }
    plan = plans.get(jobId) || estimate('')
    warmed = true
    jobStart = Date.now()
    setRunning(true)
    renderSongs() // 카드를 먼저 만들고 그 안에 진행 상황을 쓴다
    showProgress('plan', 0)
  })
  window.yue.onJobEvent((event) => {
    if (event.type === 'stage' && event.stage === 'load') {
      showProgress('plan', 0, '모델 불러오는 중 (처음 한 번만 오래 걸립니다)')
    } else if (event.type === 'stage' && event.status === 'start') {
      showProgress(event.stage, 0)
    } else if (event.type === 'notice') {
      toast(event.message, 6000)
    } else if (event.type === 'progress') {
      // YuE2 counts tokens; ACE-Step (and YuE2's synthesis) report steps.
      if (event.steps) showProgress(event.stage, event.step / event.steps)
      else showProgress(event.stage, event.tokens / plan.tokens[event.stage],
        `초당 ${event.rate}개`)
    }
  })
  window.yue.onJobDone(async (song) => {
    showProgress('decode', 1, '완성!')
    plans.delete(runningJob && runningJob.jobId)
    runningJob = null
    setRunning(false)
    // The finished song goes into the list at once. The next song in the queue starts
    // in the same moment and its card replaces this one's; waiting for the reload
    // below (slower while the engine is busy) left the new song missing in between.
    if (song && song.dir && song.audio && !songs.some((item) => item.dir === song.dir)) {
      songs.unshift({ ...song, folder: song.dir.split(/[\\/]/).pop(), unfinished: false,
        format: /\.mp3$/i.test(song.audio) ? 'mp3' : 'wav' })
      renderSongs()
    }
    await refresh()
    if (song && song.scoreOnly) {
      const draft = songs.find((item) => item.dir === song.dir)
      if (draft) openScore(draft) // 악보가 나오면 바로 열어 준다
      toast('악보가 나왔습니다. 고친 뒤 "이 악보로 곡 만들기"를 누르세요.', 8000)
      return
    }
    if (songs[0]) select(songs[0])
    const cut = song && song.truncated && song.truncated.semantic
    // With a target, the first thing anyone checks is how close it landed.
    const length = song && song.targetSeconds && song.seconds
      ? ` (목표 ${clock(song.targetSeconds)} · 실제 ${clock(song.seconds)})`
      : ''
    toast(cut
      ? `곡이 완성됐지만 가사가 길어 끝부분이 잘렸습니다${length}. 가사를 줄이면 끝까지 나옵니다.`
      : `곡이 완성되었습니다 🎵${length}`, cut || length ? 9000 : 3000)
  })
  window.yue.onJobError((event) => {
    plans.delete(runningJob && runningJob.jobId)
    runningJob = null
    setRunning(false)
    if (event.cancelled) toast('생성을 취소했습니다.')
    else showProblem(event.message, event.detail)
    refresh()
  })
}

// A crash message needs room and a copy button; a toast would cut it off.
function showProblem (message, detail, title = '곡을 만들지 못했습니다') {
  $('problemTitle').textContent = title
  $('problemText').textContent = message
  $('problemDetail').textContent = detail || ''
  $('problemDetail').classList.toggle('hidden', !detail)
  // Copy and log only make sense for an actual failure.
  const failure = title === '곡을 만들지 못했습니다'
  $('problemCopy').classList.toggle('hidden', !failure)
  $('problemLog').classList.toggle('hidden', !failure)
  $('problemReport').classList.toggle('hidden', !failure)
  // Straight to the feedback form: the error written in, the recent log ticked.
  $('problemReport').onclick = async () => {
    $('problem').classList.add('hidden')
    await openAbout()
    $('aboutFeedback').classList.remove('hidden')
    $('fbKind').value = 'report'
    $('fbLog').checked = true
    $('fbSystem').checked = true
    $('fbMessage').value = `[오류] ${message}`.slice(0, 3000)
    $('fbEmail').focus()
  }
  $('problem').classList.remove('hidden')
  $('problemCopy').onclick = async () => {
    await navigator.clipboard.writeText([message, detail].filter(Boolean).join('\n\n'))
    toast('오류 내용을 복사했습니다.')
  }
  $('problemClose').onclick = () => $('problem').classList.add('hidden')
  $('problemLog').onclick = () => window.yue.openLog()
}

// Electron blocks window.prompt(), so text input gets its own small dialog.
function askText (title, value = '', { allowEmpty = false } = {}) {
  return new Promise((resolve) => {
    const input = $('askInput')
    $('askTitle').textContent = title
    input.value = value
    $('ask').classList.remove('hidden')
    input.focus()
    input.select()
    const close = (answer) => {
      $('ask').classList.add('hidden')
      input.onkeydown = null
      resolve(answer)
    }
    const answer = () => input.value.trim() || (allowEmpty ? '' : null)
    $('askOk').onclick = () => close(answer())
    $('askCancel').onclick = () => close(null)
    input.onkeydown = (event) => {
      if (event.key === 'Enter') close(answer())
      if (event.key === 'Escape') close(null)
    }
  })
}

function toast (message, ms = 3000) {
  const el = $('toast')
  el.textContent = message
  el.classList.remove('hidden')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => el.classList.add('hidden'), ms)
}

// ── score (ABC) ──────────────────────────────────────────────────────────────
// Same rewrite rules the worker uses: chord symbols are protected, pitches become
// rests, and ties left hanging on a rest are dropped.
const CHORD = /"[^"]*"/g
const NOTE_GROUP = /\[(?:[_^=]*[A-Ga-g][,']*\d*\/?\d*)+\]/g
const NOTE = /[_^=]*[A-Ga-g][,']*/g

function restVoice (abc, voiceName) {
  let voice = null
  return abc.split('\n').map((line) => {
    const header = line.match(/^V:\s*(\w+)/)
    if (header) {
      voice = header[1]
      return line
    }
    if (voice !== voiceName || !line || /^[A-Za-z]:/.test(line) || line.startsWith('%')) return line
    const symbols = line.match(CHORD) || []
    let body = line.replace(CHORD, '\u0000').replace(NOTE_GROUP, 'z').replace(NOTE, 'z')
    body = body.replace(/(z[0-9/]*)-/g, '$1')
    for (const symbol of symbols) body = body.replace('\u0000', symbol)
    return body
  }).join('\n')
}

const dropChords = (abc) => abc.replace(CHORD, '')

let scoreSong = null
let scoreOriginal = ''
// 'song' edits the score of a finished song; 'import' takes one from outside.
let scoreMode = 'song'
let importName = ''
let lastCheck = { text: null, result: null }

// ── cover and imported scores ────────────────────────────────────────────────
// Both hand the model a finished score — melody, chords, bars — to sing under the
// current style and lyrics. A cover takes it from a finished song; an import from a
// MIDI or ABC file. Nothing of any old recording is reused.
let coverFrom = null

const hasChordSymbols = (abc) => /"[^"\n]+"/.test(String(abc || '').split('\n').filter((line) => !/^V:/.test(line)).join('\n'))

function showCover () {
  $('coverBar').classList.toggle('hidden', !coverFrom)
  $('coverStrengthRow').classList.toggle('hidden', !coverFrom || !['audio', 'recording'].includes(coverFrom.source))
  if (!coverFrom) return
  const imported = coverFrom.source === 'import'
  const sound = coverFrom.source === 'audio'
  if (coverFrom.source === 'recording') {
    const stretched = coverFrom.targetSeconds > coverFrom.seconds + 1
    $('coverBar').querySelector('b').textContent = '녹음'
    $('coverFrom').textContent = `${coverFrom.title} · ${clock(coverFrom.seconds)}${stretched ? ` → 약 ${clock(coverFrom.targetSeconds)}` : ''}`
    $('coverBar').querySelector('.muted').textContent =
      'ACE-Step 1.5가 녹음의 멜로디·리듬·코드 흐름을 읽어 지금 적은 스타일·가사로 곡을 만듭니다.'
    return
  }
  $('coverBar').querySelector('b').textContent = imported ? '불러온 악보' : '커버'
  $('coverFrom').textContent = imported
    ? `"${coverFrom.title}"${coverFrom.seconds ? ` · ${clock(coverFrom.seconds)}` : ''}`
    : sound ? `"${coverFrom.title}"의 소리로` : `"${coverFrom.title}"의 악보로`
  $('coverBar').querySelector('.muted').textContent = imported
    ? `이 멜로디${coverFrom.hasChords ? '와 코드' : ''}에 지금 적은 가사·스타일을 입혀 만듭니다. 곡 길이는 악보가 정합니다.`
    : sound
      ? 'ACE-Step 1.5가 원곡의 멜로디·리듬·구성을 바탕으로 지금 적은 스타일·가사로 다시 만듭니다. 길이는 원곡과 같습니다.'
      : '원곡의 멜로디·화성을 그대로 두고 스타일·가사만 새로 만듭니다.'
}

// A cover keeps the original's tune under a new style. A song with a score goes to
// YuE2, which sings that exact score; any other song (made with ACE-Step, made without
// a score, or brought in from elsewhere) is remade from its sound by ACE-Step.
async function startCover (song) {
  const result = song.score ? await window.yue.score(song.dir) : { ok: false }
  if (!result.ok || (!enginesInstalled.yue && enginesInstalled.ace)) return startSoundCover(song)
  coverFrom = { source: 'cover', dir: song.dir, abc: result.abc, title: song.title || '무제',
    hasChords: hasChordSymbols(result.abc) }
  useScoreEngine()
  const instrumental = Boolean(song.instrumental)
  $('instrumental').checked = instrumental
  $('instrumental').onchange()
  const request = userRequest(song)
  if (!instrumental) $('lyrics').value = request.lyrics
  writeParts(request.parts)
  $('title').value = `${song.title || '무제'} (커버)`
  $('seed').value = ''
  // The score fixes the tune, so the arrangement knobs are the ones that matter;
  // the score-stage settings no longer apply.
  writeAdvanced({ ...request.advanced, cot: song.cot === 'off' ? 'full' : song.cot })
  setSoundEffect(false)
  setTarget(song.targetSeconds)
  showCover()
  document.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'))
  $('style').focus()
  $('style').scrollIntoView({ block: 'nearest' })
  toast('스타일 프롬프트를 새로 적고 "곡 만들기"를 누르세요. 가사도 바꿀 수 있지만, ' +
    '원곡과 글자 수가 많이 다르면 멜로디에 얹히지 않을 수 있습니다.', 10000)
}

function startSoundCover (song) {
  if (!enginesInstalled.ace) {
    openEngines()
    return toast('악보가 없는 곡의 커버는 ACE-Step 1.5 엔진이 원곡 소리를 바탕으로 만듭니다. ' +
      '"AI 엔진"에서 ACE-Step 1.5를 설치해 주세요.', 9000)
  }
  coverFrom = { source: 'audio', dir: song.dir, title: song.title || '무제', seconds: Number(song.seconds) || 0, hasChords: false }
  if (currentEngine() !== 'ace') {
    $('engine').value = 'ace'
    applyEngineUi()
  }
  // The original's words and style come back to be changed; a song brought in from
  // elsewhere has none, so those are for the user to write.
  const instrumental = Boolean(song.instrumental)
  $('instrumental').checked = instrumental
  $('instrumental').onchange()
  const request = userRequest(song)
  if (!instrumental) $('lyrics').value = song.imported ? '' : request.lyrics
  if (!song.imported) writeParts(request.parts)
  $('title').value = `${song.title || '무제'} (커버)`
  $('seed').value = ''
  setSoundEffect(false)
  setTarget(null)
  showCover()
  document.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'))
  $('style').focus()
  $('style').scrollIntoView({ block: 'nearest' })
  toast(song.imported
    ? '원곡 소리를 바탕으로 다시 만듭니다. 스타일을 새로 적고, 부를 가사를 적거나 "가사 없이 (연주곡)"을 고른 뒤 "곡 만들기"를 누르세요.'
    : '원곡의 멜로디·리듬·구성을 바탕으로 다시 만듭니다. 스타일(과 가사)을 새로 적고 "곡 만들기"를 누르세요. ' +
      '"원곡 닮은 정도"로 얼마나 따라갈지 고를 수 있어요.', 10000)
}

async function openScore (song) {
  const result = await window.yue.score(song.dir)
  if (!result.ok) return toast(result.message)
  scoreSong = song
  scoreOriginal = result.abc
  setScoreMode('song')
  $('scoreTitle').textContent = song.title || ''
  // An instrumental keeps its vocal line empty no matter what is edited here.
  $('scoreInstrumental').classList.toggle('hidden', !song.instrumental)
  $('scoreText').value = result.abc
  showScoreRequest(song)
  markScore()
  $('score').classList.remove('hidden')
}

// The same window serves both jobs; only the introduction, the file controls and
// the final button differ.
function setScoreMode (mode) {
  scoreMode = mode
  const imported = mode === 'import'
  $('scoreIntroSong').classList.toggle('hidden', imported)
  $('scoreIntroImport').classList.toggle('hidden', !imported)
  $('scoreImportBar').classList.toggle('hidden', !imported)
  $('scoreRequestBox').classList.toggle('hidden', imported)
  if (!imported) $('midiPanel').classList.add('hidden')
  $('scoreInstrumental').classList.add('hidden')
  $('scoreText').placeholder = imported
    ? 'X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=90\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\n' +
      'V: Ins clef=treble name="Ins Melody" snm="Inst."\nK:C\nV: Vocal\n"C"c4e4g4e4|…'
    : ''
}

function openImport () {
  scoreSong = null
  setScoreMode('import')
  $('scoreTitle').textContent = importName ? `· ${importName}` : '불러오기'
  $('scoreFileName').textContent = importName ? `${importName}` : ''
  scoreOriginal = $('scoreText').value = coverFrom && coverFrom.source === 'import' ? coverFrom.abc : ''
  markScore()
  $('score').classList.remove('hidden')
}

// ── MIDI track choice ──
function fillMidiPanel (result) {
  const describe = (part) => `${part.name} · ${part.count}음${part.range ? ` · ${part.range}` : ''}` +
    `${part.chordy ? ' · 화음' : ''}${part.drums ? ' · 드럼' : ''}`
  for (const [id, value] of [['midiVocal', result.choice.vocal], ['midiIns', result.choice.ins]]) {
    const select = $(id)
    select.innerHTML = ''
    select.appendChild(new Option(id === 'midiVocal' ? '없음 (보컬 없이 연주곡)' : '없음', ''))
    for (const part of result.parts) {
      const option = new Option(describe(part), part.id)
      option.disabled = part.drums // drums have no pitch line to sing or play
      select.appendChild(option)
    }
    select.value = value || ''
  }
  $('midiChords').checked = result.choice.chords
  showMidiNotes(result.result)
  $('midiPanel').classList.remove('hidden')
}

function showMidiNotes (result) {
  const facts = [`${result.key} 조`, `${result.meter}`, `${result.tempo} BPM`, `${result.bars}마디`,
    result.chords ? '코드 있음' : '코드 없음 (멜로디만)']
  $('midiNotes').textContent = [facts.join(' · '), ...result.notes].join('\n')
}

// Every edit is checked by YuE2's validator, a moment after typing stops.
function scheduleCheck () {
  clearTimeout(scheduleCheck.timer)
  scheduleCheck.timer = setTimeout(runCheck, 450)
}

async function runCheck () {
  const text = $('scoreText').value
  if (lastCheck.text === text && lastCheck.result) return lastCheck.result
  const line = $('scoreCheck')
  if (!text.trim()) {
    line.className = 'score-check'
    line.textContent = scoreMode === 'import' ? '파일을 열거나 ABC 악보를 붙여넣으세요.' : ''
    lastCheck = { text, result: null }
    return null
  }
  line.className = 'score-check'
  line.textContent = '규칙 검사 중…'
  const result = await window.yue.checkScore(text)
  if ($('scoreText').value !== text) return result // edited again meanwhile; a newer check follows
  lastCheck = { text, result }
  if (result.ok) {
    line.className = 'score-check good'
    line.textContent = `✓ YuE2 악보 규칙 통과 · ${clock(result.seconds)} · ${result.measures}마디 · ` +
      `보컬 음 ${result.vocalNotes}개 · 반주 음 ${result.insNotes}개 · 코드 ${result.chords}개`
  } else {
    line.className = 'score-check bad'
    line.textContent = `✗ YuE2 악보 규칙에 맞지 않습니다 — ${explainCheck(result.error)}`
    line.title = result.error // the checker's own words, for anyone fixing the ABC by hand
  }
  return result
}

// Reads the score back in words: the sections, how busy each line is, and — the
// question behind most "why is there a cello?" reports — whether the plan could have
// chosen an instrument at all. YuE2's native score cannot: it has no such field.
function showScoreInfo (abc) {
  const info = analyzeScore(abc)
  const box = $('scoreInfo')
  box.innerHTML = ''
  const row = (label, value, className = '') => {
    const line = document.createElement('div')
    line.className = `score-row ${className}`
    const key = document.createElement('span')
    key.className = 'score-key'
    key.textContent = label
    const text = document.createElement('span')
    text.textContent = value
    line.append(key, text)
    box.appendChild(line)
  }
  row('박자·템포', [info.meter, info.tempo && `${info.tempo} BPM`, info.key && `${info.key} 조`]
    .filter(Boolean).join(' · ') || '표시 없음')
  const sections = info.sections
    .map((item) => `${SECTION_NAMES[item.name] || item.name} ${item.bars}마디`)
  row('구간', sections.length ? sections.join(' → ') : '구간 표시 없음')
  row('보컬 멜로디', info.vocalNotes ? `음표 ${info.vocalNotes}개` : '없음 (쉼표만 — 보컬이 나오지 않습니다)')
  row('반주 멜로디', info.insNotes ? `음표 ${info.insNotes}개 (한 줄짜리 멜로디)` : '없음')
  row('코드', info.chords ? `${info.chords}개` : '없음 (멜로디만 있는 악보)')
  row('악기 정보', info.namesInstruments
    ? '악보에 악기 지정이 있습니다 (YuE2 기본 형식이 아닙니다)'
    : '없음 — 이 악보는 어떤 악기로 연주할지 정하지 않습니다', 'score-instruments')
  if (!info.namesInstruments) {
    const note = document.createElement('p')
    note.className = 'score-note'
    note.textContent = 'YuE2 악보에는 보컬 멜로디, 반주 멜로디 한 줄, 코드만 있습니다. 기타인지 첼로인지는 ' +
      '다음 단계(음원 만들기)에서 스타일 태그를 보고 정해집니다. 그래서 원하지 않은 악기가 들렸다면 ' +
      '악보 단계가 아니라 음원 단계에서 생긴 것이고, 악보를 고쳐서는 바꿀 수 없습니다. ' +
      '스타일 태그를 바꾸거나 같은 악보로 여러 번 만들어 골라주세요.'
    box.appendChild(note)
  }
}

// What the model was actually given, so a surprise can be traced to the request.
function showScoreRequest (song) {
  const box = $('scoreRequest')
  box.innerHTML = ''
  const add = (label, value) => {
    if (!value) return
    const title = document.createElement('div')
    title.className = 'score-key'
    title.textContent = label
    const body = document.createElement('pre')
    body.className = 'score-request-text'
    body.textContent = value
    box.append(title, body)
  }
  const parts = song.parts || {}
  add('고른 악기', (parts.instruments || [])
    .map((value) => (INSTRUMENTS.find((item) => item.value === value) || {}).label || value).join(', '))
  add('스타일 태그 [Tags]', song.style)
  add('가사 [Lyrics]', song.lyrics)
}

function markScore () {
  showScoreInfo($('scoreText').value)
  scheduleCheck()
  const changed = $('scoreText').value !== scoreOriginal
  $('scoreState').textContent = changed ? '· 수정됨' : '· 원본'
  $('scoreRender').textContent = scoreMode === 'import'
    ? '이 악보 쓰기'
    : changed ? '수정한 악보로 만들기' : '이 악보로 곡 만들기'
}

// ── advanced settings ────────────────────────────────────────────────────────
// Empty means "use YuE2's own default", so only what the user typed is sent.
const ADVANCED = {
  advTemperature: 'temperature',
  advTopP: 'topP',
  advTopK: 'topK',
  advRepetitionPenalty: 'repetitionPenalty',
  advCfgScale: 'cfgScale',
  advAbcTemperature: 'abcTemperature',
  advAbcMaxTokens: 'abcMaxTokens',
  advOdeSteps: 'odeSteps'
}
const TOKENS_PER_SECOND = 25 // the codec's frame rate; length is set in seconds here

// Aiming at a length: the cap ends the song, and min_tokens keeps the model from
// finishing early. Long targets also need material to fill — hence the extra
// instrumental sections and the arrangement hint.
const LONG_FORM = 'extended arrangement, instrumental intro, an instrumental interlude ' +
  'and a solo section between verses, a final chorus and an outro, ' +
  'let sections breathe rather than rushing'
const FILLER_SECTIONS = '\n\n[Interlude]\n[instrumental]\n\n[Solo]\n[instrumental]\n\n[Outro]\n[instrumental]'

// A saved request holds what was sent to the model, including the clauses and
// sections the app added on its own. Loading it back for another take strips them,
// so they are not added a second time and the box shows only what the user wrote.
function userRequest (song) {
  let style = song.style || ''
  const onlyListed = style.includes(ONLY_LISTED)
  for (const clause of [LONG_FORM, NO_VOICE, ONLY_LISTED]) style = style.split(`, ${clause}`).join('')
  // Songs from 0.12 on keep the builder's fields; older ones only the finished tags.
  const parts = song.parts
    ? { ...song.parts }
    : { genre: style, strict: onlyListed }
  let lyrics = song.lyrics || ''
  if (lyrics.endsWith(FILLER_SECTIONS)) lyrics = lyrics.slice(0, -FILLER_SECTIONS.length)
  // A target length writes its own token limits into the request. Loaded back into
  // the expert panel they would pin the length and override whatever target is picked
  // next, so only knobs the user set by hand come back.
  const advanced = { ...(song.advanced || {}) }
  if (song.targetSeconds) {
    delete advanced.maxTokens
    delete advanced.minTokens
  }
  // Likewise the guidance "프롬프트 강하게" added: it comes back as the checkbox.
  if (parts.strong && advanced.cfgScale === STRONG_CFG) delete advanced.cfgScale
  return { style, lyrics, onlyListed, parts, advanced }
}

function readTarget () {
  if ($('target').value === '') return null
  if ($('target').value !== 'custom') return Number($('target').value)
  const raw = $('targetCustom').value.trim()
  return raw === '' ? NaN : Number(raw)
}

function updateTarget () {
  $('targetCustomRow').classList.toggle('hidden', $('target').value !== 'custom')
  $('targetCustom').min = currentEngine() === 'ace' ? 1 : 20
  $('targetCustom').max = $('soundEffect')?.checked ? 30 : currentEngine() === 'ace' ? 600 : 360
  for (const option of $('target').options) {
    option.disabled = option.value !== '' && option.value !== 'custom' &&
      (Number(option.value) < Number($('targetCustom').min) || Number(option.value) > Number($('targetCustom').max))
  }
  if ([...$('target').options].some(option => option.value === $('target').value && option.disabled)) $('target').value = ''
  showLyricsCheckHint()
}

function setTarget (seconds) {
  const value = seconds == null ? '' : String(seconds)
  const preset = [...$('target').options].some(option => option.value === value)
  $('target').value = preset ? value : 'custom'
  $('targetCustom').value = preset ? '' : value
  updateTarget()
}

function lengthPlan (seconds, lyrics) {
  if (!seconds) return null
  const tokens = Math.min(Math.round(seconds * TOKENS_PER_SECOND), MAX_SONG_TOKENS)
  const words = lyrics.replace(/^\s*\[.*\]\s*$/gm, '').replace(/\s/g, '').length
  return {
    seconds,
    maxTokens: tokens,
    minTokens: Math.round(tokens * 0.82), // 목표의 82% 전에는 끝내지 않는다
    longForm: seconds >= 240,
    // Four minutes of song needs more than a verse and a chorus to sing.
    needsFiller: seconds >= 240 && words < seconds * 2.2
  }
}

function readAdvanced () {
  const values = {}
  for (const [id, key] of Object.entries(ADVANCED)) {
    const raw = $(id).value.trim()
    if (raw !== '') values[key] = Number(raw)
  }
  const seconds = $('advMaxSeconds').value.trim()
  if (seconds !== '') values.maxTokens = Math.round(Number(seconds) * TOKENS_PER_SECOND)
  return values
}

function writeAdvanced (values = {}) {
  for (const [id, key] of Object.entries(ADVANCED)) {
    $(id).value = values[key] == null ? '' : values[key]
  }
  $('advMaxSeconds').value = values.maxTokens == null
    ? ''
    : Math.round(values.maxTokens / TOKENS_PER_SECOND)
  $('advCot').value = values.cot || 'full'
  showAdvancedState()
}

function showAdvancedState () {
  const count = Object.keys(readAdvanced()).length + ($('advCot').value === 'full' ? 0 : 1)
  $('advancedState').textContent = count ? `· ${count}개 변경됨` : '· 기본값'
}

// ── prompt builder ───────────────────────────────────────────────────────────
// Style, instruments, tempo and structure are asked for separately and assembled into
// one tag line (composeStyle in prompt.js); the preview shows exactly what is sent.
const INSTRUMENT_SLOTS = ['inst1', 'inst2', 'inst3']
const STRONG_CFG = 1.5

// Said plainly because users expect a hard lock and YuE2 has none to offer.
const BUILDER_HINT = {
  plain: '악기를 고르면 YuE2가 알아듣는 형식("two classical guitars, classical guitar duet")으로 태그를 만들어 줍니다.',
  strict: '⚠ 악기는 "요청"까지만 됩니다. YuE2가 쓰는 악보에는 보컬 멜로디, 반주 멜로디 한 줄, 코드만 있고 ' +
    '악기를 적는 칸이 없습니다. 어떤 악기 소리가 날지는 음원을 만드는 단계에서 이 태그를 보고 정해지기 때문에, ' +
    '엄격 모드로도 다른 악기가 섞이는 것을 완전히 막을 수는 없습니다. 섞이면 "한 번에 3곡"으로 만들어 골라주세요. ' +
    '보컬 끄기("가사 없이")는 악보 단계에서 강제로 적용됩니다.'
}

function fillBuilder () {
  INSTRUMENT_SLOTS.forEach((id, index) => {
    const select = $(id)
    select.innerHTML = ''
    select.appendChild(new Option(index === 0 ? '악기 선택' : '＋ 악기', ''))
    for (const item of INSTRUMENTS) select.appendChild(new Option(item.label, item.value))
  })
  const structure = $('structure')
  structure.innerHTML = ''
  for (const item of STRUCTURES) structure.appendChild(new Option(item.label, item.value))
}

function readParts () {
  return {
    genre: $('style').value.trim(),
    instruments: INSTRUMENT_SLOTS.map((id) => $(id).value).filter(Boolean),
    bpm: Number($('bpm').value) || null,
    strict: $('onlyListed').checked,
    strong: $('onlyListed').checked && $('strongPrompt').checked,
    structure: $('structure').value
  }
}

function writeParts (parts = {}) {
  $('style').value = parts.genre || ''
  INSTRUMENT_SLOTS.forEach((id, index) => { $(id).value = (parts.instruments || [])[index] || '' })
  $('bpm').value = parts.bpm || ''
  $('onlyListed').checked = Boolean(parts.strict)
  $('strongPrompt').checked = Boolean(parts.strong)
  $('structure').value = parts.structure || ''
  updatePreview()
}

function updatePreview () {
  const instrumental = $('instrumental').checked
  const { style } = composeStyle({
    ...readParts(), instrumental, soundEffect: $('soundEffect').checked, lyrics: instrumental ? '' : $('lyrics').value
  })
  $('tagPreview').textContent = style || '—'
  const strict = $('onlyListed').checked
  $('builderHint').textContent = $('soundEffect').checked
    ? '원하는 소리를 설명해 주세요. 예: short electronic notification chime. 음악 모델 기반이라 효과음 품질은 달라질 수 있습니다.'
    : strict ? BUILDER_HINT.strict : BUILDER_HINT.plain
  $('builderHint').classList.toggle('warn', strict)
  $('strongWrap').classList.toggle('hidden', !strict)
  $('structure').title = instrumental
    ? '연주곡의 구간 구성'
    : '고르면 가사 칸이 비어 있을 때 구간 틀을 넣어 줍니다. 노래는 가사의 [Verse] [Chorus] 태그가 곧 구조입니다.'
}

// ── wiring ───────────────────────────────────────────────────────────────────
let userPresets = []

function setSoundEffect (on) {
  $('soundEffect').checked = on
  if (on && enginesInstalled.ace) $('engine').value = 'ace'
  for (const id of ['instrumental', ...INSTRUMENT_SLOTS, 'bpm', 'structure', 'onlyListed', 'strongPrompt']) $(id).disabled = on
  $('presets').classList.toggle('hidden', on)
  const style = $('style')
  if (style.dataset.musicPlaceholder === undefined) style.dataset.musicPlaceholder = style.placeholder
  style.placeholder = on ? '원하는 짧은 소리를 영어로 설명해 주세요. 예) short electronic notification chime, clear bright tone' : style.dataset.musicPlaceholder
  $('instrumental').onchange()
  updateTarget()
}

function presetChip (preset, { own = false } = {}) {
  const chip = document.createElement('button')
  chip.className = 'chip' + (own ? ' own' : '')
  chip.textContent = preset.name
  chip.title = [preset.note, preset.style].filter(Boolean).join('\n\n')
  chip.onclick = () => {
    // A saved preset brings its instruments and tempo back too; a built-in one only
    // sets the style and leaves the rest of the builder as the user has it.
    if (own && preset.parts) writeParts(preset.parts)
    else $('style').value = preset.style
    if (own) $('instrumental').checked = Boolean(preset.instrumental)
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'))
    chip.classList.add('active')
    if (own) $('instrumental').onchange()
    updatePreview()
    // Some presets promise less than their name suggests; say so when picked.
    if (preset.note) toast(preset.note, 9000)
  }
  if (own) {
    const move = document.createElement('span')
    move.className = 'chip-move'
    move.textContent = '📁'
    move.title = '폴더로 옮기기'
    move.onclick = async (event) => {
      event.stopPropagation()
      const folder = await askText('폴더 이름 (비우면 폴더에서 빼기)', preset.folder || '', { allowEmpty: true })
      if (folder === null) return
      const result = await window.yue.movePreset(preset.name, folder)
      userPresets = result.presets
      if (folder.trim()) openPresetFolder = folder.trim()
      renderPresets()
    }
    chip.appendChild(move)
    const drop = document.createElement('span')
    drop.className = 'chip-drop'
    drop.textContent = '✕'
    drop.title = '이 프리셋 지우기'
    drop.onclick = async (event) => {
      event.stopPropagation()
      if (!confirm(`"${preset.name}" 프리셋을 지울까요?`)) return
      const result = await window.yue.deletePreset(preset.name)
      userPresets = result.presets
      renderPresets()
    }
    chip.appendChild(drop)
  }
  return chip
}

// The folder whose presets are shown; remembered between runs.
let openPresetFolder = (() => { try { return localStorage.getItem('presetFolder') || '' } catch { return '' } })()

function folderChip (name, presets) {
  const chip = document.createElement('button')
  chip.className = 'chip folder' + (openPresetFolder === name ? ' open' : '')
  chip.textContent = `${openPresetFolder === name ? '📂' : '📁'} ${name}`
  const count = document.createElement('span')
  count.className = 'count'
  count.textContent = String(presets.length)
  chip.appendChild(count)
  chip.title = openPresetFolder === name ? '폴더 닫기' : '폴더 열기'
  chip.onclick = () => {
    openPresetFolder = openPresetFolder === name ? '' : name
    localStorageSet('presetFolder', openPresetFolder)
    renderPresets()
  }
  return chip
}

function renderPresets () {
  const box = $('presets')
  box.innerHTML = ''
  const instrumental = $('instrumental').checked
  for (const preset of instrumental ? INSTRUMENTAL_PRESETS : PRESETS) {
    box.appendChild(presetChip(preset))
  }
  // The user's own presets sit at the end, marked and removable: loose ones first,
  // then each folder, whose presets show only while it is open.
  const own = userPresets.filter((item) => Boolean(item.instrumental) === instrumental)
  for (const preset of own.filter((item) => !item.folder)) box.appendChild(presetChip(preset, { own: true }))
  const folders = [...new Set(own.filter((item) => item.folder).map((item) => item.folder))]
    .sort((a, b) => a.localeCompare(b, 'ko'))
  for (const folder of folders) {
    const inside = own.filter((item) => item.folder === folder)
    box.appendChild(folderChip(folder, inside))
    if (openPresetFolder !== folder) continue
    for (const preset of inside) {
      const chip = presetChip(preset, { own: true })
      chip.classList.add('in-folder')
      box.appendChild(chip)
    }
  }
  const save = document.createElement('button')
  save.className = 'chip add'
  save.textContent = '＋ 내 프리셋'
  save.title = '지금 프롬프트를 이름 붙여 저장'
  save.onclick = async () => {
    const parts = readParts()
    const style = parts.genre
    if (!style && !parts.instruments.length) return toast('저장할 스타일이나 악기를 먼저 정해주세요.')
    const name = await askText('프리셋 이름', '')
    if (!name) return
    // Into the open folder by default; any other name makes (or picks) that folder.
    const folder = await askText('폴더 (비우면 폴더 없이 저장)', openPresetFolder, { allowEmpty: true })
    if (folder === null) return
    if (folder.trim()) openPresetFolder = folder.trim()
    const result = await window.yue.savePreset({ name, style, instrumental, parts, folder })
    if (!result.ok) return toast(result.message)
    userPresets = result.presets
    renderPresets()
    toast(`"${name}" 프리셋을 저장했습니다.`)
  }
  box.appendChild(save)
}

function wireUi () {
  renderPresets()
  fillBuilder()
  wireTips()

  // Picking an engine that is not installed opens the engine screen instead.
  $('engine').onchange = () => {
    const id = currentEngine()
    if (!enginesInstalled[id]) {
      showEngineChoice() // back to the one that works
      openEngines()
      return toast(`${id === 'ace' ? 'ACE-Step 1.5' : 'YuE2'}는 아직 설치되지 않았습니다. 사양을 확인하고 설치할 수 있습니다.`, 6000)
    }
    localStorageSet('engine', id)
    if (id !== 'ace' && $('soundEffect').checked) setSoundEffect(false)
    applyEngineUi()
  }
  $('target').onchange = updateTarget
  $('targetCustom').oninput = showLyricsCheckHint
  $('soundEffect').onchange = () => {
    const on = $('soundEffect').checked
    if (on && !enginesInstalled.ace) {
      $('soundEffect').checked = false
      openEngines()
      return toast('효과음은 ACE-Step 1.5 엔진에서만 만들 수 있습니다.', 6000)
    }
    if (on) {
      $('engine').value = 'ace'
      localStorageSet('engine', 'ace')
      if (!readTarget() || readTarget() > 30) setTarget(5)
    }
    setSoundEffect(on)
    applyEngineUi()
  }

  // The settings box folds away and stays the way it was left.
  const options = $('optionsBox')
  try { if (localStorage.getItem('optionsOpen') === '0') options.open = false } catch {}
  options.addEventListener('toggle', () => {
    try { localStorage.setItem('optionsOpen', options.open ? '1' : '0') } catch {}
  })
  // Opening 곡 정보 brings it into view inside the (now scrolling) player.
  const meta = document.querySelector('#player .meta')
  meta.addEventListener('toggle', () => {
    if (meta.open) requestAnimationFrame(() => meta.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  })

  // Dragging reorders the waiting queue, or the finished songs of the project. The
  // new order shows at once; saving it follows.
  enableSorting($('songs'), {
    onIdle: renderSongs,
    onDrop: async (group, ids) => {
      const arrange = (items, key) => [
        ...ids.map((id) => items.find((item) => String(item[key]) === id)).filter(Boolean),
        ...items.filter((item) => !ids.includes(String(item[key])))
      ]
      if (group === 'queue') {
        queueState.waiting = arrange(queueState.waiting || [], 'jobId')
        renderSongs()
        await window.yue.queueReorder(ids)
        return
      }
      songs = arrange(songs, 'folder')
      renderSongs()
      const result = await window.yue.reorderSongs(ids)
      if (!result.ok) return toast(result.message, 6000)
      await refresh() // picks up the saved positions the album export goes by
    }
  })
  for (const id of ['style', 'bpm', 'lyrics']) $(id).addEventListener('input', updatePreview)
  for (const id of [...INSTRUMENT_SLOTS, 'onlyListed', 'strongPrompt']) {
    $(id).addEventListener('change', updatePreview)
  }
  // For a song with words the structure is its section tags, so picking one writes
  // the skeleton into an empty lyrics box; an instrumental uses it at generation time.
  $('structure').onchange = () => {
    updatePreview()
    if ($('instrumental').checked) return
    if ($('lyrics').value.trim()) {
      return toast('가사 칸이 비어 있지 않아 구간 틀을 넣지 않았습니다. 가사를 지운 뒤 다시 고르면 틀이 들어갑니다.', 7000)
    }
    $('lyrics').value = structureLyrics($('structure').value)
    $('lyrics').focus()
    updatePreview()
  }
  $('tagPreview').onclick = () => $('tagPreview').classList.toggle('expanded')
  updatePreview()

  for (const id of [...Object.keys(ADVANCED), 'advMaxSeconds', 'advCot']) {
    $(id).oninput = showAdvancedState
    $(id).onchange = showAdvancedState
  }
  $('showScore').onclick = () => selected && openScore(selected)
  $('coverSong').onclick = () => selected && startCover(selected)
  $('coverCancel').onclick = () => {
    const imported = coverFrom && coverFrom.source === 'import'
    const recording = coverFrom && coverFrom.source === 'recording'
    coverFrom = null
    showCover()
    toast(imported
      ? '불러온 악보를 해제했습니다. 이제 악보부터 새로 만듭니다.'
      : recording ? '녹음을 해제했습니다. 이제 새 곡으로 만듭니다.' : '커버를 해제했습니다. 이제 새 곡으로 만듭니다.')
  }
  $('clearLyrics').onclick = () => {
    $('title').value = ''
    $('lyrics').value = ''
    $('lyrics').focus()
  }
  $('clearStyle').onclick = () => {
    writeParts({})
    document.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'))
    $('style').focus()
  }
  $('scoreClose').onclick = () => $('score').classList.add('hidden')
  $('scoreText').oninput = markScore
  const applyScore = (fn) => () => { $('scoreText').value = fn($('scoreText').value); markScore() }
  $('scoreMelodyOnly').onclick = applyScore(dropChords)
  $('scoreVocalRest').onclick = applyScore((abc) => restVoice(abc, 'Vocal'))
  $('scoreInsRest').onclick = applyScore((abc) => restVoice(abc, 'Ins'))
  $('scoreRevert').onclick = () => { $('scoreText').value = scoreOriginal; markScore() }
  $('scoreCopy').onclick = async () => {
    await navigator.clipboard.writeText($('scoreText').value)
    toast('악보를 복사했습니다.')
  }
  $('scoreRender').onclick = async () => {
    const text = $('scoreText').value
    if (!text.trim()) return toast('악보가 비어 있습니다. 파일을 열거나 ABC를 붙여넣으세요.')
    // The validator is YuE2's own; a score it rejects may still tokenize, but what the
    // model makes of it is anyone's guess — so going ahead is the user's call.
    const check = await runCheck()
    if (check && !check.ok && !confirm(
      `YuE2 악보 규칙 검사를 통과하지 못했습니다.\n${explainCheck(check.error)}\n\n` +
      '이대로 쓰면 결과가 이상하거나 멜로디를 따르지 않을 수 있습니다. 그래도 쓸까요?')) return
    if (scoreMode === 'import') return useImportedScore(text, check)
    if (!scoreSong) return
    const result = await window.yue.render(scoreSong.dir, text)
    if (!result.ok) return toast(result.message)
    plans.set(result.jobId, estimate(scoreSong.lyrics || ''))
    $('score').classList.add('hidden')
    toast(result.position > 0
      ? `대기열 ${result.position}번째로 넣었습니다`
      : '악보로 곡을 만들기 시작했습니다', 6000)
  }

  $('planOnly').onclick = () => startFromEditor({ mode: 'plan' })

  // ── importing a score (MIDI / ABC) ──
  $('importScore').onclick = openImport
  $('scoreOpenFile').onclick = async () => {
    const result = await window.yue.openScore()
    if (!result.ok) {
      if (!result.canceled) showProblem(result.message, null, '악보를 불러오지 못했습니다')
      return
    }
    importName = result.name
    $('scoreTitle').textContent = `· ${importName}`
    $('scoreFileName').textContent = `${result.name}.${result.kind === 'midi' ? 'mid' : 'abc'}`
    if (result.kind === 'midi') {
      fillMidiPanel(result)
      $('scoreText').value = result.result.abc
    } else {
      $('midiPanel').classList.add('hidden')
      $('scoreText').value = result.text
    }
    scoreOriginal = $('scoreText').value
    markScore()
  }
  const reconvert = async () => {
    const result = await window.yue.convertMidi({
      vocal: $('midiVocal').value, ins: $('midiIns').value, chords: $('midiChords').checked
    })
    if (!result.ok) return toast(result.message, 6000)
    $('scoreText').value = scoreOriginal = result.result.abc
    showMidiNotes(result.result)
    markScore()
  }
  for (const id of ['midiVocal', 'midiIns', 'midiChords']) $(id).onchange = reconvert

  // The score waits in the banner above the style box; "곡 만들기" then sings it with
  // whatever lyrics and style are on screen.
  function useImportedScore (text, check) {
    const info = analyzeScore(text)
    coverFrom = {
      source: 'import', abc: text, title: importName || '불러온 악보',
      hasChords: hasChordSymbols(text), seconds: check && check.ok ? check.seconds : null
    }
    useScoreEngine()
    showCover()
    $('score').classList.add('hidden')
    if (!$('title').value.trim() && importName) $('title').value = importName
    // Tempo lives in the score; the style should say the same thing, not argue with it.
    if (info.tempo && Number($('bpm').value) !== info.tempo) {
      $('bpm').value = info.tempo
      updatePreview()
    }
    const vocalLess = check && check.ok ? !check.vocalNotes : !info.vocalNotes
    if (vocalLess && !$('instrumental').checked) {
      $('instrumental').checked = true
      $('instrumental').onchange()
      return toast('악보에 보컬 멜로디가 없어 "가사 없이 (연주곡)"으로 바꿨습니다. 스타일을 정하고 "곡 만들기"를 누르세요.', 9000)
    }
    if (check && check.ok && check.seconds > 355) {
      toast('악보가 6분 가까이 되거나 넘습니다. 6분이 넘는 부분은 만들어지지 않습니다.', 9000)
    }
    toast($('instrumental').checked
      ? '악보를 준비했습니다. 스타일을 정하고 "곡 만들기"를 누르세요.'
      : '악보를 준비했습니다. 가사와 스타일을 적고 "곡 만들기"를 누르세요. 가사 글자 수가 멜로디 음표 수와 비슷해야 자연스럽게 불립니다.', 9000)
  }

  $('advReset').onclick = () => {
    writeAdvanced({})
    toast('기본값으로 되돌렸습니다.')
  }

  $('instrumental').onchange = () => {
    const on = $('instrumental').checked || $('soundEffect').checked
    $('lyrics').disabled = on
    $('lyricsHint').textContent = $('soundEffect').checked
      ? '효과음 모드입니다. 가사 없이 스타일 칸의 소리 설명으로 1~30초 음향을 만듭니다. 10초 미만은 생성 후 잘라 저장합니다.'
      : on
      ? '연주곡 모드입니다. 악보의 보컬 성부를 비우고 허밍·합창·내레이션까지 막습니다. 구간 구성은 아래 "구조"에서 고릅니다.'
      : '[Verse] [Pre-Chorus] [Chorus] [Bridge] 로 구간을 나누면 곡 구조가 좋아집니다. 알 수 없는 태그와 지시문은 자동으로 빠집니다.'
    renderPresets() // 연주곡에는 연주곡용 프리셋만 보여 준다
    updatePreview()
  }

  $('generate').onclick = () => startFromEditor({})

  // Shared by "곡 만들기" and "악보만": mode 'plan' stops after the score.
  async function startFromEditor ({ mode }) {
    const soundEffect = $('soundEffect').checked
    const targetSeconds = readTarget()
    const error = window.RoadGeneration.generationError({ engine: currentEngine(), targetSeconds: !soundEffect && coverFrom ? null : targetSeconds, soundEffect, mode,
      style: $('style').value, coverAudio: soundEffect && coverFrom })
    if (error) return toast(error, 7000)
    const instrumental = soundEffect || $('instrumental').checked
    const raw = soundEffect ? '[Instrumental]' : instrumental
      ? structureLyrics($('structure').value, { instrumental: true })
      : $('lyrics').value.trim()
    const parts = readParts()
    if (!raw) return toast('가사를 입력하거나 "가사 없이 (연주곡)"을 선택해주세요.')
    if (!parts.genre && !parts.instruments.length) {
      return toast('스타일을 적거나 프리셋·악기를 골라주세요.')
    }
    const { text: cleaned, notes } = cleanLyrics(raw)
    let lyrics = cleaned
    if (!instrumental && !lyrics.split('\n').some((line) => line.trim() && !line.startsWith('['))) {
      return toast('부를 가사가 없습니다. 구간 태그 아래에 가사를 적거나 "가사 없이 (연주곡)"을 선택해주세요.', 7000)
    }
    // Style, instruments, tempo and the strict/instrumental clauses become one tag
    // line in the shape YuE2 was trained on; brackets and prose are taken out.
    const composed = composeStyle({ ...parts, instrumental, soundEffect, lyrics })
    let style = composed.style
    notes.push(...composed.notes)
    if (!style) return toast('스타일에 쓸 수 있는 내용이 남지 않았습니다. 짧은 단어로 다시 적어주세요.', 7000)
    // An imported score already fixes the song's length bar by bar.
    const imported = Boolean(coverFrom && coverFrom.source === 'import')
    const fromRecording = Boolean(coverFrom && coverFrom.source === 'recording')
    const soundCover = Boolean(coverFrom && (coverFrom.source === 'audio' || fromRecording))
    const length = imported || soundCover ? null : lengthPlan(targetSeconds, lyrics)
    if (imported && $('target').value) notes.push('불러온 악보가 곡 길이를 정하므로 "길이" 설정은 쓰지 않았습니다')
    if (soundCover && $('target').value) {
      notes.push(fromRecording ? '곡 길이는 녹음 창에서 고른 길이를 따르므로 "길이" 설정은 쓰지 않았습니다'
        : '커버는 원곡과 같은 길이로 만들어지므로 "길이" 설정은 쓰지 않았습니다')
    }
    if (length) {
      if (length.longForm) style = `${style}, ${LONG_FORM}`
      if (length.needsFiller && !instrumental) {
        lyrics += FILLER_SECTIONS
        notes.push('긴 곡을 위해 간주·솔로·아웃트로 구간을 덧붙였습니다')
      }
    }
    const heading = raw.split('\n').find((line) => /^\s*#/.test(line)) || ''
    const payload = {
      // A typed title is kept as typed; one made up from a heading or the first sung
      // line is kept short, since it also names the song's folder and file.
      title: $('title').value.trim() ||
        shortTitle(heading.replace(/^\s*#+\s*/, '')) ||
        (imported ? shortTitle(coverFrom.title) : '') ||
        shortTitle(lyrics.split('\n').find((line) => line && !line.startsWith('[')) || '') ||
        tr(soundEffect ? '효과음' : instrumental ? '연주곡' : '무제'), // named in the user's language
      lyrics,
      style,
      instrumental,
      soundEffect,
      // A target length and "프롬프트 강하게" only fill in what the expert panel left
      // empty. The latter is classifier-free guidance on the style and lyrics: the
      // one engine-side lever for making the tags count for more.
      advanced: {
        ...(length ? { maxTokens: length.maxTokens, minTokens: length.minTokens } : {}),
        ...(parts.strict && parts.strong ? { cfgScale: STRONG_CFG } : {}),
        ...readAdvanced()
      },
      // The builder's fields, so 설정 복제 and 커버 can put them back as they were.
      parts: { ...parts, instrumental },
      targetSeconds: length ? length.seconds : null,
      // A supplied score leaves the plan stage nothing to invent. Its instruction must
      // describe it truthfully — "chord-annotated" only when it has chords — and
      // "악보 없이 바로" would throw it away, so the mode follows the score.
      abc: coverFrom && !soundCover ? coverFrom.abc : null,
      // A cover from the original's sound (ACE-Step).
      coverAudio: soundCover && !fromRecording
        ? { dir: coverFrom.dir, title: coverFrom.title, strength: Number($('coverStrength').value) || 0.8 }
        : null,
      // A song from the user's recording (recorder.js), stretched in the main process.
      recording: fromRecording
        ? { path: coverFrom.path, targetSeconds: coverFrom.targetSeconds || 0, strength: Number($('coverStrength').value) || 0.8 }
        : null,
      cot: coverFrom ? (coverFrom.hasChords ? 'full' : 'melody') : $('advCot').value,
      mode,
      engine: currentEngine(),
      seed: $('seed').value.trim() || null
    }
    if (!enginesInstalled[payload.engine]) {
      openEngines()
      if (enginesRepair[payload.engine]) return toast('YuE2 모델 파일을 찾지 못했습니다. 위쪽 "설정 · 도구 → AI 엔진"에서 YuE2의 "다시 받기"를 누르면 빠진 파일만 다시 받습니다.', 9000)
      return toast(`${payload.engine === 'ace' ? 'ACE-Step 1.5' : 'YuE2'} 엔진을 먼저 설치해 주세요.`, 6000)
    }
    if (soundCover && (payload.engine !== 'ace' || mode === 'plan')) {
      return toast(fromRecording
        ? '녹음으로 만드는 곡은 ACE-Step 1.5 엔진의 "곡 만들기"로만 됩니다. 엔진을 ACE-Step 1.5로 바꿔 주세요.'
        : '원곡 소리로 만드는 커버는 ACE-Step 1.5 엔진의 "곡 만들기"로만 됩니다. 엔진을 ACE-Step 1.5로 바꿔 주세요.', 8000)
    }
    if (payload.engine === 'ace' && (mode === 'plan' || (coverFrom && !soundCover))) {
      return toast(mode === 'plan'
        ? '악보만 만들기는 YuE2 엔진에서만 됩니다. 엔진을 YuE2로 바꿔 주세요.'
        : '악보로 만드는 곡(커버·악보 불러오기)은 YuE2 엔진에서만 됩니다. 엔진을 YuE2로 바꿔 주세요.', 8000)
    }
    if (mode === 'plan' && coverFrom) {
      return toast(imported
        ? '불러온 악보가 이미 있어 "악보만"은 만들 필요가 없습니다. 악보는 "악보 불러오기"에서 다시 볼 수 있습니다.'
        : '커버는 원곡의 악보를 그대로 쓰기 때문에 "악보만"은 만들 필요가 없습니다. ' +
          '원곡의 악보는 "악보 보기"에서 볼 수 있습니다.', 8000)
    }
    if (mode === 'plan' && payload.cot === 'off') {
      return toast('악보만 만들려면 고급 설정의 작곡 방식을 "전체" 또는 "멜로디만"으로 두세요.', 7000)
    }
    if (payload.engine === 'ace') {
      const coverSeconds = fromRecording ? Math.max(coverFrom.targetSeconds || 0, coverFrom.seconds || 0) : coverFrom && coverFrom.seconds
      plan = aceEstimate(soundCover ? coverSeconds || null : length ? length.seconds : null, lyrics, { firstRun: !warmed })
    } else {
      plan = estimate(lyrics, { firstRun: !warmed })
      if (length) {
        // A target length decides the token count, so the time estimate follows it.
        plan = estimate(lyrics, { firstRun: !warmed })
        plan.tokens.semantic = length.maxTokens
        plan.seconds.semantic = length.maxTokens / SPEED.semantic
        plan.seconds.synth = length.maxTokens * SPEED.synthPerToken
        plan.total = ORDER.reduce((sum, key) => sum + plan.seconds[key], 0) +
          (warmed ? 0 : SPEED.load)
        for (const key of ORDER) plan.weights[key] = plan.seconds[key] / plan.total
      }
      // Guidance runs the song stage twice per token: once with the tags, once without.
      if ((payload.advanced.cfgScale || 1) > 1) {
        plan.seconds.semantic *= 2
        plan.total = ORDER.reduce((sum, key) => sum + plan.seconds[key], 0) +
          (warmed ? 0 : SPEED.load)
        for (const key of ORDER) plan.weights[key] = plan.seconds[key] / plan.total
      }
      // The model stops at 9000 song tokens (~6 minutes); past that the ending is lost.
      // With a target length the cap is the user's own choice, so no warning is due.
      if (!length && plan.tokens.semantic >= MAX_SONG_TOKENS && !confirm(
        `가사가 길어 노래가 약 ${Math.round(MAX_SONG_TOKENS / 25 / 60)}분에서 끊길 수 있습니다.\n` +
        '가사를 줄이면 끝까지 완성됩니다. 이대로 진행할까요?')) return
    }
    const estimated = plan
    // A batch is the same request several times over with different seeds, so the
    // takes can be compared and the best one kept.
    const count = mode === 'plan' ? 1 : (Number($('count').value) || 1)
    const base = payload.seed === null ? null : Number(payload.seed)
    let queued = 0
    for (let index = 0; index < count; index++) {
      const take = {
        ...payload,
        title: count > 1 ? `${payload.title} ${String.fromCharCode(65 + index)}` : payload.title,
        seed: base === null ? null : base + index
      }
      const result = await window.yue.generate(take)
      if (!result.ok) {
        toast(result.message, 7000)
        if (result.needsEngine) openEngines()
        break
      }
      // Each song carries its own estimate; the bar switches to it when that song starts.
      plans.set(result.jobId, estimated)
      queued += 1
    }
    if (!queued) return
    if (runningJob) plan = plans.get(runningJob.jobId) || estimated
    const summary = mode === 'plan'
      ? `악보만 만듭니다 (약 ${minutes(estimated.seconds.plan)})`
      : count > 1
        ? `${queued}곡을 예약했습니다 (시드가 다른 ${queued}가지 버전)`
        : coverFrom
          ? fromRecording
            ? `녹음으로 곡을 만듭니다 (예상 약 ${minutes(estimated.total)})`
            : `"${coverFrom.title}" 커버를 만듭니다 (예상 약 ${minutes(estimated.total)})`
          : `예상 시간 약 ${minutes(estimated.total)}`
    toast([summary, ...notes].join(' · '), 7000)
  }
  $('queuePause').onclick = async () => {
    const result = await window.yue.queuePause(!queueState.paused)
    toast(result.paused
      ? '대기열을 멈췄습니다. 만들고 있는 곡은 끝까지 진행됩니다.'
      : '대기열을 다시 시작합니다.')
  }
  $('queueClear').onclick = async () => {
    if (!confirm('대기 중인 곡을 모두 취소할까요?\n지금 만들고 있는 곡은 계속 진행됩니다.')) return
    const result = await window.yue.queueClear()
    toast(`대기 중인 ${result.removed}곡을 취소했습니다.`)
  }

  // Lyrics without section tags get them — when pasted, or with the button. Bare
  // headings ("후렴", "Verse 2:") become tags; otherwise the blocks are labelled by
  // what repeats (sections.js). The change goes through the edit history, so Ctrl+Z
  // brings the pasted text back as it was.
  const tagSections = ({ pasted = false } = {}) => {
    const box = $('lyrics')
    const text = box.value
    if (!text.trim() || box.disabled) return false
    let tagged = null
    const lines = text.split('\n')
    if (lines.some((line) => BARE_SECTION.test(line))) {
      tagged = lines.map((line) => BARE_SECTION.test(line) ? (sectionTag(line) || line) : line).join('\n')
    } else {
      tagged = window.RoadSections.autoSections(text)
    }
    if (!tagged || tagged === text) {
      if (!pasted) toast(/^\s*\[[^\]\n]+\]\s*$/m.test(text) ? '이미 구간 태그가 있습니다.' : '나눌 구간을 찾지 못했습니다. 빈 줄로 덩어리를 나눠 주세요.')
      return false
    }
    box.focus()
    box.select()
    if (!document.execCommand('insertText', false, tagged)) box.value = tagged
    box.setSelectionRange(0, 0)
    box.scrollTop = 0
    updatePreview()
    toast(pasted ? '구간 태그를 자동으로 붙였습니다. 원래대로 돌리려면 Ctrl+Z를 누르세요.' : '구간 태그를 붙였습니다. 되돌리려면 Ctrl+Z를 누르세요.', 6000)
    return true
  }
  $('autoSections').onclick = () => tagSections()
  wireLyricsCheck()
  $('lyrics').addEventListener('paste', (event) => {
    const pastedText = (event.clipboardData && event.clipboardData.getData('text')) || ''
    // Only a real block of lyrics: a line or two pasted into a song is left alone.
    if (pastedText.split('\n').filter((line) => line.trim()).length < 4) return
    setTimeout(() => tagSections({ pasted: true }), 0)
  })
  $('lyricsHelp').onclick = () => toast('[Verse] 벌스 · [Pre-Chorus] 프리코러스 · [Chorus] 후렴 · [Bridge] 브릿지 — 대괄호 태그로 구간을 나눠주세요.', 6000)
  const exportAs = (format) => async () => {
    if (!selected) return
    const result = await window.yue.exportSong(selected.dir, selected.title || selected.id, format)
    if (!result.ok) {
      if (result.blocked) showProblem(result.message, null, '저장할 수 없는 폴더')
      else if (!result.canceled) toast(result.message || '저장하지 못했습니다.')
      return
    }
    showLocations() // 방금 저장한 폴더를 다음에도 쓴다
    // Saying so beats letting someone think a WAV rebuilt from an MP3 is lossless.
    toast(result.fromLossy
      ? 'WAV로 저장했습니다. 원본 WAV가 이미 지워져 MP3에서 변환한 것이라 음질은 MP3와 같습니다.'
      : `${format.toUpperCase()}로 저장했습니다.`, result.fromLossy ? 8000 : 3000)
  }
  // Lyric subtitles with estimated times (renderer/srt.js): from the score when the
  // song kept one, otherwise spread over the song's length.
  $('exportSrt').onclick = async () => {
    if (!selected || !lyricsOf(selected)) return
    const { cues, method } = await songCues(selected)
    if (!cues.length) return toast('자막으로 만들 가사가 없습니다.')
    const result = await window.yue.saveSrt(selected.title || selected.id, toSrt(cues))
    if (!result.ok) {
      if (result.blocked) showProblem(result.message, null, '저장할 수 없는 폴더')
      else if (!result.canceled) toast(result.message || '저장하지 못했습니다.')
      return
    }
    showLocations()
    toast(method === 'lrc'
      ? `가사 자막 ${cues.length}줄을 저장했습니다. ACE-Step이 노래하며 기록한 시각을 썼습니다.`
      : method === 'score'
      ? `가사 자막 ${cues.length}줄을 저장했습니다. 악보의 구간과 박자로 시간을 추정해서, 실제 노래와 조금 어긋날 수 있어요.`
      : `가사 자막 ${cues.length}줄을 저장했습니다. 이 곡은 악보가 없어 곡 길이로 시간을 나눴습니다. 편집기에서 시간을 맞춰 주세요.`, 7000)
  }
  $('exportMp3').onclick = exportAs('mp3')
  $('exportWav').onclick = exportAs('wav')
  $('renameSong').onclick = async () => {
    if (!selected) return
    const title = await askText('곡 이름 변경', selected.title || '')
    if (!title) return
    // The audio file is renamed with the song, and Windows will not rename a file the
    // player still has open: the mini player lets go of it, and picks up where it was.
    const held = releaseMini(selected.dir, { keep: true })
    const result = await window.yue.rename(selected.dir, title)
    await refresh()
    if (selected) select(selected)
    if (held) resumeMini(held)
    if (!result.ok) return toast(result.message, 7000)
    if (!result.fileRenamed) {
      toast('이름은 바꿨지만 음원 파일 이름은 그대로입니다. 다른 프로그램에서 파일을 열어두었다면 닫고 다시 바꿔주세요.', 8000)
    }
  }

  // ── album export ──
  let albumDirs = null
  const albumSongs = () => {
    return songs.filter((song) => song.audio && !song.unfinished && (!albumDirs || albumDirs.includes(song.dir)))
  }
  const showAlbumSummary = () => {
    const picked = albumSongs()
    const total = songs.filter((song) => song.audio && !song.unfinished).length
    const lines = [picked.length
      ? `완성곡 ${total}곡 중 <b>${picked.length}곡</b>을 내보냅니다.`
      : '<span class="warn">내보낼 완성곡이 없습니다.</span>']
    // A WAV rebuilt from an MP3 is no better than the MP3; say so before, not after.
    const fromMp3 = picked.filter((song) => song.format === 'mp3').length
    if ($('albumFormat').value === 'wav' && fromMp3) {
      lines.push(`<span class="warn">${fromMp3}곡은 원본 WAV를 지워 MP3에서 변환하므로 음질이 MP3와 같습니다.</span>`)
    }
    lines.push(songs.some((song) => song.position !== null && song.position !== undefined)
      ? '트랙 순서: 목록에서 정한 순서 (위에서부터 1번)'
      : '트랙 순서: 만든 순서 · 목록에서 곡을 끌어 순서를 바꾸면 그 순서를 따릅니다')
    $('albumSummary').innerHTML = lines.join('<br>')
    $('albumOk').disabled = !picked.length
  }
  const openAlbum = (onlySelected) => {
    albumDirs = onlySelected
      ? songs.filter(song => song.audio && !song.unfinished && picks().has(song.folder)).map(song => song.dir)
      : null
    if (!albumSongs().length) return toast(onlySelected ? '저장할 곡을 먼저 선택해 주세요.' : '이 프로젝트에는 아직 완성된 곡이 없습니다.')
    $('albumTitle').textContent = onlySelected ? '선택 곡 일괄 저장' : '앨범으로 내보내기'
    $('albumDescription').textContent = onlySelected
      ? '선택한 곡만 원하는 형식으로 한 폴더에 저장합니다. 원본 파일은 그대로 유지됩니다.'
      : '지금 프로젝트의 완성곡을 한 폴더에 모아 저장합니다. 각 파일에 곡 제목·앨범 이름·트랙 번호가 태그로 들어갑니다.'
    $('albumName').textContent = currentProject || ''
    showAlbumSummary()
    $('album').classList.remove('hidden')
  }
  $('albumExport').onclick = () => openAlbum(false)
  $('exportSelected').onclick = () => openAlbum(true)
  $('songPickAll').onclick = () => setSongPicks(true)
  $('songPickNone').onclick = () => setSongPicks(false)
  $('albumFormat').onchange = showAlbumSummary
  $('albumCancel').onclick = () => $('album').classList.add('hidden')
  $('albumOk').onclick = async () => {
    $('album').classList.add('hidden')
    const result = await window.yue.exportAlbum({
      format: $('albumFormat').value,
      numbered: $('albumNumbered').checked,
      ...(albumDirs ? { dirs: albumDirs } : {})
    })
    if (!result.ok) {
      if (result.blocked) showProblem(result.message, null, '저장할 수 없는 폴더')
      else if (!result.canceled) toast(result.message || '내보내지 못했습니다.', 7000)
      return
    }
    if (result.failures.length) {
      showProblem(`${result.count}곡을 저장했고, ${result.failures.length}곡은 저장하지 못했습니다.`,
        result.failures.join('\n'), '앨범 내보내기')
    } else {
      toast(`${result.count}곡을 저장했습니다.`, 5000)
    }
    showLocations()
    window.yue.open(result.path)
  }
  window.yue.onAlbumProgress(({ done, total, title }) => {
    if (done < total) toast(`앨범 내보내는 중… ${done + 1}/${total} ${title || ''}`, 60000)
  })
  $('revealSong').onclick = () => selected && window.yue.reveal(selected.dir)

  // Music made elsewhere joins the current project as finished songs.
  $('importSongs').onclick = async () => {
    $('importSongs').disabled = true
    $('importSongs').textContent = '불러오는 중…'
    const result = await window.yue.importSongs()
    $('importSongs').disabled = false
    $('importSongs').textContent = '불러오기'
    if (!result.ok) return
    await refresh()
    if (result.failures.length) {
      showProblem(`${result.count}곡을 불러왔고, ${result.failures.length}곡은 불러오지 못했습니다.`,
        result.failures.join('\n'), '음악 파일 불러오기')
    } else {
      toast(`${result.count}곡을 "${currentProject}" 프로젝트로 불러왔습니다. 영상 만들기·앨범 내보내기에 쓸 수 있습니다.`, 6000)
    }
  }

  // Load a finished song's request back into the editor: the basis for exploring
  // around a take you liked instead of starting over.
  $('reuseSong').onclick = () => {
    if (!selected) return
    const instrumental = Boolean(selected.instrumental)
    setSoundEffect(Boolean(selected.soundEffect))
    $('instrumental').checked = instrumental
    $('instrumental').onchange()
    const request = userRequest(selected)
    if (!instrumental) $('lyrics').value = request.lyrics
    writeParts(request.parts)
    $('seed').value = selected.seed == null ? '' : selected.seed
    $('title').value = selected.title || ''
    // Bring the expert knobs back too, so a take can be reproduced exactly.
    writeAdvanced({ ...request.advanced, cot: selected.cot })
    if (Object.keys(request.advanced).length) $('advanced').open = true
    // The target length is part of the request as much as the seed is.
    setTarget(selected.targetSeconds)
    document.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'))
    coverFrom = null // 설정 복제는 악보까지 새로 만든다
    showCover()
    $('lyrics').scrollIntoView({ block: 'nearest' })
    toast('설정을 불러왔습니다. 시드를 비우면 같은 가사로 다른 곡이, 그대로 두면 같은 곡이 나옵니다.', 8000)
  }

  const saveOptions = async () => {
    const settings = await window.yue.setSettings({
      autoMp3: $('autoMp3').checked, dropWav: $('dropWav').checked
    })
    $('dropWav').disabled = !settings.autoMp3
    $('dropWav').checked = settings.dropWav
  }
  $('autoMp3').onchange = saveOptions
  $('dropWav').onchange = async () => {
    if ($('dropWav').checked && !confirm(
      '원본 WAV를 지우면 용량이 약 10분의 1로 줄어듭니다.\n' +
      'MP3만 남으므로 음질 손실이 조금 있습니다. 사용할까요?')) {
      $('dropWav').checked = false
    }
    await saveOptions()
  }
  $('project').onchange = async (event) => {
    await window.yue.selectProject(event.target.value)
    selected = null
    $('player').classList.add('hidden')
    await refresh()
  }
  $('newProject').onclick = async () => {
    const name = await askText('새 프로젝트 이름', '')
    if (!name) return
    const result = await window.yue.createProject(name)
    if (!result.ok) return toast(result.message)
    selected = null
    $('player').classList.add('hidden')
    await refresh()
    toast(`"${result.current}" 프로젝트로 바꿨습니다.`)
  }
  $('renameProject').onclick = async () => {
    const name = await askText('프로젝트 이름 변경', currentProject || '')
    if (!name) return
    const result = await window.yue.renameProject(currentProject, name)
    if (!result.ok) return toast(result.message)
    await refresh()
  }

  $('moveModels').onclick = async () => {
    if (!confirm('음악 모델(약 8GB)을 다른 폴더로 옮깁니다.\nC 드라이브 공간을 비울 때 쓰세요. 몇 분 걸릴 수 있습니다.')) return
    $('moveModels').disabled = true
    $('moveModels').textContent = '옮기는 중…'
    const result = await window.yue.moveModels()
    $('moveModels').disabled = false
    $('moveModels').textContent = '모델 위치 옮기기'
    if (result.ok) toast(`모델을 옮겼습니다: ${result.path}`, 7000)
    else if (!result.canceled) toast(result.message, 7000)
  }

  // ── storage locations ──
  $('moveSongs').onclick = async () => {
    if (running || queueState.waiting.length) {
      return toast('곡을 만드는 중이거나 대기열에 곡이 있으면 옮길 수 없습니다. 모두 끝난 뒤에 해주세요.', 7000)
    }
    if (!confirm('만든 곡 전체(모든 프로젝트)를 다른 위치로 옮깁니다.\n' +
      '고른 곳 안에 "Road Music Songs" 폴더가 생기고, 앞으로 만드는 곡도 그곳에 저장됩니다.\n' +
      '다른 드라이브로 옮기면 모두 복사해 확인한 뒤에 원래 폴더를 지웁니다. 곡이 많으면 몇 분 걸릴 수 있습니다.')) return
    // A song loaded in the player keeps its file open, and Windows will not move it.
    releaseMini(null)
    selected = null
    $('player').classList.add('hidden')
    $('moveSongs').disabled = true
    $('moveSongs').textContent = '옮기는 중…'
    const result = await window.yue.moveSongs()
    $('moveSongs').disabled = false
    $('moveSongs').textContent = '옮기기'
    await refresh()
    await showLocations()
    if (!result.ok) {
      if (result.blocked) showProblem(result.message, null, '저장할 수 없는 폴더')
      else if (!result.canceled) showProblem(result.message, null, '곡을 옮기지 못했습니다')
      return
    }
    toast(`곡 파일 ${result.count}개(${result.gb}GB)를 옮겼습니다: ${result.path}`, 8000)
    if (result.leftover) {
      showProblem(`곡은 모두 새 위치로 옮겨졌지만, 원래 폴더를 지우지 못했습니다.\n${result.leftover}\n` +
        '다른 프로그램이 파일을 열고 있었을 수 있습니다. 확인한 뒤 직접 지워도 됩니다.', null, '곡을 옮겼습니다')
    }
  }
  window.yue.onSongsMoveProgress(({ copied, total, done, count }) => {
    if (done >= count) return
    const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1)
    toast(`곡 옮기는 중… ${done}/${count}개 · ${gb(copied)}/${gb(total)}GB`, 60000)
  })
  $('pickExport').onclick = async () => {
    const result = await window.yue.pickExport()
    if (result.blocked) return showProblem(result.message, null, '저장할 수 없는 폴더')
    if (!result.ok) return
    await showLocations()
    toast(`앞으로 내보내기는 이 폴더에서 시작합니다: ${result.path}`, 6000)
  }
  $('compact').onclick = async () => {
    if (!confirm('이미 만든 곡들을 MP3로 바꾸고 원본 WAV를 지울까요?\n곡 하나당 용량이 약 10분의 1로 줄어듭니다.')) return
    $('compact').disabled = true
    $('compact').textContent = '정리하는 중…'
    const result = await window.yue.compact()
    $('compact').disabled = false
    $('compact').textContent = '이미 만든 곡 정리'
    toast(result.ok
      ? `${result.converted}곡을 정리해 ${result.savedGb}GB를 확보했습니다.`
      : result.message, 6000)
    await refresh()
  }
  $('deleteSong').onclick = async () => {
    if (!selected || !confirm('이 곡을 삭제할까요? (휴지통으로 이동)')) return
    releaseMini(selected.dir)
    await window.yue.remove(selected.dir)
    selected = null
    $('player').classList.add('hidden')
    await refresh()
  }
}

// Show what the machine has before anything is downloaded, and block the install
// when a requirement is missing rather than failing 11GB later.
async function showLocation () {
  const place = await window.yue.location()
  $('dataDir').textContent = place.freeGb === null
    ? place.dataDir
    : `${place.dataDir} (여유 ${place.freeGb}GB)`
}

// ── updates ──────────────────────────────────────────────────────────────────
// A new version is downloaded from the program's page on roadkwon.dev (the app does not
// install it itself from 1.2). "Don't show for a week" quiets the automatic check.
let updateInfo = null
let updateSkipped = false
let storeBuild = false // the Microsoft Store copy is updated by the Store

function showUpdate (info) {
  updateInfo = info
  $('updateFrom').textContent = `버전 ${info.current}`
  $('updateTo').textContent = `버전 ${info.version}`
  $('updateNotes').textContent = info.notes || ''
  $('updateNotes').classList.toggle('hidden', !info.notes)
  $('updateNo').classList.toggle('hidden', Boolean(info.mandatory))
  $('updateQuietRow').classList.toggle('hidden', Boolean(info.mandatory))
  $('updateQuiet').checked = false
  $('update').classList.remove('hidden')
}

async function checkUpdate () {
  if (updateSkipped || running) return // 곡을 만드는 중에 끼어들지 않는다
  try {
    const info = await window.yue.checkUpdate()
    if (info) showUpdate(info)
  } catch (error) {
    report('update check', error)
  }
}

// ── system gauges ────────────────────────────────────────────────────────────
function showStats (stats) {
  const gauge = (prefix, used, total) => {
    const wrap = $(`${prefix}Gauge`)
    if (used == null || !total) return wrap.classList.add('hidden')
    wrap.classList.remove('hidden')
    const ratio = Math.min(1, used / total)
    $(`${prefix}Bar`).style.width = `${(ratio * 100).toFixed(0)}%`
    // Amber near the limit, red at it: on 8GB cards this is the spill warning.
    $(`${prefix}Bar`).className = ratio > 0.95 ? 'full' : ratio > 0.85 ? 'high' : ''
    $(`${prefix}Text`).textContent = `${used}/${total}GB`
  }
  gauge('vram', stats.vramUsedGb, stats.vramTotalGb)
  gauge('ram', stats.ramUsedGb, stats.ramTotalGb)
  $('gpuLoad').textContent = stats.gpuLoad == null ? '' : `GPU ${stats.gpuLoad}%`
}

function wireUpdate () {
  window.yue.onStats(showStats)
  const close = async () => {
    if ($('updateQuiet').checked) await window.yue.updateQuietWeek()
    updateSkipped = true // 이번에 켜 둔 동안은 다시 묻지 않는다
    $('update').classList.add('hidden')
  }
  $('updateYes').onclick = async () => {
    await window.yue.openUpdatePage(updateInfo && updateInfo.page)
    await close()
  }
  $('updateNo').onclick = close
  $('versionInfo').title = '프로그램 정보 · 업데이트 확인'
  $('versionInfo').style.cursor = 'pointer'
  $('versionInfo').onclick = openAbout
  wireAbout()
  // 첫 확인은 boot() 이 화면을 준비한 직후 곧바로 한다(첫 실행 설치 화면일 때는 건너뛴다).
  // 며칠씩 켜 두는 사람을 위해 여섯 시간마다 한 번 더 본다.
  setInterval(checkUpdate, 6 * 60 * 60 * 1000)
}

// ── program information (header button) ──────────────────────────────────────
async function openAbout () {
  const info = await window.yue.aboutInfo()
  $('aboutVersion').textContent = `버전 ${info.version}`
  $('aboutEdition').textContent = info.store ? 'Microsoft Store' : ''
  $('aboutUpdate').textContent = info.store ? 'Microsoft Store에서 업데이트 확인' : '최신 업데이트 확인'
  $('aboutUpdateResult').classList.add('hidden')
  $('aboutFeedback').classList.add('hidden')
  $('about').classList.remove('hidden')
}

function wireAbout () {
  $('aboutOpen').onclick = openAbout
  $('aboutClose').onclick = () => $('about').classList.add('hidden')
  $('aboutSite').onclick = () => window.yue.aboutOpen('site')
  $('aboutPrivacy').onclick = (event) => { event.preventDefault(); window.yue.aboutOpen('privacy') }
  $('aboutUpdate').onclick = async () => {
    if (storeBuild) return window.yue.aboutOpen('store')
    const result = $('aboutUpdateResult')
    result.textContent = '확인하는 중…'
    result.classList.remove('hidden')
    $('aboutUpdate').disabled = true
    try {
      const info = await window.yue.checkUpdate({ manual: true })
      if (info) {
        result.classList.add('hidden')
        $('about').classList.add('hidden')
        updateSkipped = false
        showUpdate(info)
      } else {
        result.textContent = '최신 버전을 쓰고 있습니다.'
      }
    } catch (error) {
      result.textContent = '업데이트를 확인하지 못했습니다. 인터넷 연결을 확인해 주세요.'
    } finally {
      $('aboutUpdate').disabled = false
    }
  }
  $('fbKind').onchange = () => { $('fbLog').checked = $('fbKind').value === 'report' }
  // Feedback is written on the site's board (피드백·요청 제안). The in-app form is
  // kept for "오류 신고하기", which can attach the recent log.
  $('aboutFeedbackOpen').onclick = () => window.yue.aboutOpen('feedback')
  $('fbCancel').onclick = () => $('aboutFeedback').classList.add('hidden')
  $('aboutFeedback').onsubmit = async (event) => {
    event.preventDefault()
    $('fbSend').disabled = true
    try {
      const result = await window.yue.sendFeedback({
        kind: $('fbKind').value,
        email: $('fbEmail').value,
        message: $('fbMessage').value,
        withSystem: $('fbSystem').checked,
        withLog: $('fbLog').checked
      })
      if (!result.ok) return toast(result.error || '보내지 못했습니다.', 5000)
      $('fbMessage').value = ''
      $('aboutFeedback').classList.add('hidden')
      toast('보냈습니다. 고맙습니다!', 4000)
    } finally {
      $('fbSend').disabled = false
    }
  }
}

async function boot () {
  const state = await window.yue.state()
  $('gpuInfo').textContent = state.gpu && state.gpu.name
    ? `${state.gpu.name} ${state.gpu.vramGb}GB` : 'GPU 없음'
  // package.json carries a semver patch level the product name never shows.
  $('versionInfo').textContent = `버전 ${String(state.version || '0.1.0').replace(/\.0$/, '')}`
  // Resolve on click: the folder follows whichever project is selected now.
  $('openFolder').onclick = async () => {
    const now = await window.yue.state()
    if (now.songsDir) window.yue.open(now.songsDir)
  }
  userPresets = await window.yue.presets()
  renderPresets()
  const settings = await window.yue.getSettings()
  $('autoMp3').checked = settings.autoMp3
  $('dropWav').checked = settings.dropWav
  $('dropWav').disabled = !settings.autoMp3
  showLocations()
  storeBuild = Boolean(state.store)
  enginesInstalled = { ...enginesInstalled, ...(state.engines || {}) }
  enginesRepair = { ...enginesRepair, ...(state.repair || {}) }
  showEngineChoice()
  if (!state.ready) {
    await openEngines({ firstRun: true })
    return
  }
  await startApp()
}

// The library, the queue and the update check: what opens once the engine screen
// (if it was shown) is out of the way.
async function startApp () {
  checkUpdate() // 기다리지 않고 바로 — 곡 목록을 읽기 전에 시작한다
  queueState = await window.yue.queue()
  await refresh()
}

// Renderer failures are invisible without DevTools, so mirror them into app.log.
const report = (what, error) => {
  const text = `${what}: ${(error && (error.stack || error.message)) || error}`
  try { window.yue.log(text) } catch { /* nothing else we can do */ }
  toast(`문제가 생겼습니다: ${String((error && error.message) || error).slice(0, 120)}`, 8000)
}
window.addEventListener('error', (e) => report('error', e.error || e.message))
window.addEventListener('unhandledrejection', (e) => report('rejection', e.reason))

try {
  wireSetup()
  wireJobs()
  wireUi()
  wireDeleteMode()
  wireSongInfo()
  wireNotices()
  wireUpdate()
  window.RoadAppReady = boot()
} catch (error) {
  report('startup', error)
}
