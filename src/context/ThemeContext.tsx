import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'fogo-theme'

function readStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'dark'
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' ? 'light' : 'dark'
}

function applyThemeClass(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.style.colorScheme = mode
}

function persistTheme(mode: ThemeMode) {
  applyThemeClass(mode)
  localStorage.setItem(STORAGE_KEY, mode)
}

interface ThemeContextValue {
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme())

  useEffect(() => {
    applyThemeClass(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = useCallback((mode: ThemeMode) => {
    if (mode === theme) return
    persistTheme(mode)
    window.location.reload()
  }, [theme])

  const toggleTheme = useCallback(() => {
    persistTheme(theme === 'dark' ? 'light' : 'dark')
    window.location.reload()
  }, [theme])

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, isDark: theme === 'dark' }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
