import { Compass, RotateCcw } from 'lucide-react'
import { compassLabels } from '../../lib/vector'
import { fovFromFocal35 } from '../../lib/geo'

/**
 * Controles de los rótulos cardinales que se dibujan en las esquinas superiores
 * izquierda y derecha de la foto.
 */
export default function CompassPanel({ compass, onChange, photo, defaultFov }) {
  const labels = compassLabels(compass)
  const exifFov = fovFromFocal35(photo?.focal35)

  return (
    <div className="space-y-3 p-3 text-xs">
      <label className="flex items-center justify-between gap-2 rounded-md border border-ink-600 bg-ink-900/50 px-2 py-2">
        <span className="flex items-center gap-2 font-medium text-slate-200">
          <Compass size={14} className="text-sky-400" />
          Direcciones cardinales
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-sky-500"
          checked={compass.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
      </label>

      <div className="rounded-md border border-ink-600 bg-ink-900/50 p-2">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Vista previa</div>
        <div className="flex items-center justify-between rounded bg-black/60 px-2 py-1.5 font-bold text-white">
          <span>{labels.left}</span>
          <span className="text-[10px] font-normal text-slate-400">
            centro {Math.round(compass.bearing)}°
          </span>
          <span>{labels.right}</span>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          El extremo izquierdo corresponde al rumbo del centro menos medio campo de visión, y el
          derecho al rumbo más medio campo de visión.
        </p>
      </div>

      <div>
        <label className="label flex justify-between">
          <span>Rumbo del centro de la foto</span>
          <span className="text-slate-300">{Math.round(compass.bearing)}°</span>
        </label>
        <input
          type="range"
          min={0}
          max={359}
          className="w-full accent-sky-500"
          value={compass.bearing}
          onChange={(e) => onChange({ bearing: Number(e.target.value) })}
        />
        <div className="mt-1 flex gap-1">
          <input
            type="number"
            min={0}
            max={359}
            className="input"
            value={Math.round(compass.bearing)}
            onChange={(e) => onChange({ bearing: Number(e.target.value) })}
          />
          {Number.isFinite(photo?.bearing) && (
            <button
              type="button"
              className="btn shrink-0"
              title="Volver al rumbo del EXIF"
              onClick={() => onChange({ bearing: photo.bearing })}
            >
              <RotateCcw size={12} /> EXIF
            </button>
          )}
        </div>
        {!Number.isFinite(photo?.bearing) && (
          <p className="mt-1 text-[10px] text-amber-400/80">
            La foto no trae rumbo en el EXIF (GPSImgDirection); ajústalo manualmente.
          </p>
        )}
      </div>

      <div>
        <label className="label flex justify-between">
          <span>Campo de visión horizontal</span>
          <span className="text-slate-300">{Math.round(compass.fov)}°</span>
        </label>
        <input
          type="range"
          min={5}
          max={180}
          className="w-full accent-sky-500"
          value={compass.fov}
          onChange={(e) => onChange({ fov: Number(e.target.value) })}
        />
        <div className="mt-1 flex gap-1">
          {exifFov && (
            <button type="button" className="btn flex-1" onClick={() => onChange({ fov: exifFov })}>
              EXIF {Math.round(exifFov)}° ({photo.focal35} mm)
            </button>
          )}
          <button type="button" className="btn flex-1" onClick={() => onChange({ fov: defaultFov })}>
            Por defecto {defaultFov}°
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Precisión</label>
          <select
            className="input"
            value={compass.points}
            onChange={(e) => onChange({ points: Number(e.target.value) })}
          >
            <option value={8}>8 rumbos</option>
            <option value={16}>16 rumbos (NNE…)</option>
            <option value={32}>32 rumbos</option>
          </select>
        </div>
        <div>
          <label className="label">Tamaño de letra</label>
          <input
            type="number"
            min={0}
            className="input"
            value={compass.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            placeholder="0 = automático"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-slate-300">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-sky-500"
          checked={compass.showDegrees}
          onChange={(e) => onChange({ showDegrees: e.target.checked })}
        />
        Mostrar también los grados
      </label>

      <label className="flex items-center gap-2 text-slate-300">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-sky-500"
          checked={compass.plate}
          onChange={(e) => onChange({ plate: e.target.checked })}
        />
        Placa de fondo semitransparente
      </label>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Color del texto</label>
          <input
            type="color"
            className="h-7 w-full cursor-pointer rounded border border-ink-500 bg-ink-800"
            value={compass.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Color de la placa</label>
          <input
            type="color"
            className="h-7 w-full cursor-pointer rounded border border-ink-500 bg-ink-800"
            value={compass.plateColor}
            onChange={(e) => onChange({ plateColor: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="label flex justify-between">
          <span>Opacidad de la placa</span>
          <span className="text-slate-300">{Math.round(compass.plateOpacity * 100)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          className="w-full accent-sky-500"
          value={compass.plateOpacity}
          onChange={(e) => onChange({ plateOpacity: Number(e.target.value) })}
        />
      </div>

      <div>
        <label className="label">Margen desde el borde (px, 0 = automático)</label>
        <input
          type="number"
          min={0}
          className="input"
          value={compass.margin}
          onChange={(e) => onChange({ margin: Number(e.target.value) })}
        />
      </div>
    </div>
  )
}
