import { MARILIA_BOUNDS } from '../../../src/lib/mariliaGeo.js'
import { fetchJson } from '../alpha/httpFetch.js'
import type { AlphaCityGeo } from '../../../src/lib/prometheusAlpha.js'

const ROWS = 4
const COLS = 4
const TTL_MS = 15 * 60_000

export type WeatherGridCell = {
  lat: number
  lng: number
  halfLat: number
  halfLng: number
  weatherCode: Array<number | null>
  precipMm: Array<number | null>
  windKmh: Array<number | null>
  cloudPct: Array<number | null>
  temperatureC: Array<number | null>
}

export type WeatherGrid = {
  hours: string[]
  cells: WeatherGridCell[]
  history: {
    date: string
    precipitationMm: number | null
    temperatureC: number | null
  } | null
  note: string
  error: string | null
}

let cache: { at: number; key: string; data: WeatherGrid } | null = null

function numAt(list: unknown, index: number): number | null {
  if (!Array.isArray(list)) return null
  const value = list[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function centers(bounds: { south: number; north: number; west: number; east: number }) {
  const halfLat = (bounds.north - bounds.south) / ROWS / 2
  const halfLng = (bounds.east - bounds.west) / COLS / 2
  const cells: { lat: number; lng: number; halfLat: number; halfLng: number }[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      cells.push({
        lat: bounds.south + (row + 0.5) * halfLat * 2,
        lng: bounds.west + (col + 0.5) * halfLng * 2,
        halfLat,
        halfLng,
      })
    }
  }
  return cells
}

export async function loadWeatherGrid(geo: Pick<AlphaCityGeo, 'lat' | 'lng' | 'timezone' | 'cityName'>): Promise<WeatherGrid> {
  const key = `${geo.lat.toFixed(3)}:${geo.lng.toFixed(3)}`
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.data
  const grid = centers(MARILIA_BOUNDS)
  const tz = encodeURIComponent(geo.timezone || 'America/Sao_Paulo')
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${grid.map((c) => c.lat.toFixed(4)).join(',')}` +
    `&longitude=${grid.map((c) => c.lng.toFixed(4)).join(',')}` +
    `&hourly=weather_code,precipitation,wind_speed_10m,cloud_cover,temperature_2m` +
    `&forecast_days=7&timezone=${tz}`
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: geo.timezone || 'America/Sao_Paulo' }).format(
    new Date(Date.now() - 24 * 3600_000),
  )
  const archiveUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.lat}&longitude=${geo.lng}` +
    `&start_date=${yesterday}&end_date=${yesterday}&daily=precipitation_sum,temperature_2m_mean&timezone=${tz}`
  const [forecastRes, archiveRes] = await Promise.all([fetchJson(forecastUrl, { timeoutMs: 12_000 }), fetchJson(archiveUrl)])
  const rows = Array.isArray(forecastRes.ok ? forecastRes.data : null)
    ? (forecastRes.data as unknown[])
    : forecastRes.ok && forecastRes.data
      ? [forecastRes.data]
      : []
  const first = rows[0] && typeof rows[0] === 'object' ? (rows[0] as Record<string, unknown>) : null
  const hourly0 = first && typeof first.hourly === 'object' && first.hourly ? (first.hourly as Record<string, unknown>) : null
  const hours = Array.isArray(hourly0?.time) ? hourly0.time.filter((t): t is string => typeof t === 'string') : []
  const cells: WeatherGridCell[] = grid.map((cell, index) => {
    const row = rows[index] && typeof rows[index] === 'object' ? (rows[index] as Record<string, unknown>) : null
    const hourly = row && typeof row.hourly === 'object' && row.hourly ? (row.hourly as Record<string, unknown>) : null
    return {
      ...cell,
      weatherCode: hours.map((_, i) => numAt(hourly?.weather_code, i)),
      precipMm: hours.map((_, i) => numAt(hourly?.precipitation, i)),
      windKmh: hours.map((_, i) => numAt(hourly?.wind_speed_10m, i)),
      cloudPct: hours.map((_, i) => numAt(hourly?.cloud_cover, i)),
      temperatureC: hours.map((_, i) => numAt(hourly?.temperature_2m, i)),
    }
  })
  const archive = archiveRes.ok && archiveRes.data && typeof archiveRes.data === 'object' ? (archiveRes.data as Record<string, unknown>) : null
  const daily = archive && typeof archive.daily === 'object' && archive.daily ? (archive.daily as Record<string, unknown>) : null
  const data: WeatherGrid = {
    hours,
    cells: hours.length ? cells : [],
    history: daily
      ? {
          date: yesterday,
          precipitationMm: numAt(daily.precipitation_sum, 0),
          temperatureC: numAt(daily.temperature_2m_mean, 0),
        }
      : null,
    note: 'As cores ficam só no contorno do município, a partir de 16 pontos do Open-Meteo, até 7 dias. Não é radar nem estação de bairro.',
    error: hours.length ? null : 'Previsão Open-Meteo indisponível.',
  }
  if (hours.length) cache = { at: Date.now(), key, data }
  return data
}
