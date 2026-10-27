import type { OperationalTeam } from '../types.js'
import type { TeamCapability } from '../teamCapabilities.js'

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

function escapeCsv(val: string): string {
  if (val.includes('"') || val.includes(',') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

export function teamsToCsv(teams: OperationalTeam[]): string {
  const lines = [HEADERS.join(',')]
  for (const t of teams) {
    lines.push(
      [
        t.id,
        t.name,
        t.specialty,
        t.region,
        t.status,
        t.capabilities.join('|'),
        t.members.join('|'),
        t.mapX != null ? String(t.mapX) : '',
        t.mapY != null ? String(t.mapY) : '',
        t.registrationNumber ?? '',
        t.responsibleOrg ?? '',
        t.unit ?? '',
        t.jobTitle ?? '',
        (t.qualifications ?? []).join('|'),
        t.functionalStatus ?? 'ativo',
      ]
        .map(escapeCsv)
        .join(','),
    )
  }
  return lines.join('\n')
}

function parseLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') inQuotes = false
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

export type TeamCsvRow = {
  id?: string
  name: string
  specialty: string
  region: string
  status?: OperationalTeam['status']
  capabilities?: TeamCapability[]
  members?: string[]
  mapX?: number
  mapY?: number
  registrationNumber?: string
  responsibleOrg?: string
  unit?: string
  jobTitle?: string
  qualifications?: string[]
  functionalStatus?: OperationalTeam['functionalStatus']
}

export function parseTeamsCsv(text: string): TeamCsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const header = parseLine(lines[0]!).map((h) => h.trim())
  const rows: TeamCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]!)
    const rec: Record<string, string> = {}
    header.forEach((h, idx) => {
      rec[h] = cols[idx]?.trim() ?? ''
    })
    if (!rec.name || !rec.specialty || !rec.region) continue
    rows.push({
      id: rec.id || undefined,
      name: rec.name,
      specialty: rec.specialty,
      region: rec.region,
      status: (rec.status as OperationalTeam['status']) || 'disponível',
      capabilities: rec.capabilities
        ? (rec.capabilities.split('|').filter(Boolean) as TeamCapability[])
        : [],
      members: rec.members ? rec.members.split('|').filter(Boolean) : [],
      mapX: rec.mapX ? Number(rec.mapX) : undefined,
      mapY: rec.mapY ? Number(rec.mapY) : undefined,
      registrationNumber: rec.registrationNumber || undefined,
      responsibleOrg: rec.responsibleOrg || undefined,
      unit: rec.unit || undefined,
      jobTitle: rec.jobTitle || undefined,
      qualifications: rec.qualifications ? rec.qualifications.split('|').filter(Boolean) : [],
      functionalStatus: (rec.functionalStatus as OperationalTeam['functionalStatus']) || 'ativo',
    })
  }
  return rows
}
