import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clampPredictiveIntervalSec, parsePredictiveControls } from './controls.js'

describe('controles preditivos', () => {
  it('em cidade real exclui simulado por padrão', () => {
    const real = parsePredictiveControls({}, 'real')
    const demo = parsePredictiveControls({}, 'demo')
    assert.equal(real.includeSimulated, false)
    assert.equal(demo.includeSimulated, true)
    assert.equal(real.learningEnabled, true)
    assert.equal(real.forecastsEnabled, true)
  })

  it('limita o intervalo de execução', () => {
    assert.equal(clampPredictiveIntervalSec(10), 60)
    assert.equal(clampPredictiveIntervalSec(900), 900)
    assert.ok(clampPredictiveIntervalSec(99_999) <= 24 * 3600)
  })
})
