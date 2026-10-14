'use strict'
const { cleanLyrics, composeStyle, structureLyrics } = require('../renderer/prompt')
const { generationError } = require('../renderer/generation-options')
const invalid = message => { throw Object.assign(new Error(message), { code: 'INVALID_ARGUMENT' }) }

function prepareRequests (input) {
  const count = input.count === undefined ? 1 : input.count
  if (!Number.isInteger(count) || count < 1 || count > 8) invalid('count는 1~8 정수여야 합니다.')
  const engine = input.engine || 'ace'
  const error = generationError({ ...input, engine })
  if (error) invalid(error)
  const instrumental = Boolean(input.instrumental || input.soundEffect || input.parts && input.parts.instrumental)
  const parts = { ...(input.parts || {}), genre: input.parts && input.parts.genre !== undefined ? input.parts.genre : input.style || '', instrumental }
  if (input.bpm !== undefined) parts.bpm = input.bpm
  const raw = input.soundEffect ? '[Instrumental]' : instrumental
    ? structureLyrics(parts.structure, { instrumental: true }) : input.lyrics || ''
  const lyrics = cleanLyrics(raw).text
  if (!instrumental && !lyrics.split('\n').some(line => line.trim() && !line.startsWith('['))) invalid('부를 가사를 입력하거나 instrumental을 켜세요.')
  const { style } = composeStyle({ ...parts, soundEffect: Boolean(input.soundEffect), lyrics })
  if (!style) invalid('스타일이나 악기를 지정하세요.')
  const heading = String(input.lyrics || '').split('\n').find(line => /^\s*#/.test(line))
  const title = input.title || (heading && heading.replace(/^\s*#+\s*/, '').trim()) ||
    lyrics.split('\n').find(line => line.trim() && !line.startsWith('[')) || (input.soundEffect ? '효과음' : instrumental ? '연주곡' : '무제')
  const { count: _count, bpm: _bpm, ...base } = input
  const advanced = { ...(parts.strict && parts.strong ? { cfgScale: 1.5 } : {}), ...(input.advanced || {}) }
  return Array.from({ length: count }, (_, index) => ({ ...base, engine, parts, style, lyrics, instrumental,
    ...(Object.keys(advanced).length ? { advanced } : {}),
    title: count > 1 ? `${title} ${String.fromCharCode(65 + index)}` : title,
    seed: input.seed == null ? null : (input.seed + index) % (2 ** 31) }))
}
module.exports = { prepareRequests }
