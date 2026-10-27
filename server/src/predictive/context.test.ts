import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildContextualSignals, hourBucketFor, slotStat } from './context.js'

function iso(day: string, hour: number) {
  return `${day}T${String(hour).padStart(2, '0')}:15:00`
}

describe('hourBucketFor', () => {
  it('agrupa 16h em 12h–18h', () => {
    assert.equal(hourBucketFor(16).label, '12h–18h')
  })
})

describe('buildContextualSignals', () => {
  it('não emite sem amostra mínima no mesmo slot', () => {
    const rows = [
      { openedAt: iso('2026-10-16', 16), region: 'Centro' },
      { openedAt: iso('2026-10-09', 16), region: 'Centro' },
    ]
    assert.equal(buildContextualSignals(rows, new Date('2026-10-23T16:00:00'), null).length, 0)
  })

  it('emite quando o mesmo weekday e faixa se repetem acima das demais', () => {
    const rows = [
      iso('2026-09-11', 16),
      iso('2026-09-18', 16),
      iso('2026-09-25', 16),
      iso('2026-10-02', 16),
      iso('2026-10-09', 16),
      iso('2026-10-16', 16),
      iso('2026-10-16', 17),
      iso('2026-10-03', 9),
    ].map((openedAt) => ({ openedAt, region: 'Centro' }))
    const now = new Date('2026-10-23T16:20:00')
    const signals = buildContextualSignals(rows, now, 60)
    assert.equal(signals.length, 1)
    const s = signals[0]!
    assert.equal(s.region, 'Centro')
    assert.equal(s.sampleDays, 6)
    assert.match(s.explanation, /risco de alagamento/)
    assert.equal(s.evidence.rainProbability, 60)
    assert.match(s.ruleKey, /^context:Centro:5:12:2026-10-23$/)
  })

  it('não inventa região sem histórico', () => {
    assert.equal(buildContextualSignals([], new Date(), 80).length, 0)
  })
})

describe('slotStat', () => {
  it('conta só o recorte pedido', () => {
    const rows = [
      { openedAt: iso('2026-10-16', 16), region: 'Centro' },
      { openedAt: iso('2026-10-16', 10), region: 'Centro' },
      { openedAt: iso('2026-10-17', 16), region: 'Centro' },
    ]
    const stat = slotStat(rows, new Date('2026-10-16T16:00:00').getDay(), 12)
    assert.equal(stat.count, 1)
    assert.equal(stat.days, 1)
  })
})
