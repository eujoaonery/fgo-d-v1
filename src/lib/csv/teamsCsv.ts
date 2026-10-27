import type { Team } from '@/types'
import { escapeCsv } from '@/lib/csv/escape'

const HEADERS = [
  'id',
  'name',
  'specialty',
  'region',
  'status',
  'capabilities',
  'members',
  'mapX',
  'mapY',
  'registrationNumber',
  'responsibleOrg',
  'unit',
  'jobTitle',
  'qualifications',
  'functionalStatus',
] as const

export function teamsToCsv(teams: Team[]): string {
  const lines = [HEADERS.join(',')]
  for (const t of teams) {
    lines.push(
      [
        t.id,
        t.name,
        t.specialty,
        t.region,
        t.status,
        (t.capabilities ?? []).join('|'),
        (t.members ?? []).join('|'),
        t.mapX != null ? String(t.mapX) : '',
        t.mapY != null ? String(t.mapY) : '',
        t.registrationNumber ?? '',
        t.responsibleOrg ?? '',
        t.unit ?? '',
        t.jobTitle ?? '',
        (t.qualifications ?? []).join('|'),
        t.functionalStatus ?? 'ativo',
      ]
        .map((v) => escapeCsv(String(v)))
        .join(','),
    )
  }
  return lines.join('\n')
}

export function teamCsvTemplateRow(): string {
  return teamsToCsv([
    {
      id: 'AG-9001',
      name: 'Ana Silva',
      specialty: 'Câmeras e videomonitoramento',
      region: 'Centro',
      status: 'disponível',
      capabilities: ['cameras', 'transito'],
      members: [],
      mapX: 45,
      mapY: 55,
      registrationNumber: 'M-1001',
      responsibleOrg: 'SEMUTRAN',
      unit: 'CFTV',
      jobTitle: 'Técnica',
      qualifications: ['NR-10'],
      functionalStatus: 'ativo',
    },
  ])
}
