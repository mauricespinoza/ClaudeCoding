import { useState } from 'react'
import { Clipboard, Loader2, ScanText, X } from 'lucide-react'
import { resolveNoteImage } from '../noteImages.js'
import { requestImageOCR } from '../aiSuggest.js'

function newTempId() {
  return `img_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// Área de "pega una imagen aquí" (Ctrl+V) para recortes en notas. `value` es
// null o { url, dataUrl, ocrText }; `url` es lo que se persiste en la nota
// (Supabase Storage en modo nube, data URL en modo local — ver
// noteImages.js), `dataUrl` solo vive en memoria de esta sesión para poder
// pedir OCR sin re-descargar.
export function NoteImageField({ value, onChange, aiConfig }) {
  const [busy, setBusy] = useState(false)
  const [ocring, setOcring] = useState(false)
  const [error, setError] = useState(null)

  const handlePaste = async (e) => {
    const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'))
    if (!item) return
    e.preventDefault()
    const blob = item.getAsFile()
    if (!blob) return
    setError(null)
    setBusy(true)
    try {
      const resolved = await resolveNoteImage(blob, newTempId())
      if (resolved) onChange({ ...resolved, ocrText: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const runOcr = async () => {
    if (!value) return
    setError(null)
    setOcring(true)
    try {
      const ocrText = await requestImageOCR(value.dataUrl, aiConfig)
      onChange({ ...value, ocrText })
    } catch (err) {
      setError(err.message)
    } finally {
      setOcring(false)
    }
  }

  return (
    <div>
      <div
        tabIndex={0}
        onPaste={handlePaste}
        className="rounded-md border border-dashed border-gray-300 px-2.5 py-1.5 text-[11px] text-gray-400 focus:border-blue-400 focus:outline-none"
      >
        {value ? (
          <div className="flex items-start gap-2">
            <img src={value.url} alt="Recorte pegado" className="h-12 w-12 shrink-0 rounded border border-gray-200 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-gray-600">{value.ocrText || 'Sin OCR aún'}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={runOcr}
                  disabled={ocring}
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline disabled:opacity-50"
                >
                  {ocring ? <Loader2 size={11} className="animate-spin" /> : <ScanText size={11} />}
                  {value.ocrText ? 'Repetir OCR' : 'Extraer texto (OCR)'}
                </button>
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="inline-flex items-center gap-1 text-gray-400 hover:text-red-500"
                >
                  <X size={11} /> Quitar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="inline-flex items-center gap-1">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Clipboard size={11} />}
            Click aquí y pega una imagen (Ctrl+V) para adjuntarla
          </p>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
