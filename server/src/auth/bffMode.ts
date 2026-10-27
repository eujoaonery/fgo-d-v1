/** Auth BFF: browser não fala com Supabase; sessão em cookie HttpOnly. Local e produção usam o mesmo login. */
export function serverAuthBffEnabled(): boolean {
  return true
}
