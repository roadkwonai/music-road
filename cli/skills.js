'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

class SkillsError extends Error {
  constructor (code, message) {
    super(message)
    this.code = code
  }
}

function bundledRoot (options = {}) {
  return path.resolve(options.skillsRoot || process.env.ROADMUSIC_SKILLS_HOME || path.join(__dirname, '..', 'skills', 'music-road-skills'))
}

async function requireFile (file, message) {
  try {
    const info = await fs.stat(file)
    if (!info.isFile()) throw new Error('not a file')
  } catch {
    throw new SkillsError('skills_bundle_missing', message)
  }
  return file
}

async function skillsManager (options = {}) {
  const root = bundledRoot(options)
  const file = await requireFile(path.join(root, 'skills', 'road-music-skills-update', 'scripts', 'manage.cjs'), '동봉 music-road-skills 업데이트 도구를 찾을 수 없습니다. npm run setup:cli로 스킬 번들을 설치하세요.')
  const manager = require(file)
  if (!manager || typeof manager.execute !== 'function') throw new SkillsError('skills_bundle_invalid', '동봉 music-road-skills 업데이트 도구의 execute API가 올바르지 않습니다.')
  return { root, execute: manager.execute }
}

function updateParams (action, params, root) {
  const value = { ...params }
  if (action === 'install' && value.source === undefined) value.source = root
  return value
}

function normalizeEvent (event) {
  if (event && event.type === 'event' && typeof event.channel === 'string') return event
  if (event && typeof event.event === 'string') {
    const { event: channel, ...payload } = event
    return { type: 'event', channel, payload }
  }
  return null
}

async function runSkills (command, params = {}, options = {}) {
  const { root, execute } = await skillsManager(options)
  const actions = {
    'skills:status': 'status',
    'skills:check': 'check',
    'skills:install': 'install',
    'skills:update': 'update',
    'skills:watch': 'watch'
  }
  const action = actions[command]
  if (!action) throw new SkillsError('invalid_arguments', `지원하지 않는 스킬 명령: ${command}`)
  options.onEvent?.({ type: 'event', channel: 'skills:started', payload: { command, action } })
  const managerParams = updateParams(action, params, root)
  if (action === 'watch' && options.timeout !== undefined) {
    managerParams.timeoutMs = Math.min(managerParams.timeoutMs === undefined ? options.timeout : managerParams.timeoutMs, options.timeout)
  }
  if (options.onEvent) managerParams.onEvent = event => {
    const normalized = normalizeEvent(event)
    if (normalized) options.onEvent(normalized)
  }
  const result = await execute(action, managerParams)
  options.onEvent?.({ type: 'event', channel: 'skills:completed', payload: { command, action } })
  return result
}

function runProcess (program, args, { timeout, onEvent } = {}) {
  return new Promise((resolve, reject) => {
    let output = ''
    let errorOutput = ''
    let errorLines = ''
    let finished = false
    const child = spawn(program, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    const finish = (error, result) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      error ? reject(error) : resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish(new SkillsError('timeout', `모션그래픽 스튜디오가 ${timeout} ms 안에 끝나지 않았습니다.`))
    }, timeout)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    const publishEvent = (line) => {
      if (!line) return
      try {
        const normalized = normalizeEvent(JSON.parse(line))
        if (normalized) onEvent?.(normalized)
      } catch {}
    }
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => {
      errorOutput += chunk
      errorLines += chunk
      let end
      while ((end = errorLines.indexOf('\n')) !== -1) {
        publishEvent(errorLines.slice(0, end).replace(/\r$/, ''))
        errorLines = errorLines.slice(end + 1)
      }
    })
    child.once('error', error => finish(new SkillsError('studio_unavailable', `Python 스튜디오를 실행할 수 없습니다: ${error.message}`)))
    child.once('close', code => {
      if (finished) return
      publishEvent(errorLines)
      if (code !== 0) return finish(new SkillsError('studio_failed', errorOutput.trim() || `모션그래픽 스튜디오가 종료 코드 ${code}로 끝났습니다.`))
      const lines = output.trim().split(/\r?\n/).filter(Boolean)
      if (lines.length !== 1) return finish(new SkillsError('studio_failed', '모션그래픽 스튜디오는 성공 시 JSON 완료 응답 한 줄을 반환해야 합니다.'))
      let result
      try { result = JSON.parse(lines[0]) } catch { return finish(new SkillsError('studio_failed', '모션그래픽 스튜디오가 JSON 완료 응답을 반환하지 않았습니다.')) }
      if (!result || typeof result !== 'object' || Array.isArray(result)) return finish(new SkillsError('studio_failed', '모션그래픽 스튜디오 완료 응답은 JSON 객체여야 합니다.'))
      finish(null, result)
    })
  })
}

async function studioScript (options = {}) {
  const root = bundledRoot(options)
  return requireFile(path.join(root, 'skills', 'road-music-video-studio', 'scripts', 'studio.py'), '동봉 HTML 모션그래픽 스튜디오를 찾을 수 없습니다. npm run setup:cli로 스킬 번들을 설치하세요.')
}

async function existingFile (value, label) {
  try {
    const info = await fs.stat(value)
    if (!info.isFile()) throw new Error('not a file')
  } catch {
    throw new SkillsError('invalid_arguments', `${label} 파일을 찾을 수 없습니다: ${value}`)
  }
}

async function newProjectPath (value) {
  try {
    await fs.access(value)
    throw new SkillsError('output_exists', `새 모션그래픽 프로젝트 경로가 이미 존재합니다: ${value}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  try {
    const info = await fs.stat(path.dirname(value))
    if (!info.isDirectory()) throw new Error('not a directory')
  } catch {
    throw new SkillsError('invalid_arguments', `프로젝트 상위 폴더를 찾을 수 없습니다: ${path.dirname(value)}`)
  }
}

async function runMotion (command, params = {}, options = {}) {
  const script = await studioScript(options)
  const python = options.python || process.env.ROADMUSIC_PYTHON || 'python3'
  const timeout = options.timeout || 3_600_000
  let args
  if (command === 'motion:handoff') {
    await newProjectPath(params.out)
    args = [script, 'init', '--out', params.out]
    if (params.music) {
      await existingFile(params.music, '음원')
      args.push('--music', params.music)
    }
    if (params.mode) args.push('--mode', params.mode)
    if (params.host) args.push('--host', params.host)
  } else if (command === 'motion:studio') {
    try {
      const info = await fs.stat(params.project)
      if (!info.isDirectory()) throw new Error('not a directory')
    } catch {
      throw new SkillsError('invalid_arguments', `모션그래픽 프로젝트 폴더를 찾을 수 없습니다: ${params.project}`)
    }
    args = [script, 'serve', '--project', params.project]
    if (params.music) {
      await existingFile(params.music, '음원')
      args.push('--music', params.music)
    }
    if (params.host) args.push('--host', params.host)
    if (params.open) args.push('--open')
    if (params.review) args.push('--review')
    if (params.timeout !== undefined) args.push('--timeout', String(params.timeout))
  } else {
    throw new SkillsError('invalid_arguments', `지원하지 않는 모션그래픽 명령: ${command}`)
  }
  options.onEvent?.({ type: 'event', channel: 'motion:started', payload: { command, project: params.out || params.project } })
  const result = await runProcess(python, args, { timeout, onEvent: options.onEvent })
  options.onEvent?.({ type: 'event', channel: 'motion:completed', payload: { command, project: params.out || params.project } })
  if (command !== 'motion:handoff') return result
  return { ...result, nextCommand: { command: 'motion:studio', params: { project: params.out, host: params.host || 'codex', open: true } } }
}

function isLocalCommand (command) {
  return command.startsWith('skills:') || command.startsWith('motion:')
}

async function execute (command, params, options) {
  if (command.startsWith('skills:')) return runSkills(command, params, options)
  if (command.startsWith('motion:')) return runMotion(command, params, options)
  throw new SkillsError('invalid_arguments', `지원하지 않는 로컬 명령: ${command}`)
}

module.exports = { SkillsError, bundledRoot, execute, isLocalCommand, normalizeEvent, runMotion, runSkills }
