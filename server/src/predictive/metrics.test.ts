import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calibrationBins, computePredictiveMetrics, chronologicalWindow } from './metrics.js'

describe('predictive metrics §8.4', () => {
  it('calcula MAE e RMSE sobre pares previstos/observados', () => {
    const metrics = computePredictiveMetrics(
      [
        { calculatedAt: '2026-10-01T00:00:00.000Z', predictedValue: 10, observedValue: 8, baselineValue: 12, reviewStatus: 'confirmed' },
        { calculatedAt: '2026-10-02T00:00:00.000Z', predictedValue: 4, observedValue: 4, baselineValue: 6, reviewStatus: 'confirmed' },
      ],
      new Date('2026-10-20T00:00:00.000Z'),
    )
    assert.equal(metrics.scored, 2)
    assert.equal(metrics.mae, 1)
    assert.ok(metrics.rmse != null && metrics.rmse > 0)
    assert.equal(metrics.baselineMae, 3)
    assert.ok(metrics.skillScore != null && metrics.skillScore > 0)
    assert.equal(metrics.wape, 0.1667)
    assert.equal(metrics.intervalCoverage, null)
  })

  it('WAPE fica em branco quando a soma dos observados é zero', () => {
    const metrics = computePredictiveMetrics([
      { calculatedAt: '2026-10-01T00:00:00.000Z', predictedValue: 3, observedValue: 0, reviewStatus: 'missed' },
    ])
    assert.equal(metrics.wape, null)
  })

  it('mede cobertura do intervalo quando ele existe', () => {
    const metrics = computePredictiveMetrics([
      { calculatedAt: '2026-10-01T00:00:00.000Z', predictedValue: 4, observedValue: 5, intervalLow: 2, intervalHigh: 6, reviewStatus: 'confirmed' },
      { calculatedAt: '2026-10-02T00:00:00.000Z', predictedValue: 4, observedValue: 9, intervalLow: 2, intervalHigh: 6, reviewStatus: 'missed' },
    ])
    assert.equal(metrics.intervalCoverage, 0.5)
  })

  it('deixa MAE em branco sem observado', () => {
    const metrics = computePredictiveMetrics([
      { calculatedAt: '2026-10-01T00:00:00.000Z', predictedValue: 10, reviewStatus: 'pending' },
    ])
    assert.equal(metrics.mae, null)
    assert.equal(metrics.rmse, null)
    assert.match(metrics.note, /pares previsto/)
  })

  it('calibra faixas de probabilidade', () => {
    const bins = calibrationBins([
      { calculatedAt: '2026-10-01T00:00:00.000Z', probability: 0.1, reviewStatus: 'missed' },
      { calculatedAt: '2026-10-01T00:00:00.000Z', probability: 0.85, reviewStatus: 'confirmed' },
      { calculatedAt: '2026-10-01T00:00:00.000Z', probability: 0.9, reviewStatus: 'confirmed' },
    ])
    const low = bins.find((b) => b.from === 0)
    const high = bins.find((b) => b.from === 0.8)
    assert.equal(low?.observedRate, 0)
    assert.equal(high?.observedRate, 1)
  })

  it('documenta corte cronológico 70/30', () => {
    const w = chronologicalWindow(new Date('2026-10-30T00:00:00.000Z'))
    assert.equal(w.method, 'cronologico')
    assert.equal(w.trainShare, 0.7)
    assert.ok(Date.parse(w.trainFrom) < Date.parse(w.trainTo))
    assert.ok(Date.parse(w.validationFrom) < Date.parse(w.validationTo))
  })
})
