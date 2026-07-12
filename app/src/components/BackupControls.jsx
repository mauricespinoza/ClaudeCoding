import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { downloadBackup, parseBackupFile, readBackupFile } from '../backup.js'

export function BackupControls({ state, dispatch, onImported }) {
  const fileInputRef = useRef(null)
  const [error, setError] = useState(null)

  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite reimportar el mismo archivo dos veces seguidas
    if (!file) return

    setError(null)
    const text = await readBackupFile(file)
    const result = parseBackupFile(text)
    if (!result.ok) {
      setError(result.error)
      return
    }

    const confirmed = window.confirm(
      `Vas a reemplazar ${state.projects.length} proyecto(s) y ${state.tasks.length} tarea(s) actuales por ` +
        `${result.data.projects.length} proyecto(s) y ${result.data.tasks.length} tarea(s) del respaldo. ¿Continuar?`,
    )
    if (!confirmed) return

    dispatch({ type: 'HYDRATE', payload: result.data })
    await onImported(result.data)
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => downloadBackup(state)}
        title="Descargar un respaldo JSON de todos tus datos"
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        <Download size={13} />
        Respaldo
      </button>
      <button
        type="button"
        onClick={handleImportClick}
        title="Cargar un respaldo JSON (reemplaza los datos actuales)"
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        <Upload size={13} />
        Cargar
      </button>
      <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChange} className="hidden" />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
