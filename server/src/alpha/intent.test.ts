import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyIntent } from './intent.js'

describe('classifyIntent', () => {
  it('agentes de campo e sobrecarga não caem em clima', () => {
    assert.equal(classifyIntent('preciso por mais agentes de campo ou os atuais estão dando conta'), 'field_capacity')
    assert.equal(classifyIntent('Os agentes de campo dão conta da fila?'), 'field_capacity')
    assert.equal(classifyIntent('capacidade de campo na Zona Norte'), 'field_capacity')
  })

  it('SLA e eficiência de operadores', () => {
    assert.equal(classifyIntent('qual o nivel de comprimento do sla meus operadores estao'), 'operator_sla')
    assert.equal(classifyIntent('nível de cumprimento do SLA'), 'operator_sla')
    assert.equal(classifyIntent('eficiência da minha equipe de operadores CCO'), 'operator_sla')
    assert.equal(classifyIntent('tempo de resposta dos operadores'), 'operator_sla')
  })

  it('clima e amanhã continuam meteorológicos', () => {
    assert.equal(classifyIntent('como estará o tempo amanhã às 8h?'), 'tomorrow')
    assert.equal(classifyIntent('previsão de chuva'), 'tomorrow')
    assert.equal(classifyIntent('próximos 7 dias'), 'next7d')
  })

  it('pergunta genérica vira consulta, não amanhã', () => {
    assert.equal(classifyIntent('o que está acontecendo agora no CCO?'), 'chat')
  })

  it('previsão de alerta de hoje não vira previsão do tempo', () => {
    assert.equal(classifyIntent('qual a previsao de alerta pra hoje'), 'chat')
    assert.equal(classifyIntent('quantos alertas o Prevision Engine espera hoje?'), 'chat')
  })
})
