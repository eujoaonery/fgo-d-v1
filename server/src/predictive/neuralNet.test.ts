import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LearnerDay } from './neuralNet.js'
import { projectNeural } from './neuralNet.js'

function days(count: number, ratio: number): LearnerDay[] {
  const rows: LearnerDay[] = []
  for (let index = 0; index < count; index++) {
    const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
    rows.push({
      date,
      predicted: 20,
      observed: 20 * ratio,
      windows: [1, 3, 8, 12, 24].map((span) => ({
        id: `${span}h`,
        predicted: 4,
        observed: 4 * ratio,
      })),
    })
  }
  return rows.reverse()
}

const emptyLive = {
  hours: [{ id: '1h', label: 'Próxima 1 hora', hours: 1, predicted: 4 }],
  days: [{ date: '2026-10-26', label: 'Hoje', predicted: 20 }],
  history: [],
}

describe('rede neural', () => {
  it('mostra número para leitura mesmo sem dia fechado', () => {
    const view = projectNeural({ training: [], ...emptyLive })
    assert.equal(view.maturity, 'sem_base')
    assert.equal(view.canProvision, false)
    assert.equal(typeof view.hours[0]?.predicted, 'number')
  })

  it('não libera o uso oficial antes de 60 dias', () => {
    const view = projectNeural({ training: days(40, 2), ...emptyLive, history: [] })
    assert.equal(view.canProvision, false)
    assert.notEqual(view.maturity, 'confiavel')
  })

  it('fica confiável quando o erro fica igual ou menor que o da fórmula', () => {
    const view = projectNeural({ training: days(80, 2), ...emptyLive })
    assert.ok(view.neuralMae != null && view.formulaMae != null)
    assert.ok(view.neuralMae <= view.formulaMae)
    assert.equal(view.maturity, 'confiavel')
    assert.equal(view.canProvision, true)
    assert.ok((view.hours[0]?.predicted ?? 0) > 4)
  })
})
