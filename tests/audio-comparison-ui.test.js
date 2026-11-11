const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

test('registered audio A/B comparison preserves ranges and playback state', () => {
  const script = path.join(__dirname, '..', '.agents', 'skills', 'road-music-video-studio', 'scripts', 'test_works_ui.mjs')
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 15000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})
