import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assetMayRaiseOccurrence,
  assetProblemTransition,
  monitorShouldRaiseOccurrence,
} from './problemOccurrence.js'

describe('ocorrência a partir do ativo', () => {
  it('inativo não gera', () => {
    assert.equal(assetMayRaiseOccurrence({ status: 'inativo', cadastralStatus: 'operacional' }), false)
    assert.equal(
      assetProblemTransition(
        { status: 'operacional', cadastralStatus: 'operacional', connectivityStatus: 'conectado' },
        { status: 'inativo', cadastralStatus: 'operacional', connectivityStatus: 'conectado' },
      ),
      null,
    )
  })

  it('entrar em alerta gera', () => {
    assert.equal(
      assetProblemTransition(
        { status: 'operacional', cadastralStatus: 'operacional', connectivityStatus: 'conectado' },
        { status: 'alerta', cadastralStatus: 'operacional', connectivityStatus: 'conectado' },
      ),
      'alerta',
    )
  })

  it('perda de comunicação gera e ICMP puro fica com a ocorrência própria', () => {
    assert.equal(
      assetProblemTransition(
        { status: 'operacional', cadastralStatus: 'operacional', connectivityStatus: 'conectado' },
        { status: 'operacional', cadastralStatus: 'operacional', connectivityStatus: 'sem_comunicacao' },
      ),
      'sem_comunicacao',
    )
    assert.equal(
      monitorShouldRaiseOccurrence({
        state: 'unavailable',
        status: 'operacional',
        cadastralStatus: 'operacional',
        onlyIcmpFailure: true,
      }),
      false,
    )
    assert.equal(
      monitorShouldRaiseOccurrence({
        state: 'degraded',
        status: 'operacional',
        cadastralStatus: 'operacional',
        onlyIcmpFailure: false,
      }),
      true,
    )
  })
})
