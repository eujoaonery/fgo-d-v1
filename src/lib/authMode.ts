/** Login igual à produção: BFF com cookie HttpOnly, mesmo se o ambiente pedir o modo direto. */
export function isClientBffAuth(): boolean {
  return true
}

export function authUsesCookies(): boolean {
  return isClientBffAuth()
}
