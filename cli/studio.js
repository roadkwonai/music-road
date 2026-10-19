'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')

const SESSION_FILE = 'video-studio-session.json'
const PROJECT_FILE = 'studio-project.json'
const READY_TIMEOUT = 30_000
const INIT_TIMEOUT = 30_000
const BROWSER_TIMEOUT = 10_000
const STUDIO_APPLICATION = 'road-music-video-studio'
const EGO_TASK_SPACE = 'Road Music 제작실'
const EGO_PAGE_TITLES = ['Road Music 영상 제작실', 'Road Music 스타일 카탈로그', 'JIZURA 음악 스튜디오', 'JIZURA 가사 가독성 검수', 'Road Music Showreel CD', 'Road Music 쇼릴 MV', 'Showreel 음악 모션그래픽', 'Showreel 플레이리스트 프리셋', 'Showreel 스타일 선택', 'Road Music 완성 결과', 'Road Music 결과 검수', 'Road Music 사용 가이드', 'Road Music 내 작업물', 'Road Music 음악 그룹', 'Road Music 저장공간 관리', 'Road Music 제작 분석', 'Road Music 환경 상태', 'Road Music 공개 명령 레퍼런스', 'Road Music CCM 전문 제작 가이드', 'Road Music 공개 명령 상세 활용 가이드']
const unixNow = () => Math.floor(Date.now() / 1000)

function studioRoot (root = path.resolve(__dirname, '..'), env = process.env) {
  for (const candidate of [
    path.join(root, '.agents', 'skills', 'road-music-video-studio'),
    path.join(root, 'skills', 'music-road-skills', 'skills', 'road-music-video-studio'),
    path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills', 'road-music-video-studio'),
    path.join(root, 'skills', 'road-music-video-studio')
  ]) {
    if (fs.existsSync(path.join(candidate, 'scripts', 'studio.py'))) return candidate
  }
  return null
}

function sessionPath (userData) {
  return path.join(userData, SESSION_FILE)
}

function canonicalPath (value) {
  try { return fs.realpathSync.native(value) } catch { return path.resolve(value) }
}

function safeSession (value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 ||
      typeof value.url !== 'string' || typeof value.project !== 'string' ||
      !Number.isInteger(value.pid) || value.pid < 1 || !Number.isInteger(value.expiresAt)) return null
  const match = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/\?token=([A-Za-z0-9_-]{16,128})$/.exec(value.url)
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535 || value.expiresAt <= unixNow()) return null
  return { ...value, project: canonicalPath(value.project) }
}

function readSession (userData) {
  try { return safeSession(JSON.parse(fs.readFileSync(sessionPath(userData), 'utf8'))) } catch { return null }
}

function writeSession (userData, value) {
  const target = sessionPath(userData)
  const temporary = `${target}.${process.pid}.tmp`
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(temporary, JSON.stringify(value) + '\n', { mode: 0o600 })
  fs.renameSync(temporary, target)
}

async function readState (url, requestStudioState) {
  const state = await requestStudioState(new URL('/api/state' + new URL(url).search, url).toString())
  return state && state.application === STUDIO_APPLICATION && typeof state.project === 'string' ? state : null
}

async function defaultRequestStudioState (url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(2_000) })
  if (!response.ok) throw new Error(`제작실 상태 확인 실패 (${response.status})`)
  return response.json()
}

function egoCommand (url, env) {
  const configuredId = Number(env.ROADMUSIC_EGO_TASK_SPACE)
  const target = JSON.stringify(url)
  if (Number.isSafeInteger(configuredId) && configuredId > 0) {
    return ['ego-browser', ['nodejs', '-e', `const task = await taskSpace(${configuredId}); const page = task.page("p1"); if (await page.url() !== ${target}) await page.goto(${target});`]]
  }
  const reuseFinishedPage = env.ROADMUSIC_EGO_REUSE_ROAD_MUSIC_PAGE !== '0'
  const name = JSON.stringify(EGO_TASK_SPACE)
  const allowed = JSON.stringify(reuseFinishedPage)
  const titles = JSON.stringify(EGO_PAGE_TITLES)
  const local = '/^http:\\/\\/127\\.0\\.0\\.1:[1-9][0-9]{0,4}\\/(?:(?:catalog|results|review|storage|dashboard|status|reference|recipes|ccm)\\/|works\\/(?:[0-9a-f]{64}\\/)?|guide\\/(?:[a-z0-9-]+\\/)?)?\\?token=[A-Za-z0-9_-]{16,128}(?:&(?:view=(?:list|large)|engine=(?:ACE|YuE)|(?:search|purpose|category|style|tag)=[A-Za-z0-9_%+.~-]*))*(?:#[^\\s]*)?$/'
  const script = `const name=${name};const target=${target};const reuse=${allowed};const titles=${titles};const isRoadMusicURL=(current,title)=>${local}.test(current)||(title==="JIZURA 가사 가독성 검수"&&/^file:\\/\\/.*\\/review\\.html(?:[?#].*)?$/.test(current));const isRoadMusicPage=async page=>isRoadMusicURL(await page.url(),await page.title());const pickRoadMusicTab=async task=>{const matches=[];for(const item of await task.tabs())if(isRoadMusicURL(item.url,item.title))matches.push(item);const active=matches.filter(item=>item.active);return active.length===1?active[0]:matches.length===1?matches[0]:null};const entries=await listTaskSpaces();const exact=entries.filter(item=>item.name===name);if(exact.length>1)throw new Error("Road Music 제작실 작업 공간이 여러 개입니다");const fallback=exact.length?[]:entries.filter(item=>item.createdBy==="agent"&&typeof item.name==="string"&&item.name.startsWith("Road Music")&&Array.isArray(item.recentTabTitles)&&item.recentTabTitles.some(title=>titles.includes(title)));if(fallback.length>1)throw new Error("재사용할 Road Music 제작실 작업 공간이 여러 개입니다");const existing=exact[0]||fallback[0];const verifyCurrent=Boolean(fallback[0]);if(existing?.ownership==="user"&&existing.createdBy!=="agent")throw new Error("사용자가 만든 작업 공간은 재사용하지 않습니다");let task;let claimed=false;if(existing?.ownership==="user"){if(!reuse)throw new Error("완료된 Road Music 제작실 페이지 재사용이 허용되지 않았습니다");task=await claimTaskSpace(existing.id);claimed=true}else task=existing?await taskSpace(existing.id):await taskSpace(name);const hasP1=(await task.tabs()).some(item=>item.label==="p1");let page;if(claimed||(existing&&!hasP1)){const tab=await pickRoadMusicTab(task);if(!tab)throw new Error("재사용할 Road Music 제작실 페이지가 로컬 제작실이 아닙니다");page=await task.adopt(tab.page,{as:"p1"})}else page=task.page("p1");if(verifyCurrent&&!await isRoadMusicPage(page))throw new Error("재사용할 Road Music 제작실 페이지가 로컬 제작실이 아닙니다");if(await page.url()!==target)await page.goto(target);`
  return ['ego-browser', ['nodejs', '-e', script]]
}

function openBrowser (url, { platform = process.platform, spawnProcess = spawn, browserTimeout = BROWSER_TIMEOUT, env = process.env } = {}) {
  const command = env.ROADMUSIC_STUDIO_BROWSER !== 'system' ? egoCommand(url, env)
    : platform === 'darwin' ? ['open', [url]]
      : platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]]
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command[0], command[1], { detached: true, stdio: 'ignore', shell: false })
    let settled = false
    const timer = setTimeout(() => {
      stopChild(child)
      finish(new Error('브라우저 열기 시간이 초과되었습니다'))
    }, browserTimeout)
    const finish = error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      child.removeListener('spawn', onSpawn)
      error ? reject(error) : resolve()
    }
    const onError = error => finish(error)
    const onExit = code => finish(code === 0 ? null : new Error(`브라우저 열기 실패 (${code ?? 'unknown'})`))
    const onSpawn = () => child.unref()
    child.once('error', onError)
    child.once('exit', onExit)
    child.once('spawn', onSpawn)
  })
}

function waitForExit (child, timeout = INIT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      finish(new Error('제작실 초기화 시간이 초과되었습니다'))
    }, timeout)
    const finish = error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      error ? reject(error) : resolve()
    }
    const onError = error => finish(error)
    const onExit = code => finish(code === 0 ? null : new Error(`제작실 초기화 실패 (${code ?? 'unknown'})`))
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

function waitForReady (child, timeout = READY_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let pending = ''
    const timer = setTimeout(() => finish(new Error('제작실 준비 시간이 초과되었습니다')), timeout)
    const finish = (error, value) => {
      clearTimeout(timer)
      child.stderr.removeListener('data', onData)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      child.stderr.destroy()
      error ? reject(error) : resolve(value)
    }
    const onError = error => finish(error)
    const onExit = code => finish(new Error(`제작실이 준비 전에 종료되었습니다 (${code ?? 'unknown'})`))
    const onData = chunk => {
      pending += chunk
      let end
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end)
        pending = pending.slice(end + 1)
        try {
          const event = JSON.parse(line)
          if (event.event === 'studio-ready' && typeof event.url === 'string') return finish(null, event)
        } catch {}
      }
    }
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', onData)
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

function startPython (args, options) {
  const cliRoot = options.cliRoot || path.resolve(__dirname, '..')
  const cliEnv = fs.existsSync(path.join(cliRoot, 'cli', 'road-music.js')) ? { ROADMUSIC_CLI_ROOT: cliRoot } : {}
  return (options.spawnProcess || spawn)(options.python || 'python3', args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: false,
    env: { ...(options.env || process.env), ROADMUSIC_DATA_DIR: options.userData, ...cliEnv }
  })
}

function stopChild (child) {
  if (child && typeof child.kill === 'function') child.kill('SIGTERM')
}

async function createProject (root, project, options) {
  if (fs.existsSync(path.join(project, PROJECT_FILE))) return
  if (fs.existsSync(project)) throw new Error('기존 제작실 프로젝트에 studio-project.json이 없습니다')
  const child = startPython([path.join(root, 'scripts', 'studio.py'), 'init', '--out', project], options)
  try { await waitForExit(child, options.initTimeout) } catch (error) { stopChild(child); throw error }
}

async function openStudio (options = {}) {
  const userData = path.resolve(options.userData)
  const requestStudioState = options.requestStudioState || defaultRequestStudioState
  const existing = readSession(userData)
  if (existing) {
    let healthy = false
    try {
      const state = await readState(existing.url, requestStudioState)
      healthy = state && canonicalPath(state.project) === existing.project
    } catch {}
    if (healthy) {
      await openBrowser(existing.url, options)
      return { url: existing.url, project: existing.project, reused: true }
    }
  }
  const root = studioRoot(options.root, options.env || process.env)
  if (!root) throw new Error('Road Music 영상 제작실을 찾을 수 없습니다')
  const project = path.join(userData, 'video-studio')
  fs.mkdirSync(userData, { recursive: true })
  await createProject(root, project, options)
  const child = startPython([
    path.join(root, 'scripts', 'studio.py'), 'serve', '--project', project, '--review', '--timeout', '86400',
    '--session-file', sessionPath(userData)
  ], options)
  let ready
  try { ready = await waitForReady(child, options.readyTimeout) } catch (error) { stopChild(child); throw error }
  const session = safeSession({ schemaVersion: 1, url: ready.url, project: ready.project, pid: child.pid, expiresAt: unixNow() + 86_400 })
  if (!session || session.project !== canonicalPath(project)) {
    stopChild(child)
    throw new Error('제작실 준비 주소가 올바르지 않습니다')
  }
  writeSession(userData, session)
  child.unref()
  await openBrowser(session.url, options)
  return { url: session.url, project: session.project, reused: false }
}

module.exports = { openStudio, readSession, safeSession, sessionPath, studioRoot }
