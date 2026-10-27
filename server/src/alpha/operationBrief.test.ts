import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { alertForecastSentence, openWorkOrdersClaim, activeAlertsClaim } from './operationBrief.js'
import type { AlphaContext } from './context.js'

describe('operation brief', () => {
  it('diz a previsão de alertas de hoje quando o motor tem número', () => {
    const text = alertForecastSentence({
      enabled: true,
      predictedToday: 14,
      observedToday: 6,
      hours: [{ label: 'Próxima 1 hora', predicted: 1 }],
      sampleSize: 80,
    })
    assert.match(text, /prevê 14 alerta/)
    assert.match(text, /Já entraram 6/)
    assert.match(text, /Próxima 1 hora: 1/)
  })

  it('não inventa número quando a previsão está desligada ou sem histórico', () => {
    assert.match(alertForecastSentence({
      enabled: false,
      predictedToday: 9,
      observedToday: 1,
      hours: [],
      sampleSize: 10,
    }), /desligada/)
    assert.match(alertForecastSentence({
      enabled: true,
      predictedToday: null,
      observedToday: null,
      hours: [],
      sampleSize: 3,
    }), /não sustenta um número/)
  })

  it('resume OS abertas e alertas ativos', () => {
    const ctx = {
      today: '2026-10-27',
      incidents: [
        {
          id: 'OS-1',
          type: 'corretiva',
          status: 'aberta',
          region: 'Centro',
          subjectLabel: 'Semáforo',
          scheduledStart: '2026-10-27T10:00:00',
        },
      ],
      alerts: [{ id: 'AL-1', state: 'novo', region: 'Centro', title: 'Fila no centro' }],
    } as unknown as AlphaContext
    const orders = openWorkOrdersClaim(ctx)
    assert.match(orders.body, /1 OS em aberto/)
    assert.match(orders.body, /OS-1/)
    assert.match(orders.body, /Agendadas para hoje: 1/)
    const alerts = activeAlertsClaim(ctx)
    assert.match(alerts.body, /1 alerta/)
    assert.match(alerts.body, /AL-1/)
  })
})
