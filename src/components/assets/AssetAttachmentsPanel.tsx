import { useCallback, useEffect, useState } from 'react'
import { Download, Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  deleteAssetAttachment,
  downloadAssetAttachmentFile,
  fetchAssetAttachments,
  uploadAssetAttachment,
} from '@/lib/api'
import { ASSET_ATTACHMENT_KINDS, type AssetAttachmentKind } from '@/lib/assetCatalog'
import { formatDateTime } from '@/lib/format'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import type { AssetAttachment } from '@/types'

export function AssetAttachmentsPanel({ assetId }: { assetId: string }) {
  const { can } = useCcoAccess()
  const canManage = can('assets', 'manage')
  const [items, setItems] = useState<AssetAttachment[]>([])
  const [kind, setKind] = useState<AssetAttachmentKind>('manual')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await fetchAssetAttachments(assetId))
    } catch {
      setItems([])
    }
  }, [assetId])

  useEffect(() => {
    void load()
  }, [load])

  async function onPick(file: File | undefined) {
    if (!file || !canManage) return
    setBusy(true)
    setError(null)
    try {
      await uploadAssetAttachment(assetId, file, kind)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no envio')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!canManage) return
    if (!window.confirm('Remover este anexo?')) return
    setBusy(true)
    try {
      await deleteAssetAttachment(assetId, id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-fogo-text">Anexos autorizados</p>
      <p className="text-[11px] text-fogo-muted">Manual, certificado, foto de instalação ou documento patrimonial.</p>
      {error ? <p className="text-xs text-fogo-warning">{error}</p> : null}
      {items.length === 0 ? <p className="text-xs text-fogo-muted">Nenhum anexo neste ativo.</p> : null}
      <ul className="space-y-1">
        {items.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 rounded-fogo-md border border-fogo-border/80 px-2 py-1.5 text-xs">
            <div className="min-w-0">
              <p className="truncate font-medium text-fogo-text">{a.fileName}</p>
              <p className="text-[11px] text-fogo-muted">
                {ASSET_ATTACHMENT_KINDS.find((k) => k.id === a.kind)?.label ?? a.kind} · {formatDateTime(a.uploadedAt)}
                {a.uploadedBy ? ` · ${a.uploadedBy}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void downloadAssetAttachmentFile(assetId, a.id, a.fileName)}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              {canManage ? (
                <Button variant="ghost" size="sm" className="text-fogo-warning" onClick={() => void remove(a.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1 text-xs"
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetAttachmentKind)}
          >
            {ASSET_ATTACHMENT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-fogo-accent">
            <Paperclip className="h-3.5 w-3.5" />
            {busy ? 'Enviando…' : 'Anexar arquivo'}
            <input
              type="file"
              className="sr-only"
              disabled={busy}
              accept=".pdf,image/jpeg,image/png,image/webp,image/gif,.doc,.docx"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                void onPick(f)
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
