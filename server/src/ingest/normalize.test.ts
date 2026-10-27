import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ignoreExternalTenantId, MAX_INGEST_BYTES, validateAndNormalize } from './normalize.js'

describe('ingestão e normalização', () => {
  it('ignora tenant_id enviado pela fonte', () => {
    const body = { tenant_id: 'org-intruso', assetId: 'CAM-1', value: 1 }
    ignoreExternalTenantId(body)
    assert.equal('tenant_id' in body, false)
    assert.equal(body.assetId, 'CAM-1')
  })

  it('rejeita payload grande', () => {
    const huge = { blob: 'x'.repeat(MAX_INGEST_BYTES + 10) }
    const r = validateAndNormalize({
      payload: huge,
      eventType: 'webhook.event',
      knownAsset: true,
    })
    assert.equal(r.ok, false)
  })

  it('marca dispositivo desconhecido sem criar ativo', () => {
    const r = validateAndNormalize({
      payload: { assetId: 'X-999', metric: 'temp', value: 12 },
      eventType: 'mqtt.message',
      assetExternalId: 'X-999',
      knownAsset: false,
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.normalized.quality, 'dispositivo_desconhecido')
  })

  it('é idempotente pelo hash do payload', () => {
    const a = validateAndNormalize({ payload: { v: 1 }, eventType: 't', knownAsset: true })
    const b = validateAndNormalize({ payload: { v: 1 }, eventType: 't', knownAsset: true })
    assert.equal(a.ok && b.ok, true)
    if (a.ok && b.ok) assert.equal(a.hash, b.hash)
  })

  it('marca dado antigo como desatualizado', () => {
    const r = validateAndNormalize({
      payload: { value: 1 },
      eventType: 't',
      occurredAt: '2020-01-01T00:00:00.000Z',
      knownAsset: true,
      staleAfterMs: 60_000,
      nowMs: Date.parse('2026-10-21T16:00:00.000Z'),
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.normalized.quality, 'desatualizada')
  })
})
