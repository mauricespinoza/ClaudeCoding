// Lectura de EXIF, normalización de orientación y generación de miniaturas.

import exifr from 'exifr'
import { fovFromFocal35 } from './geo'

export const THUMB_MAX = 480

/** Identificador corto y estable. */
export function uid(prefix = 'p') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Extrae la metadata relevante de un archivo/blob de imagen.
 * Devuelve siempre un objeto (campos en null si no hay EXIF).
 */
export async function readExif(blob) {
  const empty = {
    lat: null,
    lon: null,
    altitude: null,
    bearing: null,
    bearingRef: null,
    fov: null,
    focal35: null,
    takenAt: null,
    make: null,
    model: null,
    orientation: null,
  }
  let raw = null
  try {
    raw = await exifr.parse(blob, {
      tiff: true,
      exif: true,
      gps: true,
      ifd0: true,
      translateValues: true,
      reviveValues: true,
    })
  } catch {
    return empty
  }
  if (!raw) return empty

  const lat = Number.isFinite(raw.latitude) ? raw.latitude : null
  const lon = Number.isFinite(raw.longitude) ? raw.longitude : null
  const focal35 = Number.isFinite(raw.FocalLengthIn35mmFormat)
    ? raw.FocalLengthIn35mmFormat
    : null
  const bearing = Number.isFinite(raw.GPSImgDirection) ? raw.GPSImgDirection : null

  return {
    ...empty,
    lat,
    lon,
    altitude: Number.isFinite(raw.GPSAltitude) ? raw.GPSAltitude : null,
    bearing,
    bearingRef: raw.GPSImgDirectionRef || null,
    focal35,
    fov: fovFromFocal35(focal35),
    takenAt: toIso(raw.DateTimeOriginal || raw.CreateDate || raw.ModifyDate),
    make: raw.Make || null,
    model: raw.Model || null,
    orientation: Number.isFinite(raw.Orientation) ? raw.Orientation : null,
  }
}

function toIso(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Decodifica un blob respetando la orientación EXIF.
 * Devuelve { source, width, height } donde source sirve para drawImage().
 */
export async function decodeOriented(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
    } catch {
      /* navegador sin soporte de imageOrientation: se usa el fallback */
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImageElement(url)
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => {},
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
}

export function loadImageElement(src, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = crossOrigin
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src.slice(0, 80)}`))
    img.src = src
  })
}

/** Genera una miniatura JPEG con el lado mayor = maxSize. */
export async function makeThumbnail(blob, maxSize = THUMB_MAX, quality = 0.82) {
  const decoded = await decodeOriented(blob)
  const { width, height } = decoded
  const scale = Math.min(1, maxSize / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(decoded.source, 0, 0, w, h)
  decoded.close?.()
  const out = await canvasToBlob(canvas, 'image/jpeg', quality)
  return { blob: out, width: w, height: h, naturalWidth: width, naturalHeight: height }
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo serializar el canvas'))),
      type,
      quality
    )
  })
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

/**
 * Convierte un archivo/blob en un registro completo de foto.
 * `origin` describe la procedencia ('upload' | 'google-photos' | 'url').
 */
export async function ingestBlob(blob, { name, origin = 'upload', sourceUrl = null } = {}) {
  const exif = await readExif(blob)
  const thumb = await makeThumbnail(blob)
  const id = uid()
  const meta = {
    id,
    name: name || blob.name || 'foto.jpg',
    origin,
    sourceUrl,
    mime: blob.type || 'image/jpeg',
    bytes: blob.size,
    width: thumb.naturalWidth,
    height: thumb.naturalHeight,
    thumbWidth: thumb.width,
    thumbHeight: thumb.height,
    addedAt: new Date().toISOString(),
    ...exif,
    manualLocation: false,
    title: '',
    description: '',
    annotations: null, // documento del editor vectorial
    hasAnnotatedRender: false,
  }
  return { meta, fullBlob: blob, thumbBlob: thumb.blob }
}

/** Descarga una URL remota como blob (con proxy CORS opcional). */
export async function fetchImageBlob(url, corsProxy = '') {
  const target = corsProxy ? corsProxy.replace('{url}', encodeURIComponent(url)) : url
  const res = await fetch(target, { mode: 'cors' })
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) {
    throw new Error(`La URL no devolvió una imagen (${blob.type || 'sin tipo'})`)
  }
  return blob
}
