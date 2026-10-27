export type MonitorState = 'operational' | 'degraded' | 'unavailable' | 'unknown' | 'stale' | 'maintenance'

export type CheckOutcome = {
  ok: boolean
  result: string
  finishedAt: string
  latencyMs?: number | null
  kind: string
}

export type StateInput = {
  cadastral?: string | null
  consecutiveFailures: number
  failThreshold: number
  lastOkAt?: string | null
  lastCheckAt?: string | null
  staleAfterMs: number
  nowMs: number
  recent: CheckOutcome[]
}

export function computeMonitorState(input: StateInput): { state: MonitorState; reason: string } {
  const cad = (input.cadastral ?? '').toLowerCase()
  if (['em_manutencao', 'desativado', 'furtado', 'baixado', 'nao_instalado'].includes(cad)) {
    return { state: 'maintenance', reason: `Cadastro indica ${cad}; verificações de rede não substituem o estado cadastral.` }
  }
  if (!input.lastCheckAt && input.recent.length === 0) {
    return { state: 'unknown', reason: 'Nenhuma verificação executada ainda.' }
  }
  const lastCheck = input.lastCheckAt ? new Date(input.lastCheckAt).getTime() : 0
  if (lastCheck && input.nowMs - lastCheck > input.staleAfterMs) {
    return { state: 'stale', reason: 'Sem dados recentes de verificação dentro da janela configurada.' }
  }
  if (input.consecutiveFailures >= input.failThreshold && input.failThreshold > 0) {
    return {
      state: 'unavailable',
      reason: `${input.consecutiveFailures} falhas consecutivas (limite ${input.failThreshold}).`,
    }
  }
  const window = input.recent.slice(0, 8)
  const kinds = new Map<string, CheckOutcome[]>()
  for (const r of window) {
    const list = kinds.get(r.kind) ?? []
    list.push(r)
    kinds.set(r.kind, list)
  }
  const icmpOk = (kinds.get('icmp') ?? []).some((r) => r.ok)
  const appKinds = window.filter((r) => r.kind === 'http' || r.kind === 'tcp' || r.kind === 'onvif' || r.kind === 'rtsp')
  const appFailed = appKinds.length > 0 && appKinds.every((r) => !r.ok)
  if (icmpOk && appFailed) {
    return {
      state: 'degraded',
      reason: 'O equipamento responde ao ping, mas o serviço verificado (TCP/HTTP/ONVIF/RTSP) falhou.',
    }
  }
  if (window.some((r) => r.ok) && window.some((r) => !r.ok)) {
    return { state: 'degraded', reason: 'Resultados mistos na janela de avaliação.' }
  }
  if (window.length && window.every((r) => r.ok)) {
    return { state: 'operational', reason: 'Verificações recentes concluídas com sucesso.' }
  }
  if (window.length && window.every((r) => !r.ok)) {
    return { state: 'unavailable', reason: 'Todas as verificações recentes falharam.' }
  }
  return { state: 'unknown', reason: 'Não há evidência suficiente para classificar o ativo.' }
}
