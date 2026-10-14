'use strict'
;(function () {
  function generationError ({ engine, targetSeconds, soundEffect, style, mode, abc, coverAudio, recording } = {}) {
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
  const api = { generationError }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else window.RoadGeneration = api
})()
