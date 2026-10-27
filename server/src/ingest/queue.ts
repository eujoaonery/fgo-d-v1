import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeLogText } from '../connectors/sanitize.js'

export type JobKind =
  | 'ingest_event'
  | 'rest_poll'
  | 'check_run'
  | 'webhook_out'
  | 'webhook_fanout'
  | 'recompute_state'
  | 'mqtt_poll'
  | 'retention'

export async function enqueueJob(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    kind: JobKind
    refId?: string | null
    payload?: Record<string, unknown>
    runAfter?: string
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ingest_jobs')
    .insert({
      organization_id: input.organizationId,
      kind: input.kind,
      ref_id: input.refId ?? null,
      payload: input.payload ?? {},
      run_after: input.runAfter ?? new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[fogo] enqueueJob', error.message)
    return null
  }
  return (data?.id as string) ?? null
}

export type IngestJob = {
  id: string
  organizationId: string
  kind: JobKind
  refId: string | null
  payload: Record<string, unknown>
  attempts: number
}

export async function claimJobs(supabase: SupabaseClient, limit = 8): Promise<IngestJob[]> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('ingest_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('run_after', now)
    .order('run_after', { ascending: true })
    .limit(limit)
  if (error || !data?.length) return []
  const claimed: IngestJob[] = []
  for (const row of data) {
    const { data: updated } = await supabase
      .from('ingest_jobs')
      .update({ status: 'processing', attempts: Number(row.attempts ?? 0) + 1 })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle()
    if (!updated) continue
    claimed.push({
      id: String(updated.id),
      organizationId: String(updated.organization_id),
      kind: updated.kind as JobKind,
      refId: (updated.ref_id as string | null) ?? null,
      payload: (updated.payload as Record<string, unknown>) ?? {},
      attempts: Number(updated.attempts ?? 1),
    })
  }
  return claimed
}

export async function completeJob(supabase: SupabaseClient, id: string, error?: string | null) {
  await supabase
    .from('ingest_jobs')
    .update({
      status: error ? 'failed' : 'done',
      error: error ? sanitizeLogText(error, 240) : null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', id)
}

export async function retryJob(supabase: SupabaseClient, job: IngestJob, error: string, maxAttempts = 5) {
  if (job.attempts >= maxAttempts) {
    await completeJob(supabase, job.id, error)
    return
  }
  const delayMs = Math.min(60_000, 2 ** job.attempts * 1000)
  await supabase
    .from('ingest_jobs')
    .update({
      status: 'pending',
      error: sanitizeLogText(error, 240),
      run_after: new Date(Date.now() + delayMs).toISOString(),
    })
    .eq('id', job.id)
}
