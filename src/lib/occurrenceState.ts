/** Estados em que a ocorrência sai da fila pendente. */
export const OCCURRENCE_FINAL_STATES = ['os_aberta', 'resolvido', 'falso positivo'] as const

export function isOccurrencePending(state: string | null | undefined): boolean {
  return state !== 'os_aberta' && state !== 'resolvido' && state !== 'falso positivo'
}

export function isOccurrenceFinal(state: string | null | undefined): boolean {
  return !isOccurrencePending(state)
}

/** SLA da ocorrência: fecha no CCO (resolvido/alarme falso). OS aberta continua o relógio até a OS concluir. */
export function isOccurrenceSlaClosed(state: string | null | undefined): boolean {
  return state === 'resolvido' || state === 'falso positivo'
}

export function occurrenceStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'novo':
      return 'Pendente'
    case 'reconhecido':
      return 'Reconhecido'
    case 'em atendimento':
      return 'Em atendimento'
    case 'em observação':
      return 'Em observação'
    case 'os_aberta':
      return 'OS aberta'
    case 'resolvido':
      return 'Resolvido'
    case 'falso positivo':
      return 'Alarme falso'
    default:
      return state || '—'
  }
}

export const DEFAULT_WORK_ORDER_SUBJECTS = [
  'Manutenção emergencial de radar',
  'Manutenção emergencial de semáforo',
  'Manutenção emergencial de câmeras',
  'Manutenção preventiva de radar',
  'Manutenção preventiva de semáforo',
  'Manutenção preventiva de câmeras',
  'Manutenção emergencial de sensor',
  'Manutenção preventiva de sensor',
  'Sinalizar via pública',
  'Acompanhar obras',
  'Desobstrução e limpeza de via pública',
  'Desobstrução de via — acidente',
  'Remoção de cabos na via',
  'Controle de engarrafamento',
  'Reparo de conectividade',
  'Inspeção de equipamento',
] as const

export function subjectSuggestsOsType(subject: string): string {
  const t = subject.toLowerCase()
  if (t.includes('preventiva')) return 'preventiva'
  if (t.includes('emergencial') || t.includes('defeito') || t.includes('reparo')) return 'corretiva'
  if (t.includes('inspeção') || t.includes('inspecao')) return 'inspeção'
  if (t.includes('câmera') || t.includes('camera')) return 'Câmeras'
  if (t.includes('semáforo') || t.includes('semaforo')) return 'Semáforos'
  if (t.includes('radar')) return 'Sensores'
  if (t.includes('conectividade')) return 'Conectividade'
  if (t.includes('via') || t.includes('acidente') || t.includes('engarraf') || t.includes('sinalizar')) return 'Trânsito'
  return 'corretiva'
}
