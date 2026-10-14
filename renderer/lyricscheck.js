'use strict'
// "가사 점검": what in the lyrics tends to come out mumbled or off the beat, found
// before a song is made. Each finding names its line so the editor can jump to it.
//   · no section tags, or a section far longer than 2–4 lines
//   · lines much longer than the others (sung in a rush) or very long overall
//   · digits, Latin acronyms and symbols (often not pronounced as written)
//   · more lyrics than the chosen song length can hold
// numbersToHangul() rewrites digits as they are read ("2024년" → "이천이십사년").
;(function () {
  const TAG = /^\s*\[[^\]\n]{1,30}\]\s*$/
  const HANGUL = /[가-힣]/g

  // Sung syllables in a line: Hangul blocks count one each; a Latin word counts its
  // vowel groups.
  function syllables (line) {
    const hangul = (line.match(HANGUL) || []).length
    const latin = (line.match(/[A-Za-z]+/g) || [])
      .reduce((sum, word) => sum + Math.max(1, (word.match(/[aeiouy]+/gi) || []).length), 0)
    return hangul + latin
  }

  // ── numbers read the Korean (Sino) way ──
  const DIGIT = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  function under10000 (n, dropOne) {
    const units = ['천', '백', '십', '']
    const digits = String(n).padStart(4, '0').split('').map(Number)
    return digits.map((d, i) => {
      if (!d) return ''
      if (units[i] && d === 1 && dropOne) return units[i]
      return DIGIT[d] + units[i]
    }).join('')
  }
  function koreanNumber (n) {
    if (!Number.isFinite(n) || n < 0 || n > 999999999999) return null
    if (n === 0) return '영'
    const parts = [[100000000, '억'], [10000, '만']]
    let rest = Math.floor(n)
    let out = ''
    for (const [size, name] of parts) {
      const chunk = Math.floor(rest / size)
      if (chunk) out += (chunk === 1 && name === '만' ? '' : under10000(chunk, true)) + name
      rest %= size
    }
    return out + under10000(rest, true)
  }
  function numbersToHangul (text) {
    // Only a "%" may take the spaces before it; a line break after a number stays.
    return String(text).replace(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:[ \t]*(%))?/g, (all, whole, frac, pct) => {
      const n = Number(whole.replace(/,/g, ''))
      let spoken = koreanNumber(n)
      if (spoken === null) return all
      if (frac) spoken += ' 점 ' + frac.split('').map((d) => d === '0' ? '영' : DIGIT[Number(d)]).join('')
      return spoken + (pct ? ' 퍼센트' : '')
    })
  }

  function checkLyrics (text, { targetSeconds = null } = {}) {
    const findings = []
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
    const sung = lines.map((line, index) => ({ line: line.trim(), index })).filter((x) => x.line && !TAG.test(x.line))
    if (!sung.length) return { findings, sungLines: 0, syllables: 0, estimate: 0 }
    const add = (level, index, message, fix = null) => findings.push({ level, line: index, message, fix })

    // Sections: tags present, and how long each one is.
    const hasTags = lines.some((line) => TAG.test(line))
    if (!hasTags && sung.length >= 4) {
      add('warn', sung[0].index, '구간 태그([Verse] [Chorus] 등)가 없습니다. "구간 나누기"를 누르면 붙습니다.', 'sections')
    }
    let start = null
    let count = 0
    const closeSection = () => {
      if (start !== null && count > 6) add('warn', start, `이 구간이 ${count}줄입니다. 2~4줄씩 나누면 더 안정적으로 부릅니다.`)
    }
    lines.forEach((line, index) => {
      if (TAG.test(line)) { closeSection(); start = index; count = 0 } else if (line.trim()) {
        if (start === null) start = index
        count++
      }
    })
    closeSection()

    // Line lengths: very long lines, and lines far longer than the song's usual line.
    const counts = sung.map((x) => syllables(x.line))
    const sorted = [...counts].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] || 0
    sung.forEach((x, i) => {
      const n = counts[i]
      if (n > 18) add('warn', x.index, `한 줄이 ${n}음절로 깁니다. 빠르게 몰아 부르거나 뭉개질 수 있어요. 두 줄로 나눠 보세요.`)
      else if (median >= 4 && n >= median * 1.8 && n > 12) add('info', x.index, `다른 줄(보통 ${median}음절)보다 훨씬 깁니다(${n}음절). 박자가 밀릴 수 있어요.`)
    })

    // What is not sung as written. Korean lyrics get their digits rewritten in Hangul;
    // other lyrics are only told to spell numbers out.
    const korean = /[가-힣]/.test(text)
    sung.forEach((x) => {
      if (/\d/.test(x.line)) {
        if (korean) add('warn', x.index, '숫자는 읽는 그대로 한글로 적어 주세요 (예: 2024 → 이천이십사).', 'numbers')
        else add('warn', x.index, '숫자는 읽는 그대로 글자로 적어 주세요 (예: 2024 → twenty twenty-four).')
      }
      const acronyms = x.line.match(/\b[A-Z]{2,}\b/g)
      if (acronyms && HANGUL.test(x.line)) add('info', x.index, `"${acronyms.join(', ')}"은(는) 소리 나는 대로 한글로 적으면 정확하게 부릅니다 (예: AI → 에이아이).`)
      HANGUL.lastIndex = 0
      if (/[*#@^_=+<>{}|\\/♪♬♩♫]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(x.line)) add('info', x.index, '기호나 이모지는 노래로 부르지 않거나 이상한 소리가 날 수 있어요. 빼 주세요.')
    })

    // Lyrics against the chosen length: about three syllables a second while singing,
    // plus room for the intro, breaks between sections and the ending.
    const total = counts.reduce((a, b) => a + b, 0)
    const sections = Math.max(1, lines.filter((line) => TAG.test(line)).length)
    const estimate = Math.round(total / 3 + sections * 6 + 15)
    if (targetSeconds && estimate > targetSeconds * 1.05) {
      add('warn', sung[0].index, `가사가 정한 길이(${Math.round(targetSeconds / 60 * 10) / 10}분)에 비해 많습니다. 부르려면 약 ${Math.round(estimate / 6) / 10}분이 필요해요. 길이를 늘리거나 "자동"으로 두세요.`)
    }
    if (sung.length > 48) add('info', sung[0].index, `가사가 ${sung.length}줄로 깁니다. 6분을 넘는 부분은 잘릴 수 있어요.`)

    findings.sort((a, b) => a.line - b.line || (a.level === 'warn' ? -1 : 1))
    return { findings, sungLines: sung.length, syllables: total, estimate }
  }

  const api = { checkLyrics, numbersToHangul, koreanNumber, syllables }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else window.RoadLyricsCheck = api
})()
