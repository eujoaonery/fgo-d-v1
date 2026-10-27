import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { easterSunday, holidaysInRange } from './holidays.js'

describe('feriados Alpha', () => {
  it('Páscoa 2026 cai em 5 de abril', () => {
    assert.equal(easterSunday(2026).toISOString().slice(0, 10), '2026-04-05')
  })

  it('lista nacional, estadual SP e municipal no intervalo', () => {
    const list = holidaysInRange({ from: '2026-01-01', to: '2026-01-02', uf: 'SP', municipal: ['01-01'] })
    assert.ok(list.some((h) => h.name === 'Confraternização Universal' && h.scope === 'nacional'))
    assert.ok(list.some((h) => h.scope === 'municipal' && h.date === '2026-01-01'))
  })

  it('Carnaval 2026 (48 e 47 dias antes da Páscoa)', () => {
    const list = holidaysInRange({ from: '2026-02-14', to: '2026-02-18', uf: 'SP' })
    const carnival = list.filter((h) => h.name === 'Carnaval')
    assert.equal(carnival.length, 2)
    assert.ok(carnival.some((h) => h.date === '2026-02-16'))
    assert.ok(carnival.some((h) => h.date === '2026-02-17'))
  })
})
