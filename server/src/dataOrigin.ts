import type { DataOrigin } from './types.js'

/**
 * Procedência de um sinal gerado pelo motor da cidade (ocorrência, plano, atividade).
 * Em demonstração não há fonte municipal real: o cadastro manual do ativo não torna o evento real.
 */
export function generatedSignalOrigin(
  db: { tenant?: { operationMode?: string } | null },
  assetOrigin?: string | null,
): DataOrigin {
  if (db.tenant?.operationMode !== 'real') return 'simulado'
  return assetOrigin === 'simulado' ? 'simulado' : 'real'
}
