'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { studioRoot } = require('../cli/studio')

test('storage manager safety suites pass from the active studio source', () => {
  for (const name of ['test_management_db.py', 'test_storage_tracking.py', 'test_storage_entity_removal.py', 'test_storage_manager.py', 'test_storage_legacy.py', 'test_storage_packaging.py', 'test_storage_maintenance.py', 'test_storage_scan.py', 'test_asset_copy.py', 'test_storage_git.py', 'test_storage_verification.py', 'test_storage_mv.py', 'test_storage_overview.py', 'test_storage_sweep.py', 'test_storage_lifecycle.py', 'test_storage_artifacts.py', 'test_storage_archive_history.py', 'test_storage_retirement.py', 'test_delivery_store.py', 'test_storage_runtime_rescue.py', 'test_storage_restructure.py', 'test_storage_file_removal.py', 'test_storage_project_finish.py']) {
    const script = path.join(studioRoot(), 'scripts', name)
    assert.equal(fs.existsSync(script), true, `missing storage suite: ${script}`)
    const result = spawnSync('python3', [script], { encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  }
})
