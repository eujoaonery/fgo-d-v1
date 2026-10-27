import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { icmpAlertDecision, icmpAlertProtocol } from './icmpAvailability.js'

describe('icmp availability alerts', () => {
  it('usa protocolo estável por ativo', () => {
    assert.equal(icmpAlertProtocol('CAM-1001'), 'ICMP-CAM-1001')
  })

  it('abre alerta após falhas consecutivas e resolve quando o ping volta', () => {
    assert.equal(
      icmpAlertDecision({ ok: false, consecutiveFailures: 1, failThreshold: 2, hasOpenAlert: false }),
      'noop',
    )
    assert.equal(
      icmpAlertDecision({ ok: false, consecutiveFailures: 2, failThreshold: 2, hasOpenAlert: false }),
      'open',
    )
    assert.equal(
      icmpAlertDecision({ ok: false, consecutiveFailures: 3, failThreshold: 2, hasOpenAlert: true }),
      'noop',
    )
    assert.equal(
      icmpAlertDecision({ ok: true, consecutiveFailures: 0, failThreshold: 2, hasOpenAlert: true }),
      'resolve',
    )
    assert.equal(
      icmpAlertDecision({ ok: true, consecutiveFailures: 0, failThreshold: 2, hasOpenAlert: false }),
      'noop',
    )
  })
})
