'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8')

function loadSetupCheck ({ MAC, engineCheck }) {
  const start = source.indexOf('function setupSkipReason')
  const end = source.indexOf('const preflight', start)
  assert.notEqual(start, -1, 'setup:check must explicitly identify platform-skipped engines')
  const context = { MAC, ENGINES: { ace: {}, yue: {}, 'yue-mlx': {} }, engineCheck }
  vm.runInNewContext(source.slice(start, end), context)
  return context.setupCheck
}

test('setup:check skips Windows YuE but checks Apple Silicon YuE on macOS', async () => {
  const checked = []
  const setupCheck = loadSetupCheck({
    MAC: true,
    engineCheck: async id => { checked.push(id); return { ok: true, gpu: { name: 'M1 Ultra' }, problems: [], warnings: [] } }
  })

  const result = await setupCheck()
  assert.deepEqual(checked.sort(), ['ace', 'yue-mlx'])
  assert.equal(result.ok, true)
  assert.equal(result.engines.ace.ok, true)
  assert.deepEqual(JSON.parse(JSON.stringify(result.skipped)), [{ id: 'yue', reason: 'YuE2 (Windows NVIDIA)는 macOS에서 지원하지 않습니다. Apple Silicon에서는 YuE2 (Apple Silicon)를 선택해 주세요.' }])
})

test('setup:check retains an ACE failure on macOS while YuE is skipped', async () => {
  const failure = { ok: false, gpu: { name: 'M1 Ultra' }, problems: ['ACE 메모리 부족'], warnings: [] }
  const setupCheck = loadSetupCheck({ MAC: true, engineCheck: async () => failure })

  const result = await setupCheck()
  assert.equal(result.ok, false)
  assert.deepEqual(JSON.parse(JSON.stringify(result.problems)), failure.problems)
  assert.equal(result.engines.ace, failure)
  assert.equal(result.skipped[0].id, 'yue')
  assert.ok(result.engines['yue-mlx'])
})

test('setup:check evaluates YuE on platforms where it is supported', async () => {
  const checked = []
  const checks = {
    ace: { ok: false, gpu: { name: 'RTX 30' }, needGb: 18, problems: ['ACE 오류'], warnings: [] },
    yue: { ok: true, gpu: { name: 'RTX 30' }, needGb: 20, problems: [], warnings: [] }
  }
  const setupCheck = loadSetupCheck({
    MAC: false,
    engineCheck: async id => { checked.push(id); return checks[id] }
  })

  const result = await setupCheck()
  assert.deepEqual(checked.sort(), ['ace', 'yue'])
  assert.equal(result.ok, true)
  assert.equal(result.needGb, 20)
  assert.equal(result.engines.yue, checks.yue)
  assert.deepEqual(JSON.parse(JSON.stringify(result.skipped)), [{ id: 'yue-mlx', reason: 'YuE2 (Apple Silicon)는 Apple Silicon 맥에서만 지원합니다.' }])
})

test('setup:check IPC returns the aggregate setup check', async () => {
  let setupCheckHandler
  const expected = { ok: true, skipped: [{ id: 'yue', reason: 'YuE2 (Windows NVIDIA)는 macOS에서 지원하지 않습니다. Apple Silicon에서는 YuE2 (Apple Silicon)를 선택해 주세요.' }] }
  const context = {
    ipcMain: { handle: (channel, handler) => { if (channel === 'setup:check') setupCheckHandler = handler } },
    setupCheck: async () => expected
  }
  const start = source.indexOf("ipcMain.handle('setup:check'")
  const end = source.indexOf('// The engine screen:', start)
  vm.runInNewContext(source.slice(start, end), context)

  assert.equal(await setupCheckHandler(), expected)
})
