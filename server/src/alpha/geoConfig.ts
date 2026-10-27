import type { FogoDb } from '../db.js'
import type { AlphaCityGeo } from '../../../src/lib/prometheusAlpha.js'
import { MARILIA_BOUNDS, MARILIA_CENTER } from '../../../src/lib/mariliaGeo.js'
import { patchOrgSettings } from '../tenant/orgs.js'
import { HttpError } from '../httpError.js'

export const DEFAULT_CITY_NAME = 'Marília'
export const DEFAULT_UF = 'SP'

const SETTINGS_KEY = 'alpha'

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function bboxOf(raw: unknown): AlphaCityGeo['bbox'] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const south = num(o.south)
  const north = num(o.north)
  const west = num(o.west)
  const east = num(o.east)
  if (south == null || north == null || west == null || east == null) return null
  if (south >= north || west >= east) return null
  return { south, north, west, east }
}

export function resolveCityGeo(db: FogoDb): AlphaCityGeo {
  const settings = db.tenant?.settings ?? {}
  const raw = settings[SETTINGS_KEY]
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const lat = num(obj.lat) ?? MARILIA_CENTER.lat
  const lng = num(obj.lng) ?? MARILIA_CENTER.lng
  const cityName = str(obj.cityName) || db.tenant?.name || DEFAULT_CITY_NAME
  const uf = (str(obj.uf) || DEFAULT_UF).toUpperCase().slice(0, 2)
  const timezone = str(obj.timezone) || db.tenant?.timezone || 'America/Sao_Paulo'
  const bbox = bboxOf(obj.bbox) ?? MARILIA_BOUNDS
  const holidays = Array.isArray(obj.municipalHolidays)
    ? obj.municipalHolidays.filter((x): x is string => typeof x === 'string' && /^\d{2}-\d{2}$/.test(x))
    : []
  const fromSettings = num(obj.lat) != null && num(obj.lng) != null
  return {
    cityName,
    uf,
    lat,
    lng,
    timezone,
    bbox,
    municipalHolidays: holidays,
    fromSettings,
    weatherPointNote:
      'A previsão meteorológica usa um ponto de referência municipal. Não representa todos os bairros com a mesma precisão.',
  }
}

export type AlphaConfigPatch = {
  cityName?: string
  uf?: string
  lat?: number
  lng?: number
  timezone?: string
  bbox?: AlphaCityGeo['bbox']
  municipalHolidays?: string[]
}

export async function saveCityGeo(db: FogoDb, patch: AlphaConfigPatch): Promise<AlphaCityGeo> {
  const current = resolveCityGeo(db)
  const next = {
    cityName: patch.cityName?.trim() || current.cityName,
    uf: (patch.uf?.trim() || current.uf).toUpperCase().slice(0, 2),
    lat: patch.lat ?? current.lat,
    lng: patch.lng ?? current.lng,
    timezone: patch.timezone?.trim() || current.timezone,
    bbox: patch.bbox ?? current.bbox,
    municipalHolidays: patch.municipalHolidays ?? current.municipalHolidays,
  }
  if (!Number.isFinite(next.lat) || next.lat < -90 || next.lat > 90) {
    throw new HttpError(400, 'Latitude inválida.')
  }
  if (!Number.isFinite(next.lng) || next.lng < -180 || next.lng > 180) {
    throw new HttpError(400, 'Longitude inválida.')
  }
  if (next.bbox.south >= next.bbox.north || next.bbox.west >= next.bbox.east) {
    throw new HttpError(400, 'Envelope geográfico inválido.')
  }
  const tenant = await patchOrgSettings(db.supabase, db.orgId, { [SETTINGS_KEY]: next })
  if (db.tenant) db.tenant.settings = tenant.settings
  return resolveCityGeo(db)
}
