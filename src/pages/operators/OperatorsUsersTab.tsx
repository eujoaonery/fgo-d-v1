import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Trash2, UserPlus } from 'lucide-react'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/tables/DataTable'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { isCityAdminGroupName, roleFromGroupName } from '@/lib/ccoPermissions'
import { memberStatusLabel } from '@/lib/userDisplay'
import { OPS_REGIONS } from '@/context/OpsFilterContext'
import { formatDateTimePtBr } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  confirmAdminReauth,
  deleteOrgMember,
  fetchOrgGroups,
  fetchOrgMembers,
  inviteOrgMember,
  patchOrgMember,
  type OrgMemberRecord,
  type OrgMemberStatus,
} from '@/lib/api'

const inputClass = 'mt-1 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm text-fogo-text'

type SortKey = 'displayName' | 'email' | 'group' | 'status' | 'createdAt'

function groupLabel(m: OrgMemberRecord) {
  return m.groupName?.trim() || '—'
}

export function OperatorsUsersTab({ apiConnected }: { apiConnected: boolean }) {
  const { can, role: myRole } = useCcoAccess()
  const { profile } = useCcoAuth()
  const canManage = can('users', 'manage') || can('operators', 'manage')
  const isOrgAdmin = myRole === 'admin' || profile?.actor?.role === 'admin'
  const selfId = profile?.actor?.userId

  const [members, setMembers] = useState<OrgMemberRecord[]>([])
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof fetchOrgGroups>>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('displayName')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteGroupId, setInviteGroupId] = useState('')
  const [inviteRegion, setInviteRegion] = useState('')
  const [inviteOrg, setInviteOrg] = useState('')
  const [inviteShareUntil, setInviteShareUntil] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  const [editing, setEditing] = useState<OrgMemberRecord | null>(null)
  const [editGroupId, setEditGroupId] = useState('')
  const [editRegion, setEditRegion] = useState('')
  const [editOrg, setEditOrg] = useState('')
  const [editShareUntil, setEditShareUntil] = useState('')
  const [editStatus, setEditStatus] = useState<OrgMemberStatus>('active')
  const [editBusy, setEditBusy] = useState(false)

  const [deleting, setDeleting] = useState<OrgMemberRecord | null>(null)
  const [deleteStep, setDeleteStep] = useState<'warn' | 'password'>('warn')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!apiConnected) return
    setLoading(true)
    setError(null)
    try {
      const [m, g] = await Promise.all([fetchOrgMembers(), fetchOrgGroups()])
      setMembers(m)
      setGroups(g)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }, [apiConnected])

  useEffect(() => {
    void load()
  }, [load])

  function groupById(id: string) {
    return groups.find((g) => g.id === id) ?? null
  }

  function roleForGroup(groupId: string) {
    return roleFromGroupName(groupById(groupId)?.name ?? null)
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = members.filter((m) => {
      if (!showInactive && m.status === 'inactive') return false
      if (!q) return true
      return (m.displayName ?? '').toLowerCase().includes(q)
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av =
        sortKey === 'email'
          ? (a.email ?? '')
          : sortKey === 'group'
            ? groupLabel(a)
            : sortKey === 'status'
              ? memberStatusLabel(a.status)
              : sortKey === 'createdAt'
                ? a.createdAt
                : a.displayName
      const bv =
        sortKey === 'email'
          ? (b.email ?? '')
          : sortKey === 'group'
            ? groupLabel(b)
            : sortKey === 'status'
              ? memberStatusLabel(b.status)
              : sortKey === 'createdAt'
                ? b.createdAt
                : b.displayName
      return av.localeCompare(bv, 'pt-BR', { sensitivity: 'base' }) * dir
    })
  }, [members, search, showInactive, sortDir, sortKey])

  async function handleInvite() {
    if (!canManage || !isOrgAdmin) return
    if (!inviteGroupId) {
      setError('Selecione o grupo do usuário.')
      return
    }
    const role = roleForGroup(inviteGroupId)
    const adminGroup = role === 'admin'
    setInviteBusy(true)
    setError(null)
    try {
      const created = await inviteOrgMember({
        email: inviteEmail,
        displayName: inviteName || undefined,
        role,
        groupId: inviteGroupId,
        scopeRegion: adminGroup ? null : inviteRegion || null,
        scopeOrg: adminGroup ? null : inviteOrg || null,
        locationShareUntil: role === 'field' && inviteShareUntil ? inviteShareUntil : null,
      })
      setInviteOpen(false)
      setInviteEmail('')
      setInviteName('')
      setInviteGroupId('')
      setInviteRegion('')
      setInviteOrg('')
      setInviteShareUntil('')
      if (created.temporaryPassword) setTempPassword(created.temporaryPassword)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o usuário')
    } finally {
      setInviteBusy(false)
    }
  }

  function startEdit(m: OrgMemberRecord) {
    setEditing(m)
    setEditGroupId(m.groupId ?? '')
    setEditRegion(m.scopeRegion ?? '')
    setEditOrg(m.scopeOrg ?? '')
    setEditShareUntil(m.locationShareUntil ? m.locationShareUntil.slice(0, 16) : '')
    setEditStatus(m.status === 'inactive' ? 'inactive' : 'active')
    setError(null)
  }

  async function saveEdit() {
    if (!canManage || !isOrgAdmin || !editing) return
    if (!editGroupId) {
      setError('Selecione o grupo do usuário.')
      return
    }
    const role = roleForGroup(editGroupId)
    const adminGroup = role === 'admin'
    setEditBusy(true)
    setError(null)
    try {
      await patchOrgMember(editing.userId, {
        role,
        groupId: editGroupId,
        scopeRegion: adminGroup ? null : editRegion || null,
        scopeOrg: adminGroup ? null : editOrg || null,
        locationShareUntil: role === 'field' && editShareUntil ? editShareUntil : null,
        status: editStatus,
      })
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Atualização falhou')
    } finally {
      setEditBusy(false)
    }
  }

  async function setStatus(m: OrgMemberRecord, status: OrgMemberStatus) {
    if (!canManage || !isOrgAdmin) return
    if (m.userId === selfId && status === 'inactive') {
      setError('Você não pode inativar o próprio usuário.')
      return
    }
    setError(null)
    try {
      await patchOrgMember(m.userId, { status })
      setDeleting(null)
      setDeleteStep('warn')
      setDeletePassword('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível alterar o status')
    }
  }

  function openDelete(m: OrgMemberRecord) {
    if (m.userId === selfId) {
      setError('Você não pode remover seu próprio usuário.')
      return
    }
    setDeleting(m)
    setDeleteStep('warn')
    setDeletePassword('')
    setDeleteError(null)
  }

  async function confirmDelete() {
    if (!deleting || !deletePassword.trim()) {
      setDeleteError('Informe a sua senha para confirmar a exclusão.')
      return
    }
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await confirmAdminReauth(deletePassword)
      await deleteOrgMember(deleting.userId)
      setDeleting(null)
      setDeletePassword('')
      await load()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Exclusão falhou')
    } finally {
      setDeleteBusy(false)
    }
  }

  const inviteGroup = groupById(inviteGroupId)
  const inviteIsCityAdmin = !!inviteGroup && isCityAdminGroupName(inviteGroup.name)
  const editGroup = groupById(editGroupId)
  const editIsCityAdmin = !!editGroup && isCityAdminGroupName(editGroup.name)

  const columns: Column<OrgMemberRecord>[] = [
    {
      key: 'displayName',
      header: 'Nome',
      sortable: true,
      render: (m) => (
        <p className={cn('font-medium text-fogo-text', m.status === 'inactive' && 'opacity-60')}>
          {m.displayName}
          {m.userId === selfId ? <span className="ml-1.5 font-normal text-fogo-muted">· você</span> : null}
        </p>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      sortable: true,
      render: (m) => <span className="text-fogo-muted">{m.email ?? '—'}</span>,
    },
    {
      key: 'group',
      header: 'Grupo',
      sortable: true,
      render: (m) => groupLabel(m),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (m) => (
        <Badge variant={m.status === 'inactive' ? 'neutral' : 'success'}>{memberStatusLabel(m.status)}</Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      sortable: true,
      className: 'whitespace-nowrap',
      render: (m) => <span className="tabular-nums text-fogo-muted">{formatDateTimePtBr(m.createdAt)}</span>,
    },
    ...(canManage && isOrgAdmin
      ? [
          {
            key: 'actions',
            header: 'Ações',
            className: 'w-[1%] whitespace-nowrap',
            render: (m: OrgMemberRecord) => (
              <div className="flex flex-nowrap justify-end gap-1">
                <Button variant="ghost" size="xs" onClick={() => startEdit(m)}>
                  Editar
                </Button>
                {m.status === 'inactive' ? (
                  <Button variant="ghost" size="xs" onClick={() => void setStatus(m, 'active')}>
                    Ativar
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={m.userId === selfId}
                    onClick={() => void setStatus(m, 'inactive')}
                  >
                    Inativar
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-fogo-warning"
                  disabled={m.userId === selfId}
                  onClick={() => openDelete(m)}
                  aria-label="Excluir usuário"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          } satisfies Column<OrgMemberRecord>,
        ]
      : []),
  ]

  return (
    <OpsPanel
      flow
      title="Usuários"
      subtitle="O acesso segue o grupo de usuários. Administração local usa Administrador de cidade e Administrador do sistema — o administrador de plataforma não se cria no CCO municipal."
      action={
        canManage && isOrgAdmin ? (
          <Button variant="secondary" size="sm" disabled={!apiConnected} onClick={() => setInviteOpen((v) => !v)}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Novo usuário
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {error ? (
          <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
            {error}
          </p>
        ) : null}

        {inviteOpen && canManage && isOrgAdmin ? (
          <div className="space-y-3 rounded-fogo-md border border-fogo-border bg-fogo-bg/40 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-fogo-muted">
                E-mail
                <input className={inputClass} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </label>
              <label className="text-xs text-fogo-muted">
                Nome exibido
                <input className={inputClass} value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
              </label>
              <label className="text-xs text-fogo-muted">
                Grupo
                <select className={inputClass} value={inviteGroupId} onChange={(e) => setInviteGroupId(e.target.value)} required>
                  <option value="">Selecione o grupo</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              {inviteIsCityAdmin ? (
                <p className="text-[11px] text-fogo-muted sm:col-span-2">
                  {inviteGroup?.name === 'Administrador do sistema'
                    ? 'Acesso a tudo nesta cidade, menos configurações de API e integrações de dados.'
                    : 'Acesso total a esta cidade, inclusive configurações e integrações.'}
                </p>
              ) : inviteGroupId ? (
                <>
                  <label className="text-xs text-fogo-muted">
                    Região autorizada
                    <select className={inputClass} value={inviteRegion} onChange={(e) => setInviteRegion(e.target.value)}>
                      <option value="">Toda a cidade</option>
                      {OPS_REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-fogo-muted">
                    Órgão / unidade
                    <input
                      className={inputClass}
                      placeholder="Ex.: CET, Semob"
                      value={inviteOrg}
                      onChange={(e) => setInviteOrg(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
              {!inviteIsCityAdmin && roleForGroup(inviteGroupId) === 'field' ? (
                <label className="text-xs text-fogo-muted sm:col-span-2">
                  Compartilhar localização até
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={inviteShareUntil}
                    onChange={(e) => setInviteShareUntil(e.target.value)}
                  />
                </label>
              ) : null}
            </div>
            <p className="text-[11px] text-fogo-muted">
              Uma senha temporária é gerada na criação. O usuário troca no primeiro acesso.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={!apiConnected || inviteBusy} onClick={() => void handleInvite()}>
                {inviteBusy ? 'Criando…' : 'Criar usuário'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setInviteOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fogo-muted" />
            <input
              className="h-9 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface py-1.5 pl-8 pr-3 text-sm"
              placeholder="Pesquisar por nome de usuário"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={showInactive}
            onClick={() => setShowInactive((v) => !v)}
            className="inline-flex items-center gap-2 text-xs font-medium text-fogo-muted hover:text-fogo-text"
          >
            <span
              className={cn(
                'relative h-5 w-9 rounded-full border transition-colors',
                showInactive ? 'border-fogo-accent bg-fogo-accent' : 'border-fogo-border bg-fogo-bg',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]',
                  showInactive ? 'left-[1.125rem]' : 'left-0.5',
                )}
              />
            </span>
            Mostrar inativos
          </button>
        </div>

        <DataTable
          columns={columns}
          rows={loading && members.length === 0 ? [] : rows}
          rowKey={(m) => m.userId}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key) => {
            const next = key as SortKey
            if (sortKey === next) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
            else {
              setSortKey(next)
              setSortDir('asc')
            }
          }}
          dense
          emptyMessage={
            loading
              ? 'Carregando…'
              : showInactive
                ? 'Nenhum usuário corresponde à pesquisa.'
                : 'Nenhum usuário ativo. Ligue “Mostrar inativos” para ver contas desativadas.'
          }
        />
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar usuário">
        {editing ? (
          <div className="space-y-3">
            <p className="text-sm text-fogo-muted">
              {editing.displayName}
              {editing.email ? ` · ${editing.email}` : ''}
            </p>
            <label className="block text-xs text-fogo-muted">
              Status
              <select
                className={inputClass}
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as OrgMemberStatus)}
                disabled={editing.userId === selfId}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>
            <label className="block text-xs text-fogo-muted">
              Grupo
              <select className={inputClass} value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)}>
                <option value="">Selecione o grupo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            {editIsCityAdmin ? (
              <p className="text-[11px] text-fogo-muted">
                {editGroup?.name === 'Administrador do sistema'
                  ? 'Acesso a tudo nesta cidade, menos configurações de API e integrações de dados.'
                  : 'Acesso total a esta cidade, inclusive configurações e integrações.'}
              </p>
            ) : editGroupId ? (
              <>
                <label className="block text-xs text-fogo-muted">
                  Região autorizada
                  <select className={inputClass} value={editRegion} onChange={(e) => setEditRegion(e.target.value)}>
                    <option value="">Toda a cidade</option>
                    {OPS_REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className={inputClass}
                  placeholder="Órgão / unidade"
                  value={editOrg}
                  onChange={(e) => setEditOrg(e.target.value)}
                />
              </>
            ) : null}
            {!editIsCityAdmin && roleForGroup(editGroupId) === 'field' ? (
              <label className="block text-xs text-fogo-muted">
                Compartilhar localização até
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={editShareUntil}
                  onChange={(e) => setEditShareUntil(e.target.value)}
                />
              </label>
            ) : null}
            <div className="flex gap-2 pt-1">
              <Button size="sm" disabled={editBusy} onClick={() => void saveEdit()}>
                {editBusy ? 'Salvando…' : 'Salvar'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => {
          if (!deleteBusy) {
            setDeleting(null)
            setDeleteStep('warn')
            setDeletePassword('')
            setDeleteError(null)
          }
        }}
        title="Excluir usuário?"
      >
        {deleting ? (
          <div className="space-y-3">
            <p className="rounded-fogo-md border border-fogo-warning/35 bg-fogo-warning-bg px-3 py-2 text-sm text-fogo-text">
              Excluir <strong>{deleting.displayName}</strong> remove o acesso de forma permanente. O mais seguro é
              inativar a conta: ela some da lista, perde o acesso, e pode ser reativada depois.
            </p>
            {deleteError ? (
              <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
                {deleteError}
              </p>
            ) : null}
            {deleteStep === 'warn' ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={deleteBusy}
                  onClick={() => void setStatus(deleting, 'inactive')}
                >
                  Inativar
                </Button>
                <Button size="sm" variant="outline" className="text-fogo-warning" onClick={() => setDeleteStep('password')}>
                  Excluir mesmo assim
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs text-fogo-muted">
                  Sua senha
                  <input
                    type="password"
                    autoComplete="current-password"
                    className={inputClass}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" disabled={deleteBusy} onClick={() => void confirmDelete()}>
                    {deleteBusy ? 'Excluindo…' : 'Confirmar exclusão'}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={deleteBusy} onClick={() => setDeleteStep('warn')}>
                    Voltar
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal open={!!tempPassword} onClose={() => setTempPassword(null)} title="Usuário criado">
        {tempPassword ? (
          <div className="space-y-3">
            <p className="text-sm text-fogo-muted">
              Entregue esta senha temporária. No primeiro acesso o sistema pede uma senha nova.
            </p>
            <code className="block break-all rounded-fogo-md border border-fogo-border bg-fogo-bg px-3 py-2 text-sm text-fogo-text">
              {tempPassword}
            </code>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(tempPassword)
                }}
              >
                Copiar senha
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setTempPassword(null)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </OpsPanel>
  )
}
