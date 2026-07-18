import { useState } from 'react'
import { BrainCircuit, Loader2, Plus, Trash2, X } from 'lucide-react'
import { NOTE_CATEGORIES, emptyIdeaNote, formatDateOnly } from '../model.js'
import { chipStyle } from '../color.js'
import { requestNotesAnalysis } from '../aiSuggest.js'
import { VoiceButton } from './VoiceButton.jsx'

// Bitácora del proyecto: notas rápidas clasificadas como Idea/Dato/Hipótesis/
// GAP. Viven en state.notes (colección propia, no embebidas en el proyecto)
// filtradas por projectId, y se guardan de inmediato al agregarlas/borrarlas
// (mismo criterio que QuickNoteWidget). El botón "Analizar con IA" cruza esos
// niveles de evidencia y propone pasos a seguir (solo lectura).
export function IdeaNotesSection({ project, notes, tasks, aiConfig, dispatchAndPersist }) {
  const [category, setCategory] = useState('idea')
  const [text, setText] = useState('')
  const [filter, setFilter] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)

  const visibleNotes = filter ? notes.filter((n) => n.category === filter) : notes

  const addNote = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    await dispatchAndPersist(
      { type: 'ADD_NOTE', payload: { note: emptyIdeaNote(category, trimmed, project.id) } },
      ['notes'],
    )
  }

  const removeNote = async (noteId) => {
    await dispatchAndPersist({ type: 'REMOVE_NOTE', payload: { id: noteId } }, ['notes'])
  }

  const runAnalysis = async () => {
    setError(null)
    setAnalyzing(true)
    try {
      const projectTasks = tasks.filter((t) => t.projectId === project.id)
      setAnalysis(
        await requestNotesAnalysis(
          notes,
          projectTasks,
          { label: `proyecto "${project.name}"`, objective: project.objective },
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
    <div className="rounded-md border border-gray-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-medium text-gray-600">Bitácora de ideas</label>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={analyzing || notes.length === 0}
          title={notes.length === 0 ? 'Agrega notas primero' : 'Analizar ideas, datos, hipótesis y gaps con IA'}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzing ? <Loader2 size={13} className="animate-spin" /> : <BrainCircuit size={13} />}
          Analizar con IA
        </button>
      </div>

      {/* filtro por categoría */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {Object.entries(NOTE_CATEGORIES).map(([key, cat]) => {
          const count = notes.filter((n) => n.category === key).length
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(filter === key ? null : key)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                filter === key ? 'ring-2 ring-offset-1' : ''
              }`}
              style={chipStyle(cat.color)}
            >
              {cat.label} · {count}
            </button>
          )
        })}
      </div>

      <div className="max-h-48 space-y-1.5 overflow-y-auto">
        {visibleNotes.length === 0 && (
          <p className="py-2 text-center text-xs text-gray-400">
            {filter ? 'Sin notas en esta categoría.' : 'Anota ideas, datos, hipótesis o vacíos de conocimiento.'}
          </p>
        )}
        {visibleNotes.map((note) => {
          const cat = NOTE_CATEGORIES[note.category] ?? NOTE_CATEGORIES.idea
          return (
            <div key={note.id} className="flex items-start gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
              <span className="mt-0.5 shrink-0 rounded-full border px-1.5 text-[10px] font-medium" style={chipStyle(cat.color)}>
                {cat.label}
              </span>
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs text-gray-700">{note.text}</p>
              <span className="shrink-0 text-[10px] text-gray-400">{formatDateOnly(note.createdAt.slice(0, 10))}</span>
              <button
                type="button"
                onClick={() => removeNote(note.id)}
                className="shrink-0 rounded p-0.5 text-gray-300 hover:bg-gray-200 hover:text-red-500"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="shrink-0 rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-400 focus:outline-none"
        >
          {Object.entries(NOTE_CATEGORIES).map(([key, cat]) => (
            <option key={key} value={key}>
              {cat.label}
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNote())}
          placeholder="Nueva nota…"
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
        />
        <VoiceButton onResult={(t) => setText((prev) => (prev ? prev + ' ' : '') + t)} />
        <button
          type="button"
          onClick={addNote}
          className="shrink-0 rounded-md border border-gray-300 px-2 text-gray-600 hover:bg-gray-100"
        >
          <Plus size={14} />
        </button>
      </div>

      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {analysis && (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-900">Análisis y pasos sugeridos</p>
            <button type="button" onClick={() => setAnalysis(null)} className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100">
              <X size={13} />
            </button>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-emerald-900">{analysis}</p>
        </div>
      )}
    </div>
  )
}
