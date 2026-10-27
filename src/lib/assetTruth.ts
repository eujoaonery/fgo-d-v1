import { categoryHasOwnConnectivity } from '@/lib/assetCatalog'
import type { CadastralStatus, ConnectivityStatus, DataOrigin, UrbanAsset } from '@/types'

const CONNECTED_MS = 5 * 60_000
const LATE_MS = 30 * 60_000

export const CADASTRAL_LABELS: Record<CadastralStatus, string> = {
  operacional: 'Operacional (cadastro)',
  nao_instalado: 'Ainda não instalado',
  mau_funcionamento: 'Mau funcionamento',
  em_manutencao: 'Em manutenção',
  em_uso: 'Em uso / em ocorrência',
  desativado: 'Desativado',
  furtado: 'Furtado',
  baixado: 'Baixado / retirado',
}

export const CONNECTIVITY_LABELS: Record<ConnectivityStatus, string> = {
  conectado: 'Conectado',
  atrasado: 'Atrasado',
  sem_comunicacao: 'Sem comunicação',
  desconhecido: 'Desconhecido',
  nao_aplicavel: 'Não aplicável',
}

export const CADASTRAL_PIN_COLOR: Record<CadastralStatus, string> = {
  operacional: '#34d399',
  nao_instalado: '#94a3b8',
  mau_funcionamento: '#f97316',
  em_manutencao: '#eab308',
  em_uso: '#38bdf8',
  desativado: '#64748b',
  furtado: '#ef4444',
  baixado: '#78716c',
}

export const DATA_ORIGIN_LABELS: Record<DataOrigin, string> = {
  real: 'Dado real',
  integracao: 'Integração',
  importado: 'Importado',
  manual: 'Manual',
  simulado: 'Simulado',
}

export function normalizeConnectivity(raw?: string | null): ConnectivityStatus {
  switch (raw) {
    case 'online':
    case 'conectado':
      return 'conectado'
    case 'degradado':
    case 'atrasado':
      return 'atrasado'
    case 'offline':
    case 'sem_comunicacao':
      return 'sem_comunicacao'
    case 'nao_aplicavel':
      return 'nao_aplicavel'
    default:
      return 'desconhecido'
  }
}

export function normalizeCadastral(raw?: string | null): CadastralStatus {
  switch (raw) {
    case 'ativo':
    case 'operacional':
      return 'operacional'
    case 'em_instalacao':
    case 'nao_instalado':
      return 'nao_instalado'
    case 'mau_funcionamento':
      return 'mau_funcionamento'
    case 'em_manutencao':
      return 'em_manutencao'
    case 'em_uso':
      return 'em_uso'
    case 'furtado':
      return 'furtado'
    case 'baixado':
      return 'baixado'
    case 'desativado':
      return 'desativado'
    default:
      return 'operacional'
  }
}

export function normalizeDataOrigin(raw?: string | null): DataOrigin {
  if (raw === 'simulado' || raw === 'real' || raw === 'integracao' || raw === 'importado' || raw === 'manual') {
    return raw
  }
  return 'manual'
}

const CAD_WITHOUT_LINK: CadastralStatus[] = ['nao_instalado', 'desativado', 'baixado', 'furtado']

export function deriveConnectivity(
  asset: Pick<UrbanAsset, 'lastSeen' | 'cadastralStatus'> & { category?: string },
): ConnectivityStatus {
  if (asset.category && !categoryHasOwnConnectivity(asset.category)) return 'nao_aplicavel'
  const cad = normalizeCadastral(asset.cadastralStatus)
  if (CAD_WITHOUT_LINK.includes(cad)) return 'nao_aplicavel'
  const t = new Date(asset.lastSeen).getTime()
  if (!Number.isFinite(t)) return 'desconhecido'
  const age = Date.now() - t
  if (age <= CONNECTED_MS) return 'conectado'
  if (age <= LATE_MS) return 'atrasado'
  return 'sem_comunicacao'
}

export function connectivityTone(s: ConnectivityStatus): 'success' | 'warning' | 'critical' | 'neutral' {
  if (s === 'conectado') return 'success'
  if (s === 'atrasado') return 'warning'
  if (s === 'sem_comunicacao') return 'critical'
  return 'neutral'
}

export function cadastralTone(s: CadastralStatus): 'success' | 'warning' | 'critical' | 'neutral' {
  if (s === 'operacional') return 'success'
  if (s === 'em_manutencao' || s === 'mau_funcionamento' || s === 'nao_instalado') return 'warning'
  if (s === 'furtado' || s === 'baixado') return 'critical'
  return 'neutral'
}

export function originTone(o: DataOrigin): 'success' | 'warning' | 'critical' | 'neutral' | 'default' {
  if (o === 'simulado') return 'warning'
  if (o === 'real' || o === 'integracao') return 'success'
  if (o === 'importado') return 'default'
  return 'neutral'
}
