import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseOpenMeteoArchive, parseOpenMeteoForecast, weatherCodeLabel } from './weather.js'
import { loadTraffic } from './traffic.js'
import { DEFAULT_CITY_NAME } from './geoConfig.js'
import { MARILIA_CENTER } from '../../../src/lib/mariliaGeo.js'

const FIXTURE = {
  current: {
    time: '2026-10-22T09:00',
    temperature_2m: 23.4,
    apparent_temperature: 24.1,
    relative_humidity_2m: 71,
    precipitation: 0.2,
    rain: 0.2,
    weather_code: 61,
    wind_speed_10m: 12,
    wind_gusts_10m: 22,
    visibility: 8000,
    cloud_cover: 90,
  },
  hourly: {
    time: ['2026-10-22T09:00', '2026-10-22T10:00'],
    temperature_2m: [23.4, 24.0],
    apparent_temperature: [24.1, 25],
    relative_humidity_2m: [71, 68],
    precipitation_probability: [80, 40],
    precipitation: [0.2, 0],
    rain: [0.2, 0],
    weather_code: [61, 2],
    wind_speed_10m: [12, 10],
    wind_gusts_10m: [22, 18],
    visibility: [8000, 10000],
    cloud_cover: [90, 40],
  },
  daily: {
    time: ['2026-10-22', '2026-10-23'],
    weather_code: [61, 2],
    temperature_2m_max: [26, 28],
    temperature_2m_min: [18, 17],
    precipitation_sum: [4.2, 0],
    precipitation_probability_max: [80, 20],
  },
}

describe('Open-Meteo contrato e tráfego', () => {
  it('parseia resposta válida sem preencher lacunas com zero inventado', () => {
    const parsed = parseOpenMeteoForecast(FIXTURE)
    assert.ok(parsed)
    assert.equal(parsed.current?.condition, weatherCodeLabel(61))
    assert.equal(parsed.hourly[0].precipProbPct, 80)
    assert.equal(parsed.daily[1].precipSumMm, 0)
  })

  it('rejeita payload inválido', () => {
    assert.equal(parseOpenMeteoForecast(null), null)
    assert.equal(parseOpenMeteoForecast({ hourly: { time: [] }, daily: { time: [] } }), null)
  })

  it('arquivo incompleto vira lista vazia, não série falsa', () => {
    assert.deepEqual(parseOpenMeteoArchive({}), [])
    const hours = parseOpenMeteoArchive({
      hourly: { time: ['2026-10-01T00:00'], precipitation: [null], weather_code: [0] },
    })
    assert.equal(hours[0].precipMm, null)
  })

  it('tráfego sem provedor permanece unavailable', async () => {
    const snap = await loadTraffic({
      cityName: DEFAULT_CITY_NAME,
      uf: 'SP',
      lat: MARILIA_CENTER.lat,
      lng: MARILIA_CENTER.lng,
      timezone: 'America/Sao_Paulo',
      bbox: { south: -22.36, north: -22.1, west: -50.1, east: -49.8 },
      municipalHolidays: [],
      fromSettings: false,
      weatherPointNote: '',
    })
    assert.equal(snap.source.status, 'unavailable')
    assert.equal(snap.events.length, 0)
    assert.match(snap.source.note, /não/i)
  })
})
