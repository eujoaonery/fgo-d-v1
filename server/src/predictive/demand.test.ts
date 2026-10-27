import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MIN_OBSERVATIONS,
  cleanObservations,
  forecastHorizon,
  periodBucketStart,
  poissonInterval,
  trainDemandRates,
  weatherAdjustmentFactor,
} from './demand.js'

function row(openedAt: string, extras: { region?: string; type?: string; dataOrigin?: string } = {}) {
  return { openedAt, type: extras.type ?? 'Semáforos', region: extras.region ?? 'Centro', dataOrigin: extras.dataOrigin ?? 'real' }
}

describe('demand forecast', () => {
  it('exclui datas inválidas e simuladas quando configurado, sem descartar em silêncio', () => {
    const { used, quality } = cleanObservations(
      [
        row('2026-10-01T10:00:00.000Z'),
        row('not-a-date'),
        row('2026-10-01T11:00:00.000Z', { dataOrigin: 'simulado' }),
        { openedAt: '2026-10-01T12:00:00.000Z', type: '', region: 'Centro', dataOrigin: 'real' },
      ],
      false,
    )
    assert.equal(used.length, 1)
    assert.equal(quality.droppedInvalidDate, 1)
    assert.equal(quality.droppedOrigin, 1)
    assert.equal(quality.droppedUnclassified, 1)
    assert.ok(quality.rules.length >= 2)
  })

  it('não emite quantidade quando há menos de 50 ocorrências', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`2026-10-01T${String(8 + (i % 10)).padStart(2, '0')}:00:00.000Z`))
    const rates = trainDemandRates(rows, new Date('2026-10-21T12:00:00.000Z'))
    const forecast = forecastHorizon({ rates, rows, now: new Date('2026-10-21T12:00:00.000Z'), hours: 24 })
    assert.equal(forecast.predicted, null)
    assert.equal(forecast.insufficient, true)
    assert.ok(forecast.limitations.some((l) => l.includes(String(MIN_OBSERVATIONS))))
  })

  it('estima 24h/7d/30d só com dados anteriores ao instante de emissão', () => {
    const now = new Date('2026-10-21T12:00:00.000Z')
    const rows = Array.from({ length: 80 }, (_, i) => {
      const day = 1 + (i % 20)
      const hour = 12 + (i % 3)
      return row(`2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`)
    })
    const futureLeak = row('2026-10-22T12:00:00.000Z')
    const rates = trainDemandRates([...rows, futureLeak], now)
    assert.ok(!rates.lastIncidentAt || rates.lastIncidentAt < now.toISOString())
    const f24 = forecastHorizon({ rates, rows, now, hours: 24 })
    const f7 = forecastHorizon({ rates, rows, now, hours: 168 })
    const f30 = forecastHorizon({ rates, rows, now, hours: 720 })
    assert.ok(f24.predicted != null && f24.predicted > 0)
    assert.ok(f7.predicted != null && f7.predicted > f24.predicted)
    assert.ok(f30.predicted != null && f30.predicted > f7.predicted)
    assert.ok(f24.intervalLow != null && f24.intervalHigh != null && f24.intervalLow <= f24.predicted)
    assert.equal(f24.baseline, 4)
  })

  it('intervalo de Poisson não fica negativo', () => {
    const interval = poissonInterval(0.2)
    assert.equal(interval.low, 0)
    assert.ok(interval.high > 0)
  })

  it('não ajusta clima sem fundamento e não afirma causalidade', () => {
    const skipped = weatherAdjustmentFactor({ wetDryRatio: 2, experimental: true, rainProbability: 80 })
    assert.equal(skipped.factor, 1)
    assert.match(skipped.note, /causalidade/)
    const applied = weatherAdjustmentFactor({ wetDryRatio: 2, experimental: false, rainProbability: 80 })
    assert.ok(applied.factor > 1)
    assert.match(applied.note, /Não implica causalidade/)
  })

  it('treina e prevê OS no relógio de America/Sao_Paulo, não em UTC', () => {
    // 02:00 UTC de quarta = 23:00 de terça em Brasília.
    const rows = Array.from({ length: 60 }, (_, i) => {
      const day = 1 + (i % 20)
      return row(`2026-10-${String(day).padStart(2, '0')}T02:00:00.000Z`)
    })
    const now = new Date('2026-10-21T12:00:00.000Z')
    const rates = trainDemandRates(rows, now)
    const tuesdayNight = rates.weekdayHourRates[2][23]
    const wednesdayUtc = rates.weekdayHourRates[3][2]
    assert.ok(tuesdayNight > 0, 'a taxa deve cair na terça 23h de Brasília')
    assert.equal(wednesdayUtc, 0, 'não pode contar como quarta 02h UTC')
    const forecast = forecastHorizon({ rates, rows, now: new Date('2026-10-20T02:30:00.000Z'), hours: 24 })
    assert.ok(forecast.method.includes('America/Sao_Paulo'))
    assert.ok(forecast.predicted != null && forecast.predicted > 0)
  })

  it('agrupa emissão em baldes para não duplicar o mesmo horizonte', () => {
    const a = periodBucketStart(new Date('2026-10-21T13:10:00.000Z'), 6)
    const b = periodBucketStart(new Date('2026-10-21T17:50:00.000Z'), 6)
    assert.equal(a, b)
  })
})
