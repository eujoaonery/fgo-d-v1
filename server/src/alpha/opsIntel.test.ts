import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fieldCapacitySnapshot, operatorSlaSnapshot } from '../../../src/lib/alphaOpsIntel.js'
import type { OperationalAlert } from '../../../src/types/index.js'

const agent = (over: Partial<Parameters<typeof fieldCapacitySnapshot>[0][number]>) => ({
  id: 'a1',
  name: 'Equipe Norte',
  region: 'Zona Norte',
  status: 'disponível' as const,
  functionalStatus: 'ativo' as const,
  ...over,
})

describe('fieldCapacitySnapshot', () => {
  it('dando conta quando há despacháveis para a fila', () => {
    const snap = fieldCapacitySnapshot(
      [agent({ id: '1' }), agent({ id: '2', name: 'Centro', region: 'Centro' })],
      [{ id: 'OS-1', region: 'Centro', status: 'aberta', openedAt: '2026-10-22T10:00:00.000Z' }],
      '2026-10-22',
    )
    assert.equal(snap.verdict, 'dando_conta')
    assert.equal(snap.dispatchable, 2)
    assert.equal(snap.unassignedOpen, 1)
    assert.ok(snap.slackText)
    assert.match(snap.sectorHint ?? '', /Nenhum setor pede contratação/)
  })

  it('sobrecarga quando a fila sem agente supera despacháveis', () => {
    const snap = fieldCapacitySnapshot(
      [agent({ id: '1', status: 'em campo', assignedIncidentId: 'OS-1' })],
      [
        { id: 'OS-1', region: 'Zona Norte', status: 'em atendimento', assignedTeamId: '1', openedAt: '2026-10-22T08:00:00.000Z' },
        { id: 'OS-2', region: 'Zona Norte', status: 'aberta', openedAt: '2026-10-22T09:00:00.000Z' },
        { id: 'OS-3', region: 'Zona Norte', status: 'aberta', openedAt: '2026-10-22T09:30:00.000Z' },
      ],
      '2026-10-22',
    )
    assert.equal(snap.verdict, 'sobrecarga')
    assert.ok(snap.unassignedOpen >= 2)
    assert.equal(snap.dispatchable, 0)
  })
})

describe('operatorSlaSnapshot', () => {
  const alert = (over: Partial<OperationalAlert>): OperationalAlert => ({
    id: 'AL-1',
    category: 'CFTV',
    severity: 'alta',
    title: 'Câmera',
    description: '',
    source: 'regra',
    dataOrigin: 'manual',
    detectedAt: '2026-10-22T10:00:00.000Z',
    state: 'em atendimento',
    claimedBy: 'u1',
    claimedByLabel: 'Ana',
    ...over,
  })

  it('calcula cumprimento no prazo versus excedido', () => {
    const snap = operatorSlaSnapshot({
      members: [{ userId: 'u1', displayName: 'Ana', role: 'operator' }],
      presenceUserIds: ['u1'],
      alerts: [alert({})],
      incidents: [],
      slaRows: [
        {
          protocol: 'AL-1',
          claimedBy: 'u1',
          claimedByLabel: 'Ana',
          state: 'em atendimento',
          firstResponseOverdue: false,
          assumeAt: '2026-10-22T10:05:00.000Z',
          assumeMs: 5 * 60_000,
          dispatchMs: null,
          completeMs: null,
          slaPercent: 100,
        },
        {
          protocol: 'AL-2',
          state: 'novo',
          firstResponseOverdue: true,
          assumeMs: 70 * 60_000,
          dispatchMs: null,
          completeMs: null,
          slaPercent: -10,
        },
      ],
      summary: { openAlerts: 2, overdueOpen: 1, avgAssumeMs: 5 * 60_000, avgDispatchMs: null, avgCompleteMs: null },
    })
    assert.equal(snap.compliancePct, 50)
    assert.equal(snap.onFloor, 1)
    assert.equal(snap.occupied, 1)
    assert.match(snap.verdictText, /50%/)
  })
})
