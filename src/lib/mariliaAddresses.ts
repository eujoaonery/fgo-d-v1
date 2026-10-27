import type { AssetLocation, CoordOrigin, LocationReferenceKind, LocationType } from '../types'
import { coordsForCadastro, defaultLocationType, roundCoord, validateCoordinates } from './mariliaGeo'

export type MariliaLocation = AssetLocation

const BY_REGION: Record<string, { neighborhood: string; cepPrefix: string; streets: string[] }[]> = {
  Centro: [
    {
      neighborhood: 'Centro',
      cepPrefix: '17500',
      streets: [
        'Av. Sampaio Vidal',
        'R. Nove de Julho',
        'Av. Brasil',
        'R. São Luiz',
        'Praça da República',
        'R. San Francisco',
        'Av. República',
        'R. Coroados',
      ],
    },
    {
      neighborhood: 'Alto Cafezal',
      cepPrefix: '17502',
      streets: ['R. Dona Maria Ortiz', 'Av. Nelson Garla', 'R. Bahia', 'R. Ceará'],
    },
  ],
  'Zona Norte': [
    {
      neighborhood: 'Fragata',
      cepPrefix: '17519',
      streets: ['Av. Castro Alves', 'Av. Santo Antônio', 'R. Cândido de Almeida', 'Av. das Esmeraldas'],
    },
    {
      neighborhood: 'Jardim Araxá',
      cepPrefix: '17525',
      streets: ['Av. Tiradentes', 'R. das Acácias', 'R. dos Ipês', 'Av. das Esmeraldas'],
    },
    {
      neighborhood: 'Jardim Julieta',
      cepPrefix: '17512',
      streets: ['Av. Eliezer Rocha', 'R. das Magnólias', 'R. das Hortências Norte', 'Av. Eliezer Rocha'],
    },
    {
      neighborhood: 'Oswaldo Fanceli',
      cepPrefix: '17514',
      streets: ['Av. Oswaldo Fanceli', 'R. dos Cravos', 'Av. Eliezer Rocha', 'Av. Padre Nóbrega'],
    },
    {
      neighborhood: 'Vila Santa Antonieta',
      cepPrefix: '17513',
      streets: ['R. Santa Antonieta', 'Av. Eliezer Rocha', 'Rod. Comandante João Ribeiro de Barros', 'Av. Padre Nóbrega'],
    },
    {
      neighborhood: 'Padre Nóbrega',
      cepPrefix: '17515',
      streets: ['Av. Padre Nóbrega', 'Rod. Comandante João Ribeiro de Barros', 'Av. Oswaldo Fanceli', 'Av. Eliezer Rocha'],
    },
    {
      neighborhood: 'Jardim Ohara',
      cepPrefix: '17507',
      streets: ['R. Jardim Ohara', 'Av. Tiradentes', 'R. dos Ipês', 'R. das Acácias'],
    },
  ],
  'Zona Sul': [
    {
      neighborhood: 'Jardim América',
      cepPrefix: '17506',
      streets: ['Av. Rio Branco', 'R. das Palmeiras', 'R. Amazonas', 'Av. das Indústrias'],
    },
    {
      neighborhood: 'Distrito Industrial',
      cepPrefix: '17512',
      streets: ['Av. das Indústrias', 'R. dos Metalúrgicos', 'Av. Rio Branco', 'R. do Túnel'],
    },
  ],
  Leste: [
    {
      neighborhood: 'Parque das Esmeraldas',
      cepPrefix: '17516',
      streets: ['Av. das Esmeraldas', 'Av. Lácio', 'R. Amazonas', 'Av. Santo Antônio'],
    },
    {
      neighborhood: 'Nova Marília',
      cepPrefix: '17522',
      streets: ['Av. Santo Antônio', 'R. das Hortênsias', 'R. Projetada Leste', 'Av. Lácio'],
    },
  ],
  Oeste: [
    {
      neighborhood: 'São Paulo',
      cepPrefix: '17509',
      streets: ['Av. Campos Sales', 'R. das Flores', 'R. Campos Salles', 'Av. Oeste'],
    },
    {
      neighborhood: 'Cascata',
      cepPrefix: '17504',
      streets: ['R. da Cascata', 'Av. Campos Sales', 'R. São Paulo', 'R. das Flores'],
    },
  ],
}

function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function formatAssetAddress(loc: MariliaLocation): string {
  const num =
    loc.referenceKind === 'sem_numero'
      ? 's/n'
      : loc.referenceKind === 'quilometro' && loc.number
        ? `km ${loc.number}`
        : loc.number
  const ref = loc.reference ? ` (${loc.reference})` : ''
  return `${loc.street}, ${num}${ref} — ${loc.neighborhood}, ${loc.city}/${loc.uf} · CEP ${loc.cep}`
}

export function parseAssetLocation(raw: unknown): MariliaLocation | undefined {
  if (!raw) return undefined
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      return undefined
    }
  }
  if (typeof value !== 'object' || value === null) return undefined
  const loc = value as Record<string, unknown>
  if (typeof loc.street !== 'string' || !loc.street) return undefined
  const lat = typeof loc.lat === 'number' ? loc.lat : loc.lat != null ? Number(loc.lat) : undefined
  const lng = typeof loc.lng === 'number' ? loc.lng : loc.lng != null ? Number(loc.lng) : undefined
  return {
    cep: String(loc.cep ?? ''),
    neighborhood: String(loc.neighborhood ?? ''),
    city: typeof loc.city === 'string' && loc.city ? loc.city : 'Marília',
    uf: typeof loc.uf === 'string' && loc.uf ? loc.uf : 'SP',
    street: loc.street,
    number: String(loc.number ?? ''),
    reference: typeof loc.reference === 'string' ? loc.reference : undefined,
    referenceKind: loc.referenceKind as LocationReferenceKind | undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    coordOrigin: loc.coordOrigin as CoordOrigin | undefined,
    coordPrecisionM:
      loc.coordPrecisionM != null && Number.isFinite(Number(loc.coordPrecisionM))
        ? Number(loc.coordPrecisionM)
        : undefined,
    numberConfirmed: loc.numberConfirmed === true ? true : loc.numberConfirmed === false ? false : undefined,
    locationType: loc.locationType as LocationType | undefined,
    locationValidatedAt: typeof loc.locationValidatedAt === 'string' ? loc.locationValidatedAt : undefined,
  }
}

/** Coordenada já gravada e dentro do município. Sem latitude, o mapa não inventa ponto. */
export function plottableAssetPoint(
  asset: {
    id: string
    region: string
    location?: unknown
  },
  bounds?: { south: number; north: number; west: number; east: number },
): { lat: number; lng: number } | null {
  const parsed = parseAssetLocation(asset.location)
  if (!parsed || parsed.lat == null || parsed.lng == null) return null
  if (!validateCoordinates(parsed.lat, parsed.lng, bounds).ok) return null
  return { lat: parsed.lat, lng: parsed.lng }
}

/** Localização gravada, sem inventar rua nem coordenada. */
export function resolveAssetLocation(asset: {
  id: string
  region: string
  category?: string
  location?: unknown
}): MariliaLocation | null {
  const parsed = parseAssetLocation(asset.location)
  if (!parsed) return null
  return enrichAssetLocation(parsed, {
    id: asset.id,
    category: asset.category ?? '',
    region: asset.region,
    placeMissing: false,
  })
}

export function blankAssetLocation(): MariliaLocation {
  return { cep: '', neighborhood: '', city: 'Marília', uf: 'SP', street: '', number: '' }
}

export function enrichAssetLocation(
  loc: MariliaLocation,
  opts: { id: string; category: string; region: string; placeMissing?: boolean },
): MariliaLocation {
  const next: MariliaLocation = { ...loc }
  next.city = next.city || 'Marília'
  next.uf = next.uf || 'SP'
  next.locationType = next.locationType ?? defaultLocationType(opts.category)
  if (opts.placeMissing === false) return next
  if (next.lat == null || next.lng == null || !Number.isFinite(next.lat) || !Number.isFinite(next.lng)) {
    const c = coordsForCadastro({
      id: opts.id,
      street: next.street,
      number: next.number,
      neighborhood: next.neighborhood,
      region: opts.region,
    })
    next.lat = roundCoord(c.lat)
    next.lng = roundCoord(c.lng)
    next.coordOrigin = next.coordOrigin ?? 'cadastro'
    next.coordPrecisionM = next.coordPrecisionM ?? 25
  }
  return next
}

function groupForStreet(region: string, street?: string) {
  const groups = BY_REGION[region] ?? BY_REGION.Centro!
  if (street) {
    const hit = groups.find((g) => g.streets.some((s) => s.toLowerCase() === street.toLowerCase()))
    if (hit) return hit
  }
  return groups[0]!
}

export function mariliaAddressOnStreet(
  assetId: string,
  region: string,
  street: string,
  number: string,
): MariliaLocation {
  const group = groupForStreet(region, street)
  const h = hash32(`${assetId}|${street}|${number}`)
  const loc: MariliaLocation = {
    cep: `${group.cepPrefix}-${String(h % 1000).padStart(3, '0')}`,
    neighborhood: group.neighborhood,
    city: 'Marília',
    uf: 'SP',
    street,
    number,
    referenceKind: 'numero',
  }
  const coords = coordsForCadastro({ id: assetId, street, number, neighborhood: group.neighborhood, region })
  loc.lat = roundCoord(coords.lat)
  loc.lng = roundCoord(coords.lng)
  loc.coordOrigin = 'cadastro'
  loc.coordPrecisionM = 25
  return loc
}

export function mariliaAddressFor(assetId: string, region: string): MariliaLocation {
  const groups = BY_REGION[region] ?? BY_REGION.Centro!
  const h = hash32(`${assetId}|${region}`)
  const group = groups[h % groups.length]!
  const street = group.streets[Math.floor(h / groups.length) % group.streets.length]!
  const number = String(20 + (h % 2480))
  return mariliaAddressOnStreet(assetId, region, street, number)
}
