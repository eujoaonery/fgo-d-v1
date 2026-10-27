import { formatAssetAddress, mariliaAddressFor } from '../lib/mariliaAddresses'
import type { UrbanAsset } from '@/types'

const BASE: Omit<UrbanAsset, 'location' | 'address' | 'cadastralStatus' | 'dataOrigin'>[] = [
  { id: 'CAM-0882', name: 'Câmera Praça Municipal', category: 'Câmeras', region: 'Centro', status: 'alerta', lastSeen: '2026-10-20T13:05:00', health: 62, manufacturer: 'Hikvision', model: 'DS-2CD2143G2', serialNumber: 'HK-CAM0882-06QD5', patrimonyCode: 'PM-CAM-0882' },
  { id: 'SEM-1024', name: 'Semáforo Av. Central', category: 'Semáforos', region: 'Centro', status: 'alerta', lastSeen: '2026-10-20T14:22:00', health: 54, manufacturer: 'Dataprom', model: 'STC-400', serialNumber: 'DP-SEM1024-0H4GG', patrimonyCode: 'PM-SEM-1024' },
  { id: 'SEN-0441', name: 'Sensor túnel Rio Verde', category: 'Sensores', region: 'Zona Sul', status: 'alerta', lastSeen: '2026-10-20T11:40:00', health: 41, manufacturer: 'Bosch', model: 'Noise Node', serialNumber: 'BS-SEN0441-0B2HR', patrimonyCode: 'PM-SEN-0441' },
  { id: 'WIF-0312', name: 'Wi-Fi Parque Linear', category: 'Conectividade', region: 'Leste', status: 'operacional', lastSeen: '2026-10-20T14:35:00', health: 91, manufacturer: 'Ubiquiti', model: 'UniFi U6', serialNumber: 'UB-WIF0312-03LBM', patrimonyCode: 'PM-WIF-0312' },
  { id: 'PNL-0203', name: 'Painel Terminal Rodoviário', category: 'Painéis', region: 'Zona Norte', status: 'operacional', lastSeen: '2026-10-20T14:20:00', health: 88, manufacturer: 'Punto', model: 'VMS 960', serialNumber: 'PT-PNL0203-0G6LF', patrimonyCode: 'PM-PNL-0203' },
  { id: 'CAM-0910', name: 'Câmera Av. Norte', category: 'Câmeras', region: 'Zona Norte', status: 'operacional', lastSeen: '2026-10-20T14:38:00', health: 96, manufacturer: 'Hikvision', model: 'DS-2CD2143G2', serialNumber: 'HK-CAM0910-05CMH', patrimonyCode: 'PM-CAM-0910' },
  { id: 'SEM-1099', name: 'Semáforo cruzamento escolar', category: 'Semáforos', region: 'Oeste', status: 'operacional', lastSeen: '2026-10-20T14:00:00', health: 93, manufacturer: 'Dataprom', model: 'STC-400', serialNumber: 'DP-SEM1099-05RTG', patrimonyCode: 'PM-SEM-1099' },
  { id: 'SEN-0512', name: 'Sensor qualidade do ar', category: 'Sensores', region: 'Centro', status: 'inativo', lastSeen: '2026-10-18T22:10:00', health: 12, manufacturer: 'Libelium', model: 'Smart Cities', serialNumber: 'LB-SEN0512-0FF44', patrimonyCode: 'PM-SEN-0512' },
  { id: 'WIF-0288', name: 'Wi-Fi Praça Central', category: 'Conectividade', region: 'Centro', status: 'operacional', lastSeen: '2026-10-20T14:40:00', health: 97, manufacturer: 'Ubiquiti', model: 'UniFi U6', serialNumber: 'UB-WIF0288-0KI9M', patrimonyCode: 'PM-WIF-0288' },
  { id: 'CAM-0771', name: 'Câmera viaduto sul', category: 'Câmeras', region: 'Zona Sul', status: 'operacional', lastSeen: '2026-10-20T14:39:00', health: 89, manufacturer: 'Intelbras', model: 'VHD 1220 B', serialNumber: 'IB-CAM0771-0IC8Y', patrimonyCode: 'PM-CAM-0771' },
]

export const urbanAssets: UrbanAsset[] = BASE.map((a) => {
  const location = mariliaAddressFor(a.id, a.region)
  return {
    ...a,
    location,
    address: formatAssetAddress(location),
    cadastralStatus: 'operacional',
    dataOrigin: 'manual',
  }
})
