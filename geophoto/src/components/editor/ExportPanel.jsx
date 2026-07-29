import { useMemo, useState } from 'react'
import { Download, Loader2, Save } from 'lucide-react'
import { EXPORT_FORMATS, exportAs, exportPng } from '../../lib/exportImage'
import { downloadBlob } from '../../lib/kml'

const PRESETS = [0.25, 0.5, 1, 2, 4]

export default function ExportPanel({ width, height, baseName, buildSvg, onSaveAnnotated }) {
  const [format, setFormat] = useState('png')
  const [scale, setScale] = useState(1)
  const [customWidth, setCustomWidth] = useState('')
  const [dpi, setDpi] = useState(300)
  const [transparent, setTransparent] = useState(false)
  const [includeImage, setIncludeImage] = useState(true)
  const [vectorPdf, setVectorPdf] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const outWidth = useMemo(() => {
    const w = customWidth ? Number(customWidth) : Math.round(width * scale)
    return Math.max(1, Math.min(30000, w || 1))
  }, [customWidth, scale, width])
  const outHeight = Math.max(1, Math.round((outWidth / width) * height))
  const megapixels = (outWidth * outHeight) / 1e6
  const isRaster = ['png', 'tiff', 'jpeg'].includes(format)

  const run = async (download = true) => {
    setBusy(true)
    setMsg(null)
    try {
      const svg = await buildSvg({ includeImage, background: null })
      const opts = {
        width: outWidth,
        height: outHeight,
        dpi: Number(dpi),
        background: transparent ? null : format === 'jpeg' ? '#ffffff' : null,
        vector: vectorPdf,
      }
      const blob = await exportAs(format, svg, opts)
      const fmt = EXPORT_FORMATS.find((f) => f.id === format)
      if (download) {
        downloadBlob(blob, `${baseName}_anotada.${fmt.ext}`)
        setMsg({ kind: 'ok', text: `Exportado ${fmt.label} · ${outWidth}×${outHeight} px` })
      }
      return blob
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
      return null
    } finally {
      setBusy(false)
    }
  }

  const saveForKml = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const svg = await buildSvg({ includeImage: true, background: null })
      const blob = await exportPng(svg, { width, height, dpi: 96 })
      await onSaveAnnotated(blob)
      setMsg({ kind: 'ok', text: 'Versión anotada guardada: se usará en la exportación KML/KMZ.' })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 p-3 text-xs">
      <div>
        <label className="label">Formato</label>
        <div className="grid grid-cols-3 gap-1">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              title={f.note}
              className={`btn justify-center ${format === f.id ? 'btn-primary' : ''}`}
              onClick={() => setFormat(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          {EXPORT_FORMATS.find((f) => f.id === format)?.note}
        </p>
      </div>

      {format !== 'svg' && (
        <div>
          <label className="label">Resolución de salida</label>
          <div className="mb-1 flex gap-1">
            {PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                className={`btn flex-1 justify-center ${!customWidth && scale === s ? 'btn-primary' : ''}`}
                onClick={() => {
                  setScale(s)
                  setCustomWidth('')
                }}
              >
                ×{s}
              </button>
            ))}
          </div>
          <input
            type="number"
            className="input"
            placeholder={`Ancho personalizado en px (original: ${width})`}
            value={customWidth}
            onChange={(e) => setCustomWidth(e.target.value)}
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>
              Salida: <b className="text-slate-200">{outWidth}×{outHeight} px</b> ({megapixels.toFixed(1)} MP)
            </span>
            <span>Original: {width}×{height}</span>
          </div>
          {megapixels > 80 && (
            <p className="mt-1 text-[10px] text-amber-400">
              Resolución muy alta: el navegador puede quedarse sin memoria.
            </p>
          )}
        </div>
      )}

      {format !== 'svg' && format !== 'jpeg' && (
        <div>
          <label className="label">DPI declarados</label>
          <div className="flex gap-1">
            {[72, 150, 300, 600].map((d) => (
              <button
                key={d}
                type="button"
                className={`btn flex-1 justify-center ${Number(dpi) === d ? 'btn-primary' : ''}`}
                onClick={() => setDpi(d)}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {format === 'pdf'
              ? `Tamaño de página: ${((outWidth * 25.4) / dpi).toFixed(1)} × ${(
                  (outHeight * 25.4) / dpi
                ).toFixed(1)} mm`
              : 'Se escribe en la metadata del archivo (para maquetación e impresión).'}
          </p>
        </div>
      )}

      <div className="space-y-1.5 rounded-md border border-ink-600 bg-ink-900/50 p-2">
        <label className="flex items-center gap-2 text-slate-300">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-sky-500"
            checked={includeImage}
            onChange={(e) => setIncludeImage(e.target.checked)}
          />
          Incluir la fotografía de fondo
        </label>
        <label className="flex items-center gap-2 text-slate-300">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-sky-500"
            checked={transparent}
            disabled={format === 'jpeg'}
            onChange={(e) => setTransparent(e.target.checked)}
          />
          Fondo transparente {format === 'jpeg' && '(no disponible en JPEG)'}
        </label>
        {!includeImage && (
          <p className="text-[10px] text-slate-500">
            Solo se exportan las anotaciones: útil para superponerlas en otro programa.
          </p>
        )}
        {format === 'pdf' && (
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-sky-500"
              checked={vectorPdf}
              onChange={(e) => setVectorPdf(e.target.checked)}
            />
            PDF vectorial (anotaciones editables)
          </label>
        )}
      </div>

      <button type="button" className="btn btn-primary w-full justify-center" disabled={busy} onClick={() => run(true)}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Exportar {EXPORT_FORMATS.find((f) => f.id === format)?.label}
      </button>

      <button type="button" className="btn w-full justify-center" disabled={busy} onClick={saveForKml}>
        <Save size={13} /> Guardar versión anotada para KML
      </button>

      {msg && (
        <div
          className={`rounded-md px-2 py-1.5 text-[11px] ${
            msg.kind === 'error' ? 'bg-rose-950/60 text-rose-200' : 'bg-emerald-950/60 text-emerald-200'
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  )
}
