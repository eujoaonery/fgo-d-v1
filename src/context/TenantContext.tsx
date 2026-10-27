import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { cityPath } from '@/lib/tenant'
import { readRememberedTenantSlug, rememberTenantSlug, setApiTenantSlug } from '@/lib/apiTenant'
import { LEGACY_CCO_SEGMENTS } from '@/lib/routes'
import { fetchPublicTenant, type PublicTenant } from '@/lib/tenantApi'
import { TenantUnavailablePage } from '@/pages/tenant/TenantUnavailablePage'
import { LoadScreen } from '@/components/ui/LoadScreen'

type TenantContextValue = {
  slug: string
  publicTenant: PublicTenant
  href: (route?: string) => string
}

const TenantContext = createContext<TenantContextValue | null>(null)

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant deve ser usado dentro do TenantGate')
  return ctx
}

export function useOptionalTenant(): TenantContextValue | null {
  return useContext(TenantContext)
}

export function useCityHref() {
  const tenant = useOptionalTenant()
  return (route = '/') => (tenant ? cityPath(tenant.slug, route) : route)
}

export function TenantGate() {
  const { citySlug } = useParams()
  const location = useLocation()
  const slug = (citySlug ?? '').trim().toLowerCase()
  if (LEGACY_CCO_SEGMENTS.has(slug)) {
    const remembered = readRememberedTenantSlug() ?? 'prefeitura-marilia'
    return <Navigate to={`/${remembered}${location.pathname}${location.search}`} replace />
  }
  const [meta, setMeta] = useState<PublicTenant | null>(null)
  const [error, setError] = useState<{ code?: string; message: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setMeta(null)
    setApiTenantSlug(slug || null)
    if (!slug) {
      setLoading(false)
      setError({ code: 'TENANT_NOT_FOUND', message: 'Cidade não informada.' })
      return () => {
        cancelled = true
      }
    }
    void fetchPublicTenant(slug)
      .then((tenant) => {
        if (cancelled) return
        setMeta(tenant)
        rememberTenantSlug(tenant.slug)
      })
      .catch((e) => {
        if (cancelled) return
        const err = e as Error & { code?: string; status?: number }
        setError({
          code: err.code ?? (err.status === 404 ? 'TENANT_NOT_FOUND' : 'TENANT_ERROR'),
          message: err.message || 'Não foi possível carregar esta cidade.',
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const value = useMemo<TenantContextValue | null>(() => {
    if (!meta) return null
    return {
      slug: meta.slug,
      publicTenant: meta,
      href: (route = '/') => cityPath(meta.slug, route),
    }
  }, [meta])

  if (loading) {
    return <LoadScreen />
  }

  if (error || !value) {
    return (
      <TenantUnavailablePage
        code={error?.code ?? 'TENANT_NOT_FOUND'}
        message={error?.message ?? 'Cidade não encontrada.'}
        slug={slug}
      />
    )
  }

  if (!value.publicTenant.loginAllowed) {
    return (
      <TenantUnavailablePage
        code={
          value.publicTenant.status === 'suspended'
            ? 'TENANT_SUSPENDED'
            : value.publicTenant.status === 'archived'
              ? 'TENANT_ARCHIVED'
              : 'TENANT_PROVISIONING'
        }
        message={
          value.publicTenant.status === 'suspended'
            ? 'Esta cidade está suspensa. O acesso operacional foi bloqueado.'
            : value.publicTenant.status === 'archived'
              ? 'Esta cidade foi arquivada e não está mais disponível.'
              : 'Esta cidade ainda está em provisionamento.'
        }
        slug={value.slug}
        name={value.publicTenant.name}
      />
    )
  }

  return (
    <TenantContext.Provider value={value}>
      <Outlet />
    </TenantContext.Provider>
  )
}
