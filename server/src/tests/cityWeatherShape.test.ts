import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MARILIA_CENTER } from '../../../src/lib/mariliaGeo.js'
import { MARILIA_OUTLINE } from '../../../src/lib/mariliaOutline.js'
import { outlineBounds, pointInMarilia, weatherPatches, WEATHER_STEPS_X } from '../../../src/lib/cityWeatherShape.js'

describe('contorno do clima municipal', () => {
  it('reconhece o centro de Marília e recusa um ponto fora do município', () => {
    assert.ok(MARILIA_OUTLINE.length > 40)
    assert.equal(pointInMarilia(MARILIA_CENTER.lat, MARILIA_CENTER.lng), true)
    assert.equal(pointInMarilia(-21.5, -49.95), false)
  })

  it('pinta só centros que caem dentro do contorno', () => {
    const bounds = outlineBounds()
    const patches = weatherPatches(
      [
        {
          lat: MARILIA_CENTER.lat,
          lng: MARILIA_CENTER.lng,
          tone: 'sol',
          label: 'Ensolarado',
        },
      ],
      480,
      640,
    )
    assert.ok(patches.length > 100)
    const stepsY = Math.max(12, Math.round(WEATHER_STEPS_X * (640 / 480)))
    const halfLat = (bounds.north - bounds.south) / stepsY / 2
    const halfLng = (bounds.east - bounds.west) / WEATHER_STEPS_X / 2
    for (const patch of patches) {
      const probes: Array<[number, number]> = [
        [patch.lat, patch.lng],
        [patch.lat - halfLat, patch.lng - halfLng],
        [patch.lat - halfLat, patch.lng + halfLng],
        [patch.lat + halfLat, patch.lng - halfLng],
        [patch.lat + halfLat, patch.lng + halfLng],
      ]
      assert.ok(probes.some(([lat, lng]) => pointInMarilia(lat, lng)))
    }
  })
})
