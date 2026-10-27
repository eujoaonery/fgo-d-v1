import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fractionForNumber,
  lineFromGeoJson,
  needsStreetPlacement,
  pointAlongLine,
  streetQueryName,
  streetsMatch,
} from '../../../src/lib/streetPlacement.js'
import { pickUrbanWay, type UrbanWay } from '../../../src/lib/urbanSpread.js'

describe('street placement', () => {
  it('consulta a rua por extenso', () => {
    assert.equal(streetQueryName('Rod. Comandante João Ribeiro de Barros'), 'Rodovia Comandante João Ribeiro de Barros')
    assert.equal(streetQueryName('R. das Flores'), 'Rua das Flores')
    assert.equal(streetQueryName('Av. Sampaio Vidal'), 'Avenida Sampaio Vidal')
  })

  it('trata abreviação e acento como a mesma rua', () => {
    assert.equal(streetsMatch('R. São Luiz', 'Rua Sao Luis'), true)
    assert.equal(streetsMatch('Av. Sampaio Vidal', 'Avenida Brasil'), false)
  })

  it('distribui o número ao longo da linha, não numa reta solta', () => {
    const line = [
      { lat: -22.21, lng: -49.95 },
      { lat: -22.21, lng: -49.94 },
    ]
    const start = pointAlongLine(line, fractionForNumber('20'))
    const end = pointAlongLine(line, fractionForNumber('3900'))
    assert.ok(start && end)
    assert.ok(start!.lng < end!.lng)
    assert.ok(Math.abs(start!.lat - (-22.21)) < 0.0001)
  })

  it('lê o traçado da via no geojson', () => {
    const line = lineFromGeoJson({
      type: 'LineString',
      coordinates: [
        [-49.95, -22.21],
        [-49.94, -22.2],
      ],
    })
    assert.equal(line.length, 2)
    assert.equal(line[0]?.lng, -49.95)
  })

  it('espalha ativos por vias diferentes', () => {
    const ways: UrbanWay[] = Array.from({ length: 40 }, (_, i) => ({
      name: `Rua ${i}`,
      avenue: i % 5 === 0,
      line: [
        { lat: -22.21, lng: -49.95 },
        { lat: -22.21, lng: -49.94 },
      ],
    }))
    const names = new Set(
      Array.from({ length: 80 }, (_, i) => pickUrbanWay(`ativo-${i}`, ways)?.name).filter(Boolean),
    )
    assert.ok(names.size >= 20)
    const used = new Set<string>()
    for (let i = 0; i < ways.length; i++) {
      const picked = pickUrbanWay(`ativo-${i}`, ways, used)
      assert.ok(picked)
      assert.equal(used.has(picked!.name), false)
      used.add(picked!.name)
    }
    assert.equal(used.size, ways.length)
  })

  it('não mexe em coordenada marcada no mapa nem em geocodificação já aceita', () => {
    const base = { street: 'Av. Brasil', number: '100', neighborhood: 'Centro', lat: -22.22, lng: -49.94 }
    assert.equal(needsStreetPlacement('a', 'Centro', { ...base, coordOrigin: 'mapa' }), false)
    assert.equal(needsStreetPlacement('a', 'Centro', { ...base, coordOrigin: 'geocodificacao' }), false)
    assert.equal(needsStreetPlacement('a', 'Centro', { ...base, coordOrigin: 'gps' }), false)
    assert.equal(
      needsStreetPlacement('a', 'Centro', { street: 'Av. Brasil', number: '10', neighborhood: 'Centro', coordOrigin: 'cadastro', coordPrecisionM: 25, lat: -22.2, lng: -49.9 }),
      true,
    )
    assert.equal(needsStreetPlacement('a', 'Centro', { street: 'Av. Brasil', number: '10', neighborhood: 'Centro' }), true)
  })
})
