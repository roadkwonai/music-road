'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')
const { createHash } = require('node:crypto')
const { commands } = require('../electron/cli-catalog')
const exec = promisify(execFile)
const cliPath = path.resolve(__dirname, '../cli/road-music.js')

test('library CLI preserves originals and tags, replaces/restores in place, and captures the actual lyrics window', { timeout: 120000 }, async t => {
  for (const name of ['app:capabilities', 'app:screenshot', 'song:replace', 'song:restore', 'song:backups', 'song:info']) {
    assert.ok(commands[name], `Missing public command: ${name}`)
  }
  let ffmpeg
  try { ffmpeg = (await exec(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'])).stdout.trim().split(/\r?\n/)[0] } catch {
    t.skip('ffmpeg is required for the real import and screenshot integration check')
    return
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-library-e2e-'))
  let servicePid
  const data = path.join(root, 'data'); const songs = path.join(root, 'Songs')
  await fs.mkdir(data); await fs.mkdir(songs)
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ songsDir: songs, dataDir: data,
    engineSetupSkipped: true, language: 'ko', project: 'QA', ffmpeg }))
  const cli = async (command, params, extra = []) => {
    const args = [cliPath, command]
    if (params !== undefined) args.push('--json', JSON.stringify(params))
    const { stdout } = await exec(process.execPath, [...args, ...extra], {
      env: { ...process.env, ROADMUSIC_DATA_DIR: data }, maxBuffer: 4 * 1024 * 1024, timeout: 45000
    })
    const row = JSON.parse(stdout.trim()); assert.equal(row.ok, true, stdout)
    if (row.result && typeof row.result === 'object') assert.notEqual(row.result.ok, false, stdout)
    return row.result
  }
  t.after(async () => {
    await cli('service:stop', undefined, ['--confirm']).catch(() => {})
    for (let attempt = 0; servicePid && attempt < 50; attempt++) {
      try { process.kill(servicePid, 0) } catch { break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  const source = path.join(root, 'filename differs.flac')
  const lyrics = '[Verse]\r\n첫 줄은 그대로  \r\n둘째 줄도 그대로\\=;\n\n[Chorus]\n나의 길을 걸어가'
  await exec(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.4',
    '-c:a', 'flac', '-sample_fmt', 's32', '-metadata', 'title=검증 곡', '-metadata', 'artist=검증 가수',
    '-metadata', 'album=테스트 앨범', '-metadata', 'lyrics=' + lyrics, source])
  const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex')
  const sourceHash = await hash(source)
  const cap = await cli('app:capabilities')
  servicePid = (await cli('service:status')).pid
  assert.equal(cap.source, 'running-service')
  assert.equal(cap.dataDir, data)
  assert.equal(cap.songsDir, songs)
  assert.ok(cap.commands.some(c => c.command === 'song:replace' && c.supported))
  await cli('songs:import', undefined, ['--input', source])
  let listed = await cli('songs:list'); assert.equal(listed.length, 1)
  const original = listed[0]
  assert.equal(original.title, '검증 곡')
  assert.equal(original.artist, '검증 가수')
  assert.equal(original.album, '테스트 앨범')
  assert.equal(original.lyrics, lyrics)
  assert.equal(await hash(source), sourceHash)
  // Compare full decoded samples rather than assuming a lossless codec implies preservation.
  const pcm = async file => (await exec(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:a:0',
    '-c:a', 'pcm_s32le', '-f', 'hash', '-hash', 'sha256', '-'])).stdout.trim()
  assert.equal(await pcm(original.audio), await pcm(source))
  const originalAudioHash = await hash(original.audio)
  const info = await cli('song:info', { dir: original.dir })
  assert.equal(info.lyrics, lyrics)
  assert.equal(info.displayedLyrics, lyrics)
  assert.equal(info.lyricsMatch, true)
  assert.equal((await cli('player:state')).playing, false)
  const screenshot = path.join(root, 'lyrics.png')
  await cli('app:screenshot', undefined, ['--output', screenshot])
  const png = await fs.readFile(screenshot)
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  assert.ok(png.readUInt32BE(16) >= 1000)
  if (process.env.ROADMUSIC_QA_ARTIFACT_DIR) {
    const artifacts = path.resolve(process.env.ROADMUSIC_QA_ARTIFACT_DIR)
    await fs.mkdir(artifacts, { recursive: true })
    await fs.copyFile(screenshot, path.join(artifacts, 'library-lyrics.png'))
    await fs.writeFile(path.join(artifacts, 'capabilities.json'), JSON.stringify(cap, null, 2))
  }
  await cli('song:info', { dir: original.dir, open: false })
  await cli('songs:reorder', { folders: [original.folder] })
  const orderPath = path.join(path.dirname(original.dir), '.roadmusic-order.json')
  const orderHash = await hash(orderPath)
  const second = path.join(root, 'replacement.mp3')
  await exec(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.3',
    '-c:a', 'libmp3lame', '-metadata', 'title=최종 제목', '-metadata', 'artist=최종 가수',
    '-metadata', 'lyrics=[Chorus]\n확정 가사', second])
  const replaced = await cli('song:replace', { dir: original.dir }, ['--input', second])
  assert.ok(replaced.backup)
  assert.ok((await cli('song:backups', { dir: original.dir })).backups.some(b => b.backup === replaced.backup))
  listed = await cli('songs:list'); assert.equal(listed.length, 1)
  assert.equal(listed[0].dir, original.dir)
  assert.equal(listed[0].position, 0)
  assert.equal(listed[0].title, '최종 제목')
  assert.equal(listed[0].lyrics, '[Chorus]\n확정 가사')
  assert.equal(await hash(listed[0].audio), await hash(second))
  assert.equal(await hash(orderPath), orderHash)
  await cli('song:restore', { dir: original.dir, backup: replaced.backup })
  listed = await cli('songs:list'); assert.equal(listed.length, 1)
  assert.equal(listed[0].dir, original.dir)
  assert.equal(listed[0].title, original.title)
  assert.equal(listed[0].lyrics, lyrics)
  assert.equal(await hash(listed[0].audio), originalAudioHash)
  assert.equal(await hash(orderPath), orderHash)
  assert.equal(await hash(source), sourceHash)
})
