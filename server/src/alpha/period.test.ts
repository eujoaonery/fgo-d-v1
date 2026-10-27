import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyIntent } from './intent.js'
import { resolvePeriod } from './period.js'

const TZ = 'America/Sao_Paulo'
const NOW = new Date('2026-10-22T15:00:00-03:00')

describe('período e intenção Alpha', () => {
  it('amanhã resolve o dia local seguinte', () => {
    const { period, context } = resolvePeriod({ text: 'Como estará o risco amanhã?', now: NOW, timeZone: TZ })
    assert.equal(context.date, '2026-10-23')
    assert.equal(period.forecastDays, 1)
    assert.match(period.label, /amanhã/)
  })

  it('às 18h preserva a data do contexto', () => {
    const first = resolvePeriod({ text: 'Analise o risco para amanhã.', now: NOW, timeZone: TZ })
    const second = resolvePeriod({
      text: 'E especificamente às 18h?',
      now: NOW,
      timeZone: TZ,
      context: first.context,
    })
    assert.equal(second.context.date, '2026-10-23')
    assert.equal(second.context.hour, 18)
  })

  it('próximos 7 dias limita o horizonte', () => {
    const { period } = resolvePeriod({ text: 'próximos 7 dias', now: NOW, timeZone: TZ })
    assert.equal(period.forecastDays, 7)
    assert.equal(period.fromDate, '2026-10-23')
    assert.equal(period.toDate, '2026-10-29')
  })

  it('últimos 7 dias é lookback, não previsão', () => {
    const { period } = resolvePeriod({ text: 'quais regiões tiveram mais ocorrências nos últimos 7 dias', now: NOW, timeZone: TZ })
    assert.equal(period.lookbackDays, 7)
    assert.equal(period.fromDate, '2026-10-16')
  })

  it('classifica intenções das perguntas de aceite', () => {
    assert.equal(classifyIntent('Como estará o risco operacional amanhã?'), 'tomorrow')
    assert.equal(classifyIntent('Quais regiões apresentam maior probabilidade de aumento de ocorrências?'), 'region_demand')
    assert.equal(classifyIntent('Existe relação entre chuva, horário e aumento de ocorrências?'), 'climate_ops')
    assert.equal(classifyIntent('Quais recomendações estão pendentes de decisão?'), 'pending_recs')
    assert.equal(classifyIntent('Analisar tráfego'), 'traffic')
    assert.equal(classifyIntent('Próximos 7 dias'), 'next7d')
  })
})
