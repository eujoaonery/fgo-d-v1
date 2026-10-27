import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseTeamsCsv, teamsToCsv } from './teamsCsv.js'

describe('teamsCsv', () => {
  it('roundtrips capabilities and members with pipe separator', () => {
    const csv = teamsToCsv([
      {
        id: 'EQ-1',
        name: 'Patrulha Norte',
        specialty: 'Trânsito',
        region: 'Norte',
        status: 'disponível',
        capabilities: ['transito', 'apoio'],
        members: ['João', 'Maria'],
        mapX: 5,
        mapY: 6,
      },
    ])
    const rows = parseTeamsCsv(csv)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0]!.capabilities, ['transito', 'apoio'])
    assert.deepEqual(rows[0]!.members, ['João', 'Maria'])
  })
})
