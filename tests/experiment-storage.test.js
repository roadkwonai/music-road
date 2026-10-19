'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')

test('완성본과 작업 자료는 Git에서 제외하고 프로그램과 harness 설정은 유지한다', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-ignore-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  execFileSync('git', ['init', '-q', root])
  await fs.copyFile(path.join(process.cwd(), '.gitignore'), path.join(root, '.gitignore'))
  const ignored = entry => {
    try {
      execFileSync('git', ['-C', root, '-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', '-q', entry])
      return true
    } catch (error) {
      assert.equal(error.status, 1)
      return false
    }
  }
  for (const entry of [
    'scripts/package-cli.js',
    '.agents/skills/road-music-video-studio/scripts/storage_restructure.py',
    '.harness/config.json',
  ]) assert.equal(ignored(entry), false, entry)
  for (const entry of [
    'Output/female-ballads-20261016/production-report.json',
    'Output/female-ballads-20261016/runtime/ace/turbo-2b-lm-0.6b-lowcache/data/engines/ace-step/src/checkpoints/model.safetensors',
    'Output/female-ballads-20261016/runtime/ace/turbo-2b-lm-0.6b-lowcache/masters/song.wav',
    'Output/female-ballads-20261016/runtime/yue/converted/model.safetensors',
    'Output/female-ballads-optimized-20261016/runtime/ace/turbo-2b-lm-1.7b-locked-lyrics/data/engines/ace-step/src/checkpoints/model.safetensors',
    '.harness/work/render/result.mp4',
    '.roadmusic/work/song/project/cache/frame.png',
    '.roadmusic/history.sqlite3',
    '_workspace/communications/private-session.jsonl',
    '.harness/runs/private-run/plan.json',
    '.agents/skills/.music-road-skills/managed.json',
    '.agents/skills/road-music-showreel-playlist/local-copy.json',
    'Output/완성곡/프로젝트/20261019-120000/final.mp3',
  ]) assert.equal(ignored(entry), true, entry)
})
