'use strict'

const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const tool = path.join(__dirname, '..', 'python', 'yue_score_tools.py')
const officialHelper = path.join(__dirname, '..', 'python', 'abc_tools.py')
const score = `X:1
T:
M:4/4
L:1/32
Q:1/4=80
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% verse
V: Vocal
"C"C32|
V: Ins
Z|
`

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'road-music-yue-score-'))
  const moduleDir = path.join(root, 'engine', 'src', 'src', 'lyra', 'music_tools')
  fs.mkdirSync(moduleDir, { recursive: true })
  fs.writeFileSync(path.join(root, 'engine', 'paths.json'), '{}')
  fs.writeFileSync(path.join(moduleDir, 'abc_tools.py'), fs.readFileSync(officialHelper))
  fs.writeFileSync(path.join(root, 'engine', 'src', 'src', 'lyra', '__init__.py'), '')
  fs.writeFileSync(path.join(moduleDir, '__init__.py'), '')
  const request = (name, value) => {
    const file = path.join(root, `${name}.json`)
    fs.writeFileSync(file, JSON.stringify(value))
    return file
  }
  return { root, engine: path.join(root, 'engine'), request }
}

function run(action, request, engine) {
  const result = spawnSync('python3', [tool, action, '--request', request], {
    encoding: 'utf8', env: { ...process.env, ROADMUSIC_YUE_MLX_ROOT: engine }, timeout: 15000,
  })
  assert.match(result.stdout, /^\{.*\}\n$/s, result.stderr)
  return { result, body: JSON.parse(result.stdout) }
}

test('YuE score tools use the installed public ABC API for inspection and selected invariants', () => {
  const f = fixture()
  const inspected = run('inspect', f.request('inspect', { text: score }), f.engine)
  assert.equal(inspected.result.status, 0, inspected.result.stderr)
  assert.equal(inspected.body.ok, true)
  assert.equal(inspected.body.result.bpm, 80)
  assert.deepEqual(inspected.body.result.sectionGrid, [{ labels: ['verse'], barStart: 1, barCount: 1 }])

  const changedChord = score.replace('"C"', '"Am7"')
  const freeHarmony = run('compare', f.request('free-harmony', {
    source: { text: score }, candidate: { text: changedChord },
  }), f.engine)
  assert.equal(freeHarmony.result.status, 0, freeHarmony.result.stderr)
  assert.equal(freeHarmony.body.result.match, true)

  const fixedHarmony = run('compare', f.request('fixed-harmony', {
    source: { text: score }, candidate: { text: changedChord }, invariants: { harmony: true },
  }), f.engine)
  assert.equal(fixedHarmony.result.status, 0, fixedHarmony.result.stderr)
  assert.equal(fixedHarmony.body.result.match, false)
  assert.match(fixedHarmony.body.result.differences.join('\n'), /chord events differ/)

  const stripped = run('strip-chords', f.request('stripped', { text: score, voice: 'Vocal' }), f.engine)
  assert.equal(stripped.result.status, 0, stripped.result.stderr)
  assert.doesNotMatch(stripped.body.result.abc, /"C"/)
})

test('YuE score tools report missing runtime without installing anything', () => {
  const f = fixture()
  const result = spawnSync('python3', [tool, 'capabilities', '--request', f.request('capabilities', {})], {
    encoding: 'utf8', env: { ...process.env, ROADMUSIC_YUE_MLX_ROOT: '' },
  })
  assert.equal(result.status, 0, result.stderr)
  const body = JSON.parse(result.stdout)
  assert.equal(body.ok, true)
  assert.equal(body.result.downloads, false)
  assert.equal(body.result.yueMlx.available, false)
})

test('YuE score transcription only runs a selected local infer.py offline and preserves failed output', async () => {
  const f = fixture()
  const model = path.join(f.root, 'SheetSage2')
  fs.mkdirSync(model)
  const audio = path.join(f.root, 'source.wav')
  fs.writeFileSync(audio, 'audio')
  const infer = `import os, pathlib, signal, sys, time
out = pathlib.Path(sys.argv[sys.argv.index('--output') + 1])
out.mkdir()
(out / 'marker.txt').write_text('started')
(out / 'argv.txt').write_text(' '.join(sys.argv[1:]))
if os.environ.get('FAIL'):
    print('warning: local fixture failure', file=sys.stderr)
    raise SystemExit(2)
if os.environ.get('SLOW'):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    time.sleep(30)
(out / 'score.abc').write_text(${JSON.stringify(score)})
print('warning: fixture warning', file=sys.stderr)
`
  fs.writeFileSync(path.join(model, 'infer.py'), infer)
  const python = path.join(f.root, 'python311')
  fs.writeFileSync(python, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Python 3.11.9"; exit 0; fi\nexec python3 "$@"\n')
  fs.chmodSync(python, 0o755)
  const output = path.join(f.root, 'transcription')
  const request = f.request('transcribe', { audio, output, python, modelDir: model, task: 'melody-full', timeoutSeconds: 30 })
  const success = run('transcribe', request, f.engine)
  assert.equal(success.result.status, 0, success.result.stderr)
  assert.equal(success.body.result.score, path.join(output, 'score.abc'))
  assert.equal(success.body.result.melodyOnly, true)
  assert.match(fs.readFileSync(path.join(output, 'argv.txt'), 'utf8'), /--melody-only/)
  assert.match(success.body.result.warnings.join('\n'), /fixture warning/)

  const vocalOutput = path.join(f.root, 'vocal-only')
  const vocalRequest = f.request('vocal-only', { audio, output: vocalOutput, python, modelDir: model, task: 'melody-vocal' })
  const vocal = run('transcribe', vocalRequest, f.engine)
  assert.equal(vocal.result.status, 0, vocal.result.stderr)
  assert.equal(vocal.body.result.score, path.join(vocalOutput, 'score-vocal.abc'))
  assert.equal(vocal.body.result.originalScore, path.join(vocalOutput, 'score.abc'))
  assert.match(fs.readFileSync(vocal.body.result.originalScore, 'utf8'), /"C"/)
  assert.doesNotMatch(fs.readFileSync(vocal.body.result.score, 'utf8'), /"C"/)
  const sameGrid = run('compare', f.request('same-grid', {
    source: { file: vocal.body.result.originalScore }, candidate: { file: vocal.body.result.score },
  }), f.engine)
  assert.equal(sameGrid.body.result.match, true)

  const invalidVocal = run('transcribe', f.request('invalid-vocal', {
    audio, output: path.join(f.root, 'invalid-vocal'), python, modelDir: model, task: 'melody-vocal', melodyOnly: false,
  }), f.engine)
  assert.equal(invalidVocal.result.status, 1)
  assert.equal(invalidVocal.body.ok, false)

  const failedOutput = path.join(f.root, 'failed')
  const failedRequest = f.request('failure', { audio, output: failedOutput, python, modelDir: model })
  const failed = spawnSync('python3', [tool, 'transcribe', '--request', failedRequest], {
    encoding: 'utf8', env: { ...process.env, ROADMUSIC_YUE_MLX_ROOT: f.engine, FAIL: '1' }, timeout: 15000,
  })
  assert.equal(failed.status, 1)
  assert.equal(JSON.parse(failed.stdout).ok, false)
  assert.equal(fs.readFileSync(path.join(failedOutput, 'marker.txt'), 'utf8'), 'started')

  const cancelOutput = path.join(f.root, 'cancelled')
  const cancelRequest = f.request('cancel', { audio, output: cancelOutput, python, modelDir: model })
  const child = spawn('python3', [tool, 'transcribe', '--request', cancelRequest], {
    env: { ...process.env, ROADMUSIC_YUE_MLX_ROOT: f.engine, SLOW: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise(resolve => setTimeout(resolve, 300))
  child.kill('SIGTERM')
  const code = await new Promise(resolve => child.once('close', resolve))
  assert.equal(code, 1)
  assert.equal(fs.readFileSync(path.join(cancelOutput, 'marker.txt'), 'utf8'), 'started')
})
