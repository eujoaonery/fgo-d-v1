import { useMemo } from 'react'
import { useTheme } from '@/context/ThemeContext'

export type ChartTheme = {
  grid: string
  axis: string
  accent: string
  accentSoft: string
  success: string
  critical: string
  mutedLine: string
  radialTrack: string
  piePalette: string[]
  tick: { fontSize: number; fill: string }
  tooltip: {
    backgroundColor: string
    border: string
    color: string
    borderRadius: number
    fontSize: number
    boxShadow: string
  }
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export function readChartTheme(): ChartTheme {
  return {
    grid: cssVar('--fogo-chart-grid', '#3d465c'),
    axis: cssVar('--fogo-chart-axis', '#9ca3af'),
    accent: cssVar('--fogo-chart-accent', '#5eb8e8'),
    accentSoft: cssVar('--fogo-chart-accent-soft', '#2a5f7a'),
    success: cssVar('--fogo-chart-success', '#34d399'),
    critical: cssVar('--fogo-chart-critical', '#f87171'),
    mutedLine: cssVar('--fogo-chart-muted-line', '#64748b'),
    radialTrack: cssVar('--fogo-chart-radial-track', '#2a3140'),
    piePalette: [
      cssVar('--fogo-chart-accent', '#6ec4ef'),
      cssVar('--fogo-chart-success', '#34d399'),
      '#d97706',
      '#0891b2',
      cssVar('--fogo-chart-muted-line', '#64748b'),
    ],
    tick: { fontSize: 11, fill: cssVar('--fogo-chart-axis', '#9aa3b5') },
    tooltip: {
      backgroundColor: cssVar('--fogo-surface', '#1e2430'),
      border: `1px solid ${cssVar('--fogo-border', '#2d3548')}`,
      color: cssVar('--fogo-text', '#e8eaef'),
      borderRadius: 12,
      fontSize: 12,
      boxShadow: cssVar('--fogo-shadow-card', '0 4px 16px rgb(0 0 0 / 0.35)'),
    },
  }
}

/** Recharts consome cores inline — recalcular ao alternar tema. */
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme()
  return useMemo(() => readChartTheme(), [theme])
}
