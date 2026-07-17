// Integración directa con Google Calendar (Google Identity Services + Calendar
// API v3), sin backend propio. El usuario crea su propio OAuth Client ID
// gratuito en Google Cloud Console y lo pega una vez por dispositivo (queda en
// localStorage; es un identificador público, no un secreto). El permiso de
// acceso al calendario se pide a Google en el momento de usar el botón; el
// token vive solo en memoria (nunca se persiste) y expira en ~1h.
//
// Reemplaza/complementa el export .ics de ARQUITECTURA.md §7.2: el .ics sigue
// disponible para quien no quiera configurar OAuth.

const CONFIG_KEY = 'google-calendar-config'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

let tokenClient = null
let accessToken = null
let tokenExpiry = 0
let gisLoadPromise = null

export function getGoogleCalendarConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) ?? null
  } catch {
    return null
  }
}

export function saveGoogleCalendarConfig(clientId) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ clientId: clientId.trim() }))
  tokenClient = null
  accessToken = null
  tokenExpiry = 0
}

export function clearGoogleCalendarConfig() {
  localStorage.removeItem(CONFIG_KEY)
  tokenClient = null
  accessToken = null
  tokenExpiry = 0
}

function loadGisScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisLoadPromise) return gisLoadPromise
  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services (revisa tu conexión).'))
    document.head.appendChild(script)
  })
  return gisLoadPromise
}

function tokenValid() {
  return accessToken && Date.now() < tokenExpiry
}

async function requestAccessToken() {
  const config = getGoogleCalendarConfig()
  if (!config?.clientId) throw new Error('Configura primero el Client ID de Google Calendar.')
  await loadGisScript()

  if (tokenValid()) return accessToken

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: SCOPE,
      callback: () => {},
    })
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(`Google rechazó el acceso: ${resp.error}`))
        return
      }
      accessToken = resp.access_token
      tokenExpiry = Date.now() + (resp.expires_in ?? 3500) * 1000
      resolve(accessToken)
    }
    tokenClient.requestAccessToken({ prompt: tokenValid() ? '' : 'consent' })
  })
}

// Crea un evento de día completo en el calendario primario del usuario a
// partir de una tarea/proyecto (mismo criterio de fecha que el .ics: DTSTART
// = deadline, día completo, sin corrimiento de zona horaria).
export async function addEntityToGoogleCalendar({ id, name, description, deadline }) {
  if (!deadline) throw new Error('Define un deadline antes de añadir a Google Calendar.')
  const token = await requestAccessToken()

  const nextDay = new Date(deadline + 'T00:00:00')
  nextDay.setDate(nextDay.getDate() + 1)

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: name,
      description: description || undefined,
      start: { date: deadline },
      end: { date: nextDay.toISOString().slice(0, 10) },
      extendedProperties: { private: { gestorAcademicoId: id } },
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message || `Error de Google Calendar (${res.status}).`)
  }
  return res.json()
}
