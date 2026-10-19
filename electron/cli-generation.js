'use strict'
const { cleanLyrics, composeStyle, structureLyrics } = require('../renderer/prompt')
const { generationError, effectiveAdvanced, runtimeDefaults } = require('../renderer/generation-options')
const invalid = message => { throw Object.assign(new Error(message), { code: 'INVALID_ARGUMENT' }) }

function preparePreview (input) {
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
  if (parts.instrumentation && parts.instrumentation.length && parts.instruments && parts.instruments.length) invalid('instruments와 instrumentation 중 한 가지 편성 표현을 사용하세요.')
  const composed = composeStyle({ ...parts, soundEffect: Boolean(input.soundEffect), lyrics })
  const { style } = composed
  if (!style) invalid('스타일이나 악기를 지정하세요.')
  const heading = String(input.lyrics || '').split('\n').find(line => /^\s*#/.test(line))
  const title = input.title || (heading && heading.replace(/^\s*#+\s*/, '').trim()) ||
    lyrics.split('\n').find(line => line.trim() && !line.startsWith('[')) || (input.soundEffect ? '효과음' : instrumental ? '연주곡' : '무제')
  const { count: _count, bpm: _bpm, ...base } = input
  const advanced = { ...(parts.strict && parts.strong ? { cfgScale: 1.5 } : {}), ...(input.advanced || {}) }
  const errors = []
  if (composed.dropped && composed.dropped.length) errors.push('스타일 지시가 삭제됩니다. 대괄호를 풀거나 짧은 태그로 나누고 의미를 확인하세요.')
  if (engine === 'ace' && Array.from(style).length > 512) errors.push('ACE 최종 caption이 512자를 넘습니다.')
  if (engine === 'ace' && Array.from(lyrics).length > 4096) errors.push('ACE 정리 가사가 4096자를 넘습니다.')
  const promptFields = {}
  if (typeof input.requestPrompt === 'string' && input.requestPrompt.trim()) promptFields.requestPrompt = input.requestPrompt.slice(0, 64 * 1024)
  if (typeof input.requestId === 'string' && /^[a-f0-9]{48}$/i.test(input.requestId)) promptFields.requestId = input.requestId.toLowerCase()
  const requests = Array.from({ length: count }, (_, index) => ({ ...base, ...promptFields, engine, parts, style, lyrics, instrumental,
    ...(Object.keys(advanced).length ? { advanced } : {}),
    title: count > 1 ? `${title} ${String.fromCharCode(65 + index)}` : title,
    seed: input.seed == null ? null : typeof input.seed === 'string'
      ? String((BigInt(input.seed) + BigInt(index)) % (2n ** 63n))
      : engine === 'ace' ? (input.seed + index) % (2 ** 31)
        : Number.isSafeInteger(input.seed + index) ? input.seed + index : String(BigInt(input.seed) + BigInt(index)) }))
  const effective = engine === 'ace' ? { advanced: {}, runtime: {} }
    : { advanced: effectiveAdvanced(advanced, input.cot || 'full'), runtime: engine === 'yue-mlx' ? { ...runtimeDefaults, ...(input.runtime || {}) } : {} }
  const fieldNames = { topP: 'top_p', topK: 'top_k', repetitionPenalty: 'repetition_penalty', penaltyWindow: 'penalty_window', minTokens: 'min_tokens', maxTokens: 'max_tokens', temperature: 'temperature' }
  const nativeRequest = engine === 'ace' ? { caption: style, lyrics } : {
    style, lyrics, cot: input.cot || 'full', seed: requests[0].seed,
    ...(input.abc ? { abc: input.abc } : {}),
    cfg_scale: effective.advanced.cfgScale,
    abc_sampling: Object.fromEntries(Object.entries(fieldNames).map(([key, value]) => [`${value}`, effective.advanced[`abc${key[0].toUpperCase()}${key.slice(1)}`]])),
    semantic_sampling: Object.fromEntries(Object.entries(fieldNames).map(([key, value]) => [value, effective.advanced[key]])),
    generation_config: { ode_steps: effective.advanced.odeSteps }
  }
  return { valid: errors.length === 0, engine, errors, notes: composed.notes || [], requests,
    changes: { style: { original: input.style || '', selected: parts.genre, prepared: style, dropped: composed.dropped || [],
      overridden: input.parts && input.parts.genre !== undefined && input.style !== undefined && input.style !== input.parts.genre },
    lyrics: { original: input.lyrics || '', prepared: lyrics, changed: (input.lyrics || '') !== lyrics } },
    effective, nativeRequest, validation: { context: engine === 'ace' ? 'not-applicable' : 'requires-runtime-tokenizer',
      seed: input.seed == null ? 'assigned-at-submission' : 'explicit', synthesis: 'not-run',
      targetSeconds: engine === 'ace' ? 'generation-target' : 'record-only-natural-eos' } }
}
function prepareRequests (input) {
  const preview = preparePreview(input)
  if (!preview.valid) throw Object.assign(new Error(preview.errors.join(' ')), { code: 'INVALID_ARGUMENT', details: preview })
  return preview.requests
}
module.exports = { prepareRequests, preparePreview }
