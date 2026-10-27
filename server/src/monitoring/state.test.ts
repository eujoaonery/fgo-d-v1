import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeMonitorState } from './state.js'

const now = Date.parse('2026-10-21T16:00:00.000Z')

describe('estado operacional', () => {
  it('desconhecido sem verificações', () => {
    const r = computeMonitorState({
      consecutiveFailures: 0,
      failThreshold: 3,
      staleAfterMs: 900_000,
      nowMs: now,
      recent: [],
    })
    assert.equal(r.state, 'unknown')
  })

  it('stale quando a última verificação é antiga', () => {
    const r = computeMonitorState({
      consecutiveFailures: 0,
      failThreshold: 3,
      lastCheckAt: '2026-10-21T12:00:00.000Z',
      staleAfterMs: 900_000,
      nowMs: now,
      recent: [{ ok: true, result: 'ok', finishedAt: '2026-10-21T12:00:00.000Z', kind: 'icmp' }],
    })
    assert.equal(r.state, 'stale')
  })

  it('indisponível após falhas consecutivas', () => {
    const r = computeMonitorState({
      consecutiveFailures: 3,
      failThreshold: 3,
      lastCheckAt: '2026-10-21T15:59:00.000Z',
      staleAfterMs: 900_000,
      nowMs: now,
      recent: [
        { ok: false, result: 'fail', finishedAt: '2026-10-21T15:59:00.000Z', kind: 'http' },
        { ok: false, result: 'fail', finishedAt: '2026-10-21T15:58:00.000Z', kind: 'http' },
        { ok: false, result: 'fail', finishedAt: '2026-10-21T15:57:00.000Z', kind: 'http' },
      ],
    })
    assert.equal(r.state, 'unavailable')
  })

  it('degradado quando ping ok e HTTP falha', () => {
    const r = computeMonitorState({
      consecutiveFailures: 1,
      failThreshold: 3,
      lastCheckAt: '2026-10-21T15:59:00.000Z',
      staleAfterMs: 900_000,
      nowMs: now,
      recent: [
        { ok: false, result: 'http_falhou', finishedAt: '2026-10-21T15:59:00.000Z', kind: 'http' },
        { ok: true, result: 'alcance_ok', finishedAt: '2026-10-21T15:59:00.000Z', kind: 'icmp' },
      ],
    })
    assert.equal(r.state, 'degraded')
  })

  it('manutenção cadastral prevalece', () => {
    const r = computeMonitorState({
      cadastral: 'em_manutencao',
      consecutiveFailures: 0,
      failThreshold: 3,
      staleAfterMs: 900_000,
      nowMs: now,
      recent: [{ ok: true, result: 'ok', finishedAt: '2026-10-21T15:59:00.000Z', kind: 'icmp' }],
    })
    assert.equal(r.state, 'maintenance')
  })
})
