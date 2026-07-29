import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, Trash2, Unlock } from 'lucide-react'

const TYPE_LABEL = {
  path: 'Trazo',
  rect: 'Rectángulo',
  ellipse: 'Elipse',
  text: 'Texto',
}

export default function LayersPanel({ shapes, selection, onSelect, onPatch, onDelete, onOrder }) {
  if (!shapes.length) {
    return (
      <div className="p-4 text-center text-[11px] text-slate-500">
        Aún no hay objetos. Dibuja con las herramientas de la barra izquierda.
      </div>
    )
  }
  // Se listan de arriba hacia abajo en el orden visual (el último es el superior).
  const ordered = [...shapes].reverse()

  return (
    <div className="divide-y divide-ink-700 text-xs">
      {ordered.map((s) => {
        const selected = selection.includes(s.id)
        return (
          <div
            key={s.id}
            className={`flex items-center gap-1.5 px-2 py-1.5 ${selected ? 'bg-sky-950/60' : 'hover:bg-ink-700/40'}`}
          >
            <button
              type="button"
              className="btn btn-ghost p-1"
              title={s.visible === false ? 'Mostrar' : 'Ocultar'}
              onClick={() => onPatch(s.id, { visible: s.visible === false })}
            >
              {s.visible === false ? <EyeOff size={12} className="text-slate-500" /> : <Eye size={12} />}
            </button>
            <button
              type="button"
              className="btn btn-ghost p-1"
              title={s.locked ? 'Desbloquear' : 'Bloquear'}
              onClick={() => onPatch(s.id, { locked: !s.locked })}
            >
              {s.locked ? <Lock size={12} className="text-amber-400" /> : <Unlock size={12} />}
            </button>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => onSelect([s.id])}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm border border-black/40"
                style={{
                  background: s.style.fill !== 'none' ? s.style.fill : s.style.stroke,
                  opacity: s.style.fill !== 'none' ? s.style.fillOpacity : s.style.strokeOpacity,
                }}
              />
              <span className="truncate">
                {s.type === 'text' ? `“${String(s.text).slice(0, 18)}”` : s.name || TYPE_LABEL[s.type]}
              </span>
            </button>
            <button type="button" className="btn btn-ghost p-1" title="Subir" onClick={() => onOrder(s.id, 'up')}>
              <ChevronUp size={12} />
            </button>
            <button type="button" className="btn btn-ghost p-1" title="Bajar" onClick={() => onOrder(s.id, 'down')}>
              <ChevronDown size={12} />
            </button>
            <button
              type="button"
              className="btn btn-ghost p-1 text-rose-300"
              title="Eliminar"
              onClick={() => onDelete([s.id])}
            >
              <Trash2 size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
