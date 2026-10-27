import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitizeAssetSpecs, specDisplayRows, specKind } from '../../../src/lib/assetSpecs.js'

describe('características do equipamento', () => {
  it('reconhece câmera e radar e ignora os demais', () => {
    assert.equal(specKind('Câmera de vigilância'), 'camera')
    assert.equal(specKind('Radar de trânsito'), 'radar')
    assert.equal(specKind('Semáforo inteligente'), null)
  })

  it('guarda só os campos do tipo e descarta o resto', () => {
    assert.deepEqual(
      sanitizeAssetSpecs('Câmera de vigilância', {
        nightVision: true,
        resolution: '1080p',
        image: 'preto_e_branco',
        maxSpeedKmh: 60,
      }),
      { nightVision: true, resolution: '1080p', image: 'preto_e_branco' },
    )
    assert.deepEqual(sanitizeAssetSpecs('Radar de trânsito', { nightVision: true, maxSpeedKmh: 40.2 }), {
      maxSpeedKmh: 40,
    })
    assert.equal(sanitizeAssetSpecs('Radar de trânsito', { maxSpeedKmh: 0 }), undefined)
    assert.equal(sanitizeAssetSpecs('Totem de estacionamento', { nightVision: true }), undefined)
  })

  it('a ficha mostra não informado quando o campo está vazio', () => {
    const rows = specDisplayRows('Câmera de vigilância', {})
    assert.deepEqual(
      rows.map((row) => row.value),
      ['Não informado', 'Não informado', 'Não informado'],
    )
    assert.equal(specDisplayRows('Radar de trânsito', { maxSpeedKmh: 50 })[0]?.value, '50 km/h')
  })
})
