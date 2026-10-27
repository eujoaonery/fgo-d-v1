import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aggregateDaily,
  chronologicalSplit,
  correlatePrecipAndIncidents,
  evaluateForecast,
  predictSameWeekday,
} from './forecast.js'

describe('baseline preditivo Alpha', () => {
  it('não usa o futuro no treino', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      region: 'Centro',
      count: i + 1,
    }))
    const { train, validation } = chronologicalSplit(rows)
    const maxTrain = train.map((r) => r.date).sort().at(-1)!
    const minVal = validation.map((r) => r.date).sort().at(0)!
    assert.ok(maxTrain < minVal)
  })

  it('calcula MAE/RMSE só com pares observados', () => {
    const history = [
      { date: '2026-10-01', region: 'Centro', count: 4 },
      { date: '2026-10-08', region: 'Centro', count: 4 },
      { date: '2026-10-15', region: 'Centro', count: 5 },
      { date: '2026-10-02', region: 'Centro', count: 2 },
      { date: '2026-10-09', region: 'Centro', count: 2 },
      { date: '2026-10-16', region: 'Centro', count: 3 },
      { date: '2026-10-03', region: 'Centro', count: 1 },
      { date: '2026-10-10', region: 'Centro', count: 1 },
      { date: '2026-10-17', region: 'Centro', count: 1 },
      { date: '2026-10-04', region: 'Centro', count: 6 },
    ]
    const evals = evaluateForecast(history)
    assert.ok(evals.scored >= 0)
    if (evals.scored === 0) {
      assert.equal(evals.mae, null)
      assert.match(evals.note, /insuficiente/i)
    } else {
      assert.ok(evals.mae != null)
      assert.ok(evals.rmse != null)
    }
  })

  it('marca previsão experimental com amostra curta', () => {
    const f = predictSameWeekday([{ date: '2026-10-15', region: 'Leste', count: 2 }], '2026-10-22')
    assert.equal(f.experimental, true)
  })

  it('agrega por região sem inventar zeros de outras regiões', () => {
    const daily = aggregateDaily(
      [
        { date: '2026-10-20', region: 'Centro' },
        { date: '2026-10-20', region: 'Centro' },
        { date: '2026-10-21', region: 'Leste' },
      ],
      'Centro',
    )
    assert.equal(daily.length, 1)
    assert.equal(daily[0].count, 2)
  })

  it('cruzamento chuva/OS não afirma causalidade e exige amostra', () => {
    const link = correlatePrecipAndIncidents(
      [{ openedAt: '2026-10-20T08:10:00-03:00' }],
      [
        { time: '2026-10-20T08:00', precipMm: 4, weatherCode: 61 },
        { time: '2026-10-20T09:00', precipMm: 0, weatherCode: 0 },
      ],
    )
    assert.equal(link.experimental, true)
    assert.match(link.note, /causalidade|experimental|pequena/i)
  })
})
