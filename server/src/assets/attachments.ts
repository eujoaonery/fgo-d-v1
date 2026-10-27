import type { RequestFogoDb } from '../orgContext.js'
import type { AssetAttachment, AssetAttachmentKind } from '../types.js'

const BUCKET = 'asset-attachments'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const KINDS = new Set<AssetAttachmentKind>([
  'manual',
  'certificado',
  'foto_instalacao',
  'documento_patrimonial',
  'outro',
])

function rowToAttachment(row: {
  id: string
  asset_external_id: string
  kind: string
  file_name: string
  content_type: string
  size_bytes?: number | null
  uploaded_by?: string | null
  uploaded_at: string
}): AssetAttachment {
  return {
    id: row.id,
    assetId: row.asset_external_id,
    kind: row.kind as AssetAttachmentKind,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    uploadedAt: row.uploaded_at,
  }
}

export async function listAssetAttachments(db: RequestFogoDb, assetId: string): Promise<AssetAttachment[]> {
  const { data, error } = await db.supabase
    .from('asset_attachments')
    .select('id, asset_external_id, kind, file_name, content_type, size_bytes, uploaded_by, uploaded_at')
    .eq('organization_id', db.orgId)
    .eq('asset_external_id', assetId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(rowToAttachment)
}

export async function uploadAssetAttachment(
  db: RequestFogoDb,
  assetId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  kindRaw?: string,
): Promise<AssetAttachment> {
  if (!ALLOWED.has(file.mimetype)) {
    throw new Error('Use PDF, imagem (JPEG/PNG/WebP/GIF) ou documento Word.')
  }
  if (file.size > MAX_BYTES) throw new Error('Arquivo até 10 MB.')
  const kind: AssetAttachmentKind = KINDS.has(kindRaw as AssetAttachmentKind)
    ? (kindRaw as AssetAttachmentKind)
    : 'outro'
  const safeName = file.originalname.replace(/[^\w.\- ()áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/g, '_').slice(0, 120)
  const storagePath = `${db.orgId}/${assetId}/${Date.now()}-${safeName}`
  const { error: upErr } = await db.supabase.storage.from(BUCKET).upload(storagePath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  })
  if (upErr) throw upErr

  const actor = db.actor?.email ?? db.actor?.displayName ?? null
  const { data, error } = await db.supabase
    .from('asset_attachments')
    .insert({
      organization_id: db.orgId,
      asset_external_id: assetId,
      kind,
      file_name: safeName,
      content_type: file.mimetype,
      storage_path: storagePath,
      size_bytes: file.size,
      uploaded_by: actor,
    })
    .select('id, asset_external_id, kind, file_name, content_type, size_bytes, uploaded_by, uploaded_at')
    .single()
  if (error) throw error
  return rowToAttachment(data)
}

export async function downloadAssetAttachment(db: RequestFogoDb, assetId: string, attId: string) {
  const { data, error } = await db.supabase
    .from('asset_attachments')
    .select('file_name, content_type, storage_path')
    .eq('organization_id', db.orgId)
    .eq('asset_external_id', assetId)
    .eq('id', attId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { data: blob, error: dlErr } = await db.supabase.storage.from(BUCKET).download(data.storage_path)
  if (dlErr || !blob) throw dlErr ?? new Error('Arquivo indisponível')
  const buffer = Buffer.from(await blob.arrayBuffer())
  return { buffer, fileName: data.file_name, contentType: data.content_type }
}

export async function deleteAssetAttachment(db: RequestFogoDb, assetId: string, attId: string): Promise<boolean> {
  const { data, error } = await db.supabase
    .from('asset_attachments')
    .select('id, storage_path')
    .eq('organization_id', db.orgId)
    .eq('asset_external_id', assetId)
    .eq('id', attId)
    .maybeSingle()
  if (error) throw error
  if (!data) return false
  await db.supabase.storage.from(BUCKET).remove([data.storage_path])
  const { error: delErr } = await db.supabase
    .from('asset_attachments')
    .delete()
    .eq('organization_id', db.orgId)
    .eq('id', attId)
  if (delErr) throw delErr
  return true
}
