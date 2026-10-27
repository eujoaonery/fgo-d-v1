import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { forgetRequestAuthCookies, readSessionEndsAt } from '../auth/sessionCookies.js'
import {
  SESSION_TTL_DEFAULT,
  SESSION_TTL_MAX,
  SESSION_TTL_MIN,
  clampSessionTtlMinutes,
  readSessionPolicy,
  writeSessionPolicy,
} from '../platform/sessionPolicy.js'

describe('política de sessão', () => {
  it('limita o tempo entre 5 minutos e 7 dias', () => {
    assert.equal(clampSessionTtlMinutes(1), SESSION_TTL_MIN)
    assert.equal(clampSessionTtlMinutes(9_999_999), SESSION_TTL_MAX)
    assert.equal(clampSessionTtlMinutes('120'), 120)
    assert.equal(clampSessionTtlMinutes('x'), SESSION_TTL_DEFAULT)
  })

  it('grava e relê o tempo configurado', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fogo-session-'))
    const prev = process.env.FOGO_DATA_DIR
    process.env.FOGO_DATA_DIR = dir
    try {
      const saved = writeSessionPolicy(240)
      assert.equal(saved.ttlMinutes, 240)
      assert.equal(readSessionPolicy().ttlMinutes, 240)
    } finally {
      if (prev === undefined) delete process.env.FOGO_DATA_DIR
      else process.env.FOGO_DATA_DIR = prev
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('remove os cookies de auth do pedido após expirar', () => {
    const req = {
      cookies: { fogo_at: 'a', fogo_rt: 'r', fogo_sx: '1' },
      headers: { cookie: 'fogo_at=a; fogo_rt=r; fogo_sx=1; other=1' },
    }
    forgetRequestAuthCookies(req)
    assert.equal(req.cookies.fogo_at, undefined)
    assert.equal(req.headers.cookie, 'other=1')
    assert.equal(readSessionEndsAt({ headers: { cookie: 'fogo_sx=1700000000000' } }), 1700000000000)
  })
})
