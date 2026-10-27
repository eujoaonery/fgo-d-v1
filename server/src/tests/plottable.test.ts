import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { coordsForCadastro } from '../../../src/lib/mariliaGeo.js'
import { plottableAssetPoint } from '../../../src/lib/mariliaAddresses.js'

describe('plottableAssetPoint', () => {
  it('mostra a coordenada gravada no cadastro', () => {
    const guessed = coordsForCadastro({ id: 'vtr-1', region: 'Centro', street: 'Rua A', number: '10' })
    const point = plottableAssetPoint({
      id: 'vtr-1',
      region: 'Centro',
      location: {
        street: 'Rua A',
        number: '10',
        neighborhood: 'Centro',
        city: 'Marília',
        uf: 'SP',
        lat: guessed.lat,
        lng: guessed.lng,
        coordOrigin: 'cadastro',
      },
    })
    assert.equal(point?.lat, guessed.lat)
    assert.equal(point?.lng, guessed.lng)
  })

  it('mantém coordenada marcada no mapa', () => {
    const point = plottableAssetPoint({
      id: 'vtr-2',
      region: 'Centro',
      location: {
        city: 'Marília',
        uf: 'SP',
        street: 'Av. Sampaio Vidal',
        number: '100',
        neighborhood: 'Centro',
        lat: -22.2148,
        lng: -49.9462,
        coordOrigin: 'mapa',
      },
    })
    assert.ok(point)
    assert.equal(point?.lat, -22.2148)
  })

  it('não inventa ponto quando a coordenada falta', () => {
    assert.equal(
      plottableAssetPoint({
        id: 'vtr-3',
        region: 'Centro',
        location: { city: 'Marília', uf: 'SP', street: 'Rua B', number: '1', neighborhood: 'Centro' },
      }),
      null,
    )
  })
})
