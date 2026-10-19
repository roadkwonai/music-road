'use strict'
// ── 다국어 엔진 (한국어 · English · 日本語) ─────────────────────────────────────
// The app is written in Korean, and the Korean text itself is the key: locales/en.js
// and locales/ja.js hold { exact: { 한국어: translation }, patterns: [[한국어 {0}…, translation {0}…]] }.
// A pattern is a string the code builds around values (a song title, a count, a time);
// its holes are matched and carried into the translation, translated themselves when
// they are UI text too ("약 3분" inside a longer message).
// Shared by the window (renderer/i18n.js) and the main process (native dialogs, menus).

;(function (root) {
  const HANGUL = /[가-힣]/
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  function createTranslator (locale) {
    const exact = new Map()
    const patterns = []
    const cache = new Map()
    if (locale) {
      for (const [ko, out] of Object.entries(locale.exact || {})) if (out) exact.set(norm(ko), out)
      for (const [ko, out] of locale.patterns || []) {
        if (!out) continue
        const key = norm(ko)
        const literal = key.replace(/\{\d+\}/g, '')
        const order = []
        const source = escape(key).replace(/\\\{(\d+)\\\}/g, (_, n) => {
          order.push(Number(n))
          return '([\\s\\S]*?)'
        }).replace(/ /g, '\\s+')
        // A pattern that is almost all hole ("{0}곡") would swallow unrelated text: its
        // holes may only hold numbers, names in Latin script and the like, not Korean.
        patterns.push({ re: new RegExp(`^${source}$`), out, order, strict: literal.replace(/\s/g, '').length <= 3, weight: literal.length })
      }
      patterns.sort((a, b) => b.weight - a.weight)
    }

    function translate (text, depth = 0) {
      if (text == null) return text
      const value = String(text)
      if (!locale || !HANGUL.test(value)) return value
      if (depth === 0 && cache.has(value)) return cache.get(value)
      const out = lookup(value, depth)
      if (depth === 0) {
        if (cache.size > 5000) cache.clear()
        cache.set(value, out)
      }
      return out
    }

    // Leading and trailing spaces belong to the layout, not the words.
    function edges (original, out) {
      const lead = original.match(/^\s*/)[0]
      const tail = original.match(/\s*$/)[0]
      return lead + out + (original.trim() ? tail : '')
    }

    function lookup (value, depth) {
      const key = norm(value)
      if (!key) return value
      const hit = exact.get(key)
      if (hit !== undefined) return edges(value, hit)
      for (const p of patterns) {
        const m = p.re.exec(key)
        if (!m) continue
        const holes = m.slice(1)
        if (p.strict && holes.some((h) => HANGUL.test(h))) continue
        const filled = p.out.replace(/\{(\d+)\}/g, (_, n) => {
          const at = p.order.indexOf(Number(n))
          const hole = at < 0 ? '' : holes[at]
          return depth < 3 ? translate(hole, depth + 1) : hole
        })
        return edges(value, filled)
      }
      // Text assembled from several messages: line by line, then piece by piece.
      if (/\n/.test(value.trim())) return value.split('\n').map((line) => translate(line, depth + 1)).join('\n')
      if (key.includes(' · ')) return edges(value, key.split(' · ').map((part) => translate(part, depth + 1)).join(' · '))
      return value
    }

    return translate
  }

  const api = { createTranslator, norm }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.RoadI18n = api
})(typeof window !== 'undefined' ? window : globalThis)
