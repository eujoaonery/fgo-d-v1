import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTimeAxis, periodBounds, pointKey } from './compute.js'

describe('analytics time axis', () => {
  it('preenche 7 dias consecutivos mesmo sem ocorrências', () => {
    const now = new Date('2026-10-21T15:00:00')
    const { from, to } = periodBounds('7d', now)
    const axis = buildTimeAxis('7d', from, to)
    assert.equal(axis.length, 7)
    assert.equal(axis.at(-1)?.key, '2026-10-21')
    assert.equal(axis[0]?.key, '2026-10-15')
  })

  it('usa chave diária estável para 7d/30d', () => {
    assert.equal(pointKey(new Date('2026-10-21T09:15:00'), '7d'), '2026-10-21')
    assert.equal(pointKey(new Date('2026-10-21T09:15:00'), '24h'), '2026-10-21T09')
  })

  it('monta eixo horário de 24 h sem colapsar o dia', () => {
    const now = new Date('2026-10-21T10:30:00')
    const { from, to } = periodBounds('24h', now)
    const axis = buildTimeAxis('24h', from, to)
    assert.ok(axis.length >= 24)
    assert.notEqual(axis[0]?.key, axis.at(-1)?.key)
  })
})
