import type { Map as LeafletMap, TileLayer } from 'leaflet'
import L from 'leaflet'

export const FOGO_TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/**
 * Tiles pelo próprio FOGO (`/map-tiles`).
 * O navegador não fala com o OSM: o Nginx/Vite busca uma vez e guarda em cache.
 * 3000 ativos no mapa não multiplicam pedido de tile — tile depende do zoom e da tela.
 */
export function addStreetBasemap(map: LeafletMap): TileLayer {
  return L.tileLayer('/map-tiles/{z}/{x}/{y}.png', {
    attribution: FOGO_TILE_ATTR,
    maxZoom: 19,
    keepBuffer: 1,
    updateWhenIdle: true,
    updateWhenZooming: false,
  }).addTo(map)
}
