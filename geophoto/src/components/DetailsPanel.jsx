import { Compass, Crosshair, PenTool } from 'lucide-react'
import { formatBearing, toDMS } from '../lib/geo'

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-ink-700/60 py-1 text-[11px] last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="truncate text-right text-slate-200">{children}</span>
    </div>
  )
}

export default function DetailsPanel({ photo, thumbUrl, compassPoints, onUpdateMeta, onEdit, onPlace }) {
  if (!photo) {
    return (
      <div className="card p-4 text-center text-[11px] text-slate-500">
        Selecciona una foto de la tabla para ver y editar su información.
      </div>
    )
  }
  const hasPos = Number.isFinite(photo.lat) && Number.isFinite(photo.lon)

  return (
    <div className="card overflow-hidden">
      {thumbUrl && (
        <img src={thumbUrl} alt={photo.name} className="h-32 w-full object-cover" />
      )}
      <div className="space-y-2 p-3">
        <div>
          <label className="label">Título</label>
          <input
            className="input"
            value={photo.title || ''}
            placeholder={photo.name}
            onChange={(e) => onUpdateMeta(photo.id, { title: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Descripción (aparece en el globo del KML)</label>
          <textarea
            className="input h-16 resize-y"
            value={photo.description || ''}
            onChange={(e) => onUpdateMeta(photo.id, { description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Latitud</label>
            <input
              type="number"
              step="0.000001"
              className="input"
              value={Number.isFinite(photo.lat) ? photo.lat : ''}
              onChange={(e) =>
                onUpdateMeta(photo.id, {
                  lat: e.target.value === '' ? null : Number(e.target.value),
                  manualLocation: true,
                })
              }
            />
          </div>
          <div>
            <label className="label">Longitud</label>
            <input
              type="number"
              step="0.000001"
              className="input"
              value={Number.isFinite(photo.lon) ? photo.lon : ''}
              onChange={(e) =>
                onUpdateMeta(photo.id, {
                  lon: e.target.value === '' ? null : Number(e.target.value),
                  manualLocation: true,
                })
              }
            />
          </div>
        </div>

        <div>
          <label className="label">Rumbo de la cámara (grados)</label>
          <div className="flex gap-1">
            <input
              type="number"
              min={0}
              max={359}
              className="input"
              value={Number.isFinite(photo.bearing) ? Math.round(photo.bearing) : ''}
              placeholder="Sin dato EXIF"
              onChange={(e) =>
                onUpdateMeta(photo.id, {
                  bearing: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
            <span className="btn shrink-0 cursor-default">
              <Compass size={12} />
              {Number.isFinite(photo.bearing) ? formatBearing(photo.bearing, compassPoints, false) : '—'}
            </span>
          </div>
        </div>

        <div className="pt-1">
          <Row label="Archivo">{photo.name}</Row>
          {hasPos && (
            <>
              <Row label="DMS">{toDMS(photo.lat, true)} {toDMS(photo.lon, false)}</Row>
              <Row label="Origen">
                {photo.manualLocation ? 'Ubicación manual' : 'GPS del EXIF'}
              </Row>
            </>
          )}
          {Number.isFinite(photo.altitude) && <Row label="Altitud">{photo.altitude.toFixed(1)} m</Row>}
          {photo.focal35 && <Row label="Focal (eq. 35 mm)">{photo.focal35} mm</Row>}
          {Number.isFinite(photo.fov) && <Row label="Campo de visión">{Math.round(photo.fov)}°</Row>}
          {(photo.make || photo.model) && (
            <Row label="Cámara">{[photo.make, photo.model].filter(Boolean).join(' ')}</Row>
          )}
          <Row label="Dimensiones">{photo.width}×{photo.height} px</Row>
          {photo.annotations?.shapes?.length > 0 && (
            <Row label="Anotaciones">{photo.annotations.shapes.length} objetos</Row>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" className="btn btn-primary flex-1 justify-center" onClick={() => onEdit(photo.id)}>
            <PenTool size={13} /> Editar
          </button>
          <button type="button" className="btn flex-1 justify-center" onClick={() => onPlace(photo.id)}>
            <Crosshair size={13} /> Ubicar
          </button>
        </div>
      </div>
    </div>
  )
}
