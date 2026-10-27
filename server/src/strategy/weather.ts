import type { SourceMeta, WeatherForecast, WeatherWarning } from '../../../src/lib/strategy.js'
import type { AlphaCityGeo } from '../../../src/lib/prometheusAlpha.js'
import { weatherCodeLabel } from '../alpha/weather.js'

const MARILIA = {
  lat: -22.2139,
  lng: -49.9456,
  name: 'Marília',
  cityName: 'Marília',
  uf: 'SP',
  timezone: 'America/Sao_Paulo',
}
const TIMEOUT_MS = 8_000
const UA = 'FOGO-CCO/1.0 (painel-estrategico)'

export type WeatherBundle = {
  forecast: WeatherForecast | null
  forecastSource: SourceMeta
  warnings: WeatherWarning[]
  warningsSource: SourceMeta
}

async function fetchJson(url: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true, data: await res.json() }
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? 'tempo esgotado' : e.message) : 'falha de rede'
    return { ok: false, error: msg }
  } finally {
    clearTimeout(t)
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v != null ? String(v) : ''
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function nowCivilSaoPaulo(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function civilStamp(isoLocal: string): string {
  const m = isoLocal.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  return m ? `${m[1]}T${m[2]}` : isoLocal
}

/** Primeira hora futura com chance de chuva >= 50%. */
export function findRainOnset(
  times: string[],
  probs: Array<number | null>,
  threshold = 50,
  nowStamp = nowCivilSaoPaulo(),
): string | null {
  for (let i = 0; i < times.length; i++) {
    const time = times[i]
    const prob = probs[i]
    if (!time || prob == null || prob < threshold) continue
    if (civilStamp(time) < nowStamp) continue
    return time
  }
  return null
}

export async function fetchOpenMeteoForecast(geo: Pick<AlphaCityGeo, 'lat' | 'lng' | 'timezone' | 'cityName'> = MARILIA): Promise<{
  forecast: WeatherForecast | null
  source: SourceMeta
}> {
  const now = new Date().toISOString()
  const tz = encodeURIComponent(geo.timezone || 'America/Sao_Paulo')
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lng}` +
    `&current=temperature_2m,precipitation,weather_code,wind_speed_10m` +
    `&hourly=precipitation_probability,precipitation&forecast_days=7&timezone=${tz}`
  const res = await fetchJson(url)
  if (!res.ok) {
    return {
      hourlyCount: 0,
      forecast: null,
      source: {
        key: 'open-meteo',
        label: 'Previsão Open-Meteo',
        status: 'unavailable',
        origin: 'Open-Meteo',
        lastUpdatedAt: null,
        note: `Previsão numérica indisponível (${res.error}). Não é aviso oficial do INMET.`,
      },
    }
  }
  const data = asRecord(res.data)
  const current = asRecord(data?.current)
  const hourly = asRecord(data?.hourly)
  const times = asArray(hourly?.time).map(str)
  const probs = asArray(hourly?.precipitation_probability).map(num)
  const nextHoursPrecipProb = (() => {
    const upcoming = probs.filter((n): n is number => n != null).slice(0, 6)
    return upcoming.length ? Math.max(...upcoming) : null
  })()
  const rainStart = findRainOnset(times, probs)
  const code = num(current?.weather_code)
  return {
    hourlyCount: times.length,
    forecast: {
      temperatureC: num(current?.temperature_2m),
      precipitationMm: num(current?.precipitation),
      windKmh: num(current?.wind_speed_10m),
      summary: weatherCodeLabel(code),
      nextHoursPrecipProb,
      rainStart,
      fetchedAt: str(current?.time) || now,
    },
    source: {
      key: 'open-meteo',
      label: 'Previsão Open-Meteo',
      status: 'ok',
      origin: 'Open-Meteo (modelo numérico)',
      lastUpdatedAt: str(current?.time) || now,
      note: 'Modelo numérico. Não substitui aviso oficial do INMET.',
    },
  }
}

function warningTouchesCity(row: Record<string, unknown>, cityName: string, uf: string): boolean {
  const blob = JSON.stringify(row).toLowerCase()
  const city = cityName.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  const hasUf = uf.toLowerCase() === 'sp' ? /\bsp\b|são paulo|sao paulo/.test(blob) : blob.includes(uf.toLowerCase())
  const hasCity = blob.includes(city) || (city.includes('marilia') && /mar[ií]lia/.test(blob))
  if (hasCity) return true
  const municipios = asArray(row.municipios ?? row.municipios_afetados ?? row.cities)
  if (municipios.length === 0 && hasUf) return true
  return municipios.some((m) => str(m).toLowerCase().includes(city) || /mar[ií]lia/i.test(str(m)))
}

function parseWarning(row: Record<string, unknown>, idx: number): WeatherWarning {
  return {
    id: str(row.id || row.codigo || row.cap_id) || `INMET-${idx}`,
    event: str(row.evento || row.event || row.descricao || row.ais) || 'Aviso meteorológico',
    severity: str(row.severidade || row.severity || row.nivel) || 'não informada',
    startsAt: str(row.inicio || row.starts || row.onset) || null,
    endsAt: str(row.fim || row.expires || row.ends) || null,
    area: str(row.estados || row.area || row.regiao) || 'SP',
    source: 'INMET',
  }
}

export async function fetchInmetWarnings(cityName = MARILIA.name, uf = MARILIA.uf): Promise<{
  warnings: WeatherWarning[]
  source: SourceMeta
}> {
  const url = 'https://apiprevmet3.inmet.gov.br/avisos/ativos'
  const res = await fetchJson(url)
  if (!res.ok) {
    return {
      warnings: [],
      source: {
        key: 'inmet',
        label: 'Avisos oficiais INMET',
        status: 'unavailable',
        origin: 'INMET',
        lastUpdatedAt: null,
        note: `Avisos oficiais indisponíveis (${res.error}). Ausência de dados — não significa ausência de risco.`,
      },
    }
  }
  const data = asRecord(res.data) ?? {}
  const buckets = [...asArray(data.hoje), ...asArray(data.amanha), ...asArray(data.ativos), ...asArray(data.avisos)]
  const rows = (buckets.length ? buckets : Array.isArray(res.data) ? (res.data as unknown[]) : []).flatMap((item) =>
    asRecord(item) ? [asRecord(item)!] : asArray(asRecord(item)?.avisos).map(asRecord).filter(Boolean) as Record<string, unknown>[],
  )
  const filtered = rows.filter((row) => warningTouchesCity(row, cityName, uf)).map(parseWarning)
  const now = new Date().toISOString()
  return {
    warnings: filtered,
    source: {
      key: 'inmet',
      label: 'Avisos oficiais INMET',
      status: filtered.length ? 'ok' : 'empty',
      origin: 'INMET (apiprevmet3)',
      lastUpdatedAt: now,
      note:
        filtered.length === 0
          ? `Consulta ao INMET concluída: nenhum aviso ativo para ${cityName}/${uf} neste momento.`
          : `${filtered.length} aviso(s) ativo(s) para a área de ${cityName}/${uf}.`,
    },
  }
}

export async function loadWeather(geo: Pick<AlphaCityGeo, 'lat' | 'lng' | 'timezone' | 'cityName' | 'uf'> = MARILIA): Promise<WeatherBundle> {
  const [forecast, warnings] = await Promise.all([
    fetchOpenMeteoForecast(geo),
    fetchInmetWarnings(geo.cityName, geo.uf),
  ])
  return {
    forecast: forecast.forecast,
    forecastSource: forecast.source,
    warnings: warnings.warnings,
    warningsSource: warnings.source,
  }
}

export { MARILIA }
