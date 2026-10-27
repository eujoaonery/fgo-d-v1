import type { CameraFeed, CameraStreamStatus, UrbanAsset } from '@/types'

const PLACEHOLDER =
  'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=640&q=60'

function streamStatus(asset: UrbanAsset): CameraStreamStatus {
  if (asset.status === 'inativo' || asset.connectivityStatus === 'sem_comunicacao' || asset.connectivityStatus === 'nao_aplicavel')
    return 'offline'
  if (asset.status === 'alerta' || asset.connectivityStatus === 'atrasado') return 'alerta'
  return 'online'
}

export function isCameraAsset(asset: UrbanAsset): boolean {
  const c = asset.category.toLowerCase()
  return c.includes('câmera') || c.includes('camera') || c.includes('vigilância')
}

export function cameraFeedsFromAssets(assets: UrbanAsset[]): CameraFeed[] {
  return assets.filter(isCameraAsset).map((a, i) => ({
    id: `feed-${a.id}`,
    assetId: a.id,
    label: a.name,
    region: a.region,
    status: streamStatus(a),
    imageUrl: PLACEHOLDER,
    primary: i === 0,
  }))
}
