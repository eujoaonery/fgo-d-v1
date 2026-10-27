import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyAcaoTransition } from './transitions.js'
import { draftsFromIntelligence } from './sync.js'
import { inferAcaoPriorityFromText } from '../../../src/lib/acao.js'

describe('fila Ação — transições', () => {
  it('padrão analisar não aceita o mesmo status de novo', () => {
    const r = applyAcaoTransition({ from: 'analisar', to: 'analisar' })
    assert.equal(r.ok, false)
  })

  it('ação tomada exige descrição e finaliza', () => {
    const bad = applyAcaoTransition({ from: 'analisar', to: 'tomada', takenAction: 'ok' })
    assert.equal(bad.ok, false)
    const ok = applyAcaoTransition({
      from: 'analisar',
      to: 'tomada',
      takenAction: 'Interdição cancelada na via de 80 km/h',
      now: '2026-10-22T14:00:00.000Z',
    })
    assert.equal(ok.ok, true)
    if (ok.ok) {
      assert.equal(ok.fields.status, 'tomada')
      assert.equal(ok.fields.takenAction, 'Interdição cancelada na via de 80 km/h')
      assert.equal(ok.fields.decidedAt, '2026-10-22T14:00:00.000Z')
    }
  })

  it('ação ignorada exige motivo', () => {
    const bad = applyAcaoTransition({ from: 'analisar', to: 'ignorada' })
    assert.equal(bad.ok, false)
    const ok = applyAcaoTransition({
      from: 'delegada',
      to: 'ignorada',
      ignoredReason: 'Já coberto por OS aberta',
    })
    assert.equal(ok.ok, true)
    if (ok.ok) assert.equal(ok.fields.status, 'ignorada')
  })

  it('delegada aceita nome livre', () => {
    const bad = applyAcaoTransition({ from: 'analisar', to: 'delegada', delegatedToName: 'A' })
    assert.equal(bad.ok, false)
    const ok = applyAcaoTransition({
      from: 'analisar',
      to: 'delegada',
      delegatedToName: 'Equipe Norte',
      delegatedToUserId: 'u-1',
    })
    assert.equal(ok.ok, true)
    if (ok.ok) {
      assert.equal(ok.fields.status, 'delegada')
      assert.equal(ok.fields.delegatedToName, 'Equipe Norte')
      assert.equal(ok.fields.delegatedToUserId, 'u-1')
    }
  })

  it('finalizada não muda', () => {
    const r = applyAcaoTransition({
      from: 'tomada',
      to: 'ignorada',
      ignoredReason: 'tarde demais',
    })
    assert.equal(r.ok, false)
  })

  it('só delegada volta para análise', () => {
    const fromTomada = applyAcaoTransition({ from: 'tomada', to: 'analisar' })
    assert.equal(fromTomada.ok, false)
    const ok = applyAcaoTransition({ from: 'delegada', to: 'analisar' })
    assert.equal(ok.ok, true)
    if (ok.ok) {
      assert.equal(ok.fields.status, 'analisar')
      assert.equal(ok.fields.delegatedToName, null)
    }
  })
})

describe('fila Ação — agregação', () => {
  it('une Alpha, preditivo pendente e estratégico sem duplicar texto vazio', () => {
    const drafts = draftsFromIntelligence({
      alpha: [
        {
          id: 'a1',
          situation: 'Chuva prevista',
          actionText: 'Não realizar obras com interdição em vias de 80 km/h',
          justification: 'Previsão de chuva',
          priority: 'critica',
          region: 'Norte',
        },
        { id: 'a2', situation: 'Vazio', actionText: '  ', priority: 'media' },
      ],
      predictions: [
        {
          id: 'PRV-1',
          predictionType: 'incident_spike',
          targetLabel: 'Pico de OS no Centro',
          region: 'Centro',
          horizonHours: 24,
          calculatedAt: '2026-10-22T00:00:00.000Z',
          explanation: 'Volume acima da linha de base',
          recommendation: 'Reforçar plantão no Centro',
          reviewStatus: 'pending',
          decisionStatus: 'pending',
          modelName: 'fogo-rules-v1',
          modelVersion: '1.0.0',
        },
        {
          id: 'PRV-2',
          predictionType: 'region_risk',
          targetLabel: 'Já decidido',
          horizonHours: 24,
          calculatedAt: '2026-10-22T00:00:00.000Z',
          explanation: 'x',
          recommendation: 'Ignorar',
          reviewStatus: 'pending',
          decisionStatus: 'accepted',
          modelName: 'fogo-rules-v1',
          modelVersion: '1.0.0',
        },
      ],
      preventive: ['Acionar Defesa Civil para tempestade', ''],
      resources: ['Equipe de drenagem'],
    })
    assert.equal(drafts.length, 4)
    assert.equal(drafts.find((d) => d.source === 'alpha')?.priority, 'critica')
    assert.equal(drafts.find((d) => d.source === 'preditivo')?.sourceId, 'PRV-1')
    assert.ok(drafts.some((d) => d.actionText.includes('Defesa Civil')))
    assert.ok(drafts.some((d) => d.actionText.startsWith('Reforçar:')))
    assert.equal(inferAcaoPriorityFromText('Acionar Defesa Civil para tempestade'), 'critica')
  })
})
