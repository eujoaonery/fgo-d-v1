import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatChartDayPtBr, formatDatePtBr, formatDateTimePtBr, formatWhenSpokenPtBr, withPtBrDates } from '../../../src/lib/format.js'

describe('datas pt-BR do Alpha', () => {
  it('22/10/2026 inclui quinta-feira', () => {
    assert.equal(formatDatePtBr('2026-10-22'), 'quinta-feira, 22/10/2026')
    assert.equal(formatDatePtBr('2026-10-23'), 'sexta-feira, 23/10/2026')
  })

  it('data-hora civil preserva o relógio local', () => {
    assert.equal(formatDateTimePtBr('2026-10-22T10:20'), 'quinta-feira, 22/10/2026 10:20')
  })

  it('substitui ISO em texto corrido', () => {
    assert.equal(
      withPtBrDates('Previsão para 2026-10-23 e OS em 2026-10-22T08:00'),
      'Previsão para sexta-feira, 23/10/2026 e OS em quinta-feira, 22/10/2026 08:00',
    )
  })

  it('rótulo de gráfico compacto', () => {
    assert.equal(formatChartDayPtBr('2026-10-23'), '23/10, sexta')
  })

  it('diz o dia da semana e o horário de início', () => {
    assert.equal(formatWhenSpokenPtBr('2026-10-24T14:00'), 'sábado, 24/10/2026, início às 14h')
    assert.equal(formatWhenSpokenPtBr('2026-10-24T09:05'), 'sábado, 24/10/2026, início às 9h05')
  })
})
