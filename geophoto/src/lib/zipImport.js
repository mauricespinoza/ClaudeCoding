// Importación de archivos .zip (descargas de Google Photos / Google Takeout).
//
// Además de extraer las imágenes, se leen los sidecar JSON que Google incluye
// junto a cada foto. Eso permite recuperar las coordenadas aunque el JPEG venga
// sin EXIF, que es justamente lo que suele ocurrir al descargar desde la web.

import JSZip from 'jszip'

const IMAGE_RE = /\.(jpe?g|png|tiff?|webp|avif|bmp|gif|heic|heif)$/i
const JSON_RE = /\.json$/i
// Basura de macOS/Windows y metadatos globales del export.
const SKIP_RE = /(^|\/)(__MACOSX\/|\._|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i
// Anclado al nombre completo: `IMG_1.jpg.supplemental-metadata.json` es un
// sidecar de foto, no el `metadata.json` global del álbum.
const GLOBAL_JSON_RE =
  /(^|\/)(metadata|print-subscriptions|shared_album_comments|user-generated-memory-titles)\.json$/i

export function isZipFile(file) {
  return (
    /\.zip$/i.test(file?.name || '') ||
    ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'].includes(file?.type)
  )
}

export function isImageFile(file) {
  return /^image\//.test(file?.type || '') || IMAGE_RE.test(file?.name || '')
}

function mimeFor(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'avif') return 'image/avif'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'tif' || ext === 'tiff') return 'image/tiff'
  if (ext === 'heic' || ext === 'heif') return 'image/heic'
  return 'image/jpeg'
}

const dirOf = (path) => path.slice(0, path.lastIndexOf('/') + 1)
const baseOf = (path) => path.slice(path.lastIndexOf('/') + 1)

/**
 * Quita los sufijos que Google añade al nombre del sidecar.
 * `IMG_1.JPG.supplemental-metadata.json` → `IMG_1.JPG`
 */
function stripJsonSuffix(name) {
  return name
    .replace(JSON_RE, '')
    .replace(/\.supplemental-metadata$/i, '')
    .replace(/\.suppl(emental)?(-met[a-z]*)?$/i, '')
}

/**
 * Normaliza el contador de duplicados: Google lo mueve de sitio entre el
 * archivo y su sidecar (`IMG(1).JPG` frente a `IMG.JPG(1)`).
 * Devuelve { key, n }.
 */
function normalizeCounter(name) {
  let n = ''
  let out = name.replace(/\((\d+)\)(?=(\.[A-Za-z0-9]+)?$)/, (_, d) => {
    n = d
    return ''
  })
  // Contador antes de la extensión: "IMG_1234(1).JPG"
  out = out.replace(/\((\d+)\)(?=\.)/, (_, d) => {
    n = d
    return ''
  })
  return { key: out.toLowerCase(), n }
}

/**
 * Empareja cada imagen con su sidecar JSON.
 * Google trunca los nombres largos, así que hay un último intento por prefijo.
 */
export function matchSidecars(imagePaths, jsonPaths) {
  const index = new Map()
  for (const jp of jsonPaths) {
    const { key, n } = normalizeCounter(stripJsonSuffix(baseOf(jp)))
    index.set(`${dirOf(jp)}${key}#${n}`, jp)
  }

  const result = new Map()
  const unused = new Set(jsonPaths)

  for (const ip of imagePaths) {
    const dir = dirOf(ip)
    const base = baseOf(ip)
    const { key, n } = normalizeCounter(base)
    let hit = index.get(`${dir}${key}#${n}`)

    // Variantes editadas por Google no llevan sidecar propio.
    if (!hit) {
      const plain = key.replace(/[-_ ](edited|editado|ha edytowane)(?=\.)/i, '')
      hit = index.get(`${dir}${plain}#${n}`) || index.get(`${dir}${plain}#`)
    }
    // Nombres truncados por Google: se busca el sidecar cuyo nombre sea prefijo.
    if (!hit) {
      const stem = key.replace(/\.[a-z0-9]+$/i, '')
      for (const jp of unused) {
        if (dirOf(jp) !== dir) continue
        const jk = stripJsonSuffix(baseOf(jp)).toLowerCase()
        if (jk.length >= 8 && (stem.startsWith(jk.replace(/\.[a-z0-9]+$/i, '')) || jk.startsWith(stem))) {
          hit = jp
          break
        }
      }
    }
    if (hit) {
      result.set(ip, hit)
      unused.delete(hit)
    }
  }
  return result
}

/** Google escribe 0/0 cuando no conoce la posición. */
function validCoord(geo) {
  if (!geo) return null
  const lat = Number(geo.latitude)
  const lon = Number(geo.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat === 0 && lon === 0) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const alt = Number(geo.altitude)
  return { lat, lon, altitude: Number.isFinite(alt) && alt !== 0 ? alt : null }
}

/** Extrae la metadata útil de un sidecar de Takeout. */
export function parseSidecar(json) {
  if (!json || typeof json !== 'object') return null
  const geo = validCoord(json.geoDataExif) || validCoord(json.geoData)
  const ts = Number(json.photoTakenTime?.timestamp ?? json.creationTime?.timestamp)
  const out = {}
  if (geo) {
    out.lat = geo.lat
    out.lon = geo.lon
    if (geo.altitude != null) out.altitude = geo.altitude
    out.locationSource = 'takeout'
  }
  if (Number.isFinite(ts) && ts > 0) out.takenAt = new Date(ts * 1000).toISOString()
  if (json.description) out.description = String(json.description).slice(0, 2000)
  if (json.people?.length) out.people = json.people.map((p) => p.name).filter(Boolean)
  return Object.keys(out).length ? out : null
}

/**
 * Abre un .zip y devuelve las entradas de imagen encontradas.
 * Los blobs se extraen bajo demanda (`getBlob`) para no cargar todo el
 * contenido descomprimido en memoria de una sola vez.
 */
export async function extractImagesFromZip(file, { onProgress } = {}) {
  onProgress?.({ phase: 'reading', label: file.name })
  const zip = await JSZip.loadAsync(file)

  const imagePaths = []
  const jsonPaths = []
  zip.forEach((path, entry) => {
    if (entry.dir || SKIP_RE.test(path)) return
    if (IMAGE_RE.test(path)) imagePaths.push(path)
    else if (JSON_RE.test(path) && !GLOBAL_JSON_RE.test(path)) jsonPaths.push(path)
  })

  if (!imagePaths.length) {
    throw new Error('El archivo .zip no contiene imágenes reconocibles.')
  }

  imagePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  onProgress?.({ phase: 'matching', label: `${imagePaths.length} imágenes`, total: imagePaths.length })

  const pairs = matchSidecars(imagePaths, jsonPaths)

  // Los sidecars son pequeños: se leen todos por adelantado.
  const fallbacks = new Map()
  for (const [imagePath, jsonPath] of pairs) {
    try {
      const text = await zip.file(jsonPath).async('string')
      const parsed = parseSidecar(JSON.parse(text))
      if (parsed) fallbacks.set(imagePath, parsed)
    } catch {
      /* sidecar ilegible: la foto se importa igual, solo con su EXIF */
    }
  }

  return imagePaths.map((path) => ({
    path,
    name: baseOf(path),
    fallback: fallbacks.get(path) || null,
    origin: 'zip',
    async getBlob() {
      const buf = await zip.file(path).async('arraybuffer')
      return new Blob([buf], { type: mimeFor(path) })
    },
  }))
}

/** Resumen para mostrarle al usuario qué trajo el zip. */
export function summarize(entries) {
  const withGeo = entries.filter((e) => Number.isFinite(e.fallback?.lat)).length
  return { total: entries.length, withSidecarGeo: withGeo }
}
