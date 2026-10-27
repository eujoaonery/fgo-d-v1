import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/Card'
import { ChartCard } from '@/components/charts/ChartCard'
import type { PredictiveAccuracy, PredictiveAccuracyTrack, PredictiveMetrics } from '@/lib/api'
import { useChartTheme } from '@/lib/chartTheme'
import { formatDateTime } from '@/lib/format'

function fmt(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

export function ModelEvaluationTab({
  metrics,
  accuracy,
}: {
  metrics?: PredictiveMetrics | null
  accuracy?: PredictiveAccuracy | null
}) {
  const chart = useChartTheme()
  const split = metrics?.chronological
  const calibration = (metrics?.calibration ?? []).map((b) => ({
    label: b.label,
    previsto: b.predictedMean != null ? Math.round(b.predictedMean * 1000) / 10 : null,
    observado: b.observedRate != null ? Math.round(b.observedRate * 1000) / 10 : null,
    count: b.count,
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Stat label="MAE" value={fmt(metrics?.mae)} hint="erro absoluto médio" />
        <Stat label="RMSE" value={fmt(metrics?.rmse)} hint="erro quadrático" />
        <Stat label="WAPE" value={fmt(metrics?.wape)} hint="em branco se observados = 0" />
        <Stat label="MAE linha de base" value={fmt(metrics?.baselineMae)} hint="período anterior" />
        <Stat
          label="Skill"
          value={metrics?.skillScore != null ? fmt(metrics.skillScore) : '—'}
          hint="1 − MAE/MAE base"
        />
        <Stat
          label="Cobertura do intervalo"
          value={fmt(metrics?.intervalCoverage)}
          hint="fração dos observados dentro do intervalo"
        />
      </div>

      {accuracy?.byHorizon && accuracy.byHorizon.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {accuracy.byHorizon.map((skill) => (
            <Card key={skill.id} className="p-3">
              <p className="text-[10px] text-fogo-muted">{skill.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {skill.scored === 0 || skill.utilization == null ? '—' : `${Math.round(skill.utilization * 100)}%`}
              </p>
              <p className="text-[11px] text-fogo-muted">
                {skill.scored === 0
                  ? 'Sem janela fechada fora do treino'
                  : `${skill.exact} acertos em ${skill.scored} · erro médio ${skill.mae ?? '—'}`}
              </p>
            </Card>
          ))}
        </div>
      ) : accuracy ? (
        <AccuracyLevels track={accuracy.alerts} />
      ) : null}

      <Card className="p-4">
        <h3 className="text-sm font-semibold">Treino e validação cronológica</h3>
        <p className="mt-1 text-xs text-fogo-muted">{split?.description}</p>
        {split ? (
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-fogo-muted">Treino</dt>
              <dd className="tabular-nums">
                {formatDateTime(split.trainFrom)} → {formatDateTime(split.trainTo)}
              </dd>
              <dd className="text-fogo-muted">
                {split.trainCount} previsões · {split.scoredTrain} com observado
              </dd>
            </div>
            <div>
              <dt className="text-fogo-muted">Validação</dt>
              <dd className="tabular-nums">
                {formatDateTime(split.validationFrom)} → {formatDateTime(split.validationTo)}
              </dd>
              <dd className="text-fogo-muted">
                {split.validationCount} previsões · {split.scoredValidation} com observado
              </dd>
            </div>
            <div>
              <dt className="text-fogo-muted">Partilha</dt>
              <dd>
                {Math.round(split.trainShare * 100)}% treino · {Math.round(split.validationShare * 100)}% validação
              </dd>
            </div>
            <div>
              <dt className="text-fogo-muted">Método</dt>
              <dd>Corte cronológico — sem embaralhar o tempo</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-xs text-fogo-muted">Métricas ainda não carregadas.</p>
        )}
      </Card>

      <ChartCard
        title="Calibração de probabilidade"
        description="Média prevista vs taxa observada (confirmou) em faixas de 20 pontos percentuais"
      >
        {calibration.every((b) => b.count === 0) ? (
          <p className="p-4 text-xs text-fogo-muted">Sem previsões com probabilidade para calibrar.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={calibration}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="label" tick={chart.tick} />
              <YAxis tick={chart.tick} domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={chart.tooltip} />
              <Legend />
              <Bar dataKey="previsto" name="Prob. média %" fill={chart.accent} radius={[4, 4, 0, 0]} />
              <Bar dataKey="observado" name="Taxa observada %" fill={chart.success} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <p className="text-xs text-fogo-muted">{metrics?.note}</p>
    </div>
  )
}

function AccuracyLevels({ track }: { track: PredictiveAccuracyTrack }) {
  const pct = track.utilization != null ? `${Math.round(track.utilization * 100)}%` : '—'
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">{track.label}</h3>
      <p className="mt-1 text-xs text-fogo-muted">
        Confrontado com o que o sistema já emitiu no período. Sem registro manual do CCO.
      </p>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{pct}</p>
      <p className="text-[11px] text-fogo-muted">aproveitamento em {track.scored} recorte(s)</p>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <div>
          <dt className="text-fogo-muted">Acerto</dt>
          <dd className="tabular-nums">{track.exact}</dd>
        </div>
        <div>
          <dt className="text-fogo-muted">Aproveit.</dt>
          <dd className="tabular-nums">{track.useful}</dd>
        </div>
        <div>
          <dt className="text-fogo-muted">Desvio</dt>
          <dd className="tabular-nums">{track.off}</dd>
        </div>
        <div>
          <dt className="text-fogo-muted">Erro</dt>
          <dd className="tabular-nums">{track.miss}</dd>
        </div>
      </dl>
    </Card>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-3 py-2.5">
      <p className="text-[10px] text-fogo-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-fogo-muted">{hint}</p> : null}
    </Card>
  )
}
