import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Incident, OperationalAlert, OperationalTeam } from '../types.js'
import {
  assignmentsFromUnsolved,
  buildSnapshot,
  classifyCrisisLevel,
  classifyUnsolved,
  mergeDeclaredCrisis,
  solutionForAlert,
} from './logic.js'
import { IDLE_CRISIS, UNATTENDED_CRITICAL_MS } from './types.js'

function alert(partial: Partial<OperationalAlert> & Pick<OperationalAlert, 'id' | 'category' | 'severity'>): OperationalAlert {
  return {
    title: 'Alerta teste',
    description: 'desc',
    source: 'teste',
    dataOrigin: 'simulado',
    detectedAt: new Date(Date.now() - UNATTENDED_CRITICAL_MS - 1_000).toISOString(),
    state: 'novo',
    region: 'Centro',
    ...partial,
  }
}

function team(partial: Partial<OperationalTeam> & Pick<OperationalTeam, 'id'>): OperationalTeam {
  return {
    name: partial.id,
    specialty: 'campo',
    capabilities: ['cameras'],
    members: ['A'],
    region: 'Centro',
    status: 'disponível',
    ...partial,
  }
}

describe('crisis logic', () => {
  it('marca crítico sem atendimento quando não há ocorrência', () => {
    const a = alert({ id: 'AL-1', category: 'CFTV', severity: 'crítica' })
    const teams = [team({ id: 'EQ-1', capabilities: ['cameras'] })]
    assert.equal(classifyUnsolved(a, teams, []), 'critico_sem_atendimento')
  })

  it('não marca como sem solução se equipe já está no incidente', () => {
    const a = alert({ id: 'AL-1', category: 'CFTV', severity: 'crítica', incidentId: 'OCR-1', state: 'em atendimento' })
    const inc: Incident = {
      id: 'OCR-1',
      description: 'x',
      type: 'Câmeras',
      region: 'Centro',
      priority: 'crítica',
      status: 'em atendimento',
      openedAt: new Date().toISOString(),
      location: 'Centro',
      dataOrigin: 'simulado',
      assignedTeamId: 'EQ-1',
      dataOrigin: 'simulado',
    }
    const teams = [team({ id: 'EQ-1', status: 'em campo', assignedIncidentId: 'OCR-1' })]
    assert.equal(classifyUnsolved(a, teams, [inc]), null)
  })

  it('sobe C → B → A conforme o volume sem solução', () => {
    assert.equal(
      classifyCrisisLevel({
        openAlerts: 4,
        resolvedAlerts: 1,
        unsolvedAlerts: 3,
        criticalUnsolved: 1,
        highUnsolved: 1,
        availableTeams: 8,
        regionsAffected: 1,
      }),
      'C',
    )
    assert.equal(
      classifyCrisisLevel({
        openAlerts: 8,
        resolvedAlerts: 0,
        unsolvedAlerts: 6,
        criticalUnsolved: 1,
        highUnsolved: 3,
        availableTeams: 3,
        regionsAffected: 2,
      }),
      'B',
    )
    assert.equal(
      classifyCrisisLevel({
        openAlerts: 16,
        resolvedAlerts: 0,
        unsolvedAlerts: 11,
        criticalUnsolved: 4,
        highUnsolved: 4,
        availableTeams: 1,
        regionsAffected: 4,
      }),
      'A',
    )
  })

  it('escala o popup quando o nível sobe', () => {
    const declared = mergeDeclaredCrisis(IDLE_CRISIS, 'C', {
      openAlerts: 3,
      resolvedAlerts: 0,
      unsolvedAlerts: 3,
      criticalUnsolved: 0,
      highUnsolved: 2,
      availableTeams: 4,
      regionsAffected: 1,
    })
    const acked = { ...declared, acknowledgedAt: new Date().toISOString() }
    const escalated = mergeDeclaredCrisis(acked, 'A', {
      ...acked.snapshot,
      unsolvedAlerts: 12,
      criticalUnsolved: 4,
      regionsAffected: 3,
    })
    assert.equal(escalated.level, 'A')
    assert.equal(escalated.acknowledgedAt, undefined)
    assert.equal(escalated.popupLevel, 'A')
  })

  it('escolhe equipe da mesma região e descreve solução real', () => {
    const a = alert({ id: 'AL-2', category: 'Tráfego', severity: 'alta', region: 'Leste' })
    const teams = [
      team({ id: 'EQ-CAM', capabilities: ['cameras'], region: 'Leste' }),
      team({ id: 'EQ-SEM', capabilities: ['semaforos'], region: 'Leste' }),
      team({ id: 'EQ-SEM-C', capabilities: ['semaforos'], region: 'Centro' }),
    ]
    const { unsolved } = buildSnapshot([a], teams, [])
    const assigned = assignmentsFromUnsolved(unsolved, teams, [])
    assert.equal(assigned[0]?.teamId, 'EQ-SEM')
    assert.match(solutionForAlert(a), /amarelo intermitente/)
  })
})
