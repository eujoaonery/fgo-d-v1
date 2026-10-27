import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMapMunicipality } from '../../../src/lib/mapMunicipality.js'
import { municipalityFromHit, rankMunicipalities } from './municipalities.js'

const campinas = {
  ibgeId: 3509502,
  name: 'Campinas',
  uf: 'SP',
  lat: -22.9056,
  lng: -47.0608,
  bbox: { south: -23.0, north: -22.75, west: -47.25, east: -46.85 },
}

test('cidades sem a chave continuam sem município de mapa', () => {
  assert.equal(parseMapMunicipality({}), null)
  assert.equal(parseMapMunicipality({ alpha: { cityName: 'Marília' } }), null)
  assert.equal(parseMapMunicipality(null), null)
})

test('município completo é aceito e um recorte inválido é ignorado', () => {
  assert.deepEqual(parseMapMunicipality({ mapMunicipality: campinas }), campinas)
  assert.equal(
    parseMapMunicipality({
      mapMunicipality: { ...campinas, bbox: { south: 0, north: 40, west: -80, east: -20 } },
    }),
    null,
  )
})

test('a busca prioriza o nome que começa pelo texto', () => {
  const rows = [
    { id: 1, name: 'São Paulo', uf: 'SP' },
    { id: 2, name: 'Paulínia', uf: 'SP' },
    { id: 3, name: 'São Paulo do Potengi', uf: 'RN' },
  ]
  const ranked = rankMunicipalities(rows, 'sao paulo')
  assert.equal(ranked[0]?.name, 'São Paulo')
  assert.equal(ranked[1]?.name, 'São Paulo do Potengi')
  assert.equal(rankMunicipalities(rows, 'x').length, 0)
})

test('o contorno do geocoder vira o recorte do mapa', () => {
  const parsed = municipalityFromHit(
    { id: 3509502, name: 'Campinas', uf: 'SP', state: 'São Paulo' },
    { lat: '-22.9056', lon: '-47.0608', boundingbox: ['-23.0', '-22.75', '-47.25', '-46.85'] },
  )
  assert.equal(parsed?.name, 'Campinas')
  assert.equal(parsed?.bbox.south, -23)
  assert.equal(parsed?.bbox.north, -22.75)
})
