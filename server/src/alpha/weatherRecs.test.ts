import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyWeather, weatherOpsRecommendations } from './weatherRecs.js'

describe('recomendações climáticas Alpha', () => {
  it('classifica chuva, chuva forte e tempestade', () => {
    assert.equal(classifyWeather({ weatherCode: 61, condition: 'chuva' }), 'rain')
    assert.equal(classifyWeather({ weatherCode: 82, condition: 'chuva forte', precipSumMm: 13 }), 'heavy_rain')
    assert.equal(classifyWeather({ weatherCode: 95, condition: 'trovoada' }), 'storm')
    assert.equal(classifyWeather({ weatherCode: 0, condition: 'céu limpo' }), 'none')
  })

  it('em qualquer chuva recomenda não interditar via de 80 km/h', () => {
    const recs = weatherOpsRecommendations({
      days: [
        {
          date: '2026-10-23',
          weatherCode: 61,
          condition: 'chuva',
          tempMaxC: 28,
          tempMinC: 18,
          precipSumMm: 3,
          precipProbMaxPct: 55,
        },
      ],
      generator: 'test',
    })
    assert.ok(recs.some((r) => /80 km\/h/.test(r.actionText)))
    assert.equal(recs.some((r) => r.category === 'defesa_civil'), false)
  })

  it('em tempestade sugere Defesa Civil e suspender trabalho em altura', () => {
    const recs = weatherOpsRecommendations({
      days: [
        {
          date: '2026-10-25',
          weatherCode: 95,
          condition: 'trovoada',
          tempMaxC: 24,
          tempMinC: 20,
          precipSumMm: 14,
          precipProbMaxPct: 90,
        },
      ],
      generator: 'test',
    })
    assert.ok(recs.some((r) => r.category === 'defesa_civil' && /Defesa Civil/.test(r.actionText)))
    assert.ok(recs.some((r) => r.category === 'clima_altura'))
    assert.ok(recs.some((r) => /80 km\/h/.test(r.actionText) && r.priority === 'critica'))
  })

  it('sem chuva não inventa restrição de via', () => {
    const recs = weatherOpsRecommendations({
      days: [
        {
          date: '2026-10-27',
          weatherCode: 2,
          condition: 'parcialmente nublado',
          tempMaxC: 29,
          tempMinC: 16,
          precipSumMm: 0,
          precipProbMaxPct: 10,
        },
      ],
      generator: 'test',
    })
    assert.equal(recs.some((r) => /80 km\/h/.test(r.actionText)), false)
  })
})
