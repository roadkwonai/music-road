'use strict'
;(function () {
  const contextTokens = 24576
  const semanticDefaults = { temperature: 1, topP: 0.95, topK: 100, repetitionPenalty: 1.2, penaltyWindow: 50, minTokens: 200, maxTokens: 9000 }
  const abcDefaults = { abcTemperature: 0.7, abcTopP: 0.9, abcTopK: 30, abcRepetitionPenalty: 1.005, abcPenaltyWindow: 100, abcMinTokens: 32, abcMaxTokens: 4096 }
  const count = (minimum, maximum = Number.MAX_SAFE_INTEGER) => ({ type: 'integer', minimum, maximum })
  const advancedProperties = {
    temperature: { type: 'number', minimum: 0, maximum: 5 },
    topP: { type: 'number', exclusiveMinimum: 0, maximum: 1 }, topK: count(1),
    repetitionPenalty: { type: 'number', exclusiveMinimum: 0 }, penaltyWindow: count(1, 100),
    minTokens: count(0, contextTokens), maxTokens: count(1, contextTokens),
    abcTemperature: { type: 'number', minimum: 0, maximum: 5 },
    abcTopP: { type: 'number', exclusiveMinimum: 0, maximum: 1 }, abcTopK: count(1),
    abcRepetitionPenalty: { type: 'number', exclusiveMinimum: 0 }, abcPenaltyWindow: count(1, 100),
    abcMinTokens: count(0, contextTokens), abcMaxTokens: count(1, contextTokens),
    cfgScale: { type: 'number', minimum: 0, maximum: 20 }, odeSteps: count(1)
  }
  const runtimeDefaults = { precision: '8bit', memoryBudgetGiB: 16, vaeCoreFrames: 256, requireAc: true }
  const runtimeProperties = {
    precision: { type: 'string', enum: ['8bit', 'bf16', '4bit'] },
    memoryBudgetGiB: { type: 'number', exclusiveMinimum: 0 },
    vaeCoreFrames: count(1), queryChunkSize: count(16, 8192), requireAc: { type: 'boolean' },
    vaePath: { type: 'string', minLength: 1 }, loraPath: { type: 'string', minLength: 1 },
    loraScale: { type: 'number' }
  }
  function effectiveAdvanced (values = {}, cot = 'full') {
    return { ...semanticDefaults, ...abcDefaults, cfgScale: cot === 'off' ? 1.01 : 1, odeSteps: 32, ...values }
  }
  function fieldsError (values, properties, label) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return `${label} 객체가 필요합니다.`
    for (const [key, value] of Object.entries(values)) {
      const spec = properties[key]
      if (!spec) return `${label}.${key}: 지원하지 않는 옵션입니다.`
      if (spec.type === 'integer' && !Number.isSafeInteger(value)) return `${label}.${key}: 안전한 정수가 필요합니다.`
      if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return `${label}.${key}: 유한한 숫자가 필요합니다.`
      if (spec.type === 'string' && (typeof value !== 'string' || !value.trim())) return `${label}.${key}: 문자열이 필요합니다.`
      if (spec.type === 'boolean' && typeof value !== 'boolean') return `${label}.${key}: 불리언이 필요합니다.`
      if ((spec.minimum !== undefined && value < spec.minimum) || (spec.maximum !== undefined && value > spec.maximum) ||
          (spec.exclusiveMinimum !== undefined && value <= spec.exclusiveMinimum) || (spec.enum && !spec.enum.includes(value))) return `${label}.${key}: 허용 범위를 벗어났습니다.`
    }
    return null
  }
  function advancedError (values = {}, cot = 'full') {
    const invalid = fieldsError(values, advancedProperties, 'advanced')
    if (invalid) return invalid
    const effective = effectiveAdvanced(values, cot)
    if (effective.minTokens > effective.maxTokens) return 'minTokens는 maxTokens보다 클 수 없습니다.'
    if (effective.abcMinTokens > effective.abcMaxTokens) return 'abcMinTokens는 abcMaxTokens보다 클 수 없습니다.'
    return null
  }
  function runtimeError (values = {}, engine = 'yue-mlx') {
    const invalid = fieldsError(values, runtimeProperties, 'runtime')
    if (invalid) return invalid
    if (engine !== 'yue-mlx' && Object.keys(values).length) return 'runtime 옵션은 현재 YuE2 Apple Silicon 경로에서 지원합니다.'
    if (values.loraScale !== undefined && !values.loraPath) return 'loraScale에는 로컬 loraPath가 필요합니다.'
    return null
  }
  function seedError (seed, engine) {
    if (seed == null) return null
    if (engine === 'ace') return Number.isInteger(seed) && seed >= 0 && seed <= 2147483647 ? null : 'ACE seed는 0~2147483647 정수여야 합니다.'
    if (typeof seed === 'number' && (!Number.isSafeInteger(seed) || seed < 0)) return 'YuE seed에는 안전한 정수 또는 10진 문자열을 사용하세요.'
    if (typeof seed !== 'number' && (typeof seed !== 'string' || !/^(0|[1-9][0-9]*)$/.test(seed))) return 'YuE seed는 0 이상의 10진 정수여야 합니다.'
    try { if (BigInt(seed) >= 2n ** 63n) return 'YuE seed는 2^63 미만이어야 합니다.' } catch { return 'YuE seed 형식이 올바르지 않습니다.' }
    return null
  }
  function generationError ({ engine = 'ace', targetSeconds, soundEffect, style, mode, abc, coverAudio, recording, advanced, runtime, seed, cot = 'full' } = {}) {
    const seedIssue = seedError(seed, engine)
    if (seedIssue) return seedIssue
    if (engine !== 'ace') {
      const optionIssue = advancedError(advanced || {}, cot) || runtimeError(runtime || {}, engine)
      if (optionIssue) return optionIssue
      if (cot === 'off' && (abc || mode === 'plan')) return 'cot=off는 ABC 입력·악보 계획 모드와 함께 사용할 수 없습니다.'
    } else if (runtime && Object.keys(runtime).length) return 'runtime은 ACE 옵션이 아닙니다.'
    const min = engine === 'ace' ? 1 : 20
    const max = engine === 'ace' ? 600 : 360
    if (targetSeconds != null && (typeof targetSeconds !== 'number' || !Number.isFinite(targetSeconds) || targetSeconds < min || targetSeconds > max)) {
      return engine === 'ace' ? '길이는 1~600초 사이의 숫자로 입력해 주세요.' : 'YuE2 길이는 20~360초 사이의 숫자로 입력해 주세요. 더 짧은 음향은 ACE-Step을 사용해 주세요.'
    }
    if (soundEffect) {
      if (engine !== 'ace') return '효과음은 ACE-Step 1.5 엔진에서만 만들 수 있습니다.'
      if (targetSeconds == null || targetSeconds > 30) return '효과음 길이는 1~30초로 지정해 주세요.'
      if (typeof style !== 'string' || !style.trim()) return '스타일 칸에 원하는 효과음을 설명해 주세요.'
      if (mode === 'plan' || abc || coverAudio || recording) return '효과음 모드에서는 악보·커버·녹음으로 만들기를 사용할 수 없습니다.'
    }
    return null
  }
  const api = { generationError, advancedError, runtimeError, seedError, advancedProperties, runtimeProperties, effectiveAdvanced, runtimeDefaults, contextTokens }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else window.RoadGeneration = api
})()
