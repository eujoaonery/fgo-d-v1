import type { MapMarkerKind } from '@/types'

export function categoryToMarkerKind(category: string): MapMarkerKind {
  const c = category.toLowerCase()
  if (c.includes('câmera') || c.includes('camera') || c.includes('vigilân') || c.includes('radar')) return 'camera'
  if (c.includes('semáforo') || c.includes('semaforo') || c.includes('painel')) return 'semaforo'
  if (c.includes('conectividade') || c.includes('wi-fi') || c.includes('wifi')) return 'conectividade'
  if (
    c.includes('viatura') ||
    c.includes('patinete') ||
    c.includes('motocicleta') ||
    c.includes('autônomo') ||
    c.includes('autonomo') ||
    c.includes('transporte') ||
    c.includes('ônibus') ||
    c.includes('onibus') ||
    c.includes('frota')
  ) {
    return 'movel'
  }
  return 'sensor'
}
