'use strict'
// ── lyric subtitles (SRT) ────────────────────────────────────────────────────
// YuE2 does not say when each word is sung, so the times are estimated. When the
// song kept its score (score.abc) the estimate follows the melody: the score marks
// every section ("% verse"), the tempo and each sung note, so a section's lines are
// laid over that section's notes — one syllable to one note, as Korean is sung.
// Without a score the lines are spread over the song by how many syllables they have.

const cleanLyricsFn = typeof cleanLyrics === 'function'
  ? cleanLyrics
  : (typeof require === 'function' ? require('./prompt').cleanLyrics : (text) => ({ text }))

const PLAYED = /^(intro|interlude|outro|instrumental)$/

// "[Verse 2]" → "verse", "[Pre-Chorus]" → "pre-chorus".
const sectionKey = (name) => String(name || '').toLowerCase().replace(/\d+/g, '').trim().replace(/\s+/g, '-')

// Sections of the lyrics as the song was made: [{ key, lines: [text] }].
function lyricSections (lyrics) {
  const { text } = cleanLyricsFn(lyrics)
  const sections = []
  let current = null
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    const tag = line.match(/^\[([^\]]+)\]$/)
    if (tag) {
      if (/^instrumental$/i.test(tag[1])) continue
      current = { key: sectionKey(tag[1]), lines: [] }
      sections.push(current)
      continue
    }
    if (!line) continue
    if (!current) {
      current = { key: 'verse', lines: [] }
      sections.push(current)
    }
    current.lines.push(line)
  }
  return sections
}

// Roughly how many notes a line takes: a Hangul/Kana/Han character is one, a Latin
// word is its vowel groups, a number is its digits.
function syllables (line) {
  let count = 0
  for (const word of String(line).split(/\s+/)) {
    const cjk = word.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3]/g)
    if (cjk) count += cjk.length
    const latin = word.replace(/[^a-z]/gi, '')
    if (latin) count += Math.max(1, (latin.toLowerCase().match(/[aeiouy]+/g) || []).length)
    const digits = word.replace(/\D/g, '')
    count += digits.length
  }
  return Math.max(1, count)
}

// ── score timing ──
function fraction (text, fallback) {
  const match = String(text || '').match(/(\d+)\s*\/\s*(\d+)/)
  return match ? Number(match[1]) / Number(match[2]) : fallback
}

// The vocal line of a YuE2 score on a clock: its sections with start/end seconds and
// the sung notes ({ on, off }) inside each.
function scoreTimeline (abc) {
  const lines = String(abc || '').replace(/\r/g, '').split('\n')
  const field = (key) => {
    const line = lines.find((item) => item.startsWith(`${key}:`))
    return line ? line.slice(key.length + 1).trim() : ''
  }
  const meter = field('M')
  const barWhole = meter === 'C' || meter === 'C|' ? 1 : fraction(meter, 1)
  const unit = fraction(field('L'), 1 / 8)
  const tempo = field('Q')
  const bpmMatch = tempo.match(/=\s*(\d+(?:\.\d+)?)/) || tempo.match(/^(\d+(?:\.\d+)?)$/)
  const bpm = bpmMatch ? Number(bpmMatch[1]) : 120
  const beat = tempo.includes('=') ? fraction(tempo.split('=')[0], 1 / 4) : 1 / 4
  const secondsPerUnit = unit / beat * (60 / bpm)
  const barUnits = barWhole / unit

  const voices = lines.filter((line) => /^V:/.test(line)).map((line) => line.slice(2).trim().split(/\s+/)[0])
  const vocal = voices.find((id) => /vocal/i.test(id)) || voices[0] || null

  const sections = []
  let section = null
  let voice = null
  let units = 0
  let tied = false
  const notes = []
  const open = (name) => {
    if (section) section.end = units * secondsPerUnit
    section = { key: sectionKey(name), start: units * secondsPerUnit, end: null, notes: [] }
    sections.push(section)
  }
  for (const line of lines) {
    const comment = line.match(/^%\s*(.+)$/)
    if (comment) {
      open(comment[1])
      continue
    }
    const v = line.match(/^V:\s*(\S+)/)
    if (v) {
      voice = v[1]
      continue
    }
    if (/^[A-Za-z]:/.test(line) || !line.trim()) continue
    if (vocal && voice !== vocal) continue
    if (!section) open('verse')
    // Chord names, decorations and tuplet marks do not take time.
    const music = line.replace(/"[^"]*"/g, '').replace(/![^!]*!|\+[^+]*\+/g, '').replace(/\(\d/g, '')
    const token = /(\[[^\]]*\]|[_^=]*[A-Ga-g][,']*|[zx]|Z)(\d*)(\/*)(\d*)(-?)/g
    let match
    while ((match = token.exec(music))) {
      const [, head, num, slashes, den, tie] = match
      let length = num ? Number(num) : 1
      if (head === 'Z') {
        length = (num ? Number(num) : 1) * barUnits
      } else if (slashes) {
        length = length / (den ? Number(den) : 2 ** slashes.length)
      }
      const on = units * secondsPerUnit
      units += length
      const off = units * secondsPerUnit
      if (/^[zxZ]$/.test(head)) {
        tied = false
        continue
      }
      if (tied && notes.length) {
        notes[notes.length - 1].off = off // held over the bar line: the same syllable
      } else {
        const note = { on, off }
        notes.push(note)
        section.notes.push(note)
      }
      tied = Boolean(tie)
    }
  }
  if (section) section.end = units * secondsPerUnit
  return { seconds: units * secondsPerUnit, bpm, sections, notes }
}

// ── cues ──
// Pairs each lyric section with the next score section of the same kind that has
// singing in it; failing that, with the next one that has singing at all.
function matchSections (lyrics, score) {
  const sung = score.sections.filter((item) => item.notes.length)
  const pairs = []
  let next = 0
  for (const section of lyrics) {
    if (!section.lines.length) continue
    let found = -1
    for (let i = next; i < Math.min(sung.length, next + 3); i++) {
      if (sung[i].key === section.key) { found = i; break }
    }
    if (found < 0 && next < sung.length) found = next
    pairs.push({ section, score: found >= 0 ? sung[found] : null })
    if (found >= 0) next = found + 1
  }
  return pairs
}

// One section's lines laid over its notes, syllable by syllable.
function timeSection (lines, notes) {
  const counts = lines.map(syllables)
  const total = counts.reduce((sum, n) => sum + n, 0)
  const at = (syllable) => Math.min(notes.length - 1, Math.floor(syllable * notes.length / total))
  const cues = []
  let done = 0
  lines.forEach((text, index) => {
    const first = notes[at(done)]
    done += counts[index]
    const last = notes[Math.max(at(done - 1), at(done - counts[index]))]
    cues.push({ start: first.on, end: last.off, text })
  })
  return cues
}

// Lines spread over a stretch of time by syllables — for songs without a score and
// for sections the score could not be matched to.
function spread (lines, start, end) {
  const counts = lines.map(syllables)
  const total = counts.reduce((sum, n) => sum + n, 0)
  let at = start
  return lines.map((text, index) => {
    const length = (end - start) * counts[index] / total
    const cue = { start: at, end: at + length, text }
    at += length
    return cue
  })
}

// The whole song's cues: [{ start, end, text }] in seconds, in order, not overlapping.
// `method` says how they were placed, for the message shown after saving.
function lyricCues ({ lyrics, abc, seconds }) {
  const sections = lyricSections(lyrics).filter((section) => !PLAYED.test(section.key) || section.lines.length)
  if (!sections.some((section) => section.lines.length)) return { cues: [], method: 'none' }
  const length = Number(seconds) || 0
  let cues = []
  let method = 'spread'
  const score = abc ? scoreTimeline(abc) : null
  if (score && score.notes.length) {
    method = 'score'
    // The audio follows the score's tempo; a small difference in length (a tail of
    // silence, rounding) is spread evenly rather than piling up at the end.
    const ratio = length && score.seconds ? length / score.seconds : 1
    const scale = ratio > 0.8 && ratio < 1.25 ? ratio : 1
    const pairs = matchSections(sections, score)
    pairs.forEach((pair, index) => {
      if (pair.score) {
        cues.push(...timeSection(pair.section.lines, pair.score.notes)
          .map((cue) => ({ ...cue, start: cue.start * scale, end: cue.end * scale })))
        return
      }
      // Unmatched: between the previous cue and the next matched section.
      const from = cues.length ? cues[cues.length - 1].end : 0
      const later = pairs.slice(index + 1).find((item) => item.score)
      const to = later ? later.score.start * scale : (length || from + 4 * pair.section.lines.length)
      cues.push(...spread(pair.section.lines, from, Math.max(from + 1, to)))
    })
  } else {
    // No score: sung lines share the song, leaving a short intro and ending.
    const lines = sections.flatMap((section) => section.lines)
    const total = length || lines.length * 4
    cues = spread(lines, total * 0.06, total * 0.94)
  }
  return { cues: tidyCues(cues, length), method }
}

// ACE-Step's own record of when each line is sung ("[mm:ss.xx]text"). Section tags
// carry no words and are skipped; each line lasts until the next begins.
function cuesFromLrc (lrc, seconds) {
  const length = Number(seconds) || 0
  const lines = []
  for (const raw of String(lrc || '').split(/\r?\n/)) {
    const match = raw.trim().match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
    if (!match) continue
    const text = match[3].trim()
    if (!text || /^\[[^\]]*\]$/.test(text)) continue
    lines.push({ start: Number(match[1]) * 60 + Number(match[2]), text })
  }
  lines.sort((a, b) => a.start - b.start)
  // When a song opens with an instrumental intro, ACE-Step tends to pin its first
  // line(s) to 0:00, followed by a long gap. Those lines are moved to just before the
  // next one, at the song's usual spacing between lines.
  const gaps = lines.slice(1).map((line, i) => line.start - lines[i].start).filter((gap) => gap > 0.5 && gap < 15)
  const typical = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 4
  let pinned = 0
  while (pinned < lines.length && lines[pinned].start < 1) pinned++
  if (pinned && pinned < lines.length && lines[pinned].start - lines[pinned - 1].start > 2 * typical) {
    for (let i = pinned - 1, at = lines[pinned].start - typical; i >= 0; i--, at -= typical) lines[i].start = Math.max(0, at)
  }
  const cues = lines.map((line, index) => ({
    start: line.start,
    end: index + 1 < lines.length ? lines[index + 1].start : Math.min(length || line.start + 5, line.start + 5),
    text: line.text
  }))
  return { cues: tidyCues(cues, length), method: 'lrc' }
}

// In order, no overlaps, each shown long enough to read, none past the end. Lines
// sung in a quick run (under a second apart) share one subtitle of up to three lines.
function tidyCues (cues, length) {
  cues.sort((a, b) => a.start - b.start)
  for (let i = 0; i < cues.length - 1; i++) {
    const next = cues[i + 1]
    if (next.start - cues[i].start >= 1 || cues[i].text.split('\n').length >= 3) continue
    cues.splice(i, 2, { start: cues[i].start, end: Math.max(cues[i].end, next.end), text: `${cues[i].text}\n${next.text}` })
    i -= 1 // the merged cue may take the next line too
  }
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]
    const next = cues[i + 1]
    cue.end = Math.max(cue.end + 0.4, cue.start + 1.2)
    if (next) cue.end = Math.min(cue.end, next.start - 0.05)
    if (length) cue.end = Math.min(cue.end, length)
    if (cue.end <= cue.start) cue.end = cue.start + 0.3
  }
  return cues
}

function srtTime (seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const pad = (n, width = 2) => String(n).padStart(width, '0')
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

function toSrt (cues) {
  return cues.map((cue, index) =>
    `${index + 1}\r\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\r\n${cue.text.replace(/\n/g, '\r\n')}\r\n`).join('\r\n')
}

if (typeof module !== 'undefined') {
  module.exports = { lyricSections, syllables, scoreTimeline, lyricCues, cuesFromLrc, srtTime, toSrt }
}
