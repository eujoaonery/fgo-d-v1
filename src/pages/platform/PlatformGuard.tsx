import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { fetchPlatformMe } from '@/lib/tenantApi'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { markSessionEstablished } from '@/lib/sessionExpiry'

export function PlatformGuard() {
  const location = useLocation()
  const [state, setState] = useState<'loading' | 'ok' | 'unauth' | 'forbidden'>('loading')

  useEffect(() => {
    let cancelled = false
    void fetchPlatformMe()
      .then(() => {
        if (!cancelled) {
          markSessionEstablished()
          setState('ok')
        }
      })
      .catch((e) => {
        if (cancelled) return
        const status = (e as Error & { status?: number }).status
        setState(status === 403 ? 'forbidden' : 'unauth')
      })
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  if (state === 'loading') {
    return <LoadScreen />
  }
  if (state === 'unauth') {
    return (
      <Navigate
        to="/mng/login"
        replace
        state={{ from: location.pathname }}
      />
    )
  }
  if (state === 'forbidden') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-fogo-bg px-4 text-center">
        <p className="text-sm font-medium text-fogo-text">Acesso restrito ao superadministrador</p>
        <p className="max-w-md text-sm text-fogo-muted">
          Administradores e operadores municipais não podem criar nem gerenciar outras cidades.
        </p>
        <a href="/" className="text-sm text-fogo-accent hover:underline">
          Voltar
        </a>
      </div>
    )
  }
  return <Outlet />
}
