export type LearnerDay = {
  date: string
  predicted: number
  observed: number
  windows: { id: string; predicted: number; observed: number }[]
}

const HIDDEN = 4
const EPOCHS = 180
const LEARNING_RATE = 0.05
const L2 = 0.001
const RELIABLE_DAYS = 60

export type NeuralMaturity = 'sem_base' | 'inicial' | 'em_formacao' | 'em_prova' | 'confiavel'

export type NeuralWindow = { id: string; label: string; predicted: number; observed: number }

export type NeuralHistoryDay = {
  date: string
  dateLabel: string
  whenLabel: string
  predicted: number
  observed: number
  windows: NeuralWindow[]
}

export type NeuralForecast = {
  maturity: NeuralMaturity
  maturityLabel: string
  closedDays: number
  formulaMae: number | null
  neuralMae: number | null
  canProvision: boolean
  hours: { id: string; label: string; hours: number; predicted: number | null }[]
  days: { date: string; label: string; predicted: number | null }[]
  history: NeuralHistoryDay[]
  note: string
}

type Net = {
  w1: number[][]
  b1: number[]
  w2: number[]
  b2: number
}

type Sample = { x: [number, number]; y: number; formula: number; short: boolean }

const MATURITY_LABEL: Record<NeuralMaturity, string> = {
  sem_base: 'Sem base',
  inicial: 'Inicial',
  em_formacao: 'Em formação',
  em_prova: 'Em prova',
  confiavel: 'Confiável',
}

export function projectNeural(input: {
  training: LearnerDay[]
  hours: { id: string; label: string; hours: number; predicted: number | null }[]
  days: { date: string; label: string; predicted: number | null }[]
  history: {
    date: string
    dateLabel: string
    whenLabel: string
    predicted: number
    observed: number
    windows: { id: string; label: string; predicted: number; observed: number }[]
  }[]
}): NeuralForecast {
  const closedDays = input.training.length
  const samples = samplesFrom(input.training)
  const trained = samples.train.length >= 12 ? train(samples.train) : null
  const displayNet = trained ?? initialNet()
  const formulaMae = mae(samples.proof, (row) => row.formula)
  const neuralMae = trained ? mae(samples.proof, (row) => predict(trained, row.x, row.formula)) : null
  const maturity = classify(closedDays, formulaMae, neuralMae)
  const predictCount = (formula: number | null, span: number) => {
    if (formula == null || !Number.isFinite(formula)) return null
    return Math.max(0, Math.round(predict(displayNet, features(formula, span), formula)))
  }

  return {
    maturity,
    maturityLabel: MATURITY_LABEL[maturity],
    closedDays,
    formulaMae,
    neuralMae,
    canProvision: maturity === 'confiavel',
    hours: input.hours.map((hour) => ({ ...hour, predicted: predictCount(hour.predicted, hour.hours) })),
    days: input.days.map((day) => ({ ...day, predicted: predictCount(day.predicted, 24) })),
    history: input.history.map((day) => ({
      date: day.date,
      dateLabel: day.dateLabel,
      whenLabel: day.whenLabel,
      predicted: predictCount(day.predicted, 24) ?? 0,
      observed: day.observed,
      windows: day.windows.map((window) => ({
        id: window.id,
        label: window.label,
        predicted: predictCount(window.predicted, spanOf(window.id)) ?? 0,
        observed: window.observed,
      })),
    })),
    note: noteFor(maturity),
  }
}

function classify(closedDays: number, formulaMae: number | null, neuralMae: number | null): NeuralMaturity {
  if (closedDays <= 0) return 'sem_base'
  if (closedDays < 14) return 'inicial'
  if (closedDays < RELIABLE_DAYS) return 'em_formacao'
  if (formulaMae == null || neuralMae == null) return 'em_prova'
  if (neuralMae <= formulaMae) return 'confiavel'
  return 'em_prova'
}

function noteFor(maturity: NeuralMaturity): string {
  if (maturity === 'sem_base') return 'Ainda não há dia fechado. A aba Previsões mostra um número só para olhar. Ele não entra na fila.'
  if (maturity === 'inicial') return 'A rede já vê alguns dias. O número ainda não se sustenta.'
  if (maturity === 'em_formacao') return 'A rede treina com os dias fechados. A prova ainda não cobre 60 dias.'
  if (maturity === 'em_prova') return 'Há 60 dias fechados. O erro da rede ainda está acima do da fórmula.'
  return 'O erro da rede está igual ou menor que o da fórmula. Dá para torná-la oficial.'
}

function samplesFrom(days: LearnerDay[]): { train: Sample[]; proof: Sample[] } {
  const holdoutCount = days.length <= 14 ? Math.max(1, Math.floor(days.length / 3)) : 14
  const holdout = new Set(days.slice(0, holdoutCount).map((day) => day.date))
  const train: Sample[] = []
  const proof: Sample[] = []
  for (const day of days) {
    const bucket = holdout.has(day.date) ? proof : train
    pushSample(bucket, day.predicted, day.observed, 24, false)
    for (const window of day.windows) {
      const span = spanOf(window.id)
      pushSample(bucket, window.predicted, window.observed, span, window.id === '1h' || window.id === '3h')
    }
  }
  return { train, proof: proof.filter((row) => row.short) }
}

function pushSample(bucket: Sample[], predicted: number, observed: number, span: number, short: boolean) {
  if (!Number.isFinite(predicted) || !Number.isFinite(observed)) return
  if (predicted <= 0 && observed <= 0) return
  bucket.push({ x: features(predicted, span), y: observed, formula: Math.max(predicted, 0), short })
}

function features(predicted: number, span: number): [number, number] {
  return [Math.log1p(Math.max(0, predicted)), Math.log1p(Math.max(1, span))]
}

function spanOf(id: string): number {
  const span = Number(id.replace(/h$/, ''))
  return Number.isFinite(span) && span > 0 ? span : 1
}

function mae(rows: Sample[], predictCount: (row: Sample) => number): number | null {
  if (rows.length === 0) return null
  const total = rows.reduce((sum, row) => sum + Math.abs(row.y - predictCount(row)), 0)
  return Math.round((total / rows.length) * 100) / 100
}

function initialNet(): Net {
  return {
    w1: [
      [0.2, -0.1],
      [-0.15, 0.25],
      [0.05, 0.18],
      [-0.22, 0.08],
    ],
    b1: [0.01, -0.01, 0.02, -0.02],
    w2: [0.15, -0.12, 0.1, -0.08],
    b2: Math.log(Math.E - 1),
  }
}

function train(rows: Sample[]): Net {
  const net = initialNet()
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const grad = zeroGrad()
    for (const row of rows) {
      accumulate(net, row.x, row.y, row.formula, grad)
    }
    const scale = LEARNING_RATE / rows.length
    for (let j = 0; j < HIDDEN; j++) {
      grad.b1[j] = clip(grad.b1[j]!)
      net.b1[j] = (net.b1[j] ?? 0) - scale * grad.b1[j]!
      grad.w2[j] = clip(grad.w2[j]! + L2 * (net.w2[j] ?? 0) * rows.length)
      net.w2[j] = (net.w2[j] ?? 0) - scale * grad.w2[j]!
      for (let k = 0; k < 2; k++) {
        grad.w1[j]![k] = clip(grad.w1[j]![k]! + L2 * (net.w1[j]![k] ?? 0) * rows.length)
        net.w1[j]![k] = (net.w1[j]![k] ?? 0) - scale * grad.w1[j]![k]!
      }
    }
    net.b2 -= scale * clip(grad.b2)
  }
  return net
}

function zeroGrad(): Net {
  return {
    w1: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    b1: [0, 0, 0, 0],
    w2: [0, 0, 0, 0],
    b2: 0,
  }
}

function accumulate(net: Net, x: [number, number], y: number, formula: number, grad: Net) {
  const pre = [0, 0, 0, 0]
  const hidden = [0, 0, 0, 0]
  let z = net.b2
  for (let j = 0; j < HIDDEN; j++) {
    pre[j] = (net.b1[j] ?? 0) + (net.w1[j]![0] ?? 0) * x[0] + (net.w1[j]![1] ?? 0) * x[1]
    hidden[j] = Math.tanh(pre[j]!)
    z += (net.w2[j] ?? 0) * hidden[j]!
  }
  const base = Math.max(formula, 0.25)
  const yhat = base * softplus(z)
  const dY = clip(1 - y / Math.max(yhat, 1e-6))
  const dz = clip(dY * base * sigmoid(z))
  grad.b2 += dz
  for (let j = 0; j < HIDDEN; j++) {
    grad.w2[j] = (grad.w2[j] ?? 0) + dz * hidden[j]!
    const dh = dz * (net.w2[j] ?? 0) * (1 - hidden[j]! * hidden[j]!)
    grad.b1[j] = (grad.b1[j] ?? 0) + dh
    grad.w1[j]![0] = (grad.w1[j]![0] ?? 0) + dh * x[0]
    grad.w1[j]![1] = (grad.w1[j]![1] ?? 0) + dh * x[1]
  }
}

function predict(net: Net, x: [number, number], formula: number): number {
  let z = net.b2
  for (let j = 0; j < HIDDEN; j++) {
    const pre = (net.b1[j] ?? 0) + (net.w1[j]![0] ?? 0) * x[0] + (net.w1[j]![1] ?? 0) * x[1]
    z += (net.w2[j] ?? 0) * Math.tanh(pre)
  }
  return Math.max(formula, 0.25) * softplus(z)
}

function softplus(z: number): number {
  if (z > 20) return z
  if (z < -20) return Math.exp(z)
  return Math.log1p(Math.exp(z))
}

function sigmoid(z: number): number {
  if (z > 20) return 1
  if (z < -20) return 0
  return 1 / (1 + Math.exp(-z))
}

function clip(value: number): number {
  if (value > 8) return 8
  if (value < -8) return -8
  return value
}
