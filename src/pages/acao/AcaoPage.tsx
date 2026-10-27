import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { fetchAcoes, fetchOrgMembers, patchAcao, type AcaoRecord, type OrgMemberRecord } from '@/lib/api'
import {
  ACAO_PRIORITY_LABEL,
  ACAO_STATUS_LABEL,
  acaoPriorityRank,
  isAcaoOpen,
  type AcaoPriority,
  type AcaoStatus,
} from '@/lib/acao'
import { formatDateTimePtBr, withPtBrDates } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { useOpsData } from '@/context/OpsDataContext'

type Filter = 'abertas' | 'concluidas' | 'todas'
type ComposerMode = 'tomada' | 'delegada' | 'ignorada'

const PRIORITY_ORDER: AcaoPriority[] = ['critica', 'alta', 'media', 'baixa']

function priorityVariant(priority: AcaoPriority) {
  if (priority === 'critica') return 'critical' as const
  if (priority === 'alta') return 'warning' as const
  if (priority === 'media') return 'default' as const
  return 'neutral' as const
}

function statusVariant(status: AcaoStatus) {
  if (status === 'tomada') return 'success' as const
  if (status === 'ignorada') return 'neutral' as const
  if (status === 'delegada') return 'warning' as const
  return 'default' as const
}

function priorityBar(priority: AcaoPriority) {
  if (priority === 'critica') return 'border-l-fogo-critical bg-fogo-critical-bg/25'
  if (priority === 'alta') return 'border-l-fogo-warning bg-fogo-warning-bg/20'
  if (priority === 'media') return 'border-l-fogo-accent bg-fogo-accent/8'
  return 'border-l-fogo-muted bg-fogo-bg/40'
}

export function AcaoPage() {
  const { can } = useCcoAccess()
  const manage = can('acao', 'manage')
  const { apiConnected, apiStatus } = useOpsData()
  const [items, setItems] = useState<AcaoRecord[]>([])
  const [members, setMembers] = useState<OrgMemberRecord[]>([])
  const [filter, setFilter] = useState<Filter>('abertas')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [composer, setComposer] = useState<{ id: string; mode: ComposerMode } | null>(null)
  const [takenAction, setTakenAction] = useState('')
  const [ignoredReason, setIgnoredReason] = useState('')
  const [delegateName, setDelegateName] = useState('')
  const [delegateUserId, setDelegateUserId] = useState('')
  const activeMembers = useMemo(() => members.filter((m) => m.status !== 'inactive'), [members])

  const load = useCallback(async () => {
    if (!apiConnected) return
    setError(null)
    const [acoes, orgs] = await Promise.all([fetchAcoes(), fetchOrgMembers().catch(() => [] as OrgMemberRecord[])])
    setItems(acoes.items)
    setMembers(orgs)
  }, [apiConnected])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void load()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar ações.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load])

  const visible = useMemo(() => {
    const list = items.filter((item) => {
      if (filter === 'abertas') return isAcaoOpen(item.status)
      if (filter === 'concluidas') return !isAcaoOpen(item.status)
      return true
    })
    return [...list].sort((a, b) => {
      const pr = acaoPriorityRank(a.priority) - acaoPriorityRank(b.priority)
      if (pr !== 0) return pr
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [items, filter])

  const grouped = useMemo(() => {
    return PRIORITY_ORDER.map((priority) => ({
      priority,
      items: visible.filter((item) => item.priority === priority),
    })).filter((g) => g.items.length > 0)
  }, [visible])

  const openCount = items.filter((i) => isAcaoOpen(i.status)).length

  function resetComposer() {
    setComposer(null)
    setTakenAction('')
    setIgnoredReason('')
    setDelegateName('')
    setDelegateUserId('')
  }

  function openComposer(id: string, mode: ComposerMode) {
    setError(null)
    setComposer({ id, mode })
    setTakenAction('')
    setIgnoredReason('')
    setDelegateName('')
    setDelegateUserId('')
  }

  function applyMember(userId: string) {
    setDelegateUserId(userId)
    const found = members.find((m) => m.userId === userId)
    if (found) setDelegateName(found.displayName)
  }

  async function submit(item: AcaoRecord, status: AcaoStatus) {
    setBusyId(item.id)
    setError(null)
    try {
      const selected = members.find((m) => m.userId === delegateUserId)
      const name = delegateName.trim() || selected?.displayName || ''
      const { item: next } = await patchAcao(item.id, {
        status,
        takenAction: takenAction.trim() || undefined,
        ignoredReason: ignoredReason.trim() || undefined,
        delegatedToName: name || undefined,
        delegatedToUserId: selected && selected.displayName === name ? selected.userId : undefined,
      })
      setItems((prev) => prev.map((row) => (row.id === next.id ? next : row)))
      resetComposer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar a ação.')
    } finally {
      setBusyId(null)
    }
  }

  async function backToAnalisar(item: AcaoRecord) {
    setBusyId(item.id)
    setError(null)
    try {
      const { item: next } = await patchAcao(item.id, { status: 'analisar' })
      setItems((prev) => prev.map((row) => (row.id === next.id ? next : row)))
      resetComposer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar a ação.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fogo-muted">
            {openCount === 0
              ? 'Nada pendente agora. Quando a inteligência indicar algo a fazer, aparece aqui.'
              : `${openCount} ${openCount === 1 ? 'ação para tomar' : 'ações para tomar'}.`}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || !apiConnected}
            onClick={() =>
              void load().catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar ações.'))
            }
          >
            Atualizar
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['abertas', 'Abertas'],
              ['concluidas', 'Concluídas'],
              ['todas', 'Todas'],
            ] as const
          ).map(([id, label]) => (
            <Button key={id} size="sm" variant={filter === id ? 'primary' : 'outline'} onClick={() => setFilter(id)}>
              {label}
            </Button>
          ))}
        </div>

        {error ? <p className="text-sm text-fogo-critical">{error}</p> : null}
        {apiStatus === 'offline' ? <p className="text-sm text-fogo-warning">API offline — a fila de ações fica indisponível.</p> : null}
        {loading ? <p className="text-sm text-fogo-muted">Carregando o que precisa ser feito…</p> : null}

        {!loading && visible.length === 0 ? (
          <p className="rounded-fogo-lg border border-fogo-border bg-fogo-surface px-4 py-8 text-center text-sm text-fogo-muted">
            {filter === 'abertas'
              ? 'Nenhuma ação em aberto. Recomendações pendentes do Alpha, da inteligência preditiva e do painel estratégico entram nesta lista.'
              : 'Nenhuma ação neste filtro.'}
          </p>
        ) : null}

        {grouped.map((group) => (
          <section key={group.priority} className="space-y-2">
            <h2 className="px-0.5 text-xs font-semibold uppercase tracking-wide text-fogo-muted">
              Prioridade {ACAO_PRIORITY_LABEL[group.priority]} · {group.items.length}
            </h2>
            <ul className="space-y-2">
              {group.items.map((item) => {
                const open = isAcaoOpen(item.status)
                const composing = composer?.id === item.id ? composer.mode : null
                const busy = busyId === item.id
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'rounded-fogo-lg border border-fogo-border bg-fogo-surface p-4 shadow-fogo-card border-l-4',
                      priorityBar(item.priority),
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={priorityVariant(item.priority)}>{ACAO_PRIORITY_LABEL[item.priority]}</Badge>
                      <Badge variant={statusVariant(item.status)}>{ACAO_STATUS_LABEL[item.status]}</Badge>
                      <span className="text-[11px] text-fogo-muted">{item.originLabel}</span>
                      {item.region ? <span className="text-[11px] text-fogo-muted">{item.region}</span> : null}
                    </div>

                    <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-fogo-muted">O que fazer</p>
                    <p className="text-base font-semibold leading-snug text-fogo-text">{withPtBrDates(item.actionText)}</p>

                    <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-fogo-muted">Por quê</p>
                    <p className="text-sm text-fogo-text">{withPtBrDates(item.title)}</p>
                    {item.detail ? <p className="mt-1 text-sm text-fogo-muted">{withPtBrDates(item.detail)}</p> : null}

                    {item.status === 'delegada' && item.delegatedToName ? (
                      <p className="mt-2 text-sm text-fogo-text">Delegada para {item.delegatedToName}.</p>
                    ) : null}
                    {item.status === 'tomada' && item.takenAction ? (
                      <p className="mt-2 text-sm text-fogo-text">Ação tomada: {item.takenAction}</p>
                    ) : null}
                    {item.status === 'ignorada' && item.ignoredReason ? (
                      <p className="mt-2 text-sm text-fogo-muted">Motivo: {item.ignoredReason}</p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-fogo-muted">{formatDateTimePtBr(item.updatedAt)}</p>

                    {manage && open ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" disabled={busy} onClick={() => openComposer(item.id, 'tomada')}>
                            Ação tomada
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => openComposer(item.id, 'delegada')}>
                            Delegar
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => openComposer(item.id, 'ignorada')}>
                            Ignorar
                          </Button>
                          {item.status === 'delegada' ? (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void backToAnalisar(item)}>
                              Voltar para análise
                            </Button>
                          ) : null}
                        </div>

                        {composing === 'tomada' ? (
                          <div className="space-y-2 rounded-md border border-fogo-border/80 bg-fogo-bg/50 p-3">
                            <label className="text-xs font-medium text-fogo-text" htmlFor={`tomada-${item.id}`}>
                              Qual ação foi tomada?
                            </label>
                            <textarea
                              id={`tomada-${item.id}`}
                              className="h-20 w-full resize-none rounded-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
                              placeholder="Descreva o que foi feito"
                              value={takenAction}
                              onChange={(e) => setTakenAction(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" variant="primary" disabled={busy || takenAction.trim().length < 3} onClick={() => void submit(item, 'tomada')}>
                                Finalizar ação
                              </Button>
                              <Button size="sm" variant="ghost" onClick={resetComposer}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {composing === 'delegada' ? (
                          <div className="space-y-2 rounded-md border border-fogo-border/80 bg-fogo-bg/50 p-3">
                            <label className="text-xs font-medium text-fogo-text" htmlFor={`delegar-${item.id}`}>
                              Para quem?
                            </label>
                            <input
                              id={`delegar-${item.id}`}
                              className="h-8 w-full rounded-md border border-fogo-border bg-fogo-surface px-2 text-sm"
                              placeholder="Escreva qualquer nome"
                              value={delegateName}
                              onChange={(e) => {
                                setDelegateName(e.target.value)
                                const match = activeMembers.find(
                                  (m) => m.displayName.toLowerCase() === e.target.value.trim().toLowerCase(),
                                )
                                setDelegateUserId(match?.userId ?? '')
                              }}
                              list={`acao-members-${item.id}`}
                            />
                            <datalist id={`acao-members-${item.id}`}>
                              {activeMembers.map((m) => (
                                <option key={m.userId} value={m.displayName} />
                              ))}
                            </datalist>
                            {activeMembers.length ? (
                              <select
                                className="h-8 w-full rounded-md border border-fogo-border bg-fogo-surface px-2 text-sm"
                                value={delegateUserId}
                                onChange={(e) => applyMember(e.target.value)}
                              >
                                <option value="">Ou escolha um usuário da cidade</option>
                                {activeMembers.map((m) => (
                                  <option key={m.userId} value={m.userId}>
                                    {m.displayName}
                                    {m.email ? ` · ${m.email}` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <div className="flex gap-2">
                              <Button size="sm" variant="primary" disabled={busy || delegateName.trim().length < 2} onClick={() => void submit(item, 'delegada')}>
                                Marcar como delegada
                              </Button>
                              <Button size="sm" variant="ghost" onClick={resetComposer}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {composing === 'ignorada' ? (
                          <div className="space-y-2 rounded-md border border-fogo-border/80 bg-fogo-bg/50 p-3">
                            <label className="text-xs font-medium text-fogo-text" htmlFor={`ignorar-${item.id}`}>
                              Motivo
                            </label>
                            <textarea
                              id={`ignorar-${item.id}`}
                              className="h-20 w-full resize-none rounded-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
                              placeholder="Por que esta ação não será tomada"
                              value={ignoredReason}
                              onChange={(e) => setIgnoredReason(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" variant="primary" disabled={busy || ignoredReason.trim().length < 3} onClick={() => void submit(item, 'ignorada')}>
                                Finalizar ação
                              </Button>
                              <Button size="sm" variant="ghost" onClick={resetComposer}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </PageShell>
  )
}
