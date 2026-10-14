'use strict'
const { app, BrowserWindow, ipcMain, shell, dialog, Menu, screen, powerSaveBlocker } = require('electron')
const { spawn, execFile } = require('child_process')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const https = require('https')
const http = require('http')
const crypto = require('crypto')
const os = require('os')
const { pathToFileURL } = require('url')
const appUpdate = require('./app-update')
const { generationError } = require('../renderer/generation-options')
const midiTools = require('./midi')
const videoTools = require('./video')

const WIN = process.platform === 'win32'
const MAC = process.platform === 'darwin'
const OS_NAME = MAC ? 'macOS' : WIN ? 'Windows' : os.type()
const UV_URL = 'https://github.com/astral-sh/uv/releases/latest/download/' + (WIN ? 'uv-x86_64-pc-windows-msvc.zip'
  : `uv-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin.tar.gz`)
const YUE_URL = 'https://github.com/multimodal-art-projection/YuE/archive/refs/tags/yue2-v0.1.6.zip'
const TORCH_INDEX = 'https://download.pytorch.org/whl/cu128'
const MODEL_BYTES = 8.4 * 1024 ** 3 // both checkpoints, used for the download bar
// ACE-Step 1.5, the second engine: pinned to the commit tried on an RTX 3050 8GB.
const ACE_COMMIT = 'ca1e85fe9430179831e6bc6be790c332190a3866'
const ACE_URL = `https://github.com/ace-step/ACE-Step-1.5/archive/${ACE_COMMIT}.zip`

let win = null
let worker = null
let currentJob = null
// Songs queue up and run one at a time: a single 8GB GPU cannot generate two at once.
const queue = []
// Jobs that died on their own keep their request here so one click can run them again.
const failed = []
let paused = false
let queueRestored = false
const jobResults = new Map()
let recordingActive = false
let fileTransferTasks = 0
let setupRunning = 0
let activeWork = 0
let updatePreparing = false
const updateWatchers = new Set()

// Pin the data folder to a stable name so renaming the product later never orphans
// an installed runtime or someone's settings.
app.setPath('userData', process.env.ROADMUSIC_DATA_DIR
  ? path.resolve(process.env.ROADMUSIC_DATA_DIR) : path.join(app.getPath('appData'), 'Road Music'))

const cliService = process.argv.includes('--roadmusic-service')
let showRequested = !cliService
// GUI and CLI must share one queue and one set of GPU models.
if (!app.requestSingleInstanceLock()) app.exit(0)
const cliBridge = require('./cli-transport').createBridge({ ipcMain, dialog, userData: app.getPath('userData') })
app.on('second-instance', (_event, argv) => {
  if (!argv.includes('--roadmusic-service')) {
    showRequested = true
    if (win && !win.isDestroyed()) { win.show(); win.focus() }
  }
})

const userData = () => app.getPath('userData')
const unpacked = (p) => p.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)

// 0.1 renamed the app from YueStudio. Carry the old settings over and keep using the
// runtime already installed under the old folder instead of downloading 4GB again
// (a venv cannot simply be moved: its interpreter paths are absolute).
function migrateLegacyData () {
  const target = path.join(userData(), 'settings.json')
  const legacyDir = path.join(app.getPath('appData'), 'yue-studio')
  const legacy = path.join(legacyDir, 'settings.json')
  if (fs.existsSync(target) || !fs.existsSync(legacy)) return
  try {
    const settings = JSON.parse(fs.readFileSync(legacy, 'utf8'))
    const legacyPython = path.join(legacyDir, 'runtime', 'venv', 'Scripts', 'python.exe')
    if (!settings.pythonPath && fs.existsSync(legacyPython)) settings.pythonPath = legacyPython
    fs.mkdirSync(userData(), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(settings, null, 1), 'utf8')
  } catch (error) {
    console.error('migration skipped:', error.message)
  }
}

migrateLegacyData()

// settings.json may pin an existing Python environment / model cache (used for
// development, and as an escape hatch when the runtime lives on another drive).
function settingsSync () {
  try { return JSON.parse(fs.readFileSync(path.join(userData(), 'settings.json'), 'utf8')) } catch { return {} }
}

const venvPython = (venv) => WIN ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python')

const paths = () => {
  const root = userData()
  const pinned = settingsSync()
  // The runtime and the checkpoints together are ~11GB. dataDir lets them live on a
  // roomier drive; without it they stay where Windows puts app data.
  const dataDir = pinned.dataDir || root
  return {
    root,
    dataDir,
    runtime: path.join(dataDir, 'runtime'),
    uv: path.join(dataDir, 'runtime', WIN ? 'uv.exe' : 'uv'),
    venv: path.join(dataDir, 'runtime', 'venv'),
    python: pinned.pythonPath || venvPython(path.join(dataDir, 'runtime', 'venv')),
    // With a chosen data folder the models go beside the runtime; otherwise the
    // standard Hugging Face cache, which other local AI tools already share.
    hfHome: pinned.hfHome || process.env.YUESTUDIO_HF_HOME || process.env.HF_HOME ||
      (pinned.dataDir ? path.join(dataDir, 'models')
        : path.join(os.homedir(), '.cache', 'huggingface')),
    settings: path.join(root, 'settings.json'),
    songsPinned: pinned.songsDir || null,
    // Packaged scripts live inside app.asar, which Python cannot read; electron-builder
    // mirrors the unpacked copies next to it.
    worker: unpacked(path.join(__dirname, '..', 'python', 'worker.py')),
    setupModels: unpacked(path.join(__dirname, '..', 'python', 'setup_models.py')),
    // ACE-Step lives apart from YuE2: it needs another PyTorch (2.7.1). Its source,
    // environment and checkpoints (src/checkpoints, where ACE-Step looks) stay together.
    aceRoot: path.join(dataDir, 'engines', 'ace-step'),
    aceSrc: path.join(dataDir, 'engines', 'ace-step', 'src'),
    aceVenv: path.join(dataDir, 'engines', 'ace-step', 'venv'),
    acePython: venvPython(path.join(dataDir, 'engines', 'ace-step', 'venv')),
    aceWorker: unpacked(path.join(__dirname, '..', 'python', 'ace_worker.py')),
    aceSetupModels: unpacked(path.join(__dirname, '..', 'python', 'ace_setup_models.py'))
  }
}

const send = (channel, payload) => {
  if (channel === 'job:started' && payload) jobResults.delete(payload.jobId)
  if ((channel === 'job:done' || channel === 'job:error') && payload && payload.jobId) {
    jobResults.set(payload.jobId, channel === 'job:done' ? { ok: true, song: payload } : { ok: false, ...payload })
    if (jobResults.size > 64) jobResults.delete(jobResults.keys().next().value)
    saveQueue()
  }
  cliBridge.publish(channel, payload)
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  if (channel === 'update:status') notifyUpdateWatchers(payload)
}
const setupLog = (text) => send('setup:log', text)

const updateWatchKey = (state) => JSON.stringify({
  status: state && state.status,
  available: state && state.available,
  version: state && state.version,
  error: state && state.error
})

function notifyUpdateWatchers (state) {
  if (!state || !(state.status === 'error' || (state.available && ['available', 'downloaded'].includes(state.status)))) return
  const key = updateWatchKey(state)
  for (const watcher of updateWatchers) {
    if (watcher.key === key) continue
    clearTimeout(watcher.timer)
    updateWatchers.delete(watcher)
    watcher.resolve({ ...state, changed: true })
  }
}

function updateInput (value, allowed = []) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw Object.assign(new Error('업데이트 요청은 JSON 객체여야 합니다.'), { code: 'INVALID_ARGUMENT' })
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw Object.assign(new Error('알 수 없는 업데이트 요청 필드: ' + key), { code: 'INVALID_ARGUMENT' })
  }
  return value
}

function waitForUpdate (timeoutMs) {
  const initial = appUpdate.status()
  if (initial.status === 'error' || (initial.available && ['available', 'downloaded'].includes(initial.status))) return Promise.resolve({ ...initial, changed: true })
  return new Promise((resolve) => {
    const watcher = {
      key: updateWatchKey(initial),
      resolve,
      timer: setTimeout(() => {
        updateWatchers.delete(watcher)
        resolve({ ...appUpdate.status(), timedOut: true })
      }, timeoutMs)
    }
    updateWatchers.add(watcher)
  })
}

function updateBlocksWork () {
  return updatePreparing || appUpdate.status().status === 'installing'
}

function updateBusy () {
  return Boolean(currentJob || queue.length || installing || setupRunning || activeWork || renderJobs.size || recordingActive || fileTransferTasks || cliBridge.rendererBusy())
}

async function ensureUpdateDownloaded () {
  let state = appUpdate.status()
  if (!['available', 'downloaded'].includes(state.status)) state = await appUpdate.check()
  return state.status === 'available' ? appUpdate.download() : state
}

// Durable log next to the settings file; the first place to look when the app
// misbehaves on someone else's machine.
function log (...parts) {
  const line = `[${new Date().toISOString()}] ${parts.map(
    (p) => typeof p === 'string' ? p : JSON.stringify(p)).join(' ')}\n`
  try {
    fs.mkdirSync(userData(), { recursive: true })
    fs.appendFileSync(path.join(userData(), 'app.log'), line, 'utf8')
  } catch { /* logging must never break the app */ }
  process.stdout.write(line)
}

async function readSettings () {
  try { return JSON.parse(await fsp.readFile(paths().settings, 'utf8')) } catch { return {} }
}
let settingsWrites = Promise.resolve()
function writeSettings (patch) {
  const task = settingsWrites.then(async () => {
    const next = { ...(await readSettings()), ...patch }
    await fsp.mkdir(userData(), { recursive: true })
    const target = paths().settings
    const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
    try {
      await fsp.writeFile(temporary, JSON.stringify(next, null, 1), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      await fsp.rename(temporary, target)
    } finally { await fsp.rm(temporary, { force: true }).catch(() => {}) }
    return next
  })
  settingsWrites = task.catch(() => {})
  return task
}

// ── helpers ──────────────────────────────────────────────────────────────────
function run (file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { ...options, windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d
      if (options.stream) String(d).split(/\r?\n/).filter(Boolean).forEach(setupLog)
    })
    child.stderr.on('data', (d) => {
      err += d
      if (options.stream) String(d).split(/\r?\n/).filter(Boolean).forEach(setupLog)
    })
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve(out.trim())
      : reject(new Error(`${path.basename(file)} exited ${code}\n${(err || out).slice(-2000)}`)))
  })
}

function download (url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get = (link, redirects = 0) => https.get(link, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        if (redirects > 5) return reject(new Error('too many redirects'))
        res.resume()
        return get(res.headers.location, redirects + 1)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${link}`))
      const total = Number(res.headers['content-length'] || 0)
      let got = 0
      res.on('data', (chunk) => {
        got += chunk.length
        if (onProgress) onProgress(got, total)
      })
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(dest)))
    }).on('error', reject)
    get(url)
  })
}

// strip drops leading folders on the Mac (uv's .tar.gz wraps the binary in one); the
// Windows zips are flat. macOS tar (bsdtar) reads .zip as well as .tar.gz.
const unzip = async (zip, dest, strip = 0) => {
  if (WIN) {
    return run('powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dest}' -Force`])
  }
  await fsp.mkdir(dest, { recursive: true })
  return run('/usr/bin/tar', ['-xf', zip, '-C', dest, '--strip-components', String(strip)])
}

async function exists (p) { try { await fsp.access(p); return true } catch { return false } }

// A OneDrive-backed Documents folder can make mkdir hang forever instead of failing,
// which silently froze song creation. Probe candidates with a timeout and remember
// the first folder that actually accepts a write.
let songsDir = null

async function ensureSongsDir () {
  if (songsDir) return songsDir
  const p = paths()
  const candidates = [
    p.songsPinned,
    !process.env.ROADMUSIC_DATA_DIR && path.join(app.getPath('documents'), 'YueStudio', 'Songs'),
    !process.env.ROADMUSIC_DATA_DIR && path.join(os.homedir(), 'YueStudio', 'Songs'),
    path.join(userData(), 'Songs')
  ].filter(Boolean)
  for (const dir of candidates) {
    const probe = path.join(dir, '.write-test')
    try {
      await withTimeout(fsp.mkdir(probe, { recursive: true }), 4000)
      await withTimeout(fsp.rmdir(probe), 4000)
      songsDir = dir
      if (dir !== p.songsPinned) await writeSettings({ songsDir: dir })
      log('songs folder', dir)
      return dir
    } catch (error) {
      log('songs folder unusable', dir, error.message)
    }
  }
  throw new Error('곡을 저장할 폴더를 만들지 못했습니다.')
}

// Songs live in Songs\<project>\<song>. One project is current at a time; everything
// made while it is selected lands in its folder.
const DEFAULT_PROJECT = '기본'
const projectName = () => settingsSync().project || DEFAULT_PROJECT

async function projectDir (name = projectName()) {
  const dir = path.join(await ensureSongsDir(), slug(name))
  await fsp.mkdir(dir, { recursive: true })
  return dir
}

// 0.5 introduced projects; songs made before it sit loose in Songs\ and belong to
// the default project.
async function migrateLooseSongs () {
  const root = await ensureSongsDir()
  const home = await projectDir(DEFAULT_PROJECT)
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const full = path.join(root, entry.name)
    if (full === home || !await exists(path.join(full, 'meta.json'))) continue
    try {
      await fsp.rename(full, path.join(home, entry.name))
      log('moved into default project', entry.name)
    } catch (error) {
      log('could not move song into project', entry.name, error.message)
    }
  }
  // Renaming a song folder in an older version could leave the empty original behind
  // at the root, where it then read as a project with no songs in it.
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{14}_/.test(entry.name)) continue
    try {
      if (!(await fsp.readdir(path.join(root, entry.name))).length) {
        await fsp.rmdir(path.join(root, entry.name))
        log('removed empty leftover folder', entry.name)
      }
    } catch { /* 지우지 못해도 그만이다 */ }
  }
}

async function listProjects () {
  const root = await ensureSongsDir()
  await projectDir(DEFAULT_PROJECT) // 최소 한 개는 늘 있게 한다
  const names = []
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const songs = (await fsp.readdir(path.join(root, entry.name), { withFileTypes: true }))
      .filter((child) => child.isDirectory()).length
    names.push({ name: entry.name, songs })
  }
  return names.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

// Windows' ransomware protection (Controlled Folder Access) guards Documents, Music,
// Desktop and the like against unsigned programs such as this one. A blocked write
// from the app itself can hang instead of failing, and a hung file call ties up one of
// the few threads every file operation shares. So a throwaway copy of this same
// executable — judged the same way by Windows Defender — tries first, and is killed
// if it stalls.
const BLOCKED_FOLDER = '이 폴더에는 저장할 수 없습니다.\n\n' +
  'Windows 보안의 "랜섬웨어 방지(제어된 폴더 액세스)"가 켜져 있으면 문서·음악·사진·바탕 화면 ' +
  '같은 폴더에 프로그램이 파일을 만들지 못하게 막습니다.\n\n' +
  '다른 폴더(예: D 드라이브의 폴더)를 고르거나, Windows 보안 → 바이러스 및 위협 방지 → ' +
  '랜섬웨어 방지 관리 → "제어된 폴더 액세스를 통해 앱 허용"에서 Road Music을 추가한 뒤 다시 시도해주세요.'

function canWrite (dir, ms = 8000) {
  return new Promise((resolve) => {
    const probe = path.join(dir, `.roadmusic-probe-${process.pid}-${Date.now()}`)
    const script = "const fs=require('fs');fs.mkdirSync(process.argv[1]);fs.rmdirSync(process.argv[1])"
    execFile(process.execPath, ['-e', script, probe],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: ms, windowsHide: true },
      (error) => {
        if (error) log('folder not writable', dir, error.killed ? 'timed out' : error.message.split('\n')[0])
        resolve(!error)
      })
  })
}

function withTimeout (promise, ms) {
  return Promise.race([promise, new Promise((_resolve, reject) =>
    setTimeout(() => reject(new Error(`응답 없음 (${ms}ms 초과)`)), ms))])
}

// Prefer a full "cpython-3.12.14-..." directory over uv's minor-version link, which
// can be left behind broken; verify the interpreter actually runs before using it.
async function findManagedPython (dir) {
  let entries = []
  try { entries = await fsp.readdir(dir) } catch { return null }
  const candidates = entries
    .filter((name) => /^cpython-3\.12/.test(name))
    .sort((a, b) => (/^cpython-3\.12\.\d/.test(b) ? 1 : 0) - (/^cpython-3\.12\.\d/.test(a) ? 1 : 0))
  for (const name of candidates) {
    const exe = WIN ? path.join(dir, name, 'python.exe') : path.join(dir, name, 'bin', 'python3.12')
    if (!await exists(exe)) continue
    try {
      await run(exe, ['-c', 'pass'])
      return exe
    } catch { /* broken link directory — try the next candidate */ }
  }
  return null
}

// YuE2 runs in BF16, which only Ampere and newer cards (compute capability 8.0+)
// execute natively. On a GTX 10/16 or RTX 20 series PyTorch reports bf16 as
// "supported" through emulation, so the check has to look at the card itself —
// otherwise the user downloads 11GB and only then finds out.
const MIN_COMPUTE = 8.0

// The card is found three ways, most exact first, because "no NVIDIA card" on a PC that
// has one is the worst answer the engine screen can give (an RTX 4060 owner was told
// exactly that):
//   1. nvidia-smi from PATH, System32, the old NVSMI folder or the driver store — DCH,
//      OEM laptop and older drivers each put it somewhere else
//   2. the same tool without the compute_cap field, which drivers before R510 reject;
//      the generation then comes from the card's name
//   3. Windows' own record of the display adapter (registry), when nvidia-smi will not
//      run at all — typically right after a driver update, until the PC restarts
// Every failure is logged, so a support question can be answered from the log.
let nvidiaSmi = null // the nvidia-smi that answered, reused by the VRAM gauge

function smiCandidates () {
  const root = process.env.SystemRoot || 'C:\\Windows'
  const list = ['nvidia-smi', path.join(root, 'System32', 'nvidia-smi.exe'),
    path.join(process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files', 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe')]
  try {
    const store = path.join(root, 'System32', 'DriverStore', 'FileRepository')
    for (const name of fs.readdirSync(store)) {
      if (/^nv/i.test(name)) list.push(path.join(store, name, 'nvidia-smi.exe'))
    }
  } catch {}
  // Dev only: pretend nvidia-smi is missing, to exercise the fallback.
  if (!app.isPackaged && process.env.ROADMUSIC_GPU_TEST === 'nosmi') return []
  return list.filter((file, i) => i === 0 || fs.existsSync(file))
}

// RTX 20 → 7.5, 30 → 8.6, 40 → 8.9, 50 → 12.0; null when the name says nothing.
function computeFromName (name) {
  const n = String(name || '').toUpperCase()
  if (/RTX\s*50\d\d/.test(n)) return 12.0
  if (/RTX\s*40\d\d|\bADA\b|\bL40|\bL4\b/.test(n)) return 8.9
  if (/RTX\s*30\d\d|RTX\s*A\d{3,4}\b|\bA(10|16|40)\b/.test(n)) return 8.6
  if (/RTX\s*20\d\d|TITAN RTX|QUADRO RTX|\bT4\b|GTX\s*16\d\d/.test(n)) return 7.5
  if (/GTX\s*10\d\d|TITAN X/.test(n)) return 6.1
  return null
}

const gpuResult = (name, vramGb, compute, source) => ({
  ok: true, name, vramGb, compute, source,
  bf16: compute === null || compute >= MIN_COMPUTE
})

async function smiGpu (smi) {
  const ask = async (fields) => {
    const out = await withTimeout(run(smi, [`--query-gpu=${fields}`, '--format=csv,noheader,nounits']), 15000)
    return out.split(/\r?\n/).map((line) => line.split(',').map((s) => s.trim())).filter((row) => row[0])
  }
  let rows
  try {
    rows = await ask('name,memory.total,compute_cap')
  } catch (error) {
    if (!/compute_cap|not a valid field/i.test(error.message)) throw error
    rows = (await ask('name,memory.total')).map((row) => [...row, ''])
  }
  // Several cards: the one with the most memory is the one the engines will use.
  const cards = rows.map(([name, mb, cap]) => ({ name, mb: Number(mb), cap: Number(cap) }))
    .filter((card) => card.name && Number.isFinite(card.mb))
  if (!cards.length) throw new Error(`nvidia-smi gave no card: ${rows.join(' | ').slice(0, 200)}`)
  const card = cards.sort((a, b) => b.mb - a.mb)[0]
  const compute = Number.isFinite(card.cap) && card.cap > 0 ? card.cap : computeFromName(card.name)
  return gpuResult(card.name, Math.round(card.mb / 1024 * 10) / 10, compute, 'nvidia-smi')
}

// The display adapters Windows has installed, from the registry: name and exact memory.
async function windowsGpu () {
  const script = "$k='HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}';" +
    "Get-ChildItem $k -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue;" +
    " if ($p.DriverDesc) { [pscustomobject]@{ name = $p.DriverDesc; mem = $p.'HardwareInformation.qwMemorySize'; driver = $p.DriverVersion } } } |" +
    // Some subkeys refuse to be read; that leaves an error status even though the list
    // is complete, so the script ends with an explicit success.
    ' ConvertTo-Json -Compress; exit 0'
  const out = await withTimeout(run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]), 20000)
  const list = [].concat(JSON.parse(out || '[]') || [])
  const nvidia = list.filter((card) => /nvidia/i.test(card.name))
  if (!nvidia.length) return { ok: false, adapters: list.map((card) => card.name) }
  const card = nvidia.sort((a, b) => (Number(b.mem) || 0) - (Number(a.mem) || 0))[0]
  const gb = Number(card.mem) > 0 ? Math.round(Number(card.mem) / 2 ** 30 * 10) / 10 : 0
  return { ...gpuResult(card.name, gb, computeFromName(card.name), 'windows'), driver: card.driver }
}

function withTimeout (promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms))])
}

async function detectGpu () {
  // Apple Silicon: the GPU sits on the chip and works out of the machine's memory.
  if (MAC) {
    return process.arch === 'arm64'
      ? gpuResult((os.cpus()[0] || {}).model || 'Apple Silicon', Math.round(os.totalmem() / 2 ** 30 * 10) / 10, null, 'apple')
      : { ok: false, name: null, vramGb: 0, compute: null, bf16: false }
  }
  const failures = []
  for (const smi of smiCandidates()) {
    try {
      const gpu = await smiGpu(smi)
      nvidiaSmi = smi
      if (failures.length) log('gpu found after nvidia-smi failures', { smi, failures })
      return gpu
    } catch (error) {
      failures.push(`${smi}: ${String(error.message).split('\n').slice(0, 3).join(' ').slice(0, 300)}`)
    }
  }
  try {
    const gpu = await windowsGpu()
    log('gpu detect: nvidia-smi unusable, Windows says', { gpu, failures })
    if (gpu.ok) return { ...gpu, smiFailed: true }
    return { ok: false, name: null, vramGb: 0, compute: null, bf16: false, adapters: gpu.adapters }
  } catch (error) {
    log('gpu detect failed', { failures, windows: error.message })
    return { ok: false, name: null, vramGb: 0, compute: null, bf16: false }
  }
}

// ── first-run setup ──────────────────────────────────────────────────────────
const NEEDED_GB = 20
const NEEDED_VRAM_GB = 8
// Below 8GB it still runs (users made songs on laptop RTX 3060 6GB with 0.50), just
// slower as parts spill into system RAM — so 6~8GB is a warning, under 6GB a stop.
const FLOOR_VRAM_GB = 6

async function freeSpaceGb (target) {
  try {
    // Off Windows the volume is the one holding the nearest folder that exists yet.
    let at = WIN ? path.parse(target).root : target
    while (!fs.existsSync(at) && path.dirname(at) !== at) at = path.dirname(at)
    const stat = await fsp.statfs(at)
    return Math.round(stat.bsize * stat.bavail / 1024 ** 3 * 10) / 10
  } catch {
    return null
  }
}

// ── engines ──
// The app installs without any AI engine; each engine is added from the engine
// screen, and only on a PC that can run it. What each one needs is stated up front
// so nobody downloads 12GB to find out their card is too old.
const ENGINES = {
  yue: {
    id: 'yue',
    name: 'YuE2',
    tagline: '악보(ABC)부터 짜서 부르는 엔진. 악보 보기·편집, 악보로 커버, MIDI·ABC 불러오기를 쓸 수 있습니다. 3분 곡에 약 8~20분.',
    downloadGb: 11,
    needGb: NEEDED_GB,
    minVramGb: NEEDED_VRAM_GB,
    floorVramGb: FLOOR_VRAM_GB,
    minCompute: MIN_COMPUTE,
    supported: 'NVIDIA RTX 30·40·50 시리즈, 그래픽카드 메모리 8GB 권장 (예: RTX 3060, 4060, 5060 이상). 6GB 카드(노트북 RTX 3060 등)도 느리지만 쓸 수 있습니다',
    unsupported: 'GTX 10·16 시리즈, RTX 20 시리즈, 메모리 6GB 미만 카드, AMD·인텔 그래픽, 맥',
    steps: [['gpu', '그래픽카드 확인'], ['uv', '설치 도구 준비'], ['venv', '파이썬 환경 구성'],
      ['torch', 'AI 엔진 설치 (약 3GB)'], ['yue', 'YuE2 설치'], ['models', '음악 모델 다운로드 (약 8GB)'],
      ['verify', '엔진 점검']]
  },
  ace: {
    id: 'ace',
    name: 'ACE-Step 1.5',
    tagline: '빠른 엔진. 3분 곡에 약 2~3분이고, 가사 시간 정보(정확한 가사 자막)를 함께 만듭니다. 악보 기능은 없습니다. MIT 라이선스.',
    downloadGb: 12,
    needGb: 18,
    minVramGb: 8,
    floorVramGb: FLOOR_VRAM_GB,
    // RTX 20 series and up; before Ampere it runs in FP16 instead of BF16.
    minCompute: 7.5,
    supported: 'NVIDIA RTX 20·30·40·50 시리즈, 그래픽카드 메모리 8GB 권장 (예: RTX 2070, 3060, 4060 이상). 6GB 카드(노트북 RTX 3060, RTX 2060 등)도 느리지만 쓸 수 있습니다',
    unsupported: 'GTX 10·16 시리즈, 메모리 6GB 미만 카드, AMD·인텔 그래픽, 맥',
    steps: [['gpu', '그래픽카드 확인'], ['uv', '설치 도구 준비'], ['python', '파이썬 준비'],
      ['source', 'ACE-Step 받기'], ['deps', 'AI 엔진 설치 (약 4GB)'], ['models', '음악 모델 다운로드 (약 7.7GB)'],
      ['verify', '엔진 점검']]
  }
}

// On a Mac ACE-Step runs on Metal (MLX for the planner, DiT and VAE) out of unified
// memory, so "card memory" is the machine's memory. YuE2 needs CUDA and stays out.
// shortcut: limits guessed from one 64GB M1 Ultra run (MLX peak 18.8GiB); test 16/32GB Macs.
if (MAC) {
  Object.assign(ENGINES.ace, {
    minVramGb: 32,
    floorVramGb: 16,
    supported: 'Apple Silicon(M1 이상) 맥, 메모리 16GB 이상 (32GB 이상 권장)',
    unsupported: '인텔 맥, 메모리 16GB 미만 맥'
  })
}

// YuE2's weights live in a Hugging Face cache (HF_HOME/hub). A cache counts only when
// both repos have a resolved snapshot with their weights: a dangling link left by a
// half-moved folder, or an emptied cache, does not.
const YUE_REPOS = ['m-a-p/YuE2-3B', 'm-a-p/YuE2-Vae']
function yueModelsIn (home) {
  if (!home) return false
  return YUE_REPOS.every((repo) => {
    const dir = path.join(home, 'hub', `models--${repo.replace('/', '--')}`)
    try {
      const rev = fs.readFileSync(path.join(dir, 'refs', 'main'), 'utf8').trim()
      const snapshot = path.join(dir, 'snapshots', rev)
      return fs.existsSync(path.join(snapshot, 'config.json')) && fs.existsSync(path.join(snapshot, 'model.safetensors'))
    } catch { return false }
  })
}

// Where the YuE2 models are now. The configured place first, then where they may have
// been left: the standard cache, the data folder, or a machine-wide HF_HOME. (Before
// 1.2.1 the place was not pinned at install, so another AI tool setting HF_HOME later
// sent the app looking in the wrong folder.)
function findYueModels () {
  const p = paths()
  const pinned = settingsSync()
  const candidates = [p.hfHome, pinned.hfHome, process.env.YUESTUDIO_HF_HOME, process.env.HF_HOME,
    path.join(os.homedir(), '.cache', 'huggingface'), path.join(p.dataDir, 'models'), path.join(userData(), 'models')]
    .filter(Boolean).map((home) => path.resolve(home))
  return candidates.find((home, i) => candidates.indexOf(home) === i && yueModelsIn(home)) || null
}

const YUE_MODELS_MISSING = 'YuE2 모델 파일을 찾지 못했습니다. 위쪽 "설정 · 도구 → AI 엔진"에서 YuE2의 "다시 받기"를 누르면 빠진 파일만 다시 받습니다.'

async function engineInstalled (id) {
  const p = paths()
  const settings = await readSettings()
  if (id === 'yue') return Boolean(settings.setupDone) && await exists(p.python) && Boolean(findYueModels())
  if (id === 'ace') {
    return Boolean(settings.aceInstalled) && await exists(p.acePython) &&
      await exists(path.join(p.aceSrc, 'checkpoints', 'acestep-v15-turbo', 'model.safetensors'))
  }
  return false
}

// Checked before the first byte is downloaded: finding out about a full disk or an
// unsupported card after 11GB is a terrible first impression.
async function engineCheck (id) {
  const engine = ENGINES[id]
  const p = paths()
  const gpu = await detectGpu()
  // YuE2's runtime and models can sit on different drives; the tighter one decides.
  const places = id === 'yue' ? [p.dataDir, p.hfHome] : [p.dataDir]
  const spaces = await Promise.all(places.map(freeSpaceGb))
  const worst = spaces.reduce((low, gb, i) => gb !== null && (low === -1 || gb < spaces[low]) ? i : low, -1)
  const drive = path.parse(places[worst === -1 ? 0 : worst]).root
  const freeGb = worst === -1 ? null : spaces[worst]
  const problems = []
  const warnings = []
  if (!gpu.ok && MAC) {
    problems.push('이 맥에서는 AI 엔진을 쓸 수 없습니다. Apple Silicon(M1 이상) 맥이 필요합니다.')
  } else if (!gpu.ok) {
    const others = (gpu.adapters || []).filter(Boolean)
    problems.push('NVIDIA 그래픽카드를 찾지 못했습니다. AI 엔진은 NVIDIA 그래픽카드에서만 작동합니다.' +
      (others.length ? ` (이 PC에서 보이는 그래픽: ${others.join(', ')})` : '') +
      ' NVIDIA 카드가 있다면 NVIDIA 드라이버를 설치·업데이트한 뒤 PC를 다시 시작해 주세요.')
  } else if (MAC && id === 'yue') {
    problems.push('YuE2는 NVIDIA 그래픽카드 전용이라 맥에서는 쓸 수 없습니다. ACE-Step 1.5를 설치해 주세요.')
  } else if (gpu.compute !== null && gpu.compute < engine.minCompute) {
    problems.push(id === 'yue'
      ? `${gpu.name}는 YuE2가 쓰는 BF16 연산을 지원하지 않습니다. RTX 30 시리즈 이상이 필요합니다.`
      : `${gpu.name}는 ${engine.name}를 지원하지 않는 세대입니다. RTX 20 시리즈 이상이 필요합니다.`)
  }
  if (MAC && gpu.ok) {
    if (gpu.vramGb < engine.floorVramGb - 0.5) {
      problems.push(`이 맥의 메모리가 ${gpu.vramGb}GB입니다. ${engine.name}에는 최소 ${engine.floorVramGb}GB가 필요합니다.`)
    } else if (gpu.vramGb < engine.minVramGb - 0.5) {
      warnings.push(`이 맥의 메모리가 ${gpu.vramGb}GB라 권장(${engine.minVramGb}GB)보다 적습니다. ` +
        '설치할 수 있지만 곡을 만들 때 느리거나 메모리가 모자랄 수 있으니, 다른 프로그램을 닫고 써 주세요.')
    }
  } else if (gpu.ok && !(gpu.vramGb > 0)) {
    // Read from Windows and the size was not recorded: say so rather than block on 0GB.
    warnings.push(`그래픽카드 메모리 크기를 확인하지 못했습니다. ${engine.name}에는 ${engine.minVramGb}GB 이상을 권장합니다.`)
  } else if (gpu.ok && gpu.vramGb < engine.floorVramGb - 0.5) {
    problems.push(`그래픽카드 메모리가 ${gpu.vramGb}GB입니다. ${engine.name}에는 최소 ${engine.floorVramGb}GB가 필요합니다.`)
  } else if (gpu.ok && gpu.vramGb < engine.minVramGb - 0.5) {
    warnings.push(`그래픽카드 메모리가 ${gpu.vramGb}GB라 권장(${engine.minVramGb}GB)보다 적습니다. 설치하고 곡을 만들 수 있지만, ` +
      '일부를 PC 메모리(RAM)로 옮겨 가며 돌리므로 더 오래 걸립니다. PC 메모리는 16GB 이상이면 좋습니다.')
  }
  if (freeGb !== null && freeGb < engine.needGb) {
    problems.push(`${drive} 드라이브 여유 공간이 ${freeGb}GB입니다. ${engine.name} 설치에 ${engine.needGb}GB가 필요합니다. ` +
      '공간을 비우거나 설치 위치를 다른 드라이브로 바꿔 주세요.')
  }
  if (gpu.ok && gpu.smiFailed) {
    warnings.push('NVIDIA 드라이버 도구(nvidia-smi)가 응답하지 않아 Windows에 등록된 정보로 그래픽카드를 확인했습니다. ' +
      '드라이버를 방금 업데이트했다면 PC를 다시 시작한 뒤 설치해 주세요.')
  }
  if (id === 'ace' && gpu.ok && gpu.compute !== null && gpu.compute < 8) {
    warnings.push('RTX 20 시리즈에서는 FP16으로 동작합니다. RTX 30 시리즈보다 느릴 수 있습니다.')
  }
  log('engine check', id, { gpu, drive, freeGb, problems, warnings })
  return { ok: problems.length === 0, gpu, drive, freeGb, needGb: engine.needGb, problems, warnings }
}

function setupSkipReason (id) {
  if (MAC && id === 'yue') return 'YuE2는 macOS에서 지원하지 않습니다.'
  return null
}

async function setupCheck () {
  const results = await Promise.all(Object.keys(ENGINES).map(async (id) => {
    const reason = setupSkipReason(id)
    return reason ? { id, reason } : { id, check: await engineCheck(id) }
  }))
  const engines = Object.fromEntries(results.filter(({ check }) => check).map(({ id, check }) => [id, check]))
  const skipped = results.filter(({ reason }) => reason).map(({ id, reason }) => ({ id, reason }))
  const checks = Object.values(engines)
  const primary = checks.find((check) => check.ok) || engines.ace || checks[0]
  const ok = checks.some((check) => check.ok)
  return {
    ...primary,
    ok,
    problems: ok ? [] : checks.flatMap((check) => check.problems),
    warnings: [...new Set(checks.flatMap((check) => check.warnings))],
    engines,
    skipped
  }
}

const preflight = () => engineCheck('yue')

async function runSetup () {
  const p = paths()
  const check = await preflight()
  if (!check.ok) throw new Error(check.problems.join('\n'))
  const gpu = check.gpu
  send('setup:step', { step: 'gpu', status: 'done', detail: `${gpu.name} (${gpu.vramGb}GB)` })

  await fsp.mkdir(p.runtime, { recursive: true })
  await fsp.mkdir(p.hfHome, { recursive: true })

  // 1. uv (standalone Python/package manager)
  send('setup:step', { step: 'uv', status: 'run' })
  await ensureUv()
  send('setup:step', { step: 'uv', status: 'done' })

  // 2. Python 3.12 virtual environment
  if (!await exists(p.python)) {
    send('setup:step', { step: 'venv', status: 'run' })
    // uv finishes `python install` by creating a minor-version link directory; that
    // step fails on some Windows setups even though the interpreter itself unpacked
    // fine. Treat it as non-fatal and pick the interpreter off disk ourselves.
    try {
      await run(p.uv, ['python', 'install', '3.12'], { stream: true, env: uvEnv() })
    } catch (error) {
      setupLog(`python install 경고: ${error.message.split('\n')[0]}`)
    }
    const python = await findManagedPython(path.join(p.runtime, 'python'))
    if (!python) throw new Error('파이썬 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.')
    await run(p.uv, ['venv', '--python', python, p.venv], { stream: true, env: uvEnv() })
  }
  send('setup:step', { step: 'venv', status: 'done' })

  // 3. PyTorch (CUDA) — the big one, ~3GB
  send('setup:step', { step: 'torch', status: 'run' })
  await run(p.uv, ['pip', 'install', '--python', p.python, 'torch==2.10.0',
    '--index-url', TORCH_INDEX], { stream: true, env: uvEnv() })
  send('setup:step', { step: 'torch', status: 'done' })

  // 4. YuE2 + helpers
  send('setup:step', { step: 'yue', status: 'run' })
  await run(p.uv, ['pip', 'install', '--python', p.python, YUE_URL,
    'imageio-ffmpeg==0.6.0'], { stream: true, env: uvEnv() })
  send('setup:step', { step: 'yue', status: 'done' })

  // 5. model weights — into the cache that already holds them if there is one, so a
  // reinstall fetches only what is missing.
  const modelsHome = findYueModels() || p.hfHome
  send('setup:step', { step: 'models', status: 'run' })
  await new Promise((resolve, reject) => {
    const child = spawn(p.python, ['-u', p.setupModels], {
      env: { ...process.env, HF_HOME: modelsHome, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      windowsHide: true
    })
    let err = ''
    child.stdout.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((line) => {
      try {
        const event = JSON.parse(line)
        if (event.type === 'progress') {
          send('setup:progress', { step: 'models', got: event.bytes, total: MODEL_BYTES })
        } else if (event.type === 'error') {
          err += event.message
        }
      } catch { setupLog(line) }
    }))
    child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(err.slice(-2000) || `모델 다운로드 실패 (${code})`)))
  })
  send('setup:step', { step: 'models', status: 'done' })

  // 6. prove the engine actually starts here — a missing Visual C++ runtime or a
  // broken install otherwise only shows up when the user asks for their first song.
  send('setup:step', { step: 'verify', status: 'run' })
  try {
    const report = await run(p.python, ['-c',
      'import torch, yue2, soundfile; print("cuda", torch.cuda.is_available())'])
    log('engine check', report)
    if (!/cuda True/.test(report)) {
      throw new Error('그래픽카드를 인식하지 못했습니다. NVIDIA 드라이버를 최신으로 올린 뒤 다시 시도해 주세요.')
    }
  } catch (error) {
    throw new Error(`AI 엔진 점검에 실패했습니다.\n\n${explainCrash(String(error.message).split('\n'))}`)
  }
  send('setup:step', { step: 'verify', status: 'done' })

  // 7. remember the bundled ffmpeg that came with imageio-ffmpeg
  let ffmpeg = null
  try {
    ffmpeg = await run(p.python, ['-c',
      'import imageio_ffmpeg,sys;sys.stdout.write(imageio_ffmpeg.get_ffmpeg_exe())'])
  } catch { /* export falls back to WAV */ }

  // Pin where the models went, so a later machine-wide HF_HOME cannot move the app's view.
  await writeSettings({ setupDone: true, gpu, ffmpeg, installedAt: new Date().toISOString(), hfHome: modelsHome })
  return { ok: true, gpu }
}

// uv and a Python 3.12 are shared by both engines' environments.
async function ensureUv () {
  const p = paths()
  await fsp.mkdir(p.runtime, { recursive: true })
  if (await exists(p.uv)) return
  const zip = path.join(os.tmpdir(), path.basename(UV_URL))
  await download(UV_URL, zip, (got, total) => send('setup:progress', { step: 'uv', got, total }))
  await unzip(zip, p.runtime, 1)
  await fsp.unlink(zip).catch(() => {})
}

async function ensurePython312 () {
  const p = paths()
  let python = await findManagedPython(path.join(p.runtime, 'python'))
  if (python) return python
  try {
    await run(p.uv, ['python', 'install', '3.12'], { stream: true, env: uvEnv() })
  } catch (error) {
    setupLog(`python install 경고: ${error.message.split('\n')[0]}`)
  }
  python = await findManagedPython(path.join(p.runtime, 'python'))
  if (!python) throw new Error('파이썬 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.')
  return python
}

// ACE-Step 1.5: its own PyTorch in its own environment, and only the checkpoints the
// worker loads (turbo DiT, VAE, text encoder, 0.6B planner — about 7.7GB).
async function runAceSetup () {
  const p = paths()
  const check = await engineCheck('ace')
  if (!check.ok) throw new Error(check.problems.join('\n'))
  send('setup:step', { step: 'gpu', status: 'done', detail: `${check.gpu.name} (${check.gpu.vramGb}GB)` })

  send('setup:step', { step: 'uv', status: 'run' })
  await ensureUv()
  send('setup:step', { step: 'uv', status: 'done' })

  send('setup:step', { step: 'python', status: 'run' })
  const python = await ensurePython312()
  send('setup:step', { step: 'python', status: 'done' })

  // The source at the pinned commit. Checkpoints from an earlier install are carried
  // into the fresh copy rather than downloaded again.
  send('setup:step', { step: 'source', status: 'run' })
  await fsp.mkdir(p.aceRoot, { recursive: true })
  const zip = path.join(os.tmpdir(), 'ace-step.zip')
  await download(ACE_URL, zip, (got, total) => send('setup:progress', { step: 'source', got, total }))
  const unpackDir = path.join(p.aceRoot, 'unpack')
  await fsp.rm(unpackDir, { recursive: true, force: true })
  await unzip(zip, unpackDir)
  await fsp.unlink(zip).catch(() => {})
  const [top] = await fsp.readdir(unpackDir)
  const kept = path.join(p.aceRoot, 'checkpoints.keep')
  if (await exists(path.join(p.aceSrc, 'checkpoints'))) {
    await fsp.rm(kept, { recursive: true, force: true })
    await fsp.rename(path.join(p.aceSrc, 'checkpoints'), kept)
  }
  await fsp.rm(p.aceSrc, { recursive: true, force: true })
  await fsp.rename(path.join(unpackDir, top), p.aceSrc)
  await fsp.rm(unpackDir, { recursive: true, force: true })
  if (await exists(kept)) await fsp.rename(kept, path.join(p.aceSrc, 'checkpoints'))
  send('setup:step', { step: 'source', status: 'done' })

  // Dependencies exactly as locked by the project (PyTorch 2.7.1 + CUDA 12.8 on Windows).
  send('setup:step', { step: 'deps', status: 'run' })
  const env = { ...uvEnv(), UV_PROJECT_ENVIRONMENT: p.aceVenv }
  await run(p.uv, ['sync', '--frozen', '--no-dev', '--python', python], { cwd: p.aceSrc, stream: true, env })
  // Faster, resumable downloads from the Hugging Face hub.
  await run(p.uv, ['pip', 'install', '--python', p.acePython, 'hf_xet'], { stream: true, env: uvEnv() })
  send('setup:step', { step: 'deps', status: 'done' })

  send('setup:step', { step: 'models', status: 'run' })
  await new Promise((resolve, reject) => {
    const child = spawn(p.acePython, ['-u', p.aceSetupModels, path.join(p.aceSrc, 'checkpoints')], {
      cwd: p.aceSrc,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1' },
      windowsHide: true
    })
    let total = 0
    let err = ''
    child.stdout.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((line) => {
      try {
        const event = JSON.parse(line)
        if (event.type === 'total') total = event.bytes
        else if (event.type === 'progress') send('setup:progress', { step: 'models', got: event.bytes, total })
        else if (event.type === 'error') err += event.message
        else if (event.type === 'log') setupLog(event.message)
      } catch { setupLog(line) }
    }))
    child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(err.slice(-2000) || `모델 다운로드 실패 (${code})`)))
  })
  send('setup:step', { step: 'models', status: 'done' })

  send('setup:step', { step: 'verify', status: 'run' })
  try {
    const report = await run(p.acePython, ['-c',
      'import torch, acestep; print("gpu", torch.cuda.is_available() or torch.backends.mps.is_available())'], { cwd: p.aceSrc })
    log('ace engine check', report)
    if (!/gpu True/.test(report)) {
      throw new Error(MAC ? '맥의 GPU(Metal)를 인식하지 못했습니다. macOS를 최신으로 올린 뒤 다시 시도해 주세요.'
        : '그래픽카드를 인식하지 못했습니다. NVIDIA 드라이버를 최신으로 올린 뒤 다시 시도해 주세요.')
    }
  } catch (error) {
    throw new Error(`ACE-Step 엔진 점검에 실패했습니다.\n\n${explainCrash(String(error.message).split('\n'))}`)
  }
  send('setup:step', { step: 'verify', status: 'done' })
  await writeSettings({ aceInstalled: true, aceCommit: ACE_COMMIT, aceInstalledAt: new Date().toISOString() })
  log('ace installed', p.aceRoot)
  return { ok: true, gpu: check.gpu }
}

function uvEnv () {
  return { ...process.env, UV_PYTHON_INSTALL_DIR: path.join(paths().runtime, 'python'), UV_NO_PROGRESS: '1' }
}

// ── worker process ───────────────────────────────────────────────────────────
let stderrTail = []
// The engine being retried in safe mode after a native crash (see the worker's close).
let retrySafe = null

// The worker dies before it can report anything of its own, so read its last words
// and turn the known ones into something the user can act on.
const CRASH_HINTS = [
  [/WinError 126|fbgemm|shm\.dll|libomp|DLL load failed/i,
    'AI 엔진에 필요한 Microsoft Visual C++ 재배포 패키지가 없습니다.\n' +
    'microsoft.com 에서 "Visual C++ 재배포 가능 패키지 x64"를 설치한 뒤 다시 시도해 주세요.'],
  [/No such file|not found in the local cache|local_files_only|snapshot/i,
    '음악 모델 파일을 찾지 못했습니다. 저장 위치가 바뀌었거나 파일이 지워졌을 수 있습니다.\n' +
    '위쪽 "설정 · 도구 → AI 엔진"에서 이 엔진의 "다시 받기"(또는 "다시 설치")를 누르면 빠진 파일만 받습니다.'],
  [/out of memory|OutOfMemoryError/i,
    '그래픽카드 메모리가 모자랍니다.\n' +
    '게임·영상편집·다른 AI 프로그램을 닫고 다시 시도해 주세요. ' +
    '브라우저 탭이 많아도 그래픽카드 메모리를 씁니다.'],
  [/CUDA (error|driver)|nvidia-smi|no kernel image/i,
    '그래픽카드 드라이버 문제로 보입니다. NVIDIA 드라이버를 최신으로 올린 뒤 다시 시도해 주세요.\n' +
    '다른 프로그램(게임·영상편집·다른 AI 도구)이 그래픽카드 메모리를 쓰고 있다면 먼저 종료해 주세요.'],
  [/MemoryError|paging file|cannot allocate|std::bad_alloc/i,
    '메모리(RAM)가 부족합니다. 이 프로그램은 16GB 이상을 권장합니다.\n' +
    '다른 프로그램을 닫거나 윈도우 가상 메모리를 늘린 뒤 다시 시도해 주세요.'],
  [/ModuleNotFoundError|ImportError/i,
    'AI 엔진 설치가 온전하지 않습니다. 프로그램을 지웠다가 다시 설치해 주세요.\n' +
    '(제거할 때 "AI 실행환경도 삭제"를 선택하면 깨끗하게 다시 받습니다.)']
]

// Windows' own crash codes: the engine died inside the graphics driver or a native
// library (CUDA, PyTorch) and could not say anything. 0xC0000005 is an access
// violation, 0xC0000409 a stack overrun, 0xC000001D an illegal instruction.
const NATIVE_CRASH = new Set([0xC0000005, 0xC0000409, 0xC000001D, 0xC0000374])
const isNativeCrash = (code) => NATIVE_CRASH.has(Number(code) >>> 0)
const SEND_LOG = '그래도 같으면 위쪽 [프로그램 정보] → 피드백 보내기에서 "최근 실행 기록 함께 보내기"를 체크해 보내 주세요.'

function explainCrash (lines, code = null) {
  const text = lines.join('\n')
  for (const [pattern, hint] of CRASH_HINTS) if (pattern.test(text)) return hint
  if (isNativeCrash(code)) {
    return '그래픽카드 드라이버나 AI 실행 환경 안에서 오류가 나 엔진이 멈췄습니다.\n' +
      '① NVIDIA 드라이버를 최신으로 올리고 PC를 다시 시작해 주세요.\n' +
      '② 그래픽카드 오버레이·튜닝 프로그램(MSI Afterburner, RivaTuner, 게임 녹화 등)을 끄고 해 보세요.\n' +
      '③ 계속되면 "설정 · 도구 → AI 엔진"에서 이 엔진을 "다시 설치"해 주세요.\n' + SEND_LOG
  }
  const last = lines.filter((line) => !/warning/i.test(line)).slice(-2).join('\n')
  return last
    ? `엔진이 남긴 메시지:\n${last}`
    : `원인을 알 수 없습니다. ${SEND_LOG}`
}

// One engine on the graphics card at a time: a song for the other engine first sends
// the loaded one away, so two models never share 8GB.
let workerEngine = null

function stopWorker () {
  const old = worker
  worker = null
  workerEngine = null
  if (!old) return
  try { old.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n') } catch {}
  // Give it a moment to let go of the card, then make sure.
  setTimeout(() => { try { old.kill() } catch {} }, 3000)
}

function startWorker (engine = 'yue') {
  if (worker && workerEngine === engine) return worker
  if (worker) {
    log('switching engine', workerEngine, '→', engine)
    stopWorker()
  }
  stderrTail = []
  const p = paths()
  let hfHome = p.hfHome
  if (engine === 'yue') {
    const found = findYueModels()
    if (found && found !== path.resolve(p.hfHome)) {
      log('yue models found elsewhere', p.hfHome, '→', found)
      hfHome = found
      writeSettings({ hfHome: found }).catch(() => {})
    }
  }
  // Safe mode, after the engine has crashed inside native code: YuE2 drops its
  // captured CUDA graph for the plain path, ACE-Step parks its model in RAM between
  // steps. Slower, but it leans less on the driver and the card's memory.
  const safe = Boolean((settingsSync().safeMode || {})[engine]) || retrySafe === engine
  const spec = engine === 'ace'
    ? { python: p.acePython, script: p.aceWorker, cwd: p.aceSrc,
        env: { ROADMUSIC_ACE_SRC: p.aceSrc, HF_HUB_OFFLINE: '1', ...(safe ? { ROADMUSIC_LOW_VRAM: '1' } : {}) } }
    : { python: p.python, script: p.worker, cwd: undefined, env: { HF_HOME: hfHome, ...(safe ? { ROADMUSIC_FAST: '0' } : {}) } }
  log('starting worker', engine, spec.python, spec.script, safe ? '(safe mode)' : '')
  const child = spawn(spec.python, ['-u', spec.script], {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    windowsHide: true
  })
  worker = child
  workerEngine = engine
  // Events from a worker that has since been replaced belong to nobody.
  const current = () => worker === child
  let buffer = ''
  child.stdout.on('data', (chunk) => {
    if (!current()) return
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      let event
      try { event = JSON.parse(line) } catch { send('worker:log', line); continue }
      handleWorkerEvent(event).catch(error => {
        log('worker event failed', error.message)
        if (currentJob) handleWorkerEvent({ type: 'error', jobId: currentJob.jobId, message: `생성 결과를 저장하지 못했습니다: ${error.message}` }).catch(failure => log('worker error reporting failed', failure.message))
      })
    }
  })
  child.stderr.on('data', (d) => {
    if (!current()) return
    const text = String(d).trim()
    // ACE-Step narrates every step on stderr; the log keeps only what matters.
    if (engine !== 'ace' || /error|warn|traceback|exception|failed/i.test(text)) log('worker stderr', text.slice(0, 2000))
    send('worker:log', text)
    // Keep the tail so a crash can say what actually went wrong instead of "code 1".
    stderrTail.push(...text.split(/\r?\n/).filter(Boolean))
    stderrTail = stderrTail.slice(-12)
  })
  child.on('error', async (error) => {
    log('worker spawn error', engine, error.message)
    if (!current()) return
    worker = null
    workerEngine = null
    if (currentJob) await handleWorkerEvent({ type: 'error', jobId: currentJob.jobId, message: `생성 엔진을 시작하지 못했습니다: ${error.message}` })
  })
  child.on('close', async (code) => {
    log('worker closed', engine, code, current() ? stderrTail.join(' | ') : '(replaced)')
    if (!current()) return
    workerEngine = null
    // A native crash (driver, CUDA) on the first try: run the same song once more in
    // safe mode. Finished stages are on disk, so it carries on from where it died.
    if (currentJob && isNativeCrash(code) && !currentJob.safeRetry && !(settingsSync().safeMode || {})[engine]) {
      const again = { ...currentJob, safeRetry: true }
      log('worker crashed natively, retrying in safe mode', engine, code)
      send('job:event', { type: 'notice', jobId: again.jobId,
        message: '생성 엔진이 비정상 종료되어 안전 모드로 한 번 더 시도합니다. 조금 느릴 수 있습니다.' })
      currentJob = null
      worker = null
      retrySafe = engine
      queue.unshift(again)
      sendQueue()
      pump()
      return
    }
    const failure = currentJob ? {
        jobId: currentJob.jobId,
        message: `생성 엔진이 종료되었습니다 (code ${code}).\n\n${explainCrash(stderrTail, code)}`,
        detail: stderrTail.join('\n')
      } : null
    retrySafe = null
    worker = null
    if (failure) { await handleWorkerEvent({ type: 'error', ...failure }); return }
    sendQueue()
    pump() // a crash should not strand the songs waiting behind it
  })
  return child
}

let lastProgressLog = 0

// A cancelled or failed job leaves a folder behind. Only empty shells are thrown
// away: a folder that already holds a plan or song tokens represents real minutes of
// GPU time and can be finished later, so the library offers to resume it instead.
// Which stages this folder already holds. Generation is long, so a song that died
// half way resumes from the last finished stage instead of starting over.
async function stagesDone (dir) {
  const done = []
  if (await exists(path.join(dir, 'plan', 'plan_manifest.json'))) done.push('plan')
  if (await exists(path.join(dir, 'semantic.npy'))) done.push('semantic')
  if (await exists(path.join(dir, 'latent.npy'))) done.push('synth')
  if (await hasAudio(dir)) done.push('decode')
  return done
}

async function resumable (dir) {
  const done = await stagesDone(dir)
  return done.includes('plan') || done.includes('semantic')
}

async function discardPartial (dir) {
  if (!dir || !dir.startsWith(await ensureSongsDir())) return
  if (await hasAudio(dir) || await resumable(dir)) return
  try {
    await fsp.rm(dir, { recursive: true, force: true })
    log('removed partial song', dir)
  } catch (error) {
    log('could not remove partial song', dir, error.message)
  }
}

// A waiting song's folder holds nothing but the meta.json placeholder carrying the
// title the user typed, so it looks exactly like an abandoned one. Sweeping it away
// lost that title — every song after the second came out named "song".
function reservedDirs () {
  const dirs = new Set()
  if (currentJob) dirs.add(currentJob.outDir)
  for (const item of queue) dirs.add(item.outDir)
  for (const item of failed) dirs.add(item.outDir)
  return dirs
}

async function sweepPartials () {
  try {
    const reserved = reservedDirs()
    for (const project of await listProjects()) {
      const dir = await projectDir(project.name)
      for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const full = path.join(dir, entry.name)
        if (reserved.has(full)) continue
        await discardPartial(full)
      }
    }
  } catch (error) {
    log('sweep skipped', error.message)
  }
}

async function handleWorkerEvent (event) {
  if (event.type === 'progress' && Date.now() - lastProgressLog > 30000) {
    lastProgressLog = Date.now()
    log('progress', event)
  } else if (event.type === 'stage' || event.type === 'notice') {
    log(event.type, event.stage || '', event.status || event.message || '')
  }
  if (event.type === 'done') {
    // The song went through in safe mode after a native crash: stay in safe mode on
    // this PC from now on.
    if (currentJob && currentJob.safeRetry) {
      const engine = currentJob.job.engine === 'ace' ? 'ace' : 'yue'
      const safeMode = { ...((await readSettings()).safeMode || {}), [engine]: true }
      await writeSettings({ safeMode })
      log('safe mode kept', engine)
    }
    retrySafe = null
    const song = await saveSong(event)
    currentJob = null
    send('job:done', song)
    sendQueue()
    pump()
  } else if (event.type === 'error') {
    const crashed = currentJob
    currentJob = null
    retrySafe = null
    if (crashed) {
      await discardPartial(crashed.outDir)
      // A cancelled song was the user's own decision; a failed one stays for a retry.
      if (!event.cancelled) {
        failed.unshift({ ...crashed, message: String(event.message || '').split('\n')[0] })
        failed.splice(8)
      }
    }
    send('job:error', event)
    sendQueue()
    pump()
  } else {
    send('job:event', event)
  }
}

// ── library ──────────────────────────────────────────────────────────────────
// '#' and '%' are legal in file names but break the file:// URL the player loads,
// so they never make it into a folder name.
const slug = (text, max = 60) => (text || '').replace(/[\\/:*?"<>|#%\r\n]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max).trim() || '무제'

// Windows paths stop at 260 characters (unless long paths are switched on), and the
// engine and ffmpeg fail past that — a long title made up from a lyric line, in a deep
// songs folder, was enough. So a title names its folder and file only in part: short
// by default, and shorter still when the folder it goes into is already deep.
const PATH_BUDGET = 240
const FOLDER_TITLE = 30 // "20260928…_<title>"
const FILE_TITLE = 40 // "<title>.wav"
const DEEPEST_FILE = Math.max('plan/plan_manifest.json'.length, FILE_TITLE + 4) // inside a song folder

// Cut to at most `room` characters, never below a readable few, and never ending in
// the dot or space Windows would silently drop.
function fitName (name, room, min = 6) {
  const cut = name.slice(0, Math.max(min, room)).replace(/[. ]+$/, '')
  return cut || name.slice(0, min)
}

// ── audio files ──────────────────────────────────────────────────────────────
// A finished song's audio is named after its title ("비 오는 밤.wav"). Songs from
// before 0.12 still hold audio.wav / song.mp3 (song2.mp3… from an early build), so
// nothing may assume a fixed name: the folder is searched instead.
const LEGACY_AUDIO = /^(audio|song\d*)$/i
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

function audioName (title, room = FILE_TITLE) {
  // Windows drops trailing dots and spaces from file names, and refuses device names.
  const name = fitName(slug(title, FILE_TITLE), room) || '무제'
  return WINDOWS_RESERVED.test(name) ? `${name}_` : name
}

async function audioFiles (dir) {
  const found = { wav: null, mp3: null }
  let entries = []
  try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return found }
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).slice(1).toLowerCase()
    if ((ext === 'wav' || ext === 'mp3') && !found[ext]) found[ext] = path.join(dir, entry.name)
  }
  return found
}

async function hasAudio (dir) {
  const { wav, mp3 } = await audioFiles(dir)
  return Boolean(wav || mp3)
}

// Give the song's audio its title as file name. Windows will not rename a file the
// player still holds open; that leaves the old name in place and says so.
async function nameAudio (dir, title) {
  // What is left of the path budget once the folder is counted, less ".wav".
  const base = audioName(title, PATH_BUDGET - dir.length - 1 - 4)
  const files = await audioFiles(dir)
  const named = { wav: files.wav, mp3: files.mp3, failed: false }
  for (const ext of ['wav', 'mp3']) {
    const from = files[ext]
    if (!from) continue
    const to = path.join(dir, `${base}.${ext}`)
    if (from === to) continue
    // Never overwrite a different file that already has the name (case-only changes
    // are the same file on Windows and are fine).
    if (from.toLowerCase() !== to.toLowerCase() && await exists(to)) continue
    try {
      await fsp.rename(from, to)
      named[ext] = to
    } catch (error) {
      named.failed = true
      log('could not rename audio', from, error.message)
    }
  }
  return named
}

// meta.json is hidden once a song is finished, and Windows refuses to overwrite a
// hidden file (EPERM) — which silently broke renaming and rating finished songs.
// Rewriting it in place keeps the attribute and works either way.
// Returns true when the file had to be created.
async function writeJsonInPlace (file, data) {
  const text = JSON.stringify(data, null, 1)
  let handle
  try {
    handle = await fsp.open(file, 'r+')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await fsp.writeFile(file, text, 'utf8')
    return true
  }
  try {
    await handle.truncate(0)
    await handle.write(text, 0, 'utf8')
  } finally {
    await handle.close()
  }
  return false
}

const writeMeta = (dir, meta) => writeJsonInPlace(path.join(dir, 'meta.json'), meta)

// ── song order ──
// The order songs are dragged into is kept per project, in a hidden file inside the
// project folder, so it travels with the library when it is moved or copied.
// The same file lists the songs taken out of the list ("hidden"): their folders and
// files stay exactly where they are, they are just not shown.
const ORDER_FILE = '.roadmusic-order.json'

async function readOrderFile (dir) {
  const names = (list) => Array.isArray(list) ? list.filter((item) => typeof item === 'string') : []
  try {
    const data = JSON.parse(await fsp.readFile(path.join(dir, ORDER_FILE), 'utf8'))
    return { folders: names(data.folders), hidden: names(data.hidden) }
  } catch {
    return { folders: [], hidden: [] }
  }
}

const readOrder = async (dir) => (await readOrderFile(dir)).folders

async function writeOrderFile (dir, patch) {
  const file = path.join(dir, ORDER_FILE)
  const next = { ...await readOrderFile(dir), ...patch }
  if (await writeJsonInPlace(file, next)) {
    await new Promise((resolve) => execFile('attrib', ['+h', file], () => resolve()))
  }
}

const writeOrder = (dir, folders) => writeOrderFile(dir, { folders })
// What startGeneration wrote into the folder when the song was queued. Read back from
// the job itself so a lost or unreadable meta.json cannot cost the song its title.
function jobPlaceholder (dir) {
  const item = currentJob && currentJob.outDir === dir
    ? currentJob
    : queue.find((entry) => entry.outDir === dir)
  if (!item) return {}
  return { title: item.title, instrumental: Boolean(item.job && item.job.instrumental),
    targetSeconds: (item.job && item.job.targetSeconds) || null,
    parts: (item.job && item.job.parts) || null }
}

async function saveSong (event) {
  // A score-only draft has no audio yet: keep its stage files so rendering it later
  // skips the planning it already did.
  if (event.scoreOnly) {
    const dir = currentJob ? currentJob.outDir : null
    if (!dir) return { ...event.meta, scoreOnly: true }
    let placeholder = jobPlaceholder(dir)
    try {
      placeholder = { ...placeholder,
        ...JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8')) }
    } catch {}
    const meta = { ...event.meta, jobId: event.jobId || placeholder.jobId, dir, scoreOnly: true, status: 'score',
      // The worker does not echo these back, but reuse and re-render need them.
      instrumental: Boolean(placeholder.instrumental),
      parts: placeholder.parts || null,
      title: placeholder.title || event.meta.id }
    await writeMeta(dir, meta)
    return meta
  }
  const dir = path.dirname(event.audio)
  // The worker rewrites meta.json without the title the user typed, so merge the
  // placeholder this process wrote when the job started back on top of it. Should the
  // file be missing, the running job still holds everything the placeholder carried.
  let placeholder = jobPlaceholder(dir)
  try {
    placeholder = { ...placeholder,
      ...JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8')) }
  } catch {}
  const title = placeholder.title || event.meta.title || event.meta.id
  await autoConvert(dir)
  // The worker always writes audio.wav; the file takes the song's title from here on.
  const named = await nameAudio(dir, title)
  const audio = named.wav || named.mp3 || event.audio
  const meta = { ...event.meta, jobId: event.jobId || placeholder.jobId, dir, audio, mp3: named.mp3 || null, status: 'done',
    audioUrl: pathToFileURL(audio).href,
    // Carried from the request: the worker's result does not repeat them.
    instrumental: Boolean(placeholder.instrumental),
    soundEffect: Boolean(placeholder.soundEffect),
    targetSeconds: placeholder.targetSeconds || null,
    parts: placeholder.parts || null,
    // A cover from another song's sound: which one, and how closely it followed.
    cover: placeholder.cover ? { from: placeholder.cover.from, strength: placeholder.cover.strength } : null,
    appVersion: app.getVersion(),
    title }
  await writeMeta(dir, meta)
  await tidySong(dir)
  return meta
}

// ── ffmpeg ──
// Converting, tagging, importing and the video studio all need ffmpeg. The installer
// carries its own copy (resources/ffmpeg, GPL — its LICENSE.txt sits beside it), so
// they work even when the path remembered at setup is missing or stale. Then the
// remembered path, the copy inside the AI runtime, and last one installed on the PC.
let ffmpegFound = null

async function findFfmpeg () {
  if (ffmpegFound && await exists(ffmpegFound)) return ffmpegFound
  const settings = await readSettings()
  const exe = WIN ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = [
    app.isPackaged
      ? path.join(process.resourcesPath, 'ffmpeg', exe)
      : path.join(__dirname, '..', 'vendor', 'ffmpeg', exe),
    settings.ffmpeg,
    // An app opened from the Finder gets a bare PATH without Homebrew on it.
    ...(MAC ? ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'] : [])
  ]
  try {
    const venv = path.dirname(path.dirname(paths().python))
    const binaries = path.join(venv, 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries')
    for (const name of await fsp.readdir(binaries)) {
      if (/^ffmpeg.*\.exe$/i.test(name)) candidates.push(path.join(binaries, name))
    }
  } catch { /* no runtime yet */ }
  for (const file of candidates) {
    if (file && await exists(file)) {
      ffmpegFound = file
      log('ffmpeg', file)
      return file
    }
  }
  const onPath = await new Promise((resolve) => execFile(WIN ? 'where' : 'which', ['ffmpeg'], { windowsHide: true },
    (error, stdout) => resolve(error ? null : String(stdout).split(/\r?\n/)[0].trim() || null)))
  if (onPath) {
    ffmpegFound = onPath
    log('ffmpeg from PATH', onPath)
  } else {
    log('ffmpeg not found', candidates.filter(Boolean))
  }
  return ffmpegFound
}

// 48kHz 24-bit WAV runs ~17MB per minute, so a library fills a disk quickly. Encoding
// to 320kbps MP3 keeps roughly a tenth of that and still sounds transparent.
async function encodeMp3 (dir) {
  const ffmpeg = await findFfmpeg()
  const { wav } = await audioFiles(dir)
  if (!ffmpeg || !wav) return null
  const mp3 = wav.replace(/\.wav$/i, '.mp3')
  await new Promise((resolve, reject) => execFile(ffmpeg,
    ['-y', '-i', wav, '-b:a', '320k', mp3],
    (error) => error ? reject(error) : resolve()))
  return mp3
}

// Once a song is finished, only the audio and meta.json matter. The stage files exist
// so an interrupted song can be resumed; keeping them afterwards just clutters the
// folder (latent.npy alone is ~2MB). meta.json is hidden so the folder shows music only.
const LEFTOVERS = ['semantic.npy', 'latent.npy', 'result.json']

async function folderSize (dir) {
  let total = 0
  for (const entry of await fsp.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    try { total += (await fsp.stat(path.join(entry.parentPath || entry.path, entry.name))).size } catch {}
  }
  return total
}

async function tidySong (dir) {
  try {
    // The score is the one stage file worth keeping: it is tiny, and it is what the
    // score editor reads and re-renders from.
    const score = path.join(dir, 'plan', 'score.abc')
    if (await exists(score) && !await exists(path.join(dir, 'score.abc'))) {
      await fsp.copyFile(score, path.join(dir, 'score.abc'))
    }
    for (const name of LEFTOVERS) await fsp.rm(path.join(dir, name), { force: true })
    await fsp.rm(path.join(dir, 'plan'), { recursive: true, force: true })
    const meta = path.join(dir, 'meta.json')
    if (await exists(meta)) {
      await new Promise((resolve) => execFile('attrib', ['+h', meta], () => resolve()))
    }
  } catch (error) {
    log('tidy skipped', dir, error.message)
  }
}

async function autoConvert (dir) {
  const settings = await readSettings()
  if (!settings.autoMp3) return {}
  try {
    const { wav } = await audioFiles(dir)
    const mp3 = await encodeMp3(dir)
    if (!mp3) return {}
    if (settings.dropWav) {
      await fsp.rm(wav, { force: true })
      // The latents are only needed to re-decode the same take; drop them too.
      await fsp.rm(path.join(dir, 'latent.npy'), { force: true })
    }
    log('mp3 saved', mp3, settings.dropWav ? '(wav removed)' : '')
    return { mp3 }
  } catch (error) {
    log('mp3 conversion failed', error.message)
    send('job:event', { type: 'notice', message: `MP3 변환에 실패했습니다: ${error.message}` })
    return {}
  }
}

// ── a song's own video background ──
// A picture or clip attached to one song, shown behind that song in the playlist
// video. It is copied into the song folder as background.<ext>, so it moves, hides and
// goes to the trash with the song, and the original can be moved or deleted.
const BG_IMAGE = ['jpg', 'jpeg', 'png', 'webp', 'bmp']
const BG_VIDEO = ['mp4', 'mov', 'webm', 'mkv', 'm4v']
const BG_FILE = new RegExp(`^background[.](${[...BG_IMAGE, ...BG_VIDEO].join('|')})$`, 'i')

async function songBackground (dir, meta = {}) {
  let names = []
  try { names = await fsp.readdir(dir) } catch { return null }
  const name = names.find((n) => BG_FILE.test(n))
  if (!name) return null
  const file = path.join(dir, name)
  const ext = path.extname(name).slice(1).toLowerCase()
  const stat = await fsp.stat(file).catch(() => null)
  if (!stat) return null
  // The mtime in the URL makes the list show a replaced picture, not the cached one.
  return { kind: BG_VIDEO.includes(ext) ? 'video' : 'image', path: file,
    url: `${pathToFileURL(file).href}?v=${Math.round(stat.mtimeMs)}`,
    name: meta.backgroundName || name }
}

async function clearSongBackground (dir) {
  let names = []
  try { names = await fsp.readdir(dir) } catch { return }
  for (const name of names.filter((n) => BG_FILE.test(n))) await fsp.rm(path.join(dir, name), { force: true })
}

// Folder names are "<stamp>_<title>"; the stamp is 14 digits.
const titleFromFolder = (name) => name.replace(/^\d{14}_/, '').trim() || '무제'

// Songs taken out of the list are left out unless asked for (housekeeping and the
// "목록에서 뺀 곡" panel want them).
async function listSongs ({ includeHidden = false } = {}) {
  await migrateLooseSongs()
  const dir = await projectDir()
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  const reserved = reservedDirs()
  const songs = []
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const songDir = path.join(dir, entry.name)
    const metaFile = path.join(songDir, 'meta.json')
    if (!await exists(metaFile)) continue
    let files = await audioFiles(songDir)
    if (!files.wav && !files.mp3 && !await resumable(songDir)) continue
    try {
      const meta = JSON.parse(await fsp.readFile(metaFile, 'utf8'))
      // Songs made before 0.11 could lose their title to the partial-folder sweep and
      // fall back to the worker's internal id. The folder name still has it.
      const title = meta.title && meta.title !== 'song' ? meta.title : titleFromFolder(entry.name)
      // Songs from before 0.12 still carry audio.wav / song.mp3; they take their title
      // the first time they are listed. A song being made is left alone.
      const current = files.wav || files.mp3
      if (current && !reserved.has(songDir) &&
          LEGACY_AUDIO.test(path.basename(current, path.extname(current)))) {
        await nameAudio(songDir, title)
        files = await audioFiles(songDir)
      }
      const audio = files.wav || files.mp3
      // Build the URL here: a path with '#', spaces or Korean text is not a valid
      // file:// URL until it is encoded, and the <audio> tag needs a URL.
      const score = await exists(path.join(songDir, 'score.abc')) ||
        await exists(path.join(songDir, 'plan', 'score.abc'))
      songs.push({ ...meta, dir: songDir, audio, folder: entry.name, unfinished: !audio, score,
        title, background: audio ? await songBackground(songDir, meta) : null,
        stages: audio ? null : await stagesDone(songDir),
        format: audio && audio === files.mp3 ? 'mp3' : 'wav',
        audioUrl: audio ? pathToFileURL(audio).href : null })
    } catch { /* skip unreadable entry */ }
  }
  // Songs the user has arranged keep their place; any made since then go on top,
  // newest first, the way the list has always shown new songs.
  const { folders: order, hidden } = await readOrderFile(dir)
  const rank = new Map(order.map((folder, index) => [folder, index]))
  const hiddenSet = new Set(hidden)
  for (const song of songs) {
    song.position = rank.has(song.folder) ? rank.get(song.folder) : null
    // Only a finished song can be taken out; one being made or unfinished stays in view.
    song.hidden = hiddenSet.has(song.folder) && !song.unfinished && !reserved.has(song.dir)
  }
  return songs.filter((song) => includeHidden || !song.hidden).sort((a, b) => {
    if (a.position === null && b.position === null) return String(b.createdAt).localeCompare(String(a.createdAt))
    if (a.position === null) return -1
    if (b.position === null) return 1
    return a.position - b.position
  })
}

// ── ipc ──────────────────────────────────────────────────────────────────────
ipcMain.handle('app:state', async () => {
  const settings = await readSettings()
  const engines = { yue: await engineInstalled('yue'), ace: await engineInstalled('ace') }
  // The YuE2 install is there but its model files are not: the engine screen offers "다시 받기".
  const repair = { yue: Boolean(settings.setupDone) && !engines.yue && fs.existsSync(paths().python) && !findYueModels() }
  // The app opens once an engine is in — or once the person chose to go without one
  // (video studio, imports and playback need no engine).
  const ready = engines.yue || engines.ace || Boolean(settings.engineSetupSkipped)
  // The folder button opens the project being worked on, not the library root.
  const dir = ready ? await projectDir().catch(() => null) : null
  return { ready, engines, gpu: settings.gpu || await detectGpu(), songsDir: dir, version: app.getVersion(),
    store: Boolean(process.windowsStore), repair }
})

ipcMain.handle('setup:check', () => setupCheck())

// The engine screen: what each engine needs, whether this PC has it, and installing.
ipcMain.handle('engines:list', async () => Promise.all(Object.values(ENGINES).map(async (engine) => ({
  id: engine.id,
  name: engine.name,
  tagline: engine.tagline,
  downloadGb: engine.downloadGb,
  needGb: engine.needGb,
  minVramGb: engine.minVramGb,
  supported: engine.supported,
  unsupported: engine.unsupported,
  steps: engine.steps,
  installed: await engineInstalled(engine.id),
  // Installed once, but the model files are gone: offer to fetch them again.
  repair: engine.id === 'yue' && Boolean(settingsSync().setupDone) && fs.existsSync(paths().python) && !findYueModels(),
  check: await engineCheck(engine.id)
}))))

let installing = null
ipcMain.handle('engines:install', async (_e, id) => {
  if (typeof updateBlocksWork === 'function' && updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 AI 엔진을 설치할 수 없습니다.' }
  activeWork += 1
  try {
  if (!ENGINES[id]) return { ok: false, message: '알 수 없는 엔진입니다.' }
  if (installing) return { ok: false, message: '다른 엔진을 설치하는 중입니다.' }
  const check = await engineCheck(id)
  if (!check.ok) return { ok: false, blocked: true, problems: check.problems }
  // The engine being replaced must let go of its files first.
  if (workerEngine === id && !currentJob) stopWorker()
  if (currentJob && currentJob.job.engine === id) {
    return { ok: false, message: '이 엔진으로 곡을 만드는 중입니다. 끝난 뒤에 다시 설치해 주세요.' }
  }
  installing = id
  try {
    const result = id === 'ace' ? await runAceSetup() : await runSetup()
    log('engine installed', id)
    return result
  } catch (error) {
    log('engine install failed', id, error.message)
    return { ok: false, message: error.message }
  } finally {
    installing = null
  }
  } finally {
    activeWork -= 1
  }
})

ipcMain.handle('engines:skip', async () => {
  await writeSettings({ engineSetupSkipped: true })
  return { ok: true }
})

ipcMain.handle('setup:location', async () => {
  const p = paths()
  return { dataDir: p.dataDir, models: p.hfHome, freeGb: await freeSpaceGb(p.dataDir), chosen: Boolean(settingsSync().dataDir) }
})

// Before anything is downloaded the whole 11GB can be pointed at another drive.
ipcMain.handle('setup:pick-location', async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: 'AI 실행환경과 모델을 저장할 폴더',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '이 폴더 사용'
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  const chosen = path.join(picked.filePaths[0], 'Road Music')
  const freeGb = await freeSpaceGb(chosen)
  if (freeGb !== null && freeGb < NEEDED_GB) {
    return { ok: false, message: `${path.parse(chosen).root} 여유 공간이 ${freeGb}GB입니다. ${NEEDED_GB}GB가 필요합니다.` }
  }
  try {
    await fsp.mkdir(chosen, { recursive: true })
  } catch (error) {
    return { ok: false, message: `그 폴더를 쓸 수 없습니다: ${error.message}` }
  }
  // hfHome follows dataDir unless it was pinned by hand.
  await writeSettings({ dataDir: chosen, hfHome: path.join(chosen, 'models') })
  log('data folder', chosen, `${freeGb}GB free`)
  return { ok: true, dataDir: chosen, freeGb }
})

ipcMain.handle('setup:run', async () => {
  if (typeof updateBlocksWork === 'function' && updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 설치할 수 없습니다.' }
  setupRunning += 1
  try { return await runSetup() } catch (error) { return { ok: false, message: error.message } } finally { setupRunning -= 1 }
})

ipcMain.handle('projects:list', async () => ({
  current: projectName(), projects: await listProjects()
}))

ipcMain.handle('projects:select', async (_e, name) => {
  await projectDir(name)
  await writeSettings({ project: name })
  log('project', name)
  return { ok: true, current: name }
})

ipcMain.handle('projects:create', async (_e, name) => {
  const clean = slug(name)
  const existing = await listProjects()
  if (existing.some((p) => p.name === clean)) return { ok: false, message: '같은 이름의 프로젝트가 있습니다.' }
  await projectDir(clean)
  await writeSettings({ project: clean })
  log('project created', clean)
  return { ok: true, current: clean }
})

ipcMain.handle('projects:rename', async (_e, { from, to }) => {
  const clean = slug(to)
  const root = await ensureSongsDir()
  if (clean === from) return { ok: true, current: clean }
  if (await exists(path.join(root, clean))) return { ok: false, message: '같은 이름의 프로젝트가 있습니다.' }
  try {
    await fsp.rename(path.join(root, from), path.join(root, clean))
  } catch (error) {
    return { ok: false, message: `이름을 바꾸지 못했습니다: ${error.message}` }
  }
  if (projectName() === from) await writeSettings({ project: clean })
  return { ok: true, current: projectName() }
})

ipcMain.handle('songs:list', async () => {
  await sweepPartials()
  return listSongs()
})

ipcMain.handle('song:generate', async (_e, payload) => {
  try {
    return await startGeneration(payload)
  } catch (error) {
    log('generate failed', error.stack || error.message)
    return { ok: false, message: `생성을 시작하지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('ui:log', (_e, text) => { log('renderer', text); return { ok: true } })

function queueState () {
  return {
    current: currentJob ? { jobId: currentJob.jobId, title: currentJob.title } : null,
    waiting: queue.map(({ jobId, title }) => ({ jobId, title })),
    failed: failed.map(({ jobId, title, message }) => ({ jobId, title, message })),
    paused
  }
}

const sendQueue = () => { saveQueue(); send('queue:update', queueState()) }

// The queue survives a restart: a batch left running overnight picks up where it
// stopped instead of vanishing with the window.
const queueFile = () => path.join(userData(), 'queue.json')

function saveQueue () {
  if (!queueRestored) return
  const items = queue.map(({ jobId, outDir, title, job }) => ({ jobId, outDir, title, job }))
  // The song being made goes back at the head, keeping its folder so its finished
  // stages are reused rather than regenerated.
  if (currentJob) {
    items.unshift({ ...currentJob, job: { ...currentJob.job, outDir: currentJob.outDir } })
  }
  const target = queueFile()
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  try {
    fs.mkdirSync(userData(), { recursive: true })
    fs.writeFileSync(temporary, JSON.stringify({ paused, items: items.filter(item => !jobResults.has(item.jobId)), failed, results: [...jobResults] }, null, 1), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, target)
  } catch (error) {
    try { fs.unlinkSync(temporary) } catch { /* only this attempt's temporary file */ }
    log('queue not saved', error.message)
  }
}

async function restoreQueue () {
  let saved = { items: [] }
  try {
    const text = await fsp.readFile(queueFile(), 'utf8')
    saved = JSON.parse(text.replace(/^﻿/, '')) // a hand-edited file may carry a BOM
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('saved queue unreadable', error.message)
      await fsp.rename(queueFile(), `${queueFile()}.corrupt-${Date.now()}`).catch(() => {})
    }
    queueRestored = true
    return
  }
  for (const pair of Array.isArray(saved.results) ? saved.results.slice(-64) : []) {
    if (Array.isArray(pair) && typeof pair[0] === 'string' && pair[1] && typeof pair[1].ok === 'boolean') jobResults.set(pair[0], pair[1])
  }
  for (const item of Array.isArray(saved.failed) ? saved.failed.slice(0, 8) : []) {
    if (item && typeof item.jobId === 'string' && item.job) failed.push(item)
  }
  const root = path.resolve(await ensureSongsDir())
  for (const item of Array.isArray(saved.items) ? saved.items : []) {
    // Skip anything already finished or whose folder is gone.
    if (!item || typeof item.jobId !== 'string' || typeof item.outDir !== 'string' || !item.job ||
        !path.isAbsolute(item.outDir) || !within(path.resolve(item.outDir), root) || item.outDir === root ||
        !await exists(item.outDir) || await hasAudio(item.outDir)) continue
    queue.push({ ...item, job: { ...item.job, outDir: item.outDir } })
  }
  paused = Boolean(saved.paused)
  queueRestored = true
  if (queue.length) log('queue restored', queue.length, paused ? '(일시정지 상태)' : '')
  sendQueue()
}

// Hand the next waiting song to the worker. Called whenever the queue changes or a
// song finishes, so a full queue drains without the user watching.
function pump () {
  if (currentJob || !queue.length || paused) return
  currentJob = queue.shift()
  // Without its model files YuE2 can only fail after a minute of loading; say why now,
  // and hold the rest of the queue until the models are back.
  if (currentJob.job.engine !== 'ace' && !findYueModels()) {
    log('yue models missing', paths().hfHome)
    paused = true
    handleWorkerEvent({ type: 'error', jobId: currentJob.jobId, message: YUE_MODELS_MISSING })
    return
  }
  startWorker(currentJob.job.engine === 'ace' ? 'ace' : 'yue')
  worker.stdin.write(JSON.stringify(currentJob.job) + '\n')
  log('job started', { jobId: currentJob.jobId, title: currentJob.title })
  send('job:started', { jobId: currentJob.jobId, title: currentJob.title })
  sendQueue()
}

// The prompt builder's fields, kept with the song so a reuse or cover restores them.
// Only known keys with plain values are stored.
function cleanParts (parts) {
  if (!parts || typeof parts !== 'object') return null
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : ''
  return {
    genre: text(parts.genre, 2000),
    instruments: Array.isArray(parts.instruments)
      ? parts.instruments.filter((item) => typeof item === 'string').slice(0, 3).map((item) => item.slice(0, 60))
      : [],
    bpm: Number(parts.bpm) > 0 ? Math.round(Number(parts.bpm)) : null,
    strict: Boolean(parts.strict),
    strong: Boolean(parts.strong),
    structure: text(parts.structure, 20),
    instrumental: Boolean(parts.instrumental)
  }
}

// A new song's folder: "<stamp>_<title>", the title cut so that the deepest file the
// folder will ever hold — the engine's plan manifest, or the song's audio — still fits.
async function songFolder (stamp, title) {
  const parent = await projectDir()
  const room = PATH_BUDGET - parent.length - 1 - (stamp.length + 1) - 1 - DEEPEST_FILE
  const full = path.join(parent, `${stamp}_${fitName(slug(title, FOLDER_TITLE), room)}`)
  if (full.length + 1 + DEEPEST_FILE > 260) {
    log('song path is long even with a short name', { length: full.length + 1 + DEEPEST_FILE, parent })
  }
  return full
}

async function savedCover (value) {
  const audio = value && typeof value.audio === 'string' ? value.audio : ''
  const strength = Number(value && value.strength)
  if (!path.isAbsolute(audio) || !Number.isFinite(strength) || strength < 0.1 || strength > 1) return null
  let file
  try {
    if (!(await fsp.stat(audio)).isFile()) return null
    file = await fsp.realpath(audio)
  } catch {
    return null
  }
  for (const root of [await ensureSongsDir(), recordingsDir()]) {
    try {
      const relative = path.relative(await fsp.realpath(root), file)
      if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
        return { audio: file, strength, from: typeof value.from === 'string' ? value.from.slice(0, 200) : null }
      }
    } catch {}
  }
  return null
}

async function startGeneration (payload) {
  if (typeof updateBlocksWork === 'function' && updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 새 작업을 시작할 수 없습니다.' }
  activeWork += 1
  try {
  const engine = payload.engine === 'ace' ? 'ace' : 'yue'
  const error = generationError({ ...payload, engine })
  if (error) return { ok: false, message: error }
  log('generate request', { title: payload.title, seed: payload.seed, engine })
  if (!await engineInstalled(engine)) {
    const modelsGone = engine === 'yue' && Boolean(settingsSync().setupDone) && fs.existsSync(paths().python)
    return { ok: false, needsEngine: engine,
      message: modelsGone ? YUE_MODELS_MISSING
        : `${ENGINES[engine].name} 엔진이 설치되어 있지 않습니다. "AI 엔진"에서 설치해 주세요.` }
  }
  // Scores are YuE2's: ACE-Step writes its song in one pass with no score to show,
  // edit or follow.
  if (engine === 'ace' && (payload.mode === 'plan' || payload.abc)) {
    return { ok: false, message: '악보만 만들기와 악보로 만들기(커버·악보 불러오기)는 YuE2 엔진에서만 됩니다.' }
  }
  // A cover from a song's sound is ACE-Step's (python/ace_worker.py, task "cover"): the
  // source is one of the user's own songs, found here by its folder.
  let cover = null
  if (payload.cover) {
    if (engine !== 'ace') return { ok: false, message: '커버는 ACE-Step 1.5 엔진에서만 됩니다.' }
    cover = await savedCover(payload.cover)
    if (!cover) return { ok: false, message: '저장된 커버 음원을 찾지 못했습니다. 다시 선택해 주세요.' }
  }
  if (payload.coverAudio) {
    if (engine !== 'ace') return { ok: false, message: '원곡 소리로 만드는 커버는 ACE-Step 1.5 엔진에서만 됩니다.' }
    const dir = String(payload.coverAudio.dir || '')
    if (!dir || !path.resolve(dir).startsWith(path.resolve(await ensureSongsDir()))) {
      return { ok: false, message: '커버할 원곡을 찾지 못했습니다.' }
    }
    const files = await audioFiles(dir)
    const audio = files.wav || files.mp3
    if (!audio) return { ok: false, message: '커버할 원곡의 음원 파일을 찾지 못했습니다.' }
    const strength = Number(payload.coverAudio.strength)
    cover = { audio, strength: Number.isFinite(strength) ? Math.min(1, Math.max(0.1, strength)) : 0.8,
      from: String(payload.coverAudio.title || '').slice(0, 200) || null }
  }
  // A song from the user's own recording (humming, a guitar take): the same ACE-Step
  // cover, from the recording — stretched first to the length asked for.
  if (payload.recording) {
    if (engine !== 'ace') return { ok: false, message: '녹음으로 만드는 곡은 ACE-Step 1.5 엔진에서만 됩니다.' }
    const file = String(payload.recording.path || '')
    if (!file || !path.resolve(file).startsWith(path.resolve(recordingsDir())) || !await exists(file)) {
      return { ok: false, message: '녹음 파일을 찾지 못했습니다. 다시 녹음하거나 골라 주세요.' }
    }
    let audio
    try {
      audio = await stretchRecording(file, Number(payload.recording.targetSeconds) || 0)
    } catch (error) {
      log('recording stretch failed', error.message)
      return { ok: false, message: `녹음을 곡 길이에 맞추지 못했습니다: ${error.message}` }
    }
    const strength = Number(payload.recording.strength)
    cover = { audio, strength: Number.isFinite(strength) ? Math.min(1, Math.max(0.1, strength)) : 0.8, from: '녹음' }
  }
  // Resuming reuses the existing folder: the worker picks up whatever stage files are
  // already there instead of regenerating them.
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  let outDir = payload.outDir || await songFolder(stamp, payload.title)
  if (!payload.outDir) {
    for (let index = 2; await exists(outDir); index++) outDir = await songFolder(stamp, `${String(payload.title || '무제').slice(0, FOLDER_TITLE - 6)} ${index}`)
  }
  await fsp.mkdir(outDir, { recursive: true })
  const jobId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const parts = cleanParts(payload.parts)
  const job = {
    cmd: 'generate',
    engine,
    jobId,
    outDir,
    id: 'song',
    // ACE-Step takes the tempo as a number of its own; YuE2 reads it from the style.
    bpm: !payload.soundEffect && parts && parts.bpm ? parts.bpm : null,
    style: payload.style,
    lyrics: payload.soundEffect ? '' : payload.lyrics,
    instrumental: Boolean(payload.instrumental || payload.soundEffect),
    soundEffect: Boolean(payload.soundEffect),
    // Expert overrides; the worker clamps them to what YuE2 accepts.
    advanced: payload.advanced && Object.keys(payload.advanced).length ? payload.advanced : null,
    cot: payload.cot || 'full',
    abc: payload.abc || null,
    mode: payload.mode === 'plan' ? 'plan' : 'song',
    targetSeconds: cover ? null : payload.targetSeconds || null,
    cover,
    parts,
    // Fix the seed here rather than in the worker, so meta.json records it and a
    // resumed job keeps the seed its saved stages were generated with.
    seed: payload.seed === '' || payload.seed == null
      ? Math.floor(Math.random() * 2 ** 31)
      : Number(payload.seed)
  }
  const title = payload.title || '무제'
  await writeMeta(outDir, { title, ...job, status: 'queued' })
  queue.push({ jobId, outDir, title, job })
  log('job queued', { jobId, title, waiting: queue.length })
  sendQueue()
  pump()
  return { ok: true, jobId, position: currentJob && currentJob.jobId === jobId ? 0 : queue.length }
  } finally {
    activeWork -= 1
  }
}

// Lyric timing ACE-Step recorded while singing (lyrics.lrc) — the SRT prefers it.
ipcMain.handle('song:lrc', async (_e, dir) => {
  try {
    return { ok: true, lrc: await fsp.readFile(path.join(dir, 'lyrics.lrc'), 'utf8') }
  } catch {
    return { ok: false }
  }
})

// ── score (ABC) ──────────────────────────────────────────────────────────────
ipcMain.handle('song:score', async (_e, dir) => {
  for (const file of [path.join(dir, 'score.abc'), path.join(dir, 'plan', 'score.abc')]) {
    if (await exists(file)) return { ok: true, abc: await fsp.readFile(file, 'utf8') }
  }
  return { ok: false, message: '이 곡에는 악보가 없습니다.' }
})

// A score from outside — typed, pasted, opened from a file or converted from MIDI —
// is checked by YuE2's own validator (python/abc_tools.py) before it is used. It runs
// in a short-lived process of its own, so a busy generation worker never delays it.
ipcMain.handle('score:check', async (_e, text) => {
  const p = paths()
  if (!await exists(p.python)) return { ok: false, error: '실행 환경이 없어 악보를 검사할 수 없습니다.' }
  const script = unpacked(path.join(__dirname, '..', 'python', 'abc_check.py'))
  return new Promise((resolve) => {
    const child = execFile(p.python, [script],
      { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } },
      (error, stdout, stderr) => {
        try {
          resolve(JSON.parse(String(stdout).trim().split('\n').pop()))
        } catch {
          log('score check failed', error ? error.message : '', String(stderr).slice(-400))
          resolve({ ok: false, error: '악보 검사를 실행하지 못했습니다.' })
        }
      })
    child.stdin.end(String(text || ''), 'utf8')
  })
})

// The MIDI last opened, kept so changing the chosen tracks re-converts it without
// asking for the file again.
let openedMidi = null

function convertMidi (choice) {
  const result = midiTools.midiToAbc(openedMidi.midi, choice)
  return { kind: 'midi', name: openedMidi.name, parts: midiTools.describeParts(openedMidi.parts), choice, result }
}

ipcMain.handle('score:open', async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: '악보 불러오기 (ABC 또는 MIDI)',
    properties: ['openFile'],
    filters: [
      { name: '악보·MIDI', extensions: ['abc', 'txt', 'mid', 'midi'] },
      { name: 'ABC 악보', extensions: ['abc', 'txt'] },
      { name: 'MIDI', extensions: ['mid', 'midi'] }
    ]
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  const file = picked.filePaths[0]
  const name = path.basename(file, path.extname(file))
  try {
    if ((await fsp.stat(file)).size > 5 * 1024 * 1024) return { ok: false, message: '5MB가 넘는 파일은 불러올 수 없습니다.' }
    const data = await fsp.readFile(file)
    if (/\.midi?$/i.test(file)) {
      const midi = midiTools.parseMidi(data)
      const parts = midiTools.partsOf(midi)
      if (!parts.some((part) => !part.drums && part.count)) {
        return { ok: false, message: '이 MIDI에는 멜로디로 쓸 음표가 없습니다 (드럼만 있거나 비어 있습니다).' }
      }
      openedMidi = { name, midi, parts }
      log('midi opened', file, { parts: parts.length })
      return { ok: true, ...convertMidi({ ...midiTools.suggestParts(parts), chords: true }) }
    }
    return { ok: true, kind: 'abc', name, text: data.toString('utf8').replace(/^﻿/, '') }
  } catch (error) {
    log('score open failed', file, error.message)
    return { ok: false, message: `불러오지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('score:convert', (_e, choice) => {
  if (!openedMidi) return { ok: false, message: 'MIDI 파일을 다시 열어주세요.' }
  try {
    return { ok: true, ...convertMidi({ vocal: choice.vocal || '', ins: choice.ins || '', chords: Boolean(choice.chords) }) }
  } catch (error) {
    return { ok: false, message: error.message }
  }
})

// Render a song from a score the user edited. It becomes its own song, so the take
// it came from stays untouched.
ipcMain.handle('song:render', async (_e, { dir, abc, title }) => {
  try {
    const meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8'))
    if (!meta.lyrics || !meta.style) return { ok: false, message: '이 곡의 가사·스타일 정보가 없습니다.' }
    return await startGeneration({
      ...meta,
      title: title || `${meta.title || '무제'} (악보 수정)`,
      abc,
      // A supplied score needs full or melody mode, and the instruction has to match
      // it: after "코드 빼기" there are no chords left to announce.
      cot: /"[^"\n]+"/.test(abc.split('\n').filter((line) => !line.startsWith('V:')).join('\n')) ? 'full' : 'melody',
      outDir: null
    })
  } catch (error) {
    log('render from score failed', error.stack || error.message)
    return { ok: false, message: `악보로 만들지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('song:resume', async (_e, dir) => {
  try {
    if (!dir.startsWith(await ensureSongsDir())) return { ok: false, message: '알 수 없는 폴더입니다.' }
    const meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8'))
    if (!meta.lyrics || !meta.style) return { ok: false, message: '이 곡의 정보가 남아 있지 않아 이어서 만들 수 없습니다.' }
    return await startGeneration({ ...meta, outDir: dir })
  } catch (error) {
    log('resume failed', error.stack || error.message)
    return { ok: false, message: `이어서 만들지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('song:cancel', (_event, jobId) => {
  if (jobId && (!currentJob || currentJob.jobId !== jobId)) return { ok: false, message: '지정한 작업은 현재 생성 중인 곡이 아닙니다.' }
  // Named by job, so a cancel sent while the worker is still starting up is kept
  // until that job comes up instead of being lost.
  if (worker && currentJob) {
    worker.stdin.write(JSON.stringify({ cmd: 'cancel', jobId: currentJob.jobId }) + '\n')
    log('cancel requested', currentJob.jobId)
  }
  return { ok: true }
})

ipcMain.handle('queue:list', () => queueState())

ipcMain.handle('queue:remove', async (_e, jobId) => {
  const index = queue.findIndex((item) => item.jobId === jobId)
  if (index < 0) return { ok: false, message: '이미 시작했거나 없는 곡입니다.' }
  const [removed] = queue.splice(index, 1)
  await discardPartial(removed.outDir)
  log('queue removed', removed.title)
  sendQueue()
  return { ok: true }
})

// A drag hands over the whole new order. The queue may have moved on meanwhile — the
// head started, a song was added — so it is sorted by the order given rather than
// replaced; anything the order does not mention keeps its place at the end.
ipcMain.handle('queue:reorder', (_e, ids) => {
  if (!Array.isArray(ids)) return { ok: false }
  const rank = new Map(ids.map((id, index) => [String(id), index]))
  const at = (item) => rank.has(item.jobId) ? rank.get(item.jobId) : Infinity
  queue.sort((a, b) => at(a) - at(b))
  log('queue reordered', queue.map((item) => item.title))
  sendQueue()
  return { ok: true }
})

// Music made elsewhere, brought into the current project as finished songs, so it can
// be played, put in albums and in videos like any song made here. WAV and MP3 are
// copied as they are; other formats are converted to WAV, the one lossless format the
// library keeps. The originals are left where they were.
const IMPORT_TYPES = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'wma', 'aiff', 'aif']

const localStamp = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

ipcMain.handle('songs:import', async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: '이 프로젝트로 불러올 음악 파일',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '음악 파일', extensions: IMPORT_TYPES }]
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  const ffmpeg = await findFfmpeg()
  const failures = []
  let count = 0
  const started = Date.now()
  for (const [index, file] of picked.filePaths.entries()) {
    const ext = path.extname(file).slice(1).toLowerCase()
    const title = path.basename(file, path.extname(file)).replace(/[_]+/g, ' ').trim() || '무제'
    let dir = null
    try {
      if (!IMPORT_TYPES.includes(ext)) throw new Error('지원하지 않는 형식입니다')
      // Songs sort by creation time; spacing the stamps keeps the chosen order.
      const when = new Date(started + index * 1000)
      const stamp = when.toISOString().replace(/[-:T]/g, '').slice(0, 14)
      dir = await songFolder(stamp, title)
      for (let n = 2; await exists(dir); n++) dir = await songFolder(stamp, `${title} ${n}`)
      await fsp.mkdir(dir, { recursive: true })
      const base = audioName(title, PATH_BUDGET - dir.length - 1 - 4)
      let audio
      if (ext === 'wav' || ext === 'mp3') {
        audio = path.join(dir, `${base}.${ext}`)
        await fsp.copyFile(file, audio)
      } else {
        if (!ffmpeg) throw new Error('변환기를 찾지 못했습니다')
        audio = path.join(dir, `${base}.wav`)
        await convert(ffmpeg, file, audio, ['-vn', '-c:a', 'pcm_s16le'])
      }
      const seconds = ffmpeg ? await videoTools.probeSeconds(ffmpeg, audio) : null
      await writeMeta(dir, {
        id: 'imported', title, imported: true, source: path.basename(file),
        status: 'done', seconds: seconds ? Math.round(seconds * 10) / 10 : null,
        style: '', lyrics: '', instrumental: false, createdAt: localStamp(when),
        appVersion: app.getVersion()
      })
      await tidySong(dir)
      count += 1
    } catch (error) {
      failures.push(`${path.basename(file)}: ${error.message}`)
      if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }
  log('songs imported', { count, failures })
  return { ok: true, count, failures }
})

// Taking a song out of the list, and putting it back. Nothing on disk moves or goes;
// only the project's order file changes.
ipcMain.handle('songs:hide', async (_e, folder, hide = true) => {
  if (typeof folder !== 'string' || !folder) return { ok: false, message: '곡을 찾지 못했습니다.' }
  try {
    const dir = await projectDir()
    if (hide && !await exists(path.join(dir, folder))) return { ok: false, message: '곡을 찾지 못했습니다.' }
    const { hidden } = await readOrderFile(dir)
    const next = hidden.filter((name) => name !== folder)
    if (hide) next.push(folder)
    await writeOrderFile(dir, { hidden: next })
    log(hide ? 'song taken out of list' : 'song put back in list', folder)
    return { ok: true }
  } catch (error) {
    log('song list change not saved', error.message)
    return { ok: false, message: `목록을 바꾸지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('songs:hidden', async () => {
  try {
    return (await listSongs({ includeHidden: true })).filter((song) => song.hidden)
  } catch {
    return []
  }
})

ipcMain.handle('songs:reorder', async (_e, folders) => {
  if (!Array.isArray(folders)) return { ok: false, message: '순서를 저장하지 못했습니다.' }
  try {
    const dir = await projectDir()
    // Only folders that are songs of this project; a stale name would just sit there.
    const present = new Set((await fsp.readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name))
    await writeOrder(dir, folders.filter((folder) => typeof folder === 'string' && present.has(folder)))
    return { ok: true }
  } catch (error) {
    log('song order not saved', error.message)
    return { ok: false, message: `순서를 저장하지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('queue:move', (_e, { jobId, delta }) => {
  const index = queue.findIndex((item) => item.jobId === jobId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= queue.length) return { ok: false }
  queue.splice(target, 0, ...queue.splice(index, 1))
  sendQueue()
  return { ok: true }
})

// Pausing lets the current song finish; it only stops the next one from starting.
ipcMain.handle('queue:pause', (_e, value) => {
  paused = Boolean(value)
  log('queue', paused ? 'paused' : 'resumed')
  sendQueue()
  if (!paused) pump()
  return { ok: true, paused }
})

ipcMain.handle('queue:retry', async (_e, jobId) => {
  const index = failed.findIndex((item) => item.jobId === jobId)
  if (index < 0) return { ok: false, message: '다시 시도할 곡을 찾지 못했습니다.' }
  const item = failed[index]
  // Pick up where it stopped when the stage files survived; otherwise start clean.
  const keep = item.outDir && await exists(item.outDir) && await resumable(item.outDir)
  log('retry', item.title, keep ? '(이어서)' : '(처음부터)')
  const result = await startGeneration({ ...item.job, title: item.title, outDir: keep ? item.outDir : null })
  if (result.ok) {
    const at = failed.indexOf(item)
    if (at >= 0) failed.splice(at, 1)
    sendQueue()
  }
  return result
})

ipcMain.handle('queue:dismiss', (_e, jobId) => {
  const index = failed.findIndex((item) => item.jobId === jobId)
  if (index >= 0) failed.splice(index, 1)
  sendQueue()
  return { ok: true }
})

ipcMain.handle('queue:clear', async () => {
  const removed = queue.splice(0, queue.length)
  for (const item of removed) await discardPartial(item.outDir)
  log('queue cleared', removed.length)
  sendQueue()
  return { ok: true, removed: removed.length }
})

ipcMain.handle('song:delete', async (_e, dir) => {
  if (!dir || !dir.startsWith(await ensureSongsDir())) return { ok: false, message: '알 수 없는 폴더입니다.' }
  // A song being made or waiting to be made is cancelled from its card, not deleted.
  if ((currentJob && currentJob.outDir === dir) || queue.some((item) => item.outDir === dir)) {
    return { ok: false, message: '만들고 있거나 대기 중인 곡입니다. 먼저 취소한 뒤에 삭제해주세요.' }
  }
  try {
    await shell.trashItem(dir)
    log('song deleted', dir)
    // A failed song offered for retry goes with its folder.
    const before = failed.length
    failed.splice(0, failed.length, ...failed.filter((item) => item.outDir !== dir))
    if (failed.length !== before) sendQueue()
    return { ok: true }
  } catch (error) {
    log('delete failed', dir, error.message)
    return { ok: false, message: `삭제하지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('song:rename', async (_e, { dir, title }) => {
  try {
    const metaFile = path.join(dir, 'meta.json')
    const meta = JSON.parse(await fsp.readFile(metaFile, 'utf8'))
    meta.title = title
    // The audio file carries the title too. The renderer lets go of the file before
    // asking; if Windows still holds it, the title is saved and the file keeps its name.
    const named = await nameAudio(dir, title)
    const audio = named.wav || named.mp3
    if (audio) {
      meta.audio = audio
      meta.mp3 = named.mp3 || null
      meta.audioUrl = pathToFileURL(audio).href
    }
    await writeMeta(dir, meta)
    return { ok: true, fileRenamed: !named.failed }
  } catch (error) {
    log('rename failed', dir, error.message)
    return { ok: false, message: `이름을 바꾸지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('song:reveal', (_e, dir) => { shell.openPath(dir); return { ok: true } })

ipcMain.handle('song:background', async (_e, dir) => {
  if (!dir || !dir.startsWith(await ensureSongsDir())) return { ok: false, message: '알 수 없는 폴더입니다.' }
  const picked = await dialog.showOpenDialog(win, {
    title: '이 곡의 영상 배경 (이미지 또는 영상)',
    properties: ['openFile'],
    filters: [{ name: '이미지 또는 영상', extensions: [...BG_IMAGE, ...BG_VIDEO] },
      { name: '이미지', extensions: BG_IMAGE }, { name: '영상', extensions: BG_VIDEO }]
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  const source = picked.filePaths[0]
  const ext = path.extname(source).slice(1).toLowerCase()
  if (![...BG_IMAGE, ...BG_VIDEO].includes(ext)) return { ok: false, message: '이미지나 영상 파일이 아닙니다.' }
  try {
    // Copied under a working name first: a copy that fails halfway never replaces the
    // background the song already had.
    const partial = path.join(dir, `.background-copy.${ext}`)
    await fsp.copyFile(source, partial)
    await clearSongBackground(dir)
    await fsp.rename(partial, path.join(dir, `background.${ext}`))
    const metaFile = path.join(dir, 'meta.json')
    const meta = JSON.parse(await fsp.readFile(metaFile, 'utf8'))
    meta.backgroundName = path.basename(source)
    await writeMeta(dir, meta)
    log('song background set', dir, meta.backgroundName)
    return { ok: true, background: await songBackground(dir, meta) }
  } catch (error) {
    await fsp.rm(path.join(dir, `.background-copy.${ext}`), { force: true }).catch(() => {})
    log('song background failed', dir, error.message)
    return { ok: false, message: `배경을 넣지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('song:background-clear', async (_e, dir) => {
  if (!dir || !dir.startsWith(await ensureSongsDir())) return { ok: false, message: '알 수 없는 폴더입니다.' }
  try {
    await clearSongBackground(dir)
    log('song background removed', dir)
    return { ok: true }
  } catch (error) {
    return { ok: false, message: `배경을 빼지 못했습니다: ${error.message}` }
  }
})

const convert = (ffmpeg, from, to, args) => new Promise((resolve, reject) =>
  execFile(ffmpeg, ['-y', '-i', from, ...args, to],
    (error) => error ? reject(error) : resolve()))

// Lyric subtitles, made in the page (renderer/srt.js) and saved here. UTF-8 with a
// BOM: YouTube reads it either way, and older players and editors need the BOM to
// show Korean.
ipcMain.handle('song:save-srt', async (_e, { title, text }) => {
  const target = await dialog.showSaveDialog(win, {
    title: '가사 자막(SRT) 저장',
    defaultPath: path.join(await exportBase(), `${audioName(title || '가사')}.srt`),
    filters: [{ name: 'SRT 자막', extensions: ['srt'] }]
  })
  if (target.canceled || !target.filePath) return { ok: false, canceled: true }
  if (!await canWrite(path.dirname(target.filePath))) return { ok: false, blocked: true, message: BLOCKED_FOLDER }
  try {
    await fsp.writeFile(target.filePath, `﻿${String(text || '')}`, 'utf8')
    await rememberExportDir(path.dirname(target.filePath))
    log('lyrics srt saved', target.filePath)
    return { ok: true, path: target.filePath }
  } catch (error) {
    log('srt save failed', error.message)
    return { ok: false, message: `저장하지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('song:export', async (_e, { dir, title, format = 'mp3' }) => {
  if (typeof updateBlocksWork === 'function' && updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 내보낼 수 없습니다.' }
  if (typeof fileTransferTasks !== 'undefined') fileTransferTasks += 1
  try {
  const { wav, mp3 } = await audioFiles(dir)
  const target = await dialog.showSaveDialog(win, {
    title: `${format.toUpperCase()}로 내보내기`,
    defaultPath: path.join(await exportBase(), `${audioName(title)}.${format}`),
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  })
  if (target.canceled) return { ok: false, canceled: true }
  if (!await canWrite(path.dirname(target.filePath))) return { ok: false, blocked: true, message: BLOCKED_FOLDER }
  try {
    // Copy when the song is already in the wanted format; convert otherwise. Note a
    // WAV made from an auto-converted song comes from the MP3, so it cannot regain
    // what the MP3 dropped.
    const source = format === 'wav' ? (wav || mp3) : (mp3 || wav)
    if (!source) return { ok: false, message: '내보낼 음원 파일이 없습니다.' }
    if (path.extname(source).slice(1).toLowerCase() === format) {
      await fsp.copyFile(source, target.filePath)
    } else {
      const ffmpeg = await findFfmpeg()
      if (!ffmpeg) return { ok: false, message: '변환기를 찾지 못했습니다.' }
      await convert(ffmpeg, source, target.filePath,
        format === 'mp3' ? ['-b:a', '320k'] : ['-c:a', 'pcm_s24le'])
    }
    log('exported', format, target.filePath)
    await rememberExportDir(path.dirname(target.filePath))
    return { ok: true, path: target.filePath, fromLossy: format === 'wav' && source === mp3 }
  } catch (error) {
    log('export failed', error.message)
    return { ok: false, message: `저장하지 못했습니다: ${error.message}` }
  }
  } finally {
    if (typeof fileTransferTasks !== 'undefined') fileTransferTasks -= 1
  }
})

// ── album export ─────────────────────────────────────────────────────────────
// A project is an album: its finished songs go out together into one folder, named
// "01. 제목.mp3" in the order they were made, each tagged with title, album and track
// number so music players and distributors list them properly.
ipcMain.handle('album:export', async (_e, { format = 'mp3', minRating = 0, numbered = true, dirs } = {}) => {
  if (typeof updateBlocksWork === 'function' && updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 내보낼 수 없습니다.' }
  if (typeof fileTransferTasks !== 'undefined') fileTransferTasks += 1
  try {
  if (!['mp3', 'wav'].includes(format)) return { ok: false, message: '알 수 없는 형식입니다.' }
  const album = projectName()
  // Once the songs have been dragged into an order, the list is the running order,
  // top to bottom. Until then tracks go in the order they were made.
  const listed = await listSongs()
  const arranged = listed.some((song) => song.position !== null)
  const complete = listed.filter((song) => song.audio && !song.unfinished)
  if (dirs !== undefined) {
    if (!Array.isArray(dirs) || !dirs.length) return { ok: false, message: '내보낼 완성곡이 없습니다.' }
    const selected = new Set(dirs)
    const available = new Set(complete.map((song) => song.dir))
    if ([...selected].some((dir) => typeof dir !== 'string' || !available.has(dir))) {
      return { ok: false, message: '선택한 곡 중 현재 프로젝트의 완성곡이 아닌 항목이 있습니다.' }
    }
  }
  const selected = dirs === undefined ? null : new Set(dirs)
  const songs = complete
    .filter((song) => (song.rating || 0) >= minRating && (!selected || selected.has(song.dir)))
  if (!arranged) songs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  if (!songs.length) return { ok: false, message: '내보낼 완성곡이 없습니다.' }
  const picked = await dialog.showOpenDialog(win, {
    title: `"${album}" 앨범을 저장할 곳`,
    defaultPath: await exportBase(),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '여기에 내보내기'
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  if (!await canWrite(picked.filePaths[0])) return { ok: false, blocked: true, message: BLOCKED_FOLDER }
  // Always a folder of its own, never loose files in whatever folder was picked.
  const base = path.join(picked.filePaths[0], audioName(album))
  const ffmpeg = await findFfmpeg()
  const failures = []
  let lossy = 0
  let target
  try {
    for (let n = 1; ; n++) {
      target = n === 1 ? base : `${base} (${n})`
      try {
        await fsp.mkdir(target, { recursive: false })
        break
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
    }
    const width = Math.max(2, String(songs.length).length)
    for (const [index, song] of songs.entries()) {
      const track = index + 1
      send('album:progress', { done: index, total: songs.length, title: song.title })
      try {
        const { wav, mp3 } = await audioFiles(song.dir)
        const source = format === 'wav' ? (wav || mp3) : (mp3 || wav)
        if (!source) throw new Error('음원 파일이 없습니다')
        if (format === 'wav' && source === mp3) lossy += 1
        const name = `${numbered ? `${String(track).padStart(width, '0')}. ` : ''}${audioName(song.title)}`
        // Takes of the same song share a title; unnumbered, one would overwrite another.
        let file = path.join(target, `${name}.${format}`)
        for (let n = 2; await exists(file); n++) file = path.join(target, `${name} (${n}).${format}`)
        const same = path.extname(source).slice(1).toLowerCase() === format
        if (ffmpeg) {
          // Through ffmpeg even when nothing needs converting, to write the tags.
          const codec = same ? ['-c', 'copy'] : format === 'mp3' ? ['-b:a', '320k'] : ['-c:a', 'pcm_s24le']
          const tags = ['-metadata', `title=${song.title}`, '-metadata', `album=${album}`,
            '-metadata', `track=${track}/${songs.length}`]
          await convert(ffmpeg, source, file,
            [...codec, ...tags, ...(format === 'mp3' ? ['-id3v2_version', '3'] : [])])
        } else if (same) {
          await fsp.copyFile(source, file)
        } else {
          throw new Error('변환기를 찾지 못했습니다')
        }
      } catch (error) {
        failures.push(`${song.title}: ${error.message}`)
      }
    }
  } catch (error) {
    log('album export failed', error.message)
    return { ok: false, message: `내보내지 못했습니다: ${error.message}` }
  }
  send('album:progress', { done: songs.length, total: songs.length })
  log('album exported', { album, format, target, count: songs.length, failures })
  await rememberExportDir(picked.filePaths[0])
  return { ok: true, path: target, count: songs.length - failures.length, failures, lossy }
  } finally {
    if (typeof fileTransferTasks !== 'undefined') fileTransferTasks -= 1
  }
})

// One-shot cleanup for libraries recorded before the option existed.
ipcMain.handle('songs:compact', async () => {
  if (updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 정리할 수 없습니다.' }
  activeWork += 1
  try {
  if (currentJob) return { ok: false, message: '곡을 만드는 중에는 정리할 수 없습니다.' }
  let converted = 0
  let savedBytes = 0
  const failures = []
  for (const song of await listSongs({ includeHidden: true })) {
    if (song.unfinished) continue
    try {
      // Drop the stage files whether or not this song still needs converting.
      const before = await folderSize(song.dir)
      const { wav } = await audioFiles(song.dir)
      if (wav && await encodeMp3(song.dir)) {
        await fsp.rm(wav, { force: true })
        converted += 1
      }
      await tidySong(song.dir)
      savedBytes += Math.max(0, before - await folderSize(song.dir))
    } catch (error) {
      failures.push(`${song.title}: ${error.message}`)
    }
  }
  log('compact', { converted, savedBytes, failures })
  return { ok: true, converted, savedGb: Math.round(savedBytes / 1024 ** 3 * 100) / 100, failures }
  } finally {
    activeWork -= 1
  }
})

// Already installed and the C drive is filling up: the checkpoints are plain files and
// can be moved after the fact (the Python runtime cannot — its paths are absolute).
ipcMain.handle('settings:move-models', async () => {
  if (typeof updateBlocksWork === 'function' && updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 모델을 옮길 수 없습니다.' }
  if (typeof fileTransferTasks !== 'undefined') fileTransferTasks += 1
  try {
  if (currentJob || queue.length) return { ok: false, message: '곡을 만드는 중에는 옮길 수 없습니다.' }
  const found = findYueModels()
  if (!found) return { ok: false, message: '옮길 YuE2 모델 파일을 찾지 못했습니다.' }
  let from
  try { from = await fsp.realpath(found) } catch (error) {
    return { ok: false, message: `옮길 YuE2 모델 폴더를 확인하지 못했습니다: ${error.message}` }
  }
  const picked = await dialog.showOpenDialog(win, {
    title: '음악 모델을 옮길 폴더',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '이 폴더로 옮기기'
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  let parent
  try { parent = await fsp.realpath(picked.filePaths[0]) } catch (error) {
    return { ok: false, message: `대상 폴더를 확인하지 못했습니다: ${error.message}` }
  }
  const to = path.join(parent, 'RoadMusic-models')
  if (within(to, from) || within(from, to)) {
    return { ok: false, message: '현재 모델 폴더와 같거나 그 안쪽으로는 옮길 수 없습니다.' }
  }
  if (await exists(to)) return { ok: false, message: `"${to}" 폴더가 이미 있습니다. 다른 위치를 골라주세요.` }
  const freeGb = await freeSpaceGb(to)
  if (freeGb !== null && freeGb < 9) {
    return { ok: false, message: `여유 공간이 ${freeGb}GB입니다. 9GB 이상 필요합니다.` }
  }
  let stage = null
  let committed = false
  try {
    send('job:event', { type: 'notice', message: '모델을 옮기는 중입니다. 몇 분 걸릴 수 있습니다…' })
    stage = await fsp.mkdtemp(path.join(parent, '.RoadMusic-models-'))
    await copyYueCache(from, stage)
    if (!yueModelsIn(stage)) throw new Error('옮긴 모델을 확인하지 못했습니다.')
    await fsp.rename(stage, to)
    stage = null
    committed = true
    await writeSettings({ hfHome: to })
    const leftovers = []
    for (const repo of YUE_REPOS) {
      try { await fsp.rm(yueRepoDir(from, repo), { recursive: true, force: true }) } catch (error) {
        leftovers.push(repo)
        log('old model repo left behind', repo, error.message)
      }
    }
    log('models moved', from, '→', to)
    return { ok: true, path: to, leftovers }
  } catch (error) {
    if (stage) await fsp.rm(stage, { recursive: true, force: true }).catch(() => {})
    log('model move failed', error.message)
    return { ok: false, path: committed ? to : from, message: `옮기지 못했습니다: ${error.message}` }
  }
  } finally {
    if (typeof fileTransferTasks !== 'undefined') fileTransferTasks -= 1
  }
})

// ── storage locations ────────────────────────────────────────────────────────
// Exports start where the last one went, or in a folder set ahead in the options.
// A remembered folder that has since gone — an unplugged USB drive — falls back to
// Music rather than opening the dialog somewhere that no longer exists.
async function exportBase () {
  const settings = await readSettings()
  if (settings.exportDir && await exists(settings.exportDir)) return settings.exportDir
  return app.getPath('music')
}

async function rememberExportDir (dir) {
  if (cliBridge && cliBridge.outputPending()) return
  if ((await readSettings()).exportDir !== dir) await writeSettings({ exportDir: dir })
}

ipcMain.handle('settings:pick-export', async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: '내보낸 곡을 저장할 기본 폴더',
    defaultPath: await exportBase(),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '이 폴더로 정하기'
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  const dir = picked.filePaths[0]
  if (!await canWrite(dir)) return { ok: false, blocked: true, message: BLOCKED_FOLDER }
  await writeSettings({ exportDir: dir })
  log('export folder', dir)
  return { ok: true, path: dir }
})

// Every file under dir with its size, and every folder, so empty projects survive.
async function walk (dir) {
  const files = []
  const dirs = []
  const links = []
  for (const entry of await fsp.readdir(dir, { withFileTypes: true, recursive: true })) {
    const full = path.join(entry.parentPath || entry.path, entry.name)
    const rel = path.relative(dir, full)
    if (entry.isDirectory()) dirs.push(rel)
    else if (entry.isFile()) files.push({ rel, size: (await fsp.stat(full)).size })
    else if (entry.isSymbolicLink()) links.push({ rel, target: await fsp.readlink(full) })
  }
  return { files, dirs, links }
}

const within = (child, parent) => {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

const yueRepoDir = (home, repo) => path.join(home, 'hub', `models--${repo.replace('/', '--')}`)

async function verifyWalk (dir, expected) {
  for (const folder of expected.dirs) if (!(await fsp.stat(path.join(dir, folder))).isDirectory()) return false
  for (const file of expected.files) {
    const stat = await fsp.stat(path.join(dir, file.rel))
    if (!stat.isFile() || stat.size !== file.size) return false
  }
  for (const link of expected.links) {
    const full = path.join(dir, link.rel)
    if (!(await fsp.lstat(full)).isSymbolicLink() || await fsp.readlink(full) !== link.target) return false
  }
  return true
}

async function copyYueCache (from, to) {
  for (const repo of YUE_REPOS) {
    const source = yueRepoDir(from, repo)
    const target = yueRepoDir(to, repo)
    const inventory = await walk(source)
    for (const link of inventory.links) {
      const resolved = path.resolve(path.dirname(path.join(source, link.rel)), link.target)
      if (path.isAbsolute(link.target) || !within(resolved, source)) {
        throw new Error(`${repo}의 모델 링크가 캐시 폴더 밖을 가리킵니다.`)
      }
    }
    await fsp.cp(source, target, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true })
    if (!await verifyWalk(target, inventory)) throw new Error(`${repo} 파일을 확인하지 못했습니다.`)
  }
}

async function validateSongLinks (from, links) {
  for (const link of links) {
    if (path.isAbsolute(link.target)) throw new Error(`${link.rel} 링크가 곡 폴더 밖을 가리킵니다.`)
    const target = await fsp.realpath(path.join(from, link.rel))
    if (!within(target, from)) throw new Error(`${link.rel} 링크가 곡 폴더 밖을 가리킵니다.`)
  }
}

// The whole library — every project and song — moves to another folder or drive, and
// new songs are saved there from then on. Across drives nothing is deleted until every
// file has been copied and its size checked at the new place.
ipcMain.handle('settings:move-songs', async () => {
  if (typeof updateBlocksWork === 'function' && updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 곡을 옮길 수 없습니다.' }
  if (typeof fileTransferTasks !== 'undefined') fileTransferTasks += 1
  try {
  if (currentJob || queue.length) {
    return { ok: false, message: '곡을 만드는 중이거나 대기열에 곡이 있으면 옮길 수 없습니다. 모두 끝난 뒤에 해주세요.' }
  }
  const originalSourceRoot = await ensureSongsDir()
  const from = await fsp.realpath(originalSourceRoot)
  const picked = await dialog.showOpenDialog(win, {
    title: '곡을 저장할 새 위치 (예: D 드라이브)',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '이 위치로 옮기기'
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  let parent
  try { parent = await fsp.realpath(picked.filePaths[0]) } catch (error) {
    return { ok: false, message: `대상 폴더를 확인하지 못했습니다: ${error.message}` }
  }
  const to = path.join(parent, 'Road Music Songs')
  if (within(to, from) || within(from, to)) {
    return { ok: false, message: '지금 곡 폴더와 같은 곳이거나 그 안쪽으로는 옮길 수 없습니다.' }
  }
  if (await exists(to)) {
    return { ok: false, message: `"${to}" 폴더가 이미 있습니다. 다른 위치를 골라주세요.` }
  }
  if (!await canWrite(parent)) return { ok: false, blocked: true, message: BLOCKED_FOLDER }

  let inventory
  try {
    inventory = await walk(from)
    await validateSongLinks(from, inventory.links)
  } catch (error) {
    return { ok: false, message: `옮길 곡 폴더를 확인하지 못했습니다: ${error.message}` }
  }
  const { files, dirs, links } = inventory
  const total = files.reduce((sum, file) => sum + file.size, 0)
  let sameDrive = false
  try { sameDrive = (await fsp.stat(from)).dev === (await fsp.stat(parent)).dev } catch { /* rename will report the usable error */ }
  const freeGb = await freeSpaceGb(parent)
  const needGb = Math.round(total / 1024 ** 3 * 10) / 10
  if (!sameDrive && freeGb !== null && freeGb < needGb + 0.5) {
    return { ok: false, message: `공간이 부족합니다. 곡 ${needGb}GB를 옮길 공간이 필요한데 ${freeGb}GB 남아 있습니다.` }
  }
  log('moving songs', from, '→', to, { files: files.length, gb: needGb, sameDrive })
  let stage = null
  let movedByRename = false
  let copied = false
  try {
    if (sameDrive) {
      try {
        await fsp.rename(from, to)
        movedByRename = true
      } catch (error) {
        if (error.code !== 'EXDEV') throw error
        sameDrive = false
      }
    }
    if (!movedByRename) {
      stage = await fsp.mkdtemp(path.join(parent, '.Road Music Songs-'))
      for (const dir of dirs) await fsp.mkdir(path.join(stage, dir), { recursive: true })
      let copiedBytes = 0
      let reported = 0
      for (const [index, file] of files.entries()) {
        const destination = path.join(stage, file.rel)
        await fsp.mkdir(path.dirname(destination), { recursive: true })
        await fsp.copyFile(path.join(from, file.rel), destination, fs.constants.COPYFILE_EXCL)
        copiedBytes += file.size
        if (Date.now() - reported > 400) {
          reported = Date.now()
          send('songs:move-progress', { copied: copiedBytes, total, done: index + 1, count: files.length })
        }
      }
      for (const link of links) {
        const destination = path.join(stage, link.rel)
        await fsp.mkdir(path.dirname(destination), { recursive: true })
        await fsp.symlink(link.target, destination)
      }
      if (!await verifyWalk(stage, inventory)) throw new Error('복사한 곡 폴더를 확인하지 못했습니다.')
      await fsp.rename(stage, to)
      stage = null
      copied = true
    }
  } catch (error) {
    log('move songs failed', error.message)
    if (stage) await fsp.rm(stage, { recursive: true, force: true }).catch(() => {})
    return { ok: false, message: `옮기지 못했습니다: ${error.message}\n원래 곡 폴더는 그대로 있습니다.` }
  }

  try {
    await writeSettings({ songsDir: to })
  } catch (error) {
    if (movedByRename) {
      try {
        await fsp.rename(to, from)
        return { ok: false, message: `설정을 저장하지 못해 원래 곡 폴더로 되돌렸습니다: ${error.message}` }
      } catch (rollback) {
        return { ok: false, path: to, message: `설정을 저장하지 못했습니다. 곡은 새 위치에 안전하게 있습니다: ${to} (${rollback.message})` }
      }
    }
    return { ok: false, path: from, message: `설정을 저장하지 못했습니다. 원래 곡 폴더는 그대로 있습니다: ${error.message}` }
  }
  songsDir = to
  // A failed song waiting for a retry points into the old folder.
  const remap = (file) => {
    if (typeof file !== 'string') return file
    for (const root of [originalSourceRoot, from]) {
      if (within(file, root)) return path.join(to, path.relative(root, file))
    }
    return file
  }
  let queueChanged = false
  for (const item of failed) {
    const outDir = remap(item.outDir)
    if (outDir !== item.outDir) { item.outDir = outDir; queueChanged = true }
    if (!item.job) continue
    const jobOutDir = remap(item.job.outDir)
    if (jobOutDir !== item.job.outDir) { item.job.outDir = jobOutDir; queueChanged = true }
    if (item.job.cover) {
      const coverAudio = remap(item.job.cover.audio)
      if (coverAudio !== item.job.cover.audio) { item.job.cover.audio = coverAudio; queueChanged = true }
    }
  }
  if (queueChanged) sendQueue()
  let leftover = null
  if (copied) {
    try {
      await fsp.rm(from, { recursive: true, force: true })
    } catch (error) {
      // Everything is safely at the new place; the old copy just could not be cleared.
      leftover = from
      log('old songs folder left behind', from, error.message)
    }
  }
  log('songs moved', from, '→', to)
  send('songs:move-progress', { copied: total, total, done: files.length, count: files.length })
  return { ok: true, path: to, count: files.length, gb: needGb, leftover }
  } finally {
    if (typeof fileTransferTasks !== 'undefined') fileTransferTasks -= 1
  }
})

// ── playlist video (electron/video.js) ───────────────────────────────────────
const videoCacheDir = () => path.join(userData(), 'video-cache')
const preparedCycles = new Map() // cycle id → cycle, for the render that follows
const renderJobs = new Map()
// A long render must not be cut short by the PC going to sleep.
let renderAwake = null
function keepAwakeWhileRendering () {
  if (renderJobs.size && renderAwake === null) renderAwake = powerSaveBlocker.start('prevent-app-suspension')
  if (!renderJobs.size && renderAwake !== null) {
    powerSaveBlocker.stop(renderAwake)
    renderAwake = null
  }
}

// Frames travel over a loopback HTTP connection rather than IPC. Electron's IPC runs
// every multi-megabyte frame through the V8 serializer on both sides, which held
// renders to about 40 fps; an HTTP body goes from Chromium's network service into
// the ffmpeg pipe with plain copies. Bound to 127.0.0.1 only, with a random token per
// render. Frames may arrive out of order; the job writes them in order.
let frameServer = null
function frameServerPort () {
  if (frameServer) return frameServer
  const server = http.createServer((req, res) => {
    const match = req.method === 'POST' && req.url.match(/^\/frame\/(\d+)\/([0-9a-f]{32})\/(\d+)$/)
    const job = match && renderJobs.get(match[1])
    if (!job || job.token !== match[2]) {
      res.writeHead(403)
      res.end()
      req.resume()
      return
    }
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', async () => {
      const ok = await job.frameAt(Number(match[3]), Buffer.concat(chunks)).catch(() => false)
      res.writeHead(ok ? 204 : 410, { 'Access-Control-Allow-Origin': '*' })
      res.end()
    })
  })
  frameServer = new Promise((resolve, reject) => {
    server.once('error', (error) => { frameServer = null; reject(error) })
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
  return frameServer
}

async function videoFfmpeg () {
  const ffmpeg = await findFfmpeg()
  if (!ffmpeg) throw new Error('영상 변환기(ffmpeg)를 찾지 못했습니다. 프로그램을 다시 설치해 주세요.')
  return ffmpeg
}

ipcMain.handle('video:settings', async () => (await readSettings()).video || null)
ipcMain.handle('video:save-settings', async (_e, video) => {
  if (video && typeof video === 'object') await writeSettings({ video })
  return { ok: true }
})

// Joins the songs into one track and analyses it; both are cached, so preparing the
// same songs again — or with a new colour — is instant.
ipcMain.handle('video:prepare', async (_e, { tracks, fps, analysis: settings }) => {
  if (updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 영상을 준비할 수 없습니다.' }
  activeWork += 1
  try {
    const root = await ensureSongsDir()
    const list = (tracks || []).filter((track) => track && typeof track.path === 'string' &&
      path.resolve(track.path).startsWith(path.resolve(root)))
    if (!list.length) return { ok: false, message: '영상으로 만들 완성곡이 없습니다.' }
    for (const track of list) {
      if (!await exists(track.path)) return { ok: false, message: `음원 파일이 없습니다: ${track.title}` }
    }
    const ffmpeg = await videoFfmpeg()
    const rate = videoTools.FPS_CHOICES.includes(Number(fps)) ? Number(fps) : 30
    const cycle = await videoTools.prepareCycle({
      ffmpeg, cacheDir: videoCacheDir(), fps: rate,
      tracks: list.map((track) => ({ path: track.path, title: String(track.title || '무제') })),
      onProgress: (fraction) => send('video:progress', { stage: 'audio', fraction })
    })
    const cache = await videoTools.spectrumCache({
      cacheDir: videoCacheDir(), cycle, settings,
      onProgress: (fraction) => send('video:progress', { stage: 'analysis', fraction })
    })
    preparedCycles.set(cycle.id, cycle)
    log('video prepared', { songs: list.length, seconds: cycle.seconds, frames: cycle.frameCount,
      bars: cache.header.barCount, reusedAudio: cycle.reused, reusedAnalysis: cache.reused })
    return {
      ok: true,
      cycle: { id: cycle.id, seconds: cycle.seconds, frameCount: cycle.frameCount, fps: cycle.fps,
        chapters: cycle.chapters, audioUrl: pathToFileURL(cycle.wav).href },
      header: cache.header,
      frames: new Uint8Array(cache.frames.buffer, cache.frames.byteOffset, cache.frames.byteLength)
    }
  } catch (error) {
    log('video prepare failed', error.stack || error.message)
    return { ok: false, message: `영상을 준비하지 못했습니다: ${error.message}` }
  } finally {
    activeWork -= 1
  }
})

// ── editor assets ──
// Pictures brought into the editor are copied into the app's own folder, so a placed
// picture keeps working when the original is moved or deleted.
const assetsDir = () => path.join(userData(), 'assets')
const ASSET_TYPES = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']

async function listAssets () {
  const dir = assetsDir()
  await fsp.mkdir(dir, { recursive: true })
  const names = (await fsp.readdir(dir)).filter((n) => ASSET_TYPES.includes(path.extname(n).slice(1).toLowerCase()))
  const items = await Promise.all(names.map(async (name) => {
    const file = path.join(dir, name)
    const stat = await fsp.stat(file).catch(() => null)
    return stat && { path: file, url: pathToFileURL(file).href, name: name.replace(/^\d{14}_/, ''), time: stat.mtimeMs }
  }))
  return items.filter(Boolean).sort((a, b) => b.time - a.time)
}

ipcMain.handle('assets:list', async () => ({ ok: true, assets: await listAssets() }))

// The editor's 전체화면: the window itself, so the editor gets the whole screen.
ipcMain.handle('window:fullscreen', (_e, on) => {
  if (win && !win.isDestroyed()) win.setFullScreen(Boolean(on))
  return { ok: true, full: Boolean(win && win.isFullScreen()) }
})

ipcMain.handle('assets:import', async () => {
  if (updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 에셋을 가져올 수 없습니다.' }
  activeWork += 1
  try {
  const picked = await dialog.showOpenDialog(win, {
    title: '편집 모드에 쓸 이미지 불러오기',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '이미지', extensions: ASSET_TYPES }]
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  const dir = assetsDir()
  await fsp.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const added = []
  for (const source of picked.filePaths.slice(0, 50)) {
    const name = path.basename(source).replace(/[\\/:*?"<>|#%]/g, '_')
    let target = path.join(dir, `${stamp}_${name}`)
    for (let n = 2; await exists(target); n++) target = path.join(dir, `${stamp}_${n}_${name}`)
    try {
      await fsp.copyFile(source, target)
      added.push(target)
    } catch (error) {
      log('asset import failed', source, error.message)
    }
  }
  return { ok: true, added, assets: await listAssets() }
  } finally {
    activeWork -= 1
  }
})

ipcMain.handle('assets:remove', async (_e, file) => {
  if (!file || !path.resolve(file).startsWith(path.resolve(assetsDir()))) return { ok: false, message: '알 수 없는 파일입니다.' }
  try {
    await shell.trashItem(file)
  } catch (error) {
    return { ok: false, message: `지우지 못했습니다: ${error.message}` }
  }
  return { ok: true, assets: await listAssets() }
})

// ── recordings ("녹음으로 곡 만들기") ──
// A take from the microphone, or an audio file, kept as 48 kHz stereo WAV in the app's
// own folder (not the songs folder: it is a source, not a song). The newest few stay.
const recordingsDir = () => path.join(userData(), 'recordings')
const RECORDING_TYPES = ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm', 'wma', 'mp4', 'mov']

async function pruneRecordings (dir) {
  try {
    const names = (await fsp.readdir(dir)).filter((name) => /^\d{14}_/.test(name)).sort().reverse()
    const reserved = new Set([currentJob, ...queue, ...failed]
      .map((item) => item && item.job && item.job.cover && item.job.cover.audio)
      .filter((audio) => typeof audio === 'string').map((audio) => path.resolve(audio)))
    const takes = [...new Set(names.map((name) => name.slice(0, 14)))]
    for (const old of takes.slice(30)) {
      const files = names.filter((name) => name.startsWith(old))
      if (files.some((name) => reserved.has(path.resolve(dir, name)))) continue
      for (const name of files) await fsp.rm(path.join(dir, name), { force: true })
    }
  } catch {}
}

async function keepRecording (source, name) {
  const dir = recordingsDir()
  await fsp.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const target = path.join(dir, `${stamp}_${name}.wav`)
  const ffmpeg = await videoFfmpeg()
  await convert(ffmpeg, source, target, ['-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le'])
  const seconds = await videoTools.probeSeconds(ffmpeg, target)
  if (!seconds || seconds < 1) {
    await fsp.rm(target, { force: true })
    throw new Error('소리가 들어 있지 않거나 너무 짧습니다')
  }
  // Tidy up: the 30 newest takes (and their stretched copies) are plenty.
  await pruneRecordings(dir)
  return { ok: true, path: target, url: pathToFileURL(target).href, seconds: Math.round(seconds * 10) / 10 }
}

// A short take repeated to the length asked for: copies joined with a 1 s crossfade
// (shorter for a very short take), cut to length, with a fade at the end. ACE-Step
// keeps the source's length, so this decides how long the song is.
async function stretchRecording (file, targetSeconds) {
  const ffmpeg = await videoFfmpeg()
  const length = await videoTools.probeSeconds(ffmpeg, file) || 0
  const target = Math.min(600, Math.max(0, Math.round(targetSeconds) || 0))
  if (!target || target <= length + 1) return file
  const out = file.replace(/\.wav$/i, `_${target}s.wav`)
  if (await exists(out)) return out
  const fade = Math.min(1, length / 4)
  const copies = Math.min(60, Math.ceil((target - length) / Math.max(0.5, length - fade)) + 1)
  const inputs = Array.from({ length: copies }, () => ['-i', file]).flat()
  let chain = ''
  let last = '[0:a]'
  for (let i = 1; i < copies; i++) {
    chain += `${last}[${i}:a]acrossfade=d=${fade.toFixed(2)}:c1=tri:c2=tri[x${i}];`
    last = `[x${i}]`
  }
  chain += `${last}atrim=0:${target},afade=t=out:st=${Math.max(0, target - 3)}:d=3[out]`
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-y', ...inputs, '-filter_complex', chain, '-map', '[out]',
      '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out], { windowsHide: true })
    let err = ''
    child.stderr.on('data', (d) => { err = (err + d).slice(-1500) })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg ${code}`)))
  })
  log('recording stretched', { file, length, target, copies })
  return out
}

// Bytes from the microphone (MediaRecorder, webm/opus) → a WAV take.
ipcMain.handle('recording:activity', (_e, active) => {
  if (typeof active !== 'boolean') throw Object.assign(new Error('active는 boolean이어야 합니다.'), { code: 'INVALID_ARGUMENT' })
  if (active && typeof updateBlocksWork === 'function' && updateBlocksWork()) return { ok: false, blocked: true, message: '업데이트 설치를 준비하는 중에는 녹음을 시작할 수 없습니다.' }
  recordingActive = active
  return { ok: true, active }
})

ipcMain.handle('recording:save', async (_e, data) => {
  const temp = path.join(os.tmpdir(), `roadmusic-take-${Date.now()}.webm`)
  try {
    await fsp.writeFile(temp, Buffer.from(data.buffer || data, data.byteOffset || 0, data.byteLength))
    return await keepRecording(temp, '녹음')
  } catch (error) {
    log('recording save failed', error.message)
    return { ok: false, message: `녹음을 저장하지 못했습니다: ${error.message}` }
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => {})
  }
})

// An audio file from the PC (a phone recording, a voice memo).
ipcMain.handle('recording:pick', async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: '녹음 파일 고르기',
    properties: ['openFile'],
    filters: [{ name: '소리 파일', extensions: RECORDING_TYPES }]
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  try {
    const name = path.basename(picked.filePaths[0], path.extname(picked.filePaths[0])).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
    return { ...await keepRecording(picked.filePaths[0], name || '녹음'), name: path.basename(picked.filePaths[0]) }
  } catch (error) {
    log('recording pick failed', error.message)
    return { ok: false, message: `이 파일을 쓰지 못했습니다: ${error.message}` }
  }
})

ipcMain.handle('video:background', async (_e, kind) => {
  const picked = await dialog.showOpenDialog(win, {
    title: kind === 'video' ? '배경 영상 고르기' : '배경 이미지 고르기',
    properties: ['openFile'],
    filters: kind === 'video'
      ? [{ name: '영상', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v'] }]
      : [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  const file = picked.filePaths[0]
  return { ok: true, kind: kind === 'video' ? 'video' : 'image', path: file, url: pathToFileURL(file).href }
})

// The tracklist for a render (renderer/tracklist.js): one PNG per song, drawn by the
// renderer, kept in userData/render-tmp until the next render clears them.
ipcMain.handle('tracklist:write', async (_e, index, dataUrl, first) => {
  try {
    const dir = path.join(userData(), 'render-tmp')
    if (first) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
    await fsp.mkdir(dir, { recursive: true })
    const match = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ''))
    if (!match || !Number.isInteger(index) || index < 0) return { ok: false, message: '트랙리스트 그림이 올바르지 않습니다.' }
    const file = path.join(dir, `tracklist-${index}.png`)
    await fsp.writeFile(file, Buffer.from(match[1], 'base64'))
    return { ok: true, path: file }
  } catch (error) {
    log('tracklist write failed', error.message)
    return { ok: false, message: `트랙리스트 그림을 저장하지 못했습니다: ${error.message}` }
  }
})

// Asks where to save, plans the render and starts ffmpeg; the renderer then feeds it
// frames drawn by the same code as the preview.
ipcMain.handle('video:start', async (_e, { cycleId, video, name }) => {
  if (updateBlocksWork()) return { ok: false, message: '업데이트 설치를 준비하는 중에는 영상을 만들 수 없습니다.' }
  activeWork += 1
  try {
    const cycle = preparedCycles.get(cycleId)
    if (!cycle) return { ok: false, message: '미리보기를 다시 준비해주세요.' }
    // With per-song backgrounds the runs below name every background actually shown
    // (the studio's included, where a song has none of its own); a studio background
    // no song uses must not stop the render.
    const timeline = Array.isArray(video.runs) && video.runs.length > 0
    if (!timeline && video.background && video.background.kind !== 'none' &&
        (!video.background.path || !await exists(video.background.path))) {
      return { ok: false, message: '배경 파일을 찾지 못했습니다. 배경을 다시 골라주세요.' }
    }
    // Pictures from the editor must still be where they were put.
    for (const overlay of Array.isArray(video.overlays) ? video.overlays : []) {
      if (!overlay || !overlay.path || !await exists(overlay.path)) {
        return { ok: false, message: `붙인 이미지를 찾지 못했습니다: ${(overlay && (overlay.name || overlay.path)) || '이미지'}. 편집 모드에서 빼거나 다시 붙여 주세요.` }
      }
    }
    // Songs with their own background: the runs must cover the playlist exactly, and
    // every picture or clip must still be there.
    if (Array.isArray(video.runs) && video.runs.length) {
      let at = 0
      for (const run of video.runs) {
        const kind = run.background && run.background.kind
        if (run.start !== at || !(run.end > run.start)) return { ok: false, message: '곡별 배경 구간이 맞지 않습니다. 미리보기를 다시 준비해주세요.' }
        if ((kind === 'image' || kind === 'video') && (!run.background.path || !await exists(run.background.path))) {
          return { ok: false, message: `곡별 배경 파일을 찾지 못했습니다: ${run.background.name || run.background.path}` }
        }
        at = run.end
      }
      if (at !== cycle.frameCount) return { ok: false, message: '곡별 배경 구간이 맞지 않습니다. 미리보기를 다시 준비해주세요.' }
    }
    // Tests in a dev checkout name the file up front instead of using the dialog.
    const testOutput = !app.isPackaged && process.env.ROADMUSIC_TEST_VIDEO_OUT
    const target = testOutput ? { filePath: testOutput } : await dialog.showSaveDialog(win, {
      title: '영상 저장',
      defaultPath: path.join(await exportBase(), `${audioName(name || '플레이리스트')}.mp4`),
      filters: [{ name: 'MP4 영상', extensions: ['mp4'] }]
    })
    if (target.canceled || !target.filePath) return { ok: false, canceled: true }
    if (!await canWrite(path.dirname(target.filePath))) return { ok: false, blocked: true, message: BLOCKED_FOLDER }
    const job = new videoTools.RenderJob({ ffmpeg: await videoFfmpeg(), cycle, video, output: target.filePath, log })
    const plan = await job.start()
    const id = `${Date.now()}`
    job.token = crypto.randomBytes(16).toString('hex')
    job.onFail = (message) => send('video:failed', { jobId: id, message })
    renderJobs.set(id, job)
    keepAwakeWhileRendering()
    await rememberExportDir(path.dirname(target.filePath))
    // The fast path for frames; without it the renderer falls back to IPC.
    const port = await frameServerPort().catch((error) => {
      log('frame server unavailable', error.message)
      return null
    })
    return { ok: true, jobId: id, plan, path: target.filePath, port, token: job.token,
      chapters: videoTools.chapters(cycle, plan.target) }
  } catch (error) {
    log('video start failed', error.stack || error.message)
    return { ok: false, message: `영상을 시작하지 못했습니다: ${error.message}` }
  } finally {
    activeWork -= 1
  }
})

// The slower path, used when the loopback server is not available.
ipcMain.handle('video:frame', async (_e, jobId, index, data) => {
  const job = renderJobs.get(jobId)
  if (!job) return false
  return job.frameAt(index, Buffer.from(data.buffer || data, data.byteOffset || 0, data.byteLength))
})

// The layer that never changes — backdrop or darkening — sent once, before any band.
ipcMain.handle('video:layer', async (_e, jobId, data) => {
  const job = renderJobs.get(jobId)
  if (!job) return false
  await job.layer(Buffer.from(data.buffer || data, data.byteOffset || 0, data.byteLength))
  return true
})

ipcMain.handle('video:finish', async (_e, jobId) => {
  const job = renderJobs.get(jobId)
  if (!job) return { ok: false, message: '렌더 작업을 찾지 못했습니다.' }
  try {
    const result = await job.finish()
    return { ok: true, ...result }
  } catch (error) {
    log('video render failed', error.message, job.stderr ? job.stderr.slice(-1500) : '')
    await job.cancel().catch(() => {})
    const gpu = job.video.renderer !== 'cpu' && /nvenc|No capable devices|OpenEncodeSessionEx|driver|compression session|allow_sw|qscale not available|Unknown encoder/i.test(job.stderr || '')
    return { ok: false, gpuFailed: gpu,
      message: gpu
        ? MAC ? 'GPU(Apple VideoToolbox)로 인코딩하지 못했습니다. 렌더링 옵션을 CPU로 바꿔 다시 시도해주세요.' : 'GPU(NVIDIA NVENC)로 인코딩하지 못했습니다. 렌더링 옵션을 CPU로 바꿔 다시 시도해주세요.'
        : `영상을 만들지 못했습니다 (${error.message}). 만들던 파일은 지웠습니다. 다시 시도해 주시고, 되풀이되면 저장 위치를 다른 폴더로 바꾸거나 렌더링 옵션을 CPU로 바꿔 보세요.` }
  } finally {
    renderJobs.delete(jobId)
    keepAwakeWhileRendering()
  }
})

ipcMain.handle('video:cancel', async (_e, jobId) => {
  const job = renderJobs.get(jobId)
  if (job) await job.cancel()
  renderJobs.delete(jobId)
  keepAwakeWhileRendering()
  return { ok: true }
})

// Closing mid-render asks first, and a render that is given up is cleaned up before
// the app goes: its working files removed, nothing half-written left behind.
let quittingAfterRender = false
function stopRendersThenQuit (event) {
  if (quittingAfterRender || !renderJobs.size) return
  event.preventDefault()
  quittingAfterRender = true
  Promise.allSettled([...renderJobs.values()].map((job) => job.cancel()))
    .then(() => {
      renderJobs.clear()
      keepAwakeWhileRendering()
      app.quit()
    })
}
app.on('before-quit', stopRendersThenQuit)

// The WYSIWYG check (지시서 §14.3): a frame drawn the way the preview draws it — one
// canvas, backdrop and spectrum together — against the same frame decoded from the
// finished MP4. Both are brought to the encoder's 4:2:0 colour before SSIM, so only
// real differences count, not the chroma subsampling every MP4 applies.
ipcMain.handle('video:compare', async (_e, { output, frame, against = frame, fps, width, height, rgba, background }) => {
  const work = path.join(os.tmpdir(), `roadmusic-compare-${Date.now()}-${frame}`)
  try {
    await fsp.mkdir(work, { recursive: true })
    const preview = path.join(work, 'preview.rgba')
    await fsp.writeFile(preview, Buffer.from(rgba.buffer || rgba, rgba.byteOffset || 0, rgba.byteLength))
    const ffmpeg = await videoFfmpeg()
    const args = ['-hide_banner', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-i', preview,
      '-ss', (against / fps).toFixed(6), '-i', output]
    let graph = ''
    if (background && background.kind === 'image' && background.path) {
      // The preview's picture is CSS under the canvas; here it goes under the drawn frame.
      args.push('-i', background.path)
      graph = `[2:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=rgba[bg];` +
        '[bg][0:v]overlay=0:0:format=auto,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[a];'
    } else {
      graph = '[0:v]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[a];'
    }
    graph += '[1:v]trim=end_frame=1,format=yuv420p[b];[a][b]ssim'
    const text = await new Promise((resolve) => {
      const child = spawn(ffmpeg, [...args, '-filter_complex', graph, '-frames:v', '1', '-f', 'null', '-'], { windowsHide: true })
      let out = ''
      child.stderr.on('data', (chunk) => { out += chunk })
      child.on('close', () => resolve(out))
      child.on('error', () => resolve(''))
    })
    const match = text.match(/All:([0-9.]+)/)
    const ssim = match ? Number(match[1]) : null
    log('video compare', { frame, against, ssim })
    return { ok: ssim !== null, ssim }
  } catch (error) {
    log('video compare failed', error.message)
    return { ok: false }
  } finally {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {})
  }
})

// User-made style presets live in settings so they survive updates.
ipcMain.handle('presets:list', async () => (await readSettings()).presets || [])

// Presets can sit in folders (a name, or none), so more of them stay manageable.
const PRESET_LIMIT = 200
const presetFolder = (value) => String(value || '').trim().slice(0, 30)

ipcMain.handle('presets:save', async (_e, preset) => {
  const name = String(preset.name || '').trim().slice(0, 40)
  if (!name) return { ok: false, message: '이름을 입력해주세요.' }
  const presets = ((await readSettings()).presets || []).filter((item) => item.name !== name)
  presets.push({ name, style: String(preset.style || '').trim(), instrumental: Boolean(preset.instrumental),
    parts: cleanParts(preset.parts), folder: presetFolder(preset.folder) })
  const kept = presets.slice(-PRESET_LIMIT)
  await writeSettings({ presets: kept })
  log('preset saved', name)
  return { ok: true, presets: kept }
})

ipcMain.handle('presets:move', async (_e, { name, folder } = {}) => {
  const presets = ((await readSettings()).presets || [])
    .map((item) => item.name === name ? { ...item, folder: presetFolder(folder) } : item)
  await writeSettings({ presets })
  return { ok: true, presets }
})

ipcMain.handle('presets:delete', async (_e, name) => {
  const presets = ((await readSettings()).presets || []).filter((item) => item.name !== name)
  await writeSettings({ presets })
  return { ok: true, presets }
})

ipcMain.handle('settings:get', async () => {
  const settings = await readSettings()
  return {
    autoMp3: Boolean(settings.autoMp3),
    dropWav: Boolean(settings.dropWav),
    songsDir: await ensureSongsDir().catch(() => null),
    exportDir: settings.exportDir || null,
    musicDir: app.getPath('music')
  }
})

ipcMain.handle('settings:set', async (_e, patch) => {
  const next = await writeSettings({
    autoMp3: Boolean(patch.autoMp3),
    dropWav: Boolean(patch.autoMp3) && Boolean(patch.dropWav)
  })
  log('settings', { autoMp3: next.autoMp3, dropWav: next.dropWav })
  return { autoMp3: next.autoMp3, dropWav: next.dropWav }
})

ipcMain.handle('shell:open', (_e, target) => { shell.openPath(target); return { ok: true } })

ipcMain.handle('log:open', () => {
  shell.showItemInFolder(path.join(userData(), 'app.log'))
  return { ok: true }
})

// ── updates ──────────────────────────────────────────────────────────────────
const STORE = Boolean(process.windowsStore)
const STORE_PAGE = 'ms-windows-store://pdp/?productid=9PKVCRRFSVQC'
const WEEK = 7 * 24 * 60 * 60 * 1000

ipcMain.handle('update:status', () => ({ ...appUpdate.status(), preparing: updatePreparing }))

ipcMain.handle('update:check', async (_e, value) => {
  const { manual = false } = updateInput(value, ['manual'])
  if (typeof manual !== 'boolean') throw Object.assign(new Error('manual은 boolean이어야 합니다.'), { code: 'INVALID_ARGUMENT' })
  const found = await appUpdate.check()
  log('update check', { version: found.version, current: found.current, status: found.status, manual })
  return found
})

ipcMain.handle('update:download', async (_e, value) => {
  updateInput(value)
  return ensureUpdateDownloaded()
})

ipcMain.handle('update:install', async (_e, value) => {
  updateInput(value)
  if (updatePreparing) return { ...appUpdate.status(), preparing: true }
  updatePreparing = true
  try {
    const state = await ensureUpdateDownloaded()
    const result = state.status === 'downloaded' ? await appUpdate.install() : state
    if (result.status === 'installing') return { ...result, preparing: true }
    return result
  } finally {
    if (appUpdate.status().status !== 'installing') updatePreparing = false
  }
})

ipcMain.handle('update:watch', async (_e, value) => {
  const { timeoutMs = 3600000 } = updateInput(value, ['timeoutMs'])
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) {
    throw Object.assign(new Error('timeoutMs는 1~3600000 정수여야 합니다.'), { code: 'INVALID_ARGUMENT' })
  }
  return waitForUpdate(timeoutMs)
})

ipcMain.handle('update:quiet-week', async () => {
  await writeSettings({ updateQuietUntil: Date.now() + WEEK })
  return { ok: true }
})

ipcMain.handle('update:open-page', (_e, page) => {
  if (STORE) {
    try { shell.openExternal(STORE_PAGE); return { ok: true } } catch (error) { return { ok: false, error: error.message } }
  }
  const target = typeof page === 'string' ? page : appUpdate.status().page
  if (!/^https:\/\/github\.com\/roadkwonai\/music-road\/releases\//.test(target || '')) {
    return { ok: false, error: '검증된 GitHub 릴리스 페이지가 없습니다.' }
  }
  return appUpdate.openInBrowser(target)
})

// ── program information ──────────────────────────────────────────────────────
ipcMain.handle('about:info', async () => {
  const settings = await readSettings()
  return {
    version: app.getVersion(),
    store: STORE,
    os: `${OS_NAME} ${os.release()} (${process.arch})`,
    gpu: settings.gpu && settings.gpu.name ? settings.gpu.name : '',
    electron: process.versions.electron
  }
})

ipcMain.handle('about:open', (_e, where) => {
  const site = appUpdate.SITE
  const prefix = appLang === 'en' || appLang === 'ja' ? `/${appLang}` : ''
  const places = {
    site: `${site}${prefix}/?from=app`,
    apps: `${site}${prefix}/apps?from=app`,
    privacy: `${site}${prefix}/privacy-policy`,
    // Feedback is written on the site's board (피드백·요청 제안), where others can see it too.
    feedback: `${site}${prefix}/community/request?from=app`,
    store: STORE_PAGE
  }
  if (where === 'store') {
    try { shell.openExternal(STORE_PAGE); return { ok: true } } catch (error) { return { ok: false, error: error.message } }
  }
  return places[where] ? appUpdate.openInBrowser(places[where]) : { ok: false }
})

// ── notices popup ────────────────────────────────────────────────────────────
// A free app's small notice box: the site's latest notices, in the app's language.
ipcMain.handle('notices:latest', async () => {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 8000)
  try {
    const res = await fetch(`${appUpdate.SITE}/api/notices?lang=${appLang}`, { signal: abort.signal })
    if (!res.ok) return { ok: false }
    const j = await res.json()
    const prefix = appLang === 'en' || appLang === 'ja' ? `/${appLang}` : ''
    return {
      ok: true,
      notices: (j.notices || []).slice(0, 5).map((n) => ({
        id: n.id, title: String(n.title || ''), date: n.date, pinned: Boolean(n.pinned),
        body: String(n.body || '').slice(0, 1200),
        url: `${appUpdate.SITE}${prefix}/notice/${encodeURIComponent(n.id)}?from=app`
      }))
    }
  } catch {
    return { ok: false }
  } finally { clearTimeout(timer) }
})

ipcMain.handle('notices:open', (_e, url) => {
  if (!/^https:\/\/roadkwon\.dev\//.test(String(url))) return { ok: false }
  return appUpdate.openInBrowser(url)
})

// Feedback goes to roadkwon.dev's inquiry box (admin → 문의), the same one the site's
// contact form uses. The reply address is required there.
ipcMain.handle('about:feedback', async (_e, form) => {
  const email = String((form && form.email) || '').trim()
  const message = String((form && form.message) || '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: '답장 받을 이메일 주소를 확인해 주세요.' }
  if (!message) return { ok: false, error: '보낼 내용을 적어 주세요.' }
  const kind = form.kind === 'report' ? 'report' : 'question'
  const first = message.split('\n')[0].slice(0, 80)
  let body = message
  if (form.withSystem) {
    const settings = await readSettings()
    const gpu = settings.gpu && settings.gpu.name ? settings.gpu.name : '-'
    body += `\n\n---\nRoad Music ${app.getVersion()}${STORE ? ' (Microsoft Store)' : ''} · ${appLang}\n` +
      `${OS_NAME} ${os.release()} (${process.arch}) · ${gpu}`
  }
  // The end of app.log, so a crash can be read without asking for the file. The
  // user's home folder is shortened to ~ (it carries the Windows account name).
  if (form.withLog) {
    try {
      const text = await fsp.readFile(path.join(userData(), 'app.log'), 'utf8')
      const tail = text.slice(-12000).split(os.homedir()).join('~')
      body += `\n\n--- app.log (마지막 부분) ---\n${tail.slice(tail.indexOf('\n') + 1)}`
    } catch {
      body += '\n\n--- app.log 를 읽지 못했습니다 ---'
    }
  }
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 15000)
  try {
    const res = await fetch(`${appUpdate.SITE}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, name: 'RoadMusic', kind,
        subject: `[Road Music ${app.getVersion()}] ${first}`.slice(0, 200),
        body: body.slice(0, 19500)
      }),
      signal: abort.signal
    })
    if (res.status === 429) return { ok: false, error: '잠시 뒤에 다시 보내 주세요.' }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return { ok: false, error: j.message || `보내지 못했습니다 (HTTP ${res.status})` }
    }
    log('feedback sent', kind)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: '인터넷 연결을 확인한 뒤 다시 보내 주세요.' }
  } finally { clearTimeout(timer) }
})

// ── system stats ─────────────────────────────────────────────────────────────
// A small live readout: on an 8GB card people want to see whether the run is
// sitting inside VRAM or spilling, and that the GPU is actually working.
let statsTimer = null

async function readStats () {
  const total = os.totalmem()
  const stats = {
    ramUsedGb: Math.round((total - os.freemem()) / 2 ** 30 * 10) / 10,
    ramTotalGb: Math.round(total / 2 ** 30 * 10) / 10,
    busy: Boolean(currentJob)
  }
  try {
    const out = await run(nvidiaSmi || 'nvidia-smi',
      ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'])
    const [used, capacity, load] = out.split(/\n/)[0].split(',').map((value) => Number(value.trim()))
    Object.assign(stats, {
      vramUsedGb: Math.round(used / 1024 * 10) / 10,
      vramTotalGb: Math.round(capacity / 1024 * 10) / 10,
      gpuLoad: load
    })
  } catch { /* no GPU reading; the RAM half still shows */ }
  return stats
}

ipcMain.handle('system:stats', () => readStats())

function watchStats () {
  const tick = async () => {
    if (win && !win.isDestroyed() && win.isVisible()) send('system:stats', await readStats())
    // Poll briskly while a song is being made, and rarely when idle.
    statsTimer = setTimeout(tick, currentJob ? 2000 : 8000)
  }
  clearTimeout(statsTimer)
  tick()
}

// ── window ───────────────────────────────────────────────────────────────────
// Without an application menu the Ctrl+C/V/X/A accelerators are not registered, so
// copy and paste silently do nothing. The bar stays hidden; only the shortcuts matter.
function installEditMenu () {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{
    label: '편집',
    submenu: [
      { role: 'undo', label: '실행 취소' },
      { role: 'redo', label: '다시 실행' },
      { type: 'separator' },
      { role: 'cut', label: '잘라내기' },
      { role: 'copy', label: '복사' },
      { role: 'paste', label: '붙여넣기' },
      { role: 'selectAll', label: '전체 선택' }
    ]
  }]))
}

// Right-clicking a text box is how most people paste; Electron shows no menu of its own.
// ── languages (한국어 · English · 日本語) ──
// The app is written in Korean and translated as it is shown (renderer/i18n-core.js and
// renderer/locales). The window learns the language from here; native dialogs and menus
// are translated here. The first time the app runs the language comes from the
// installer's choice (HKCU\Software\RoadMusic\Language, written by build/installer.nsh),
// else — for a copy used before languages existed — Korean, else the country of the
// PC's time zone, else Windows' own language. A choice in the app wins from then
// on, and is written back to the registry so the next installer opens in it.
const RoadI18n = require('../renderer/i18n-core.js')
const LANGS = ['ko', 'en', 'ja']
let appLang = 'ko'
let mainTr = (text) => text

function useLanguage (lang) {
  appLang = LANGS.includes(lang) ? lang : 'ko'
  let locale = null
  if (appLang !== 'ko') {
    try { locale = require(`../renderer/locales/${appLang}.js`) } catch (error) { log('locale missing', appLang, error.message) }
  }
  mainTr = locale ? RoadI18n.createTranslator(locale) : (text) => text
}

const REG_KEY = 'HKCU\\Software\\RoadMusic'
function registryLanguage () {
  return new Promise((resolve) => {
    execFile('reg', ['query', REG_KEY, '/v', 'Language'], { windowsHide: true }, (error, out) => {
      const m = !error && String(out).match(/Language\s+REG_SZ\s+(\w+)/i)
      resolve(m && LANGS.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : null)
    })
  })
}
function rememberLanguageForInstaller (lang) {
  execFile('reg', ['add', REG_KEY, '/v', 'Language', '/t', 'REG_SZ', '/d', lang, '/f'], { windowsHide: true }, () => {})
}

// The country, from the time zone the PC is set to — the same way roadkwon.dev picks a
// visitor's language (its server cannot see visitors' addresses). Nothing is sent.
function countryLanguage () {
  let zone = ''
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch {}
  if (!zone) return null
  return zone === 'Asia/Seoul' ? 'ko' : zone === 'Asia/Tokyo' ? 'ja' : 'en'
}

function windowsLanguage () {
  const locale = String(app.getLocale() || '').toLowerCase()
  return locale.startsWith('ko') ? 'ko' : locale.startsWith('ja') ? 'ja' : 'en'
}

async function resolveLanguage () {
  const settings = await readSettings()
  if (LANGS.includes(settings.language)) return settings.language
  const usedBefore = Boolean(settings.setupDone || settings.aceInstalled || settings.video || settings.installedAt)
  const lang = await registryLanguage() || (usedBefore ? 'ko' : null) || countryLanguage() || windowsLanguage()
  await writeSettings({ language: lang })
  log('language chosen', lang)
  return lang
}

ipcMain.on('app:language', (event) => { event.returnValue = appLang })
ipcMain.handle('app:set-language', async (_e, lang) => {
  if (renderJobs.size || cliBridge.rendererBusy()) return { ok: false, code: 'BUSY', message: '영상 또는 CLI 화면 작업이 끝난 뒤 언어를 바꾸세요.' }
  if (!LANGS.includes(lang)) return { ok: false }
  await writeSettings({ language: lang })
  rememberLanguageForInstaller(lang)
  useLanguage(lang)
  log('language changed', lang)
  if (win && !win.isDestroyed()) win.webContents.reload()
  return { ok: true }
})

// Native dialogs and menus speak the app's language too.
function translateDialogOptions (options) {
  if (!options || typeof options !== 'object') return options
  const out = { ...options }
  for (const key of ['title', 'message', 'detail', 'buttonLabel', 'checkboxLabel']) if (out[key]) out[key] = mainTr(out[key])
  if (Array.isArray(out.buttons)) out.buttons = out.buttons.map((b) => mainTr(b))
  if (Array.isArray(out.filters)) out.filters = out.filters.map((f) => ({ ...f, name: mainTr(f.name) }))
  return out
}
for (const name of ['showOpenDialog', 'showSaveDialog', 'showMessageBox', 'showOpenDialogSync', 'showSaveDialogSync', 'showMessageBoxSync']) {
  const original = dialog[name].bind(dialog)
  dialog[name] = (first, second) => first instanceof BrowserWindow
    ? original(first, translateDialogOptions(second))
    : original(translateDialogOptions(first))
}
const buildMenu = Menu.buildFromTemplate.bind(Menu)
const translateMenu = (items) => items.map((item) => ({ ...item,
  ...(item.label ? { label: mainTr(item.label) } : {}),
  ...(Array.isArray(item.submenu) ? { submenu: translateMenu(item.submenu) } : {}) }))
Menu.buildFromTemplate = (template) => buildMenu(translateMenu(template))

function installContextMenu (target) {
  target.webContents.on('context-menu', (_event, params) => {
    const flags = params.editFlags
    const items = []
    if (params.isEditable || params.selectionText) {
      items.push(
        { role: 'cut', label: '잘라내기', enabled: params.isEditable && flags.canCut },
        { role: 'copy', label: '복사', enabled: flags.canCopy },
        { role: 'paste', label: '붙여넣기', enabled: params.isEditable && flags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: '전체 선택', enabled: flags.canSelectAll }
      )
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: target })
  })
}

async function createWindow () {
  // Three columns — prompt, songs, video studio — want a wide window; the screen
  // decides how wide.
  const area = screen.getPrimaryDisplay().workAreaSize
  win = new BrowserWindow({
    show: showRequested,
    width: Math.min(1640, area.width),
    height: Math.min(940, area.height),
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0f1115',
    title: 'Road Music',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: !cliService }
  })
  win.setMenuBarVisibility(false)
  win.autoHideMenuBar = true
  installContextMenu(win)
  win.on('close', (event) => {
    if (!renderJobs.size || quittingAfterRender) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['계속 만들기', '취소하고 닫기'], defaultId: 0, cancelId: 0,
      title: '영상을 만드는 중', message: '영상을 만드는 중입니다.',
      detail: '지금 닫으면 영상 만들기가 취소되고, 만들던 파일은 지워집니다.'
    })
    if (choice === 0) event.preventDefault()
  })
  // Without the page no more frames come; the render cannot finish.
  win.webContents.on('render-process-gone', (_e, details) => {
    log('renderer gone', details)
    for (const [id, job] of renderJobs) {
      job.fail(`화면 처리가 멈췄습니다 (${details.reason})`)
      job.cancel().catch(() => {})
      renderJobs.delete(id)
    }
    keepAwakeWhileRendering()
  })
  // Reserve restored folders before renderer startup can sweep unfinished songs.
  await restoreQueue().catch((error) => log('queue restore failed', error.message))
  // Wait for the page: the restored queue is announced over IPC.
  // Every load of the page — the first, and the reload a language change makes — gets
  // the gauges, the queue and the song being made at once; waiting for the next tick
  // left the VRAM/RAM gauges blank for up to 8 s after switching language.
  win.webContents.on('did-finish-load', () => {
    watchStats()
    sendQueue()
    pump()
    if (currentJob) send('job:started', { jobId: currentJob.jobId, title: currentJob.title })
  })
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
}

// ── install count ────────────────────────────────────────────────────────────
// Once per launch the app tells roadkwon.dev it was started, so the admin page there
// ("설치 현황") can count installs of "RoadMusic". What is sent: a random id made on
// the first run, the version and the OS name — nothing about the person or their
// songs (install-notice.txt says so). A failure is only logged; a dev checkout never
// reports.
const INSTALL_PING = 'https://roadkwon.dev/api/installs/ping'

async function reportInstall () {
  if (!app.isPackaged) return
  try {
    let { installId } = await readSettings()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(installId || '')) {
      installId = crypto.randomUUID()
      await writeSettings({ installId })
    }
    const response = await fetch(INSTALL_PING, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The time zone tells roadkwon.dev the country (its server cannot see addresses); it
      // is the only place-related thing sent.
      body: JSON.stringify({ product: 'RoadMusic', installId, version: app.getVersion(), os: `${process.platform} ${os.release()}`,
        tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { return '' } })() }),
      signal: AbortSignal.timeout(10000)
    })
    log('install ping', response.status)
  } catch (error) {
    log('install ping failed', error.message)
  }
}

app.whenReady().then(async () => {
  appUpdate.init({ app, shell, log, publish: send, isBusy: updateBusy })
  useLanguage(await resolveLanguage().catch(() => 'ko'))
  installEditMenu()
  await createWindow()
  cliBridge.configure({
    webContents: () => win.webContents,
    language: () => appLang,
    status: () => ({ visible: win.isVisible(), busy: Boolean(currentJob), waiting: queue.length,
      installing, rendering: renderJobs.size, recording: recordingActive, transfers: fileTransferTasks,
      update: appUpdate.status(), root: app.getAppPath(), mode: appUpdate.status().mode, dataDir: userData(), queue: queueState() }),
    show: () => { win.show(); win.focus() },
    quit: () => { if (worker) stopWorker(); app.quit() },
    roots: async () => ({ songs: await ensureSongsDir(), recordings: recordingsDir(), assets: assetsDir() }),
    generate: async (payload) => {
      const requests = require('./cli-generation').prepareRequests(payload)
      const jobs = []
      for (const request of requests) {
        const result = await startGeneration(request)
        if (!result.ok) return { ...result, jobs }
        jobs.push(result)
      }
      return requests.length === 1 ? jobs[0] : { ok: true, jobs }
    },
    renderer: async (command, params, token, output) => {
      if (win.webContents.isLoadingMainFrame()) await new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
      return win.webContents.executeJavaScript(`Promise.resolve(window.RoadAppReady).then(() => Promise.resolve(window.RoadStudioReady)).then(() => window.RoadCLI.call(${JSON.stringify(command)}, ${JSON.stringify(params)}, ${JSON.stringify(token)}, ${JSON.stringify(output)}))`)
    },
    before: async (request, entry) => {
      const blockedByUpdate = new Set(['song:generate', 'song:resume', 'song:render', 'setup:run', 'engines:install',
        'song:export', 'album:export', 'settings:move-models', 'settings:move-songs', 'video:render',
        'recording:start', 'recording:stop'])
      if (updateBlocksWork() && blockedByUpdate.has(request.command)) {
        throw Object.assign(new Error('업데이트 설치를 준비하는 중에는 새 작업을 시작할 수 없습니다.'), { code: 'BUSY' })
      }
      if (entry.renderer && request.command === 'video:render' && !request.output) {
        throw Object.assign(new Error('video:render에는 --output 파일이 필요합니다.'), { code: 'INVALID_ARGUMENT' })
      }
      if (request.command === 'song:srt' && request.params.save && !request.output) {
        throw Object.assign(new Error('SRT 저장에는 --output 파일이 필요합니다.'), { code: 'INVALID_ARGUMENT' })
      }
      if (request.command === 'settings:set') {
        request.params.patch = { ...(await readSettings()), ...request.params.patch }
        if (request.params.patch.dropWav && !request.confirm) throw Object.assign(new Error('WAV 자동 삭제에는 --confirm이 필요합니다.'), { code: 'CONFIRM_REQUIRED' })
        entry.args = [request.params.patch]
      }
      if (request.command === 'video:save-settings') {
        const configured = await cliBridge.dispatch({ command: 'video:configure', params: { video: request.params.video } })
        if (!configured.ok) throw Object.assign(new Error(configured.error || configured.message || '영상 설정을 적용하지 못했습니다.'), { code: 'INVALID_ARGUMENT' })
        entry.args = [configured.video]
      }
    },
    after: async (request, result) => {
      if (request.finalOutput && result && result.ok !== false) await rememberExportDir(path.dirname(request.finalOutput))
      if (!result || result.ok !== false) {
        if (/^(projects:|songs:|song:rename|song:delete|song:background|presets:)/.test(request.command)) {
          await win.webContents.executeJavaScript('Promise.resolve(window.RoadAppReady).then(() => refresh())').catch(error => log('cli UI refresh', error.message))
        }
      }
    },
    jobResult: async (jobId) => {
      const known = jobResults.get(jobId)
      if (known && !known.ok) return known
      const error = failed.find(job => job.jobId === jobId)
      if (error) return { ok: false, jobId, message: error.message }
      if ((currentJob && currentJob.jobId === jobId) || queue.some(job => job.jobId === jobId)) return null
      for (const project of await listProjects()) {
        const dir = await projectDir(project.name)
        for (const name of await fsp.readdir(dir)) {
          try {
            const meta = JSON.parse(await fsp.readFile(path.join(dir, name, 'meta.json'), 'utf8'))
            if (meta.jobId === jobId && (meta.scoreOnly || await hasAudio(path.join(dir, name)))) {
              const location = path.join(dir, name)
              const files = await audioFiles(location)
              const audio = files.wav || files.mp3 || null
              return { ok: true, song: { ...meta, dir: location, audio, audioUrl: audio ? pathToFileURL(audio).href : null } }
            }
          } catch { /* non-song files are expected */ }
        }
      }
      if (!currentJob || currentJob.jobId !== jobId) {
        if (!queue.some(job => job.jobId === jobId)) throw Object.assign(new Error('작업 ID를 찾지 못했습니다.'), { code: 'JOB_NOT_FOUND' })
      }
      return null
    }
  })
  await cliBridge.listen().catch((error) => log('cli service failed', error.message))
  appUpdate.start()
  if (!cliService) reportInstall()
})
app.on('will-quit', () => { appUpdate.stop(); cliBridge.close().catch(() => {}) })
app.on('before-quit', () => cliBridge.notifyStopping())
app.on('window-all-closed', () => {
  if (worker) { try { worker.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n') } catch {} worker.kill() }
  // app.quit() waits for any render to be cleaned up (before-quit above). The Mac quits
  // too: nothing reopens the one window from the Dock.
  app.quit()
})
