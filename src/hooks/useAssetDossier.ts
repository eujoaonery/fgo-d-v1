import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useAssetDossier() {
  const [params, setParams] = useSearchParams()
  const assetId = params.get('ativo')

  const openAsset = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params)
      next.set('ativo', id)
      setParams(next)
    },
    [params, setParams],
  )

  const closeAsset = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('ativo')
    next.delete('editar')
    next.delete('ficha')
    setParams(next, { replace: true })
  }, [params, setParams])

  return { assetId, openAsset, closeAsset }
}
