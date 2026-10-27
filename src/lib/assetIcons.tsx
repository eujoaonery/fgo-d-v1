import {
  Bike,
  Bus,
  Camera,
  Car,
  DoorOpen,
  Gauge,
  Monitor,
  ParkingCircle,
  Radio,
  Scale,
  Shield,
  TrafficCone,
  Wifi,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export function iconForAssetCategory(category: string): LucideIcon {
  const c = category.toLowerCase()
  if (c.includes('câmera') || c.includes('camera') || c.includes('cftv')) return Camera
  if (c.includes('radar')) return Gauge
  if (c.includes('painel')) return Monitor
  if (c.includes('semáforo') || c.includes('semaforo')) return TrafficCone
  if (c.includes('conectividade') || c.includes('wi-fi') || c.includes('wifi')) return Wifi
  if (c.includes('sensor')) return Radio
  if (c.includes('ônibus') || c.includes('onibus') || c.includes('frota') || c.includes('transporte')) return Bus
  if (c.includes('balança') || c.includes('balanca')) return Scale
  if (c.includes('cancela')) return DoorOpen
  if (c.includes('totem') || c.includes('estacionamento')) return ParkingCircle
  if (c.includes('viatura') || c.includes('policial') || c.includes('guarda')) return Shield
  if (c.includes('patinete')) return Bike
  if (c.includes('motocicleta') || c.includes('moto')) return Bike
  if (c.includes('autônomo') || c.includes('autonomo') || c.includes('fiscaliza')) return Gauge
  if (c.includes('táxi') || c.includes('taxi')) return Car
  return Radio
}
