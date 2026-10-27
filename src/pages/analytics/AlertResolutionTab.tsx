import { useOpsData } from '@/context/OpsDataContext'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { alertHeadline } from '@/lib/alertCopy'

export function AlertResolutionTab() {
  const { alerts } = useOpsData()
  const open = alerts.filter((a) => a.state !== 'resolvido' && a.state !== 'falso positivo' && a.state !== 'os_aberta')
  const resolved = alerts.filter((a) => a.state === 'resolvido')
  const falsePos = alerts.filter((a) => a.state === 'falso positivo')
  const withOs = alerts.filter((a) => a.state === 'os_aberta')
  const attending = open.filter((a) => a.state === 'em atendimento')
  const ratio = alerts.length ? Math.round(((resolved.length + withOs.length) / alerts.length) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Stat label="Alertas abertos" value={open.length} warn={open.length > 0} />
        <Stat label="Em atendimento" value={attending.length} />
        <Stat label="Com OS aberta" value={withOs.length} />
        <Stat label="Resolvidos" value={resolved.length} />
        <Stat label="Taxa encaminhada" value={`${ratio}%`} />
      </div>

      <Card className="p-4">
        <p className="text-sm font-medium">Resolução operacional</p>
        <p className="mt-1 text-xs text-fogo-muted">
          O CCO resolve no plantão com relato ou abre uma ordem de serviço. A OS é sempre manual — nenhum motor fecha
          alerta sozinho.
        </p>
        {falsePos.length ? (
          <p className="mt-2 text-xs text-fogo-muted">{falsePos.length} alarme(s) falso(s) no recorte.</p>
        ) : null}
      </Card>

      <div className="overflow-x-auto rounded-fogo-lg border border-fogo-border bg-fogo-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-fogo-bg/70 text-xs text-fogo-muted">
            <tr>
              <th className="px-3 py-2 text-left">Alerta</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Região</th>
              <th className="px-3 py-2 text-left">Detectado</th>
            </tr>
          </thead>
          <tbody>
            {open.map((row) => (
              <tr key={row.id} className="border-t border-fogo-border">
                <td className="px-3 py-2">
                  <p className="font-medium">{alertHeadline(row.title)}</p>
                  <p className="font-mono text-[10px] text-fogo-accent">{row.id}</p>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={row.severity === 'crítica' ? 'critical' : 'warning'}>{row.state}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">{row.region ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-fogo-muted">{formatDateTime(row.detectedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {open.length === 0 ? (
          <p className="p-6 text-center text-sm text-fogo-muted">
            Nenhum alerta pendente agora. {resolved.length} resolvido(s), {withOs.length} com OS.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <Card className="fogo-glass px-3 py-2.5">
      <p className="text-[10px] text-fogo-muted">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', warn && 'text-fogo-critical')}>{value}</p>
    </Card>
  )
}
