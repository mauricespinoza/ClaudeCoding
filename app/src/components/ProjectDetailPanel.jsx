import { useMemo, useState } from 'react'
import groupBy from 'lodash/groupBy.js'
import { Archive, ArchiveRestore, Loader2, Plus, Settings, Sparkles, Trash2, X } from 'lucide-react'
import { PROJECT_COLOR_TAGS, formatDateOnly, projectColor, projectCompletion, tagColor } from '../model.js'
import { requestAISuggestions } from '../aiSuggest.js'
import { TaskCard } from './TaskCard.jsx'
import { AISuggestionsReview } from './AISuggestionsReview.jsx'
import { IcsExportButton } from './IcsExportButton.jsx'
import { IdeaNotesSection } from './IdeaNotesSection.jsx'

const IMPORTANCE_OPTIONS = [
  { value: 1, label: 'Baja' },
  { value: 2, label: 'Media' },
  { value: 3, label: 'Alta' },
]

export function ProjectDetailPanel({
  project,
  tasks,
  notes,
  tagColors,
  aiConfig,
  isNew,
  dispatchAndPersist,
  onClose,
  onDelete,
  onOpenTask,
  onCreateTask,
}) {
  const [draft, setDraft] = useState({ notes: '', ...project })
  const projectNotes = useMemo(() => notes.filter((n) => n.projectId === draft.id), [notes, draft.id])
  const [newActivityName, setNewActivityName] = useState('')
  const [overrideEnabled, setOverrideEnabled] = useState(project.completionOverride != null)
  const [customColorEnabled, setCustomColorEnabled] = useState(project.color != null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [aiActivities, setAiActivities] = useState(null)
  const [showAiSettings, setShowAiSettings] = useState(false)

  const patch = (fields) => setDraft((d) => ({ ...d, ...fields }))

  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === draft.id), [tasks, draft.id])
  const computedCompletion = projectCompletion({ ...draft, completionOverride: null }, tasks)

  const grouped = useMemo(() => {
    const byActivity = groupBy(projectTasks, (t) => t.activity ?? '')
    const names = [...draft.activityOrder]
    for (const name of Object.keys(byActivity)) {
      if (name && !names.includes(name)) names.push(name)
    }
    const groups = names.map((name) => ({ name, tasks: byActivity[name] ?? [] }))
    if (byActivity['']?.length) groups.push({ name: null, tasks: byActivity[''] })
    return groups
  }, [projectTasks, draft.activityOrder])

  const handleSave = async () => {
    if (!draft.name.trim()) return
    const action = isNew
      ? { type: 'ADD_PROJECT', payload: { seed: {}, overrides: draft } }
      : { type: 'UPDATE_PROJECT', payload: { id: draft.id, patch: draft } }
    onClose()
    await dispatchAndPersist(action, ['projects'])
  }

  const addActivity = () => {
    const name = newActivityName.trim()
    if (!name || draft.activityOrder.includes(name)) return
    patch({ activityOrder: [...draft.activityOrder, name] })
    setNewActivityName('')
  }

  const toggleOverride = (enabled) => {
    setOverrideEnabled(enabled)
    patch({ completionOverride: enabled ? computedCompletion : null })
  }

  const toggleArchived = () => patch({ archived: !draft.archived })

  const toggleCustomColor = (enabled) => {
    setCustomColorEnabled(enabled)
    patch({ color: enabled ? projectColor(draft, tagColors) : null })
  }

  const runAISuggest = async () => {
    setAiError(null)
    setAiLoading(true)
    try {
      const activities = await requestAISuggestions(draft, aiConfig)
      setAiActivities(activities)
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  const setAiConfig = (patch) => dispatchAndPersist({ type: 'SET_AI_CONFIG', payload: patch }, ['meta'])

  const confirmAISuggestions = async (activitiesToInsert) => {
    setAiActivities(null)
    await dispatchAndPersist(
      { type: 'INSERT_AI_SUGGESTIONS', payload: { projectId: draft.id, activities: activitiesToInsert } },
      ['projects', 'tasks'],
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-8 w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">{isNew ? 'Nuevo proyecto' : 'Editar proyecto'}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Nombre</label>
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Objetivo</label>
            <textarea
              value={draft.objective}
              onChange={(e) => patch({ objective: e.target.value })}
              rows={2}
              placeholder="Insumo principal para la sugerencia de IA"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Descripción</label>
            <textarea
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Notas</label>
            <textarea
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={3}
              placeholder="Ideas, avances, recordatorios sueltos sobre el proyecto…"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          {!isNew && (
            <IdeaNotesSection
              project={draft}
              notes={projectNotes}
              tasks={tasks}
              aiConfig={aiConfig}
              dispatchAndPersist={dispatchAndPersist}
            />
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Colaboradores</label>
            <input
              value={draft.collaborators}
              onChange={(e) => patch({ collaborators: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Fecha de inicio</label>
              <input
                type="date"
                value={draft.startDate ?? ''}
                onChange={(e) => patch({ startDate: e.target.value || null })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              {!draft.startDate && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Sin definir: se usa la fecha de creación ({formatDateOnly(draft.createdAt.slice(0, 10))}).
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Deadline</label>
              <input
                type="date"
                value={draft.deadline ?? ''}
                onChange={(e) => patch({ deadline: e.target.value || null })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              <IcsExportButton entity={draft} className="mt-1.5" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tag</label>
              <select
                value={draft.colorTag}
                onChange={(e) => patch({ colorTag: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              >
                {Object.entries(PROJECT_COLOR_TAGS).map(([key, v]) => (
                  <option key={key} value={key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Importancia</label>
              <select
                value={draft.importance}
                onChange={(e) => patch({ importance: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              >
                {IMPORTANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-gray-200 p-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={customColorEnabled} onChange={(e) => toggleCustomColor(e.target.checked)} />
                Personalizar color de este proyecto
              </label>
              <p className="mt-1 text-[11px] text-gray-400">
                Sin personalizar usa el color del tag «{PROJECT_COLOR_TAGS[draft.colorTag].label}».
              </p>
            </div>
            <input
              type="color"
              disabled={!customColorEnabled}
              value={draft.color ?? tagColor(draft.colorTag, tagColors)}
              onChange={(e) => patch({ color: e.target.value })}
              className="h-8 w-12 shrink-0 cursor-pointer rounded border border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>

          <div className="rounded-md border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Cumplimiento</label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <input type="checkbox" checked={overrideEnabled} onChange={(e) => toggleOverride(e.target.checked)} />
                Ajustar manualmente
              </label>
            </div>
            {overrideEnabled ? (
              <input
                type="number"
                min={0}
                max={100}
                value={draft.completionOverride ?? computedCompletion}
                onChange={(e) => patch({ completionOverride: Math.max(0, Math.min(100, Number(e.target.value))) })}
                className="mt-2 w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            ) : (
              <p className="mt-1 text-2xl font-semibold text-gray-800">{computedCompletion}%</p>
            )}
            <p className="mt-1 text-xs text-gray-400">Calculado a partir del estado de las tareas asociadas.</p>
          </div>

          {!isNew && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800">Actividades y tareas</h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAiSettings((s) => !s)}
                    title="Proveedor de IA"
                    className="rounded-md border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-100"
                  >
                    <Settings size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={runAISuggest}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                  >
                    {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Sugerir actividades y tareas con IA
                  </button>
                </div>
              </div>
              {showAiSettings && (
                <div className="mb-3 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <label className="text-gray-600">Proveedor:</label>
                    <select
                      value={aiConfig.provider}
                      onChange={(e) => setAiConfig({ provider: e.target.value })}
                      className="rounded border border-gray-300 px-2 py-1"
                    >
                      <option value="gemini">Google Gemini (gratis con key propia)</option>
                      <option value="claude">Claude (API key)</option>
                      <option value="ollama">Ollama local (gratis)</option>
                    </select>
                  </div>
                  {aiConfig.provider === 'gemini' && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-gray-500">API key de Gemini</label>
                        <input
                          type="password"
                          value={aiConfig.geminiKey}
                          onChange={(e) => setAiConfig({ geminiKey: e.target.value })}
                          placeholder="AIza…"
                          className="w-full rounded border border-gray-300 px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-gray-500">Modelo</label>
                        <input
                          value={aiConfig.geminiModel}
                          onChange={(e) => setAiConfig({ geminiModel: e.target.value })}
                          placeholder="gemini-2.0-flash"
                          className="w-full rounded border border-gray-300 px-2 py-1"
                        />
                      </div>
                      <p className="col-span-full text-[11px] text-gray-400">
                        Crea tu key gratis en{' '}
                        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline">
                          aistudio.google.com/apikey
                        </a>
                        . Se guarda en tu storage personal — no compartas tu respaldo JSON con la key adentro.
                      </p>
                    </div>
                  )}
                  {aiConfig.provider === 'ollama' && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-gray-500">URL de Ollama</label>
                        <input
                          value={aiConfig.ollamaUrl}
                          onChange={(e) => setAiConfig({ ollamaUrl: e.target.value })}
                          className="w-full rounded border border-gray-300 px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-gray-500">Modelo</label>
                        <input
                          value={aiConfig.ollamaModel}
                          onChange={(e) => setAiConfig({ ollamaModel: e.target.value })}
                          placeholder="ej. llama3.1, mistral"
                          className="w-full rounded border border-gray-300 px-2 py-1"
                        />
                      </div>
                      <p className="col-span-full text-[11px] text-gray-400">
                        Gratis y privado: requiere tener{' '}
                        <a href="https://ollama.com" target="_blank" rel="noreferrer" className="underline">
                          Ollama
                        </a>{' '}
                        instalado y corriendo (`ollama serve`) con el modelo descargado (`ollama pull {aiConfig.ollamaModel || 'llama3.1'}`).
                      </p>
                    </div>
                  )}
                  {aiConfig.provider === 'claude' && (
                    <p className="text-[11px] text-gray-400">
                      Requiere una API key de Anthropic configurada en el entorno (VITE_ANTHROPIC_API_KEY).
                    </p>
                  )}
                </div>
              )}
              {aiError && (
                <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{aiError}</p>
              )}

              <div className="space-y-4">
                {grouped.map((group) => (
                  <div key={group.name ?? '__sin_actividad__'}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {group.name ?? 'Sin actividad'}
                      </p>
                      <button
                        type="button"
                        onClick={() => onCreateTask(draft, group.name)}
                        className="inline-flex items-center gap-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        title="Nueva tarea en esta actividad"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {group.tasks.length === 0 && <p className="text-xs text-gray-400">Sin tareas</p>}
                      {group.tasks.map((task) => (
                        <TaskCard key={task.id} task={task} project={null} onOpen={() => onOpenTask(task)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={newActivityName}
                  onChange={(e) => setNewActivityName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addActivity())}
                  placeholder="Nueva actividad…"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addActivity}
                  className="shrink-0 rounded-md border border-gray-300 px-2 text-gray-600 hover:bg-gray-100"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          {!isNew ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleArchived}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                {draft.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                {draft.archived ? 'Desarchivar' : 'Archivar'}
              </button>
              <button
                type="button"
                onClick={() => onDelete(draft.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> Eliminar
              </button>
            </div>
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

      {aiActivities && (
        <AISuggestionsReview
          activities={aiActivities}
          onCancel={() => setAiActivities(null)}
          onConfirm={confirmAISuggestions}
        />
      )}
    </div>
  )
}
