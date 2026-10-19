'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'cli-api.js'), 'utf8')
const appSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8')

function contextFor (listed) {
  const elements = new Map()
  const element = () => {
    const values = new Set(['hidden'])
    return {
      textContent: '',
      disabled: false,
      innerHTML: '',
      children: [],
      classList: {
        add: value => values.add(value),
        remove: value => values.delete(value),
        contains: value => values.has(value)
      },
      append (...children) { this.children.push(...children) }
    }
  }
  const $ = id => {
    if (!elements.has(id)) elements.set(id, element())
    return elements.get(id)
  }
  let selected = null
  let played = 0
  const context = {
    window: { yue: { listSongs: async () => listed } },
    Promise, Number, String, Boolean, Object, Array, Set, URL, encodeURIComponent,
    document: {
      querySelector: selector => selector.startsWith('#') ? $(selector.slice(1)) : null,
      createElement: element
    },
    songs: [], selected: null,
    $,
    select: null,
    playFromSong: () => { played++ }
  }
  context.select = song => { selected = song; context.selected = song }
  vm.runInNewContext('let infoRows = [];\n' +
    appSource.slice(appSource.indexOf('function openSongInfo ('), appSource.indexOf('function wireSongInfo (')), context)
  vm.runInNewContext(source, context)
  return { context, $, selected: () => selected, played: () => played }
}

test('song:info opens the selected song info window and returns the rendered full Korean lyrics', async () => {
  const lyrics = '[Verse]\n' + '나는 나를 믿어\n남들 눈치 보며\n'.repeat(33) + '오늘도 나 믿어\n'
  assert.equal(lyrics.length, 611)
  const other = { id: 'same-id', dir: '/songs/other', title: '다른 곡', lyrics: '다른 가사' }
  const song = { id: 'same-id', dir: '/songs/final', title: '나를 믿어', lyrics, imported: true }
  const fixture = contextFor([other, song])
  const result = await fixture.context.window.RoadCLI.call('song:info', { dir: song.dir })

  assert.deepEqual({ ...result }, {
    ok: true,
    dir: song.dir,
    title: '나를 믿어',
    displayedTitle: '나를 믿어',
    titleMatch: true,
    open: true,
    lyrics,
    displayedLyrics: lyrics,
    lyricsMatch: true,
    copyEnabled: true
  })
  assert.equal(fixture.selected(), song)
  assert.equal(fixture.$('songInfo').classList.contains('hidden'), false)
  assert.equal(fixture.played(), 0)
})

test('song:info closes the info window without playing or changing an instrumental song', async () => {
  const song = { dir: '/songs/instrumental', title: '연주곡', lyrics: null, instrumental: true }
  const fixture = contextFor([song])
  const opened = await fixture.context.window.RoadCLI.call('song:info', { dir: song.dir })
  assert.equal(opened.displayedLyrics, '(연주곡 — 가사 없음)')
  assert.equal(opened.lyricsMatch, false)
  assert.equal(opened.copyEnabled, false)
  const result = await fixture.context.window.RoadCLI.call('song:info', { dir: song.dir, open: false })

  assert.deepEqual({ ...result }, {
    ok: true,
    dir: song.dir,
    title: '연주곡',
    open: false,
    lyrics: '',
    displayedLyrics: null,
    lyricsMatch: null,
    copyEnabled: false
  })
  assert.equal(fixture.$('songInfo').classList.contains('hidden'), true)
  assert.equal(fixture.played(), 0)
})

test('song:info reports a missing directory as an error', async () => {
  const fixture = contextFor([])
  const result = await fixture.context.window.RoadCLI.call('song:info', { dir: '/songs/missing' })
  assert.equal(result.ok, false)
  assert.match(result.error, /song not found/)
})
