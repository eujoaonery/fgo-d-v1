import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { useOpsData } from '@/context/OpsDataContext'
import { CADASTRAL_LABELS } from '@/lib/assetTruth'
import { isVehicleAsset } from '@/lib/assetLifecycle'
import { updateAsset } from '@/lib/api'
import type { CadastralStatus, Incident, UrbanAsset } from '@/types'

const FLEET_STATES: { id: CadastralStatus; label: string }[] = [
  { id: 'operacional', label: 'Disponível' },
  { id: 'em_uso', label: 'Em uso / em ocorrência' },
  { id: 'em_manutencao', label: 'Em manutenção' },
  { id: 'desativado', label: 'Indisponível' },
]

function fleetState(asset: UrbanAsset): (typeof FLEET_STATES)[number] {
  return FLEET_STATES.find((s) => s.id === asset.cadastralStatus) ?? FLEET_STATES[3]
}

function openOrders(asset: UrbanAsset, incidents: Incident[]): Incident[] {
  return incidents.filter(
    (i) => i.relatedAssetId === asset.id && i.status !== 'resolvida' && i.status !== 'cancelada',
  )
}

export function FleetPanel({ canManage }: { canManage: boolean }) {
  const { assets, incidents, refresh } = useOpsData()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const vehicles = useMemo(() => assets.filter((a) => isVehicleAsset(a.category)), [assets])
  const counts = useMemo(() => {
    const base = { operacional: 0, em_uso: 0, em_manutencao: 0, desativado: 0 }
    for (const vehicle of vehicles) {
      const state = fleetState(vehicle).id
      if (state === 'operacional' || state === 'em_uso' || state === 'em_manutencao') base[state] += 1
      else base.desativado += 1
    }
    return base
  }, [vehicles])

  async function setState(asset: UrbanAsset, cadastralStatus: CadastralStatus) {
    if (asset.cadastralStatus === cadastralStatus) return
    setBusyId(asset.id)
    setError(null)
    try {
      await updateAsset(asset.id, {
        cadastralStatus,
        cadastralJustification: 'Situação atualizada no controle de frota.',
      })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gravar a situação.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          ['Disponíveis', counts.operacional],
          ['Em uso', counts.em_uso],
          ['Em manutenção', counts.em_manutencao],
          ['Indisponíveis', counts.desativado],
        ].map(([label, value]) => (
          <Card key={label} className="px-3 py-2">
            <p className="text-[10px] text-fogo-muted">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-fogo-muted">
        Contagem apenas das viaturas, motos e demais veículos já cadastrados no inventário.
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {vehicles.length === 0 ? (
        <p className="py-8 text-center text-sm text-fogo-muted">
          Nenhuma viatura ou veículo cadastrado. O cadastro continua no inventário, nas categorias de viatura, moto ou ônibus.
        </p>
      ) : (
        <div className="overflow-auto rounded-fogo-lg border border-fogo-border bg-fogo-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-fogo-bg text-xs text-fogo-muted">
              <tr>
                <th className="px-3 py-2 text-left">Veículo</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Placa</th>
                <th className="px-3 py-2 text-left">Equipe / órgão</th>
                <th className="px-3 py-2 text-left">OS aberta</th>
                <th className="px-3 py-2 text-left">Situação</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => {
                const orders = openOrders(vehicle, incidents)
                return (
                  <tr key={vehicle.id} className="border-t border-fogo-border/70">
                    <td className="px-3 py-2">
                      <p className="font-medium">{vehicle.name}</p>
                      <p className="text-xs text-fogo-muted">
                        {[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || vehicle.subtype || '—'}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs">{vehicle.subtype || vehicle.category}</td>
                    <td className="px-3 py-2 font-mono text-xs">{vehicle.serialNumber || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {vehicle.responsibleTeam || '—'}
                      <span className="block text-fogo-muted">{vehicle.responsibleOrg || vehicle.region || ''}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{orders[0]?.description || orders[0]?.id || '—'}</td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <select
                          className="h-8 rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 text-xs"
                          value={fleetState(vehicle).id}
                          disabled={busyId === vehicle.id}
                          onChange={(e) => void setState(vehicle, e.target.value as CadastralStatus)}
                        >
                          {FLEET_STATES.map((state) => (
                            <option key={state.id} value={state.id}>
                              {state.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs">{CADASTRAL_LABELS[fleetState(vehicle).id]}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
