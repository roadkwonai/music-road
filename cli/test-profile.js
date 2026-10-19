'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { defaultUserData } = require('./client')

class TestProfileError extends Error {
  constructor (code, message) {
    super(message)
    this.code = code
  }
}

const isInside = (parent, target) => {
  const relative = path.relative(parent, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function directory (target, label, { required = true } = {}) {
  const stat = await fs.lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
  if (!stat) {
    if (required) throw new TestProfileError('test_profile_source_unavailable', `${label}을 찾을 수 없습니다.`)
    return false
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new TestProfileError('test_profile_unsafe_path', `${label}은 심볼릭 링크가 아닌 폴더여야 합니다.`)
  return true
}

async function noSymlinkAncestors (target) {
  const resolved = path.resolve(target)
  const parsed = path.parse(resolved)
  let current = parsed.root
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const stat = await fs.lstat(current).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (!stat) return
    if (stat.isSymbolicLink()) throw new TestProfileError('test_profile_unsafe_path', '테스트 프로필 경로에는 심볼릭 링크를 사용할 수 없습니다.')
  }
}

async function settingsFor (source) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(source, 'settings.json'), 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    if (error instanceof SyntaxError) throw new TestProfileError('test_profile_source_invalid', '기존 Road Music 설정 파일을 읽을 수 없습니다.')
    throw error
  }
}

function absoluteSetting (value) {
  return typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0') ? path.resolve(value) : null
}

function defaultHfHome ({ platform, env, home }) {
  if (env.YUESTUDIO_HF_HOME) return path.resolve(env.YUESTUDIO_HF_HOME)
  if (env.HF_HOME) return path.resolve(env.HF_HOME)
  return platform === 'win32'
    ? path.join(env.USERPROFILE || home, '.cache', 'huggingface')
    : path.join(home, '.cache', 'huggingface')
}

async function regularFile (file) {
  try { return (await fs.stat(file)).isFile() } catch { return false }
}

async function engineFlags ({ runtime, settings, platform }) {
  const flags = {}
  const warnings = []
  const acePython = path.join(runtime, 'engines', 'ace-step', 'venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const aceModel = path.join(runtime, 'engines', 'ace-step', 'src', 'checkpoints', 'acestep-v15-turbo', 'model.safetensors')
  if (settings.aceInstalled === true) {
    if (await regularFile(acePython) && await regularFile(aceModel)) flags.aceInstalled = true
    else warnings.push('ACE 설치 표지를 실제 공유 runtime에서 확인하지 못해 테스트 프로필에 복사하지 않았습니다.')
  }
  return { flags, warnings }
}

async function profileSettings ({ source, runtime, settings, platform, env, home }) {
  const sourceHf = absoluteSetting(settings.hfHome) || (absoluteSetting(settings.dataDir)
    ? path.join(runtime, 'models')
    : defaultHfHome({ platform, env, home }))
  const value = {
    dataDir: runtime,
    hfHome: sourceHf,
    songsDir: path.join(source, 'Songs'),
    autoMp3: true,
    dropWav: true
  }
  const pythonPath = absoluteSetting(settings.pythonPath)
  if (pythonPath) value.pythonPath = pythonPath
  const engines = await engineFlags({ runtime, settings, platform })
  return { settings: { ...value, ...engines.flags }, warnings: engines.warnings }
}

async function createTestProfile (params = {}, options = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).length !== 1 || typeof params.directory !== 'string' || !path.isAbsolute(params.directory) || params.directory.includes('\0')) {
    throw new TestProfileError('invalid_arguments', 'directory에는 새 테스트 프로필의 절대 경로 하나가 필요합니다.')
  }
  const env = options.env || process.env
  const platform = options.platform || process.platform
  const home = options.home || require('node:os').homedir()
  const source = path.resolve(options.userData || defaultUserData({ platform, env, home }))
  const target = path.resolve(params.directory)
  await directory(source, '기존 Road Music 프로필')
  const sourceSettings = await settingsFor(source)
  const runtime = absoluteSetting(sourceSettings.dataDir) || source
  await directory(runtime, '공유 runtime')
  const hfHome = absoluteSetting(sourceSettings.hfHome) || (absoluteSetting(sourceSettings.dataDir)
    ? path.join(runtime, 'models')
    : defaultHfHome({ platform, env, home }))
  const protectedRoots = [source, runtime, path.join(runtime, 'engines'), path.join(runtime, 'models'), hfHome]
  if (protectedRoots.some(root => isInside(root, target))) throw new TestProfileError('test_profile_unsafe_path', '테스트 프로필은 기존 프로필·공유 runtime·엔진·모델 폴더 밖의 새 경로여야 합니다.')
  await noSymlinkAncestors(target)
  await directory(target, '테스트 프로필 대상', { required: false }).then(exists => {
    if (exists) throw new TestProfileError('test_profile_exists', '테스트 프로필 대상은 존재하지 않는 새 폴더여야 합니다.')
  })
  const parent = path.dirname(target)
  await fs.mkdir(parent, { recursive: true })
  await noSymlinkAncestors(target)
  await directory(parent, '테스트 프로필 상위 경로')
  await fs.mkdir(target, { mode: 0o700 })
  let profile
  try {
    profile = await profileSettings({ source: target, runtime, settings: sourceSettings, platform, env, home })
    const temporary = path.join(target, `.settings-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`)
    await fs.mkdir(profile.settings.songsDir, { mode: 0o700 })
    await fs.writeFile(temporary, `${JSON.stringify(profile.settings, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await fs.rename(temporary, path.join(target, 'settings.json'))
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true }).catch(() => {})
    throw error
  }
  return {
    targetDir: target,
    runtimeDir: runtime,
    env: { ROADMUSIC_DATA_DIR: target },
    scopeWarnings: [
      '기존 runtime·엔진·모델은 복사하거나 심볼릭 링크하지 않았습니다.',
      '테스트 곡 라이브러리는 새 프로필의 Songs 폴더로 분리했습니다.',
      '서비스 시작·중지, 엔진 설치, 모델 다운로드는 수행하지 않았습니다.',
      ...profile.warnings
    ]
  }
}

module.exports = { TestProfileError, createTestProfile, profileSettings }
