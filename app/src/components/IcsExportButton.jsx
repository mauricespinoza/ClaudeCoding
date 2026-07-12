import { Download } from 'lucide-react'
import { exportEntityToIcs } from '../ics.js'

// Botón reutilizable "Exportar a .ics" por tarea/proyecto (ARQUITECTURA.md
// §3). Sin deadline no hay evento que exportar: el botón se deshabilita.
export function IcsExportButton({ entity, className = '' }) {
  const disabled = !entity.deadline

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => exportEntityToIcs(entity)}
      title={disabled ? 'Define un deadline para exportar a .ics' : 'Descargar evento .ics'}
      className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <Download size={13} />
      Exportar a .ics
    </button>
  )
}
