import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  countNeighborhoodAlertsInWindow,
  isUsageEvent,
  neighborhoodRisks,
  observedUseRate,
  staffGaps,
  utilizationMoves,
} from './cityForecast.js'

const NOW = Date.parse('2026-10-26T15:00:00.000Z')
const DAY = 86_400_000

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 3600_000).toISOString()
}

describe('risco por bairro', () => {
  it('emite quando as 24 h passam de 1,4 vez a média de 7 dias', () => {
    const alerts = [
      ...Array.from({ length: 4 }, (_, i) => ({
        detectedAt: hoursAgo(24 * (i + 1)),
        neighborhood: 'Fragata',
        region: 'Sul',
        state: 'resolvido',
        category: 'Câmera',
      })),
      { detectedAt: hoursAgo(2), neighborhood: 'Fragata', region: 'Sul', state: 'novo', category: 'Câmera' },
      { detectedAt: hoursAgo(3), neighborhood: 'Fragata', region: 'Sul', state: 'novo', category: 'Câmera' },
      { detectedAt: hoursAgo(1), neighborhood: 'Centro', region: 'Centro', state: 'novo', category: 'Câmera' },
      { detectedAt: hoursAgo(1), neighborhood: '', region: 'Norte', state: 'novo', category: 'Câmera' },
    ]
    const rows = neighborhoodRisks(alerts, NOW)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.neighborhood, 'Fragata')
    assert.equal(rows[0]?.count24, 2)
    assert.ok((rows[0]?.baselineDaily ?? 0) > 0)
  })

  it('não emite com um único alerta', () => {
    const rows = neighborhoodRisks(
      [{ detectedAt: hoursAgo(1), neighborhood: 'Centro', region: 'Centro', state: 'novo', category: 'Radar' }],
      NOW,
    )
    assert.equal(rows.length, 0)
  })

  it('a avaliação conta só o bairro dentro do horizonte', () => {
    const alerts = [
      { detectedAt: hoursAgo(2), neighborhood: 'Fragata', region: 'Sul', state: 'novo', category: 'Câmera' },
      { detectedAt: hoursAgo(30), neighborhood: 'Fragata', region: 'Sul', state: 'novo', category: 'Câmera' },
      { detectedAt: hoursAgo(2), neighborhood: 'Centro', region: 'Centro', state: 'novo', category: 'Câmera' },
      { detectedAt: hoursAgo(1), neighborhood: 'Fragata', region: 'Sul', state: 'falso positivo', category: 'Câmera' },
    ]
    assert.equal(countNeighborhoodAlertsInWindow(alerts, 'Fragata', NOW - DAY, NOW), 1)
  })
})

describe('agentes que faltam', () => {
  it('desconta a oferta disponível e ignora quem já está em campo', () => {
    const gaps = staffGaps({
      alerts: [
        { region: 'Leste', severity: 'crítica', state: 'novo', hasOrder: false, category: 'Semáforo' },
        { region: 'Leste', severity: 'alta', state: 'novo', hasOrder: true, category: 'Semáforo' },
        { region: 'Leste', severity: 'média', state: 'novo', hasOrder: false, category: 'Semáforo' },
      ],
      orders: [
        { region: 'Leste', status: 'aberta' },
        { region: 'Leste', status: 'agendada' },
        { region: 'Leste', status: 'resolvida' },
      ],
      agents: [
        { region: 'Leste', status: 'disponível', functionalStatus: 'ativo' },
        { region: 'Leste', status: 'em campo', functionalStatus: 'ativo' },
        { region: 'Leste', status: 'disponível', functionalStatus: 'afastado' },
      ],
    })
    assert.equal(gaps.length, 1)
    assert.equal(gaps[0]?.demand, 3)
    assert.equal(gaps[0]?.supply, 1)
    assert.equal(gaps[0]?.gap, 2)
  })

  it('não emite quando a oferta cobre a fila', () => {
    const gaps = staffGaps({
      alerts: [],
      orders: [{ region: 'Norte', status: 'aberta' }],
      agents: [{ region: 'Norte', status: 'disponível' }],
    })
    assert.equal(gaps.length, 0)
  })
})

describe('utilização do equipamento', () => {
  it('marca queda, alta e ignora quem não tem a semana anterior', () => {
    const events = [
      ...Array.from({ length: 14 }, (_, i) => ({ assetId: 'CAM-1', occurredAt: new Date(NOW - 8 * DAY - i * 3600_000).toISOString() })),
      ...Array.from({ length: 2 }, (_, i) => ({ assetId: 'CAM-1', occurredAt: new Date(NOW - (i + 1) * 3600_000).toISOString() })),
      ...Array.from({ length: 7 }, (_, i) => ({ assetId: 'RAD-1', occurredAt: new Date(NOW - 10 * DAY + i * DAY).toISOString() })),
      ...Array.from({ length: 21 }, (_, i) => ({ assetId: 'RAD-1', occurredAt: new Date(NOW - 3 * DAY + i * 3600_000).toISOString() })),
      ...Array.from({ length: 5 }, (_, i) => ({ assetId: 'CAM-2', occurredAt: new Date(NOW - (i + 1) * 3600_000).toISOString() })),
    ]
    const moves = utilizationMoves(events, NOW)
    const cam = moves.find((row) => row.assetId === 'CAM-1')
    const rad = moves.find((row) => row.assetId === 'RAD-1')
    assert.equal(cam?.direction, 'caiu')
    assert.equal(rad?.direction, 'subiu')
    assert.equal(moves.some((row) => row.assetId === 'CAM-2'), false)
  })

  it('limita aos oito maiores desvios', () => {
    const events = []
    for (let n = 0; n < 10; n += 1) {
      for (let i = 0; i < 7; i += 1) {
        events.push({ assetId: `A-${n}`, occurredAt: new Date(NOW - 8 * DAY - i * 3600_000).toISOString() })
      }
    }
    assert.equal(utilizationMoves(events, NOW).length, 8)
  })

  it('a avaliação mede a média diária do horizonte', () => {
    const events = [
      { assetId: 'CAM-1', occurredAt: new Date(NOW - 2 * DAY).toISOString() },
      { assetId: 'CAM-1', occurredAt: new Date(NOW - 1 * DAY).toISOString() },
      { assetId: 'OUT', occurredAt: new Date(NOW - 1 * DAY).toISOString() },
    ]
    assert.equal(observedUseRate(events, 'CAM-1', NOW - 7 * DAY, NOW), 0.3)
  })

  it('não trata perda de sinal como uso', () => {
    assert.equal(isUsageEvent('frame_received'), true)
    assert.equal(isUsageEvent('radar_reading'), true)
    assert.equal(isUsageEvent('signal_loss'), false)
  })
})
