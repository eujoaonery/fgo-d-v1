import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const base = process.env.FOGO_API_BASE ?? 'http://127.0.0.1:8787'
const tenantSlug = process.env.FOGO_ORG_SLUG ?? 'prefeitura-marilia'
const email = process.env.FOGO_TEST_EMAIL
const password = process.env.FOGO_TEST_PASSWORD
const runLive = !!(email && password)

async function login(): Promise<string> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Defina SUPABASE_URL e SUPABASE_ANON_KEY para testes de integração')
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`Login falhou: ${res.status}`)
  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) throw new Error('Sem access_token')
  return body.access_token
}

async function apiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(800) })
    return res.ok
  } catch {
    return false
  }
}

describe('critical flows (§20)', () => {
  it('health is public', async (t) => {
    if (!(await apiReachable())) {
      t.skip('API offline — suba npm run dev:api')
      return
    }
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) })
    assert.equal(res.ok, true)
  })

  it('tenant público por slug', async (t) => {
    if (!(await apiReachable())) {
      t.skip('API offline — suba npm run dev:api')
      return
    }
    const found = await fetch(`${base}/api/tenants/public/${tenantSlug}`, { signal: AbortSignal.timeout(5000) })
    assert.equal(found.ok, true)
    const missing = await fetch(`${base}/api/tenants/public/cidade-nao-provisionada`, { signal: AbortSignal.timeout(5000) })
    assert.equal(missing.status, 404)
    const reserved = await fetch(`${base}/api/tenants/public/mng`, { signal: AbortSignal.timeout(5000) })
    assert.equal(reserved.status, 400)
  })

  it('bootstrap exige auth', async (t) => {
    if (!(await apiReachable())) {
      t.skip('API offline — suba npm run dev:api')
      return
    }
    const res = await fetch(`${base}/api/bootstrap`, { signal: AbortSignal.timeout(5000) })
    assert.notEqual(res.status, 200)
  })

  if (runLive) {
    it('auth + CRUD ativo + reset operacional', async () => {
      const token = await login()
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Fogo-Tenant': tenantSlug,
      }

      const me = await fetch(`${base}/api/me`, { headers })
      assert.equal(me.ok, true)

      const assetId = `TEST-${Date.now()}`
      const created = await fetch(`${base}/api/assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: assetId,
          name: 'Ativo teste',
          category: 'Câmera de vigilância',
          region: 'Centro',
        }),
      })
      assert.equal(created.ok, true)

      const patched = await fetch(`${base}/api/assets/${encodeURIComponent(assetId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ notes: 'via teste' }),
      })
      assert.equal(patched.ok, true)

      const reset = await fetch(`${base}/api/settings/monitoring/reset`, { method: 'POST', headers })
      assert.equal(reset.ok, true)

      await fetch(`${base}/api/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE', headers })

      const other = await fetch(`${base}/api/bootstrap`, {
        headers: { ...headers, 'X-Fogo-Tenant': 'cidade-nao-provisionada' },
      })
      assert.equal(other.status, 404)

      const injected = await fetch(`${base}/api/assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: `INJ-${Date.now()}`,
          name: 'Injeção',
          category: 'Câmera de vigilância',
          region: 'Centro',
          organization_id: '00000000-0000-0000-0000-000000000000',
        }),
      })
      assert.equal(injected.status, 400)
    })
  } else {
    it('integração auth/CRUD/reset (skip — defina FOGO_TEST_EMAIL e FOGO_TEST_PASSWORD)', () => {
      assert.ok(true)
    })
  }
})
