// Carga diferida de la Google Maps JavaScript API.

let loaderPromise = null
let loadedKey = null

export function isGoogleMapsReady() {
  return typeof window !== 'undefined' && !!window.google?.maps
}

/**
 * Inyecta el script de Google Maps una sola vez por sesión.
 * Cambiar de API key requiere recargar la página (limitación de la propia API).
 */
export function loadGoogleMaps(apiKey, { libraries = ['marker'], language = 'es' } = {}) {
  if (!apiKey) return Promise.reject(new Error('Falta la API key de Google Maps'))
  if (isGoogleMapsReady() && loadedKey === apiKey) return Promise.resolve(window.google.maps)
  if (loaderPromise && loadedKey === apiKey) return loaderPromise

  loadedKey = apiKey
  loaderPromise = new Promise((resolve, reject) => {
    const cbName = `__geophotoMapsCb_${Math.random().toString(36).slice(2, 8)}`
    window[cbName] = () => {
      delete window[cbName]
      resolve(window.google.maps)
    }
    const script = document.createElement('script')
    const params = new URLSearchParams({
      key: apiKey,
      callback: cbName,
      language,
      v: 'weekly',
    })
    if (libraries.length) params.set('libraries', libraries.join(','))
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => {
      loaderPromise = null
      loadedKey = null
      delete window[cbName]
      reject(new Error('No se pudo cargar Google Maps. Revisa la API key y las restricciones de dominio.'))
    }
    document.head.appendChild(script)
  })
  return loaderPromise
}

export const GOOGLE_MAP_TYPES = {
  roadmap: 'roadmap',
  satellite: 'satellite',
  hybrid: 'hybrid',
  terrain: 'terrain',
}
