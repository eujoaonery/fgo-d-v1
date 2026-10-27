/** Catálogo de categorias e campos comuns do ativo (§6.1 / §6.1.1). */

export type AssetAttachmentKind =
  | 'manual'
  | 'certificado'
  | 'foto_instalacao'
  | 'documento_patrimonial'
  | 'outro'

export const ASSET_ATTACHMENT_KINDS: { id: AssetAttachmentKind; label: string }[] = [
  { id: 'manual', label: 'Manual' },
  { id: 'certificado', label: 'Certificado' },
  { id: 'foto_instalacao', label: 'Foto de instalação' },
  { id: 'documento_patrimonial', label: 'Documento patrimonial' },
  { id: 'outro', label: 'Outro' },
]

export type AssetCategoryDef = {
  slug: string
  label: string
  markerKind: string
  sortOrder: number
  prefix: string
  subtypes: string[]
  aliases?: string[]
  /** Identidade de equipamento (série, fabricante, modelo). */
  hardware: boolean
  /** Data de instalação / entrada em operação. */
  installedAt: boolean
  /** Conectividade própria (não obrigar em viatura/patinete). */
  connectivity: boolean
}

export const ASSET_CATEGORY_DEFS: AssetCategoryDef[] = [
  {
    slug: 'camera',
    label: 'Câmera de vigilância',
    markerKind: 'camera',
    sortOrder: 10,
    prefix: 'CAM',
    subtypes: ['Fixa', 'PTZ', 'Dome', 'Bullet', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'radar',
    label: 'Radar de trânsito',
    markerKind: 'camera',
    sortOrder: 20,
    prefix: 'RDR',
    subtypes: ['Velocidade', 'Avançar sinal', 'Conversão proibida', 'Retorno proibido', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'semaforo',
    label: 'Semáforo inteligente',
    markerKind: 'semaforo',
    sortOrder: 30,
    prefix: 'SEM',
    subtypes: ['Inteligente', 'Convencional', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'sensor',
    label: 'Sensor urbano',
    markerKind: 'sensor',
    sortOrder: 40,
    prefix: 'SEN',
    subtypes: ['Qualidade do ar', 'Ruído', 'Nível d’água', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'conectividade',
    label: 'Ponto de conectividade',
    markerKind: 'conectividade',
    sortOrder: 50,
    prefix: 'WIF',
    subtypes: ['Wi-Fi público', 'Rádio', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'totem',
    label: 'Totem de estacionamento',
    markerKind: 'sensor',
    sortOrder: 60,
    prefix: 'TTM',
    subtypes: ['Pagamento', 'Informação', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'onibus',
    label: 'Veículo de transporte',
    markerKind: 'sensor',
    sortOrder: 70,
    prefix: 'ONB',
    subtypes: ['Ônibus', 'Van', 'Táxi', 'Mototáxi', 'Transporte escolar', 'Outro'],
    aliases: ['Ônibus / frota', 'Ônibus', 'Frota'],
    hardware: true,
    installedAt: true,
    connectivity: false,
  },
  {
    slug: 'balanca',
    label: 'Balança rodoviária',
    markerKind: 'sensor',
    sortOrder: 80,
    prefix: 'BAL',
    subtypes: ['Rodoviária', 'Itinerante', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'cancela',
    label: 'Cancela automática',
    markerKind: 'sensor',
    sortOrder: 90,
    prefix: 'CAN',
    subtypes: ['Acesso', 'Estacionamento', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'painel',
    label: 'Painel LED',
    markerKind: 'semaforo',
    sortOrder: 100,
    prefix: 'PNL',
    subtypes: ['Mensagem variável', 'Informativo', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'fiscalizacao-autonoma',
    label: 'Veículo autônomo de fiscalização',
    markerKind: 'camera',
    sortOrder: 110,
    prefix: 'VAF',
    subtypes: ['Velocidade', 'Estacionamento', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: true,
  },
  {
    slug: 'patinete',
    label: 'Patinete elétrico',
    markerKind: 'sensor',
    sortOrder: 120,
    prefix: 'PAT',
    subtypes: ['Compartilhado', 'Institucional'],
    hardware: true,
    installedAt: false,
    connectivity: false,
  },
  {
    slug: 'moto-agente',
    label: 'Motocicleta de agente',
    markerKind: 'equipe',
    sortOrder: 130,
    prefix: 'MTA',
    subtypes: ['Agente de trânsito', 'Guarda municipal', 'Polícia militar', 'Outro'],
    hardware: true,
    installedAt: true,
    connectivity: false,
  },
  {
    slug: 'viatura',
    label: 'Viatura',
    markerKind: 'equipe',
    sortOrder: 140,
    prefix: 'VTR',
    subtypes: [
      'Viatura da Guarda Municipal',
      'Viatura da Polícia Militar',
      'Carro de agente de trânsito',
      'Viatura da Defesa Civil',
      'Outro veículo operacional',
    ],
    hardware: true,
    installedAt: true,
    connectivity: false,
  },
]

export const DEFAULT_ASSET_CATEGORIES = ASSET_CATEGORY_DEFS.map((c) => ({
  slug: c.slug,
  label: c.label,
  markerKind: c.markerKind,
  sortOrder: c.sortOrder,
}))

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function categoryDefFor(labelOrSlug: string | undefined | null): AssetCategoryDef | undefined {
  if (!labelOrSlug) return undefined
  const raw = labelOrSlug.trim()
  const f = fold(raw)
  const exact = ASSET_CATEGORY_DEFS.find((c) => c.slug === raw || fold(c.label) === f)
  if (exact) return exact
  return ASSET_CATEGORY_DEFS.find((c) =>
    (c.aliases ?? []).some((a) => {
      const fa = fold(a)
      return fa === f || f.includes(fa)
    }),
  )
}

export function subtypesFor(category: string): string[] {
  return categoryDefFor(category)?.subtypes ?? []
}

export function prefixForCategory(category: string): string {
  return categoryDefFor(category)?.prefix ?? 'ATV'
}

export function categoryHasHardware(category: string): boolean {
  return categoryDefFor(category)?.hardware !== false
}

export function categoryHasInstalledAt(category: string): boolean {
  return categoryDefFor(category)?.installedAt !== false
}

export function categoryHasOwnConnectivity(category: string): boolean {
  return categoryDefFor(category)?.connectivity !== false
}

export function installedAtLabel(category: string): string {
  const def = categoryDefFor(category)
  if (def && !def.installedAt) return 'Entrada em operação'
  if (def && ['viatura', 'moto-agente', 'onibus', 'fiscalizacao-autonoma'].includes(def.slug)) {
    return 'Entrada em operação'
  }
  return 'Data de instalação'
}
