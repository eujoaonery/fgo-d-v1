import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isOccurrenceFinal,
  isOccurrencePending,
  isOccurrenceSlaClosed,
  occurrenceStateLabel,
  subjectSuggestsOsType,
} from '../../../src/lib/occurrenceState.js'

describe('occurrenceState', () => {
  it('pending vs final', () => {
    assert.equal(isOccurrencePending('novo'), true)
    assert.equal(isOccurrencePending('os_aberta'), false)
    assert.equal(isOccurrenceFinal('os_aberta'), true)
    assert.equal(isOccurrenceSlaClosed('os_aberta'), false)
    assert.equal(isOccurrenceSlaClosed('falso positivo'), true)
  })

  it('labels', () => {
    assert.equal(occurrenceStateLabel('os_aberta'), 'OS aberta')
    assert.equal(occurrenceStateLabel('falso positivo'), 'Alarme falso')
  })

  it('subject suggests type', () => {
    assert.equal(subjectSuggestsOsType('Manutenção preventiva de radar'), 'preventiva')
    assert.equal(subjectSuggestsOsType('Sinalizar via pública'), 'Trânsito')
  })
})
