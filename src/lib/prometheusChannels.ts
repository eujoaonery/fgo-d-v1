export const PROMETHEUS_CHANNEL_DEFS = [
  {
    id: 'publicAlert',
    env: 'FOGO_PUBLIC_ALERT_WEBHOOK',
    secretKey: 'publicAlertWebhook',
    label: 'Alerta à população',
    hint: 'Webhook para a ação A — aviso à população',
  },
  {
    id: 'civilDefense',
    env: 'FOGO_CIVIL_DEFENSE_WEBHOOK',
    secretKey: 'civilDefenseWebhook',
    label: 'Defesa Civil',
    hint: 'Webhook para a ação B — convocação de unidades',
  },
  {
    id: 'teamNotify',
    env: 'FOGO_TEAM_NOTIFY_WEBHOOK',
    secretKey: 'teamNotifyWebhook',
    label: 'Equipes operacionais',
    hint: 'Webhook para a ação C — mobilização de equipes',
  },
  {
    id: 'trafficAgency',
    env: 'FOGO_TRAFFIC_AGENCY_WEBHOOK',
    secretKey: 'trafficAgencyWebhook',
    label: 'Órgão de trânsito',
    hint: 'Webhook para a ação D — pedido de intervenção',
  },
] as const

export type PrometheusChannelId = (typeof PROMETHEUS_CHANNEL_DEFS)[number]['id']

export function maskSecretHint(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const v = value.trim()
  if (v.length < 8) return '••••'
  return `${v.slice(0, 3)}…${v.slice(-4)}`
}
