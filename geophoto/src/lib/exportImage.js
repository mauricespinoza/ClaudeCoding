// Exportación del lienzo del editor a PNG, TIFF, PDF y SVG con resolución ajustable.

import UTIF from 'utif'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'

/** Blob URL temporal a partir del marcado SVG. */
function svgObjectUrl(svg) {
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
}

/** Rasteriza el SVG en un canvas del tamaño pedido. */
export async function rasterize(svg, targetWidth, targetHeight, background = null) {
  const url = svgObjectUrl(svg)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('No se pudo rasterizar el SVG'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(targetWidth))
    canvas.height = Math.max(1, Math.round(targetHeight))
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`No se pudo generar ${type}`))),
      type,
      quality
    )
  })
}

// --- PNG ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Inserta el chunk pHYs para que el PNG declare los DPI indicados. */
async function injectPngDpi(blob, dpi) {
  if (!Number.isFinite(dpi) || dpi <= 0) return blob
  const buf = new Uint8Array(await blob.arrayBuffer())
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const dv = new DataView(chunk.buffer)
  dv.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
  dv.setUint32(8, ppm)
  dv.setUint32(12, ppm)
  chunk[16] = 1 // unidad: metros
  dv.setUint32(17, crc32(chunk.subarray(4, 17)))

  // Se inserta justo después de IHDR (offset fijo: firma 8 + IHDR 25 bytes).
  const insertAt = 8 + 25
  if (buf.length < insertAt) return blob
  const out = new Uint8Array(buf.length + chunk.length)
  out.set(buf.subarray(0, insertAt), 0)
  out.set(chunk, insertAt)
  out.set(buf.subarray(insertAt), insertAt + chunk.length)
  return new Blob([out], { type: 'image/png' })
}

export async function exportPng(svg, { width, height, dpi = 96, background = null } = {}) {
  const canvas = await rasterize(svg, width, height, background)
  const blob = await canvasToBlob(canvas, 'image/png')
  return injectPngDpi(blob, dpi)
}

export async function exportJpeg(svg, { width, height, quality = 0.92 } = {}) {
  const canvas = await rasterize(svg, width, height, '#ffffff')
  return canvasToBlob(canvas, 'image/jpeg', quality)
}

// --- TIFF --------------------------------------------------------------------

export async function exportTiff(svg, { width, height, dpi = 300, background = null } = {}) {
  const canvas = await rasterize(svg, width, height, background)
  const ctx = canvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const metadata = {
    t282: [dpi], // XResolution
    t283: [dpi], // YResolution
    t296: [2], // ResolutionUnit = pulgadas
    t305: ['GeoPhoto Studio'],
  }
  const ab = UTIF.encodeImage(data, canvas.width, canvas.height, metadata)
  return new Blob([ab], { type: 'image/tiff' })
}

// --- SVG ---------------------------------------------------------------------

export function exportSvg(svg) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
}

// --- PDF ---------------------------------------------------------------------

/**
 * PDF vectorial: las anotaciones se escriben como vectores y la foto como imagen
 * incrustada. Si el motor vectorial falla, se cae a un PDF rasterizado.
 */
export async function exportPdf(
  svg,
  { width, height, dpi = 300, vector = true, background = null } = {}
) {
  const ptW = (width * 72) / dpi
  const ptH = (height * 72) / dpi
  const doc = new jsPDF({
    orientation: ptW >= ptH ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [ptW, ptH],
    compress: true,
  })

  if (vector) {
    const holder = document.createElement('div')
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none'
    holder.innerHTML = svg
    document.body.appendChild(holder)
    try {
      const el = holder.querySelector('svg')
      await svg2pdf(el, doc, { x: 0, y: 0, width: ptW, height: ptH })
      return doc.output('blob')
    } catch (err) {
      console.warn('svg2pdf falló, se exporta el PDF rasterizado:', err)
    } finally {
      holder.remove()
    }
  }

  const canvas = await rasterize(svg, width, height, background || '#ffffff')
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
  const raster = new jsPDF({
    orientation: ptW >= ptH ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [ptW, ptH],
    compress: true,
  })
  raster.addImage(dataUrl, 'JPEG', 0, 0, ptW, ptH)
  return raster.output('blob')
}

// --- Orquestador -------------------------------------------------------------

export const EXPORT_FORMATS = [
  { id: 'png', label: 'PNG', ext: 'png', raster: true, note: 'Transparencia + DPI en metadata' },
  { id: 'tiff', label: 'TIFF', ext: 'tif', raster: true, note: 'Sin compresión, RGBA, DPI' },
  { id: 'pdf', label: 'PDF', ext: 'pdf', raster: false, note: 'Anotaciones vectoriales' },
  { id: 'svg', label: 'SVG', ext: 'svg', raster: false, note: 'Vectorial editable' },
  { id: 'jpeg', label: 'JPEG', ext: 'jpg', raster: true, note: 'Fondo blanco, sin alfa' },
]

export async function exportAs(format, svg, opts) {
  switch (format) {
    case 'png':
      return exportPng(svg, opts)
    case 'tiff':
      return exportTiff(svg, opts)
    case 'pdf':
      return exportPdf(svg, opts)
    case 'jpeg':
      return exportJpeg(svg, opts)
    case 'svg':
    default:
      return exportSvg(svg)
  }
}
