import type { TeamCapability } from '../teamCapabilities.js'
import type { MaintenanceOrder, OperationalTeam, UrbanAsset } from '../types.js'
import { hardwareIdentity } from './assetHardware.js'
import { formatAssetAddress, mariliaAddressOnStreet } from './mariliaAddresses.js'
import { coordsForCadastro, roundCoord } from '../../../src/lib/mariliaGeo.js'
import { deriveConnectivity } from '../assets/truth.js'

const REGIONS = ['Centro', 'Zona Norte', 'Zona Sul', 'Leste', 'Oeste'] as const

const REGION_BOX: Record<(typeof REGIONS)[number], { x: number; y: number; w: number; h: number }> = {
  Centro: { x: 48, y: 40, w: 18, h: 16 },
  'Zona Norte': { x: 40, y: 16, w: 28, h: 18 },
  'Zona Sul': { x: 18, y: 60, w: 36, h: 18 },
  Leste: { x: 66, y: 34, w: 26, h: 28 },
  Oeste: { x: 8, y: 36, w: 28, h: 28 },
}

const STREETS: Record<(typeof REGIONS)[number], string[]> = {
  Centro: ['Av. Sampaio Vidal', 'Praça da República', 'R. São Luiz', 'Av. Brasil', 'Terminal Urbano', 'R. Nove de Julho'],
  'Zona Norte': [
    'Av. Castro Alves',
    'Av. das Esmeraldas',
    'Av. Tiradentes',
    'Av. Eliezer Rocha',
    'Av. Oswaldo Fanceli',
    'Av. Padre Nóbrega',
    'R. Santa Antonieta',
    'Rod. Comandante João Ribeiro de Barros',
  ],
  'Zona Sul': ['Av. Rio Branco', 'Distrito Industrial', 'R. das Palmeiras', 'Av. das Indústrias', 'Túnel Rio Verde'],
  Leste: ['Av. Lácio', 'Parque Linear', 'R. Amazonas', 'Av. Santo Antônio', 'Orla Leste'],
  Oeste: ['Av. Oeste', 'R. das Flores', 'Cruzamento escolar', 'Ponte Oeste', 'R. Campos Salles'],
}

const FIRST_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João',
  'Karina', 'Lucas', 'Marina', 'Nicolas', 'Olívia', 'Paulo', 'Renata', 'Sérgio', 'Tatiane', 'Vitor',
]
const LAST_NAMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Fernandes', 'Gomes', 'Lima', 'Mendes', 'Nogueira', 'Oliveira',
  'Pereira', 'Rocha', 'Santos', 'Teixeira', 'Vieira',
]

type AssetSpec = {
  prefix: string
  category: string
  count: number
  capability: TeamCapability
  nameFor: (street: string, n: number) => string
}

const ASSET_SPECS: AssetSpec[] = [
  {
    prefix: 'CAM',
    category: 'Câmera de vigilância',
    count: 360,
    capability: 'cameras',
    nameFor: (street, n) => `Câmera ${street} ${n}`,
  },
  {
    prefix: 'SEM',
    category: 'Semáforo inteligente',
    count: 220,
    capability: 'semaforos',
    nameFor: (street, n) => `Semáforo ${street} ${n}`,
  },
  {
    prefix: 'SEN',
    category: 'Sensor urbano',
    count: 160,
    capability: 'sensores',
    nameFor: (street, n) => `Sensor ${street} ${n}`,
  },
  {
    prefix: 'WIF',
    category: 'Ponto de conectividade',
    count: 100,
    capability: 'conectividade',
    nameFor: (street, n) => `Wi-Fi ${street} ${n}`,
  },
  {
    prefix: 'PNL',
    category: 'Painel LED',
    count: 72,
    capability: 'infra',
    nameFor: (street, n) => `Painel ${street} ${n}`,
  },
  {
    prefix: 'RDR',
    category: 'Radar de trânsito',
    count: 64,
    capability: 'transito',
    nameFor: (street, n) => `Radar ${street} ${n}`,
  },
  {
    prefix: 'TTM',
    category: 'Totem de estacionamento',
    count: 48,
    capability: 'infra',
    nameFor: (street, n) => `Totem ${street} ${n}`,
  },
]

const TEAM_BLUEPRINTS: { name: string; specialty: string; capabilities: TeamCapability[]; region: (typeof REGIONS)[number] }[] = [
  { name: 'Equipe CFTV Centro', specialty: 'Câmeras e videomonitoramento', capabilities: ['cameras'], region: 'Centro' },
  { name: 'Equipe CFTV Norte', specialty: 'Câmeras e videomonitoramento', capabilities: ['cameras'], region: 'Zona Norte' },
  { name: 'Equipe CFTV Sul', specialty: 'Câmeras e videomonitoramento', capabilities: ['cameras'], region: 'Zona Sul' },
  { name: 'Equipe CFTV Leste', specialty: 'Câmeras e videomonitoramento', capabilities: ['cameras'], region: 'Leste' },
  { name: 'Equipe CFTV Oeste', specialty: 'Câmeras e videomonitoramento', capabilities: ['cameras'], region: 'Oeste' },
  { name: 'Equipe Sinalização Centro', specialty: 'Semáforos e sinalização', capabilities: ['semaforos', 'transito'], region: 'Centro' },
  { name: 'Equipe Sinalização Norte', specialty: 'Semáforos e sinalização', capabilities: ['semaforos', 'transito'], region: 'Zona Norte' },
  { name: 'Equipe Sinalização Sul', specialty: 'Semáforos e sinalização', capabilities: ['semaforos', 'transito'], region: 'Zona Sul' },
  { name: 'Equipe Sinalização Leste', specialty: 'Semáforos e sinalização', capabilities: ['semaforos', 'transito'], region: 'Leste' },
  { name: 'Equipe Trânsito Oeste', specialty: 'Trânsito e vias', capabilities: ['transito', 'semaforos'], region: 'Oeste' },
  { name: 'Equipe Redes Centro', specialty: 'Redes e conectividade', capabilities: ['conectividade'], region: 'Centro' },
  { name: 'Equipe Redes Norte', specialty: 'Redes e conectividade', capabilities: ['conectividade'], region: 'Zona Norte' },
  { name: 'Equipe Redes Leste', specialty: 'Redes e conectividade', capabilities: ['conectividade'], region: 'Leste' },
  { name: 'Equipe Sensores Sul', specialty: 'Sensores ambientais', capabilities: ['sensores'], region: 'Zona Sul' },
  { name: 'Equipe Sensores Oeste', specialty: 'Sensores ambientais', capabilities: ['sensores'], region: 'Oeste' },
  { name: 'Equipe Sensores Centro', specialty: 'Sensores ambientais', capabilities: ['sensores'], region: 'Centro' },
  { name: 'Equipe Infra Norte', specialty: 'Painéis e infraestrutura urbana', capabilities: ['infra'], region: 'Zona Norte' },
  { name: 'Equipe Infra Sul', specialty: 'Infraestrutura e manutenção', capabilities: ['infra', 'manutencao'], region: 'Zona Sul' },
  { name: 'Equipe Manutenção Leste', specialty: 'Manutenção corretiva', capabilities: ['manutencao'], region: 'Leste' },
  { name: 'Plantão CCO 24h', specialty: 'Plantão operacional do CCO', capabilities: ['cameras', 'transito', 'manutencao'], region: 'Centro' },
]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function pointInRegion(rng: () => number, region: (typeof REGIONS)[number]): { x: number; y: number } {
  const box = REGION_BOX[region]
  return {
    x: Math.round((box.x + rng() * box.w) * 10) / 10,
    y: Math.round((box.y + rng() * box.h) * 10) / 10,
  }
}

function personName(rng: () => number, salt: number): string {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)} ${String.fromCharCode(65 + (salt % 12))}.`
}

function isoHoursAgo(rng: () => number, maxHours: number): string {
  const ms = Date.now() - Math.floor(rng() * maxHours * 3600_000)
  return new Date(ms).toISOString()
}

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString()
}

export type CityCatalog = {
  teams: OperationalTeam[]
  assets: UrbanAsset[]
  maintenance: MaintenanceOrder[]
}

/** Catálogo determinístico de uma cidade média (Marília-like) para o CCO. */
export function generateCityCatalog(seed = 20261021): CityCatalog {
  const rng = mulberry32(seed)

  const teams: OperationalTeam[] = TEAM_BLUEPRINTS.map((bp, i) => {
    const pos = pointInRegion(rng, bp.region)
    const memberCount = 3 + Math.floor(rng() * 3)
    const roll = rng()
    const status: OperationalTeam['status'] = roll < 0.6 ? 'disponível' : roll < 0.88 ? 'em campo' : 'indisponível'
    return {
      id: `EQ-${String(i + 1).padStart(2, '0')}`,
      name: bp.name,
      specialty: bp.specialty,
      capabilities: bp.capabilities,
      members: Array.from({ length: memberCount }, (_, m) => personName(rng, i * 10 + m)),
      region: bp.region,
      status,
      mapX: pos.x,
      mapY: pos.y,
    }
  })

  const teamsByCapability = (cap: TeamCapability, region: string) => {
    const regional = teams.filter((t) => t.region === region && t.capabilities.includes(cap))
    if (regional.length) return pick(rng, regional)
    const any = teams.filter((t) => t.capabilities.includes(cap))
    return any.length ? pick(rng, any) : pick(rng, teams)
  }

  const assets: UrbanAsset[] = []
  for (const spec of ASSET_SPECS) {
    for (let i = 0; i < spec.count; i++) {
      const region = REGIONS[i % REGIONS.length]!
      const street = pick(rng, STREETS[region])
      const n = Math.floor(i / REGIONS.length) + 1
      const pos = pointInRegion(rng, region)
      const roll = rng()
      const status: UrbanAsset['status'] = roll < 0.82 ? 'operacional' : roll < 0.94 ? 'alerta' : 'inativo'
      const health =
        status === 'operacional' ? 78 + Math.floor(rng() * 22) : status === 'alerta' ? 40 + Math.floor(rng() * 30) : 5 + Math.floor(rng() * 20)
      const cadastralStatus: UrbanAsset['cadastralStatus'] =
        status === 'inativo' && rng() < 0.3 ? 'desativado' : 'operacional'
      const critRoll = rng()
      const criticality: UrbanAsset['criticality'] =
        critRoll < 0.12 ? 'crítica' : critRoll < 0.35 ? 'alta' : critRoll < 0.75 ? 'média' : 'baixa'
      const team = teamsByCapability(spec.capability, region)
      const seq = 2001 + assets.length
      const id = `${spec.prefix}-${seq}`
      const hw = hardwareIdentity(id, spec.category)
      const lastSeen = isoHoursAgo(rng, status === 'inativo' ? 72 : 6)
      const number = String(11 + Math.floor(i / REGIONS.length) * 37 + (i % 17))
      const location = mariliaAddressOnStreet(id, region, street, number)
      assets.push({
        id,
        name: spec.nameFor(street, n),
        category: spec.category,
        region,
        status,
        lastSeen,
        health,
        mapX: clamp(pos.x, 6, 94),
        mapY: clamp(pos.y, 8, 92),
        patrimonyCode: hw.patrimonyCode,
        serialNumber: hw.serialNumber,
        manufacturer: hw.manufacturer,
        model: hw.model,
        location,
        address: formatAssetAddress(location),
        cadastralStatus,
        connectivityStatus: deriveConnectivity({ lastSeen, cadastralStatus }),
        criticality,
        responsibleOrg: 'CCO Marília',
        responsibleTeam: team.name,
        notes: status === 'alerta' ? 'Requer inspeção no próximo ciclo de campo.' : undefined,
        installedAt: isoDaysFromNow(-(180 + Math.floor(rng() * 900))),
        dataOrigin: 'manual',
      })
    }
  }

  const maintenance: MaintenanceOrder[] = []
  const pool = assets.filter((a) => a.status !== 'operacional' || a.health < 85)
  const count = Math.min(80, pool.length)
  for (let i = 0; i < count; i++) {
    const asset = pool[i]!
    const dueShift = i < 6 ? -(1 + Math.floor(rng() * 4)) : 2 + Math.floor(rng() * 18)
    const status: MaintenanceOrder['status'] =
      dueShift < 0 ? 'atrasada' : i % 5 === 0 ? 'em execução' : i % 7 === 0 ? 'concluída' : 'pendente'
    maintenance.push({
      id: `MAN-${2601 + i}`,
      assetId: asset.id,
      assetName: asset.name,
      type: asset.status === 'alerta' || i % 3 === 0 ? 'corretiva' : 'preventiva',
      priority: asset.criticality === 'crítica' ? 'crítica' : asset.criticality === 'alta' ? 'alta' : 'média',
      assignee: asset.responsibleTeam ?? 'Plantão CCO 24h',
      dueDate: isoDaysFromNow(dueShift).slice(0, 10),
      status,
      description: `Ordem gerada no catálogo municipal — ${asset.category} em ${asset.region}.`,
      origin: 'catalogo-cidade',
      openedAt: isoHoursAgo(rng, 48),
    })
  }

  return { teams, assets, maintenance }
}

type ExtraPlacement = {
  region: (typeof REGIONS)[number]
  neighborhood: string
  street: string
}

const NORTH_COVERAGE: ExtraPlacement[] = [
  { region: 'Zona Norte', neighborhood: 'Jardim Julieta', street: 'Av. Eliezer Rocha' },
  { region: 'Zona Norte', neighborhood: 'Jardim Julieta', street: 'R. das Magnólias' },
  { region: 'Zona Norte', neighborhood: 'Jardim Julieta', street: 'R. das Hortências Norte' },
  { region: 'Zona Norte', neighborhood: 'Oswaldo Fanceli', street: 'Av. Oswaldo Fanceli' },
  { region: 'Zona Norte', neighborhood: 'Oswaldo Fanceli', street: 'R. dos Cravos' },
  { region: 'Zona Norte', neighborhood: 'Oswaldo Fanceli', street: 'Av. Padre Nóbrega' },
  { region: 'Zona Norte', neighborhood: 'Vila Santa Antonieta', street: 'R. Santa Antonieta' },
  { region: 'Zona Norte', neighborhood: 'Vila Santa Antonieta', street: 'Av. Eliezer Rocha' },
  { region: 'Zona Norte', neighborhood: 'Vila Santa Antonieta', street: 'Rod. Comandante João Ribeiro de Barros' },
  { region: 'Zona Norte', neighborhood: 'Padre Nóbrega', street: 'Av. Padre Nóbrega' },
  { region: 'Zona Norte', neighborhood: 'Padre Nóbrega', street: 'Rod. Comandante João Ribeiro de Barros' },
  { region: 'Zona Norte', neighborhood: 'Jardim Ohara', street: 'R. Jardim Ohara' },
  { region: 'Zona Norte', neighborhood: 'Jardim Araxá', street: 'Av. Tiradentes' },
  { region: 'Zona Norte', neighborhood: 'Fragata', street: 'Av. Castro Alves' },
]

const CITY_FILL: ExtraPlacement[] = [
  { region: 'Centro', neighborhood: 'Centro', street: 'Av. Sampaio Vidal' },
  { region: 'Centro', neighborhood: 'Alto Cafezal', street: 'Av. Nelson Garla' },
  { region: 'Zona Sul', neighborhood: 'Jardim América', street: 'Av. Rio Branco' },
  { region: 'Zona Sul', neighborhood: 'Distrito Industrial', street: 'Av. das Indústrias' },
  { region: 'Leste', neighborhood: 'Parque das Esmeraldas', street: 'Av. Lácio' },
  { region: 'Oeste', neighborhood: 'São Paulo', street: 'Av. Campos Sales' },
  { region: 'Oeste', neighborhood: 'Cascata', street: 'R. da Cascata' },
]

const EXTRA_SPECS: { prefix: string; category: string; capability: TeamCapability; nameFor: (street: string, n: number) => string }[] = [
  { prefix: 'CAM', category: 'Câmera de vigilância', capability: 'cameras', nameFor: (s, n) => `Câmera ${s} ${n}` },
  { prefix: 'SEM', category: 'Semáforo inteligente', capability: 'semaforos', nameFor: (s, n) => `Semáforo ${s} ${n}` },
  { prefix: 'SEN', category: 'Sensor urbano', capability: 'sensores', nameFor: (s, n) => `Sensor ${s} ${n}` },
  { prefix: 'WIF', category: 'Ponto de conectividade', capability: 'conectividade', nameFor: (s, n) => `Wi-Fi ${s} ${n}` },
  { prefix: 'PNL', category: 'Painel LED', capability: 'infra', nameFor: (s, n) => `Painel ${s} ${n}` },
  { prefix: 'RDR', category: 'Radar de trânsito', capability: 'transito', nameFor: (s, n) => `Radar ${s} ${n}` },
]

function buildPlacedAsset(
  id: string,
  spec: (typeof EXTRA_SPECS)[number],
  place: ExtraPlacement,
  seq: number,
  rng: () => number,
  teams: OperationalTeam[],
): UrbanAsset {
  const location = mariliaAddressFor(id, place.region)
  location.street = place.street
  location.neighborhood = place.neighborhood
  const coords = coordsForCadastro({
    id,
    street: place.street,
    number: location.number,
    neighborhood: place.neighborhood,
    region: place.region,
  })
  location.lat = roundCoord(coords.lat)
  location.lng = roundCoord(coords.lng)
  const roll = rng()
  const status: UrbanAsset['status'] = roll < 0.86 ? 'operacional' : roll < 0.96 ? 'alerta' : 'inativo'
  const cadastralStatus: UrbanAsset['cadastralStatus'] = 'operacional'
  const hw = hardwareIdentity(id, spec.category)
  const team =
    teams.find((t) => t.region === place.region && t.capabilities.includes(spec.capability)) ??
    teams.find((t) => t.capabilities.includes(spec.capability)) ??
    teams[0]!
  return {
    id,
    name: spec.nameFor(place.street, seq),
    category: spec.category,
    region: place.region,
    status,
    lastSeen: isoHoursAgo(rng, status === 'inativo' ? 48 : 5),
    health: status === 'operacional' ? 80 + Math.floor(rng() * 20) : 45 + Math.floor(rng() * 30),
    patrimonyCode: hw.patrimonyCode,
    serialNumber: hw.serialNumber,
    manufacturer: hw.manufacturer,
    model: hw.model,
    location,
    address: formatAssetAddress(location),
    cadastralStatus,
    connectivityStatus: deriveConnectivity({ lastSeen: isoHoursAgo(rng, 4), cadastralStatus }),
    criticality: rng() < 0.2 ? 'alta' : 'média',
    responsibleOrg: 'CCO Marília',
    responsibleTeam: team.name,
    installedAt: isoDaysFromNow(-(200 + Math.floor(rng() * 800))),
    dataOrigin: 'manual',
  }
}

/**
 * Complemento de cobertura urbana — reforça o norte (Julieta, Fanceli, Santa Antonieta)
 * e adensa o restante da cidade sem regravar o catálogo já implantado.
 */
export function generateExtraCoverageAssets(seed = 20261021): UrbanAsset[] {
  const rng = mulberry32(seed ^ 0x51ed)
  const { teams } = generateCityCatalog(seed)
  const assets: UrbanAsset[] = []
  let seq = 2301

  const northCounts = [28, 16, 12, 8, 6, 6] // CAM SEM SEN WIF PNL RDR
  northCounts.forEach((count, specIdx) => {
    const spec = EXTRA_SPECS[specIdx]!
    for (let i = 0; i < count; i++) {
      const place = NORTH_COVERAGE[i % NORTH_COVERAGE.length]!
      const id = `${spec.prefix}-${seq}`
      seq += 1
      assets.push(buildPlacedAsset(id, spec, place, Math.floor(i / NORTH_COVERAGE.length) + 1, rng, teams))
    }
  })

  const fillCounts = [10, 8, 6, 4, 2, 2]
  fillCounts.forEach((count, specIdx) => {
    const spec = EXTRA_SPECS[specIdx]!
    for (let i = 0; i < count; i++) {
      const place = CITY_FILL[i % CITY_FILL.length]!
      const id = `${spec.prefix}-${seq}`
      seq += 1
      assets.push(buildPlacedAsset(id, spec, place, 40 + i, rng, teams))
    }
  })

  return assets
}
