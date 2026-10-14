'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

function selectionContext () {
  const elements = Object.fromEntries(['vSource', 'vPickCount', 'songSelectionCount', 'exportSelected'].map(id => [id, {}]))
  elements.studio = { classList: { contains: () => true } }
  const saved = new Map()
  const context = {
    studio: { video: { source: 'selected' } }, currentProject: 'one',
    songs: [{ folder: 'a', audio: 'a.wav' }, { folder: 'b', audio: 'b.wav' },
      { folder: 'unfinished', audio: 'partial.wav', unfinished: true }, { folder: 'score' }],
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    studioEl: id => elements[id],
    document: { createElement: () => ({}) },
    saveVideo () {}, renderSongs () {}, showStudioInfo () {}
  }
  const source = fs.readFileSync(path.join(__dirname, '../renderer/studio.js'), 'utf8')
  vm.runInNewContext(source.slice(source.indexOf('const pickKey ='), source.indexOf('function studioTracks ()')), context)
  return { context, elements, saved }
}

test('selects only finished audio, clears all, and keeps selection per project', () => {
  const { context, elements, saved } = selectionContext()
  context.setSongPicks(true)
  assert.deepEqual([...context.picks()], ['a', 'b'])
  assert.equal(elements.songSelectionCount.textContent, '2곡 선택')
  assert.equal(elements.exportSelected.disabled, false)
  assert.deepEqual(JSON.parse(saved.get('videoPicks:one')), ['a', 'b'])
  context.currentProject = 'two'
  assert.equal(context.picks().size, 0)
  context.currentProject = 'one'
  assert.equal(context.picks().size, 2)
  context.setSongPicks(false)
  assert.equal(context.picks().size, 0)
  assert.equal(elements.exportSelected.disabled, true)
})

test('song selection remains available when the video studio is closed', () => {
  const { context, elements } = selectionContext()
  const checkbox = context.studioCheckbox(context.songs[0])
  assert.ok(checkbox)
  checkbox.checked = true
  checkbox.onchange()
  assert.equal(context.picks().has('a'), true)
  assert.equal(elements.songSelectionCount.textContent, '1곡 선택')
  assert.equal(context.studioCheckbox(context.songs[2]), null)
  assert.equal(context.studioCheckbox(context.songs[3]), null)
})

test('selected export sends a snapshot of checked song directories and chosen format', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8')
  const start = source.indexOf('  // ── album export ──')
  const end = source.indexOf("  $('revealSong').onclick", start)
  const elements = Object.fromEntries(['albumExport', 'exportSelected', 'songPickAll', 'songPickNone', 'albumName',
    'albumTitle', 'albumDescription', 'albumSummary', 'albumOk', 'albumCancel'].map(id => [id, {}]))
  elements.album = { classList: { add () {}, remove () {} } }
  elements.albumFormat = { value: 'wav' }
  elements.albumNumbered = { checked: false }
  const selected = new Set(['b'])
  let request
  const context = {
    $: id => elements[id], currentProject: 'project', picks: () => selected, setSongPicks () {},
    songs: [{ folder: 'a', dir: '/songs/a', audio: 'a.wav' }, { folder: 'b', dir: '/songs/b', audio: 'b.wav' }],
    toast () {}, showProblem () {}, showLocations () {},
    window: { yue: { open () {}, onAlbumProgress () {}, exportAlbum: async options => {
      request = options
      return { ok: true, path: '/exports/project', count: 1, failures: [] }
    } } }
  }
  vm.runInNewContext(source.slice(start, end), context)
  elements.exportSelected.onclick()
  selected.clear()
  await elements.albumOk.onclick()
  assert.deepEqual([...request.dirs], ['/songs/b'])
  assert.equal(request.format, 'wav')
  assert.equal(request.numbered, false)
  elements.albumExport.onclick()
  await elements.albumOk.onclick()
  assert.equal(request.dirs, undefined)
})
