export type WeatherTone = 'sol' | 'nublado' | 'vento' | 'chuva'

export const WEATHER_TONE_LABEL: Record<WeatherTone, string> = {
  sol: 'Ensolarado',
  nublado: 'Nublado',
  vento: 'Vento',
  chuva: 'Chuva',
}

export function weatherTone(input: {
  code?: number | null
  precipMm?: number | null
  windKmh?: number | null
  cloudPct?: number | null
}): WeatherTone {
  const code = input.code ?? -1
  const rainCode = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
  if (rainCode || (input.precipMm ?? 0) >= 0.2) return 'chuva'
  if ((input.windKmh ?? 0) >= 25) return 'vento'
  const clear = code === 0 || code === 1 || ((input.cloudPct ?? 100) < 25 && code >= 0 && code < 45)
  if (clear) return 'sol'
  return 'nublado'
}
