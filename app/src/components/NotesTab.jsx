import { useMemo, useState } from 'react'
import { BrainCircuit, Loader2, Plus, Trash2, X } from 'lucide-react'
import { NOTE_CATEGORIES, emptyIdeaNote, formatDateOnly } from '../model.js'
import { chipStyle } from '../color.js'
import { requestNotesAnalysis } from '../aiSuggest.js'
import { VoiceButton } from './VoiceButton.jsx'

// Bitácora completa: notas sueltas (sin proyecto) y las de cada proyecto,
// todas en un solo lugar. Dropdown de proyecto + pills de categoría evitan
// saturar la vista cuando hay muchas notas.
export function NotesTab({ notes, projects, tasks, aiConfig, dispatchAndPersist }) {
  const [projectFilter, setProjectFilter] = useState('') // '' = todas, 'none' = sueltas, id = ese proyecto
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [category, setCategory] = useState('idea')
  const [projectId, setProjectId] = useState('')
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)

  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects])

  const visible = notes
    .filter((n) => {
      if (!projectFilter) return true
      if (projectFilter === 'none') return !n.projectId
      return n.projectId === projectFilter
    })
    .filter((n) => !categoryFilter || n.category === categoryFilter)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  const addNote = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    await dispatchAndPersist(
      { type: 'ADD_NOTE', payload: { note: emptyIdeaNote(category, trimmed, projectId || null) } },
      ['notes'],
    )
  }

  const removeNote = async (id) => {
    await dispatchAndPersist({ type: 'REMOVE_NOTE', payload: { id } }, ['notes'])
  }

  const runAnalysis = async () => {
    setError(null)
    setAnalyzing(true)
    try {
      const label =
        projectFilter === 'none'
          ? 'notas sueltas (sin proyecto)'
          : projectFilter
            ? `proyecto "${projectById[projectFilter]?.name ?? ''}"`
            : 'todas las notas'
      const relatedTasks = projectFilter && projectFilter !== 'none' ? tasks.filter((t) => t.projectId === projectFilter) : []
      setAnalysis(
        await requestNotesAnalysis(
          visible,
          relatedTasks,
          { label, objective: projectFilter && projectFilter !== 'none' ? projectById[projectFilter]?.objective : '' },
          aiConfig,
        ),
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 focus:border-blue-400 focus:outline-none"
          >
            <option value="">Todos los proyectos</option>
            <option value="none">Sin proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(NOTE_CATEGORIES).map(([key, cat]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === key ? null : key)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  categoryFilter === key ? 'ring-2 ring-offset-1' : ''
                }`}
                style={chipStyle(cat.color)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={analyzing || visible.length === 0}
          title={visible.length === 0 ? 'No hay notas en este filtro' : 'Analizar las notas visibles con IA'}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzing ? <Loader2 size={13} className="animate-spin" /> : <BrainCircuit size={13} />}
          Analizar con IA
        </button>
      </div>

      {/* alta rápida */}
      <div className="mb-4 flex flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-3 sm:flex-nowrap">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="shrink-0 rounded-md border border-gray-300 px-1.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
        >
          {Object.entries(NOTE_CATEGORIES).map(([key, cat]) => (
            <option key={key} value={key}>
              {cat.label}
            </option>
          ))}
        </select>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="shrink-0 rounded-md border border-gray-300 px-1.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
        >
          <option value="">Sin proyecto</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNote())}
          placeholder="Escribe o dicta la nota…"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
        <VoiceButton onResult={(t) => setText((prev) => (prev ? prev + ' ' : '') + t)} />
        <button
          type="button"
          onClick={addNote}
          disabled={!text.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={13} />
          Agregar
        </button>
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {analysis && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-900">Análisis y pasos sugeridos</p>
            <button type="button" onClick={() => setAnalysis(null)} className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100">
              <X size={13} />
            </button>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-emerald-900">{analysis}</p>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400">
          <p className="text-sm">Sin notas en este filtro.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((note) => {
            const cat = NOTE_CATEGORIES[note.category] ?? NOTE_CATEGORIES.idea
            const project = note.projectId ? projectById[note.projectId] : null
            return (
              <div key={note.id} className="flex items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-2">
                <span className="mt-0.5 shrink-0 rounded-full border px-1.5 text-[10px] font-medium" style={chipStyle(cat.color)}>
                  {cat.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{note.text}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {project ? project.name : 'Sin proyecto'} · {formatDateOnly(note.createdAt.slice(0, 10))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeNote(note.id)}
                  className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
