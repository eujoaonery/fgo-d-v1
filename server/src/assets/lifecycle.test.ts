import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addDaysYmd,
  assessAssetLifecycle,
  lifecyclePriority,
  resolvePreventiveDue,
} from '../../../src/lib/assetLifecycle.js'

describe('ciclo de preventiva e vida útil', () => {
  it('calcula o próximo vencimento pelo último ciclo quando a data explícita falta', () => {
    const due = resolvePreventiveDue({
      id: 'SEM-1',
      name: 'Semáforo Centro',
      category: 'Semáforo inteligente',
      maintenanceLastDone: '2026-07-23',
      maintenanceIntervalDays: 30,
    })
    assert.equal(due, '2026-08-22')
  })

  it('semáforo com 60 dias de atraso estima indisponibilidade, acidente e prioridade crítica', () => {
    const today = '2026-10-22'
    const last = addDaysYmd(today, -(30 + 60))
    const a = assessAssetLifecycle(
      {
        id: 'SEM-2041',
        name: 'Semáforo Av. Sampaio Vidal',
        category: 'Semáforo inteligente',
        region: 'Centro',
        maintenanceLastDone: last,
        maintenanceIntervalDays: 30,
      },
      today,
    )
    assert.ok(a)
    assert.equal(a!.overdueDays, 60)
    assert.equal(a!.degradation, 'critica')
    assert.equal(lifecyclePriority(a!), 'critica')
    assert.ok(a!.unavailabilityRisk >= 0.5)
    assert.ok(a!.accidentRisk >= 0.35)
    assert.match(a!.narrative, /60 dia/)
    assert.match(a!.narrative, /indisponibilidade \d+%/)
    assert.match(a!.narrative, /acidentes \d+%/)
    assert.match(a!.narrative, /trânsito viário/)
  })

  it('viatura usa revisão preventiva e não inventa risco sem plano', () => {
    const none = assessAssetLifecycle({
      id: 'VTR-1',
      name: 'Viatura Norte',
      category: 'Viatura',
    })
    assert.equal(none, null)
    const a = assessAssetLifecycle(
      {
        id: 'VTR-1',
        name: 'Viatura Norte',
        category: 'Viatura',
        maintenanceNextDue: '2026-10-01',
      },
      '2026-10-22',
    )
    assert.ok(a)
    assert.equal(a!.vehicle, true)
    assert.match(a!.narrative, /revisão preventiva/)
  })

  it('vida útil vencida eleva degradação sem exigir preventiva', () => {
    const a = assessAssetLifecycle(
      {
        id: 'CAM-9',
        name: 'Câmera antiga',
        category: 'Câmera de vigilância',
        installedAt: '2016-01-01',
        usefulLifeMonths: 60,
      },
      '2026-10-22',
    )
    assert.ok(a)
    assert.ok((a!.remainingLifeDays ?? 0) < 0)
    assert.equal(a!.degradation, 'critica')
  })
})
