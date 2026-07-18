import { useState } from 'react'
import { NotebookPen, Plus, X } from 'lucide-react'
import { NOTE_CATEGORIES, emptyIdeaNote } from '../model.js'
import { chipStyle } from '../color.js'
import { VoiceButton } from './VoiceButton.jsx'
import { NoteImageField } from './NoteImageField.jsx'

// Alta rápida de una nota de bitácora (Idea/Dato/Hipótesis/GAP) sin salir de
// la pantalla de inicio: elige categoría y proyecto (o "Sin proyecto"),
// escribe o dicta, listo. La bitácora completa vive en la pestaña Notas.
export function QuickNoteWidget({ projects, dispatchAndPersist, aiConfig }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('idea')
  const [projectId, setProjectId] = useState('')
  const [text, setText] = useState('')
  const [image, setImage] = useState(null)
  const [saved, setSaved] = useState(false)

  const canSubmit = text.trim() || image

  const submit = async () => {
    if (!canSubmit) return
    await dispatchAndPersist(
      {
        type: 'ADD_NOTE',
        payload: {
          note: emptyIdeaNote(category, text.trim(), projectId || null, image?.url ?? null, image?.ocrText ?? ''),
        },
      },
      ['notes'],
    )
    setText('')
    setImage(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
      >
        <NotebookPen size={13} />
        Insertar nota (Idea / Dato / Hipótesis / GAP)
      </button>
    )
  }

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <NotebookPen size={13} />
          Nueva nota
        </p>
        <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 text-gray-400 hover:bg-gray-100">
          <X size={14} />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {Object.entries(NOTE_CATEGORIES).map(([key, cat]) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${category === key ? 'ring-2 ring-offset-1' : ''}`}
            style={chipStyle(cat.color)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 sm:flex-nowrap">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
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
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
          placeholder="Escribe o dicta la nota…"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
        <VoiceButton onResult={(t) => setText((prev) => (prev ? prev + ' ' : '') + t)} />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={13} />
          Agregar
        </button>
      </div>
      <div className="mt-1.5">
        <NoteImageField value={image} onChange={setImage} aiConfig={aiConfig} />
      </div>
      {saved && <p className="mt-1.5 text-[11px] text-emerald-600">Nota guardada.</p>}
    </div>
  )
}
