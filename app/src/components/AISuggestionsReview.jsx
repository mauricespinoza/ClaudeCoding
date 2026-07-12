import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'

// Revisión obligatoria antes de insertar nada (ARQUITECTURA.md §5, paso 4):
// el usuario acepta, edita o descarta cada tarea sugerida; solo lo aceptado
// se convierte en una única acción INSERT_AI_SUGGESTIONS.
export function AISuggestionsReview({ activities, onConfirm, onCancel }) {
  const [draft, setDraft] = useState(
    activities.map((activity) => ({
      name: activity.name,
      tasks: activity.tasks.map((t) => ({ ...t, accepted: true })),
    })),
  )

  const updateTask = (activityIdx, taskIdx, patch) => {
    setDraft((d) =>
      d.map((a, ai) =>
        ai !== activityIdx
          ? a
          : { ...a, tasks: a.tasks.map((t, ti) => (ti === taskIdx ? { ...t, ...patch } : t)) },
      ),
    )
  }

  const acceptedCount = draft.reduce((sum, a) => sum + a.tasks.filter((t) => t.accepted).length, 0)

  const handleConfirm = () => {
    const activitiesToInsert = draft
      .map((a) => ({ name: a.name, tasks: a.tasks.filter((t) => t.accepted) }))
      .filter((a) => a.tasks.length > 0)
    onConfirm(activitiesToInsert)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-8 w-full max-w-xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Sparkles size={16} className="text-violet-600" />
            Revisar sugerencias de IA
          </h2>
          <button type="button" onClick={onCancel} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto px-5 py-4">
          {draft.map((activity, ai) => (
            <div key={ai}>
              <p className="mb-2 text-sm font-semibold text-gray-800">{activity.name}</p>
              <div className="space-y-2">
                {activity.tasks.map((task, ti) => (
                  <div
                    key={ti}
                    className={`rounded-md border px-3 py-2 ${
                      task.accepted ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-50'
                    }`}
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={task.accepted}
                        onChange={(e) => updateTask(ai, ti, { accepted: e.target.checked })}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <input
                          value={task.name}
                          onChange={(e) => updateTask(ai, ti, { name: e.target.value })}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm font-medium focus:border-blue-400 focus:outline-none"
                        />
                        <textarea
                          value={task.description}
                          onChange={(e) => updateTask(ai, ti, { description: e.target.value })}
                          rows={2}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:border-blue-400 focus:outline-none"
                        />
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          <label className="flex items-center gap-1">
                            <input
                              type="date"
                              value={task.suggestedDeadline ?? ''}
                              onChange={(e) => updateTask(ai, ti, { suggestedDeadline: e.target.value || null })}
                              className="rounded border border-gray-200 px-1.5 py-0.5"
                            />
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={task.important}
                              onChange={(e) => updateTask(ai, ti, { important: e.target.checked })}
                            />
                            Importante
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={task.urgent}
                              onChange={(e) => updateTask(ai, ti, { urgent: e.target.checked })}
                            />
                            Urgente
                          </label>
                        </div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          <span className="text-xs text-gray-500">{acceptedCount} tarea(s) seleccionada(s)</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Descartar todo
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={acceptedCount === 0}
              className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Insertar seleccionadas
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
