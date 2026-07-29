import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import Modal from './Modal'
import { buildKmz, buildStandaloneKml, downloadBlob } from '../lib/kml'
import { canvasToBlob, decodeOriented } from '../lib/images'

/** Reescala un blob de imagen a un lado máximo (0 = original). */
async function resizeBlob(blob, maxSide, quality = 0.88) {
  if (!maxSide) return blob
  const decoded = await decodeOriented(blob)
  const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height))
  if (scale >= 1) return blob
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(decoded.width * scale)
  canvas.height = Math.round(decoded.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
  decoded.close?.()
  return canvasToBlob(canvas, 'image/jpeg', quality)
}

export default function KmlExportModal({
  open,
  photos,
  compassPoints,
  defaultFov,
  onClose,
  getFull,
  getThumb,
  getAnnotated,
}) {
  const [opts, setOpts] = useState({
    format: 'kmz',
    documentName: 'Fotos geolocalizadas',
    thumbWidth: 320,
    iconMode: 'pin',
    includeFovWedge: false,
    fovDistance: 150,
    maxFullSide: 2048,
    useAnnotated: true,
    embedFullImage: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!open) return null
  const set = (patch) => setOpts((o) => ({ ...o, ...patch }))

  const positioned = photos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  const skipped = photos.length - positioned.length

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const items = []
      for (const meta of positioned) {
        const annotated = opts.useAnnotated && meta.hasAnnotatedRender ? await getAnnotated(meta.id) : null
        const full = annotated || (await getFull(meta.id))
        const thumb = await getThumb(meta.id)
        if (!full || !thumb) continue
        items.push({
          meta,
          fullBlob: await resizeBlob(full, opts.maxFullSide),
          thumbBlob: thumb,
        })
      }
      if (!items.length) throw new Error('No hay fotos con coordenadas para exportar.')

      const common = {
        documentName: opts.documentName,
        thumbWidth: Number(opts.thumbWidth),
        iconMode: opts.iconMode,
        includeFovWedge: opts.includeFovWedge,
        fovDistance: Number(opts.fovDistance),
        defaultFov,
        compassPoints,
      }
      const safeName = opts.documentName.replace(/[^\w\-]+/g, '_') || 'fotos'
      if (opts.format === 'kmz') {
        const blob = await buildKmz(items, common)
        downloadBlob(blob, `${safeName}.kmz`)
      } else {
        const kml = await buildStandaloneKml(items, {
          ...common,
          embedFullImage: opts.embedFullImage,
        })
        downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `${safeName}.kml`)
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Exportar a Google Earth (KML / KMZ)" onClose={onClose} width="max-w-xl">
      <div className="space-y-4 p-4 text-xs">
        <div className="rounded-md border border-ink-600 bg-ink-900/60 p-2 text-[11px] text-slate-400">
          Se exportarán <b className="text-slate-200">{positioned.length}</b> fotos seleccionadas con
          coordenadas
          {skipped > 0 && ` (${skipped} sin coordenadas quedan fuera)`}. En Google Earth cada
          marcador abre un globo con la miniatura; al hacer clic en ella se abre la imagen completa.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Formato</label>
            <select className="input" value={opts.format} onChange={(e) => set({ format: e.target.value })}>
              <option value="kmz">KMZ — imágenes empaquetadas (recomendado)</option>
              <option value="kml">KML — un solo archivo de texto</option>
            </select>
          </div>
          <div>
            <label className="label">Nombre del documento</label>
            <input
              className="input"
              value={opts.documentName}
              onChange={(e) => set({ documentName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Ancho de la miniatura en el globo (px)</label>
            <input
              type="number"
              min={120}
              max={800}
              className="input"
              value={opts.thumbWidth}
              onChange={(e) => set({ thumbWidth: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Icono del marcador</label>
            <select className="input" value={opts.iconMode} onChange={(e) => set({ iconMode: e.target.value })}>
              <option value="pin">Chincheta de cámara</option>
              <option value="thumb">Miniatura de la foto</option>
            </select>
          </div>
          <div>
            <label className="label">Lado máximo de la imagen completa (px)</label>
            <select
              className="input"
              value={opts.maxFullSide}
              onChange={(e) => set({ maxFullSide: Number(e.target.value) })}
            >
              <option value={0}>Original (archivo más pesado)</option>
              <option value={1600}>1600 px</option>
              <option value={2048}>2048 px</option>
              <option value={3200}>3200 px</option>
            </select>
          </div>
          <div>
            <label className="label">Cono de visión</label>
            <label className="mt-1.5 flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-sky-500"
                checked={opts.includeFovWedge}
                onChange={(e) => set({ includeFovWedge: e.target.checked })}
              />
              Dibujar el campo de visión (usa el rumbo EXIF)
            </label>
            {opts.includeFovWedge && (
              <input
                type="number"
                min={20}
                max={5000}
                className="input mt-1.5"
                value={opts.fovDistance}
                onChange={(e) => set({ fovDistance: e.target.value })}
                placeholder="Alcance en metros"
              />
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-slate-300">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-sky-500"
            checked={opts.useAnnotated}
            onChange={(e) => set({ useAnnotated: e.target.checked })}
          />
          Usar la versión anotada cuando exista (se guarda al exportar desde el editor)
        </label>

        {opts.format === 'kml' && (
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-sky-500"
              checked={opts.embedFullImage}
              onChange={(e) => set({ embedFullImage: e.target.checked })}
            />
            Incrustar también la imagen completa en base64 (KML mucho más pesado)
          </label>
        )}

        {error && <div className="rounded-md bg-rose-950/60 px-2 py-1.5 text-rose-200">{error}</div>}
      </div>

      <div className="flex justify-end gap-2 border-t border-ink-600 p-3">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !positioned.length} onClick={run}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Exportar {opts.format.toUpperCase()}
        </button>
      </div>
    </Modal>
  )
}
