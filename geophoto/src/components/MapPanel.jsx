import { useState } from 'react'
import { Crosshair, Globe2, Layers, Map as MapIcon, Mountain, Satellite, X } from 'lucide-react'
import GoogleMapView from './GoogleMapView'
import LeafletMapView from './LeafletMapView'

const MAP_TYPES = [
  { id: 'roadmap', label: 'Mapa', icon: MapIcon },
  { id: 'satellite', label: 'Satélite', icon: Satellite },
  { id: 'hybrid', label: 'Híbrido', icon: Layers },
  { id: 'terrain', label: 'Terreno', icon: Mountain },
]

export default function MapPanel({
  photos,
  selectedIds,
  activeId,
  apiKey,
  mapType,
  onMapType,
  placingId,
  onCancelPlacing,
  onSelect,
  onMove,
  onPlace,
}) {
  const [mapError, setMapError] = useState(null)
  const useGoogle = !!apiKey && !mapError
  const positioned = photos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))

  // `isolate` confina los z-index internos de Leaflet y Google Maps (llegan a 800)
  // dentro de su propio contexto de apilamiento: así nunca tapan los modales.
  return (
    <div className="relative isolate z-0 h-full w-full overflow-hidden">
      {useGoogle ? (
        <GoogleMapView
          apiKey={apiKey}
          photos={photos}
          selectedIds={selectedIds}
          activeId={activeId}
          mapType={mapType}
          placingId={placingId}
          onSelect={onSelect}
          onMove={onMove}
          onPlace={onPlace}
          onError={setMapError}
        />
      ) : (
        <LeafletMapView
          photos={photos}
          selectedIds={selectedIds}
          activeId={activeId}
          mapType={mapType}
          placingId={placingId}
          onSelect={onSelect}
          onMove={onMove}
          onPlace={onPlace}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto flex overflow-hidden rounded-md border border-ink-500 bg-ink-800/95 shadow-lg backdrop-blur">
          {MAP_TYPES.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onMapType(t.id)}
                title={t.label}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition ${
                  mapType === t.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-ink-600'
                }`}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            )
          })}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <span className="chip bg-ink-800/95 backdrop-blur">
            <Globe2 size={11} />
            {useGoogle ? 'Google Maps' : 'Mapa base libre'}
          </span>
          <span className="chip bg-ink-800/95 backdrop-blur">
            {positioned.length}/{photos.length} con coordenadas
          </span>
        </div>
      </div>

      {mapError && (
        <div className="absolute inset-x-2 bottom-2 rounded-md border border-amber-600/60 bg-amber-950/90 px-3 py-2 text-xs text-amber-200">
          Google Maps no cargó ({mapError}). Se está usando el mapa base libre.
        </div>
      )}

      {placingId && (
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-3 rounded-md border border-sky-500/60 bg-sky-950/90 px-3 py-2 text-xs text-sky-100">
          <span className="flex items-center gap-2">
            <Crosshair size={14} />
            Haz clic en el mapa para asignar la ubicación de la foto.
          </span>
          <button type="button" className="btn btn-ghost" onClick={onCancelPlacing}>
            <X size={12} /> Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
