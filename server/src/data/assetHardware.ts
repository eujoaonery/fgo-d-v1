type Brand = { manufacturer: string; models: string[]; prefix: string }

const CAMERA: Brand[] = [
  { manufacturer: 'Intelbras', models: ['VIP 5450 Z', 'VIP 3240 D', 'VHD 1220 B'], prefix: 'IB' },
  { manufacturer: 'Hikvision', models: ['DS-2CD2143G2', 'DS-2CD2385G1'], prefix: 'HK' },
  { manufacturer: 'Axis', models: ['P3245-LVE', 'M3085-V'], prefix: 'AX' },
]
const TRAFFIC: Brand[] = [
  { manufacturer: 'Dataprom', models: ['STC-400', 'STC-200', 'Controlador 8 fases'], prefix: 'DP' },
  { manufacturer: 'Tesc', models: ['TSC-800', 'Controlador 16 fases'], prefix: 'TS' },
]
const SENSOR: Brand[] = [
  { manufacturer: 'Libelium', models: ['Smart Cities', 'Air Quality', 'Flood Probe'], prefix: 'LB' },
  { manufacturer: 'Bosch', models: ['Urban Climate', 'Noise Node'], prefix: 'BS' },
]
const WIFI: Brand[] = [
  { manufacturer: 'Ubiquiti', models: ['UniFi U6', 'NanoStation M5', 'EdgeRouter X'], prefix: 'UB' },
  { manufacturer: 'Intelbras', models: ['AP 1350 AC', 'Action RG 1200'], prefix: 'IB' },
]
const PANEL: Brand[] = [
  { manufacturer: 'Daktronics', models: ['GS6-40', 'VF-15', 'Painel 960x480'], prefix: 'DK' },
  { manufacturer: 'Punto', models: ['LED Urbano 10mm', 'VMS 960'], prefix: 'PT' },
]
const RADAR: Brand[] = [
  { manufacturer: 'Sensys', models: ['TIR-500', 'SpeedCam 2', 'Faixa 4+1'], prefix: 'SY' },
  { manufacturer: 'Consist', models: ['Radar Faixa', 'OCR 4K'], prefix: 'CS' },
]
const TOTEM: Brand[] = [
  { manufacturer: 'Parkmeter', models: ['PM-200', 'Totem Dual', 'Pay-on-foot'], prefix: 'PK' },
]
const FLEET: Brand[] = [
  { manufacturer: 'Fiat', models: ['Cronos', 'Toro', 'Ducato'], prefix: 'FT' },
  { manufacturer: 'Chevrolet', models: ['Onix', 'S10'], prefix: 'CV' },
]
const MOTO: Brand[] = [
  { manufacturer: 'Yamaha', models: ['Fazer 250', 'XTZ 250'], prefix: 'YM' },
  { manufacturer: 'Honda', models: ['CG 160', 'XRE 300'], prefix: 'HD' },
]
const SCOOTER: Brand[] = [{ manufacturer: 'Xiaomi', models: ['Pro 2', 'Essential'], prefix: 'XM' }]
const FALLBACK: Brand[] = [{ manufacturer: 'Siemens', models: ['Urban 100'], prefix: 'SN' }]

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function brandsForCategory(category: string): Brand[] {
  const c = fold(category)
  if (c.includes('camera') || c.includes('vigilan')) return CAMERA
  if (c.includes('radar')) return RADAR
  if (c.includes('semaforo')) return TRAFFIC
  if (c.includes('painel') || c.includes('paineis')) return PANEL
  if (c.includes('conectividade') || c.includes('wi-fi') || c.includes('wifi')) return WIFI
  if (c.includes('totem') || c.includes('cancela') || c.includes('balanca')) return TOTEM
  if (c.includes('patinete')) return SCOOTER
  if (c.includes('motocicleta') || c.includes('moto')) return MOTO
  if (c.includes('viatura') || c.includes('transporte') || c.includes('onibus') || c.includes('autonomo')) return FLEET
  if (c.includes('sensor')) return SENSOR
  return FALLBACK
}

function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

export type AssetHardware = {
  manufacturer: string
  model: string
  serialNumber: string
  patrimonyCode: string
}

/** Identidade cadastral determinística (série / fabricante / modelo) por ativo. */
export function hardwareIdentity(externalId: string, category: string): AssetHardware {
  const brands = brandsForCategory(category)
  const h = hashId(externalId)
  const brand = brands[h % brands.length]!
  const model = brand.models[Math.floor(h / brands.length) % brand.models.length]!
  const serialBody = (h % 900000 + 100000).toString(36).toUpperCase().padStart(5, '0')
  const cleanId = externalId.replace(/[^A-Z0-9]/gi, '')
  return {
    manufacturer: brand.manufacturer,
    model,
    serialNumber: `${brand.prefix}-${cleanId}-${serialBody}`,
    patrimonyCode: `PM-${externalId}`,
  }
}

export function missingHardware(row: {
  serial_number?: string | null
  manufacturer?: string | null
  model?: string | null
  patrimony_code?: string | null
  category?: string | null
}): boolean {
  const blank = (v?: string | null) => !v?.trim()
  if (blank(row.serial_number) || blank(row.manufacturer) || blank(row.model) || blank(row.patrimony_code)) {
    return true
  }
  // Painéis originais caíam no fallback Siemens por causa do acento.
  const cat = fold(row.category ?? '')
  return (cat.includes('painel') || cat.includes('paineis')) && row.manufacturer === 'Siemens'
}
