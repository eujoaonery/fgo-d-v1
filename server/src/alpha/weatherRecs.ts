import type {
  AlphaRecommendationDraft,
  DailyWeatherPoint,
  HourlyWeatherPoint,
} from '../../../src/lib/prometheusAlpha.js'
import { formatDatePtBr } from '../../../src/lib/format.js'

export type WeatherSeverity = 'none' | 'rain' | 'heavy_rain' | 'storm'

const RANK: Record<WeatherSeverity, number> = {
  none: 0,
  rain: 1,
  heavy_rain: 2,
  storm: 3,
}

const VIA80 =
  'Não realizar obras com interdição em vias de 80 km/h no período de chuva prevista.'
const DEFESA =
  'Mobilizar a equipe da Defesa Civil em prontidão para o período de tempestade prevista.'
const ALTURA =
  'Suspender trabalhos em altura e em estruturas expostas a raio até o fim da tempestade.'
const DRENAGEM =
  'Conferir pontos de drenagem e trechos com histórico de alagamento antes e durante o período chuvoso.'
const VENTO =
  'Inspecionar postes, árvores e sinalização nos trechos mais expostos a rajadas.'

export function classifyWeather(input: {
  weatherCode?: number | null
  condition?: string | null
  precipSumMm?: number | null
  precipProbPct?: number | null
  precipMm?: number | null
}): WeatherSeverity {
  const code = input.weatherCode ?? null
  const cond = (input.condition ?? '').toLowerCase()
  const mm = input.precipSumMm ?? input.precipMm ?? 0
  const prob = input.precipProbPct ?? 0

  if ((code != null && code >= 95) || /trovoada|tempestade/.test(cond)) return 'storm'
  if ((code != null && code >= 80 && code <= 82) || mm >= 10 || /chuva forte/.test(cond)) return 'heavy_rain'
  if ((code != null && code >= 51 && code <= 67) || mm >= 1 || (prob >= 40 && /chuva|garoa/.test(cond))) return 'rain'
  return 'none'
}

function worstOf(levels: WeatherSeverity[]): WeatherSeverity {
  return levels.reduce<WeatherSeverity>((best, cur) => (RANK[cur] > RANK[best] ? cur : best), 'none')
}

function labelFor(level: WeatherSeverity): string {
  if (level === 'storm') return 'tempestade'
  if (level === 'heavy_rain') return 'chuva forte'
  if (level === 'rain') return 'chuva'
  return 'tempo estável'
}

function datesPhrase(dates: string[]): string {
  const unique = [...new Set(dates)]
  if (unique.length === 1) return formatDatePtBr(unique[0])
  return unique.slice(0, 4).map((d) => formatDatePtBr(d)).join('; ')
}

function draft(
  partial: Omit<AlphaRecommendationDraft, 'generator' | 'uncertainties'> & { uncertainties?: string },
  generator: string,
): AlphaRecommendationDraft {
  return {
    uncertainties:
      partial.uncertainties ??
      'A previsão veio do modelo Open-Meteo em um ponto municipal; bairros e horários variam. Não substitui aviso oficial.',
    generator,
    ...partial,
  }
}

export function weatherOpsRecommendations(opts: {
  days: DailyWeatherPoint[]
  hourly?: HourlyWeatherPoint[]
  scheduledIds?: string[]
  region?: string | null
  generator: string
}): AlphaRecommendationDraft[] {
  const recs: AlphaRecommendationDraft[] = []
  const days = opts.days.filter(Boolean)
  if (!days.length && !opts.hourly?.length) return recs

  const dayLevels = days.map((d) => ({
    date: d.date,
    level: classifyWeather({
      weatherCode: d.weatherCode,
      condition: d.condition,
      precipSumMm: d.precipSumMm,
      precipProbPct: d.precipProbMaxPct,
    }),
    d,
  }))
  const hourLevels =
    opts.hourly?.map((h) => ({
      time: h.time,
      level: classifyWeather({
        weatherCode: h.weatherCode,
        condition: h.condition,
        precipMm: h.precipMm ?? h.rainMm,
        precipProbPct: h.precipProbPct,
      }),
      gust: h.gustKmh,
    })) ?? []

  const overall = worstOf([...dayLevels.map((x) => x.level), ...hourLevels.map((x) => x.level)])
  const wetDates = dayLevels.filter((x) => x.level !== 'none').map((x) => x.date)
  const stormDates = dayLevels.filter((x) => x.level === 'storm').map((x) => x.date)
  const heavyDates = dayLevels.filter((x) => x.level === 'heavy_rain' || x.level === 'storm').map((x) => x.date)
  const peakGust = Math.max(0, ...hourLevels.map((h) => h.gust ?? 0), 0)
  const region = opts.region ?? undefined
  const g = opts.generator
  const evidenceDays = days.slice(0, 7).map(
    (d) =>
      `${formatDatePtBr(d.date)}: ${d.condition}, ${d.precipSumMm ?? 'n/d'} mm, probabilidade ${d.precipProbMaxPct ?? 'n/d'}%`,
  )

  if (overall !== 'none') {
    const prio = overall === 'storm' ? 'critica' : overall === 'heavy_rain' ? 'alta' : 'media'
    recs.push(
      draft(
        {
          category: 'clima_via',
          priority: prio,
          region,
          situation: `Previsão de ${labelFor(overall)} — ${datesPhrase(wetDates.length ? wetDates : days.map((d) => d.date))}.`,
          evidence: evidenceDays,
          justification:
            'Chuva reduz atrito e visibilidade. Interdição em via de 80 km/h nesse cenário aumenta risco operacional e de acidentes.',
          actionText: VIA80,
          suggestedDeadline: wetDates[0] ?? days[0]?.date,
          expectedBenefit: 'Evita obra em via rápida sob chuva e reduz exposição de equipe e motoristas.',
        },
        g,
      ),
    )
  }

  if (overall === 'storm' || stormDates.length) {
    recs.push(
      draft(
        {
          category: 'defesa_civil',
          priority: 'critica',
          region,
          situation: `Previsão de tempestade — ${datesPhrase(stormDates.length ? stormDates : wetDates)}.`,
          evidence: evidenceDays,
          justification:
            'Trovoada e tempestade podem gerar alagamento, queda de árvore, falta de energia e chamado emergencial. O Alpha não aciona a Defesa Civil.',
          actionText: DEFESA,
          suggestedDeadline: stormDates[0] ?? wetDates[0],
          expectedBenefit: 'Prontidão municipal para atendimento se o evento se confirmar.',
        },
        g,
      ),
    )
    recs.push(
      draft(
        {
          category: 'clima_altura',
          priority: 'alta',
          region,
          situation: `Risco elétrico e de queda em tempestade — ${datesPhrase(stormDates.length ? stormDates : wetDates)}.`,
          evidence: evidenceDays,
          justification: 'Raio e vento associado a tempestade tornam trabalho em altura e em estrutura metálica inseguros.',
          actionText: ALTURA,
          suggestedDeadline: stormDates[0] ?? wetDates[0],
        },
        g,
      ),
    )
  }

  if (overall === 'heavy_rain' || overall === 'storm') {
    recs.push(
      draft(
        {
          category: 'clima_drenagem',
          priority: overall === 'storm' ? 'alta' : 'media',
          region,
          situation: `Previsão de ${labelFor(overall === 'storm' ? 'storm' : 'heavy_rain')} — ${datesPhrase(heavyDates.length ? heavyDates : wetDates)}.`,
          evidence: evidenceDays,
          justification: 'Volume previsto pode sobrecarregar drenagem superficial. Não afirma alagamento em bairro específico.',
          actionText: DRENAGEM,
          suggestedDeadline: heavyDates[0] ?? wetDates[0],
        },
        g,
      ),
    )
  }

  if (peakGust >= 55) {
    recs.push(
      draft(
        {
          category: 'clima_vento',
          priority: peakGust >= 75 ? 'alta' : 'media',
          region,
          situation: `Rajadas previstas de até ${Math.round(peakGust)} km/h.`,
          evidence: [`Rajada máxima na série horária: ${peakGust} km/h.`, ...evidenceDays.slice(0, 3)],
          justification: 'Vento forte pode derrubar galho, placa ou cabo. Inspeção é preventiva, não confirma dano.',
          actionText: VENTO,
          suggestedDeadline: days[0]?.date,
        },
        g,
      ),
    )
  }

  if (overall !== 'none' && (opts.scheduledIds?.length ?? 0) > 0) {
    recs.push(
      draft(
        {
          category: 'agenda',
          priority: overall === 'storm' ? 'alta' : 'media',
          region,
          situation: `${opts.scheduledIds!.length} OS já agendada(s) no período de ${labelFor(overall)}.`,
          evidence: opts.scheduledIds!.slice(0, 8),
          justification:
            'Há sobreposição entre agenda cadastrada e chuva prevista. Revisar interdições em via rápida e serviços a céu aberto.',
          actionText: 'Revisar as OS agendadas: adiar ou adaptar as que exigem interdição de via ou trabalho exposto à chuva.',
          suggestedDeadline: wetDates[0] ?? days[0]?.date,
        },
        g,
      ),
    )
  }

  return recs
}
