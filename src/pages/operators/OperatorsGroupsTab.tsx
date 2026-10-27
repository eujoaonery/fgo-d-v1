import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { PermissionMatrix } from '@/components/operators/PermissionMatrix'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { emptyPermissions, type CcoPermissions } from '@/lib/ccoPermissions'
import {
  createOrgGroup,
  deleteOrgGroup,
  fetchOrgGroups,
  patchOrgGroup,
  withAdminStepUp,
  type OrgGroupRecord,
} from '@/lib/api'

export function OperatorsGroupsTab({ apiConnected }: { apiConnected: boolean }) {
  const { can, role: myRole } = useCcoAccess()
  const { profile } = useCcoAuth()
  const canManage = can('users', 'manage') || can('operators', 'manage')
  const isOrgAdmin = myRole === 'admin' || profile?.actor?.role === 'admin'

  const [groups, setGroups] = useState<OrgGroupRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPerms, setNewPerms] = useState<CcoPermissions>(() => emptyPermissions())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPerms, setEditPerms] = useState<CcoPermissions>(() => emptyPermissions())

  const load = useCallback(async () => {
    if (!apiConnected) return
    setLoading(true)
    setError(null)
    try {
      setGroups(await fetchOrgGroups())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar grupos')
    } finally {
      setLoading(false)
    }
  }, [apiConnected])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate() {
    if (!canManage || !isOrgAdmin) return
    try {
      await withAdminStepUp(() =>
        createOrgGroup({ name: newName, description: newDesc || undefined, permissions: newPerms }),
      )
      setCreating(false)
      setNewName('')
      setNewDesc('')
      setNewPerms(emptyPermissions())
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Não foi possível criar o grupo')
    }
  }

  async function saveGroup(id: string) {
    if (!canManage || !isOrgAdmin) return
    try {
      await withAdminStepUp(() =>
        patchOrgGroup(id, { name: editName, description: editDesc, permissions: editPerms }),
      )
      setEditingId(null)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Atualização falhou')
    }
  }

  async function remove(id: string) {
    if (!canManage || !isOrgAdmin) return
    if (!window.confirm('Excluir este grupo?')) return
    try {
      await withAdminStepUp(() => deleteOrgGroup(id))
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Exclusão falhou')
    }
  }

  function startEdit(g: OrgGroupRecord) {
    setEditingId(g.id)
    setEditName(g.name)
    setEditDesc(g.description ?? '')
    setEditPerms(g.permissions)
  }

  return (
    <OpsPanel
      flow
      title="Grupos de usuários"
      subtitle="Administrador de cidade tem acesso total neste município. Administrador do sistema tem tudo, menos API e integrações. O administrador de plataforma não existe na cidade."
      action={
        canManage && isOrgAdmin ? (
          <Button variant="secondary" size="sm" disabled={!apiConnected} onClick={() => setCreating((v) => !v)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Novo grupo
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {error ? <p className="text-sm text-fogo-warning">{error}</p> : null}

        {creating && canManage && isOrgAdmin ? (
          <div className="space-y-3 rounded-fogo-md border border-fogo-border bg-fogo-bg/40 p-4">
            <input
              placeholder="Nome do grupo"
              className="w-full rounded-fogo-md border border-fogo-border px-2 py-1.5 text-sm"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              placeholder="Descrição (opcional)"
              className="w-full rounded-fogo-md border border-fogo-border px-2 py-1.5 text-sm"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <PermissionMatrix value={newPerms} onChange={setNewPerms} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void handleCreate()}>
                Salvar grupo
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        <ul className="space-y-3">
          {loading && groups.length === 0 ? (
            <li className="text-sm text-fogo-muted">Carregando…</li>
          ) : null}
          {groups.map((g) => (
            <li key={g.id} className="rounded-fogo-md border border-fogo-border/80 p-3">
              {editingId === g.id ? (
                <div className="space-y-3">
                  <input
                    className="w-full rounded-fogo-md border border-fogo-border px-2 py-1.5 text-sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <input
                    className="w-full rounded-fogo-md border border-fogo-border px-2 py-1.5 text-sm"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                  <PermissionMatrix value={editPerms} onChange={setEditPerms} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void saveGroup(g.id)}>
                      Salvar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-fogo-text">{g.name}</p>
                    {g.description ? <p className="text-xs text-fogo-muted">{g.description}</p> : null}
                    <p className="mt-1 text-[11px] text-fogo-muted">
                      {g.memberCount} usuário(s) · criado em {new Date(g.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  {canManage && isOrgAdmin ? (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(g)}>
                        Editar privilégios
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-fogo-warning"
                        onClick={() => void remove(g.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </OpsPanel>
  )
}
