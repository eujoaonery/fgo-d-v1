import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assetsToCsv, parseAssetsCsv } from './assetsCsv.js'

describe('assetsCsv', () => {
  it('roundtrips header and required fields', () => {
    const csv = assetsToCsv([
      {
        id: 'CAM-1',
        name: 'Camera Centro',
        category: 'Câmera de vigilância',
        region: 'Centro',
        status: 'operacional',
        health: 95,
        lastSeen: '2026-01-01T00:00:00.000Z',
        mapX: 10,
        mapY: 20,
        notes: 'ok',
      },
    ])
    const rows = parseAssetsCsv(csv)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.id, 'CAM-1')
    assert.equal(rows[0]!.name, 'Camera Centro')
    assert.equal(rows[0]!.health, 95)
  })

  it('parses quoted commas', () => {
    const text =
      'id,name,category,region\n,"Nome, com vírgula",Cat,Região\n'
    const rows = parseAssetsCsv(text)
    assert.equal(rows[0]!.name, 'Nome, com vírgula')
  })

  it('skips rows without name/category/region', () => {
    const text = 'id,name,category,region\n,,,\n'
    assert.deepEqual(parseAssetsCsv(text), [])
  })
})
