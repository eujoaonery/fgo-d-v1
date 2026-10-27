import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { useOpsData } from '@/context/OpsDataContext'
import { useCityHref } from '@/context/TenantContext'
import {
  clearAlphaSession,
  createAlphaSession,
  fetchAlphaAnalyses,
  fetchAlphaAnalysis,
  fetchAlphaBoard,
  fetchAlphaSession,
  fetchAlphaSessions,
  runAlphaAnalysis,
  sendAlphaChat,
  type AlphaAnalysisKind,
  type AlphaAnalysisResult,
  type AlphaChatMessage,
  type AlphaSessionSummary,
} from '@/lib/api'
import { ALPHA_CLAIM_LABEL, type AlphaClaimKind, type AlphaRecommendationDraft } from '@/lib/prometheusAlpha'
import { formatDateTimePtBr, withPtBrDates } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/lib/routes'
import { AlphaCharts } from '@/pages/alpha/AlphaCharts'

const QUICK: { kind: AlphaAnalysisKind; label: string }[] = [
  { kind: 'tomorrow', label: 'Analisar amanhã' },
  { kind: 'next7d', label: 'Próximos 7 dias' },
  { kind: 'field_capacity', label: 'Agentes de campo' },
  { kind: 'operator_sla', label: 'Operadores e SLA' },
  { kind: 'climate_ops', label: 'Clima e operação' },
  { kind: 'operational_risk', label: 'Riscos operacionais' },
  { kind: 'region_demand', label: 'Demanda por região' },
  { kind: 'traffic', label: 'Analisar tráfego' },
]

const KIND_BAR: Record<AlphaClaimKind, string> = {
  fact: 'border-l-fogo-success',
  forecast: 'border-l-fogo-accent',
  trend: 'border-l-fogo-warning',
  model: 'border-l-fogo-accent',
  hypothesis: 'border-l-fogo-muted',
  recommendation: 'border-l-fogo-critical',
}

const sourceBadge = (status: string) =>
  status === 'ok' ? 'success' : status === 'unavailable' ? 'critical' : status === 'empty' ? 'neutral' : 'warning'

function recPriorityVariant(priority: string) {
  if (priority === 'critica' || priority === 'crítica') return 'critical' as const
  if (priority === 'alta') return 'warning' as const
  if (priority === 'media' || priority === 'média') return 'default' as const
  return 'neutral' as const
}

function recBar(priority: string) {
  if (priority === 'critica' || priority === 'crítica') return 'border-l-fogo-critical bg-fogo-critical-bg/30'
  if (priority === 'alta') return 'border-l-fogo-warning bg-fogo-warning-bg/25'
  return 'border-l-fogo-accent bg-fogo-accent/8'
}

function lastPackedAnalysis(messages: AlphaChatMessage[]): AlphaAnalysisResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].analysis) return messages[i].analysis ?? null
  }
  return null
}

export function PrometheusAlphaPage() {
  const { can } = useCcoAccess()
  const manage = can('prometheusAlpha', 'manage')
  const { apiConnected, apiStatus } = useOpsData()
  const href = useCityHref()
  const [board, setBoard] = useState<Awaited<ReturnType<typeof fetchAlphaBoard>> | null>(null)
  const [region, setRegion] = useState('')
  const [analysis, setAnalysis] = useState<AlphaAnalysisResult | null>(null)
  const [history, setHistory] = useState<{ id: string; kind: string; title: string; createdAt: string }[]>([])
  const [messages, setMessages] = useState<AlphaChatMessage[]>([])
  const [sessions, setSessions] = useState<AlphaSessionSummary[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLInputElement>(null)
  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = sessionId

  const loadBoard = useCallback(async () => {
    if (!apiConnected) return
    const [b, hist, sess, list] = await Promise.all([
      fetchAlphaBoard(),
      fetchAlphaAnalyses(12),
      fetchAlphaSession(sessionIdRef.current),
      fetchAlphaSessions(),
    ])
    setBoard(b)
    setHistory(hist.items)
    setSessionId(sess.sessionId)
    setMessages(sess.messages)
    setSessions(list.items)
  }, [apiConnected])

  useEffect(() => {
    const el = chatListRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, busy])

  useEffect(() => {
    void loadBoard().catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar o Alpha.'))
  }, [loadBoard])

  function cancel() {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(null)
  }

  async function run(kind: AlphaAnalysisKind) {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setBusy(kind)
    setError(null)
    try {
      const out = await runAlphaAnalysis({ kind, region: region || null }, ac.signal)
      setAnalysis(out.analysis)
      await loadBoard()
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Falha na análise.')
    } finally {
      setBusy(null)
    }
  }

  async function ask() {
    const text = draft.trim()
    if (text.length < 3) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setBusy('chat')
    setError(null)
    setDraft('')
    try {
      const out = await sendAlphaChat({ message: text, region: region || null, sessionId }, ac.signal)
      setSessionId(out.sessionId)
      setMessages(out.messages)
      setAnalysis(out.analysis)
      if (out.items) setSessions(out.items)
      draftRef.current?.focus()
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setDraft(text)
      setError(e instanceof Error ? e.message : 'Falha no chat.')
    } finally {
      setBusy(null)
    }
  }

  async function newConversation() {
    setError(null)
    try {
      const out = await createAlphaSession()
      setSessionId(out.sessionId)
      setMessages([])
      setAnalysis(null)
      setDraft('')
      setSessions(out.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar a conversa.')
    }
  }

  async function clearConversation() {
    if (!sessionId) return
    setError(null)
    try {
      await clearAlphaSession(sessionId)
      setMessages([])
      setAnalysis(null)
      setDraft('')
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: 'Nova conversa', messageCount: 0 } : s)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível limpar a conversa.')
    }
  }

  async function switchConversation(id: string) {
    if (!id || id === sessionId) return
    setError(null)
    try {
      const sess = await fetchAlphaSession(id)
      setSessionId(sess.sessionId)
      setMessages(sess.messages)
      setAnalysis(lastPackedAnalysis(sess.messages))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a conversa.')
    }
  }

  const currentRecs: AlphaRecommendationDraft[] = analysis?.recommendations ?? []
  const sessionOptions =
    sessionId && !sessions.some((s) => s.id === sessionId)
      ? [{ id: sessionId, title: 'Nova conversa', updatedAt: '', messageCount: messages.length }, ...sessions]
      : sessions

  return (
    <PageShell flush>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="fogo-glass shrink-0 border-b border-fogo-border/80 px-3 py-1.5 lg:px-4">
          <div className="fogo-scroll-subtle flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <select
              className="h-6 shrink-0 rounded-md border border-fogo-border bg-fogo-surface px-1.5 text-[11px]"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">Cidade inteira</option>
              {(board?.regions ?? []).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {QUICK.map((q) => (
              <Button key={q.kind} size="xs" variant="outline" className="shrink-0 whitespace-nowrap" disabled={busy !== null || !apiConnected} onClick={() => void run(q.kind)}>
                {busy === q.kind ? 'Executando…' : q.label}
              </Button>
            ))}
            {busy ? (
              <Button size="xs" variant="ghost" className="shrink-0" onClick={cancel}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </header>

        {error ? <p className="px-4 py-2 text-sm text-fogo-critical">{error}</p> : null}
        {apiStatus === 'offline' ? <p className="px-4 py-2 text-sm text-fogo-warning">API offline — Alpha indisponível.</p> : null}

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(320px,46%)_1fr]">
          <section className="flex min-h-0 flex-col border-r border-fogo-border/80">
            <div className="flex shrink-0 items-center gap-1.5 border-b border-fogo-border/60 px-3 py-1.5">
              <span className="shrink-0 text-[11px] font-medium">Conversa</span>
              {sessionOptions.length > 1 ? (
                <select
                  className="h-6 min-w-0 flex-1 rounded-md border border-fogo-border bg-fogo-surface px-1.5 text-[11px]"
                  value={sessionId ?? ''}
                  onChange={(e) => void switchConversation(e.target.value)}
                  disabled={busy !== null}
                >
                  {sessionOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="min-w-0 flex-1 truncate text-[11px] text-fogo-muted">
                  {sessionOptions[0]?.title ?? 'Nova conversa'}
                </span>
              )}
              <Button size="xs" variant="ghost" disabled={busy !== null || !apiConnected} onClick={() => void newConversation()}>
                Nova
              </Button>
              <Button size="xs" variant="ghost" disabled={busy !== null || messages.length === 0} onClick={() => void clearConversation()}>
                Limpar
              </Button>
            </div>
            <div ref={chatListRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-fogo-muted">
                  Pergunte como no plantão. Exemplos: preciso contratar mais agente de campo? Qual setor? Os operadores
                  estão cumprindo o SLA?
                </p>
              ) : (
                messages.map((m) => (
                  <article key={m.id} className={cn('rounded-md px-3 py-2 text-sm', m.role === 'user' ? 'bg-fogo-bg' : 'bg-fogo-surface border border-fogo-border/70')}>
                    <p className="text-[10px] text-fogo-muted">
                      {m.role === 'user' ? 'Você' : 'Alpha'} · {formatDateTimePtBr(m.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-fogo-text">{withPtBrDates(m.content)}</p>
                  </article>
                ))
              )}
              {busy === 'chat' ? <p className="text-sm text-fogo-muted">Consultando a operação…</p> : null}
            </div>
            <form
              className="flex shrink-0 items-center gap-2 border-t border-fogo-border/80 px-3 py-2"
              onSubmit={(e) => {
                e.preventDefault()
                void ask()
              }}
            >
              <input
                ref={draftRef}
                type="text"
                enterKeyHint="send"
                autoComplete="off"
                spellCheck
                className="h-10 min-w-0 flex-1 rounded-md border border-fogo-border bg-fogo-surface px-3 text-sm"
                placeholder="Pergunte sobre a operação, OS ou a previsão de alertas"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={busy !== null}
              />
              <Button type="submit" variant="primary" size="xs" disabled={busy !== null || draft.trim().length < 3}>
                {busy === 'chat' ? 'Consultando…' : 'Perguntar'}
              </Button>
            </form>
          </section>

          <section className="min-h-0 overflow-y-auto p-3 lg:p-4 space-y-4">
            {!analysis ? (
              <p className="text-sm text-fogo-muted">
                Escolha uma análise ou faça uma pergunta. Esta coluna mostra só o resultado dessa execução — a fila de
                decisão fica na aba Ação.
              </p>
            ) : (
              <>
                {currentRecs.length ? (
                  <OpsPanel title="Recomendações desta análise" subtitle="Desta execução. Substitui o resultado anterior.">
                    <ul className="divide-y divide-fogo-border/60">
                      {currentRecs.map((r, i) => (
                        <li key={`${r.category}-${i}`} className={cn('space-y-1 border-l-4 px-4 py-3', recBar(r.priority))}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={recPriorityVariant(r.priority)}>{r.priority}</Badge>
                            {r.region ? <span className="text-[11px] text-fogo-muted">{r.region}</span> : null}
                          </div>
                          <p className="text-sm font-medium text-fogo-text">{withPtBrDates(r.situation)}</p>
                          <p className="text-sm text-fogo-text">{withPtBrDates(r.actionText)}</p>
                        </li>
                      ))}
                    </ul>
                    {manage ? (
                      <p className="border-t border-fogo-border/60 px-4 py-2 text-xs text-fogo-muted">
                        Decidir na{' '}
                        <Link to={href(ROUTES.acao)} className="text-fogo-accent hover:underline">
                          aba Ação
                        </Link>
                        .
                      </p>
                    ) : null}
                  </OpsPanel>
                ) : null}

                <OpsPanel
                  title={analysis.title}
                  subtitle={`${withPtBrDates(analysis.period.label)}${analysis.region ? ` · ${analysis.region}` : ''} · ${formatDateTimePtBr(analysis.generatedAt)}`}
                >
                  <ul className="divide-y divide-fogo-border/60">
                    {analysis.claims.map((c, i) => (
                      <li key={`${c.title}-${i}`} className={cn('border-l-2 px-4 py-3', KIND_BAR[c.kind])}>
                        <p className="text-[10px] text-fogo-muted">{ALPHA_CLAIM_LABEL[c.kind]}</p>
                        <p className="text-sm font-medium">{withPtBrDates(c.title)}</p>
                        <p className="mt-0.5 text-sm text-fogo-muted">{withPtBrDates(c.body)}</p>
                        {c.confidenceNote ? <p className="mt-1 text-[11px] text-fogo-muted">{withPtBrDates(c.confidenceNote)}</p> : null}
                      </li>
                    ))}
                  </ul>
                  {analysis.limitations.length ? (
                    <div className="border-t border-fogo-border/60 px-4 py-3 text-xs text-fogo-muted">
                      {analysis.limitations.map((l) => (
                        <p key={l}>{withPtBrDates(l)}</p>
                      ))}
                    </div>
                  ) : null}
                </OpsPanel>

                {analysis.charts.length ? <AlphaCharts charts={analysis.charts} /> : null}

                <details className="overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-surface/95 shadow-fogo-card">
                  <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-fogo-muted marker:content-none [&::-webkit-details-marker]:hidden">
                    Fontes · {analysis.sources.length} (recolhido)
                  </summary>
                  <ul className="grid gap-2 border-t border-fogo-border/80 p-4 sm:grid-cols-2">
                    {analysis.sources.map((s) => (
                      <li key={s.key} className="rounded-md border border-fogo-border/70 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <Badge variant={sourceBadge(s.status)}>{s.status}</Badge>
                          <span className="font-medium">{s.label}</span>
                        </div>
                        <p className="mt-1 text-fogo-muted">{s.origin}</p>
                        <p className="text-fogo-muted">{s.lastUpdatedAt ? formatDateTimePtBr(s.lastUpdatedAt) : 'sem horário'}</p>
                        <p className="mt-1">{s.note}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}

            {history.length ? (
              <details className="overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-surface/95 shadow-fogo-card">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-fogo-muted marker:content-none [&::-webkit-details-marker]:hidden">
                  Análises anteriores · {history.length} (recolhido)
                </summary>
                <ul className="divide-y divide-fogo-border/60 border-t border-fogo-border/80">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-fogo-hover-elevated"
                        onClick={() => void fetchAlphaAnalysis(h.id).then(setAnalysis)}
                      >
                        <span>{withPtBrDates(h.title)}</span>
                        <span className="text-[11px] text-fogo-muted">{formatDateTimePtBr(h.createdAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        </div>
      </div>
    </PageShell>
  )
}
