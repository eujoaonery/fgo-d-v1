import { useEffect, useState } from 'react'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { canSeeCategorySla } from '@/lib/categorySla'
import { PrometheusIntegrationPanel } from '@/pages/integrations/PrometheusIntegrationPanel'
import { fetchPrometheusIntegration } from '@/lib/api'

type IntegrationId = 'openai'

export function IntegrationsPage() {
  const { can, role } = useCcoAccess()
  const { profile } = useCcoAuth()
  const canManage = can('integrations', 'manage')
  const canEditPrometheus =
    canManage ||
    canSeeCategorySla({ isPlatformSuperAdmin: profile?.isPlatformSuperAdmin, memberRole: role })
  const [open, setOpen] = useState<IntegrationId | null>(null)
  const [openaiOn, setOpenaiOn] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchPrometheusIntegration()
      .then((s) => {
        if (!cancelled) setOpenaiOn(s.openai.configured)
      })
      .catch(() => {
        if (!cancelled) setOpenaiOn(null)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <PageShell searchPlaceholder="Integrações">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold text-fogo-text">Integrações e dados</h1>
          <p className="text-xs text-fogo-muted">
            Conectores do CCO. Abra uma integração para configurar. Credenciais ficam no cofre e não aparecem nos logs.
          </p>
        </div>

        {open === 'openai' ? (
          <div className="flex flex-col gap-3">
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setOpen(null)}>
              <ChevronLeft className="h-4 w-4" />
              Integrações
            </Button>
            <PrometheusIntegrationPanel canEdit={canEditPrometheus} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Card
              as="button"
              interactive
              className="flex items-start gap-3 p-4 text-left"
              onClick={() => setOpen('openai')}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fogo-bg text-fogo-accent">
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-fogo-text">OpenAI</span>
                  {openaiOn != null ? (
                    <Badge variant={openaiOn ? 'success' : 'warning'}>
                      {openaiOn ? 'ligada' : 'desligada'}
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-fogo-muted">
                  PROMETHEUS — análise estratégica do CCO. Clique para ver a chave, o modelo e os canais.
                </span>
              </span>
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  )
}
