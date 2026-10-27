import assert from 'node:assert/strict'
import test from 'node:test'
import { alertProtocolFromCounter, counterFloorFromProtocols } from './alertIds.js'

test('o próximo alerta fica acima do maior protocolo já gravado', () => {
  const floor = counterFloorFromProtocols(['ALT-9745', 'ALT-100', 'OCR-10', 'ALT-2801'])
  assert.equal(floor, 6945)
  assert.equal(alertProtocolFromCounter(floor + 1), 'ALT-9746')
})

test('histórico abaixo da base não empurra o contador', () => {
  assert.equal(counterFloorFromProtocols(['ALT-100', 'ALT-2800']), 0)
  assert.equal(alertProtocolFromCounter(1), 'ALT-2801')
})

test('lista vazia deixa o contador onde está', () => {
  assert.equal(counterFloorFromProtocols([]), 0)
})
