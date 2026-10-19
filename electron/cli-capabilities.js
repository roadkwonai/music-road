'use strict'

function platformReason (platform, id) {
  if (id === 'yue' && platform === 'darwin') return 'YuE2 (Windows NVIDIA)는 macOS에서 지원하지 않습니다. Apple Silicon에서는 YuE2 (Apple Silicon)를 선택해 주세요.'
  if (id === 'yue' && platform !== 'win32') return 'YuE2 (Windows NVIDIA)는 Windows NVIDIA에서만 지원합니다.'
  if (id === 'yue-mlx' && platform !== 'darwin') return 'YuE2 (Apple Silicon)는 Apple Silicon 맥에서만 지원합니다.'
  return null
}

function policyFor (command, platform, lyricsWindowsPolicy, operationPolicies) {
  if (command === 'song:lyrics' && platform === 'win32' && lyricsWindowsPolicy) return lyricsWindowsPolicy
  return operationPolicies && operationPolicies[command]
}

function requirements (entry) {
  const required = Array.isArray(entry.requires) ? [...entry.requires] : []
  const add = (value) => { if (!required.includes(value)) required.push(value) }
  if (entry.renderer || entry.command === 'app:screenshot') add('renderer')
  if (entry.dialog) add('dialog')
  if (entry.input) add('input')
  if (['video:render', 'songs:import', 'song:replace'].includes(entry.command)) add('ffmpeg')
  return required
}

function buildCapabilities ({
  platform = process.platform,
  commands = [],
  supportedEngines = [],
  rendererReady = false,
  ffmpegAvailable = false,
  versions = {},
  root = null,
  busy = false,
  lyricsWindowsPolicy = null,
  operationPolicies = {}
} = {}) {
  const engineList = Array.isArray(supportedEngines) ? supportedEngines : Object.values(supportedEngines || {})
  const execution = busy
    ? { busy: true, newWorkCanStart: false, reason: '다른 작업이 실행 중입니다.' }
    : { busy: false, newWorkCanStart: true, reason: null }
  const commandList = commands.map((entry) => {
    const policy = policyFor(entry.command, platform, lyricsWindowsPolicy, operationPolicies) || {}
    const requires = requirements(entry)
    const supported = policy.supported !== false
    const unavailable = []
    if (requires.includes('renderer') && !rendererReady) unavailable.push('renderer')
    if (requires.includes('ffmpeg') && !ffmpegAvailable) unavailable.push('ffmpeg')
    const reason = !supported ? (policy.reason || '현재 실행 서비스에서 지원하지 않습니다.')
      : unavailable.length ? `${unavailable.join(' 및 ')} 준비가 필요합니다.` : null
    return { command: entry.command, supported, available: supported && unavailable.length === 0, requires, reason }
  })
  const engineResults = engineList.map((engine) => {
    const platformBlocked = platformReason(platform, engine.id) ||
      (engine.platformSupported === false ? engine.reason || '현재 플랫폼에서 지원하지 않습니다.' : null)
    const check = engine.check || null
    const hardwareReady = typeof (check && check.ok) === 'boolean' ? check.ok : null
    const checkReason = hardwareReady === false
      ? (Array.isArray(check.problems) && check.problems.length ? check.problems.join(' ') : '현재 환경 점검을 통과하지 못했습니다.')
      : hardwareReady === null ? '엔진 점검 결과를 확인하지 못했습니다.' : null
    const supported = !platformBlocked
    const installed = Boolean(engine.installed)
    return {
      id: engine.id,
      supported,
      installed,
      hardwareReady,
      ready: supported && installed && hardwareReady === true,
      installable: supported && hardwareReady === true,
      reason: platformBlocked || checkReason,
      check
    }
  })
  return { source: 'running-service', platform, versions: { ...versions }, root, execution, commands: commandList, engines: engineResults }
}

module.exports = { buildCapabilities }
