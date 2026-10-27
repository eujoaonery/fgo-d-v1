import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyPermissions } from '../../../src/lib/ccoPermissions.js'
import { filterSearchHits } from './searchAccess.js'

describe('filterSearchHits', () => {
  it('drops incidents when operator lacks incidents.view', () => {
    const hits = [
      { kind: 'incident' as const, id: '1', label: 'x', sublabel: 'y', path: '/' },
      { kind: 'asset' as const, id: '2', label: 'a', sublabel: 'b', path: '/' },
    ]
    const actor = {
      userId: 'u',
      email: 'e',
      role: 'operator' as const,
      permissions: { ...emptyPermissions(), assets: { view: true, manage: false, export: false } },
      isPlatformSuperAdmin: false,
      memberRole: 'operator' as const,
    }
    const out = filterSearchHits(hits, actor)
    assert.equal(out.length, 1)
    assert.equal(out[0]!.kind, 'asset')
  })
})
