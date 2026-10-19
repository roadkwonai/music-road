'use strict'
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const controls = require('../renderer/generation-options')
const catalog = require('../electron/cli-catalog')

const fail = (code, message) => Object.assign(new Error(message), { code })
const scriptPath = () => path.resolve(__dirname, '../python/yue_score_tools.py').replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)

function locations (options) {
  const env = options.env || process.env
  let settings = {}
  try { settings = JSON.parse(fs.readFileSync(path.join(options.userData || '', 'settings.json'), 'utf8')) } catch {}
  const dataRoot = settings.dataDir || options.userData || ''
  const root = env.ROADMUSIC_YUE_MLX_ROOT || path.join(dataRoot, 'engines', 'yue-mlx')
  let saved = {}
  try { saved = JSON.parse(fs.readFileSync(path.join(root, 'paths.json'), 'utf8')) || {} } catch {}
  const models = env.ROADMUSIC_YUE_MLX_MODELS || (typeof saved.model === 'string' && saved.model) || path.join(root, 'models')
  const python = path.join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const windowsPython = settings.pythonPath || path.join(dataRoot, 'runtime', 'venv', 'Scripts', 'python.exe')
  return { root, models, windowsPython, python: env.ROADMUSIC_SCORE_PYTHON || (fs.existsSync(python) ? python : fs.existsSync(windowsPython) ? windowsPython : process.platform === 'win32' ? 'python' : 'python3') }
}

function runTool (action, request, options = {}) {
  return new Promise((resolve, reject) => {
    let child, directory, timer, force, timedOut = false, output = '', stderr = '', launchError
    const start = async () => {
      directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'road-music-score-'))
      const requestFile = path.join(directory, 'request.json')
      await fsp.writeFile(requestFile, JSON.stringify(request), { mode: 0o600 })
      const location = locations(options)
      child = (options.spawnProcess || spawn)(location.python, [options.scoreScript || scriptPath(), action, '--request', requestFile], {
        shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
        env: { ...(options.env || process.env), ROADMUSIC_YUE_MLX_ROOT: location.root, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' }
      })
      const terminate = () => {
        if (child.exitCode !== null) return
        child.kill('SIGTERM')
        force = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 1000)
        force.unref()
      }
      timer = setTimeout(() => { timedOut = true; terminate() }, options.timeout || (action === 'transcribe' ? 3600000 : 30000))
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
      child.stdout.on('data', data => {
        output += data
        if (Buffer.byteLength(output) > 16 * 1024 * 1024) { launchError = fail('RESPONSE_TOO_LARGE', '악보 도구 응답이 16MiB를 넘었습니다.'); terminate() }
      })
      child.stderr.on('data', data => { stderr = (stderr + data).slice(-65536); options.onEvent?.({ type: 'event', channel: 'score:progress', payload: { text: data } }) })
      child.once('error', error => { launchError = fail('SCORE_UNAVAILABLE', `악보 도구를 실행하지 못했습니다: ${error.message}`) })
      child.once('close', async code => {
        clearTimeout(timer); clearTimeout(force)
        await fsp.rm(directory, { recursive: true, force: true })
        if (launchError) return reject(launchError)
        if (timedOut) return reject(fail('timeout', '악보 도구의 실행 기한이 끝났습니다. 결과 폴더를 확인하세요.'))
        try {
          const lines = output.trim().split(/\r?\n/).filter(Boolean)
          if (lines.length !== 1) throw fail('SCORE_PROTOCOL', '악보 도구는 JSON 한 줄을 반환해야 합니다.')
          const result = JSON.parse(lines[0])
          if (result.ok !== true || code !== 0) throw fail(result.error?.code || 'SCORE_FAILED', (typeof result.error === 'string' ? result.error : result.error?.message) || stderr.trim() || '악보 도구가 실패했습니다.')
          resolve(result.result)
        } catch (error) { reject(error) }
      })
    }
    start().catch(async error => { if (directory) await fsp.rm(directory, { recursive: true, force: true }); reject(error) })
  })
}

async function capabilities (params = {}, options = {}) {
  const location = locations(options)
  const engines = ['yue', 'yue-mlx'].filter(engine => !params.engine || engine === params.engine).map(engine => ({
    engine, platform: engine === 'yue-mlx' ? 'Apple Silicon macOS' : 'Windows NVIDIA',
    platformMatches: engine === 'yue-mlx' ? process.platform === 'darwin' && process.arch === 'arm64' : process.platform === 'win32',
    sampling: controls.advancedProperties, defaults: controls.effectiveAdvanced(),
    runtime: engine === 'yue-mlx' ? controls.runtimeProperties : {},
    runtimeDefaults: engine === 'yue-mlx' ? controls.runtimeDefaults : {},
    operations: { generate: true, plan: true, externalAbc: true, replay: engine === 'yue-mlx' ? ['plan', 'synthesize', 'decode'] : [] },
    defaultsByMode: Object.fromEntries(['full', 'melody', 'off'].map(cot => [cot, controls.effectiveAdvanced({}, cot)])),
    replayControls: engine === 'yue-mlx' ? {
      plan: { advanced: Object.keys(controls.advancedProperties).filter(key => !key.startsWith('abc')), runtime: Object.keys(controls.runtimeProperties) },
      synthesize: { advanced: ['odeSteps'], runtime: Object.keys(controls.runtimeProperties).filter(key => key !== 'precision') },
      decode: { advanced: [], runtime: ['memoryBudgetGiB', 'requireAc', 'vaePath', 'vaeCoreFrames'] }
    } : {},
    installation: { detected: engine === 'yue-mlx' ? fs.existsSync(path.join(location.root, 'paths.json')) : fs.existsSync(location.windowsPython), validation: 'file-presence-only; use engines:list before generation' },
    precisionAvailability: engine === 'yue-mlx' ? Object.fromEntries(['8bit', 'bf16', '4bit'].map(precision => [precision, fs.existsSync(path.join(location.models, `ar-${precision}.safetensors`))])) : undefined
  }))
  let inspected
  try { inspected = await runTool('capabilities', params.transcription || {}, options) } catch (error) { inspected = { scoreTools: { available: false, reason: error.message }, sheetSage2: { available: false, reason: error.message } } }
  const transcription = inspected.sheetSage2
  return { engines, transcription, scoreTools: { ...inspected.scoreTools, commands: ['inspect', 'compare', 'strip-chords'] },
    instruments: { listed: require('../renderer/prompt').INSTRUMENTS?.length || 37, maximum: 16, custom: 'parts.instrumentation', control: 'text intention; not separate stems/mixer' },
    fixedProtocol: { context: controls.contextTokens, odeMethod: 'midpoint' },
    preparation: 'song:prepare', quality: 'settings do not guarantee musical quality; benchmark precision and runtime on the target hardware' }
}

async function dispatch (command, params = {}, options = {}) {
  const { paramsValue } = catalog.validate(command, params)
  if (command === 'song:prepare') return require('../electron/cli-generation').preparePreview(paramsValue)
  if (command === 'yue:capabilities') return capabilities(paramsValue, options)
  if (!['score:inspect', 'score:compare', 'score:strip-chords', 'score:transcribe'].includes(command)) throw fail('INVALID_ARGUMENT', '지원하는 YuE 명령이 아닙니다.')
  return runTool(command.slice(6), paramsValue, options)
}
module.exports = { dispatch, capabilities, runTool }
