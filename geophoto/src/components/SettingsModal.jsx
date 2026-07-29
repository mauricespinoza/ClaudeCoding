import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import Modal from './Modal'

export default function SettingsModal({ open, settings, onClose, onSave, storage }) {
  const [draft, setDraft] = useState(settings)

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  if (!open) return null
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <Modal onClose={onClose} title="Ajustes" width="max-w-lg">
      <div className="space-y-4 p-4 text-xs">
        <div>
          <label className="label">Google Maps JavaScript API key</label>
          <input
            className="input"
            placeholder="AIza…"
            value={draft.googleMapsApiKey}
            onChange={(e) => set({ googleMapsApiKey: e.target.value.trim() })}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Con key se usa Google Maps (mapa, satélite, híbrido y terreno). Sin key la app funciona
            igual con un mapa base libre (OSM / Esri World Imagery / OpenTopoMap). La key se guarda
            solo en este navegador; restringe su uso por dominio en Google Cloud Console.
          </p>
        </div>

        <div>
          <label className="label">Proxy CORS para Google Photos</label>
          <input
            className="input"
            placeholder="https://mi-proxy.workers.dev/?url={url}"
            value={draft.corsProxy}
            onChange={(e) => set({ corsProxy: e.target.value.trim() })}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Debe incluir <code>{'{url}'}</code>, que se reemplaza por la URL destino codificada. Se
            usa tanto para leer el HTML del álbum como para descargar las imágenes.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Puntos de la rosa de los vientos</label>
            <select
              className="input"
              value={draft.compassPoints}
              onChange={(e) => set({ compassPoints: Number(e.target.value) })}
            >
              <option value={8}>8 (N, NE, E…)</option>
              <option value={16}>16 (N, NNE, NE, ENE…)</option>
              <option value={32}>32 (N, NbE, NNE…)</option>
            </select>
          </div>
          <div>
            <label className="label">Campo de visión por defecto (°)</label>
            <input
              type="number"
              min={5}
              max={180}
              className="input"
              value={draft.defaultFov}
              onChange={(e) => set({ defaultFov: Number(e.target.value) })}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Se usa cuando el EXIF no trae la focal equivalente a 35 mm.
            </p>
          </div>
        </div>

        {storage && (
          <div className="rounded-md border border-ink-600 bg-ink-900/60 p-2 text-[11px] text-slate-400">
            Almacenamiento local usado: {(storage.usage / 1024 ** 2).toFixed(1)} MB
            {storage.quota ? ` de ~${(storage.quota / 1024 ** 3).toFixed(1)} GB disponibles` : ''}.
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-ink-600 p-3">
        <button type="button" className="btn" onClick={onClose}>
          <X size={13} /> Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            onSave(draft)
            onClose()
          }}
        >
          Guardar
        </button>
      </div>
    </Modal>
  )
}
