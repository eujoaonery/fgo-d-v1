import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildAlertForecast } from './alertModel.js'
import { forecastAlertHours } from './evaluate.js'

function stampsOn(ymd: string, hours: number[]): string[] {
  return hours.map((hour, index) => `${ymd}T${String(hour).padStart(2, '0')}:${String(index % 50).padStart(2, '0')}:00-03:00`)
}

describe('modelo de alertas', () => {
  it('não zera um weekday que ainda não apareceu quando os outros dias têm volume', () => {
    const friday = stampsOn('2026-10-23', Array.from({ length: 40 }, (_, i) => 8 + (i % 10)))
    const saturday = stampsOn('2026-10-24', Array.from({ length: 80 }, (_, i) => 8 + (i % 12)))
    const sunday = stampsOn('2026-10-25', Array.from({ length: 20 }, (_, i) => 8 + (i % 4)))
    const forecast = buildAlertForecast([...friday, ...saturday, ...sunday], new Date('2026-10-25T13:00:00-03:00'))
    const monday = forecast.days.find((day) => day.date === '2026-10-26')
    const tuesday = forecast.days.find((day) => day.date === '2026-10-27')
    assert.ok(monday && monday.predicted != null && monday.predicted > 20)
    assert.ok(tuesday && tuesday.predicted != null && tuesday.predicted > 20)
    assert.equal(monday.level, 'pending')
  })

  it('mede o sábado sem usar o próprio sábado no treino', () => {
    const friday = stampsOn('2026-10-23', Array.from({ length: 30 }, (_, i) => 9 + (i % 8)))
    const saturday = stampsOn('2026-10-24', Array.from({ length: 90 }, (_, i) => 9 + (i % 8)))
    const forecast = buildAlertForecast([...friday, ...saturday], new Date('2026-10-25T13:00:00-03:00'))
    const today = forecast.skills.find((skill) => skill.id === 'd0')
    assert.ok(today && today.scored >= 1)
    const learned = forecast.alertsTrack.pairs.find((row) => row.date === '2026-10-24')
    assert.ok(learned)
    assert.notEqual(learned.predicted, 90)
    assert.ok(learned.predicted < 50)
    assert.notEqual(learned.level, 'exact')
  })

  it('separa o acerto de 1 hora, 3 horas, hoje e amanhã', () => {
    const friday = stampsOn('2026-10-23', Array.from({ length: 24 }, (_, i) => i % 24))
    const saturday = stampsOn('2026-10-24', Array.from({ length: 24 }, (_, i) => i % 24))
    const forecast = buildAlertForecast([...friday, ...saturday], new Date('2026-10-25T13:00:00-03:00'))
    const ids = forecast.skills.map((skill) => skill.id)
    for (const id of ['h1', 'h3', 'h8', 'h12', 'h24', 'd0', 'd1']) assert.ok(ids.includes(id))
    const oneHour = forecast.hours.find((hour) => hour.hours === 1)
    assert.equal(oneHour?.skill.id, 'h1')
    assert.ok((oneHour?.skill.scored ?? 0) > 0)
    assert.ok(forecast.hourEvolution.length > 0)
    assert.ok(forecast.todayEvolution.length > 0)
    assert.ok(forecast.todayEvolution.every((point) => point.acerto >= 0 && point.acerto <= 100))
    const yesterday = forecast.history[0]
    assert.equal(yesterday?.date, '2026-10-24')
    assert.equal(yesterday?.whenLabel, 'Ontem')
    assert.equal(yesterday?.observed, 24)
    assert.equal(yesterday?.windows.length, 5)
    assert.deepEqual(
      yesterday?.windows.map((window) => window.label),
      ['Próxima 1 hora', 'Próximas 3 horas', 'Próximas 8 horas', 'Próximas 12 horas', 'Próximas 24 horas'],
    )
    assert.ok(yesterday?.windows.every((window) => Number.isFinite(window.predicted) && Number.isFinite(window.observed)))
  })

  it('mantém a janela da próxima hora quando já existe perfil', () => {
    const rows = forecastAlertHours(
      ['2026-10-17T15:10:00-03:00', '2026-10-17T16:05:00-03:00', '2026-10-10T15:20:00-03:00', '2026-10-10T16:40:00-03:00'],
      new Date('2026-10-24T15:00:00-03:00'),
    )
    const one = rows.find((row) => row.hours === 1)!
    assert.equal(one.fromLabel, '15h')
    assert.equal(one.toLabel, '16h')
    assert.ok(one.predicted != null && one.predicted > 0)
    assert.ok((rows.find((row) => row.hours === 24)?.confidence ?? 0) > (one.confidence ?? 1))
  })
})
