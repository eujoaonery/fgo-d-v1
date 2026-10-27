import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import dgram from 'node:dgram'
import { describe, it } from 'node:test'
import { runTcp } from './adapters/tcp.js'
import { runHttp } from './adapters/http.js'
import { runSnmp } from './adapters/snmp.js'
import { mqttAdapter } from './adapters/mqtt.js'
import { runRtsp } from './adapters/camera.js'
import { signWebhookBody, verifyWebhookSignature } from './adapters/webhooks.js'
import { sanitizeLogObject, sanitizeLogText } from './sanitize.js'
import { decryptSecret, encryptSecret } from './secrets.js'
import type { ConnectorContext, ConnectorRecord } from './types.js'

function ctx(partial: Partial<ConnectorContext> & { config: Record<string, unknown> }): ConnectorContext {
  const connector: ConnectorRecord = {
    id: '00000000-0000-4000-8000-000000000001',
    organizationId: 'org',
    kind: 'http',
    name: 't',
    description: null,
    status: 'configured',
    health: 'unknown',
    config: partial.config,
    secretId: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    metrics: {},
    adapterVersion: '1',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hasSecret: false,
  }
  return {
    organizationId: 'org',
    orgSlug: 'demo',
    connector,
    secrets: {},
    allowPrivate: true,
    timeoutMs: 2000,
    ...partial,
  }
}

function listen(server: net.Server | http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })
}

describe('adaptadores locais', () => {
  it('TCP registra abertura de porta', async () => {
    const server = net.createServer((s) => s.end())
    const port = await listen(server)
    const result = await runTcp(ctx({ config: { host: '127.0.0.1', port } }))
    server.close()
    assert.equal(result.ok, true)
    assert.equal(result.result, 'porta_aberta')
    assert.ok((result.latencyMs ?? 0) >= 0)
  })

  it('HTTP registra status, latência e timeout', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(204)
      res.end()
    })
    const port = await listen(server)
    const ok = await runHttp(ctx({ config: { url: `http://127.0.0.1:${port}/health`, expectStatus: 204 } }))
    server.close()
    assert.equal(ok.ok, true)
    assert.equal(ok.httpStatus, 204)

    const slow = http.createServer(() => {
      /* hang */
    })
    const slowPort = await listen(slow)
    const timed = await runHttp(ctx({ config: { url: `http://127.0.0.1:${slowPort}/slow` }, timeoutMs: 250 }))
    slow.close()
    assert.equal(timed.ok, false)
    assert.equal(timed.result, 'timeout')
  })

  it('SNMPv2c GET contra UDP local', async () => {
    const sock = dgram.createSocket('udp4')
    await new Promise<void>((resolve) => sock.bind(0, '127.0.0.1', resolve))
    const port = sock.address().port
    sock.on('message', (_msg, rinfo) => {
      const fake = Buffer.from([0x30, 0x0c, 0x02, 0x01, 0x01, 0x04, 0x01, 0x78, 0x04, 0x04, 0x74, 0x65, 0x73, 0x74])
      sock.send(fake, rinfo.port, rinfo.address)
    })
    const result = await runSnmp(
      ctx({
        config: { host: '127.0.0.1', port, version: '2c', oids: ['1.3.6.1.2.1.1.1.0'] },
        secrets: { community: 'lab' },
      }),
    )
    sock.close()
    assert.equal(result.ok, true)
    assert.equal(JSON.stringify(result).includes('lab'), false)
  })

  it('MQTT CONNACK local', async () => {
    const server = net.createServer((socket) => {
      socket.on('data', () => {
        socket.write(Buffer.from([0x20, 0x02, 0x00, 0x00]))
        socket.end()
      })
    })
    const port = await listen(server)
    const result = await mqttAdapter.test(ctx({ config: { host: '127.0.0.1', port, tls: false } }))
    server.close()
    assert.equal(result.ok, true)
    assert.equal(result.result, 'mqtt_conectado')
  })

  it('RTSP OPTIONS local', async () => {
    const server = net.createServer((socket) => {
      socket.on('data', () => {
        socket.end('RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n')
      })
    })
    const port = await listen(server)
    const result = await runRtsp(ctx({ config: { host: '127.0.0.1', port, path: '/' } }))
    server.close()
    assert.equal(result.ok, true)
    assert.equal(result.detail.streamAccessible, true)
    assert.match(String(result.detail.note), /não o conteúdo/i)
  })

  it('assinatura HMAC de webhook', () => {
    const body = '{"id":"1"}'
    const sig = signWebhookBody('s3cret', body)
    assert.equal(verifyWebhookSignature('s3cret', body, sig), true)
    assert.equal(verifyWebhookSignature('s3cret', body, 'sha256=deadbeef'), false)
  })

  it('sanitiza senhas, comunidades e RTSP', () => {
    const text = sanitizeLogText('Authorization: Bearer abc community=public rtsp://user:pwd@cam/stream')
    assert.equal(text.includes('pwd'), false)
    assert.equal(text.includes('Bearer abc'), false)
    const obj = sanitizeLogObject({ password: 'x', nested: { token: 'y' }, ok: 1 })
    assert.deepEqual(obj, { password: '[redacted]', nested: { token: '[redacted]' }, ok: 1 })
  })

  it('criptografa e abre segredos', () => {
    process.env.FOGO_CONNECTOR_SECRET_KEY = 'teste-chave-conectores-16'
    const blob = encryptSecret({ token: 'abc' })
    assert.equal(blob.includes('abc'), false)
    assert.deepEqual(decryptSecret(blob), { token: 'abc' })
  })
})
