// Recortes de imagen pegados en notas: si hay sesión en la nube, se suben a
// Supabase Storage (bucket "note-images", el usuario lo crea una vez); en
// modo local no hay backend de objetos, así que la imagen queda inline como
// data URL dentro de la propia nota — con aviso si pesa lo suficiente como
// para preocupar al límite de localStorage (ARQUITECTURA.md §7, ~5-10 MB).

import { usingLocalBackend } from './storage.js'
import { uploadNoteImage } from './cloud.js'

const WARN_INLINE_BYTES = 400 * 1024 // ~400 KB

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Devuelve { url, dataUrl } o null si el usuario cancela por tamaño.
// `url` es lo que se persiste en la nota (remoto en nube, data URL en local);
// `dataUrl` se mantiene solo en memoria de esta sesión para poder pedir OCR
// sin re-descargar la imagen.
export async function resolveNoteImage(blob, tempId) {
  const dataUrl = await blobToDataUrl(blob)

  if (!usingLocalBackend()) {
    const ext = (blob.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '')
    const url = await uploadNoteImage(blob, `${tempId}.${ext}`)
    return { url, dataUrl }
  }

  if (blob.size > WARN_INLINE_BYTES) {
    const proceed = window.confirm(
      `La imagen pesa ${(blob.size / 1024).toFixed(0)} KB y quedará guardada dentro de la nota (modo local, sin ` +
        'cuenta en la nube). Varias imágenes así pueden saturar el almacenamiento del navegador. ' +
        '¿Continuar de todas formas? (Inicia sesión con tu cuenta Supabase para subirlas a la nube en vez de esto.)',
    )
    if (!proceed) return null
  }

  return { url: dataUrl, dataUrl }
}
