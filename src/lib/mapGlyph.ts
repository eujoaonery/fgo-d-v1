import type { MapMarkerKind } from '@/types'

type SvgNode = [tag: string, attrs: Record<string, string | number>]

const NODES: Record<string, SvgNode[]> = {
  camera: [
    ['path', { d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z' }],
    ['circle', { cx: '12', cy: '13', r: '3' }],
  ],
  radar: [
    ['path', { d: 'm12 14 4-4' }],
    ['path', { d: 'M3.34 19a10 10 0 1 1 17.32 0' }],
  ],
  semaforo: [
    ['path', { d: 'M16.05 10.966a5 2.5 0 0 1-8.1 0' }],
    ['path', { d: 'm16.923 14.049 4.48 2.04a1 1 0 0 1 .001 1.831l-8.574 3.9a2 2 0 0 1-1.66 0l-8.574-3.91a1 1 0 0 1 0-1.83l4.484-2.04' }],
    ['path', { d: 'M16.949 14.14a5 2.5 0 1 1-9.9 0L10.063 3.5a2 2 0 0 1 3.874 0z' }],
    ['path', { d: 'M9.194 6.57a5 2.5 0 0 0 5.61 0' }],
  ],
  painel: [
    ['rect', { width: '20', height: '14', x: '2', y: '3', rx: '2' }],
    ['line', { x1: '8', x2: '16', y1: '21', y2: '21' }],
    ['line', { x1: '12', x2: '12', y1: '17', y2: '21' }],
  ],
  sensor: [
    ['path', { d: 'M4.9 19.1C1 15.2 1 8.8 4.9 4.9' }],
    ['path', { d: 'M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5' }],
    ['circle', { cx: '12', cy: '12', r: '2' }],
    ['path', { d: 'M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5' }],
    ['path', { d: 'M19.1 4.9C23 8.8 23 15.1 19.1 19' }],
  ],
  wifi: [
    ['path', { d: 'M12 20h.01' }],
    ['path', { d: 'M2 8.82a15 15 0 0 1 20 0' }],
    ['path', { d: 'M5 12.859a10 10 0 0 1 14 0' }],
    ['path', { d: 'M8.5 16.429a5 5 0 0 1 7 0' }],
  ],
  totem: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M9 17V7h4a3 3 0 0 1 0 6H9' }],
  ],
  scale: [
    ['path', { d: 'm16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z' }],
    ['path', { d: 'm2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z' }],
    ['path', { d: 'M7 21h10' }],
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2' }],
  ],
  cancela: [
    ['path', { d: 'M11 20H2' }],
    ['path', { d: 'M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z' }],
    ['path', { d: 'M11 4H8a2 2 0 0 0-2 2v14' }],
    ['path', { d: 'M14 12h.01' }],
  ],
  car: [
    ['path', { d: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2' }],
    ['circle', { cx: '7', cy: '17', r: '2' }],
    ['path', { d: 'M9 17h6' }],
    ['circle', { cx: '17', cy: '17', r: '2' }],
  ],
  bus: [
    ['path', { d: 'M8 6v6' }],
    ['path', { d: 'M15 6v6' }],
    ['path', { d: 'M2 12h19.6' }],
    ['path', { d: 'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3' }],
    ['circle', { cx: '7', cy: '18', r: '2' }],
    ['path', { d: 'M9 18h5' }],
    ['circle', { cx: '16', cy: '18', r: '2' }],
  ],
  bike: [
    ['circle', { cx: '18.5', cy: '17.5', r: '3.5' }],
    ['circle', { cx: '5.5', cy: '17.5', r: '3.5' }],
    ['circle', { cx: '15', cy: '5', r: '1' }],
    ['path', { d: 'M12 17.5V14l-3-3 4-3 2 3h2' }],
  ],
  shield: [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
  ],
  equipe: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
  ],
  ocorrencia: [
    ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ],
}

function svgInner(nodes: SvgNode[]): string {
  return nodes
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      return `<${tag} ${a}/>`
    })
    .join('')
}

export function glyphIdForCategory(category?: string, kind?: MapMarkerKind): keyof typeof NODES {
  const c = (category ?? '').toLowerCase()
  if (c.includes('radar')) return 'radar'
  if (c.includes('câmera') || c.includes('camera') || c.includes('cftv') || c.includes('vigilân')) return 'camera'
  if (c.includes('painel')) return 'painel'
  if (c.includes('semáforo') || c.includes('semaforo')) return 'semaforo'
  if (c.includes('wifi') || c.includes('wi-fi') || c.includes('conectividade')) return 'wifi'
  if (c.includes('totem') || c.includes('estacionamento')) return 'totem'
  if (c.includes('balança') || c.includes('balanca')) return 'scale'
  if (c.includes('cancela')) return 'cancela'
  if (c.includes('ônibus') || c.includes('onibus') || c.includes('frota') || c.includes('transporte')) return 'bus'
  if (c.includes('patinete') || c.includes('motocicleta')) return 'bike'
  if (c.includes('viatura') || c.includes('policial') || c.includes('guarda')) return 'shield'
  if (c.includes('táxi') || c.includes('taxi') || c.includes('autônomo') || c.includes('autonomo') || c.includes('fiscaliza')) {
    return 'car'
  }
  if (c.includes('sensor')) return 'sensor'
  if (kind === 'equipe') return 'equipe'
  if (kind === 'ocorrencia') return 'ocorrencia'
  if (kind === 'conectividade') return 'wifi'
  if (kind === 'semaforo') return 'semaforo'
  if (kind === 'camera') return 'camera'
  if (kind === 'movel') return 'car'
  return 'sensor'
}

export function mapPinHtml(opts: {
  color: string
  category?: string
  kind?: MapMarkerKind
  selected?: boolean
  alert?: boolean
  live?: boolean
  base?: boolean
  inactive?: boolean
}): string {
  const glyph = glyphIdForCategory(opts.category, opts.kind)
  const inner = svgInner(NODES[glyph] ?? NODES.sensor)
  const mods = [
    opts.selected ? 'fogo-map-pin--selected' : '',
    opts.alert ? 'fogo-map-pin--alert' : '',
    opts.live ? 'fogo-map-pin--live' : '',
    opts.base ? 'fogo-map-pin--base' : '',
    opts.inactive ? 'fogo-map-pin--inactive' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<div class="fogo-map-pin ${mods}" style="--pin:${opts.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg></div>`
}
