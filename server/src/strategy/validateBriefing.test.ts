import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { digestDeltas, sourceForCount } from './snapshot.js'
import { validatePrometheusBriefing, type PrometheusContext } from './validateBriefing.js'
import type { StrategySnapshot } from '../../../src/lib/strategy.js'

function ctx(partial?: Partial<PrometheusContext>): PrometheusContext {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    city: { name: 'Marília', lat: -22.21, lng: -49.94 },
    digest: {
      assetsTotal: 10,
      assetsOperational: 8,
      assetsUnavailable: 2,
      openWorkOrders: 1,
      criticalWorkOrders: 1,
      activeAlerts: 1,
      teamsAvailable: 3,
      teamsMobilized: 1,
      trafficIncidents: 0,
      weatherWarnings: 0,
      predictiveRisks: 1,
      actionsInProgress: 0,
      pendingApprovals: 0,
    },
    changesSinceLastBriefing: [],
    lastBriefingAt: null,
    indicators: [
      {
        key: 'alerts',
        label: 'Alertas',
        value: 1,
        items: [{ id: 'ALT-0001', title: 'Sensor offline', detail: 'Centro' }],
        source: sourceForCount({
          key: 'alerts',
          label: 'Alertas',
          origin: 'FOGO',
          count: 1,
          lastUpdatedAt: new Date().toISOString(),
          emptyNote: 'nenhum',
        }),
      },
    ],
    weatherForecast: null,
    weatherForecastSource: {
      key: 'open-meteo',
      label: 'Previsão',
      status: 'ok',
      origin: 'Open-Meteo',
      lastUpdatedAt: null,
      note: '',
    },
    weatherWarnings: [],
    weatherWarningsSource: {
      key: 'inmet',
      label: 'INMET',
      status: 'empty',
      origin: 'INMET',
      lastUpdatedAt: null,
      note: 'nenhum aviso',
    },
    trafficExternalSource: {
      key: 'ext',
      label: 'ext',
      status: 'unavailable',
      origin: 'n/a',
      lastUpdatedAt: null,
      note: '',
    },
    limitations: ['Feed externo de trânsito não integrado.'],
  } as StrategySnapshot
  return {
    snapshot,
    knownIds: ['ALT-0001', 'OS-0001', 'PRV-1'],
    knownRegions: ['Centro'],
    predictionProbabilities: [0.62],
    ...partial,
  }
}

describe('strategy snapshot sources', () => {
  it('distinguishes zero occurrences from missing data', () => {
    const empty = sourceForCount({
      key: 'os',
      label: 'OS',
      origin: 'FOGO',
      count: 0,
      lastUpdatedAt: '2026-01-01T00:00:00.000Z',
      emptyNote: 'Nenhuma ordem aberta.',
    })
    assert.equal(empty.status, 'empty')
    assert.match(empty.note, /Nenhuma ordem/)
  })

  it('computes digest deltas', () => {
    const prev = ctx().snapshot.digest
    const next = { ...prev, activeAlerts: prev.activeAlerts + 2 }
    const deltas = digestDeltas(prev, next)
    assert.equal(deltas.length, 1)
    assert.equal(deltas[0].field, 'activeAlerts')
    assert.equal(deltas[0].delta, 2)
  })
})

describe('prometheus validator', () => {
  it('rejects invented identifiers and certainty claims', () => {
    const { briefing, issues } = validatePrometheusBriefing(
      {
        executiveSummary: 'Há risco no Centro com base no alerta ALT-0001.',
        risks: [
          {
            title: 'Colapso certo',
            justification: 'O evento ocorrerá com certeza por causa de OS-9999.',
            horizon: '2h',
            confidence: 1,
          },
          {
            title: 'Sensor',
            justification: 'O alerta ALT-0001 permanece ativo no Centro.',
            horizon: 'prazo de resposta do alerta',
            confidence: 0.62,
          },
        ],
        preventiveRecommendations: ['Revisar ALT-0001 no Centro'],
        resourcesNeedingReinforcement: ['Equipe de sensores'],
        missingOrInconsistentData: ['Feed de trânsito externo indisponível'],
      },
      ctx(),
    )
    assert.ok(briefing)
    assert.equal(briefing.risks.length, 1)
    assert.equal(briefing.risks[0].title, 'Sensor')
    assert.equal(briefing.risks[0].confidence, 0.62)
    assert.ok(issues.some((i) => /certeza|Identificadores/i.test(i)))
  })

  it('drops unsupported confidence', () => {
    const { briefing } = validatePrometheusBriefing(
      {
        executiveSummary: 'Leitura do alerta ALT-0001 no Centro.',
        risks: [
          {
            title: 'Sensor',
            justification: 'Alerta ALT-0001 ativo no Centro.',
            horizon: 'hoje',
            confidence: 0.99,
          },
        ],
        preventiveRecommendations: [],
        resourcesNeedingReinforcement: [],
        missingOrInconsistentData: [],
      },
      ctx(),
    )
    assert.equal(briefing?.risks[0].confidence, null)
  })
})
