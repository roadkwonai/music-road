'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { studioRoot } = require('../cli/studio')
for (const name of ['test_production_ledger.py', 'test_production_inventory.py', 'test_production_dashboard.py', 'test_studio_updates.py', 'test_production_runtime.py', 'test_recipe_library.py']) {
  test(`production regression: ${name}`, () => {
    const result = spawnSync('python3', [path.join(studioRoot(), 'scripts', name)], { encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  })
}

for (const name of ['test_production_ui.mjs', 'test_production_dashboard_ui.mjs', 'test_work_production_ui.mjs', 'test_production_activity_ui.mjs', 'test_recipe_library_ui.mjs']) {
  test(`production UI regression: ${name}`, () => {
    const result = spawnSync(process.execPath, [path.join(studioRoot(), 'scripts', name)], { encoding: 'utf8', timeout: 15000 })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  })
}
