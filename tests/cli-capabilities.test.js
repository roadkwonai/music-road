'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCapabilities } = require('../electron/cli-capabilities')

const command = (name, extra = {}) => ({ command: name, ...extra })
const engines = (overrides = {}) => [
  { id: 'ace', installed: true, check: { ok: true, problems: [], warnings: [], freeGb: 100, needGb: 10 }, ...overrides.ace },
  { id: 'yue', installed: false, check: { ok: true, problems: [], warnings: [], freeGb: 100, needGb: 10 }, ...overrides.yue },
  { id: 'yue-mlx', installed: false, check: { ok: true, problems: [], warnings: [], freeGb: 100, needGb: 10 }, ...overrides['yue-mlx'] }
]
const base = (platform, extra = {}) => buildCapabilities({
  platform,
  commands: [
    command('app:state'),
    command('song:lyrics'),
    command('song:replace'),
    command('song:restore'),
    command('app:screenshot'),
    command('songs:import', { dialog: 'open' }),
    command('lyrics:check', { renderer: true }),
    command('video:render', { renderer: true })
  ],
  supportedEngines: engines(),
  rendererReady: true,
  ffmpegAvailable: true,
  versions: { appVersion: '1.2.3', cliVersion: '0.1.0' },
  root: '/library',
  ...extra
})

test('reports the running service, public command availability, and installed engines on macOS', () => {
  const result = base('darwin')
  assert.equal(result.source, 'running-service')
  assert.equal(result.platform, 'darwin')
  assert.deepEqual(result.versions, { appVersion: '1.2.3', cliVersion: '0.1.0' })
  assert.equal(result.root, '/library')
  assert.deepEqual(result.execution, { busy: false, newWorkCanStart: true, reason: null })
  assert.deepEqual(result.commands.find(item => item.command === 'app:state'), {
    command: 'app:state', supported: true, available: true, requires: [], reason: null
  })
  const ace = result.engines.find(item => item.id === 'ace')
  assert.equal(ace.supported, true)
  assert.equal(ace.installed, true)
  assert.equal(ace.hardwareReady, true)
  assert.equal(ace.ready, true)
  assert.equal(ace.installable, true)
  assert.equal(ace.reason, null)
  const yue = result.engines.find(item => item.id === 'yue')
  assert.equal(yue.supported, false)
  assert.match(yue.reason, /macOS/)
  const mlx = result.engines.find(item => item.id === 'yue-mlx')
  assert.equal(mlx.supported, true)
  assert.equal(mlx.installed, false)
  assert.equal(mlx.hardwareReady, true)
  assert.equal(mlx.ready, false)
  assert.equal(mlx.installable, true)
})

test('keeps temporary renderer and ffmpeg prerequisites separate from permanent support', () => {
  const result = base('darwin', { rendererReady: false, ffmpegAvailable: false, busy: true })
  const lyrics = result.commands.find(item => item.command === 'lyrics:check')
  assert.equal(lyrics.supported, true)
  assert.equal(lyrics.available, false)
  assert.deepEqual(lyrics.requires, ['renderer'])
  assert.match(lyrics.reason, /renderer/)
  assert.deepEqual(result.execution, { busy: true, newWorkCanStart: false, reason: '다른 작업이 실행 중입니다.' })
  const video = result.commands.find(item => item.command === 'video:render')
  assert.equal(video.supported, true)
  assert.equal(video.available, false)
  assert.deepEqual(video.requires, ['renderer', 'ffmpeg'])
  assert.match(video.reason, /renderer.*ffmpeg/)
})

test('reports Windows lyrics policy and replace/restore policies without changing command support elsewhere', () => {
  const result = base('win32', {
    lyricsWindowsPolicy: { supported: false, reason: 'Windows 안전 저장 검증이 완료되지 않았습니다.' },
    operationPolicies: {
      'song:replace': { supported: false, reason: '현재 플랫폼에서 최종본 교체를 지원하지 않습니다.' },
      'song:restore': { supported: true }
    }
  })
  const byName = name => result.commands.find(item => item.command === name)
  assert.deepEqual(byName('song:lyrics').requires, [])
  assert.equal(byName('song:lyrics').supported, false)
  assert.equal(byName('song:lyrics').available, false)
  assert.match(byName('song:lyrics').reason, /안전 저장/)
  assert.equal(byName('song:replace').supported, false)
  assert.match(byName('song:replace').reason, /최종본 교체/)
  assert.equal(byName('song:restore').supported, true)
  assert.equal(byName('song:restore').available, true)
  assert.equal(result.engines.find(item => item.id === 'yue').supported, true)
  assert.equal(result.engines.find(item => item.id === 'yue-mlx').supported, false)
})

test('reports Linux platform restrictions and dialog requirements without treating model installation as command support', () => {
  const result = base('linux', { rendererReady: false })
  const imported = result.commands.find(item => item.command === 'songs:import')
  assert.equal(imported.supported, true)
  assert.equal(imported.available, true)
  assert.deepEqual(imported.requires, ['dialog', 'ffmpeg'])
  const screenshot = result.commands.find(item => item.command === 'app:screenshot')
  assert.equal(screenshot.supported, true)
  assert.equal(screenshot.available, false)
  assert.deepEqual(screenshot.requires, ['renderer'])
  assert.match(screenshot.reason, /renderer/)
  assert.equal(result.engines.find(item => item.id === 'yue').supported, false)
  assert.equal(result.engines.find(item => item.id === 'yue-mlx').supported, false)
  const ace = result.engines.find(item => item.id === 'ace')
  assert.equal(ace.supported, true)
  assert.equal(ace.installed, true)
})

test('keeps a macOS memory check and a Windows GPU check separate from platform support', () => {
  const mac = base('darwin', {
    supportedEngines: engines({
      'yue-mlx': { installed: true, check: { ok: false, problems: ['메모리 32GB 이상이 필요합니다.'], warnings: [], freeGb: 100, needGb: 30 } }
    })
  })
  const mlx = mac.engines.find(item => item.id === 'yue-mlx')
  assert.equal(mlx.supported, true)
  assert.equal(mlx.hardwareReady, false)
  assert.equal(mlx.installed, true)
  assert.equal(mlx.installable, false)
  assert.equal(mlx.ready, false)
  assert.match(mlx.reason, /32GB/)
  assert.deepEqual(mlx.check, { ok: false, problems: ['메모리 32GB 이상이 필요합니다.'], warnings: [], freeGb: 100, needGb: 30 })

  const win = base('win32', {
    supportedEngines: engines({
      yue: { installed: false, check: { ok: false, problems: ['지원되는 NVIDIA GPU를 찾지 못했습니다.'], warnings: [], freeGb: 100, needGb: 20 } }
    })
  })
  const yue = win.engines.find(item => item.id === 'yue')
  assert.equal(yue.supported, true)
  assert.equal(yue.hardwareReady, false)
  assert.equal(yue.installable, false)
  assert.equal(yue.ready, false)
  assert.match(yue.reason, /NVIDIA/)
})

test('uses declared command requirements while adding canonical import and replacement prerequisites', () => {
  const result = base('darwin', {
    ffmpegAvailable: false,
    commands: [
      command('songs:import', { requires: ['library-write'] }),
      command('song:replace'),
      command('song:restore', { requires: ['backup'] })
    ]
  })
  const byName = name => result.commands.find(item => item.command === name)
  assert.deepEqual(byName('songs:import').requires, ['library-write', 'ffmpeg'])
  assert.equal(byName('songs:import').available, false)
  assert.deepEqual(byName('song:replace').requires, ['ffmpeg'])
  assert.equal(byName('song:replace').available, false)
  assert.deepEqual(byName('song:restore').requires, ['backup'])
  assert.equal(byName('song:restore').available, true)
})

