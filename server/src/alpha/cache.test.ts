import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cacheClear, cacheGet, cacheSet, cacheWrap } from './cache.js'

describe('cache Alpha', () => {
  it('reutiliza valor dentro do TTL e expira depois', async () => {
    cacheClear('t:')
    cacheSet('t:a', 1, 30_000)
    assert.equal(cacheGet('t:a'), 1)
    cacheSet('t:b', 2, 1)
    await new Promise((r) => setTimeout(r, 15))
    assert.equal(cacheGet('t:b'), null)
    let calls = 0
    const v = await cacheWrap('t:c', 30_000, async () => {
      calls += 1
      return 9
    })
    const v2 = await cacheWrap('t:c', 30_000, async () => {
      calls += 1
      return 8
    })
    assert.equal(v, 9)
    assert.equal(v2, 9)
    assert.equal(calls, 1)
  })
})
