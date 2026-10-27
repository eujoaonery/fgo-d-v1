export type CameraImage = 'colorida' | 'preto_e_branco'

export type AssetSpecs = {
  nightVision?: boolean
  resolution?: string
  image?: CameraImage
  maxSpeedKmh?: number
}

export const CAMERA_RESOLUTIONS = ['720p', '1080p', '2K', '4K'] as const

export function specKind(category: string): 'camera' | 'radar' | null {
  const c = category.toLowerCase()
  if (c.includes('radar')) return 'radar'
  if (c.includes('câmera') || c.includes('camera') || c.includes('cftv') || c.includes('vigilân')) return 'camera'
  return null
}

export function sanitizeAssetSpecs(category: string, raw: unknown): AssetSpecs | undefined {
  const kind = specKind(category)
  if (!kind || raw == null || typeof raw !== 'object') return undefined
  const source = raw as Record<string, unknown>
  if (kind === 'camera') {
    const specs: AssetSpecs = {}
    if (typeof source.nightVision === 'boolean') specs.nightVision = source.nightVision
    if (typeof source.resolution === 'string' && source.resolution.trim()) {
      specs.resolution = source.resolution.trim().slice(0, 40)
    }
    if (source.image === 'colorida' || source.image === 'preto_e_branco') specs.image = source.image
    return Object.keys(specs).length ? specs : undefined
  }
  const speed = typeof source.maxSpeedKmh === 'number' ? source.maxSpeedKmh : Number(source.maxSpeedKmh)
  if (!Number.isFinite(speed) || speed <= 0 || speed > 300) return undefined
  return { maxSpeedKmh: Math.round(speed) }
}

export function specDisplayRows(category: string, specs?: AssetSpecs | null): { label: string; value: string }[] {
  const kind = specKind(category)
  if (kind === 'camera') {
    return [
      {
        label: 'Visão noturna',
        value: specs?.nightVision == null ? 'Não informado' : specs.nightVision ? 'Sim' : 'Não',
      },
      { label: 'Resolução', value: specs?.resolution || 'Não informado' },
      {
        label: 'Imagem',
        value:
          specs?.image === 'colorida' ? 'Colorida' : specs?.image === 'preto_e_branco' ? 'Preto e branco' : 'Não informado',
      },
    ]
  }
  if (kind === 'radar') {
    return [
      {
        label: 'Velocidade máxima',
        value: specs?.maxSpeedKmh != null ? `${specs.maxSpeedKmh} km/h` : 'Não informado',
      },
    ]
  }
  return []
}
