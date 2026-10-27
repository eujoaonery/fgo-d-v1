import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { speakFromAnalysis } from './chat.js'
import type { AlphaAnalysisResult } from '../../../src/lib/prometheusAlpha.js'

function result(over: Partial<AlphaAnalysisResult> & Pick<AlphaAnalysisResult, 'kind' | 'claims'>): AlphaAnalysisResult {
  return {
    title: 'Capacidade de campo',
    generatedAt: '2026-10-22T15:00:00.000Z',
    city: {
      cityName: 'Marília',
      uf: 'SP',
      lat: -22.2,
      lng: -49.9,
      timezone: 'America/Sao_Paulo',
      bbox: { south: 0, north: 0, west: 0, east: 0 },
      municipalHolidays: [],
      fromSettings: false,
      weatherPointNote: '',
    },
    region: null,
    period: { from: '2026-10-22', to: '2026-10-22', label: 'hoje' },
    charts: [],
    sources: [],
    limitations: [],
    recommendations: [],
    followUps: [],
    modelVersion: 'test',
    ...over,
  }
}

describe('speakFromAnalysis', () => {
  it('fala como plantão e não lista claims', () => {
    const text = speakFromAnalysis(
      result({
        kind: 'field_capacity',
        claims: [
          {
            kind: 'fact',
            title: 'Capacidade de agentes de campo',
            body: 'Os agentes atuais cobrem a fila neste recorte: 3 OS sem agente e 21 despacháveis.',
            sourceKeys: ['teams'],
          },
          {
            kind: 'fact',
            title: 'Folga na escala',
            body: 'Há folga na escala: 8 agente(s) disponível(is). Setores com pouco serviço agora: Zona Norte.',
            sourceKeys: ['teams'],
          },
        ],
      }),
      'preciso contratar mais agente de campo? qual setor?',
    )
    assert.match(text, /cobrem a fila|dão conta/i)
    assert.match(text, /folga|pouco serviço|nenhum setor/i)
    assert.doesNotMatch(text, /\[Fato\]/)
    assert.doesNotMatch(text, /• /)
    assert.match(text, /Nenhum setor pede contratação agora/)
  })

  it('responde a previsão de alertas de hoje com o número do motor', () => {
    const text = speakFromAnalysis(
      result({
        kind: 'chat',
        claims: [
          {
            kind: 'fact',
            title: 'Situação atual',
            body: '4 OS em aberto, 2 alerta(s) ativo(s).',
            sourceKeys: ['incidents'],
          },
          {
            kind: 'model',
            title: 'Previsão de alertas para hoje',
            body: 'Para hoje o Prevision Engine prevê 11 alerta(s). Já entraram 4.',
            sourceKeys: ['alerts'],
          },
        ],
      }),
      'qual a previsao de alerta pra hoje',
    )
    assert.match(text, /prevê 11/)
    assert.doesNotMatch(text, /4 OS em aberto/)
  })
})
