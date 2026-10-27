import { Link } from 'react-router-dom'
import { FogoLogo } from '@/components/layout/FogoLogo'

export function TenantUnavailablePage({
  code,
  message,
  slug,
  name,
}: {
  code: string
  message: string
  slug?: string
  name?: string
}) {
  const title =
    code === 'TENANT_SUSPENDED'
      ? 'Cidade suspensa'
      : code === 'TENANT_ARCHIVED'
        ? 'Cidade arquivada'
        : code === 'TENANT_PROVISIONING'
          ? 'Cidade em provisionamento'
          : 'Cidade indisponível'

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-fogo-bg px-4 text-center">
      <FogoLogo size="medium" />
      <h1 className="mt-8 text-xl font-semibold text-fogo-text">{title}</h1>
      {name ? <p className="mt-1 text-sm text-fogo-muted">{name}{slug ? ` · ${slug}` : ''}</p> : null}
      <p className="mt-3 max-w-md text-sm text-fogo-muted">{message}</p>
      <Link to="/" className="mt-6 text-sm text-fogo-accent hover:underline">
        Escolher outra cidade
      </Link>
    </div>
  )
}
