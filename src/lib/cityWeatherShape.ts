import { MARILIA_OUTLINE } from './mariliaOutline'
import type { WeatherTone } from './weatherTone'

export const WEATHER_FILL: Record<WeatherTone, string> = {
  sol: '#e2a317',
  nublado: '#8d99ab',
  vento: '#2f9ec4',
  chuva: '#2451b5',
}

export type WeatherPaintCell = {
  lat: number
  lng: number
  tone: WeatherTone
  label: string
}

export type OutlineBounds = { south: number; north: number; west: number; east: number }

export function outlineBounds(ring: ReadonlyArray<readonly [number, number]> = MARILIA_OUTLINE): OutlineBounds {
  let south = 90
  let north = -90
  let west = 180
  let east = -180
  for (const [lat, lng] of ring) {
    if (lat < south) south = lat
    if (lat > north) north = lat
    if (lng < west) west = lng
    if (lng > east) east = lng
  }
  return { south, north, west, east }
}

/** Ray casting. O anel não precisa repetir o primeiro ponto no fim. */
export function pointInRing(lat: number, lng: number, ring: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i]
    const [latJ, lngJ] = ring[j]
    const crosses = latI > lat !== latJ > lat
    if (!crosses) continue
    const x = ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI
    if (lng < x) inside = !inside
  }
  return inside
}

export function pointInMarilia(lat: number, lng: number): boolean {
  return pointInRing(lat, lng, MARILIA_OUTLINE)
}

export type WeatherPatch = {
  x: number
  y: number
  w: number
  h: number
  lat: number
  lng: number
  tone: WeatherTone
  label: string
}

export const WEATHER_STEPS_X = 48

function nearestCell(lat: number, lng: number, cells: WeatherPaintCell[], cos: number): WeatherPaintCell {
  let best = cells[0]
  let bestD = Infinity
  for (const cell of cells) {
    const dLat = cell.lat - lat
    const dLng = (cell.lng - lng) * cos
    const d = dLat * dLat + dLng * dLng
    if (d < bestD) {
      bestD = d
      best = cell
    }
  }
  return best
}

/** Retângulos só com centro dentro do contorno. A cor é a do ponto Open-Meteo mais próximo. */
export function weatherPatches(cells: WeatherPaintCell[], width: number, height: number): WeatherPatch[] {
  if (!cells.length || width < 8 || height < 8) return []
  const bounds = outlineBounds()
  const latSpan = bounds.north - bounds.south
  const lngSpan = bounds.east - bounds.west
  const stepsY = Math.max(12, Math.round(WEATHER_STEPS_X * (height / width)))
  const halfLat = latSpan / stepsY / 2
  const halfLng = lngSpan / WEATHER_STEPS_X / 2
  const cos = Math.cos((((bounds.north + bounds.south) / 2) * Math.PI) / 180)
  const patches: WeatherPatch[] = []
  for (let row = 0; row < stepsY; row += 1) {
    for (let col = 0; col < WEATHER_STEPS_X; col += 1) {
      const lat = bounds.north - ((row + 0.5) / stepsY) * latSpan
      const lng = bounds.west + ((col + 0.5) / WEATHER_STEPS_X) * lngSpan
      const probes: Array<[number, number]> = [
        [lat, lng],
        [lat - halfLat, lng - halfLng],
        [lat - halfLat, lng + halfLng],
        [lat + halfLat, lng - halfLng],
        [lat + halfLat, lng + halfLng],
      ]
      if (!probes.some(([probeLat, probeLng]) => pointInMarilia(probeLat, probeLng))) continue
      const cell = nearestCell(lat, lng, cells, cos)
      patches.push({
        x: (col / WEATHER_STEPS_X) * width,
        y: (row / stepsY) * height,
        w: width / WEATHER_STEPS_X + 1.5,
        h: height / stepsY + 1.5,
        lat,
        lng,
        tone: cell.tone,
        label: cell.label,
      })
    }
  }
  return patches
}

export function silhouetteFrame(cssWidth: number, cssHeight: number, pad = 16) {
  const bounds = outlineBounds()
  const midLat = ((bounds.north + bounds.south) / 2) * (Math.PI / 180)
  const geoW = (bounds.east - bounds.west) * Math.cos(midLat)
  const geoH = bounds.north - bounds.south
  const availW = Math.max(8, cssWidth - pad * 2)
  const availH = Math.max(8, cssHeight - pad * 2)
  let drawW = availW
  let drawH = drawW * (geoH / geoW)
  if (drawH > availH) {
    drawH = availH
    drawW = drawH * (geoW / geoH)
  }
  return {
    bounds,
    drawW,
    drawH,
    ox: (cssWidth - drawW) / 2,
    oy: (cssHeight - drawH) / 2,
  }
}

export function geoFromFrame(x: number, y: number, frame: ReturnType<typeof silhouetteFrame>) {
  const { bounds, drawW, drawH } = frame
  return {
    lat: bounds.north - (y / drawH) * (bounds.north - bounds.south),
    lng: bounds.west + (x / drawW) * (bounds.east - bounds.west),
  }
}

export function outlinePath(width: number, height: number): Array<[number, number]> {
  const bounds = outlineBounds()
  return MARILIA_OUTLINE.map(([lat, lng]) => [
    ((lng - bounds.west) / (bounds.east - bounds.west)) * width,
    ((bounds.north - lat) / (bounds.north - bounds.south)) * height,
  ])
}
