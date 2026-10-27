import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyWaypointOrder, assertSameAgent, detectScheduleConflicts, nearestNeighborOrder, type PlannedStop } from './planner.js'

function stop(partial: Partial<PlannedStop> & { incidentId: string; agentId?: string }): PlannedStop {
  return {
    incidentId: partial.incidentId,
    agentId: partial.agentId ?? 'ag-1',
    agentName: 'João',
    title: partial.title ?? partial.incidentId,
    address: 'Rua A',
    city: 'Marília',
    type: 'corretiva',
    lat: partial.lat ?? -22.21,
    lng: partial.lng ?? -49.94,
    coordSource: 'geocodificacao',
    scheduledStart: partial.scheduledStart,
    scheduledEnd: partial.scheduledEnd,
  }
}

describe('routing planner', () => {
  it('recusa agentes diferentes', () => {
    assert.throws(
      () => assertSameAgent([stop({ incidentId: '1', agentId: 'a' }), stop({ incidentId: '2', agentId: 'b' })]),
      /mesmo agente/,
    )
  })

  it('ordena pelo vizinho mais próximo', () => {
    const ordered = nearestNeighborOrder(
      { lat: -22.21, lng: -49.95 },
      [
        stop({ incidentId: 'longe', lat: -22.24, lng: -49.96 }),
        stop({ incidentId: 'perto', lat: -22.211, lng: -49.951 }),
      ],
    )
    assert.equal(ordered[0]?.incidentId, 'perto')
    assert.equal(ordered[1]?.incidentId, 'longe')
  })

  it('marca conflito quando a chegada passa do fim da janela', () => {
    const start = Date.parse('2026-10-23T10:00:00.000Z')
    const { conflicts, scheduleValidated } = detectScheduleConflicts(
      [stop({ incidentId: 'OS-1', scheduledEnd: '2026-10-23T10:05:00.000Z' })],
      [20 * 60],
      start,
    )
    assert.equal(scheduleValidated, true)
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0]?.incidentId, 'OS-1')
  })

  it('sem horário, avisa que a agenda não foi validada', () => {
    const { conflicts, scheduleValidated } = detectScheduleConflicts([stop({ incidentId: 'OS-1' })], [60])
    assert.equal(scheduleValidated, false)
    assert.equal(conflicts.length, 0)
  })

  it('aplica ordem de waypoints do OSRM', () => {
    const stops = [stop({ incidentId: 'A' }), stop({ incidentId: 'B' })]
    const next = applyWaypointOrder(stops, [0, 2, 1])
    assert.deepEqual(next.map((s) => s.incidentId), ['B', 'A'])
  })
})
