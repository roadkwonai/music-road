'use strict'

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { run } = require('../electron/update-installer')

const REPOSITORY = 'roadkwonai/music-road'
const API = `https://api.github.com/repos/${REPOSITORY}/releases`
const RELEASES = `https://github.com/${REPOSITORY}/releases/`
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024 * 1024
const MAX_TEXT_BYTES = 1024 * 1024
const REQUEST_MS = 30_000
const DOWNLOAD_MS = 20 * 60_000
const MAX_RELEASE_PAGES = 20
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const CURRENT = require('./package.json').version

function fail (code, message) { const error = new Error(message); error.code = code; throw error }
function safeVersion (value) { return VERSION.test(String(value || '')) }
function compare (a, b) {
  if (!safeVersion(a) || !safeVersion(b)) return 0
  const aa = String(a).split('.').map(Number); const bb = String(b).split('.').map(Number)
  return aa[0] - bb[0] || aa[1] - bb[1] || aa[2] - bb[2]
}
function assertParams (params, allowed) {
  if (params === undefined) return {}
  if (!params || Array.isArray(params) || Object.getPrototypeOf(params) !== Object.prototype) fail('INVALID_ARGUMENT', '업데이트 매개변수는 JSON 객체여야 합니다.')
  for (const key of Object.keys(params)) if (!allowed.includes(key)) fail('INVALID_ARGUMENT', `지원하지 않는 업데이트 매개변수: ${key}`)
  return params
}
function cliHome () { return path.resolve(process.env.ROADMUSIC_CLI_HOME || path.join(os.homedir(), '.local', 'share', 'road-music', 'cli')) }
async function recordComponent (result, state, context = {}) {
  if (!context.dataDir) return result
  try {
    const { recordProduction } = require('../electron/production-history')
    await recordProduction('component-record', {
      componentId: state.componentId || 'road-music-cli:current', kind: 'cli', name: state.name || 'Road Music CLI',
      installedVersion: state.installedVersion,
      ...(state.latestVersion ? { latestVersion: state.latestVersion } : {}),
      checkStatus: state.status,
      ...(state.sourceUrl ? { sourceUrl: state.sourceUrl } : {}),
      checkedAt: Date.now()
    }, { dataDir: path.resolve(context.dataDir), ...(context.recordProduction ? { execute: context.recordProduction } : {}) })
    return result
  } catch (error) {
    return { ...result, trackingWarning: `버전 기록 저장 실패: ${String(error.message || error)}` }
  }
}
function releaseUrl (version) { return `${RELEASES}tag/cli-v${version}` }
function assetName (version) { return `RoadMusic-CLI-${version}.zip` }
function isReleaseUrl (value, version) { return value === releaseUrl(version) }
function isDownloadUrl (value, version, name) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.hostname === 'github.com' && url.pathname === `/${REPOSITORY}/releases/download/cli-v${version}/${name}`
  } catch { return false }
}
function isAllowedRedirect (value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && /^(github-releases|release-assets|objects)\.githubusercontent\.com$/.test(url.hostname)
  } catch { return false }
}
async function request (url, timeout = REQUEST_MS, redirects = 0, redirectOk = false) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Road-Music-CLI-Updater' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!redirectOk || redirects >= 5 || !isAllowedRedirect(location)) fail('UPDATE_NETWORK', '허용되지 않은 업데이트 다운로드 리디렉션입니다.')
      return request(location, timeout, redirects + 1, true)
    }
    return response
  } catch (error) {
    if (error?.code) throw error
    fail('UPDATE_NETWORK', `업데이트 네트워크 오류: ${String(error.message || error)}`)
  } finally { clearTimeout(timer) }
}
async function text (response, limit = MAX_TEXT_BYTES, timeout = REQUEST_MS) {
  if (!response.body) fail('UPDATE_NETWORK', '업데이트 서버 응답 본문이 없습니다.')
  const reader = response.body.getReader(); const chunks = []; let bytes = 0
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; reader.cancel().catch(() => {}) }, timeout)
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > limit) fail('UPDATE_NETWORK', '업데이트 서버 응답이 너무 큽니다.')
      chunks.push(part.value)
    }
    if (timedOut) fail('UPDATE_NETWORK', '업데이트 서버 응답 시간이 초과되었습니다.')
    return Buffer.concat(chunks).toString('utf8')
  } finally { clearTimeout(timer); reader.releaseLock() }
}
function normalizeRelease (release) {
  const match = /^cli-v(\d+\.\d+\.\d+)$/.exec(String(release?.tag_name || ''))
  if (!match || release?.draft || release?.prerelease || !safeVersion(match[1])) return null
  const version = match[1]
  if (!isReleaseUrl(release.html_url, version)) return null
  const assets = Array.isArray(release.assets) ? release.assets : []
  const name = assetName(version)
  const asset = assets.find(item => item?.name === name && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= MAX_ARCHIVE_BYTES && isDownloadUrl(item.browser_download_url, version, name))
  const sums = assets.find(item => item?.name === 'SHA256SUMS.txt' && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= MAX_TEXT_BYTES && isDownloadUrl(item.browser_download_url, version, 'SHA256SUMS.txt'))
  if (!asset || !sums) return null
  return { version, releaseUrl: release.html_url, notes: String(release.body || ''), asset: { name, size: asset.size, url: asset.browser_download_url, sumsUrl: sums.browser_download_url } }
}
async function latest () {
  const deadline = Date.now() + REQUEST_MS; const candidates = []
  for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) fail('UPDATE_NETWORK', 'CLI 업데이트 릴리스 목록 확인 시간이 초과되었습니다.')
    const response = await request(page === 1 ? API : `${API}?page=${page}&per_page=30`, remaining)
    if (!response.ok) fail('UPDATE_NETWORK', `업데이트 서버가 HTTP ${response.status}을 반환했습니다.`)
    let releases
    try { releases = JSON.parse(await text(response, MAX_TEXT_BYTES, remaining)) } catch (error) { if (error?.code) throw error; fail('UPDATE_NETWORK', '업데이트 릴리스 목록 형식이 올바르지 않습니다.') }
    if (!Array.isArray(releases)) fail('UPDATE_NETWORK', '업데이트 릴리스 목록 형식이 올바르지 않습니다.')
    candidates.push(...releases.map(normalizeRelease).filter(Boolean))
    if (releases.length < 30) return candidates.sort((a, b) => compare(b.version, a.version))[0] || null
  }
  fail('UPDATE_NETWORK', 'CLI 업데이트 릴리스 목록 페이지 한도에 도달했습니다. 최신 버전을 확인할 수 없습니다.')
}
async function check (params = {}, context = {}) {
  assertParams(params, [])
  const release = await latest()
  if (!release) return recordComponent({ current: CURRENT, available: false, version: null, releaseUrl: null, notes: '', asset: null, installable: false }, { installedVersion: CURRENT, status: 'up-to-date' }, context)
  const available = compare(release.version, CURRENT) > 0
  return recordComponent({ current: CURRENT, available, version: release.version, releaseUrl: release.releaseUrl, notes: release.notes, asset: release.asset, installable: available }, { installedVersion: CURRENT, latestVersion: release.version, status: available ? 'update-available' : 'up-to-date', sourceUrl: release.releaseUrl }, context)
}
function parseChecksum (value, name) {
  for (const line of String(value).split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line)
    if (match && match[2] === name) return match[1].toLowerCase()
  }
  return null
}
async function releaseChecksum (asset) {
  const sums = await request(asset.sumsUrl, REQUEST_MS, 0, true)
  if (!sums.ok) fail('UPDATE_NETWORK', `체크섬 다운로드 실패(HTTP ${sums.status})`)
  const digest = parseChecksum(await text(sums), asset.name)
  if (!digest) fail('UPDATE_VERIFY', 'SHA256SUMS.txt에 CLI 설치 파일 체크섬이 없습니다.')
  return digest
}
async function download (asset, destination) {
  const digest = await releaseChecksum(asset)
  const response = await request(asset.url, DOWNLOAD_MS, 0, true)
  if (!response.ok || !response.body) fail('UPDATE_NETWORK', `CLI 업데이트 다운로드 실패(HTTP ${response.status})`)
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength && (contentLength !== asset.size || contentLength > MAX_ARCHIVE_BYTES)) fail('UPDATE_VERIFY', 'CLI 업데이트 파일 크기가 릴리스 정보와 다릅니다.')
  const stream = response.body.getReader(); const file = await fsp.open(destination, 'wx', 0o600); const hash = crypto.createHash('sha256'); let bytes = 0
  const timeout = setTimeout(() => stream.cancel().catch(() => {}), DOWNLOAD_MS)
  try {
    while (true) {
      const part = await stream.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > asset.size || bytes > MAX_ARCHIVE_BYTES) fail('UPDATE_VERIFY', 'CLI 업데이트 파일이 예상보다 큽니다.')
      hash.update(part.value); await file.write(part.value)
    }
  } finally { clearTimeout(timeout); stream.releaseLock(); await file.close() }
  if (bytes !== asset.size || hash.digest('hex') !== digest) fail('UPDATE_VERIFY', 'CLI 업데이트 파일 무결성 검증에 실패했습니다.')
  return digest
}
function unsafeEntry (entry) {
  return !entry || entry.includes('\\') || entry.startsWith('/') || entry.split('/').some(part => part === '..')
}
async function inspectArchive (archive, version) {
  let names; let listing
  try {
    names = await run('/usr/bin/unzip', ['-Z1', archive], { timeoutMs: REQUEST_MS, maxOutputBytes: 16 * 1024 * 1024 })
    listing = await run('/usr/bin/zipinfo', ['-l', archive], { timeoutMs: REQUEST_MS, maxOutputBytes: 16 * 1024 * 1024 })
  } catch (error) { fail('UPDATE_VERIFY', `이 운영체제에서 안전한 ZIP 검증 도구를 실행할 수 없습니다: ${String(error.message || error)}`) }
  const root = `RoadMusic-CLI-${version}`
  const entries = names.split(/\r?\n/).filter(Boolean)
  if (!entries.length || entries.some(unsafeEntry) || entries.some(name => name !== root && !name.startsWith(`${root}/`))) fail('UPDATE_VERIFY', '안전하지 않은 CLI ZIP 경로 또는 최상위 폴더입니다.')
  if (listing.split(/\r?\n/).some(line => /^l/.test(line))) fail('UPDATE_VERIFY', '심볼릭 링크가 포함된 CLI ZIP은 설치할 수 없습니다.')
}
async function extract (archive, stage, version) {
  await inspectArchive(archive, version)
  try { await run('/usr/bin/unzip', ['-q', archive, '-d', stage], { timeoutMs: REQUEST_MS }) } catch { fail('UPDATE_VERIFY', 'CLI ZIP 압축 해제에 실패했습니다.') }
  return path.join(stage, `RoadMusic-CLI-${version}`)
}
async function command (file, args, options = {}) {
  try { return await run(file, args, options) } catch (error) { fail('UPDATE_VERIFY', `${path.basename(file)} ${args[0] || ''} 검증에 실패했습니다: ${String(error.message || error)}`) }
}
function nodeExecutable () { return process.env.ROAD_MUSIC_NODE || process.env.npm_node_execpath || process.execPath }
async function verifyKit (root, version, installDependencies = true) {
  let cli
  try { cli = JSON.parse(await fsp.readFile(path.join(root, 'cli', 'package.json'), 'utf8')) } catch { fail('UPDATE_VERIFY', '추출한 CLI에 cli/package.json이 없습니다.') }
  if (cli?.name !== 'road-music-cli' || cli?.private !== true || cli?.version !== version) fail('UPDATE_VERIFY', '추출한 CLI 버전 정보가 릴리스와 일치하지 않습니다.')
  let app
  try { app = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8')) } catch { fail('UPDATE_VERIFY', '추출한 CLI에 package.json이 없습니다.') }
  if (!safeVersion(app?.version)) fail('UPDATE_VERIFY', '추출한 CLI의 앱 버전 정보가 올바르지 않습니다.')
  if (installDependencies) await command('npm', ['ci', '--include=dev'], { cwd: root, timeoutMs: DOWNLOAD_MS })
  const cliPath = path.join(root, 'cli', 'road-music.js')
  const result = await command(nodeExecutable(), [cliPath, '--version'], { cwd: root, timeoutMs: REQUEST_MS, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  let output
  try { output = JSON.parse(result) } catch { fail('UPDATE_VERIFY', '새 CLI 버전 확인 응답이 JSON이 아닙니다.') }
  if (output?.result?.cliVersion !== version || output.result.appVersion !== app.version) fail('UPDATE_VERIFY', '새 CLI 버전 확인 결과가 설치 대상과 일치하지 않습니다.')
  return { cliPath, cliVersion: version, appVersion: app.version }
}
async function existingKit (target, version, asset) {
  let marker
  try { marker = JSON.parse(await fsp.readFile(path.join(target, '.road-music-cli-install.json'), 'utf8')) } catch { fail('UPDATE_VERIFY', '기존 CLI 설치 완료 표식이 없어 재사용할 수 없습니다.') }
  if (marker?.cliVersion !== version || !safeVersion(marker.appVersion)) fail('UPDATE_VERIFY', '기존 CLI 설치 완료 표식이 올바르지 않습니다.')
  if (!/^[a-f0-9]{64}$/.test(marker.archiveSha256 || '') || marker.archiveSha256 !== await releaseChecksum(asset)) fail('UPDATE_VERIFY', '기존 CLI의 배포 체크섬이 현재 Release와 다릅니다. 기존 폴더를 보존하고 targetDir에 새 경로를 지정하세요.')
  const verified = await verifyKit(target, version, false)
  return { ...verified, cliPath: path.join(target, 'cli', 'road-music.js') }
}
function gitRoot (start) {
  let cursor = path.resolve(start)
  while (true) {
    if (fs.existsSync(path.join(cursor, '.git'))) return cursor
    const parent = path.dirname(cursor)
    if (parent === cursor) return null
    cursor = parent
  }
}
function inside (parent, child) { const relative = path.relative(parent, child); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) }
async function canonicalFuturePath (target) {
  let cursor = target; const tail = []
  while (true) {
    try { return path.join(await fsp.realpath(cursor), ...tail) } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const parent = path.dirname(cursor)
      if (parent === cursor) return target
      tail.unshift(path.basename(cursor)); cursor = parent
    }
  }
}
async function protectGitWorktree (target) {
  const resolvedTarget = await canonicalFuturePath(target)
  const roots = [
    gitRoot(process.cwd()),
    gitRoot(path.resolve(__dirname, '..')),
    gitRoot(path.dirname(resolvedTarget))
  ].filter(Boolean)
  for (const root of roots) {
    const resolvedRoot = await fsp.realpath(root).catch(() => root)
    if (inside(root, target) || inside(resolvedRoot, resolvedTarget)) fail('INVALID_ARGUMENT', 'Git 작업 폴더 안에는 CLI 업데이트를 설치할 수 없습니다.')
  }
}
async function writeCurrent (value) {
  const home = cliHome(); await fsp.mkdir(home, { recursive: true, mode: 0o700 })
  const target = path.join(home, 'current.json'); const temporary = `${target}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`
  try { await fsp.writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await fsp.rename(temporary, target) } finally { await fsp.rm(temporary, { force: true }).catch(() => {}) }
}
function shellQuote (value) { return `'${String(value).replace(/'/g, "'\\''")}'` }
async function install (params = {}, context = {}) {
  params = assertParams(params, ['targetDir'])
  if (process.platform === 'win32') fail('UNSUPPORTED', 'Windows에서는 독립 CLI 자동 설치를 지원하지 않습니다.')
  if (params.targetDir !== undefined && (typeof params.targetDir !== 'string' || params.targetDir.includes('\0') || !path.isAbsolute(params.targetDir))) fail('INVALID_ARGUMENT', 'targetDir은 NUL 문자가 없는 절대 경로여야 합니다.')
  if (params.targetDir) await protectGitWorktree(path.resolve(params.targetDir))
  const found = await check({}, context)
  if (!found.version || !found.asset) fail('UPDATE_NOT_FOUND', '설치 가능한 정식 CLI 릴리스를 찾지 못했습니다.')
  if (compare(found.version, CURRENT) < 0) fail('UPDATE_DOWNGRADE', '낮은 CLI 버전으로 자동 설치할 수 없습니다.')
  const home = cliHome(); const target = path.resolve(params.targetDir || path.join(home, found.version)); const defaultTarget = !params.targetDir
  if (!params.targetDir) await protectGitWorktree(target)
  if (fs.existsSync(target)) {
    if (!defaultTarget) fail('TARGET_EXISTS', 'targetDir은 존재하지 않는 새 폴더여야 합니다.')
    const verified = await existingKit(target, found.version, found.asset)
    const result = { ...verified, command: `${shellQuote(nodeExecutable())} ${shellQuote(verified.cliPath)}` }
    await writeCurrent({ cliVersion: result.cliVersion, cliPath: result.cliPath })
    return recordComponent(result, { componentId: `road-music-cli:${crypto.createHash('sha256').update(result.cliPath).digest('hex').slice(0, 16)}`, name: 'Road Music CLI 설치본', installedVersion: result.cliVersion, latestVersion: found.version, status: 'installed', sourceUrl: found.releaseUrl }, context)
  }
  const parent = path.dirname(target)
  await fsp.mkdir(parent, { recursive: true, mode: 0o700 })
  const stage = await fsp.mkdtemp(path.join(parent, '.road-music-cli-stage-'))
  try {
    const archive = path.join(stage, found.asset.name)
    const archiveSha256 = await download(found.asset, archive)
    const extracted = await extract(archive, stage, found.version)
    const verified = await verifyKit(extracted, found.version)
    await fsp.writeFile(path.join(extracted, '.road-music-cli-install.json'), JSON.stringify({ cliVersion: verified.cliVersion, appVersion: verified.appVersion, archiveSha256 }), { mode: 0o600 })
    try { await fsp.mkdir(target, { mode: 0o700 }) } catch (error) { if (error?.code === 'EEXIST') fail('TARGET_EXISTS', '동일한 설치 대상이 이미 있습니다.'); throw error }
    try { await fsp.rename(extracted, target) } catch (error) { await fsp.rmdir(target).catch(() => {}); throw error }
    const result = { cliPath: path.join(target, 'cli', 'road-music.js'), cliVersion: verified.cliVersion, appVersion: verified.appVersion, command: `${shellQuote(nodeExecutable())} ${shellQuote(path.join(target, 'cli', 'road-music.js'))}` }
    await writeCurrent({ cliVersion: result.cliVersion, cliPath: result.cliPath })
    return recordComponent(result, { componentId: `road-music-cli:${crypto.createHash('sha256').update(result.cliPath).digest('hex').slice(0, 16)}`, name: 'Road Music CLI 설치본', installedVersion: result.cliVersion, latestVersion: found.version, status: 'installed', sourceUrl: found.releaseUrl }, context)
  } finally { await fsp.rm(stage, { recursive: true, force: true }).catch(() => {}) }
}

module.exports = { check, install, compare, safeVersion, recordComponent, inspectArchive }
