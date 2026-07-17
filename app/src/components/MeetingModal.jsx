import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { STATUS, STATUS_LABEL, emptyMeetingAction } from '../model.js'

const STATUS_CYCLE_CLASS = {
  [STATUS.NOT_STARTED]: 'bg-gray-100 text-gray-700 border-gray-300',
  [STATUS.IN_PROGRESS]: 'bg-amber-100 text-amber-800 border-amber-300',
  [STATUS.DONE]: 'bg-emerald-100 text-emerald-800 border-emerald-300',
}

const STATUS_ORDER = [STATUS.NOT_STARTED, STATUS.IN_PROGRESS, STATUS.DONE]

// Registro estructurado de una reunión: ideas principales, asistentes,
// acuerdos y acciones a seguir (cada una con responsable y plazo), asociable
// a un proyecto.
export function MeetingModal({ meeting, projects, isNew, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(meeting)

  const patch = (fields) => setDraft((d) => ({ ...d, ...fields }))

  const patchAction = (actionId, fields) =>
    patch({ actions: draft.actions.map((a) => (a.id === actionId ? { ...a, ...fields } : a)) })

  const addAction = () => patch({ actions: [...draft.actions, emptyMeetingAction()] })

  const removeAction = (actionId) => patch({ actions: draft.actions.filter((a) => a.id !== actionId) })

  const cycleActionStatus = (action) =>
    patchAction(action.id, { status: STATUS_ORDER[(STATUS_ORDER.indexOf(action.status) + 1) % STATUS_ORDER.length] })

  const handleSave = () => {
    if (!draft.title.trim()) return
    // Acciones sin texto se descartan silenciosamente al guardar.
    onSave({ ...draft, actions: draft.actions.filter((a) => a.text.trim()) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-8 w-full max-w-xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">{isNew ? 'Nueva reunión' : 'Editar reunión'}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Título</label>
              <input
                autoFocus
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Ej. Reunión de avance con tesistas"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Fecha</label>
              <input
                type="date"
                value={draft.date ?? ''}
                onChange={(e) => patch({ date: e.target.value || null })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Proyecto asociado</label>
              <select
                value={draft.projectId ?? ''}
                onChange={(e) => patch({ projectId: e.target.value || null })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              >
                <option value="">Sin proyecto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Asistentes</label>
              <input
                value={draft.attendees}
                onChange={(e) => patch({ attendees: e.target.value })}
                placeholder="Separados por comas"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Ideas principales</label>
            <textarea
              value={draft.mainIdeas}
              onChange={(e) => patch({ mainIdeas: e.target.value })}
              rows={3}
              placeholder="Los puntos centrales que se discutieron…"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Acuerdos</label>
            <textarea
              value={draft.agreements}
              onChange={(e) => patch({ agreements: e.target.value })}
              rows={2}
              placeholder="Qué se acordó…"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Acciones a seguir</label>
              <button
                type="button"
                onClick={addAction}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                <Plus size={12} /> Acción
              </button>
            </div>
            <div className="space-y-2">
              {draft.actions.length === 0 && (
                <p className="py-1 text-xs text-gray-400">Sin acciones registradas.</p>
              )}
              {draft.actions.map((action) => (
                <div key={action.id} className="rounded-md border border-gray-200 p-2">
                  <div className="flex items-start gap-2">
                    <input
                      value={action.text}
                      onChange={(e) => patchAction(action.id, { text: e.target.value })}
                      placeholder="Qué hay que hacer…"
                      className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeAction(action.id)}
                      className="mt-1 shrink-0 rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <input
                      value={action.assignee}
                      onChange={(e) => patchAction(action.id, { assignee: e.target.value })}
                      placeholder="Responsable"
                      className="w-32 rounded border border-gray-200 px-2 py-0.5 text-xs focus:border-blue-400 focus:outline-none"
                    />
                    <input
                      type="date"
                      value={action.deadline ?? ''}
                      onChange={(e) => patchAction(action.id, { deadline: e.target.value || null })}
                      title="Plazo"
                      className="rounded border border-gray-200 px-2 py-0.5 text-xs focus:border-blue-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => cycleActionStatus(action)}
                      title="Click para cambiar el estado"
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CYCLE_CLASS[action.status]}`}
                    >
                      {STATUS_LABEL[action.status]}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          {!isNew ? (
            <button
              type="button"
              onClick={() => onDelete(draft.id)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!draft.title.trim()}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
