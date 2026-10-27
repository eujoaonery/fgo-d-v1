import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge, priorityVariant } from '@/components/ui/Badge'
import { useOpsData } from '@/context/OpsDataContext'
import { ROUTES } from '@/lib/routes'
import { useCityHref } from '@/context/TenantContext'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { alertBody, alertHeadline } from '@/lib/alertCopy'
import type { AlertSeverity, OperationalAlert } from '@/types'

const CLOSED_STATES = new Set<OperationalAlert['state']>(['resolvido', 'falso positivo', 'os_aberta'])

function severityRank(s: AlertSeverity): number {
  const order: AlertSeverity[] = ['crítica', 'alta', 'média', 'baixa', 'informativa']
  return order.indexOf(s)
}

export function OpsNotificationBell() {
  const navigate = useNavigate()
  const href = useCityHref()
  const { alerts } = useOpsData()
  const [open, setOpen] = useState(false)
  const [ring, setRing] = useState(false)
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set())
  const rootRef = useRef<HTMLDivElement>(null)
  const knownIds = useRef<Set<string> | null>(null)

  const openAlerts = useMemo(
    () =>
      alerts
        .filter((a) => !CLOSED_STATES.has(a.state))
        .sort(
          (a, b) =>
            severityRank(a.severity) - severityRank(b.severity) ||
            new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
        ),
    [alerts],
  )

  useEffect(() => {
    const ids = alerts.map((a) => a.id)
    if (knownIds.current === null) {
      knownIds.current = new Set(ids)
      return
    }
    const incoming = alerts.filter((a) => !knownIds.current!.has(a.id))
    knownIds.current = new Set(ids)
    if (incoming.length === 0) return

    setUnreadIds((prev) => {
      const next = new Set(prev)
      for (const a of incoming) next.add(a.id)
      return next
    })
    setRing(true)
    const t = window.setTimeout(() => setRing(false), 2400)
    return () => window.clearTimeout(t)
  }, [alerts])

  useEffect(() => {
    if (!open) return
    setRing(false)
    setUnreadIds(new Set())
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const badgeCount = openAlerts.length
  const hasUnread = unreadIds.size > 0

  function openAlert(_alert: OperationalAlert) {
    setOpen(false)
    navigate(href(ROUTES.alerts))
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={
          badgeCount > 0
            ? `Notificações, ${badgeCount} alerta${badgeCount === 1 ? '' : 's'} aberto${badgeCount === 1 ? '' : 's'}`
            : 'Notificações'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell
          className={cn('h-4 w-4 origin-top', ring && 'fogo-bell-ring', hasUnread && !open && 'text-fogo-critical')}
          aria-hidden
        />
        {badgeCount > 0 ? (
          <span
            className={cn(
              'absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white',
              hasUnread && !open ? 'bg-fogo-critical fogo-badge-pulse' : 'bg-fogo-critical',
            )}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Alertas recentes"
          className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-surface shadow-[var(--shadow-fogo-panel)]"
        >
          <div className="border-b border-fogo-border/80 px-3 py-2.5">
            <p className="text-xs font-semibold text-fogo-text">Alertas operacionais</p>
            <p className="text-[10px] text-fogo-muted">
              {badgeCount === 0 ? 'Nenhum alerta aberto no momento' : `${badgeCount} em aberto`}
            </p>
          </div>
          <ul className="max-h-[min(50vh,320px)] overflow-y-auto divide-y divide-fogo-border/80">
            {openAlerts.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-fogo-muted">Tudo tranquilo por aqui.</li>
            ) : (
              openAlerts.slice(0, 8).map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-fogo-bg/80',
                      unreadIds.has(alert.id) && 'bg-fogo-critical-bg/40',
                    )}
                    onClick={() => openAlert(alert)}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium leading-snug text-fogo-text">{alertHeadline(alert.title)}</span>
                      <Badge
                        variant={priorityVariant(
                          alert.severity === 'informativa' ? 'baixa' : alert.severity === 'média' ? 'média' : alert.severity,
                        )}
                        className="shrink-0"
                      >
                        {alert.severity}
                      </Badge>
                    </span>
                    <span className="line-clamp-2 text-[10px] text-fogo-muted">{alertBody(alert)}</span>
                    <span className="text-[10px] tabular-nums text-fogo-muted">{formatDateTime(alert.detectedAt)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-fogo-border/80 bg-fogo-bg/50 px-3 py-2">
            <Link
              to={href(ROUTES.alerts)}
              className="text-xs font-medium text-fogo-accent hover:underline"
              onClick={() => setOpen(false)}
            >
              Ver todos os alertas
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
