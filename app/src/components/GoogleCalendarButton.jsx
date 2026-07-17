import { useState } from 'react'
import { CalendarPlus, Check, Loader2, Settings } from 'lucide-react'
import {
  addEntityToGoogleCalendar,
  clearGoogleCalendarConfig,
  getGoogleCalendarConfig,
  saveGoogleCalendarConfig,
} from '../googleCalendar.js'

// Botón "Añadir a Google Calendar": crea el evento directo vía la API (con el
// Client ID OAuth que el propio usuario configura una vez). Complementa
// IcsExportButton, que sigue siendo la opción sin configuración.
export function GoogleCalendarButton({ entity, className = '' }) {
  const [showConfig, setShowConfig] = useState(false)
  const [clientId, setClientId] = useState(getGoogleCalendarConfig()?.clientId ?? '')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)
  const [error, setError] = useState(null)

  const configured = !!getGoogleCalendarConfig()
  const disabled = !entity.deadline

  const handleAdd = async () => {
    if (!configured) {
      setShowConfig(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addEntityToGoogleCalendar(entity)
      setAdded(true)
      setTimeout(() => setAdded(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const saveConfig = () => {
    if (!clientId.trim()) return
    saveGoogleCalendarConfig(clientId)
    setShowConfig(false)
    setError(null)
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={handleAdd}
          title={disabled ? 'Define un deadline para añadir a Google Calendar' : 'Añadir evento a Google Calendar'}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : added ? (
            <Check size={13} className="text-emerald-600" />
          ) : (
            <CalendarPlus size={13} />
          )}
          {added ? 'Añadido' : 'Google Calendar'}
        </button>
        <button
          type="button"
          onClick={() => setShowConfig((s) => !s)}
          title="Configurar Google Calendar"
          className="rounded p-1 text-gray-400 hover:bg-gray-100"
        >
          <Settings size={13} />
        </button>
      </div>

      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}

      {showConfig && (
        <div className="mt-1.5 w-72 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="text-[11px] leading-relaxed text-gray-500">
            1. En <span className="font-medium">console.cloud.google.com</span>, crea un proyecto (gratis) y habilita
            la <span className="font-medium">Google Calendar API</span>.
            <br />
            2. Credenciales → <span className="font-medium">ID de cliente de OAuth</span>, tipo "Aplicación web".
            <br />
            3. En "Orígenes de JavaScript autorizados" agrega la URL donde abres esta app (tu dominio de
            Netlify/Vercel, y <code>http://localhost:5173</code> si pruebas en local).
            <br />
            4. Pega aquí el Client ID (termina en <code>.apps.googleusercontent.com</code>). Se guarda solo en este
            dispositivo; el permiso lo pide Google cada vez que abras sesión de nuevo.
          </p>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxx.apps.googleusercontent.com"
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveConfig}
              disabled={!clientId.trim()}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Guardar
            </button>
            {configured && (
              <button
                type="button"
                onClick={() => {
                  clearGoogleCalendarConfig()
                  setClientId('')
                }}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                Borrar
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
