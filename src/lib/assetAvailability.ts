/** Disponibilidade operacional §7.1.1 — exclui cadastro não instalado e baixado. */

export const AVAILABILITY_EXCLUDED_CADASTRAL = ['nao_instalado', 'em_instalacao', 'baixado'] as const

export function isExcludedFromAvailability(cadastralStatus?: string | null): boolean {
  const raw = (cadastralStatus ?? '').trim()
  return (
    raw === 'nao_instalado' ||
    raw === 'em_instalacao' ||
    raw === 'baixado'
  )
}

export function computeAvailability(
  assets: { status?: string | null; cadastralStatus?: string | null }[],
): {
  total: number
  eligible: number
  excluded: number
  operational: number
  alert: number
  inactive: number
  percent: number
} {
  const excluded = assets.filter((a) => isExcludedFromAvailability(a.cadastralStatus)).length
  const eligibleAssets = assets.filter((a) => !isExcludedFromAvailability(a.cadastralStatus))
  const operational = eligibleAssets.filter((a) => a.status === 'operacional').length
  const alert = eligibleAssets.filter((a) => a.status === 'alerta').length
  const inactive = eligibleAssets.filter((a) => a.status === 'inativo').length
  const eligible = eligibleAssets.length
  const percent = eligible ? Math.round((operational / eligible) * 1000) / 10 : 0
  return {
    total: assets.length,
    eligible,
    excluded,
    operational,
    alert,
    inactive,
    percent,
  }
}
