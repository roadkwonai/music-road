'use strict'
// ── "녹음으로 곡 만들기" ─────────────────────────────────────────────────────────
// Humming, a guitar or piano take, any rough recording: ACE-Step 1.5 reads its melody,
// rhythm and chord movement and builds a song on it in the style and words the user
// writes. It is the same "cover" task as a cover from a song's sound (python/ace_worker.py);
// the take comes from the microphone or a file, and the main process keeps it as a
// WAV in the app's own folder and stretches it to the length asked for
// (electron/main.js keepRecording, stretchRecording).

const recorder = { stream: null, media: null, chunks: [], started: 0, timer: 0, meter: 0, context: null, take: null, discard: false, stopWait: null, stopPromise: null, stopTimer: 0, stoppingMedia: null }
const REC_MAX_SECONDS = 300
const setRecordingActivity = (active) => typeof window.yue.setRecordingActivity === 'function'
  ? window.yue.setRecordingActivity(active) : Promise.resolve({ ok: true, active })

function recordingFailure (code, error) {
  return { ok: false, code, error }
}

function stopRecordingTracks (stream) {
  for (const track of stream ? stream.getTracks() : []) {
    try { track.stop() } catch { /* stopping an already-ended track is harmless */ }
  }
}

function clearRecordingActivity () {
  clearTimeout(recorder.timer)
  cancelAnimationFrame(recorder.meter)
  if (recorder.context) {
    try { recorder.context.close().catch(() => {}) } catch {}
  }
  recorder.context = null
}

function releaseStoppedRecording (media) {
  clearRecordingActivity()
  clearTimeout(recorder.stopTimer)
  recorder.stopTimer = 0
  if (media) {
    media.ondataavailable = null
    media.onstop = null
  }
  recorder.media = null
  recorder.stream = null
  recorder.stoppingMedia = null
  void setRecordingActivity(false)
  resetRecordingUi()
}

function openRecorder () {
  if (!enginesInstalled.ace) {
    openEngines()
    return toast('녹음으로 곡 만들기는 ACE-Step 1.5 엔진으로 합니다. "AI 엔진"에서 ACE-Step 1.5를 설치해 주세요.', 8000)
  }
  recorder.take = null
  showTake()
  $('recTime').textContent = '0:00'
  $('record').classList.remove('hidden')
}

function closeRecorder () {
  stopRecording(true)
  $('recAudio').pause()
  $('record').classList.add('hidden')
}

async function startRecording () {
  if (recorder.media || recorder.stopPromise) return { ok: false, error: 'recording is already active', code: 'busy' }
  const reservation = await setRecordingActivity(true)
  if (!reservation.ok) {
    toast(reservation.message || '업데이트 설치를 준비하는 중에는 녹음을 시작할 수 없습니다.', 7000)
    return recordingFailure('update_busy', reservation.message)
  }
  let stream
  try {
    // Music, not a call: no echo cancelling, noise gate or automatic level.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 }
    })
  } catch (error) {
    const message = error.name === 'NotAllowedError'
      ? MAC
        ? '마이크를 쓸 수 없습니다. 시스템 설정 → 개인정보 보호 및 보안 → 마이크에서 Road Music을 켜 주세요.'
        : '마이크를 쓸 수 없습니다. Windows 설정 → 개인 정보 및 보안 → 마이크에서 "데스크톱 앱이 마이크에 액세스하도록 허용"을 켜 주세요.'
      : error.name === 'NotFoundError'
        ? '연결된 마이크가 없습니다. 마이크를 연결하거나 "파일 고르기"로 녹음 파일을 골라 주세요.'
        : `마이크를 열지 못했습니다: ${error.message}`
    toast(message, 10000)
    void setRecordingActivity(false)
    return { ok: false, error: message, code: error.name === 'NotAllowedError' ? 'permission' : 'microphone_error' }
  }
  $('recAudio').pause()
  let media
  try {
    recorder.stream = stream
    recorder.chunks = []
    recorder.discard = false
    media = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 })
    media.ondataavailable = (event) => { if (event.data.size) recorder.chunks.push(event.data) }
    media.onstop = () => { void finishRecording(media) }
    recorder.media = media
    media.start(500)
  } catch (error) {
    if (media) {
      media.ondataavailable = null
      media.onstop = null
      try { media.stop() } catch {}
    }
    stopRecordingTracks(stream)
    recorder.media = null
    recorder.stream = null
    void setRecordingActivity(false)
    resetRecordingUi()
    const message = `녹음을 시작하지 못했습니다: ${error.message || error}`
    toast(message, 7000)
    return recordingFailure('recorder_start_failed', message)
  }
  recorder.started = performance.now()
  $('recStart').textContent = '■ 녹음 멈추기'
  $('recStart').classList.add('recording')
  $('recFile').disabled = true
  $('recUse').disabled = true
  tickRecording()
  meterRecording(stream)
  return { ok: true, active: true }
}

function tickRecording () {
  clearTimeout(recorder.timer)
  if (!recorder.media) return
  const seconds = (performance.now() - recorder.started) / 1000
  $('recTime').textContent = clock(seconds)
  if (seconds >= REC_MAX_SECONDS) {
    toast(`녹음은 ${REC_MAX_SECONDS / 60}분까지입니다. 여기까지 저장합니다.`)
    return stopRecording()
  }
  recorder.timer = setTimeout(tickRecording, 200)
}

// A level bar, so it is plain the microphone hears something.
function meterRecording (stream) {
  try {
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(stream).connect(analyser)
    recorder.context = context
    const data = new Float32Array(analyser.fftSize)
    const canvas = $('recLevel')
    const ctx = canvas.getContext('2d')
    const draw = () => {
      if (!recorder.media) return
      analyser.getFloatTimeDomainData(data)
      let peak = 0
      for (const v of data) peak = Math.max(peak, Math.abs(v))
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = peak > 0.95 ? '#ff6b6b' : '#7c5cff'
      ctx.fillRect(0, 0, canvas.width * Math.min(1, peak * 1.2), canvas.height)
      recorder.meter = requestAnimationFrame(draw)
    }
    draw()
  } catch { /* the bar is a nicety */ }
}

function settleRecordingStop (take) {
  clearTimeout(recorder.stopTimer)
  recorder.stopTimer = 0
  const resolve = recorder.stopWait
  recorder.stopWait = null
  recorder.stopPromise = null
  if (resolve) resolve(take)
}

function resetRecordingUi () {
  $('recStart').textContent = '● 다시 녹음'
  $('recStart').classList.remove('recording')
  $('recFile').disabled = false
}

function settleStoppedFailure (media, failure) {
  try {
    releaseStoppedRecording(media)
  } finally {
    try { toast(failure.error, 7000) } finally { settleRecordingStop(failure) }
  }
  return failure
}

function stopRecording (discard = false) {
  if (recorder.stopPromise) {
    if (discard) recorder.discard = true
    return recorder.stopPromise
  }
  if (!recorder.media) return Promise.resolve(recorder.take)
  const media = recorder.media
  const stream = recorder.stream
  recorder.stopPromise = new Promise((resolve) => { recorder.stopWait = resolve })
  const done = recorder.stopPromise
  recorder.discard = discard
  recorder.stoppingMedia = media
  recorder.stopTimer = setTimeout(() => {
    if (recorder.stoppingMedia !== media) return
    recorder.discard = true
    const failure = recordingFailure('stop_timeout', '녹음을 멈추는 데 시간이 너무 오래 걸렸습니다.')
    settleStoppedFailure(media, failure)
  }, 30000)
  try {
    media.stop()
  } catch (error) {
    stopRecordingTracks(stream)
    const failure = recordingFailure('stop_failed', `녹음을 멈추지 못했습니다: ${error.message || error}`)
    settleStoppedFailure(media, failure)
    return done
  }
  stopRecordingTracks(stream)
  return done
}

async function finishRecording (media) {
  if (media && media !== recorder.media && media !== recorder.stoppingMedia) return null
  let result = null
  try {
    const stream = recorder.stream
    const stoppedByUs = recorder.stoppingMedia === media
    releaseStoppedRecording(media)
    if (!stoppedByUs) stopRecordingTracks(stream)
    if (recorder.discard) return null
    const blob = new Blob(recorder.chunks, { type: 'audio/webm' })
    if (blob.size < 2000) {
      result = recordingFailure('recording_too_short', '녹음이 너무 짧습니다. 1초 이상 녹음해 주세요.')
      $('recInfo').textContent = ''
      toast(result.error, 7000)
      return result
    }
    $('recInfo').textContent = '녹음을 저장하는 중…'
    const saved = await window.yue.saveRecording(new Uint8Array(await blob.arrayBuffer()))
    if (!saved.ok) {
      $('recInfo').textContent = ''
      result = recordingFailure(saved.code || 'save_failed', saved.message || saved.error || '녹음을 저장하지 못했습니다.')
      toast(result.error, 7000)
      return result
    }
    result = recorder.take = { ...saved, name: '녹음' }
    showTake()
    return result
  } catch (error) {
    $('recInfo').textContent = ''
    result = recordingFailure('save_failed', `녹음을 저장하지 못했습니다: ${error.message || error}`)
    toast(result.error, 7000)
    return result
  } finally {
    settleRecordingStop(result)
  }
}

async function pickRecording () {
  const result = await window.yue.pickRecording()
  if (!result.ok) {
    if (!result.canceled) toast(result.message, 7000)
    return
  }
  recorder.take = { ...result, name: result.name || '녹음 파일' }
  showTake()
}

function showTake () {
  const take = recorder.take
  $('recTake').classList.toggle('hidden', !take)
  $('recUse').disabled = !take
  if (!take) {
    $('recStart').textContent = '● 녹음 시작'
    $('recInfo').textContent = ''
    $('recAudio').removeAttribute('src')
    return
  }
  $('recAudio').src = take.url
  $('recInfo').textContent = `${take.name} · ${clock(take.seconds)}`
  showRecLength()
}

function showRecLength () {
  const take = recorder.take
  const target = Number($('recLength').value) || 0
  $('recLengthNote').textContent = !take ? ''
    : !target || target <= take.seconds + 1
      ? `곡 길이는 녹음 길이와 같습니다 (${clock(take.seconds)}).`
      : `녹음(${clock(take.seconds)})을 자연스럽게 이어 붙여 약 ${clock(target)} 곡으로 만듭니다.`
}

// The take becomes the song's starting point; style and words are written next.
function useRecording () {
  const take = recorder.take
  if (!take) return
  coverFrom = { source: 'recording', path: take.path, title: take.name, seconds: take.seconds,
    targetSeconds: Number($('recLength').value) || 0, hasChords: false }
  if (currentEngine() !== 'ace') {
    $('engine').value = 'ace'
    applyEngineUi()
  }
  closeRecorder()
  showCover()
  document.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'))
  $('style').focus()
  $('style').scrollIntoView({ block: 'nearest' })
  toast('녹음을 골랐습니다. 스타일을 적고, 부를 가사를 적거나 "가사 없이 (연주곡)"을 고른 뒤 "곡 만들기"를 누르세요.', 9000)
}

function wireRecorder () {
  $('recordSong').onclick = openRecorder
  $('recStart').onclick = startRecording
  $('recFile').onclick = pickRecording
  $('recUse').onclick = useRecording
  $('recCancel').onclick = closeRecorder
  $('recLength').onchange = showRecLength
}
wireRecorder()
