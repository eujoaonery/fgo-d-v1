import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isOsClosed, isOsInProgress, isOsOpen, parseCloseImages } from '../../../src/lib/workOrders.js'
import { cadastralStatusChanged } from '../assets/truth.js'
import { canDispatchAgent, normalizeAgentOperationalStatus } from '../../../src/lib/agents.js'

describe('OS lifecycle §6.4', () => {
  it('considera abertos os estados da spec além de aberta/agendada/em atendimento', () => {
    for (const st of ['aberta', 'triagem', 'planejada', 'agendada', 'em deslocamento', 'em atendimento', 'aguardando material'] as const) {
      assert.equal(isOsOpen(st), true)
      assert.equal(isOsClosed(st), false)
    }
    assert.equal(isOsClosed('resolvida'), true)
    assert.equal(isOsClosed('cancelada'), true)
    assert.equal(isOsInProgress('em deslocamento'), true)
    assert.equal(isOsInProgress('aberta'), false)
  })

  it('aceita evidências de imagem e ignora payload inválido', () => {
    const ok = parseCloseImages([
      { fileName: 'foto.jpg', contentType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,abc' },
      { fileName: 'bad.txt', contentType: 'text/plain', dataUrl: 'data:text/plain,nope' },
    ])
    assert.equal(ok.length, 1)
    assert.equal(ok[0]!.fileName, 'foto.jpg')
  })
})

describe('cadastro de ativo', () => {
  it('detecta mudança de situação cadastral sem confundir com conectividade', () => {
    assert.equal(cadastralStatusChanged('operacional', 'em_manutencao'), true)
    assert.equal(cadastralStatusChanged('operacional', 'operacional'), false)
  })
})

describe('agentes §6.3', () => {
  it('não despacha quem está fora de escala, em pausa ou sem situação funcional ativa', () => {
    assert.equal(canDispatchAgent({ status: 'disponível', functionalStatus: 'ativo' }), true)
    assert.equal(canDispatchAgent({ status: 'fora de escala', functionalStatus: 'ativo' }), false)
    assert.equal(canDispatchAgent({ status: 'pausa', functionalStatus: 'ativo' }), false)
    assert.equal(canDispatchAgent({ status: 'disponível', functionalStatus: 'ferias' }), false)
    assert.equal(
      canDispatchAgent({ status: 'em campo', functionalStatus: 'ativo', assignedIncidentId: 'OS-1' }, 'OS-2'),
      false,
    )
    assert.equal(
      canDispatchAgent({ status: 'em campo', functionalStatus: 'ativo', assignedIncidentId: 'OS-1' }, 'OS-1'),
      true,
    )
  })

  it('normaliza estado operacional desconhecido para disponível', () => {
    assert.equal(normalizeAgentOperationalStatus('em atividade'), 'em atividade')
    assert.equal(normalizeAgentOperationalStatus('xyz'), 'disponível')
  })
})
