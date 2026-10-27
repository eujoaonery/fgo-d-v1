import {
  isAcaoOpen,
  type AcaoStatus,
} from '../../../src/lib/acao.js'

export type AcaoTransitionInput = {
  from: AcaoStatus
  to: AcaoStatus
  takenAction?: string
  ignoredReason?: string
  delegatedToName?: string
  delegatedToUserId?: string | null
  now?: string
}

export type AcaoTransitionFields = {
  status: AcaoStatus
  takenAction?: string | null
  ignoredReason?: string | null
  delegatedToName?: string | null
  delegatedToUserId?: string | null
  decidedAt?: string | null
}

export type AcaoTransitionResult =
  | { ok: true; fields: AcaoTransitionFields }
  | { ok: false; error: string }

function trimOrEmpty(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function applyAcaoTransition(input: AcaoTransitionInput): AcaoTransitionResult {
  const now = input.now ?? new Date().toISOString()

  if (input.from === input.to) {
    return { ok: false, error: 'A ação já está neste status.' }
  }

  if (!isAcaoOpen(input.from)) {
    return { ok: false, error: 'Ação já finalizada.' }
  }

  if (input.to === 'tomada') {
    const takenAction = trimOrEmpty(input.takenAction)
    if (takenAction.length < 3) {
      return { ok: false, error: 'Descreva a ação tomada.' }
    }
    return {
      ok: true,
      fields: {
        status: 'tomada',
        takenAction,
        decidedAt: now,
      },
    }
  }

  if (input.to === 'ignorada') {
    const ignoredReason = trimOrEmpty(input.ignoredReason)
    if (ignoredReason.length < 3) {
      return { ok: false, error: 'Informe o motivo para ignorar.' }
    }
    return {
      ok: true,
      fields: {
        status: 'ignorada',
        ignoredReason,
        decidedAt: now,
      },
    }
  }

  if (input.to === 'delegada') {
    const delegatedToName = trimOrEmpty(input.delegatedToName)
    if (delegatedToName.length < 2) {
      return { ok: false, error: 'Informe quem recebeu a ação.' }
    }
    const userId = trimOrEmpty(input.delegatedToUserId)
    return {
      ok: true,
      fields: {
        status: 'delegada',
        delegatedToName,
        delegatedToUserId: userId || null,
        decidedAt: now,
      },
    }
  }

  if (input.to === 'analisar') {
    if (input.from !== 'delegada') {
      return { ok: false, error: 'Só é possível voltar para análise a partir de uma ação delegada.' }
    }
    return {
      ok: true,
      fields: {
        status: 'analisar',
        delegatedToName: null,
        delegatedToUserId: null,
        decidedAt: null,
      },
    }
  }

  return { ok: false, error: 'Transição inválida.' }
}
