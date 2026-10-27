import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { maskSecretHint, PROMETHEUS_CHANNEL_DEFS } from '../../../src/lib/prometheusChannels.js'

describe('maskSecretHint', () => {
  it('mascara chave longa e ignora vazia', () => {
    assert.equal(maskSecretHint(null), null)
    assert.equal(maskSecretHint('abc'), '••••')
    assert.equal(maskSecretHint('sk-1234567890abcdef'), 'sk-…cdef')
  })
})

describe('PROMETHEUS_CHANNEL_DEFS', () => {
  it('cobre os quatro canais das ações A–D', () => {
    assert.deepEqual(
      PROMETHEUS_CHANNEL_DEFS.map((c) => c.env),
      [
        'FOGO_PUBLIC_ALERT_WEBHOOK',
        'FOGO_CIVIL_DEFENSE_WEBHOOK',
        'FOGO_TEAM_NOTIFY_WEBHOOK',
        'FOGO_TRAFFIC_AGENCY_WEBHOOK',
      ],
    )
  })
})
