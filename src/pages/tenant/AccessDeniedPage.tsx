import { Link } from 'react-router-dom'
import { FogoLogo } from '@/components/layout/FogoLogo'
import { useCityHref } from '@/context/TenantContext'

export function AccessDeniedPage({ message }: { message?: string }) {
  const href = useCityHref()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-fogo-bg px-4 text-center">
      <FogoLogo size="medium" />
      <h1 className="mt-8 text-xl font-semibold text-fogo-text">Acesso negado</h1>
      <p className="mt-3 max-w-md text-sm text-fogo-muted">
        {message ??
          'Esta conta não tem permissão para o recurso solicitado. O acesso é limitado à cidade e ao perfil autorizados.'}
      </p>
      <Link to={href('/login')} className="mt-6 text-sm text-fogo-accent hover:underline">
        Voltar ao login
      </Link>
    </div>
  )
}
