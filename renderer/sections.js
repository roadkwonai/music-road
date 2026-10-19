'use strict'
// Lyrics pasted without section tags get [Intro]/[Verse]/[Pre-Chorus]/[Chorus]/[Bridge]/
// [Outro] put in front of each block. Blocks are the paragraphs (blank-line separated);
// one long unbroken block is cut every four lines. The block that comes back most is
// the chorus; a block that sits right before every chorus is the pre-chorus; a new
// block between the later choruses is the bridge. Without any repeat the blocks
// alternate verse/chorus. Lyrics that already carry tags are left alone (null).
;(function () {
  const TAG_LINE = /^\s*\[[^\]\n]{1,30}\]\s*$/m

  const key = (block) => block.join('\n').toLowerCase().replace(/[\s.,!?~'"“”‘’…·\-()]/g, '')

  // Two blocks count as the same part when most of their lines match (a chorus is
  // often sung back with one line changed).
  function similar (a, b) {
    if (key(a) === key(b)) return true
    const la = a.map((line) => key([line])).filter(Boolean)
    const lb = new Set(b.map((line) => key([line])).filter(Boolean))
    if (la.length < 2 || lb.size < 2) return false
    const shared = la.filter((line) => lb.has(line)).length
    return shared / Math.max(la.length, lb.size) >= 0.7
  }

  function blocksOf (text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/\s+$/, ''))
    const blocks = []
    let current = []
    for (const line of lines) {
      if (line.trim()) current.push(line.trim())
      else if (current.length) { blocks.push(current); current = [] }
    }
    if (current.length) blocks.push(current)
    // One unbroken wall of lines: four lines per part.
    if (blocks.length === 1 && blocks[0].length > 8) {
      const all = blocks[0]
      blocks.length = 0
      for (let i = 0; i < all.length; i += 4) blocks.push(all.slice(i, i + 4))
    }
    return blocks
  }

  function autoSections (text) {
    if (!text || !String(text).trim() || TAG_LINE.test(text)) return null
    const blocks = blocksOf(text)
    if (blocks.length < 2) return null

    // Group blocks that are the same part.
    const group = blocks.map(() => -1)
    let groups = 0
    blocks.forEach((block, i) => {
      if (group[i] !== -1) return
      group[i] = groups
      for (let j = i + 1; j < blocks.length; j++) if (group[j] === -1 && similar(block, blocks[j])) group[j] = groups
      groups++
    })
    const count = (g) => group.filter((x) => x === g).length
    const repeated = [...new Set(group)].filter((g) => count(g) > 1)

    const labels = blocks.map(() => 'Verse')
    if (repeated.length) {
      // The chorus: the most repeated part; on a tie, the longer one.
      let chorus = repeated.sort((a, b) => count(b) - count(a) ||
        blocks[group.indexOf(b)].length - blocks[group.indexOf(a)].length)[0]
      // On a tie, a part that is always followed by another repeated part leads into
      // it: the follower is the chorus.
      const spotsOf = (g) => group.map((x, i) => x === g ? i : -1).filter((i) => i >= 0)
      const next = group[spotsOf(chorus)[0] + 1]
      if (next !== undefined && next !== chorus && count(next) === count(chorus) &&
          spotsOf(chorus).every((i) => group[i + 1] === next)) chorus = next
      const at = group.map((g, i) => g === chorus ? i : -1).filter((i) => i >= 0)
      at.forEach((i) => { labels[i] = 'Chorus' })
      // Another repeated part that always comes right before a chorus: pre-chorus.
      for (const g of repeated) {
        if (g === chorus) continue
        const spots = group.map((x, i) => x === g ? i : -1).filter((i) => i >= 0)
        const before = spots.every((i) => group[i + 1] === chorus)
        spots.forEach((i) => { labels[i] = before ? 'Pre-Chorus' : 'Chorus' })
      }
      // A one-off part after the second chorus, with a chorus still to come: bridge.
      if (at.length >= 3) {
        for (let i = at[1] + 1; i < at[at.length - 1]; i++) {
          if (count(group[i]) === 1 && labels[i] === 'Verse') labels[i] = 'Bridge'
        }
      } else if (at.length === 2) {
        for (let i = at[0] + 1; i < at[1]; i++) {
          if (count(group[i]) === 1 && labels[i] === 'Verse' && i > 1 && labels[i - 1] !== 'Chorus') labels[i] = 'Bridge'
        }
      }
      // A short one-off after the last chorus closes the song.
      const last = blocks.length - 1
      if (last > at[at.length - 1] && count(group[last]) === 1 && blocks[last].length <= 4) labels[last] = 'Outro'
    } else {
      // No repeat to go by: verse and chorus take turns.
      blocks.forEach((_, i) => { labels[i] = i % 2 === 0 ? 'Verse' : 'Chorus' })
      if (blocks.length >= 5 && blocks[blocks.length - 1].length <= 2) labels[blocks.length - 1] = 'Outro'
    }
    // A lone opening line before the first verse ("Oh yeah"): intro.
    if (blocks.length >= 4 && blocks[0].length === 1 && labels[0] === 'Verse') labels[0] = 'Intro'

    return blocks.map((block, i) => `[${labels[i]}]\n${block.join('\n')}`).join('\n\n')
  }

  const api = { autoSections }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else window.RoadSections = api
})()
