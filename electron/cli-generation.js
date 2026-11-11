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
  const officialGuide = engine === 'ace' ? undefined
    : officialGuideChecks({ userStyle: [parts.genre, ...(parts.vocal || []), ...(parts.dynamics || []), ...(parts.mix || [])].filter(Boolean).join(', '), style, lyrics, instrumental, cot: input.cot || 'full', abc: input.abc })
  return { valid: errors.length === 0, engine, errors, notes: composed.notes || [], requests, ...(officialGuide ? { officialGuide } : {}),
    changes: { style: { original: input.style || '', selected: parts.genre, prepared: style, dropped: composed.dropped || [],
      overridden: input.parts && input.parts.genre !== undefined && input.style !== undefined && input.style !== input.parts.genre },
    lyrics: { original: input.lyrics || '', prepared: lyrics, changed: (input.lyrics || '') !== lyrics } },
    effective, nativeRequest, validation: { context: engine === 'ace' ? 'not-applicable' : 'requires-runtime-tokenizer',
      seed: input.seed == null ? 'assigned-at-submission' : 'explicit', synthesis: 'not-run',
      targetSeconds: engine === 'ace' ? 'generation-target' : 'record-only-natural-eos' } }
}
// Advisory checks from the official YuE2 generation guide (pinned yue2-v0.1.6 and the
// 2026-11-01 main). They never change or block the request; the agent reports them.
const LANGUAGE = /\b(korean|english|chinese|mandarin|cantonese|japanese|spanish|french|german|italian|portuguese)\b|한국어|영어|중국어|일본어/i
const VOICE = /vocal|voice|singer|choir|\brap\b|duet|male|female|보컬|목소리|가수|남성|여성|합창/i
const TEMPO = /\b\d{2,3}\s*bpm\b|tempo|uptempo|downtempo|템포/i
const INSTRUMENT = /drum|guitar|bass|piano|synth|string|brass|organ|percussion|pad|orchestra|accordion|violin|cello|viola|flute|sax|trumpet|harp|ukulele|banjo|rhodes|keys|beat|악기|피아노|기타|드럼|현악/i
const NEGATION = /\b(no|without|avoid|don'?t|do not|never|negative)\b|없이|빼고|제외|금지|하지\s*마/i
const INSTRUCTION = /\b(you are|generate|create a song|make a song|instruction|ignore|prompt)\b|만들어|생성해|작곡해/i
function officialGuideChecks ({ userStyle, style, lyrics, instrumental, cot, abc }) {
  const check = (id, ok, rule, advice) => ({ id, status: ok === null ? 'not-applicable' : ok ? 'pass' : 'advice', rule, ...(ok === false ? { advice } : {}) })
  const sung = lyrics.split('\n').filter(line => line.trim() && !line.trim().startsWith('['))
  const annotated = sung.filter(line => /[(（].*[)）]|\/\s*\S+\s*\//.test(line))
  const styleTempo = (style.match(/\b(\d{2,3})\s*bpm\b/i) || [])[1]
  const abcTempo = abc ? (String(abc).match(/^Q:\s*(?:\d+\/\d+\s*=\s*)?(\d{2,3})/m) || [])[1] : undefined
  const checks = [
    check('style-language', instrumental ? null : LANGUAGE.test(style), 'style에 가창 언어를 적는다', 'style 앞쪽에 실제 가사 언어(예: Korean)를 적는다.'),
    // "no drums" names an instrument without asking for it.
    check('style-genre-instruments', style.split(',').some(part => INSTRUMENT.test(part) && !NEGATION.test(part)), 'style에 장르와 주요 악기를 적는다', '장르 뒤에 주요 악기 2~4개를 영어로 적는다.'),
    check('style-vocal', instrumental ? null : VOICE.test(style), 'style에 보컬 성격을 적는다', 'solo female vocal처럼 보컬 성격을 적는다. 특정 가수 보장은 아니다.'),
    check('style-tempo', TEMPO.test(style), 'style에 의도한 템포를 적는다', 'bpm 필드나 style에 의도한 BPM을 적는다. 정확한 템포 보장은 아니다.'),
    check('style-positive-description', !NEGATION.test(userStyle), 'negative_prompt 필드가 없으므로 원하는 소리를 긍정형으로 기술한다', '부정·제외 문구는 제외를 보장하지 않는다. 원하는 편성·질감을 긍정형으로 바꾸는 안을 제안한다.'),
    check('style-no-instruction', !INSTRUCTION.test(userStyle), '모드별 원생 지시문을 대체하는 명령문을 style에 넣지 않는다', '명령문을 지우고 음악 묘사(장르·악기·보컬·언어·템포)만 남기는 안을 제안한다.'),
    check('lyrics-sections', instrumental ? null : lyrics.split('\n').some(line => /^\[(Verse|Chorus|Pre-Chorus|Bridge)\]$/.test(line.trim())), '부를 가사에 [Verse]·[Chorus] 같은 구간 태그를 붙인다', '부를 구절을 [Verse]·[Chorus] 등 구간으로 나눈다.'),
    check('lyrics-no-annotations', instrumental ? null : annotated.length === 0, '가사의 발음·화자·연출 주석은 별도 제어 채널이 아니며 그대로 불릴 수 있다', `실제로 부를 말이 아니면 주석을 빼고 style이나 검수 메모로 옮기는 안을 제안한다: ${annotated.slice(0, 3).join(' / ')}`),
    check('abc-tempo-consistency', abc ? Boolean(styleTempo && abcTempo && Math.abs(styleTempo - abcTempo) <= 2) : null, '외부 ABC의 템포(Q:)와 style의 BPM을 일치시킨다', `ABC 템포(${abcTempo || '없음'})와 style BPM(${styleTempo || '없음'})을 같은 값으로 맞춘다.`),
    check('melody-abc-chord-free', cot === 'melody' && abc ? !/"[A-Ga-g]/.test(abc) : null, 'cot:"melody"는 입력 ABC의 코드를 자동 제거하지 않는다', 'melody 조건에는 코드 기호를 뺀 ABC 사본을 사용한다.')
  ]
  return {
    basis: 'docs/yue-prompt-guide.md#official-correction',
    advice: checks.filter(item => item.status === 'advice').length,
    checks,
    notice: instrumental ? 'Vocal 쉼표·instrumental 설정은 무보컬을 보장하지 않으므로 납품 전 청취로 확인한다.' : 'style의 보컬·언어·템포는 생성을 유도할 뿐 특정 가수·발음·정확한 템포를 보장하지 않는다.'
  }
}

function prepareRequests (input) {
  const preview = preparePreview(input)
  if (!preview.valid) throw Object.assign(new Error(preview.errors.join(' ')), { code: 'INVALID_ARGUMENT', details: preview })
  return preview.requests
}
module.exports = { prepareRequests, preparePreview, officialGuideChecks }
