// Utilidades geográficas y de rosa de los vientos.

export const COMPASS_16 = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
]

export const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export const COMPASS_32 = [
  'N',
  'NbE',
  'NNE',
  'NEbN',
  'NE',
  'NEbE',
  'ENE',
  'EbN',
  'E',
  'EbS',
  'ESE',
  'SEbE',
  'SE',
  'SEbS',
  'SSE',
  'SbE',
  'S',
  'SbW',
  'SSW',
  'SWbS',
  'SW',
  'SWbW',
  'WSW',
  'WbS',
  'W',
  'WbN',
  'WNW',
  'NWbW',
  'NW',
  'NWbN',
  'NNW',
  'NbW',
]

/** Normaliza un rumbo a [0, 360). */
export function normalizeBearing(deg) {
  if (!Number.isFinite(deg)) return 0
  return ((deg % 360) + 360) % 360
}

/**
 * Convierte un rumbo en grados al punto de la rosa de los vientos más cercano.
 * points = 8 | 16 | 32 (por defecto 16: N, NNE, NE, ENE, ...).
 */
export function bearingToCompass(deg, points = 16) {
  const table = points === 8 ? COMPASS_8 : points === 32 ? COMPASS_32 : COMPASS_16
  const step = 360 / table.length
  const idx = Math.round(normalizeBearing(deg) / step) % table.length
  return table[idx]
}

/** Rumbo formateado, p.ej. "NNE 27°". */
export function formatBearing(deg, points = 16, withDegrees = true) {
  const b = normalizeBearing(deg)
  const label = bearingToCompass(b, points)
  return withDegrees ? `${label} ${Math.round(b)}°` : label
}

/**
 * Campo de visión horizontal (grados) a partir de la focal equivalente a 35 mm.
 * Sensor full frame: 36 mm de ancho.
 */
export function fovFromFocal35(focal35) {
  if (!Number.isFinite(focal35) || focal35 <= 0) return null
  return (2 * Math.atan(36 / (2 * focal35)) * 180) / Math.PI
}

/**
 * Rumbos de los extremos izquierdo y derecho de una foto tomada con
 * rumbo `bearing` y campo de visión horizontal `fov`.
 */
export function edgeBearings(bearing, fov) {
  const b = normalizeBearing(bearing)
  const half = (Number.isFinite(fov) ? fov : 65) / 2
  return {
    left: normalizeBearing(b - half),
    right: normalizeBearing(b + half),
  }
}

/** Formatea coordenadas decimales. */
export function formatLatLon(lat, lon, decimals = 6) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '—'
  return `${lat.toFixed(decimals)}, ${lon.toFixed(decimals)}`
}

/** Formatea coordenadas en grados/minutos/segundos. */
export function toDMS(value, isLat) {
  if (!Number.isFinite(value)) return '—'
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  const abs = Math.abs(value)
  const d = Math.floor(abs)
  const mFloat = (abs - d) * 60
  const m = Math.floor(mFloat)
  const s = (mFloat - m) * 60
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(2)}"${hemi}`
}

/** Distancia entre dos puntos en metros (haversine). */
export function haversine(a, b) {
  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Bounding box de una lista de puntos {lat, lon}. */
export function boundsOf(points) {
  const valid = points.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon))
  if (!valid.length) return null
  let north = -90
  let south = 90
  let east = -180
  let west = 180
  for (const p of valid) {
    north = Math.max(north, p.lat)
    south = Math.min(south, p.lat)
    east = Math.max(east, p.lon)
    west = Math.min(west, p.lon)
  }
  return { north, south, east, west }
}
