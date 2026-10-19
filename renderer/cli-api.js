'use strict'

// Narrow, JSON-only automation surface.  Deliberately exposes commands rather
// than arbitrary JavaScript so the main process can safely validate the RPC.
const ROAD_CLI_ACTIONS = Object.freeze([
  'renderer:catalog', 'lyrics:clean', 'lyrics:check', 'lyrics:sections', 'lyrics:numbers',
  'prompt:compose', 'prompt:catalog', 'song:detail', 'song:info', 'song:clone', 'song:srt',
  'video:render', 'video:preview', 'video:configure', 'video:seek', 'video:play', 'video:pause', 'video:state',
  'video:chapters', 'video:cancel', 'player:play', 'player:pause', 'player:next',
  'player:previous', 'player:seek', 'player:state', 'player:stop', 'editor:state',
  'editor:open', 'editor:close', 'recording:start', 'recording:stop', 'recording:state'
])
const cliError = (message, code = 'invalid_request') => ({ ok: false, error: message, code })
const number = (value, name, min, max) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`)
  return n
}
const songsForCli = () => (typeof songs !== 'undefined' ? songs : [])
const songForCli = (params = {}) => {
  const list = songsForCli()
  if (params.dir) {
    const song = list.find((item) => item.dir === params.dir)
    if (song) return song
    throw new Error('song not found')
  }
  if (params.folder) {
    const song = list.find((item) => item.folder === params.folder)
    if (song) return song
    throw new Error('song not found')
  }
  if (!params.id) throw new Error('song dir, folder, or id is required')
  const matches = list.filter((item) => item.id === params.id)
  if (matches.length > 1) throw new Error('song id is ambiguous; use dir or folder')
  const song = matches[0]
  if (!song) throw new Error('song not found')
  return song
}
const rendererCatalog = () => ({ actions: ROAD_CLI_ACTIONS, ready: Boolean(window.RoadStudioReady), presets: typeof PRESETS !== 'undefined' ? PRESETS : [], instrumentalPresets: typeof INSTRUMENTAL_PRESETS !== 'undefined' ? INSTRUMENTAL_PRESETS : [], builtInPresets: typeof PRESETS !== 'undefined' ? PRESETS : [], instruments: typeof INSTRUMENTS !== 'undefined' ? INSTRUMENTS : [], structures: typeof STRUCTURES !== 'undefined' ? STRUCTURES : [], eqPresets: typeof EQ_PRESETS !== 'undefined' ? EQ_PRESETS : [], videoDefaults: typeof VIDEO_DEFAULTS !== 'undefined' ? VIDEO_DEFAULTS : null })
const playerState = () => {
  const p = typeof miniPlayer === 'undefined' ? null : miniPlayer
  return p ? { dir: p.dir, index: p.index, playing: Boolean(p.audio && !p.audio.paused), time: p.audio ? p.audio.currentTime : 0, duration: p.audio ? (p.audio.duration || 0) : 0 } : { dir: null, playing: false, time: 0, duration: 0 }
}
async function waitPlayer (audio) {
  if (audio.readyState < 1) {
    await new Promise((resolve, reject) => {
      const done = (fn, value) => {
        clearTimeout(timer)
        audio.removeEventListener('loadedmetadata', loaded)
        audio.removeEventListener('error', failed)
        fn(value)
      }
      const loaded = () => done(resolve)
      const failed = () => done(reject, new Error('audio metadata could not be loaded'))
      const timer = setTimeout(() => done(reject, new Error('audio metadata timed out')), 30000)
      audio.addEventListener('loadedmetadata', loaded, { once: true })
      audio.addEventListener('error', failed, { once: true })
    })
  }
  await audio.play()
  return playerState()
}
const fileUrl = (file) => {
  const path = String(file || '').replace(/\\/g, '/')
  if (!path) return null
  const encoded = path.split('/').map((part) => encodeURIComponent(part).replace(/%3A/gi, ':')).join('/')
  return path.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`
}
const finite = (value, name, min, max) => number(value, name, min, max)
const oneOf = (value, name, values) => {
  if (!values.includes(value)) throw new Error(`invalid ${name}`)
  return value
}
const imageOverlay = (overlay) => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error(`unable to load overlay: ${overlay.path || overlay.url || ''}`))
  image.src = overlay.url
})

async function configureVideo (params = {}, { selectTracks = true, cliToken = null } = {}) {
  if (studio.frame) return cliError('render already in progress', 'busy')
  const v = params.video || {}
  for (const image of [v.background, v.spectrum && v.spectrum.cover, ...(v.overlays || [])]) {
    if (!image) continue
    let local = !image.path || !/^[\\/]{2}/.test(image.path)
    if (image.url) {
      try {
        const url = new URL(image.url)
        local = local && url.protocol === 'file:' && (!url.hostname || url.hostname === 'localhost') && !/^[\\/]{2}/.test(decodeURIComponent(url.pathname))
      } catch { local = false }
    }
    if (!local) throw new Error('배경·표지·오버레이에는 로컬 파일 경로만 사용할 수 있습니다.')
  }
  if (v.resolution != null) oneOf(v.resolution, 'resolution', ['720p', '1080p', '1440p', '2160p'])
  if (v.renderer != null) oneOf(v.renderer, 'renderer', ['gpu', 'cpu'])
  if (v.source != null) oneOf(v.source, 'video source', ['selected', 'checked', 'project'])
  if (v.fps != null && ![30, 60].includes(Number(v.fps))) throw new Error('fps must be 30 or 60')
  if (v.length) {
    if (v.length.mode != null) oneOf(v.length.mode, 'length mode', ['once', 'repeat', 'minutes'])
    if (v.length.count != null && !Number.isInteger(finite(v.length.count, 'length count', 1, 1000))) throw new Error('length count must be an integer')
    if (v.length.minutes != null && !Number.isInteger(finite(v.length.minutes, 'length minutes', 1, 600))) throw new Error('length minutes must be an integer')
  }
  if (v.eq) {
    if (v.eq.on != null && typeof v.eq.on !== 'boolean') throw new Error('eq on must be boolean')
    if (v.eq.preset != null && ![...EQ_PRESETS.map(([id]) => id), 'custom'].includes(v.eq.preset)) throw new Error('invalid eq preset')
    if (v.eq.gains != null && (!Array.isArray(v.eq.gains) || v.eq.gains.length !== 7)) throw new Error('eq gains must contain seven bands')
    for (const gain of v.eq.gains || []) finite(gain, 'eq gain', -10, 10)
  }
  if (v.background) {
    oneOf(v.background.kind || 'none', 'background kind', ['none', 'image', 'video'])
    if (v.background.kind && v.background.kind !== 'none' && !(v.background.path || v.background.url)) throw new Error('background path is required')
  }
  if (v.spectrum) {
    const s = v.spectrum
    if (s.visible != null && typeof s.visible !== 'boolean') throw new Error('spectrum visible must be boolean')
    if (s.kind != null) oneOf(s.kind, 'spectrum kind', ['bars', 'mirror', 'line', 'circle', 'cd'])
    if (s.layout != null) oneOf(s.layout, 'spectrum layout', ['left', 'center', 'right'])
    if (s.position != null) oneOf(s.position, 'spectrum position', ['bottom', 'center', 'free'])
    if (s.barCount != null && !Number.isInteger(finite(s.barCount, 'spectrum barCount', 8, 256))) throw new Error('spectrum barCount must be an integer')
    for (const key of ['cx', 'cy']) if (s[key] != null) finite(s[key], `spectrum ${key}`, -0.5, 1.5)
    if (s.size != null) finite(s.size, 'spectrum size', 0.03, 0.9)
    if (s.width != null) finite(s.width, 'spectrum width', 0.05, 1.5)
    if (s.glow != null) finite(s.glow, 'spectrum glow', 0, 1)
    if (s.gain != null) finite(s.gain, 'spectrum gain', 0.3, 3)
    if (s.dim != null) finite(s.dim, 'spectrum dim', 0, 1)
  }
  const overlays = Array.isArray(v.overlays) ? await Promise.all(v.overlays.map(async (raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`overlay ${index} must be an object`)
    const overlay = { ...raw, path: raw.path || null, url: fileUrl(raw.path) || raw.url }
    if (!overlay.url) throw new Error(`overlay ${index} path is required`)
    for (const key of ['x', 'y']) overlay[key] = finite(overlay[key] == null ? 0.5 : overlay[key], `overlay ${key}`, -0.5, 1.5)
    overlay.w = finite(overlay.w == null ? 0.25 : overlay.w, 'overlay width', 0.02, 2)
    overlay.opacity = finite(overlay.opacity == null ? 1 : overlay.opacity, 'overlay opacity', 0, 1)
    overlay.start = finite(overlay.start == null ? 0 : overlay.start, 'overlay start', 0, 86400)
    if (overlay.end != null) {
      overlay.end = finite(overlay.end, 'overlay end', 0, 86400)
      if (overlay.end <= overlay.start) throw new Error('overlay end must be after start')
    }
    const image = await imageOverlay(overlay)
    overlay.ar = overlay.ar == null ? image.naturalHeight / image.naturalWidth : finite(overlay.ar, 'overlay aspect ratio', 0.01, 100)
    if (!Number.isFinite(overlay.ar) || overlay.ar <= 0) throw new Error(`overlay ${index} has no image dimensions`)
    if (typeof overlayImages !== 'undefined') overlayImages.set(overlay.url, image)
    return overlay
  })) : null
  let cover
  if (v.spectrum && Object.prototype.hasOwnProperty.call(v.spectrum, 'cover')) {
    cover = v.spectrum.cover
    if (cover !== null) {
      if (!cover || typeof cover !== 'object' || Array.isArray(cover)) throw new Error('CD cover must be an image object or null')
      cover = { ...cover, path: cover.path || null, url: fileUrl(cover.path) || cover.url }
      if (!cover.url) throw new Error('CD cover path is required')
      const image = await imageOverlay(cover)
      if (typeof overlayImages !== 'undefined') overlayImages.set(cover.url, image)
    }
  }
  const background = { ...studio.video.background, ...(v.background || {}) }
  if (v.background && v.background.path && v.background.kind == null && background.kind === 'none') {
    background.kind = /\.(?:mp4|mov|m4v|webm|avi)$/i.test(v.background.path) ? 'video' : 'image'
  }
  if (background.path) background.url = fileUrl(background.path)
  const nextVideo = { ...studio.video, ...v, fps: v.fps == null ? studio.video.fps : Number(v.fps),
    background,
    length: { ...studio.video.length, ...(v.length || {}) },
    spectrum: { ...studio.video.spectrum, ...(v.spectrum || {}), ...(cover !== undefined ? { cover } : {}) },
    eq: { ...studio.video.eq, ...(v.eq || {}) },
    tracklist: { ...studio.video.tracklist, ...(v.tracklist || {}) },
    overlays: overlays || studio.video.overlays }
  if (!selectTracks) {
    studio.video = nextVideo
    writeControls()
    if (params.save) {
      const saved = cliToken && window.roadCliInvoke ? await window.roadCliInvoke(cliToken, 'video:save-settings', [studio.video]) : await window.yue.saveVideoSettings(studio.video)
      if (saved && saved.ok === false) return saved
    }
    return { ok: true, video: studio.video }
  }
  const state = await window.yue.projects()
  if (state && state.current !== undefined) currentProject = state.current
  songs = await window.yue.listSongs()
  let cliTracks = null
  const source = params.tracks !== undefined ? 'checked' : (v.source || 'project')
  if (params.tracks !== undefined) {
    if (!Array.isArray(params.tracks) || !params.tracks.length) throw new Error('tracks must be a non-empty array')
    const dirs = params.tracks.map((item) => typeof item === 'string' ? item : item && item.dir)
    if (dirs.some((dir) => !dir) || new Set(dirs).size !== dirs.length) throw new Error('tracks must be unique song directories')
    cliTracks = dirs.map((dir) => songs.find((song) => song.dir === dir))
    if (cliTracks.some((song) => !song)) throw new Error('one or more tracks were not found')
    if (cliTracks.some((song) => !song.audio || song.unfinished)) throw new Error('tracks must be finished songs')
  } else if (source === 'selected') {
    cliTracks = selected && selected.audio && !selected.unfinished ? [selected] : []
  } else if (source === 'checked') {
    cliTracks = songs.filter((song) => song.audio && !song.unfinished && picks().has(song.folder))
  } else {
    cliTracks = songs.filter((song) => song.audio && !song.unfinished)
  }
  if (!cliTracks.length) throw new Error(source === 'selected' ? 'selected song is not finished' : source === 'checked' ? 'no finished checked tracks' : 'project has no finished songs')
  studio.cliTracks = cliTracks
  nextVideo.source = source
  studio.video = nextVideo
  studio.picks = new Set(cliTracks.map((song) => song.folder))
  studio.picksFor = pickKey()
  try { localStorage.setItem(pickKey(), JSON.stringify([...studio.picks])) } catch {}
  writeControls()
  if (params.save) {
    const saved = cliToken && window.roadCliInvoke ? await window.roadCliInvoke(cliToken, 'video:save-settings', [studio.video]) : await window.yue.saveVideoSettings(studio.video)
    if (saved && saved.ok === false) return saved
  }
  return { ok: true, tracks: cliTracks }
}
if (window.addEventListener) for (const type of ['click', 'change', 'input', 'keydown', 'pointerdown', 'dragstart', 'drop']) {
  window.addEventListener(type, event => {
    if (!window.RoadCLIBusy || !event.isTrusted || (event.target.closest && event.target.closest('#vCancel'))) return
    if (type === 'keydown' && (event.key === 'Tab' || ((event.ctrlKey || event.metaKey) && ['c', 'a'].includes(String(event.key).toLowerCase())))) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
}
async function roadCliCall (command, params = {}, cliToken = null, finalOutput = null) {
  if (!ROAD_CLI_ACTIONS.includes(command)) return cliError(`unknown command: ${command}`, 'unknown_command')
  const ownsBusy = ['video:render', 'video:preview', 'video:configure'].includes(command) && !window.RoadCLIBusy
  if (ownsBusy) {
    window.RoadCLIBusy = command
    if (document.body) document.body.setAttribute('aria-busy', 'true')
  }
  try {
    if (command === 'renderer:catalog') return rendererCatalog()
    if (command === 'lyrics:clean') return cleanLyrics(params.text || '')
    if (command === 'lyrics:check') return window.RoadLyricsCheck.checkLyrics(String(params.text || ''), { targetSeconds: params.targetSeconds == null ? null : number(params.targetSeconds, 'targetSeconds', 1, 3600) })
    if (command === 'lyrics:sections') {
      const text = String(params.text || '')
      const result = window.RoadSections.autoSections(text)
      return { text: result || text, changed: Boolean(result && result !== text) }
    }
    if (command === 'lyrics:numbers') return { text: window.RoadLyricsCheck.numbersToHangul(String(params.text || '')) }
    if (command === 'prompt:compose') return composeStyle(params)
    if (command === 'prompt:catalog') return { instruments: INSTRUMENTS, structures: STRUCTURES }
    if (command === 'song:detail') { songs = await window.yue.listSongs(); return songForCli(params) }
    if (command === 'song:info') {
      songs = await window.yue.listSongs()
      const song = songForCli(params)
      const title = song.title || '무제'
      const lyrics = song.lyrics || ''
      select(song)
      const info = document.querySelector('#songInfo')
      if (params.open === false) {
        info.classList.add('hidden')
        return { ok: true, dir: song.dir, title, open: false, lyrics, displayedLyrics: null, lyricsMatch: null, copyEnabled: false }
      }
      openSongInfo()
      const displayedTitle = document.querySelector('#songInfoTitle').textContent
      const displayedLyrics = document.querySelector('#songInfoLyrics').textContent
      return { ok: true, dir: song.dir, title, displayedTitle, titleMatch: displayedTitle === title,
        open: !info.classList.contains('hidden'), lyrics, displayedLyrics, lyricsMatch: displayedLyrics === lyrics,
        copyEnabled: !document.querySelector('#songInfoCopy').disabled }
    }
    if (command === 'song:clone') {
      songs = await window.yue.listSongs()
      const song = songForCli(params)
      if (song.imported) return cliError('imported songs have no reusable generation settings', 'unsupported')
      const saved = userRequest(song)
      const request = { title: song.title || '', style: saved.style, lyrics: saved.lyrics, engine: saved.engine || undefined, instrumental: Boolean(song.instrumental),
        soundEffect: Boolean(song.soundEffect), targetSeconds: song.targetSeconds == null ? undefined : Number(song.targetSeconds),
        seed: song.seed == null ? undefined : Number(song.seed), cot: song.cot, parts: saved.parts, advanced: saved.advanced }
      for (const key of Object.keys(request)) if (request[key] === undefined) delete request[key]
      if (params.apply) {
        select(song)
        document.querySelector('#reuseSong').click()
      }
      return { ok: true, song, request }
    }
    if (command === 'song:srt') {
      songs = await window.yue.listSongs()
      const song = songForCli(params)
      const result = await songCues(song)
      const text = toSrt(result.cues)
      if (params.save) {
        const saved = cliToken && window.roadCliInvoke
          ? await window.roadCliInvoke(cliToken, 'song:save-srt', [{ title: song.title || song.id, text }])
          : await window.yue.saveSrt(song.title || song.id, text)
        if (!saved.ok) return { ...result, text, saved, ok: false, error: saved.message || 'could not save SRT', code: saved.code || 'save_error' }
        return { ...result, text, saved }
      }
      return { ...result, text }
    }
    if (command.startsWith('video:')) {
      await (window.RoadStudioReady || Promise.resolve())
      if (command === 'video:state') return { ...studio.video, prepared: Boolean(studio.cycle), playing: studio.clock.playing, time: clockTime(), duration: duration() }
      if (command === 'video:chapters') return studio.cycle ? studio.cycle.chapters : []
      if (command === 'video:seek') { seekPreview(number(params.seconds, 'seconds', 0, duration() || 86400)); return { ok: true, time: clockTime() } }
      if (command === 'video:play') { if (!studio.cycle) return cliError('video preview is not prepared', 'not_prepared'); playPreview(); return { ok: true, playing: studio.clock.playing } }
      if (command === 'video:pause') { pausePreview(); return { ok: true, playing: false } }
      if (command === 'video:cancel') {
        studio.cliCancelled = true
        if (studio.frame) {
          studio.frame.cancelled = true
          return { ok: true, cancellationRequested: true, stage: 'render', pending: true }
        }
        if (studio.cliPreparing || studio.cliPreparingFlag) return { ok: true, cancellationRequested: true, stage: 'prepare', pending: true, message: '준비가 끝나면 중단됩니다.' }
        return { ok: true, active: false }
      }
      if (command === 'video:configure') return configureVideo(params, { selectTracks: false, cliToken })
      if (command === 'video:preview' || command === 'video:render') {
        studio.cliCancelled = false
        studio.cliPreparing = studio.cliPreparingFlag = true
        try {
          const configured = await configureVideo(params)
          if (!configured.ok) return configured
          if (studio.cliCancelled) return cliError('video preparation cancelled', 'cancelled')
          if (!await prepareStudio({ quiet: true, productionContext: { requestPrompt: params.requestPrompt, requestId: params.requestId } })) return cliError('video preview preparation failed', 'prepare_error')
          if (studio.cliCancelled) return cliError('video preparation cancelled', 'cancelled')
        } finally {
          studio.cliPreparing = studio.cliPreparingFlag = false
        }
        if (command === 'video:preview') return { ok: true, prepared: Boolean(studio.cycle), cycle: studio.cycle, chapters: studio.cycle ? studio.cycle.chapters : [], duration: duration() }
        return await renderVideo({ name: params.name ? String(params.name).slice(0, 200) : undefined, requestPrompt: params.requestPrompt, requestId: params.requestId, cliToken, finalOutput })
      }
    }
    if (command.startsWith('player:')) {
      if (command === 'player:state') return playerState()
      if (command === 'player:stop') { closeMiniPlayer(); return { ok: true } }
      if (command === 'player:play') {
        songs = await window.yue.listSongs()
        const song = songForCli(params)
        if (!song.audio || song.unfinished) return cliError('only finished songs can be played', 'unsupported')
        playFromSong(song)
        const audio = miniPlayer.audio
        if (!audio) throw new Error('player did not open')
        return await waitPlayer(audio)
      }
      if (command === 'player:pause') { if (!miniPlayer.audio) throw new Error('player is not open'); miniPlayer.audio.pause(); return playerState() }
      if (command === 'player:seek') { if (!miniPlayer.audio) throw new Error('player is not open'); miniPlayer.audio.currentTime = number(params.seconds, 'seconds', 0, miniPlayer.audio.duration || 86400); return playerState() }
      if (command === 'player:next' || command === 'player:previous') {
        if (!miniPlayer.audio || !miniPlayer.list.length) throw new Error('player is not open')
        const delta = command.endsWith('next') ? 1 : -1
        loadMini(Math.max(0, Math.min(miniPlayer.list.length - 1, miniPlayer.index + delta)), true)
        return await waitPlayer(miniPlayer.audio)
      }
    }
    if (command === 'editor:state') return { open: !document.querySelector('#editor').classList.contains('hidden'), selected: ed.sel, video: studio.video }
    if (command === 'editor:open') { await openEditor(); return { ok: true } }
    if (command === 'editor:close') { closeEditor(); return { ok: true } }
    if (command === 'recording:state') return { active: Boolean(typeof recorder !== 'undefined' && recorder.media), take: typeof recorder !== 'undefined' ? recorder.take : null }
    if (command === 'recording:start') { const result = await startRecording(); return result && result.ok === false ? result : { ok: Boolean(recorder.media), active: Boolean(recorder.media) } }
    if (command === 'recording:stop') {
      const discarded = Boolean(params.discard)
      const take = await stopRecording(discarded)
      if (take && take.ok === false) return take
      return discarded ? { ok: true, discarded: true, active: Boolean(recorder.media), take: null } : { ok: Boolean(take), active: Boolean(recorder.media), take }
    }
    return cliError('unsupported command')
  } catch (error) { return cliError(error.message || String(error), error.code || 'command_error') }
  finally {
    if (ownsBusy) {
      window.RoadCLIBusy = null
      if (document.body) document.body.removeAttribute('aria-busy')
    }
  }
}
window.RoadCLI = Object.freeze({ actions: ROAD_CLI_ACTIONS, call: roadCliCall })
