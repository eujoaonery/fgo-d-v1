/** Metadado Supabase Auth — exige troca de senha no primeiro acesso. */
export const MUST_CHANGE_PASSWORD = 'must_change_password'

export function mustChangePasswordFromMeta(meta: Record<string, unknown> | undefined): boolean {
  return meta?.[MUST_CHANGE_PASSWORD] === true
}
