/** Ocorrência operacional da cidade ou de um ativo. Aviso de fila, ingestão ou integração fica de fora. */
export function isSystemOccurrence(input: {
  category?: string | null
  rule?: string | null
}): boolean {
  const category = (input.category ?? '').trim().toLowerCase()
  const rule = (input.rule ?? '').trim().toLowerCase()
  if (category === 'integração' || category === 'integracao') return true
  return rule.startsWith('integration.')
}
