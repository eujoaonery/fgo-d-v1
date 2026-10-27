import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertSafeHost, isPrivateOrSpecialIp, parseUrlSafe, SsrfError } from './ssrf.js'

describe('SSRF', () => {
  it('bloqueia loopback, privados e metadados', () => {
    assert.equal(isPrivateOrSpecialIp('127.0.0.1'), true)
    assert.equal(isPrivateOrSpecialIp('10.1.2.3'), true)
    assert.equal(isPrivateOrSpecialIp('192.168.0.8'), true)
    assert.equal(isPrivateOrSpecialIp('169.254.169.254'), true)
    assert.equal(isPrivateOrSpecialIp('8.8.8.8'), false)
  })

  it('rejeita localhost sem permissão de plataforma', async () => {
    await assert.rejects(() => assertSafeHost('127.0.0.1', false), SsrfError)
    await assert.rejects(() => assertSafeHost('localhost', false), SsrfError)
  })

  it('permite privado somente quando autorizado', async () => {
    const ips = await assertSafeHost('127.0.0.1', true)
    assert.ok(ips.includes('127.0.0.1'))
  })

  it('bloqueia metadados mesmo com destino privado autorizado', async () => {
    await assert.rejects(() => assertSafeHost('169.254.169.254', true), SsrfError)
    await assert.rejects(() => assertSafeHost('metadata.google.internal', true), SsrfError)
  })

  it('rejeita credenciais na URL e protocolos não HTTP', () => {
    assert.throws(() => parseUrlSafe('https://user:pass@example.com/hook'), SsrfError)
    assert.throws(() => parseUrlSafe('file:///etc/passwd'), SsrfError)
  })
})
