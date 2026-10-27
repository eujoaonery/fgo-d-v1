import type { AlphaAnalysisKind } from '../../../src/lib/prometheusAlpha.js'

function fold(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

export function classifyIntent(text: string): AlphaAnalysisKind {
  const t = fold(text)
  if (/recomendac|pendente de decis/.test(t)) return 'pending_recs'
  if (/\bsla\b|cumprimento|comprimento do sla|tempo de resposta|primeira resposta/.test(t)) return 'operator_sla'
  if (
    /eficienc.*operador|operadores? cco|equipe de operadores|plantao|expediente do cco|desempenho dos operadores/.test(t)
  ) {
    return 'operator_sla'
  }
  if (
    /agentes? de campo|equipe de campo|mais agentes|preciso (por|por|colocar|contratar) mais|dando conta|dao conta|dar conta|capacidade de campo|escala de campo|lotacao de agentes|sobrecarga de (campo|agentes)/.test(
      t,
    )
  ) {
    return 'field_capacity'
  }
  if (/trafego|transito|congestion|velocidade/.test(t)) return 'traffic'
  if (/clima e oper|relacao entre chuva|chuva.*ocorrenc/.test(t)) return 'climate_ops'
  if (/demanda por regiao|quais regioes|mais ocorrenc/.test(t)) return 'region_demand'
  if (/risco operacional|alertas ativos|indisponib/.test(t) && !/amanha/.test(t)) return 'operational_risk'
  if (/proximos?\s+7|sete dias|semana que vem/.test(t)) return 'next7d'
  if (/amanha|tempo as \d|previsao (do tempo|meteor)|inspecao preventiva/.test(t)) return 'tomorrow'
  if (/clima|chuva|tempestad|vento|meteor/.test(t)) return 'tomorrow'
  return 'chat'
}
