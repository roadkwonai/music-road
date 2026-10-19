'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const media = require('../electron/library-media')

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

function encodeFfmetadataValue (value) {
  let encoded = ''
  for (const character of value) {
    if (character === '\\') encoded += '\\\\'
    else if (character === '\n') encoded += '\\\n'
    else if (character === '=' || character === ';' || character === '#') encoded += `\\${character}`
    else encoded += character
  }
  return encoded
}

async function fixture (t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-library-media-'))
  const songs = path.join(root, 'Songs')
  const input = path.join(root, 'input')
  await fs.mkdir(songs, { recursive: true })
  await fs.mkdir(input)
  const ffmpeg = path.join(root, 'fake-ffmpeg.js')
  await fs.writeFile(ffmpeg, `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
const at = args.indexOf('-i')
const input = at >= 0 ? args[at + 1] : ''
if (input.includes('broken')) process.exit(23)
if (args.includes('ffmetadata')) {
  process.stdout.write(fs.existsSync(input + '.tags') ? fs.readFileSync(input + '.tags', 'utf8') : ';FFMETADATA1\\n')
  process.exit(0)
}
if (args.length === 3 && args[0] === '-hide_banner') {
  process.stderr.write('Duration: 00:00:03.25, start: 0.000000, bitrate: 1 kb/s\\n')
  process.exit(1)
}
fs.copyFileSync(input, args.at(-1))
fs.writeFileSync(args.at(-1) + '.fake-input', input)
`, { mode: 0o755 })
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return { root, songs, input, ffmpeg }
}

async function file (dir, name, text, tags = '') {
  const target = path.join(dir, name)
  await fs.writeFile(target, text)
  if (tags) await fs.writeFile(target + '.tags', tags)
  return target
}

test('FLAC import preserves the original, exact escaped lyrics and high-depth conversion intent', async t => {
  const { songs, input, ffmpeg } = await fixture(t)
  const source = await file(input, '원본.flac', Buffer.from([0, 1, 250, 42]),
    ';FFMETADATA1\ntitle=  최종 노래  \nartist=벨루나\nalbum=밤\ngenre=트로트\ntrack=06\nlyrics=첫 줄\r\\\n둘째\\\\\\=줄\\; 끝\\\\  \\\n[CHAPTER]\\\n나의 길\n[CHAPTER]\nTIMEBASE=1/1000\ntitle=챕터 제목\n')
  const dir = path.join(songs, 'project', 'song')
  const result = await media.prepareImport({ file: source, dir, ffmpeg, titleFallback: '대체 제목', audioBase: songs })
  assert.equal(result.meta.title, '최종 노래')
  assert.equal(result.meta.artist, '벨루나')
  assert.equal(result.meta.lyrics, '첫 줄\r\n둘째\\=줄; 끝\\  \n[CHAPTER]\n나의 길')
  assert.equal(result.meta.audioFormat, 'pcm_s32le')
  assert.equal(result.meta.source.sha256, sha256(Buffer.from([0, 1, 250, 42])))
  assert.deepEqual(await fs.readFile(result.audio), Buffer.from([0, 1, 250, 42]))
  assert.deepEqual(await fs.readFile(path.join(dir, '.source', 'original.flac')), Buffer.from([0, 1, 250, 42]))
  assert.equal(result.meta.source.preservedPath, path.join(dir, '.source', 'original.flac'))
  assert.equal(await fs.readFile(`${result.audio}.fake-input`, 'utf8'), result.meta.source.preservedPath)
})

test('ffmetadata parser keeps escaped-newline parity and finite real-dump value cases', () => {
  const values = ['', '\\', '\\\\', '끝\\', '끝\\\\', 'a\r\nb', 'a\nb', 'a\r', '[CHAPTER]', 'x=;#\\\r\ny']
  for (const lyrics of values) {
    const parsed = media.parseFfmetadata(`;FFMETADATA1\nlyrics=${encodeFfmetadataValue(lyrics)}\nartist=벨루나\n`)
    assert.equal(parsed.lyrics, lyrics)
    assert.equal(parsed.artist, '벨루나')
  }
  assert.deepEqual(media.parseFfmetadata(';FFMETADATA1\nlyrics=끝\\\\\nartist=벨루나\n'), { lyrics: '끝\\', artist: '벨루나' })
})

test('WAV and MP3 import copies source bytes without a lossy conversion', async t => {
  const { songs, input, ffmpeg } = await fixture(t)
  const payload = Buffer.from([9, 8, 7, 6])
  const source = await file(input, 'mixed.wav', payload, ';FFMETADATA1\ntitle=그대로\nlyrics=안녕  \n')
  const result = await media.prepareImport({ file: source, dir: path.join(songs, 'project', 'song'), ffmpeg,
    audioBase: { root: songs, name: title => `safe-${title}` } })
  assert.equal(path.basename(result.audio), 'safe-그대로.wav')
  assert.deepEqual(await fs.readFile(result.audio), payload)
  assert.equal(result.meta.audioFormat, 'source-copy')
  assert.equal(result.meta.source.preservedPath, result.audio)
  assert.equal(result.meta.lyrics, '안녕  ')
})

test('replace keeps background and old provenance in the backup, not as a claim about the new audio; restore preserves both versions and order', async t => {
  const { root, songs, input, ffmpeg } = await fixture(t)
  const project = path.join(songs, 'project')
  const dir = path.join(project, '20261018_나를 믿어')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, '나를 믿어.wav'), 'old-wav')
  await fs.writeFile(path.join(dir, 'old.mp3'), 'old-mp3')
  await fs.writeFile(path.join(dir, 'background.png'), 'cover')
  await fs.writeFile(path.join(dir, 'score.abc'), 'old score')
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ title: '나를 믿어', audio: path.join(dir, '나를 믿어.wav'), audioRelativePath: '나를 믿어.wav', lyrics: '기존 가사', style: 'old style', engineId: 'yue-mlx', request: { seed: 7, lyrics: '기존 입력' }, seed: 7 }))
  const order = path.join(project, '.roadmusic-order.json')
  await fs.writeFile(order, JSON.stringify({ folders: ['20261018_나를 믿어'], hidden: [] }))
  const replacement = await file(input, 'final.flac', Buffer.from('new-final'), ';FFMETADATA1\ntitle=나를 믿어\nartist=벨루나\n')
  const replaced = await media.replaceSong({ dir, file: replacement, ffmpeg, audioBase: songs, now: new Date('2026-10-18T01:02:03Z') })
  const active = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'))
  assert.deepEqual(await fs.readFile(path.join(dir, '나를 믿어.wav')), Buffer.from('new-final'))
  assert.equal(active.audio, path.join(dir, '나를 믿어.wav'))
  assert.equal(active.source.preservedPath, path.join(dir, '.source', 'original.flac'))
  assert.deepEqual(await fs.readFile(active.source.preservedPath), Buffer.from('new-final'))
  assert.equal(active.lyrics, '기존 가사')
  assert.equal(active.engineId, undefined)
  assert.equal(active.style, undefined)
  assert.equal(active.provenance.previous.engineId, 'yue-mlx')
  assert.equal(active.provenance.previous.request.seed, 7)
  assert.deepEqual(await fs.readFile(path.join(dir, 'background.png')), Buffer.from('cover'))
  assert.equal(await fs.stat(path.join(dir, 'score.abc')).then(() => true, () => false), false)
  assert.equal(await fs.stat(path.join(dir, 'old.mp3')).then(() => true, () => false), false)
  assert.equal(await fs.readFile(order, 'utf8'), JSON.stringify({ folders: ['20261018_나를 믿어'], hidden: [] }))
  assert.deepEqual(await fs.readFile(path.join(replaced.backup, 'score.abc')), Buffer.from('old score'))

  const restored = await media.restoreSong({ dir, backup: replaced.backup, backupRoot: path.dirname(replaced.backup), audioBase: songs, now: new Date('2026-10-18T01:02:04Z') })
  assert.deepEqual(await fs.readFile(path.join(dir, '나를 믿어.wav')), Buffer.from('old-wav'))
  assert.deepEqual(await fs.readFile(path.join(restored.backup, '나를 믿어.wav')), Buffer.from('new-final'))
  assert.equal(await fs.readFile(order, 'utf8'), JSON.stringify({ folders: ['20261018_나를 믿어'], hidden: [] }))
  assert.ok(replaced.backup.startsWith(path.join(songs, 'project')))
  assert.equal(root.includes('never'), false)

  const movedProject = path.join(songs, 'renamed-project')
  await fs.rename(project, movedProject)
  const movedDir = path.join(movedProject, path.basename(dir))
  const movedBackup = path.join(movedProject, '.roadmusic-backups', path.basename(replaced.backup))
  const backups = await media.listBackups({ dir: movedDir, audioBase: songs })
  assert.ok(backups.some(item => item.backup === movedBackup))
  await fs.rm(movedDir, { recursive: true })
  const recovered = await media.restoreSong({ dir: movedDir, backup: movedBackup, audioBase: songs })
  assert.equal(recovered.backup, null)
  assert.equal(recovered.meta.audio, path.join(movedDir, '나를 믿어.wav'))
  assert.deepEqual(await fs.readFile(path.join(movedDir, '나를 믿어.wav')), Buffer.from('old-wav'))
})

test('rejects damaged input, duplicate active files, symlinked source or metadata, and backup paths outside the library', async t => {
  const { root, songs, input, ffmpeg } = await fixture(t)
  const bad = await file(input, 'broken.flac', 'broken')
  await assert.rejects(media.prepareImport({ file: bad, dir: path.join(songs, 'project', 'bad'), ffmpeg, audioBase: songs }))
  const duplicate = path.join(songs, 'project', 'duplicate')
  await fs.mkdir(duplicate, { recursive: true })
  await fs.writeFile(path.join(duplicate, 'taken.mp3'), 'taken')
  const good = await file(input, 'good.mp3', 'good')
  await assert.rejects(media.prepareImport({ file: good, dir: path.join(songs, 'project', 'no-ffmpeg'), audioBase: songs }), { code: 'FFMPEG_UNAVAILABLE' })
  await assert.rejects(media.prepareImport({ file: good, dir: duplicate, ffmpeg, audioBase: songs }))
  const song = path.join(songs, 'project', 'song')
  await fs.mkdir(song)
  await fs.writeFile(path.join(song, 'meta.json'), '{}')
  await fs.writeFile(path.join(song, 'song.mp3'), 'old')
  await assert.rejects(media.replaceSong({ dir: song, file: bad, ffmpeg, audioBase: songs }))
  assert.deepEqual(await fs.readFile(path.join(song, 'song.mp3')), Buffer.from('old'))
  await assert.rejects(media.replaceSong({ dir: song, file: good, ffmpeg, backupRoot: path.join(root, 'outside'), audioBase: songs }))
  await fs.writeFile(path.join(song, '.roadmusic-backup.json'), JSON.stringify({ schema: 1, targetDir: song, backedUpAt: '2026-10-18T00:00:00.000Z' }))
  const retried = await media.replaceSong({ dir: song, file: good, ffmpeg, audioBase: songs })
  assert.equal(await fs.stat(path.join(retried.backup, '.roadmusic-backup.json')).then(() => true, () => false), true)
  const untrustedBackup = path.join(songs, 'project', '.roadmusic-backups', 'untrusted')
  await fs.mkdir(untrustedBackup, { recursive: true })
  await fs.writeFile(path.join(untrustedBackup, 'meta.json'), '{}')
  await fs.writeFile(path.join(untrustedBackup, 'song.mp3'), 'not-restored')
  await assert.rejects(media.restoreSong({ dir: song, backup: untrustedBackup, audioBase: songs }))
  assert.deepEqual(await fs.readFile(path.join(song, 'good.mp3')), Buffer.from('good'))
  if (process.platform !== 'win32') {
    const linked = path.join(input, 'linked.mp3')
    await fs.symlink(good, linked)
    await assert.rejects(media.prepareImport({ file: linked, dir: path.join(songs, 'project', 'linked'), ffmpeg, audioBase: songs }))
    await fs.unlink(path.join(song, 'meta.json'))
    await fs.symlink(path.join(root, 'outside-meta.json'), path.join(song, 'meta.json'))
    await assert.rejects(media.replaceSong({ dir: song, file: good, ffmpeg, audioBase: songs }))
  }
})

test('rename failure restores the original; rollback failure leaves a listed backup recoverable without a target folder', async t => {
  const { songs, input, ffmpeg } = await fixture(t)
  const project = path.join(songs, 'project')
  const makeSong = async (name, bytes) => {
    const dir = path.join(project, name)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ title: name, audio: path.join(dir, `${name}.mp3`), audioRelativePath: `${name}.mp3` }))
    await fs.writeFile(path.join(dir, `${name}.mp3`), bytes)
    return dir
  }
  const source = await file(input, 'replacement.mp3', 'replacement')
  const restoredDir = await makeSong('rollback', 'before')
  const rename = fs.rename
  let stageFailure = true
  fs.rename = async (from, to) => {
    if (stageFailure && to === restoredDir && path.basename(from).startsWith('.rollback.staging-')) {
      stageFailure = false
      throw Object.assign(new Error('stage move failed'), { code: 'EIO' })
    }
    return rename(from, to)
  }
  try {
    await assert.rejects(media.replaceSong({ dir: restoredDir, file: source, ffmpeg, audioBase: songs }))
  } finally { fs.rename = rename }
  assert.deepEqual(await fs.readFile(path.join(restoredDir, 'rollback.mp3')), Buffer.from('before'))
  assert.equal(JSON.parse(await fs.readFile(path.join(restoredDir, '.roadmusic-backup.json'), 'utf8')).targetDir, restoredDir)
  await media.replaceSong({ dir: restoredDir, file: source, ffmpeg, audioBase: songs })

  const missingDir = await makeSong('missing', 'before-missing')
  let backupPath
  fs.rename = async (from, to) => {
    if (to === missingDir && (path.basename(from).startsWith('.missing.staging-') || from.includes(`${path.sep}.roadmusic-backups${path.sep}`))) {
      throw Object.assign(new Error('all recovery renames failed'), { code: 'EIO' })
    }
    return rename(from, to)
  }
  try {
    await media.replaceSong({ dir: missingDir, file: source, ffmpeg, audioBase: songs })
    assert.fail('replace should fail')
  } catch (error) {
    backupPath = error.backup
    assert.ok(backupPath)
  } finally { fs.rename = rename }
  assert.equal(await fs.stat(missingDir).then(() => true, () => false), false)
  assert.ok((await media.listBackups({ dir: missingDir, audioBase: songs })).some(item => item.backup === backupPath))
  const recovered = await media.restoreSong({ dir: missingDir, backup: backupPath, audioBase: songs })
  assert.equal(recovered.backup, null)
  assert.deepEqual(await fs.readFile(path.join(missingDir, 'missing.mp3')), Buffer.from('before-missing'))
})

test('a malformed restore candidate never swaps over the current song', async t => {
  const { songs } = await fixture(t)
  const project = path.join(songs, 'project')
  const dir = path.join(project, 'song')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ title: '현재', audio: path.join(dir, 'current.mp3'), audioRelativePath: 'current.mp3' }))
  await fs.writeFile(path.join(dir, 'current.mp3'), 'current-bytes')
  const root = path.join(project, '.roadmusic-backups')
  const makeBackup = async (name, meta, audio) => {
    const backup = path.join(root, name)
    await fs.mkdir(backup, { recursive: true })
    await fs.writeFile(path.join(backup, '.roadmusic-backup.json'), JSON.stringify({ schema: 2, targetDir: dir, targetFolder: path.basename(dir), backedUpAt: '2026-10-18T00:00:00.000Z' }))
    await fs.writeFile(path.join(backup, 'meta.json'), meta)
    if (audio !== undefined) await fs.writeFile(path.join(backup, 'song.mp3'), audio)
    return backup
  }
  const invalidJson = await makeBackup('bad-json', '{')
  const missingAudio = await makeBackup('missing-audio', JSON.stringify({ title: '손상', audioRelativePath: 'song.mp3' }))
  for (const backup of [invalidJson, missingAudio]) {
    await assert.rejects(media.restoreSong({ dir, backup, audioBase: songs }))
    assert.deepEqual(await fs.readFile(path.join(dir, 'current.mp3')), Buffer.from('current-bytes'))
  }
  if (process.platform !== 'win32') {
    const symlinkAudio = await makeBackup('symlink-audio', JSON.stringify({ title: '손상', audioRelativePath: 'song.mp3' }), 'placeholder')
    await fs.unlink(path.join(symlinkAudio, 'song.mp3'))
    await fs.symlink(path.join(dir, 'current.mp3'), path.join(symlinkAudio, 'song.mp3'))
    await assert.rejects(media.restoreSong({ dir, backup: symlinkAudio, audioBase: songs }))
    assert.deepEqual(await fs.readFile(path.join(dir, 'current.mp3')), Buffer.from('current-bytes'))
  }
})

test('legacy imported and YuE metadata restore without relative paths while preserving their source shape', async t => {
  const { songs, input, ffmpeg } = await fixture(t)
  const project = path.join(songs, 'project')
  const replacement = await file(input, 'replacement.mp3', 'replacement')
  const legacy = path.join(project, 'legacy-import')
  await fs.mkdir(legacy, { recursive: true })
  await fs.writeFile(path.join(legacy, 'meta.json'), JSON.stringify({ title: '가져온 곡', source: '06 - 선을 넘어.flac', imported: true }))
  await fs.writeFile(path.join(legacy, 'legacy.mp3'), 'legacy-mp3')
  const legacyReplacement = await media.replaceSong({ dir: legacy, file: replacement, ffmpeg, audioBase: songs })
  await media.restoreSong({ dir: legacy, backup: legacyReplacement.backup, audioBase: songs })
  const restoredImport = JSON.parse(await fs.readFile(path.join(legacy, 'meta.json'), 'utf8'))
  assert.equal(restoredImport.source, '06 - 선을 넘어.flac')
  assert.equal(restoredImport.audioRelativePath, 'legacy.mp3')
  assert.deepEqual(await fs.readFile(restoredImport.audio), Buffer.from('legacy-mp3'))

  const yue = path.join(project, 'legacy-yue')
  const yueSource = { engine: 'yue-mlx', repository: 'yue2', modelRevision: 'pinned' }
  await fs.mkdir(yue)
  await fs.writeFile(path.join(yue, 'meta.json'), JSON.stringify({ title: '유에 곡', source: yueSource, engineId: 'yue-mlx' }))
  await fs.writeFile(path.join(yue, 'native.wav'), 'legacy-wav')
  await fs.writeFile(path.join(yue, 'native.mp3'), 'legacy-mp3')
  const yueReplacement = await media.replaceSong({ dir: yue, file: replacement, ffmpeg, audioBase: songs })
  await media.restoreSong({ dir: yue, backup: yueReplacement.backup, audioBase: songs })
  const restoredYue = JSON.parse(await fs.readFile(path.join(yue, 'meta.json'), 'utf8'))
  assert.deepEqual(restoredYue.source, yueSource)
  assert.equal(restoredYue.audioRelativePath, 'native.wav')
  assert.deepEqual(await fs.readFile(restoredYue.audio), Buffer.from('legacy-wav'))
  assert.deepEqual(await fs.readFile(path.join(yue, 'native.mp3')), Buffer.from('legacy-mp3'))
})
