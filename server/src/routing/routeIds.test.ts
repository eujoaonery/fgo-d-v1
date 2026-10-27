import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRouteExternalId, maxRouteSerial } from './routeIds.js'

test('o próximo identificador fica acima das rotas já gravadas', () => {
  assert.equal(maxRouteSerial(['RT-0001', 'nota', 'RT-0007']), 7)
  assert.equal(maxRouteSerial([]), 0)
  assert.equal(formatRouteExternalId(8), 'RT-0008')
})
