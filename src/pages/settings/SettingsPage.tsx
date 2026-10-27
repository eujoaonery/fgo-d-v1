import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCheck, MapPin, Radio, RefreshCw, RotateCcw, Timer, User } from 'lucide-react'
import { OpsHeader } from '@/components/layout/OpsHeader'
import { OpsTabBar } from '@/components/layout/OpsTabBar'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { useOpsData } from '@/context/OpsDataContext'
import type { SimulationIntensity } from '@/types'
import { cn } from '@/lib/cn'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { SettingsAlphaPanel } from '@/pages/settings/SettingsAlphaPanel'
import { SettingsQueuePanel } from '@/pages/settings/SettingsQueuePanel'
import { SettingsResetHistoryDialog } from '@/pages/settings/SettingsResetHistoryDialog'
import { SettingsSlaPanel } from '@/pages/settings/SettingsSlaPanel'
import { ProfileContent } from '@/pages/profile/ProfilePage'
import { canSeeCategorySla } from '@/lib/categorySla'
import {
  clampMonitoringIntervalSec,
  formatMonitoringInterval,
  MONITORING_TICK_MAX_SEC,
  MONITORING_TICK_MIN_SEC,
} from '@/lib/monitoringInterval'

const INTENSITY: { id: SimulationIntensity; label: string; hint: string }[] = [
  { id: 'low', label: 'Baixa', hint: 'Poucos eventos — operação estável' },
  { id: 'medium', label: 'Média', hint: 'Ritmo típico de plantão CCO' },
  { id: 'high', label: 'Alta', hint: 'Pico de alertas simulados — sem abrir OS automaticamente' },
]

type SettingsTab = 'conta' | 'alertas' | 'fila' | 'sla' | 'referencia'

function parseTab(raw: string | null, allowed: SettingsTab[]): SettingsTab {
  if (raw && allowed.includes(raw as SettingsTab)) return raw as SettingsTab
  return allowed[0] ?? 'conta'
}

export function SettingsPage() {
  const { profile } = useCcoAuth()
  const { can } = useCcoAccess()
  const realMode = profile?.tenant?.operationMode === 'real'
  const canSla = canSeeCategorySla({
    isPlatformSuperAdmin: profile?.isPlatformSuperAdmin,
    memberRole: profile?.actor?.role,
  })
  const canCity = can('prometheusAlpha', 'view') || can('settings', 'view')
  const { apiConnected, apiStatus, simulation, setSimulation, refresh, activity, resetMonitoringData } = useOpsData()
  const [params, setParams] = useSearchParams()
  const [resetting, setResetting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [intervalSec, setIntervalSec] = useState(60)
  const [intervalSaving, setIntervalSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const sim = simulation ?? { enabled: false, intensity: 'medium' as SimulationIntensity, tickIntervalMs: 60000, ticksTotal: 0 }
  const controlsDisabled = !apiConnected || realMode

  const tabs = useMemo(() => {
    const items: { id: SettingsTab; label: string; icon: typeof User }[] = [
      { id: 'conta', label: 'Conta', icon: User },
      { id: 'alertas', label: 'Motor de alertas', icon: Radio },
      { id: 'fila', label: 'Fila do CCO', icon: CheckCheck },
    ]
    if (canSla) items.push({ id: 'sla', label: 'Ajuste de SLA', icon: Timer })
    if (canCity) items.push({ id: 'referencia', label: 'Cidade de referência', icon: MapPin })
    return items
  }, [canCity, canSla])

  const allowed = tabs.map((t) => t.id)
  const tab = parseTab(params.get('aba'), allowed)

  function setTab(next: SettingsTab) {
    const nextParams = new URLSearchParams(params)
    if (next === 'conta') nextParams.delete('aba')
    else nextParams.set('aba', next)
    setParams(nextParams, { replace: true })
  }

  useEffect(() => {
    setIntervalSec(clampMonitoringIntervalSec(sim.tickIntervalMs / 1000))
  }, [sim.tickIntervalMs])

  async function savePatch(patch: { enabled?: boolean; intensity?: SimulationIntensity; tickIntervalMs?: number }) {
    setSaveError(null)
    try {
      await setSimulation(patch)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível salvar a configuração.'
      setSaveError(msg)
      throw e
    }
  }

  async function applyTickInterval() {
    const sec = clampMonitoringIntervalSec(intervalSec)
    setIntervalSec(sec)
    if (sec * 1000 === sim.tickIntervalMs) return
    setIntervalSaving(true)
    try {
      await savePatch({ tickIntervalMs: sec * 1000 })
    } catch {
      /* saveError já preenchido */
    } finally {
      setIntervalSaving(false)
    }
  }

  async function wipeOperationalHistory() {
    setResetting(true)
    try {
      await resetMonitoringData()
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OpsHeader dense />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-fogo-border/80 bg-fogo-surface/40 md:flex">
          <p className="px-4 pb-1 pt-4 text-[11px] font-medium text-fogo-muted">Configurações</p>
          <nav className="fogo-scroll-subtle flex-1 overflow-y-auto overflow-x-hidden px-2 py-2" aria-label="Seções de configurações">
            <ul className="space-y-0.5">
              {tabs.map((item) => {
                const Icon = item.icon
                const active = tab === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-fogo-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors duration-200',
                        active
                          ? 'fogo-gradient-panel text-fogo-accent shadow-fogo-card'
                          : 'text-fogo-muted hover:bg-fogo-hover-elevated hover:text-fogo-text',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
          <div className="mx-auto max-w-4xl">
            <OpsTabBar className="mb-4 md:hidden" aria-label="Seções de configurações">
              {tabs.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={tab === item.id ? 'primary' : 'outline'}
                  className={cn('shrink-0 whitespace-nowrap', tab !== item.id && 'bg-fogo-surface')}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </OpsTabBar>

            {apiStatus === 'offline' ? (
              <div className="mb-4 rounded-fogo-md border border-fogo-warning/50 bg-fogo-warning/10 px-4 py-3 text-sm text-fogo-text">
                Não foi possível carregar as configurações. Verifique sua sessão e a conexão com o serviço.
              </div>
            ) : null}

            {tab === 'fila' ? (
              <SettingsQueuePanel canManage={can('settings', 'manage')} apiConnected={apiConnected} />
            ) : null}

            {tab === 'conta' ? (
              <div className="mx-auto max-w-3xl">
                <ProfileContent queryKey="perfil" />
              </div>
            ) : null}

            {tab === 'alertas' ? (
              <div className="grid gap-4">
                <OpsPanel
                  title="Motor de alertas"
                  subtitle="Sensores, alertas e movimento operacional em tempo real"
                  action={
                    <Button variant="ghost" size="sm" disabled={!apiConnected} onClick={() => void refresh()}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Atualizar
                    </Button>
                  }
                >
                  <div className="flex flex-col gap-4 p-4">
                    {realMode ? (
                      <p className="rounded-fogo-md border border-fogo-border bg-fogo-bg px-3 py-2 text-xs text-fogo-muted">
                        Ambiente real: o servidor não gera alertas sintéticos. Apagar o histórico não liga o motor. Os
                        alertas desta cidade permanecem. A ausência de eventos indica que as fontes ainda não foram
                        configuradas.
                      </p>
                    ) : null}
                    {saveError ? (
                      <p className="rounded-fogo-md border border-fogo-warning/50 bg-fogo-warning/10 px-3 py-2 text-xs text-fogo-text">
                        {saveError}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-fogo-md border',
                            sim.enabled
                              ? 'border-fogo-success/50 bg-fogo-success/15 text-fogo-success'
                              : 'border-fogo-border bg-fogo-surface text-fogo-muted',
                          )}
                        >
                          <Radio className="h-5 w-5" aria-hidden />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-fogo-text">
                            {sim.enabled ? 'Motor ativo' : 'Motor pausado'}
                          </p>
                          <p className="text-xs text-fogo-muted">
                            {sim.enabled
                              ? 'A cidade está sendo acompanhada continuamente pelo CCO. Os alertas já registrados permanecem.'
                              : 'Iniciar continua de onde a cidade parou. O histórico de alertas permanece.'}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant={sim.enabled ? 'secondary' : 'primary'}
                        disabled={controlsDisabled}
                        onClick={() => {
                          const sec = clampMonitoringIntervalSec(intervalSec)
                          void savePatch({
                            enabled: !sim.enabled,
                            ...(!sim.enabled ? { tickIntervalMs: sec * 1000 } : {}),
                          }).catch(() => {})
                        }}
                      >
                        {sim.enabled ? 'Pausar motor' : 'Iniciar motor de alertas'}
                      </Button>
                    </div>

                    <fieldset className="space-y-2" disabled={controlsDisabled}>
                      <legend className="text-xs font-medium text-fogo-muted">Intensidade operacional</legend>
                      <p className="text-[11px] leading-relaxed text-fogo-muted">
                        Pode alterar com o motor pausado — vale no próximo ciclo.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {INTENSITY.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => void savePatch({ intensity: opt.id }).catch(() => {})}
                            className={cn(
                              'rounded-fogo-md border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50',
                              sim.intensity === opt.id
                                ? 'border-fogo-gradient-from bg-fogo-accent/10 text-fogo-text'
                                : 'border-fogo-border bg-fogo-surface/80 text-fogo-muted hover:border-fogo-border/80',
                            )}
                          >
                            <span className="font-medium">{opt.label}</span>
                            <span className="mt-0.5 block text-[11px] opacity-90">{opt.hint}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="space-y-2" disabled={controlsDisabled}>
                      <legend className="text-xs font-medium text-fogo-muted">Intervalo de atualização</legend>
                      <p className="text-[11px] leading-relaxed text-fogo-muted">
                        Frequência dos ciclos do motor (alertas, ocorrências, telemetria). Mínimo{' '}
                        {MONITORING_TICK_MIN_SEC} segundos — defina e clique em aplicar, ou inicie o motor que o valor
                        atual é gravado.
                      </p>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="block min-w-[140px] flex-1">
                          <span className="text-xs text-fogo-muted">A cada (segundos)</span>
                          <input
                            type="number"
                            min={MONITORING_TICK_MIN_SEC}
                            max={MONITORING_TICK_MAX_SEC}
                            step={1}
                            value={intervalSec}
                            onChange={(e) => setIntervalSec(Number(e.target.value))}
                            onBlur={() => void applyTickInterval()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void applyTickInterval()
                              }
                            }}
                            className="mt-1 h-10 w-full max-w-[160px] rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm tabular-nums"
                          />
                        </label>
                        <input
                          type="range"
                          min={MONITORING_TICK_MIN_SEC}
                          max={Math.min(300, MONITORING_TICK_MAX_SEC)}
                          step={1}
                          value={Math.min(intervalSec, 300)}
                          onChange={(e) => setIntervalSec(Number(e.target.value))}
                          onPointerUp={() => void applyTickInterval()}
                          onKeyUp={() => void applyTickInterval()}
                          className="h-2 min-w-[120px] flex-1 accent-fogo-accent"
                          aria-label="Intervalo em segundos (até 5 min no controle deslizante)"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={intervalSaving || intervalSec * 1000 === sim.tickIntervalMs}
                          onClick={() => void applyTickInterval()}
                        >
                          {intervalSaving ? 'Salvando…' : 'Aplicar intervalo'}
                        </Button>
                      </div>
                    </fieldset>

                    <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                      <div className="rounded-fogo-md border border-fogo-border/80 bg-fogo-bg/50 px-3 py-2">
                        <dt className="text-fogo-muted">Atualização</dt>
                        <dd className="font-semibold tabular-nums text-fogo-text">
                          a cada {formatMonitoringInterval(sim.tickIntervalMs / 1000)}
                        </dd>
                      </div>
                      <div className="rounded-fogo-md border border-fogo-border/80 bg-fogo-bg/50 px-3 py-2">
                        <dt className="text-fogo-muted">Última atualização</dt>
                        <dd className="font-semibold text-fogo-text">
                          {sim.lastTickAt ? new Date(sim.lastTickAt).toLocaleTimeString('pt-BR') : '—'}
                        </dd>
                      </div>
                      <div className="rounded-fogo-md border border-fogo-border/80 bg-fogo-bg/50 px-3 py-2">
                        <dt className="text-fogo-muted">Ativo desde</dt>
                        <dd className="font-semibold text-fogo-text">
                          {sim.startedAt ? new Date(sim.startedAt).toLocaleString('pt-BR') : '—'}
                        </dd>
                      </div>
                    </dl>

                    <div className="rounded-fogo-md border border-fogo-border/80 bg-fogo-bg/40 px-3 py-3">
                      <p className="text-sm font-medium text-fogo-text">Apagar histórico</p>
                      <p className="mt-1 text-xs leading-relaxed text-fogo-muted">
                        Opcional. Apaga alertas, ocorrências e o histórico de atividade. O motor inicia e pausa sem
                        isso. Cadastros da cidade permanecem no banco de dados.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        disabled={!apiConnected || resetting}
                        onClick={() => setResetOpen(true)}
                      >
                        <RotateCcw className={cn('mr-1.5 h-3.5 w-3.5', resetting && 'animate-spin')} aria-hidden />
                        {resetting ? 'Reiniciando…' : 'Zerar alertas e recomeçar'}
                      </Button>
                    </div>
                  </div>
                </OpsPanel>

                <SettingsResetHistoryDialog
                  open={resetOpen}
                  onClose={() => {
                    if (!resetting) setResetOpen(false)
                  }}
                  onReset={wipeOperationalHistory}
                />

                <OpsPanel title="Atividade recente" compact>
                  <ul className="max-h-64 divide-y divide-fogo-border/80 overflow-y-auto">
                    {activity
                      .slice()
                      .reverse()
                      .slice(0, 12)
                      .map((ev) => (
                        <li key={ev.id} className="px-3 py-2 text-xs">
                          <time className="tabular-nums text-fogo-muted">
                            {new Date(ev.timestamp).toLocaleTimeString('pt-BR')}
                          </time>
                          <span className="ml-2 text-fogo-text">{ev.message}</span>
                        </li>
                      ))}
                  </ul>
                </OpsPanel>
              </div>
            ) : null}

            {tab === 'sla' ? <SettingsSlaPanel enabled={canSla && apiConnected} /> : null}

            {tab === 'referencia' ? <SettingsAlphaPanel apiConnected={apiConnected} /> : null}
          </div>
        </main>
      </div>
    </div>
  )
}
