import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accuracyLevel,
  countObserved,
  countObservedAlerts,
  evaluationReady,
  forecastAlertHours,
  reviewFromObserved,
} from './evaluate.js'

describe('avaliação de previsões', () => {
  it('espera a janela de graça antes de fechar o período', () => {
    const p = { calculatedAt: '2026-10-21T10:00:00.000Z', horizonHours: 24 }
    assert.equal(evaluationReady(p, Date.parse('2026-10-22T10:00:00.000Z')), false)
    assert.equal(evaluationReady(p, Date.parse('2026-10-22T12:00:00.000Z')), true)
  })

  it('conta só o que cai no período e no recorte, sem dados futuros do simulador', () => {
    const observed = countObserved(
      [
        { openedAt: '2026-10-21T11:00:00.000Z', region: 'Centro', type: 'Semáforos', dataOrigin: 'real' },
        { openedAt: '2026-10-21T11:00:00.000Z', region: 'Norte', type: 'Semáforos', dataOrigin: 'real' },
        { openedAt: '2026-10-22T11:00:00.000Z', region: 'Centro', type: 'Semáforos', dataOrigin: 'real' },
        { openedAt: '2026-10-21T11:30:00.000Z', region: 'Centro', type: 'Semáforos', dataOrigin: 'simulado' },
      ],
      {
        calculatedAt: '2026-10-21T10:00:00.000Z',
        horizonHours: 24,
        region: 'Centro',
        periodStart: '2026-10-21T10:00:00.000Z',
        periodEnd: '2026-10-22T10:00:00.000Z',
        dataOriginSet: 'real',
      },
    )
    assert.equal(observed, 1)
  })

  it('classifica confirmação sem reescrever o previsto', () => {
    assert.equal(reviewFromObserved(10, 10), 'confirmed')
    assert.equal(reviewFromObserved(10, 0), 'missed')
    assert.equal(reviewFromObserved(10, 4), 'partial')
    assert.equal(reviewFromObserved(10, 15), 'partial')
  })

  it('trata 10 previstos e 10–15 emitidos como acerto ou aproveitamento', () => {
    assert.equal(accuracyLevel(10, 10), 'exact')
    assert.equal(accuracyLevel(10, 15), 'useful')
    assert.equal(accuracyLevel(15, 15), 'exact')
    assert.equal(accuracyLevel(10, 3, { inProgress: true }), 'pending')
    assert.equal(accuracyLevel(10, 8, { inProgress: true }), 'pending')
    assert.equal(accuracyLevel(10, 15, { inProgress: true }), 'useful')
    assert.equal(accuracyLevel(10, 0, { inProgress: true }), 'pending')
  })

  it('conta alertas emitidos no período, sem falso positivo', () => {
    const observed = countObservedAlerts(
      [
        { detectedAt: '2026-10-21T11:00:00.000Z', region: 'Centro', dataOrigin: 'real', state: 'novo' },
        { detectedAt: '2026-10-21T12:00:00.000Z', region: 'Centro', dataOrigin: 'real', state: 'falso positivo' },
        { detectedAt: '2026-10-22T11:00:00.000Z', region: 'Centro', dataOrigin: 'real', state: 'novo' },
      ],
      {
        calculatedAt: '2026-10-21T10:00:00.000Z',
        horizonHours: 24,
        periodStart: '2026-10-21T10:00:00.000Z',
        periodEnd: '2026-10-22T10:00:00.000Z',
        dataOriginSet: 'real',
      },
    )
    assert.equal(observed, 1)
  })

  it('projeta alertas nas próximas horas a partir do agora', () => {
    const stamps = [
      '2026-10-17T15:10:00-03:00',
      '2026-10-17T16:05:00-03:00',
      '2026-10-10T15:20:00-03:00',
      '2026-10-10T16:40:00-03:00',
    ]
    const rows = forecastAlertHours(stamps, new Date('2026-10-24T15:00:00-03:00'))
    assert.deepEqual(rows.map((r) => r.hours), [1, 3, 8, 12, 24])
    const one = rows.find((r) => r.hours === 1)!
    assert.equal(one.fromLabel, '15h')
    assert.equal(one.toLabel, '16h')
    assert.ok(one.predicted != null && one.predicted > 0)
    assert.ok(one.probability != null && one.probability > 0)
    assert.ok(one.confidence != null && one.confidence < (rows.find((r) => r.hours === 24)?.confidence ?? 1))
  })
})
