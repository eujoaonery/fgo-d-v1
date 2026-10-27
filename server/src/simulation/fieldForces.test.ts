import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ALERT_TEMPLATES } from './templates.js'
import { capabilityForAlertCategory } from '../teamCapabilities.js'

describe('motor de ocorrências de campo', () => {
  it('emite polícia, guarda municipal e trânsito como ocorrência, sem amarrar ativo', () => {
    const rules = ['police.support', 'guard.municipal', 'traffic.guard']
    for (const rule of rules) {
      const tpl = ALERT_TEMPLATES.find((item) => item.rule === rule)
      assert.ok(tpl, rule)
      assert.equal(tpl.bindsAsset, false)
    }
  })

  it('encaminha essas categorias para trânsito, que é a habilitação das equipes de campo', () => {
    assert.equal(capabilityForAlertCategory('Polícia'), 'transito')
    assert.equal(capabilityForAlertCategory('Guarda municipal'), 'transito')
    assert.equal(capabilityForAlertCategory('Trânsito'), 'transito')
  })
})
