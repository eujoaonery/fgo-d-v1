/** Pool de fotos urbanas únicas (Unsplash). Mínimo = total de câmeras em monitoramento. */
export const MONITOR_CAMERA_IMAGE_POOL_SIZE = 84

const CROP = 'auto=format&fit=crop&w=640&h=360&q=85'

function unsplash(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?${CROP}`
}

/** IDs CDN — 84 imagens distintas (ruas, cruzamentos, vias, corredores). */
const URBAN_STREET_PHOTO_IDS: readonly string[] = [
  '1449824913935-59a10b8d2000',
  '1514565131-fce080955aaa',
  '1480714378408-67cf0d13bc1b',
  '1477959856237-e065697b35ea',
  '1519501025264-65ba15a82390',
  '1494522358652-f30e804979fc',
  '1544624417-b7012e591e47',
  '1501594907352-04cda38ebc29',
  '1522778119026-d647f0596c20',
  '1569336410460-5b47d0f126af',
  '1570129477492-45c003edd2be',
  '1558618666-fcd25c85cd64',
  '1580674285054-bed31fd70d8',
  '1555992336-fb0d29498f48',
  '1516450360450-6c2f355ea827',
  '1469854523086-cc02fe5d8800',
  '1534430480872-3498386e7856',
  '1520975922284-8a4568561220',
  '1590674899480-fb581c3576ab',
  '1761654887816-f424ba2c22fb',
  '1655202905389-95290f2e8dc3',
  '1444723123967-809489e2aa5f',
  '1434394358549-329c86b30e66',
  '1513635269978-445d5ecc47a',
  '1471115857119-ac49211974a1',
  '1486406146926-c627a92ad1ab',
  '1570169518076-ba1cff1d1236',
  '1526779255619-9aa0eca7c9bd',
  '1496568816309-51b24a92aa47',
  '1555872724-0c259d53f96d',
  '1545569341-9f9fbd09f3b8',
  '1499793983690-e29a297b48ad',
  '1512453979798-5ea266f9340a',
  '1541888946425-d81bb192fa49',
  '1473924940214-2865888c84c6',
  '1515169064918-d69014836965',
  '1489397243719-0203716147ca',
  '1501785888043-7d9fabaa4b44',
  '1493971586864-5bdb23116447',
  '1556760544-7409a25fa8c5',
  '1551836022-d081d8e30466',
  '1551632810-5625974d13f2',
  '1560775493-8c39a9f39f1f',
  '1565688534245-425d5f9511e0',
  '1567095761058-239a91d5afe9',
  '1570125909232-e0433792c1e0',
  '1571115764593-95b37981dce1',
  '1574362840509-5c5b3733a32a',
  '1582406280945-d89980678796',
  '1582139329536-cfb9f8b094e7',
  '1587764379873-978279e68cbd',
  '1589820295166-49de5ba96245',
  '1590098797862-ef1b6e2a4f8e',
  '1590959658712-a69781600282',
  '1593945476587-84d1de8d0f90',
  '1596524438210-e8c3e9e0c7c8',
  '1594736797413-be0102c5f343',
  '1600047509807-ba13969c3537',
  '1600607687929-4e5771f9f72e',
  '1600607687934-7309a2614e5f',
  '1601042873415-080a2c86e3ab',
  '1602810318383-e269a2d94019',
  '1605557623262-906250a2f8c1',
  '1605884336929-7a175249f562',
  '1607961373075-8f80bb8a8bf8',
  '1609587737020-db4752584501',
  '1612872082470-7f4ee19d8df5',
  '1618194417274-2e94f9a1c7c6',
  '1622547746211-e23e64032f8e',
  '1622308646688-7e0aced8da3e',
  '1635776063061-06696af9bdb7',
  '1641444433247-4f4587c986b5',
  '1648682466869-d177d00795f8',
  '1670406344559-4050f2d1754d',
  '1676577223133-49b51e25de47',
  '1682687220061-6361ff8469ee',
  '1694485895328-17d7bbd9b7ac',
  '1714396345188-cd5f4533e78e',
  '1720784640430-8dee94d3f262',
  '1730315399485-8b0a27ba0b9a',
  '1741290621761-82a2aa498b43',
  '1555881400-74d7bcacd83b',
  '1505764708174-021b21245b31',
  '1523963813263-12f6e1214ab7',
] as const

if (URBAN_STREET_PHOTO_IDS.length !== MONITOR_CAMERA_IMAGE_POOL_SIZE) {
  throw new Error(
    `cameraImages: pool deve ter ${MONITOR_CAMERA_IMAGE_POOL_SIZE} fotos (atual: ${URBAN_STREET_PHOTO_IDS.length})`,
  )
}

const URBAN_STREET_IMAGES = URBAN_STREET_PHOTO_IDS.map(unsplash)

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Permuta fixa para espalhar cenas similares no grid (sem repetir URL). */
const CAMERA_PHOTO_SLOT = (() => {
  const n = MONITOR_CAMERA_IMAGE_POOL_SIZE
  const order = Array.from({ length: n }, (_, i) => i)
  const rand = mulberry32(0xf06f)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
})()

/** Uma imagem exclusiva por câmera (0 … 83). */
export function streetImageForCamera(cameraIndex: number): string {
  const slot = CAMERA_PHOTO_SLOT[cameraIndex % MONITOR_CAMERA_IMAGE_POOL_SIZE]
  return URBAN_STREET_IMAGES[slot]
}

/** @deprecated Use streetImageForCamera. */
export function streetImageForIndex(index: number): string {
  return streetImageForCamera(index)
}

/** Caminho local opcional: `/camera-feeds/rua-01.jpg` */
export function localCameraFeedPath(slot: number): string {
  const n = ((slot - 1) % 12) + 1
  return `/camera-feeds/rua-${n.toString().padStart(2, '0')}.jpg`
}
