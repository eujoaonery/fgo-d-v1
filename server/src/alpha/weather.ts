import type { SourceMeta } from '../../../src/lib/strategy.js'
import type {
  AlphaArchiveHour,
  AlphaCityGeo,
  AlphaWeatherBundle,
  DailyWeatherPoint,
  HourlyWeatherPoint,
} from '../../../src/lib/prometheusAlpha.js'
import { cacheWrap } from './cache.js'
import { asArray, asNum, asRecord, asStr, fetchJson } from './httpFetch.js'

export const OPEN_METEO_ATTRIBUTION =
  'Dados meteorológicos: Open-Meteo.com (licença CC-BY 4.0). Modelo numérico — não substitui aviso oficial do INMET.'

const FORECAST_TTL_MS = 15 * 60_000
const ARCHIVE_TTL_MS = 60 * 60_000

export function weatherCodeLabel(code: number | null): string {
  if (code == null) return 'código meteorológico indisponível'
  if (code === 0) return 'céu limpo'
  if (code <= 3) return 'parcialmente nublado'
  if (code <= 48) return 'neblina'
  if (code <= 67) return 'chuva'
  if (code <= 77) return 'neve / granizo'
  if (code <= 82) return 'chuva forte'
  if (code <= 99) return 'trovoada'
  return `código ${code}`
}

function zipHourly(hourly: Record<string, unknown>): HourlyWeatherPoint[] {
  const times = asArray(hourly.time).map(asStr)
  const take = (key: string, i: number) => asNum(asArray(hourly[key])[i])
  return times.map((time, i) => {
    const code = take('weather_code', i)
    return {
      time,
      temperatureC: take('temperature_2m', i),
      apparentC: take('apparent_temperature', i),
      humidityPct: take('relative_humidity_2m', i),
      precipProbPct: take('precipitation_probability', i),
      precipMm: take('precipitation', i),
      rainMm: take('rain', i),
      windKmh: take('wind_speed_10m', i),
      gustKmh: take('wind_gusts_10m', i),
      visibilityM: take('visibility', i),
      cloudPct: take('cloud_cover', i),
      weatherCode: code,
      condition: weatherCodeLabel(code),
    }
  })
}

function zipDaily(daily: Record<string, unknown>): DailyWeatherPoint[] {
  const dates = asArray(daily.time).map(asStr)
  const take = (key: string, i: number) => asNum(asArray(daily[key])[i])
  return dates.map((date, i) => {
    const code = take('weather_code', i)
    return {
      date,
      weatherCode: code,
      condition: weatherCodeLabel(code),
      tempMaxC: take('temperature_2m_max', i),
      tempMinC: take('temperature_2m_min', i),
      precipSumMm: take('precipitation_sum', i),
      precipProbMaxPct: take('precipitation_probability_max', i),
    }
  })
}

export function parseOpenMeteoForecast(raw: unknown): {
  current: HourlyWeatherPoint | null
  hourly: HourlyWeatherPoint[]
  daily: DailyWeatherPoint[]
} | null {
  const data = asRecord(raw)
  if (!data) return null
  const hourly = zipHourly(asRecord(data.hourly) ?? {})
  const daily = zipDaily(asRecord(data.daily) ?? {})
  if (!hourly.length && !daily.length) return null
  const currentRec = asRecord(data.current)
  let current: HourlyWeatherPoint | null = null
  if (currentRec) {
    const code = asNum(currentRec.weather_code)
    current = {
      time: asStr(currentRec.time) || hourly[0]?.time || '',
      temperatureC: asNum(currentRec.temperature_2m),
      apparentC: asNum(currentRec.apparent_temperature),
      humidityPct: asNum(currentRec.relative_humidity_2m),
      precipProbPct: hourly[0]?.precipProbPct ?? null,
      precipMm: asNum(currentRec.precipitation),
      rainMm: asNum(currentRec.rain),
      windKmh: asNum(currentRec.wind_speed_10m),
      gustKmh: asNum(currentRec.wind_gusts_10m),
      visibilityM: asNum(currentRec.visibility),
      cloudPct: asNum(currentRec.cloud_cover),
      weatherCode: code,
      condition: weatherCodeLabel(code),
    }
  } else {
    current = hourly[0] ?? null
  }
  return { current, hourly, daily }
}

export function parseOpenMeteoArchive(raw: unknown): AlphaArchiveHour[] {
  const hourly = asRecord(asRecord(raw)?.hourly)
  if (!hourly) return []
  const times = asArray(hourly.time).map(asStr)
  const precip = asArray(hourly.precipitation)
  const codes = asArray(hourly.weather_code)
  return times.map((time, i) => ({
    time,
    precipMm: asNum(precip[i]),
    weatherCode: asNum(codes[i]),
  }))
}

function unavailable(note: string): SourceMeta {
  return {
    key: 'open-meteo',
    label: 'Previsão Open-Meteo',
    status: 'unavailable',
    origin: 'Open-Meteo',
    lastUpdatedAt: null,
    note,
  }
}

export async function loadForecast(geo: AlphaCityGeo, forecastDays = 7): Promise<AlphaWeatherBundle> {
  const days = Math.min(7, Math.max(1, forecastDays))
  const tz = encodeURIComponent(geo.timezone)
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m,visibility,cloud_cover` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m,visibility,cloud_cover` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
    `&forecast_days=${days}&timezone=${tz}`
  return cacheWrap(`wx:${geo.lat.toFixed(3)}:${geo.lng.toFixed(3)}:${days}:${geo.timezone}`, FORECAST_TTL_MS, async () => {
    const res = await fetchJson(url)
    if (!res.ok) {
      return {
        current: null,
        hourly: [],
        daily: [],
        source: unavailable(`Previsão numérica indisponível (${res.error}). ${geo.weatherPointNote}`),
        attribution: OPEN_METEO_ATTRIBUTION,
      }
    }
    const parsed = parseOpenMeteoForecast(res.data)
    if (!parsed) {
      return {
        current: null,
        hourly: [],
        daily: [],
        source: unavailable('Resposta Open-Meteo incompleta ou inválida.'),
        attribution: OPEN_METEO_ATTRIBUTION,
      }
    }
    const now = new Date().toISOString()
    return {
      current: parsed.current,
      hourly: parsed.hourly,
      daily: parsed.daily,
      source: {
        key: 'open-meteo',
        label: 'Previsão Open-Meteo',
        status: parsed.hourly.length || parsed.daily.length ? 'ok' : 'empty',
        origin: 'Open-Meteo (modelo numérico)',
        lastUpdatedAt: parsed.current?.time || now,
        note: `${geo.weatherPointNote} ${OPEN_METEO_ATTRIBUTION}`,
      },
      attribution: OPEN_METEO_ATTRIBUTION,
    }
  })
}

export async function loadArchiveWeather(
  geo: AlphaCityGeo,
  startDate: string,
  endDate: string,
): Promise<{ hours: AlphaArchiveHour[]; source: SourceMeta }> {
  const tz = encodeURIComponent(geo.timezone)
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.lat}&longitude=${geo.lng}` +
    `&start_date=${startDate}&end_date=${endDate}&hourly=precipitation,weather_code&timezone=${tz}`
  return cacheWrap(`wxarch:${geo.lat.toFixed(3)}:${geo.lng.toFixed(3)}:${startDate}:${endDate}`, ARCHIVE_TTL_MS, async () => {
    const res = await fetchJson(url, { timeoutMs: 12_000 })
    if (!res.ok) {
      return {
        hours: [],
        source: {
          key: 'open-meteo-archive',
          label: 'Arquivo Open-Meteo',
          status: 'unavailable',
          origin: 'Open-Meteo Archive',
          lastUpdatedAt: null,
          note: `Histórico meteorológico indisponível (${res.error}).`,
        },
      }
    }
    const hours = parseOpenMeteoArchive(res.data)
    return {
      hours,
      source: {
        key: 'open-meteo-archive',
        label: 'Arquivo Open-Meteo',
        status: hours.length ? 'ok' : 'empty',
        origin: 'Open-Meteo Archive (observado/reanálise)',
        lastUpdatedAt: hours.at(-1)?.time ?? null,
        note: OPEN_METEO_ATTRIBUTION,
      },
    }
  })
}

export function hoursOnDate(hourly: HourlyWeatherPoint[], isoDate: string): HourlyWeatherPoint[] {
  return hourly.filter((h) => h.time.slice(0, 10) === isoDate)
}

export function hourAt(hourly: HourlyWeatherPoint[], isoDate: string, hour: number): HourlyWeatherPoint | null {
  const pad = String(hour).padStart(2, '0')
  const tag = `${isoDate}T${pad}:`
  return (
    hourly.find((h) => h.time.startsWith(tag) || (h.time.startsWith(isoDate) && h.time.slice(11, 13) === pad)) ?? null
  )
}
