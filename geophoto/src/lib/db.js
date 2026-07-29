// Persistencia local: IndexedDB para blobs de fotos + metadata.
// Se evita cualquier dependencia externa; el esquema es mínimo y versionado.

const DB_NAME = 'geophoto-studio'
const DB_VERSION = 1
const STORE_META = 'photos'
const STORE_BLOB = 'blobs'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_BLOB)) {
        db.createObjectStore(STORE_BLOB)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode)
        const s = t.objectStore(store)
        let result
        try {
          result = fn(s)
        } catch (err) {
          reject(err)
          return
        }
        t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
  )
}

export async function putPhotoMeta(meta) {
  await tx(STORE_META, 'readwrite', (s) => s.put(meta))
  return meta
}

export async function deletePhoto(id) {
  await tx(STORE_META, 'readwrite', (s) => s.delete(id))
  await tx(STORE_BLOB, 'readwrite', (s) => {
    s.delete(`${id}:full`)
    s.delete(`${id}:thumb`)
  })
}

export async function getAllPhotoMeta() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_META, 'readonly')
    const req = t.objectStore(STORE_META).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function putBlob(key, blob) {
  await tx(STORE_BLOB, 'readwrite', (s) => s.put(blob, key))
}

export async function getBlob(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_BLOB, 'readonly')
    const req = t.objectStore(STORE_BLOB).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function clearAll() {
  await tx(STORE_META, 'readwrite', (s) => s.clear())
  await tx(STORE_BLOB, 'readwrite', (s) => s.clear())
}

/** Uso aproximado de almacenamiento del origen. */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}

// --- Ajustes en localStorage -------------------------------------------------

const SETTINGS_KEY = 'geophoto:settings'

export const DEFAULT_SETTINGS = {
  googleMapsApiKey: '',
  mapType: 'satellite',
  compassPoints: 16,
  defaultFov: 65,
  corsProxy: '',
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* cuota llena o modo privado: los ajustes quedan solo en memoria */
  }
}
