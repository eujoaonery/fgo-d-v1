export const CONNECTOR_KINDS = [
  'icmp',
  'tcp',
  'http',
  'rest',
  'webhook_in',
  'webhook_out',
  'mqtt',
  'snmp',
  'onvif',
  'rtsp',
  'file_import',
] as const

export type ConnectorKind = (typeof CONNECTOR_KINDS)[number]

export type ConnectorStatus = 'draft' | 'configured' | 'active' | 'paused' | 'error'
export type ConnectorHealth = 'unknown' | 'healthy' | 'degraded' | 'down'

export type AdapterResult = {
  ok: boolean
  result: string
  latencyMs?: number | null
  packetLoss?: number | null
  httpStatus?: number | null
  tlsOk?: boolean | null
  detail: Record<string, unknown>
  error?: string | null
  ingest?: IngestCandidate[]
}

export type IngestCandidate = {
  idempotencyKey: string
  eventType: string
  assetExternalId?: string | null
  occurredAt?: string | null
  payload: Record<string, unknown>
  metric?: { name: string; value: number | null; unit?: string | null }
}

export type ConnectorRecord = {
  id: string
  organizationId: string
  kind: ConnectorKind
  name: string
  description: string | null
  status: ConnectorStatus
  health: ConnectorHealth
  config: Record<string, unknown>
  secretId: string | null
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  metrics: Record<string, unknown>
  adapterVersion: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  hasSecret: boolean
}

export type ConnectorContext = {
  organizationId: string
  orgSlug: string
  connector: ConnectorRecord
  config: Record<string, unknown>
  secrets: Record<string, string>
  allowPrivate: boolean
  timeoutMs: number
}

export type ConnectorAdapter = {
  kind: ConnectorKind
  version: string
  test(ctx: ConnectorContext): Promise<AdapterResult>
  execute(ctx: ConnectorContext): Promise<AdapterResult>
}

export type CheckRecord = {
  id: string
  organizationId: string
  assetExternalId: string | null
  connectorId: string | null
  kind: string
  name: string
  config: Record<string, unknown>
  enabled: boolean
  lastRunAt: string | null
}

export const CONNECTOR_CATALOG: {
  kind: ConnectorKind
  label: string
  group: 'monitoramento' | 'ingestao'
  summary: string
  claims: string
}[] = [
  {
    kind: 'icmp',
    label: 'ICMP / Ping',
    group: 'monitoramento',
    summary: 'Alcance de rede do ativo autorizado.',
    claims: 'Não prova que a aplicação ou o serviço estejam funcionando.',
  },
  {
    kind: 'tcp',
    label: 'TCP',
    group: 'monitoramento',
    summary: 'Abertura de porta e tempo de conexão.',
    claims: 'Não prova que o serviço execute corretamente suas funções.',
  },
  {
    kind: 'http',
    label: 'HTTP / HTTPS',
    group: 'monitoramento',
    summary: 'Endpoint autorizado: código, latência, TLS e conteúdo esperado.',
    claims: 'Cabeçalhos e tokens de autenticação não são registrados.',
  },
  {
    kind: 'rest',
    label: 'API REST',
    group: 'ingestao',
    summary: 'Consulta periódica a um endpoint documentado, com mapeamento de campos.',
    claims: 'Somente o contrato configurado; não inventa APIs de terceiros.',
  },
  {
    kind: 'webhook_in',
    label: 'Webhook de entrada',
    group: 'ingestao',
    summary: 'Recebe eventos autenticados e os enfileira para processamento.',
    claims: 'O tenant vem da integração autorizada, nunca do corpo da requisição.',
  },
  {
    kind: 'webhook_out',
    label: 'Webhook de saída',
    group: 'ingestao',
    summary: 'Entrega assinada de eventos do F.O.G.O. a destinos autorizados.',
    claims: 'Destinos passam por proteção SSRF; redes internas exigem autorização de plataforma.',
  },
  {
    kind: 'mqtt',
    label: 'MQTT / IoT',
    group: 'ingestao',
    summary: 'Assina tópicos configurados em broker autorizado.',
    claims: 'Não descobre sensores automaticamente nem garante veracidade do payload.',
  },
  {
    kind: 'snmp',
    label: 'SNMP',
    group: 'monitoramento',
    summary: 'Consulta OIDs configurados. SNMPv3 preferido; v2c só por compatibilidade.',
    claims: 'Métricas ausentes ficam indisponíveis, não zero. Comunidade nunca é logada.',
  },
  {
    kind: 'onvif',
    label: 'Câmera ONVIF',
    group: 'monitoramento',
    summary: 'Consulta o serviço de gerenciamento ONVIF do equipamento.',
    claims: 'Resposta ONVIF não significa que há vídeo sendo transmitido.',
  },
  {
    kind: 'rtsp',
    label: 'Câmera RTSP',
    group: 'monitoramento',
    summary: 'Verifica acesso ao endpoint RTSP (OPTIONS), sem gravar o fluxo.',
    claims: 'Não declara transmissão de vídeo; URLs com credenciais são redigidas.',
  },
  {
    kind: 'file_import',
    label: 'Importação de arquivo',
    group: 'ingestao',
    summary: 'Recebe JSON ou CSV com mapeamento de campos e valida o esquema.',
    claims: 'Não cria ativos operacionais a partir de dispositivos desconhecidos.',
  },
]
