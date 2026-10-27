import assert from 'node:assert/strict'
import test from 'node:test'
import { isOsTicketPrediction, isRegionalOsForecast, retiresOsVolumePrediction } from './engine.js'

test('volume de OS sai da lista operacional', () => {
  assert.equal(isOsTicketPrediction({ predictionType: 'demand_forecast', inputSummary: { ruleKey: 'demand:cidade' } }), true)
  assert.equal(
    isOsTicketPrediction({
      predictionType: 'maintenance_due',
      inputSummary: { ruleKey: 'maintenance_due:org', orderIds: ['OS-1'] },
    }),
    true,
  )
})

test('quantidade de OS por região fica fora da fila e permanece no motor', () => {
  const row = { predictionType: 'demand_forecast' as const, inputSummary: { ruleKey: 'os-region:Centro' } }
  assert.equal(isOsTicketPrediction(row), true)
  assert.equal(isRegionalOsForecast(row), true)
  assert.equal(retiresOsVolumePrediction(row), false)
  assert.equal(retiresOsVolumePrediction({ predictionType: 'demand_forecast', inputSummary: { ruleKey: 'demand:cidade' } }), true)
})

test('pico, contexto e situação de ativo continuam na aba de previsões', () => {
  assert.equal(
    isOsTicketPrediction({ predictionType: 'region_risk', inputSummary: { ruleKey: 'alert_spike:Centro', source: 'alerts' } }),
    false,
  )
  assert.equal(
    isOsTicketPrediction({
      predictionType: 'region_risk',
      inputSummary: { ruleKey: 'context:Centro:0:6:2026-10-25', kind: 'urban_context' },
    }),
    false,
  )
  assert.equal(
    isOsTicketPrediction({
      predictionType: 'maintenance_due',
      inputSummary: { ruleKey: 'preventive_overdue:ATV-1' },
    }),
    false,
  )
  assert.equal(
    isOsTicketPrediction({
      predictionType: 'maintenance_due',
      inputSummary: { ruleKey: 'useful_life_ended:ATV-1' },
    }),
    false,
  )
  assert.equal(isOsTicketPrediction({ predictionType: 'incident_spike', inputSummary: { ruleKey: 'incident_spike:Centro' } }), false)
})
