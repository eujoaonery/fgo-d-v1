import { parseMapMunicipality, type MapMunicipality } from '../../../src/lib/mapMunicipality.js'
import { HttpError } from '../httpError.js'

export type MunicipalityHit = {
  id: number
  name: string
  uf: string
}

type CatalogRow = MunicipalityHit & { state: string }

type NominatimHit = {
  lat?: string
  lon?: string
  boundingbox?: string[]
}

let catalog: CatalogRow[] | null = null
let loading: Promise<CatalogRow[]> | null = null

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export function rankMunicipalities(rows: MunicipalityHit[], query: string, limit = 8): MunicipalityHit[] {
  const q = fold(query.trim())
  if (q.length < 2) return []
  return rows
    .flatMap((row) => {
      const name = fold(row.name)
      const score = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : -1
      return score < 0 ? [] : [{ row, score }]
    })
    .sort((a, b) => a.score - b.score || a.row.name.localeCompare(b.row.name, 'pt-BR') || a.row.uf.localeCompare(b.row.uf))
    .slice(0, limit)
    .map((item) => item.row)
}

async function loadCatalog(): Promise<CatalogRow[]> {
  if (catalog) return catalog
  if (!loading) {
    loading = (async () => {
      const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new HttpError(502, 'Não foi possível consultar os municípios.', 'IBGE_UNAVAILABLE')
      const json = (await res.json()) as Array<{
        id?: number
        nome?: string
        microrregiao?: { mesorregiao?: { UF?: { sigla?: string; nome?: string } } }
      }>
      const rows: CatalogRow[] = []
      for (const item of json) {
        const uf = item.microrregiao?.mesorregiao?.UF?.sigla?.trim().toUpperCase()
        const state = item.microrregiao?.mesorregiao?.UF?.nome?.trim()
        const name = item.nome?.trim()
        if (!item.id || !name || !uf || !state) continue
        rows.push({ id: item.id, name, uf, state })
      }
      if (rows.length < 1000) throw new HttpError(502, 'A lista de municípios veio incompleta.', 'IBGE_UNAVAILABLE')
      catalog = rows
      return rows
    })().catch((err) => {
      loading = null
      throw err
    })
  }
  return loading
}

export function municipalityFromHit(row: CatalogRow, hit: NominatimHit): MapMunicipality | null {
  const box = hit.boundingbox
  if (!box || box.length < 4) return null
  const south = Number(box[0])
  const north = Number(box[1])
  const west = Number(box[2])
  const east = Number(box[3])
  if (![south, north, west, east].every(Number.isFinite) || south >= north || west >= east) return null
  const rawLat = Number(hit.lat)
  const rawLng = Number(hit.lon)
  const lat = rawLat >= south && rawLat <= north ? rawLat : (south + north) / 2
  const lng = rawLng >= west && rawLng <= east ? rawLng : (west + east) / 2
  return parseMapMunicipality({
    mapMunicipality: {
      ibgeId: row.id,
      name: row.name,
      uf: row.uf,
      lat,
      lng,
      bbox: { north, south, east, west },
    },
  })
}

export async function searchMunicipalities(query: string): Promise<MunicipalityHit[]> {
  const rows = await loadCatalog()
  return rankMunicipalities(rows, query).map(({ id, name, uf }) => ({ id, name, uf }))
}

export async function resolveMunicipality(ibgeId: number): Promise<MapMunicipality> {
  if (!Number.isInteger(ibgeId)) {
    throw new HttpError(400, 'Selecione o município que o mapa geral vai considerar.', 'MAP_CITY_REQUIRED')
  }
  const rows = await loadCatalog()
  const row = rows.find((item) => item.id === ibgeId)
  if (!row) throw new HttpError(400, 'Município não encontrado na base do IBGE.', 'MAP_CITY_UNKNOWN')
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('city', row.name)
  url.searchParams.set('state', row.state)
  url.searchParams.set('country', 'Brazil')
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FOGO-CCO/1.0 (mapa-municipal)' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new HttpError(502, 'Não foi possível localizar o município no mapa.', 'MAP_CITY_GEOCODE')
  const hits = (await res.json()) as NominatimHit[]
  const parsed = hits[0] ? municipalityFromHit(row, hits[0]) : null
  if (!parsed) {
    throw new HttpError(502, 'O município selecionado não tem um contorno utilizável no mapa.', 'MAP_CITY_GEOCODE')
  }
  return parsed
}
