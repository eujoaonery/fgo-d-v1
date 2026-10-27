import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isVehicleAsset } from '../../../src/lib/assetLifecycle.js'
import { subtypesFor } from '../../../src/lib/assetCatalog.js'
import { seedFleetAssets } from '../data/seedFleet.js'

describe('frota municipal de demonstração', () => {
  it('entra na aba de frota e cobre ônibus, van e as viaturas pedidas', () => {
    const fleet = seedFleetAssets('2026-10-26T12:00:00.000Z')
    const subtypes = new Set(fleet.map((asset) => asset.subtype))
    assert.equal(fleet.length, 15)
    assert.ok(fleet.every((asset) => isVehicleAsset(asset.category)))
    assert.ok(fleet.every((asset) => !asset.location?.lat && !asset.location?.lng))
    assert.deepEqual(
      [...subtypes].sort(),
      [
        'Carro de agente de trânsito',
        'Van',
        'Viatura da Defesa Civil',
        'Viatura da Polícia Militar',
        'Ônibus',
      ].sort(),
    )
    for (const asset of fleet) {
      assert.ok(subtypesFor(asset.category).includes(asset.subtype ?? ''))
    }
  })
})
