/** Texto operacional do alerta: causa → efeito. Acidente não é o alerta. */

const TITLE_REWRITE: Record<string, string> = {
  Acidente: 'Devido a acidente, obstrução de via',
  Engarrafamento: 'Devido a congestionamento, via lenta',
  'Cabos de telecom na via': 'Devido a cabos na pista, obstrução de via',
  'Sensor de alagamento': 'Devido a nível crítico no sensor, risco de alagamento',
  'Pico de eventos na região': 'Devido ao aumento de eventos, a região pode sobrecarregar',
  'Latência elevada Wi-Fi público': 'Devido à latência alta, o Wi-Fi público ficou instável',
  'Preventiva próxima do vencimento': 'Devido ao vencimento próximo, a preventiva pode atrasar',
  'Semáforo parou de comunicar': 'Devido à perda de comunicação, semáforo sem resposta',
  'Câmera sem imagem': 'Devido à falha de stream, câmera sem imagem',
  'Radar com defeito': 'Devido a falha no equipamento, radar sem leitura',
}

export function alertHeadline(title: string | null | undefined): string {
  const t = (title ?? '').trim()
  if (!t) return 'Ocorrência'
  if (TITLE_REWRITE[t]) return TITLE_REWRITE[t]
  if (/^acidente\b/i.test(t) && !/^devido/i.test(t)) return 'Devido a acidente, obstrução de via'
  return t
}

export function alertBody(alert: { title: string; description?: string; region?: string }): string {
  const headline = alertHeadline(alert.title)
  const desc = (alert.description ?? '').trim()
  if (/^acidente reportado/i.test(desc)) {
    const where = alert.region ? ` em ${alert.region}` : ''
    return `${headline}${where}. Encaminhar equipe de trânsito.`
  }
  return desc || headline
}
