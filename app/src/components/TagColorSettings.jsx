import { X } from 'lucide-react'
import { PROJECT_COLOR_TAGS, tagColor } from '../model.js'

// Editor de los colores globales de cada tag de proyecto (investigación,
// docencia, vinculación, administración, varios). Los proyectos individuales
// pueden además sobrescribir su propio color en ProjectDetailPanel.
export function TagColorSettings({ tagColors, dispatch, onClose }) {
  const setColor = (key, value) => dispatch({ type: 'SET_TAG_COLORS', payload: { [key]: value } })
  const resetAll = () => dispatch({ type: 'RESET_TAG_COLORS' })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-16 w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Colores de tags</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {Object.entries(PROJECT_COLOR_TAGS).map(([key, tag]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700">{tag.label}</span>
              <input
                type="color"
                value={tagColor(key, tagColors)}
                onChange={(e) => setColor(key, e.target.value)}
                className="h-7 w-12 cursor-pointer rounded border border-gray-300"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={resetAll}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            Restaurar predeterminados
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
