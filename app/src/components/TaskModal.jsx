import { useMemo, useState } from 'react'
import { Paperclip, Plus, Trash2, X } from 'lucide-react'
import { STATUS, STATUS_LABEL, emptyProject, newProjectId } from '../model.js'
import { VoiceButton } from './VoiceButton.jsx'

const STATUS_CYCLE_CLASS = {
  [STATUS.NOT_STARTED]: 'bg-gray-100 text-gray-700 border-gray-300',
  [STATUS.IN_PROGRESS]: 'bg-amber-100 text-amber-800 border-amber-300',
  [STATUS.DONE]: 'bg-emerald-100 text-emerald-800 border-emerald-300',
}

function StatusPill({ status, onClick, size = 'sm' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Click para cambiar el estado"
      className={`inline-flex items-center rounded-full border font-medium ${STATUS_CYCLE_CLASS[status]} ${
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
      }`}
    >
      {STATUS_LABEL[status]}
    </button>
  )
}

export function TaskModal({ task, projects, onClose, onSave, onDelete, dispatch }) {
  const [draft, setDraft] = useState(task)
  const [newChecklistText, setNewChecklistText] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newAttachmentLabel, setNewAttachmentLabel] = useState('')
  const [newAttachmentRef, setNewAttachmentRef] = useState('')

  const currentProject = useMemo(
    () => projects.find((p) => p.id === draft.projectId) ?? null,
    [projects, draft.projectId],
  )

  const activityOptions = currentProject?.activityOrder ?? []

  const patch = (fields) => setDraft((d) => ({ ...d, ...fields }))

  const handleSave = () => {
    if (!draft.name.trim()) return
    onSave(draft)
  }

  const cycleChecklistStatus = (itemId) => {
    setDraft((d) => ({
      ...d,
      checklist: d.checklist.map((c) => {
        if (c.id !== itemId) return c
        const order = [STATUS.NOT_STARTED, STATUS.IN_PROGRESS, STATUS.DONE]
        const next = order[(order.indexOf(c.status) + 1) % order.length]
        return { ...c, status: next }
      }),
    }))
  }

  const addChecklistItem = () => {
    if (!newChecklistText.trim()) return
    setDraft((d) => ({
      ...d,
      checklist: [
        ...d.checklist,
        { id: `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: newChecklistText.trim(), status: STATUS.NOT_STARTED },
      ],
    }))
    setNewChecklistText('')
  }

  const removeChecklistItem = (itemId) => {
    setDraft((d) => ({ ...d, checklist: d.checklist.filter((c) => c.id !== itemId) }))
  }

  const addAttachment = () => {
    if (!newAttachmentLabel.trim() || !newAttachmentRef.trim()) return
    setDraft((d) => ({
      ...d,
      attachments: [
        ...d.attachments,
        {
          id: `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          label: newAttachmentLabel.trim(),
          ref: newAttachmentRef.trim(),
          kind: 'goodnotes',
        },
      ],
    }))
    setNewAttachmentLabel('')
    setNewAttachmentRef('')
  }

  const removeAttachment = (attachmentId) => {
    setDraft((d) => ({ ...d, attachments: d.attachments.filter((a) => a.id !== attachmentId) }))
  }

  const createProjectInline = () => {
    if (!newProjectName.trim()) return
    const project = { ...emptyProject({ name: newProjectName.trim() }), id: newProjectId() }
    dispatch({ type: 'ADD_PROJECT', payload: { seed: {}, overrides: project } })
    patch({ projectId: project.id, activity: null })
    setNewProjectName('')
    setShowNewProject(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-8 w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">
            {task.name ? 'Editar tarea' : 'Nueva tarea'}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Nombre</label>
            <div className="flex gap-2">
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Ej. Procesar muestras de la campaña de terreno"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              <VoiceButton onResult={(text) => patch({ name: (draft.name ? draft.name + ' ' : '') + text })} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Descripción</label>
            <div className="flex gap-2">
              <textarea
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              <VoiceButton
                onResult={(text) =>
                  patch({ description: (draft.description ? draft.description + ' ' : '') + text })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Deadline</label>
              <input
                type="date"
                value={draft.deadline ?? ''}
                onChange={(e) => patch({ deadline: e.target.value || null })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Responsable</label>
              <input
                value={draft.assignee}
                onChange={(e) => patch({ assignee: e.target.value })}
                placeholder="Ej. yo, tesista X"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Proyecto</label>
            {!showNewProject ? (
              <div className="flex gap-2">
                <select
                  value={draft.projectId ?? ''}
                  onChange={(e) => patch({ projectId: e.target.value || null, activity: null })}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                >
                  <option value="">Sin proyecto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewProject(true)}
                  className="shrink-0 rounded-md border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-100"
                >
                  + Nuevo
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Nombre del nuevo proyecto"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={createProjectInline}
                  className="shrink-0 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  className="shrink-0 rounded-md border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-100"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {currentProject && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Actividad (dentro del proyecto)</label>
              <input
                list="activity-options"
                value={draft.activity ?? ''}
                onChange={(e) => patch({ activity: e.target.value || null })}
                placeholder="Ej. Muestreo de terreno"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              <datalist id="activity-options">
                {activityOptions.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
          )}

          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.important}
                onChange={(e) => patch({ important: e.target.checked })}
              />
              Importante
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input type="checkbox" checked={draft.urgent} onChange={(e) => patch({ urgent: e.target.checked })} />
              Urgente
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Estado</label>
            </div>
            <StatusPill status={draft.status} size="md" onClick={() => {
              const order = [STATUS.NOT_STARTED, STATUS.IN_PROGRESS, STATUS.DONE]
              patch({ status: order[(order.indexOf(draft.status) + 1) % order.length] })
            }} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Checklist</label>
            <div className="space-y-1.5">
              {draft.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <StatusPill status={item.status} onClick={() => cycleChecklistStatus(item.id)} />
                  <span className="flex-1 text-sm text-gray-800">{item.text}</span>
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(item.id)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newChecklistText}
                onChange={(e) => setNewChecklistText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
                placeholder="Nuevo ítem…"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={addChecklistItem}
                className="shrink-0 rounded-md border border-gray-300 px-2 text-gray-600 hover:bg-gray-100"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Adjuntos (referencia a Goodnotes u otro archivo)
            </label>
            <div className="space-y-1.5">
              {draft.attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1">
                  <Paperclip size={14} className="shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">{a.label}</p>
                    <p className="truncate text-xs text-gray-500">{a.ref}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                value={newAttachmentLabel}
                onChange={(e) => setNewAttachmentLabel(e.target.value)}
                placeholder="Etiqueta (ej. Croquis afloramiento)"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              <div className="flex gap-2">
                <input
                  value={newAttachmentRef}
                  onChange={(e) => setNewAttachmentRef(e.target.value)}
                  placeholder="URL o nombre de archivo"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addAttachment}
                  className="shrink-0 rounded-md border border-gray-300 px-2 text-gray-600 hover:bg-gray-100"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          {onDelete ? (
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
              disabled={!draft.name.trim()}
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
