import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deriveConnectivity } from '../assets/truth.js'
import type { UrbanAsset } from '../types.js'
import { applyGeneratorFault, assetGeneratorMayTouch, firstApplicableFault, recoverGeneratorFault } from './assetFaults.js'

function asset(partial: Partial<UrbanAsset> = {}): UrbanAsset {
  return {
    id: 'CAM-1',
    name: 'Câmera Centro',
    category: 'Câmera de vigilância',
    region: 'Centro',
    status: 'operacional',
    lastSeen: new Date().toISOString(),
    health: 90,
    cadastralStatus: 'operacional',
    connectivityStatus: 'conectado',
    ...partial,
  }
}

describe('gerador marca o ativo', () => {
  it('inativo não muda', () => {
    const inactive = asset({ status: 'inativo' })
    assert.equal(assetGeneratorMayTouch(inactive), false)
    assert.equal(applyGeneratorFault(inactive, 'alerta'), null)
    assert.equal(applyGeneratorFault(inactive, 'sem_comunicacao'), null)
    assert.equal(applyGeneratorFault(asset({ cadastralStatus: 'baixado' }), 'mau_funcionamento'), null)
  })

  it('coloca em alerta, mau funcionamento e sem comunicação', () => {
    const now = Date.parse('2026-10-25T18:00:00.000Z')
    const base = asset({ lastSeen: new Date(now).toISOString() })
    const alerta = applyGeneratorFault(base, 'alerta', now)
    assert.equal(alerta?.status, 'alerta')
    const defeito = applyGeneratorFault(base, 'mau_funcionamento', now)
    assert.equal(defeito?.cadastralStatus, 'mau_funcionamento')
    const offline = applyGeneratorFault(base, 'sem_comunicacao', now)
    assert.ok(offline)
    assert.equal(
      deriveConnectivity({ lastSeen: offline!.lastSeen, cadastralStatus: offline!.cadastralStatus, category: offline!.category }),
      'sem_comunicacao',
    )
  })

  it('viatura sem conectividade cai em defeito', () => {
    const now = Date.parse('2026-10-25T18:00:00.000Z')
    const fleet = asset({ category: 'Viatura', lastSeen: new Date(now).toISOString() })
    const applied = firstApplicableFault(fleet, 'sem_comunicacao', now)
    assert.equal(applied?.kind, 'mau_funcionamento')
  })

  it('recuperação não mexe em inativo', () => {
    assert.equal(recoverGeneratorFault(asset({ status: 'inativo' })), null)
    const back = recoverGeneratorFault(asset({ status: 'alerta' }))
    assert.equal(back?.status, 'operacional')
  })
})
