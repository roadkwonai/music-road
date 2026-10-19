'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { SPECTRUM_DEFAULTS, cdAngle, cdGeometry, drawSpectrum, drawBand, renderFrame, spectrumBand } = require('../renderer/spectrum-renderer')

function recorder (width = 1600, height = 900) {
  const calls = []
  const gradient = () => ({ addColorStop: (...args) => calls.push(['stop', ...args]) })
  const ctx = {
    canvas: { width, height },
    save: () => calls.push(['save']), restore: () => calls.push(['restore']),
    beginPath: () => calls.push(['beginPath']), closePath: () => calls.push(['closePath']),
    clip: (...args) => calls.push(['clip', ...args]), fill: () => calls.push(['fill']), stroke: () => calls.push(['stroke']),
    clearRect: (...args) => calls.push(['clearRect', ...args]), fillRect: (...args) => calls.push(['fillRect', ...args]),
    moveTo: (...args) => calls.push(['moveTo', ...args]), lineTo: (...args) => calls.push(['lineTo', ...args]),
    arc: (...args) => calls.push(['arc', ...args]), arcTo: (...args) => calls.push(['arcTo', ...args]),
    translate: (...args) => calls.push(['translate', ...args]), rotate: (...args) => calls.push(['rotate', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    createLinearGradient: gradient, createRadialGradient: gradient,
    setTransform: (...args) => calls.push(['setTransform', ...args])
  }
  Object.defineProperty(ctx, 'globalCompositeOperation', {
    get: () => 'source-over', set: value => calls.push(['globalCompositeOperation', value])
  })
  return { ctx, calls }
}

const style = (overrides = {}) => ({ ...SPECTRUM_DEFAULTS, kind: 'cd', size: 0.42, glow: 0.7, ...overrides })
const trace = calls => calls.map(([name, ...args]) => [name, ...args.map(value => typeof value === 'object' ? 'image' : value)])

test('CD 회전은 같은 프레임에서 결정적이며 frameIndex와 fps만 사용한다', () => {
  const image = { width: 1000, height: 1000 }
  const first = recorder(); const again = recorder(); const next = recorder()
  const rc = { width: 1600, height: 900, fps: 30, frameIndex: 90, coverImage: image }
  drawSpectrum(first.ctx, [0.2, 0.8], style(), rc)
  drawSpectrum(again.ctx, [0.2, 0.8], style(), rc)
  drawSpectrum(next.ctx, [0.2, 0.8], style(), { ...rc, frameIndex: 450 })
  assert.deepEqual(trace(first.calls), trace(again.calls))
  const rotation = calls => calls.find(call => call[0] === 'rotate')[1]
  assert.equal(rotation(next.calls) - rotation(first.calls), Math.PI * 2)
})

test('반복 사이클은 약 12초의 정수 회전으로 닫혀 경계에서 회전이 이어진다', () => {
  const assertContinuous = cycleFrames => {
    const options = { fps: 30, cycleFrames }
    const last = cdAngle({ ...options, frameIndex: cycleFrames - 1 })
    const repeated = cdAngle({ ...options, frameIndex: 0 })
    const absoluteNext = cdAngle({ ...options, frameIndex: cycleFrames })
    const step = cdAngle({ ...options, frameIndex: 1 }) - repeated
    assert.ok(Math.abs(Math.cos(absoluteNext) - Math.cos(repeated)) < 1e-12)
    assert.ok(Math.abs(Math.sin(absoluteNext) - Math.sin(repeated)) < 1e-12)
    assert.ok(Math.abs((absoluteNext - last) - step) < 1e-12)
  }
  assertContinuous(300) // 10초: 1회전
  assertContinuous(2700) // 90초: 8회전
})

test('CD는 진폭 보정 뒤 에너지에 따라 외곽 링과 펄스를 넓힌다', () => {
  const low = recorder(); const high = recorder()
  const rc = { width: 1600, height: 900, fps: 30, frameIndex: 0 }
  drawSpectrum(low.ctx, [0, 0], style({ glow: 0 }), rc)
  drawSpectrum(high.ctx, [1, 1], style({ glow: 0 }), rc)
  const largestArc = calls => Math.max(...calls.filter(call => call[0] === 'arc').map(call => call[3]))
  assert.ok(largestArc(high.calls) > largestArc(low.calls))
})

test('CD 표지는 정사각형으로 중앙 크롭하고, 준비되지 않은 표지는 금속 폴백으로 그린다', () => {
  const withCover = recorder()
  drawSpectrum(withCover.ctx, [0.5], style(), { width: 1600, height: 900, fps: 30, frameIndex: 0, coverImage: { width: 1600, height: 900 } })
  const imageCall = withCover.calls.find(call => call[0] === 'drawImage')
  assert.deepEqual(imageCall.slice(2, 6), [350, 0, 900, 900])

  const fallback = recorder()
  assert.doesNotThrow(() => drawSpectrum(fallback.ctx, [0.5], style(), { width: 1600, height: 900, fps: 30, frameIndex: 0, coverImage: { naturalWidth: 0, naturalHeight: 0 } }))
  assert.equal(fallback.calls.some(call => call[0] === 'drawImage'), false)
  assert.ok(fallback.calls.some(call => call[0] === 'fillRect'))

  const invalid = recorder()
  invalid.ctx.drawImage = () => { throw new Error('unusable image') }
  assert.doesNotThrow(() => drawSpectrum(invalid.ctx, [0.5], style(), { width: 1600, height: 900, fps: 30, frameIndex: 0, coverImage: { width: 900, height: 900 } }))
  assert.ok(invalid.calls.some(call => call[0] === 'fillRect'))

  const selectedButInvalid = recorder()
  drawSpectrum(selectedButInvalid.ctx, [0.5], style({ cover: '/covers/generated.png' }), { width: 1600, height: 900, fps: 30, frameIndex: 0, coverImage: { naturalWidth: 0, naturalHeight: 0 } })
  assert.equal(selectedButInvalid.calls.some(call => call[0] === 'fillRect'), false)
  assert.ok(selectedButInvalid.calls.some(call => call[0] === 'stroke'))
})

test('CD 밴드는 외곽 glow와 최대 펄스 범위를 모두 포함한다', () => {
  const cd = style({ position: 'free', cx: 0.2, cy: 0.5, size: 0.5, glow: 1 })
  const rc = { width: 1600, height: 900 }
  const geometry = cdGeometry(cd, rc.width, rc.height)
  const band = spectrumBand(cd, rc)
  assert.ok(band.y <= geometry.cy - geometry.reach)
  assert.ok(band.y + band.height >= geometry.cy + geometry.reach)
})

test('CD 허브는 기존 레이어를 지우지 않으며 preview와 band 모두 같은 짝홀 클립을 쓴다', () => {
  const preview = recorder(); const band = recorder()
  const rc = { width: 1600, height: 900, fps: 30, frameIndex: 0 }
  renderFrame(preview.ctx, [0.5], style(), { kind: 'none' }, rc)
  drawBand(band.ctx, [0.5], style(), rc, 100)
  for (const calls of [preview.calls, band.calls]) {
    assert.equal(calls.some(call => call[0] === 'globalCompositeOperation' && call[1] === 'destination-out'), false)
    assert.ok(calls.some(call => call[0] === 'clip' && call[1] === 'evenodd'))
  }
  const clips = calls => calls.filter(call => call[0] === 'clip')
  assert.deepEqual(clips(preview.calls), clips(band.calls))
})
