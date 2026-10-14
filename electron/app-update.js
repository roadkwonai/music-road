'use strict'

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { pipeline } = require('stream/promises')
const { Readable, Transform } = require('stream')

const REPOSITORY = 'roadkwonai/music-road'
const API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`
const RELEASE_ROOT = `https://github.com/${REPOSITORY}/releases/`
const SITE = 'https://roadkwon.dev'
const PAGE = `${SITE}/apps/roadmusic`
const MAX_ASSET_BYTES = 4 * 1024 * 1024 * 1024
const MAX_TEXT_BYTES = 1024 * 1024
const REQUEST_MS = 30_000
const DOWNLOAD_MS = 20 * 60_000
const POLL_MS = 15 * 60_000
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

let opt = { app: null, shell: null, log: () => {}, publish: () => {}, isBusy: () => false }
let state = blank()
let checking = null
let downloading = null
let installing = null
let timer = null
let persistChain = Promise.resolve()
let lastProgressSave = 0

function current () { return String(opt.app?.getVersion?.() || '') }
function sourceRoot () { const candidate = opt.app?.getAppPath?.() || path.resolve(__dirname, '..'); return typeof candidate === 'string' ? path.resolve(candidate) : null }
function mode () {
  if (process.platform === 'win32') return 'unsupported'
  if (process.platform === 'darwin' && opt.app?.isPackaged) return 'mac-app'
  const root = sourceRoot()
  return root && fs.existsSync(path.join(root, '.git')) ? 'source' : 'unsupported'
}
function target () { return { root: sourceRoot(), bundle: appBundle(), platform: process.platform, arch: process.arch, installMode: mode() } }
function blank (status = 'idle', extra = {}) { return { current: current(), version: null, available: false, status, notes: '', page: null, asset: null, progress: null, error: null, mode: mode(), installable: false, reason: null, target: target(), ...extra } }
function updatesDir () { const dir = opt.app?.getPath?.('userData'); return dir ? path.join(dir, 'updates') : null }
function statePath () { const dir = updatesDir(); return dir && path.join(dir, 'update-state.json') }
function status () {
  let installerResult = null
  try {
    const result = JSON.parse(fs.readFileSync(path.join(updatesDir(), 'installer-result.json'), 'utf8'))
    if (result && typeof result.ok === 'boolean') installerResult = result
  } catch {}
  return JSON.parse(JSON.stringify({ ...state, current: current(), mode: mode(), target: target(), installerResult }))
}
function publish () { const snapshot = status(); try { opt.publish('update:status', snapshot) } catch {}; return snapshot }
function persist (force = false) {
  if (!force && state.status === 'downloading' && Date.now() - lastProgressSave < 1000) return persistChain
  lastProgressSave = Date.now()
  const write = async () => {
    const target = statePath(); if (!target) return
    await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    const temp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
    try { await fsp.writeFile(temp, JSON.stringify(state), { mode: 0o600 }); await fsp.rename(temp, target) } finally { await fsp.rm(temp, { force: true }).catch(() => {}) }
  }
  persistChain = persistChain.then(write, write)
  return persistChain
}
function setState (next) { state = { ...blank(next.status || state.status), ...state, ...next, current: current(), mode: mode() }; persist(next.status !== 'downloading').catch(() => {}); return publish() }
function init (next) {
  opt = { ...opt, ...(next || {}) }
  try { const saved = JSON.parse(fs.readFileSync(statePath(), 'utf8')); if (saved?.status === 'downloaded' && saved.asset?.path && fs.existsSync(saved.asset.path)) state = { ...blank('downloaded'), ...saved } } catch {}
  try {
    const result = JSON.parse(fs.readFileSync(path.join(updatesDir(), 'installer-result.json'), 'utf8'))
    if (result?.ok === false) state = { ...blank('idle'), version: result.version || state.version, reason: '이전 설치 시도가 실패했습니다. 다시 확인하거나 재시도할 수 있습니다.' }
  } catch {}
  state = { ...blank(state.status), ...state, current: current(), mode: mode() }
  return publish()
}

function safeVersion (value) { return VERSION.test(String(value || '')) }
function compare (a, b) { if (!safeVersion(a) || !safeVersion(b)) return 0; const aa = String(a).split('.').map(Number); const bb = String(b).split('.').map(Number); return aa[0] - bb[0] || aa[1] - bb[1] || aa[2] - bb[2] }
function assetName (version) { return mode() === 'mac-app' ? `RoadMusic-${version}-mac-${process.arch}.dmg` : `RoadMusic-${version}-cli.zip` }
function isReleaseUrl (value) { try { const u = new URL(value); return u.protocol === 'https:' && u.href.startsWith(RELEASE_ROOT) } catch { return false } }
function isDownloadUrl (value, tag, name) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname === 'github.com' && u.pathname === `/${REPOSITORY}/releases/download/${tag}/${name}` } catch { return false } }
function isRedirectUrl (value) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && /^(github-releases|release-assets|objects)\.githubusercontent\.com$/.test(u.hostname) } catch { return false } }
function isAllowedPage (value) { try { const u = new URL(value); return isReleaseUrl(value) || (u.protocol === 'https:' && u.hostname === 'roadkwon.dev') } catch { return false } }
async function response (url, timeout = REQUEST_MS, redirects = 0) {
  const controller = new AbortController(); const stop = setTimeout(() => controller.abort(), timeout)
  try {
    const result = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Road-Music-Updater' }, redirect: 'manual' })
    if ([301, 302, 303, 307, 308].includes(result.status)) { if (redirects >= 5) throw new Error('업데이트 다운로드 리디렉션이 너무 많습니다.'); const next = new URL(result.headers.get('location'), url).toString(); if (!isRedirectUrl(next)) throw new Error('허용되지 않은 업데이트 다운로드 경로입니다.'); return response(next, timeout, redirects + 1) }
    return result
  } catch (error) { if (error?.name === 'AbortError') throw new Error('업데이트 서버 응답 시간이 초과되었습니다.'); throw error } finally { clearTimeout(stop) }
}
function normalizeRelease (release) {
  const tag = String(release?.tag_name || ''); const version = tag.startsWith('v') ? tag.slice(1) : ''
  if (release?.draft || release?.prerelease || !safeVersion(version)) return null
  const page = String(release?.html_url || ''); if (!isReleaseUrl(page) || page !== `${RELEASE_ROOT}tag/${tag}`) return null
  const assets = Array.isArray(release.assets) ? release.assets : []
  const asset = assets.find(item => item?.name === assetName(version) && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= MAX_ASSET_BYTES && isDownloadUrl(item.browser_download_url, tag, item.name))
  const sums = assets.find(item => item?.name === 'SHA256SUMS.txt' && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= MAX_TEXT_BYTES && isDownloadUrl(item.browser_download_url, tag, item.name))
  return { version, notes: String(release.body || ''), page, asset: asset || null, sums: sums || null }
}
async function readBody (res, limit, timeout = REQUEST_MS) {
  if (!res.body) throw new Error('업데이트 서버 응답 본문이 없습니다.')
  const reader = res.body.getReader(); const chunks = []; let size = 0
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; reader.cancel().catch(() => {}) }, timeout)
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) throw new Error('업데이트 서버 응답이 너무 큽니다.')
      chunks.push(part.value)
    }
    if (timedOut) throw new Error('업데이트 서버 응답 시간이 초과되었습니다.')
    return Buffer.concat(chunks).toString('utf8')
  } finally { clearTimeout(timer); reader.releaseLock() }
}
async function latest () { const res = await response(API); if (res.status === 404) return null; if (!res.ok) throw new Error(`업데이트 서버가 HTTP ${res.status}을 반환했습니다.`); return normalizeRelease(JSON.parse(await readBody(res, MAX_TEXT_BYTES))) }
async function check () {
  if (checking) return checking
  if (state.status === 'downloading' || state.status === 'installing') return status()
  checking = (async () => {
    const now = current(); if (!safeVersion(now)) return setState(blank('error', { error: '현재 앱 버전 형식이 올바르지 않습니다.' }))
    const previous = state
    setState(blank('checking'))
    try {
      const release = await latest(); if (!release) return setState(blank('no-release', { reason: '안정 릴리스가 아직 없습니다.' })); if (compare(release.version, now) <= 0) return setState(blank('idle', { version: release.version, page: release.page, notes: release.notes }))
      const result = { current: now, version: release.version, notes: release.notes, page: release.page, asset: release.asset && { name: release.asset.name, size: release.asset.size, url: release.asset.browser_download_url, sums: release.sums?.browser_download_url }, available: Boolean(release.asset && release.sums), status: release.asset && release.sums ? 'available' : 'unsupported', installable: Boolean(release.asset && release.sums), reason: release.asset && release.sums ? null : `이 환경용 ${assetName(release.version)} 자산 또는 SHA256SUMS.txt가 없습니다.` }
      if (mode() === 'unsupported') Object.assign(result, { available: false, status: 'unsupported', installable: false, reason: '이 설치 방식은 자동 업데이트를 지원하지 않습니다. GitHub 릴리스에서 새 설치본을 받으세요.' })
      if (mode() === 'mac-app' && appBundle()?.startsWith('/Volumes/')) Object.assign(result, { available: false, status: 'unsupported', installable: false, reason: '마운트된 DMG에서 실행 중입니다. 앱을 /Applications로 복사한 뒤 다시 실행하세요.' })
      if (previous.status === 'downloaded' && previous.version === release.version && previous.asset?.path && fs.existsSync(previous.asset.path)) Object.assign(result, { status: 'downloaded', available: true, installable: true, asset: { ...result.asset, path: previous.asset.path, sha256: previous.asset.sha256 } })
      return setState(result)
    } catch (error) { return setState(blank('error', { error: `업데이트 확인 네트워크 오류: ${String(error.message || error)}`, reason: '네트워크 연결을 확인한 뒤 다시 시도하세요.' })) }
  })()
  try { return await checking } finally { checking = null }
}
function parseChecksum (text, name) { for (const line of String(text).split(/\r?\n/)) { const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/); if (match && match[2] === name) return match[1].toLowerCase() } return null }
async function readText (url) { const res = await response(url); if (!res.ok) throw new Error(`체크섬 다운로드 실패(HTTP ${res.status})`); return readBody(res, MAX_TEXT_BYTES) }
async function downloadFile (url, destination, expectedSize, expectedHash) {
  const res = await response(url, DOWNLOAD_MS); if (!res.ok || !res.body) throw new Error(`업데이트 다운로드 실패(HTTP ${res.status})`); const length = Number(res.headers.get('content-length') || 0); if (length && (length !== expectedSize || length > MAX_ASSET_BYTES)) throw new Error('업데이트 파일 크기가 릴리스 정보와 다릅니다.')
  await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 }); const temp = `${destination}.${process.pid}.part`; const hash = crypto.createHash('sha256'); let bytes = 0
  const meter = new Transform({ transform (chunk, _encoding, done) { bytes += chunk.length; if (bytes > expectedSize || bytes > MAX_ASSET_BYTES) return done(new Error('업데이트 파일이 예상보다 큽니다.')); hash.update(chunk); setState({ status: 'downloading', progress: { received: bytes, total: expectedSize } }); done(null, chunk) } })
  const input = Readable.fromWeb(res.body); const timer = setTimeout(() => input.destroy(new Error('업데이트 다운로드 시간이 초과되었습니다.')), DOWNLOAD_MS)
  try { await pipeline(input, meter, fs.createWriteStream(temp, { flags: 'wx', mode: 0o600 })); if (bytes !== expectedSize || hash.digest('hex') !== expectedHash) throw new Error('업데이트 파일 무결성 검증에 실패했습니다.'); await fsp.rename(temp, destination) } finally { clearTimeout(timer); await fsp.rm(temp, { force: true }).catch(() => {}) }
}
async function download () {
  if (downloading) return downloading
  downloading = (async () => {
    if (state.status === 'downloaded' && state.asset?.path && fs.existsSync(state.asset.path)) return status()
    if (state.status !== 'available' || !state.asset?.url || !state.asset?.sums) return setState({ status: 'error', error: '먼저 설치 가능한 업데이트를 확인하세요.' })
    const asset = { ...state.asset }; setState({ status: 'downloading', progress: { received: 0, total: asset.size }, error: null })
    try { const expectedHash = parseChecksum(await readText(asset.sums), asset.name); if (!expectedHash) throw new Error('SHA256SUMS.txt에 설치 파일 체크섬이 없습니다.'); const destination = path.join(updatesDir(), `${asset.name}.download`); await downloadFile(asset.url, destination, asset.size, expectedHash); return setState({ status: 'downloaded', progress: { received: asset.size, total: asset.size }, asset: { ...asset, path: destination, sha256: expectedHash }, installable: true }) } catch (error) { return setState({ status: 'error', error: String(error.message || error), progress: null }) }
  })()
  try { return await downloading } finally { downloading = null }
}
function appBundle () { const start = opt.app?.getAppPath?.(); if (!start) return null; let cursor = path.resolve(start); while (cursor !== path.dirname(cursor)) { if (cursor.endsWith('.app')) return cursor; cursor = path.dirname(cursor) } return null }
function nodeExecutable () { return process.env.ROAD_MUSIC_NODE || process.env.npm_node_execpath || process.execPath }
async function verifiedFile (asset) {
  const digest = crypto.createHash('sha256'); let bytes = 0
  for await (const chunk of fs.createReadStream(asset.path)) { bytes += chunk.length; digest.update(chunk) }
  return bytes === asset.size && digest.digest('hex') === asset.sha256
}
function spawnHelper (file, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeExecutable(), [file, JSON.stringify(payload)], { detached: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
}
async function install () {
  if (installing) return installing
  if (state.status === 'installing') return status()
  installing = (async () => {
    if (opt.isBusy?.()) return setState({ status: 'error', error: '진행 중인 작업이 있어 업데이트를 설치할 수 없습니다.' })
    if (state.status !== 'downloaded' || !state.asset?.path || !fs.existsSync(state.asset.path)) return setState({ status: 'error', error: '검증된 다운로드 파일이 없습니다.' })
    try {
      if (!(await verifiedFile(state.asset))) return setState({ status: 'error', error: '다운로드 파일이 변경되었거나 손상되었습니다. 다시 다운로드하세요.' })
      const target = mode() === 'mac-app' ? path.dirname(appBundle() || '') : sourceRoot()
      await fsp.access(target, fs.constants.W_OK)
      const helper = path.join(updatesDir(), 'update-installer.js')
      await fsp.mkdir(updatesDir(), { recursive: true, mode: 0o700 })
      await fsp.copyFile(path.join(__dirname, 'update-installer.js'), helper)
      await fsp.chmod(helper, 0o700)
      if (opt.isBusy?.()) return setState({ status: 'error', error: '업데이트 준비 중 작업이 시작되어 설치를 취소했습니다.' })
      const payload = {
        mode: mode(), pid: process.pid, dmg: state.asset.path, version: state.version,
        bundle: appBundle(), root: sourceRoot(), userData: opt.app?.getPath?.('userData'),
        dataDir: process.env.ROADMUSIC_DATA_DIR || null, service: process.argv.includes('--roadmusic-service'),
        execPath: process.execPath, node: nodeExecutable()
      }
      await spawnHelper(helper, payload)
      setState({ status: 'installing', error: null })
      await persist(true)
      setTimeout(() => opt.app?.quit?.(), 1000).unref?.()
      return status()
    } catch (error) { return setState({ status: 'error', error: `설치 도우미를 시작하지 못했습니다: ${String(error.message || error)}` }) }
  })()
  try { return await installing } finally { installing = null }
}
function start () { if (!timer) { check().catch(() => {}); timer = setInterval(() => check().catch(() => {}), POLL_MS); timer.unref?.() } return status() }
function stop () { if (timer) clearInterval(timer); timer = null }
function pageFor (page) { return isReleaseUrl(page) ? page : PAGE }
function openInBrowser (url) { try { if (!isAllowedPage(url)) return { ok: false, error: '허용되지 않은 업데이트 페이지입니다.' }; opt.shell?.openExternal(url); return { ok: true } } catch (error) { return { ok: false, error: String(error.message || error) } } }

module.exports = { init, check, status, download, install, start, stop, latest, pageFor, openInBrowser, compare, safeVersion, PRODUCT: 'ROADMUSIC', SITE, API }
