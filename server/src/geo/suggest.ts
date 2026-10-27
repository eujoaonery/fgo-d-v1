import { MARILIA_BOUNDS, validateCoordinates } from '../../../src/lib/mariliaGeo.js'
import type { MapMunicipality } from '../../../src/lib/mapMunicipality.js'

export type GeoSuggestion = {
  label: string
  street?: string
  neighborhood?: string
  city: string
  uf: string
  cep?: string
  lat?: number
  lng?: number
  origin: 'geocodificacao' | 'cep'
}

const VIEWBOX = `${MARILIA_BOUNDS.west},${MARILIA_BOUNDS.north},${MARILIA_BOUNDS.east},${MARILIA_BOUNDS.south}`

export async function suggestByCep(cepRaw: string, area?: MapMunicipality | null): Promise<GeoSuggestion | null> {
  const cep = cepRaw.replace(/\D/g, '')
  if (cep.length !== 8) return null
  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
  if (!res.ok) return null
  const json = (await res.json()) as {
    erro?: boolean
    logradouro?: string
    bairro?: string
    localidade?: string
    uf?: string
    cep?: string
  }
  if (json.erro) return null
  const street = json.logradouro || undefined
  const neighborhood = json.bairro || undefined
  const city = json.localidade || 'Marília'
  const uf = json.uf || 'SP'
  const located = street ? await suggestByQuery(`${street}, ${neighborhood ?? ''}, ${city}, ${uf}`, area) : []
  const hit = located.find((row) => row.lat != null && row.lng != null)
  return {
    label: [street, neighborhood, city, uf].filter(Boolean).join(' — '),
    street: street || hit?.street,
    neighborhood: neighborhood || hit?.neighborhood,
    city,
    uf,
    cep: json.cep,
    lat: hit?.lat,
    lng: hit?.lng,
    origin: hit ? 'geocodificacao' : 'cep',
  }
}

export async function suggestByQuery(q: string, area?: MapMunicipality | null): Promise<GeoSuggestion[]> {
  const query = q.trim()
  if (query.length < 3) return []
  const place = area ? `${area.name}, ${area.uf}` : 'Marília, SP'
  const viewbox = area
    ? `${area.bbox.west},${area.bbox.north},${area.bbox.east},${area.bbox.south}`
    : VIEWBOX
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('viewbox', viewbox)
  url.searchParams.set('bounded', '1')
  url.searchParams.set('q', `${query}, ${place}`)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FOGO-CCO/1.0 (prefeitura-marilia)' },
  })
  if (!res.ok) return []
  const rows = (await res.json()) as Array<{
    display_name: string
    lat: string
    lon: string
    address?: {
      road?: string
      pedestrian?: string
      suburb?: string
      neighbourhood?: string
      city?: string
      town?: string
      state?: string
      postcode?: string
    }
  }>
  const out: GeoSuggestion[] = []
  for (const row of rows) {
    const lat = Number(row.lat)
    const lng = Number(row.lon)
    const check = area
      ? validateCoordinates(lat, lng, area.bbox, `${area.name}/${area.uf}`)
      : validateCoordinates(lat, lng)
    if (!check.ok) continue
    const addr = row.address ?? {}
    out.push({
      label: row.display_name,
      street: addr.road || addr.pedestrian,
      neighborhood: addr.suburb || addr.neighbourhood,
      city: addr.city || addr.town || area?.name || 'Marília',
      uf: area?.uf || 'SP',
      cep: addr.postcode,
      lat,
      lng,
      origin: 'geocodificacao',
    })
  }
  return out
}

export async function reverseSuggest(lat: number, lng: number, area?: MapMunicipality | null): Promise<GeoSuggestion | null> {
  const check = area
    ? validateCoordinates(lat, lng, area.bbox, `${area.name}/${area.uf}`)
    : validateCoordinates(lat, lng)
  if (!check.ok) return null
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('zoom', '18')
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FOGO-CCO/1.0 (prefeitura-marilia)' },
  })
  if (!res.ok) return null
  const row = (await res.json()) as {
    display_name?: string
    address?: {
      road?: string
      suburb?: string
      neighbourhood?: string
      city?: string
      town?: string
      postcode?: string
    }
  }
  const addr = row.address ?? {}
  return {
    label: row.display_name ?? 'Ponto em Marília',
    street: addr.road,
    neighborhood: addr.suburb || addr.neighbourhood,
    city: addr.city || addr.town || area?.name || 'Marília',
    uf: area?.uf || 'SP',
    cep: addr.postcode,
    lat,
    lng,
    origin: 'geocodificacao',
  }
}
