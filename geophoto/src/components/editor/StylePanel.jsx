import { ArrowLeft, ArrowRight, Trash2, Copy, MoveDown, MoveUp } from 'lucide-react'

const DASHES = [
  { id: '', label: 'Continua' },
  { id: '12 8', label: 'Discontinua' },
  { id: '3 7', label: 'Punteada' },
  { id: '20 8 4 8', label: 'Raya-punto' },
]

const SWATCHES = [
  '#ff3b30',
  '#ff9500',
  '#ffd60a',
  '#34c759',
  '#00c7be',
  '#0a84ff',
  '#5e5ce6',
  '#bf5af2',
  '#ffffff',
  '#8e8e93',
  '#000000',
]

function ColorField({ label, value, onChange, allowNone }) {
  const isNone = !value || value === 'none'
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          className="h-7 w-9 cursor-pointer rounded border border-ink-500 bg-ink-800"
          value={isNone ? '#000000' : value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="input font-mono"
          value={isNone ? 'none' : value}
          onChange={(e) => onChange(e.target.value)}
        />
        {allowNone && (
          <button
            type="button"
            className={`btn shrink-0 ${isNone ? 'btn-primary' : ''}`}
            title="Sin color"
            onClick={() => onChange(isNone ? '#ffffff' : 'none')}
          >
            ∅
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            className="h-4 w-4 rounded border border-black/40"
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, onChange, suffix }) {
  return (
    <div>
      <label className="label flex justify-between">
        <span>{label}</span>
        <span className="text-slate-300">
          {typeof value === 'number' ? Math.round(value * 100) / 100 : value}
          {suffix || ''}
        </span>
      </label>
      <input
        type="range"
        className="w-full accent-sky-500"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export default function StylePanel({
  style,
  onStyle,
  selectedShapes,
  onShapePatch,
  onDelete,
  onDuplicate,
  onOrder,
}) {
  const textShape = selectedShapes.length === 1 && selectedShapes[0].type === 'text' ? selectedShapes[0] : null
  const hasSelection = selectedShapes.length > 0

  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          {hasSelection
            ? `${selectedShapes.length} objeto${selectedShapes.length > 1 ? 's' : ''} seleccionado${
                selectedShapes.length > 1 ? 's' : ''
              }`
            : 'Estilo para nuevos objetos'}
        </span>
        {hasSelection && (
          <div className="flex gap-1">
            <button type="button" className="btn btn-ghost" title="Subir" onClick={() => onOrder('up')}>
              <MoveUp size={12} />
            </button>
            <button type="button" className="btn btn-ghost" title="Bajar" onClick={() => onOrder('down')}>
              <MoveDown size={12} />
            </button>
            <button type="button" className="btn btn-ghost" title="Duplicar (Ctrl+D)" onClick={onDuplicate}>
              <Copy size={12} />
            </button>
            <button type="button" className="btn btn-ghost text-rose-300" title="Eliminar (Supr)" onClick={onDelete}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      <ColorField label="Trazo" value={style.stroke} onChange={(v) => onStyle({ stroke: v })} allowNone />
      <Slider
        label="Grosor"
        value={style.strokeWidth}
        min={0.5}
        max={60}
        step={0.5}
        onChange={(v) => onStyle({ strokeWidth: v })}
        suffix=" px"
      />
      <Slider
        label="Opacidad del trazo"
        value={style.strokeOpacity ?? 1}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => onStyle({ strokeOpacity: v })}
      />
      <div>
        <label className="label">Tipo de línea</label>
        <select
          className="input"
          value={style.strokeDash || ''}
          onChange={(e) => onStyle({ strokeDash: e.target.value })}
        >
          {DASHES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <ColorField label="Relleno" value={style.fill} onChange={(v) => onStyle({ fill: v })} allowNone />
      <Slider
        label="Opacidad del relleno"
        value={style.fillOpacity ?? 1}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => onStyle({ fillOpacity: v })}
      />

      <div>
        <label className="label">Terminaciones</label>
        <div className="flex gap-1">
          <button
            type="button"
            className={`btn flex-1 ${style.markerStart ? 'btn-primary' : ''}`}
            onClick={() => onStyle({ markerStart: !style.markerStart })}
          >
            <ArrowLeft size={12} /> Inicio
          </button>
          <button
            type="button"
            className={`btn flex-1 ${style.markerEnd ? 'btn-primary' : ''}`}
            onClick={() => onStyle({ markerEnd: !style.markerEnd })}
          >
            Fin <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {textShape && (
        <div className="space-y-2 rounded-md border border-ink-600 bg-ink-900/50 p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Texto</div>
          <textarea
            className="input h-16 resize-y"
            value={textShape.text}
            onChange={(e) => onShapePatch({ text: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Tamaño</label>
              <input
                type="number"
                className="input"
                min={4}
                value={Math.round(textShape.fontSize)}
                onChange={(e) => onShapePatch({ fontSize: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Alineación</label>
              <select
                className="input"
                value={textShape.anchor}
                onChange={(e) => onShapePatch({ anchor: e.target.value })}
              >
                <option value="start">Izquierda</option>
                <option value="middle">Centro</option>
                <option value="end">Derecha</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Tipografía</label>
            <select
              className="input"
              value={textShape.fontFamily}
              onChange={(e) => onShapePatch({ fontFamily: e.target.value })}
            >
              <option value="Helvetica, Arial, sans-serif">Helvetica / Arial</option>
              <option value="Georgia, 'Times New Roman', serif">Georgia / Times</option>
              <option value="'Courier New', monospace">Courier</option>
              <option value="system-ui, sans-serif">Sistema</option>
            </select>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className={`btn flex-1 ${textShape.fontWeight >= 700 ? 'btn-primary' : ''}`}
              onClick={() => onShapePatch({ fontWeight: textShape.fontWeight >= 700 ? 400 : 700 })}
            >
              <b>B</b>
            </button>
            <button
              type="button"
              className={`btn flex-1 ${textShape.italic ? 'btn-primary' : ''}`}
              onClick={() => onShapePatch({ italic: !textShape.italic })}
            >
              <i>I</i>
            </button>
            <button
              type="button"
              className={`btn flex-1 ${textShape.halo ? 'btn-primary' : ''}`}
              title="Contorno de legibilidad"
              onClick={() => onShapePatch({ halo: !textShape.halo })}
            >
              Halo
            </button>
          </div>
          {textShape.halo && (
            <Slider
              label="Grosor del halo"
              value={textShape.haloWidth}
              min={0}
              max={20}
              step={0.5}
              onChange={(v) => onShapePatch({ haloWidth: v })}
            />
          )}
        </div>
      )}
    </div>
  )
}
