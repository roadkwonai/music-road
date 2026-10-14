'use strict'

// ---------------------------------------------------------------------------
// 프로그램 업데이트 — roadkwon.dev 의 "무료 프로그램 → 현재 판" 이 알려 준다.
//
//   GET https://roadkwon.dev/api/version?product=RoadMusic&platform=win
//   → { success, product, version, url, notes, mandatory, page }
//
//   · version 이 비어 있으면 아직 등록된 것이 없다 — 조용히 넘어간다
//   · mandatory 가 true 면 "아니요" 를 감춘다
//   · page 는 사이트의 프로그램 페이지(내려받는 곳)
//
// 1.2 부터 프로그램이 설치 파일을 직접 받아 실행하지 않는다. 새 판이 있으면 알리고,
// 사람이 roadkwon.dev 의 프로그램 페이지로 가서 받는다(다른 프로그램도 거기서 보인다).
// 1.1 이하 판은 여전히 url(설치 파일)을 받아 스스로 업데이트한다 — 서버의 url 은 그대로 둔다.
// ---------------------------------------------------------------------------

const fs = require('fs')
const path = require('path')

// 등록한 설치 집계 이름(RoadMusic)으로 묻는다.
const SOURCES = [
  { base: 'https://roadkwon.dev/api', product: 'RoadMusic' }
]
const PRODUCT = 'ROADMUSIC' // 받은 product 를 대문자로 바꿔 이것과 맞춘다
const SITE = 'https://roadkwon.dev'
const PAGE = `${SITE}/apps/roadmusic` // 서버가 page 를 알려 주지 않을 때
const OLD_DOWNLOADS = 'RoadMusic-update' // 1.1 이하가 받아 두던 설치 파일

let opt = { app: null, shell: null, log: () => {} }
function init (o) {
  opt = { ...opt, ...(o || {}) }
  sweepOldInstallers()
}

function plat () {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
  return 'win'
}

// `0.1.2` 꼴 두 버전 비교. a>b 면 양수. 없는 자리는 0 으로 본다.
function compare (a, b) {
  const parts = (s) => String(s || '').split('.').map((p) => parseInt(String(p).replace(/[^0-9]/g, ''), 10) || 0)
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  }
  return 0
}

async function latest () {
  for (const source of SOURCES) {
    const found = await ask(source)
    if (found !== undefined) return found // 답이 왔으면(새 판이 없다는 답이라도) 거기서 끝
  }
  return null
}

// undefined = 서버가 답하지 않음(다음 곳에 물어본다), null = 새 판 없음.
async function ask ({ base, product }) {
  const url = `${base}/version?product=${encodeURIComponent(product)}&platform=${encodeURIComponent(plat())}`
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 10000)
  try {
    const res = await fetch(url, { signal: abort.signal })
    if (!res.ok) return undefined
    const j = await res.json().catch(() => null)
    if (!j || j.success !== true) return undefined
    // 서버는 모르는 상품 코드를 받으면 다른 제품의 버전을 돌려준다. 반드시 확인한다.
    const got = String(j.product || '').trim().toUpperCase()
    if (got && got !== PRODUCT) return null
    const version = String(j.version || '').trim()
    if (!version) return null
    const page = /^https:\/\/roadkwon\.dev\//.test(String(j.page || '')) ? j.page : PAGE
    return { version, notes: String(j.notes || '').trim(), mandatory: j.mandatory === true, page }
  } catch {
    return undefined // 네트워크 실패로 앱을 붙잡지 않는다 — 다음 곳에 묻는다
  } finally { clearTimeout(timer) }
}

// { version, current, notes, mandatory, page } 또는 null(최신 판을 쓰는 중이거나 답이 없음).
async function check () {
  const current = (opt.app && opt.app.getVersion && opt.app.getVersion()) || ''
  if (!current) return null
  const found = await latest()
  if (!found) return null
  if (compare(found.version, current) <= 0) return null
  found.current = current
  return found
}

// 사이트의 프로그램 페이지를 화면 언어로 연다(한국어는 접두어 없음, /en/·/ja/).
function pageFor (page, lang) {
  const url = new URL(page || PAGE)
  if (lang === 'en' || lang === 'ja') url.pathname = `/${lang}${url.pathname}`
  url.searchParams.set('from', 'app')
  return url.toString()
}

function openInBrowser (url) {
  try { if (opt.shell) opt.shell.openExternal(url); return { ok: true } } catch (error) {
    return { ok: false, error: String(error.message || error) }
  }
}

// 1.1 이하가 내려받아 두던 설치 파일(userData/update)을 치운다.
function sweepOldInstallers () {
  try {
    const dir = path.join(opt.app.getPath('userData'), 'update')
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(OLD_DOWNLOADS)) { try { fs.rmSync(path.join(dir, name), { force: true }) } catch {} }
    }
  } catch {}
}

module.exports = { init, check, latest, pageFor, openInBrowser, compare, PRODUCT, SITE }
