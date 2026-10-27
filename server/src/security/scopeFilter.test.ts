import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { operatorPresetPermissions } from '../../../src/lib/ccoPermissions.js'
import { filterAssetsForActor, filterIncidentsForActor, inActorScope } from './scopeFilter.js'
import type { ResolvedActor } from '../permissions.js'
import type { Incident, UrbanAsset } from '../types.js'

function actor(partial: Partial<ResolvedActor>): ResolvedActor {
  return {
    userId: 'u1',
    email: 'op@cco.dev',
    role: 'operator',
    permissions: operatorPresetPermissions(),
    isPlatformSuperAdmin: false,
    memberRole: 'operator',
    ...partial,
  }
}

describe('scopeFilter §5.7', () => {
  it('admin vê qualquer região', () => {
    assert.equal(
      inActorScope(actor({ memberRole: 'admin', role: 'admin' }), { region: 'Centro' }),
      true,
    )
  })

  it('isola ativos por região', () => {
    const items = [
      { id: '1', name: 'A', category: 'c', region: 'Centro', status: 'operacional', lastSeen: '', health: 1 },
      { id: '2', name: 'B', category: 'c', region: 'Leste', status: 'operacional', lastSeen: '', health: 1 },
    ] as UrbanAsset[]
    const out = filterAssetsForActor(items, actor({ scopeRegion: 'Centro' }))
    assert.equal(out.length, 1)
    assert.equal(out[0]!.id, '1')
  })

  it('agente de campo só vê ocorrências atribuídas', () => {
    const items = [
      {
        id: 'OC-1',
        description: 'x',
        type: 't',
        region: 'Centro',
        priority: 'alta',
        status: 'aberta',
        openedAt: '',
        location: '',
        dataOrigin: 'manual',
        assignee: 'Outro',
      },
      {
        id: 'OC-2',
        description: 'y',
        type: 't',
        region: 'Centro',
        priority: 'alta',
        status: 'em atendimento',
        openedAt: '',
        location: '',
        dataOrigin: 'manual',
        assignee: 'op@cco.dev',
      },
    ] as Incident[]
    const out = filterIncidentsForActor(items, actor({ memberRole: 'field', role: 'field', displayName: 'Agente' }))
    assert.equal(out.length, 1)
    assert.equal(out[0]!.id, 'OC-2')
  })
})
