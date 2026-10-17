#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { runSkills } = require('../cli/skills')

const root = path.resolve(__dirname, '..')
const hosts = new Set(['codex', 'antigravity', 'antigravity-cli'])
const bundleRelativePath = path.join('skills', 'music-road-skills')

function parseArgs (argv) {
  const result = { host: 'codex' }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!['--host', '--skills-target'].includes(flag) || value === undefined || value.startsWith('--')) throw new Error('사용법: npm run setup:cli -- [--host codex|antigravity|antigravity-cli] [--skills-target 절대경로]')
    index += 1
    if (flag === '--host') {
      if (!hosts.has(value)) throw new Error('--host는 codex, antigravity 또는 antigravity-cli여야 합니다.')
      result.host = value
    } else {
      if (!path.isAbsolute(value)) throw new Error('--skills-target은 절대 경로여야 합니다.')
      result.target = path.resolve(value)
    }
  }
  return result
}

function assertNode24 (version = process.versions.node) {
  if (Number(version.split('.')[0]) !== 24) throw new Error(`Node.js 24 LTS가 필요합니다. 현재: ${version}`)
}

function npmCi ({ cwd = root, spawnProcess = spawn, stderr = process.stderr } = {}) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, ['ci', '--include=dev'], { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.pipe(stderr, { end: false })
    child.stderr?.pipe(stderr, { end: false })
    child.once('error', error => reject(new Error(`npm ci 실행 실패: ${error.message}`)))
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`npm ci가 종료 코드 ${code}로 끝났습니다.`)))
  })
}

function gitSubmoduleUpdate ({ cwd, spawnProcess = spawn, stderr = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess('git', ['submodule', 'update', '--init', '--depth', '1', '--', bundleRelativePath], { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.pipe(stderr, { end: false })
    child.stderr?.pipe(stderr, { end: false })
    child.once('error', error => reject(new Error(`스킬 서브모듈 준비 실패: ${error.message}`)))
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`스킬 서브모듈 준비가 종료 코드 ${code}로 끝났습니다.`)))
  })
}

async function exists (file) {
  try { await fs.access(file); return true } catch { return false }
}

async function prepareSkillsBundle ({ projectRoot = root, runGit = gitSubmoduleUpdate, spawnProcess, stderr } = {}) {
  const bundle = path.join(projectRoot, bundleRelativePath)
  const manifest = path.join(bundle, 'manifest.json')
  if (await exists(manifest)) return bundle
  if (!(await exists(path.join(projectRoot, '.git')))) {
    throw new Error('동봉 music-road-skills 번들이 없습니다. 배포 ZIP은 누락된 번들을 복구할 수 없으므로 완전한 CLI 키트를 다시 받으세요.')
  }
  await runGit({ cwd: projectRoot, spawnProcess, stderr })
  if (!(await exists(manifest))) throw new Error('스킬 서브모듈을 준비했지만 skills/music-road-skills/manifest.json을 찾지 못했습니다.')
  return bundle
}

async function setupCli (options = {}) {
  assertNode24(options.nodeVersion)
  const projectRoot = options.root || root
  await (options.npmCi || npmCi)({ cwd: projectRoot, spawnProcess: options.spawnProcess, stderr: options.stderr })
  const skillsRoot = await prepareSkillsBundle({ projectRoot, runGit: options.runGit, spawnProcess: options.spawnProcess, stderr: options.stderr })
  const install = options.installSkills || runSkills
  const result = await install('skills:install', { host: options.host || 'codex', ...(options.target ? { target: options.target } : {}) }, {
    skillsRoot, onEvent: options.onEvent
  })
  return { node: process.versions.node, skills: result }
}

if (require.main === module) {
  let options
  try { options = parseArgs(process.argv.slice(2)) } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
    return
  }
  setupCli({ ...options, stderr: process.stderr }).then(result => {
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n')
  }).catch(error => {
    process.stdout.write(JSON.stringify({ ok: false, error: { code: error.code || 'setup_failed', message: error.message } }) + '\n')
    process.exitCode = 1
  })
}

module.exports = { assertNode24, gitSubmoduleUpdate, npmCi, parseArgs, prepareSkillsBundle, setupCli }
