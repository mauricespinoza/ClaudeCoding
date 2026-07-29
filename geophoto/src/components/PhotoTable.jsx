import { useMemo, useState } from 'react'
import {
  Compass,
  Crosshair,
  ImageOff,
  MapPin,
  PenTool,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { formatBearing, formatLatLon } from '../lib/geo'

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

export default function PhotoTable({
  photos,
  thumbUrls,
  selectedIds,
  activeId,
  compassPoints,
  onToggle,
  onToggleAll,
  onActivate,
  onEdit,
  onPlace,
  onDelete,
  onUpdateMeta,
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all') // all | located | unlocated | annotated

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return photos.filter((p) => {
      if (q && !`${p.name} ${p.title} ${p.description}`.toLowerCase().includes(q)) return false
      const hasPos = Number.isFinite(p.lat) && Number.isFinite(p.lon)
      if (filter === 'located') return hasPos
      if (filter === 'unlocated') return !hasPos
      if (filter === 'annotated') return !!p.annotations?.shapes?.length
      return true
    })
  }, [photos, query, filter])

  const allVisibleSelected =
    visible.length > 0 && visible.every((p) => selectedIds.includes(p.id))

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-600 px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-sky-500"
            checked={allVisibleSelected}
            onChange={() => onToggleAll(visible.map((p) => p.id), !allVisibleSelected)}
          />
          Seleccionar
        </label>
        <span className="chip">{selectedIds.length} seleccionadas</span>
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input w-44 pl-6"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input w-36" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todas</option>
          <option value="located">Con coordenadas</option>
          <option value="unlocated">Sin coordenadas</option>
          <option value="annotated">Con anotaciones</option>
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-slate-500">
            <ImageOff size={28} />
            <p>No hay fotos que coincidan. Importa imágenes desde el panel superior.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-ink-800 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="w-24 px-2 py-2 text-left">Miniatura</th>
                <th className="px-2 py-2 text-left">Título / archivo</th>
                <th className="w-44 px-2 py-2 text-left">Coordenadas</th>
                <th className="w-28 px-2 py-2 text-left">Rumbo</th>
                <th className="w-36 px-2 py-2 text-left">Fecha</th>
                <th className="w-32 px-2 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const hasPos = Number.isFinite(p.lat) && Number.isFinite(p.lon)
                const selected = selectedIds.includes(p.id)
                const isActive = activeId === p.id
                const shapeCount = p.annotations?.shapes?.length || 0
                return (
                  <tr
                    key={p.id}
                    onClick={() => onActivate(p.id)}
                    className={`cursor-pointer border-b border-ink-700/70 transition ${
                      isActive ? 'bg-sky-950/60' : selected ? 'bg-ink-700/50' : 'hover:bg-ink-700/30'
                    }`}
                  >
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-sky-500"
                        checked={selected}
                        onChange={() => onToggle(p.id)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="relative h-14 w-20 overflow-hidden rounded border border-ink-600 bg-ink-900">
                        {thumbUrls[p.id] ? (
                          <img
                            src={thumbUrls[p.id]}
                            alt={p.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-600">
                            <ImageOff size={16} />
                          </div>
                        )}
                        {shapeCount > 0 && (
                          <span className="absolute bottom-0.5 right-0.5 rounded bg-emerald-600/90 px-1 text-[9px] font-bold text-white">
                            <Sparkles size={8} className="inline" /> {shapeCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="input mb-1 bg-transparent"
                        value={p.title || ''}
                        placeholder={p.name}
                        onChange={(e) => onUpdateMeta(p.id, { title: e.target.value })}
                      />
                      <div className="truncate text-[10px] text-slate-500">
                        {p.name} · {p.width}×{p.height} · {fmtBytes(p.bytes)}
                        {p.origin !== 'upload' && ` · ${p.origin}`}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {hasPos ? (
                        <span
                          className="flex items-center gap-1 text-slate-300"
                          title={
                            p.manualLocation
                              ? 'Ubicación asignada a mano'
                              : p.locationSource === 'takeout'
                                ? 'Coordenadas del JSON de Google Takeout'
                                : 'GPS del EXIF de la foto'
                          }
                        >
                          <MapPin
                            size={11}
                            className={
                              p.manualLocation
                                ? 'text-amber-400'
                                : p.locationSource === 'takeout'
                                  ? 'text-sky-400'
                                  : 'text-emerald-400'
                            }
                          />
                          {formatLatLon(p.lat, p.lon, 5)}
                        </span>
                      ) : (
                        <span className="text-slate-500">Sin coordenadas</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {Number.isFinite(p.bearing) ? (
                        <span className="flex items-center gap-1 text-slate-300">
                          <Compass size={11} className="text-sky-400" />
                          {formatBearing(p.bearing, compassPoints)}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-400">{fmtDate(p.takenAt)}</td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          title="Editar y anotar"
                          onClick={() => onEdit(p.id)}
                        >
                          <PenTool size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          title="Ubicar en el mapa"
                          onClick={() => onPlace(p.id)}
                        >
                          <Crosshair size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost text-rose-300"
                          title="Eliminar"
                          onClick={() => onDelete(p.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
