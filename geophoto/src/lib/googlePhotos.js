// Importación desde álbumes compartidos de Google Photos.
//
// Limitación real del navegador: photos.google.com no envía cabeceras CORS, por lo que
// una app 100% cliente no puede leer el HTML del álbum directamente. Por eso el flujo
// admite un proxy CORS configurable por el usuario (self-hosted o público) y, como
// alternativa siempre disponible, pegar directamente las URLs de las imágenes.

const LH_RE = /https:\/\/lh\d\.googleusercontent\.com\/[A-Za-z0-9\-_/.]+(?:=[A-Za-z0-9\-_]+)?/g

export function isGooglePhotosUrl(url) {
  return /^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com|goo\.gl\/photos)/i.test(
    (url || '').trim()
  )
}

/**
 * Normaliza una URL de lh3 para pedir el original.
 * `=d` devuelve el archivo original (conserva EXIF/GPS cuando el álbum lo permite).
 */
export function toOriginalUrl(url, size = 'd') {
  const base = url.split('=')[0]
  return `${base}=${size}`
}

/** Extrae URLs de fotos únicas desde el HTML de un álbum compartido. */
export function parseAlbumHtml(html) {
  const matches = html.match(LH_RE) || []
  const seen = new Set()
  const out = []
  for (const m of matches) {
    const base = m.split('=')[0]
    // Los avatares y los iconos de UI usan rutas cortas o el sufijo de tamaño "s32"/"s64".
    if (/=s\d{1,3}(-|$)/.test(m)) continue
    if (base.length < 60) continue
    if (seen.has(base)) continue
    seen.add(base)
    out.push(base)
  }
  return out
}

/** Construye la URL final a pedir, aplicando el proxy CORS si está configurado. */
export function withProxy(url, corsProxy) {
  if (!corsProxy) return url
  return corsProxy.includes('{url}')
    ? corsProxy.replace('{url}', encodeURIComponent(url))
    : `${corsProxy}${url}`
}

/**
 * Obtiene la lista de URLs de imágenes de un álbum compartido.
 * Lanza un error explicativo si el navegador bloquea la petición.
 */
export async function listAlbumPhotos(albumUrl, { corsProxy = '' } = {}) {
  const target = withProxy(albumUrl.trim(), corsProxy)
  let res
  try {
    res = await fetch(target, { mode: 'cors', redirect: 'follow' })
  } catch (err) {
    throw new Error(
      corsProxy
        ? `El proxy CORS no respondió (${err.message}). Revisa la URL del proxy en Ajustes.`
        : 'Google Photos bloquea la lectura directa desde el navegador (CORS). ' +
          'Configura un proxy CORS en Ajustes o pega las URLs de las imágenes.'
    )
  }
  if (!res.ok) throw new Error(`El álbum respondió HTTP ${res.status}.`)
  const html = await res.text()
  const urls = parseAlbumHtml(html)
  if (!urls.length) {
    throw new Error(
      'No se encontraron fotos en la respuesta. Verifica que el álbum sea público ' +
        '("cualquiera con el enlace") y que el proxy devuelva el HTML completo.'
    )
  }
  return urls
}

/** Separa un texto pegado en URLs de imágenes individuales. */
export function parsePastedUrls(text) {
  return (text || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
}
