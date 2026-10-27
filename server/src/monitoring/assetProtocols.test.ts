import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePort, slashPath, splitList } from './assetProtocols.js'

test('lista de tópicos e OIDs aceita vírgula e quebra de linha', () => {
  assert.deepEqual(splitList(' a, b;\nc '), ['a', 'b', 'c'])
  assert.deepEqual(splitList(''), [])
})

test('porta do ativo usa o padrão do protocolo e recusa valor fora da faixa', () => {
  assert.equal(parsePort(undefined, 1883), 1883)
  assert.equal(parsePort(' 161 ', 1883), 161)
  assert.throws(() => parsePort('0', 161))
  assert.throws(() => parsePort('70000', 161))
})

test('caminho RTSP e ONVIF ganha a barra inicial', () => {
  assert.equal(slashPath('stream1', '/'), '/stream1')
  assert.equal(slashPath('/onvif/device_service', '/'), '/onvif/device_service')
  assert.equal(slashPath('', '/onvif/device_service'), '/onvif/device_service')
})
