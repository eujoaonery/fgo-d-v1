import type { OperationalTeam } from '../types.js'

export const seedTeams: OperationalTeam[] = [
  {
    id: 'EQ-A',
    name: 'Equipe Sinalização A',
    specialty: 'Semáforos e sinalização',
    capabilities: ['semaforos', 'transito'],
    members: ['Marcos Silva', 'Paula Rocha', 'Tiago Lima'],
    region: 'Centro',
    status: 'disponível',
    mapX: 55,
    mapY: 47,
  },
  {
    id: 'EQ-B',
    name: 'Equipe Infra B',
    specialty: 'Painéis e iluminação',
    capabilities: ['infra'],
    members: ['Juliana Costa', 'Renato Alves'],
    region: 'Zona Norte',
    status: 'disponível',
    mapX: 40,
    mapY: 28,
  },
  {
    id: 'EQ-C',
    name: 'Equipe Redes C',
    specialty: 'Conectividade urbana',
    capabilities: ['conectividade'],
    members: ['Felipe Mendes', 'Carla Dias', 'Bruno Nunes'],
    region: 'Leste',
    status: 'disponível',
    mapX: 62,
    mapY: 56,
  },
  {
    id: 'EQ-D',
    name: 'Equipe Sensores D',
    specialty: 'Sensores ambientais',
    capabilities: ['sensores'],
    members: ['Aline Ferreira', 'Gustavo Prado'],
    region: 'Zona Sul',
    status: 'disponível',
    mapX: 26,
    mapY: 64,
  },
  {
    id: 'EQ-E',
    name: 'Equipe CCO E',
    specialty: 'Câmeras e videomonitoramento',
    capabilities: ['cameras'],
    members: ['Roberta Campos', 'Henrique Vale'],
    region: 'Centro',
    status: 'disponível',
    mapX: 68,
    mapY: 70,
  },
  {
    id: 'EQ-PM',
    name: 'Equipe Polícia Militar',
    specialty: 'Policial militar',
    capabilities: ['transito'],
    members: [],
    region: 'Centro',
    status: 'disponível',
    responsibleOrg: 'Polícia Militar',
    jobTitle: 'Policial militar',
    functionalStatus: 'ativo',
  },
  {
    id: 'EQ-GM',
    name: 'Equipe Guarda Municipal',
    specialty: 'Guarda municipal',
    capabilities: ['transito'],
    members: [],
    region: 'Zona Norte',
    status: 'disponível',
    responsibleOrg: 'Guarda Municipal',
    jobTitle: 'Guarda municipal',
    functionalStatus: 'ativo',
  },
  {
    id: 'EQ-GT',
    name: 'Equipe Guarda de Trânsito',
    specialty: 'Guarda de trânsito',
    capabilities: ['transito'],
    members: [],
    region: 'Centro',
    status: 'disponível',
    responsibleOrg: 'Mobilidade',
    jobTitle: 'Guarda de trânsito',
    functionalStatus: 'ativo',
  },
]

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function coversMunicipalRole(team: Pick<OperationalTeam, 'name' | 'specialty' | 'responsibleOrg'>, role: 'pm' | 'gm' | 'gt') {
  const blob = fold(`${team.name} ${team.specialty} ${team.responsibleOrg ?? ''}`)
  if (role === 'pm') return blob.includes('policia') || blob.includes('policial')
  if (role === 'gm') return blob.includes('guarda municipal')
  return blob.includes('guarda de transito')
}
