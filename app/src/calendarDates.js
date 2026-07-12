// Fase 4 — helpers de fecha puros para la vista de Calendario. Trabajan
// siempre con "date-only" (YYYY-MM-DD) interpretado en hora local, igual
// que model.js, para evitar el corrimiento de un día por UTC.

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function toDateOnly(date) {
  const tz = date.getTimezoneOffset() * 60000
  return new Date(date - tz).toISOString().slice(0, 10)
}

export function fromDateOnly(dateOnly) {
  return new Date(dateOnly + 'T00:00:00')
}

export function addDays(dateOnly, n) {
  const d = fromDateOnly(dateOnly)
  d.setDate(d.getDate() + n)
  return toDateOnly(d)
}

export function addMonths(dateOnly, n) {
  const d = fromDateOnly(dateOnly)
  d.setMonth(d.getMonth() + n)
  return toDateOnly(d)
}

// Lunes de la semana que contiene dateOnly.
export function startOfWeek(dateOnly) {
  const d = fromDateOnly(dateOnly)
  const day = d.getDay() // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return toDateOnly(d)
}

export function weekDates(dateOnly) {
  const monday = startOfWeek(dateOnly)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

// Grilla de 6 semanas x 7 días que cubre el mes completo, con relleno de
// los meses adyacentes (calendario mensual estándar, semana empieza lunes).
export function monthMatrix(dateOnly) {
  const d = fromDateOnly(dateOnly)
  const firstOfMonth = toDateOnly(new Date(d.getFullYear(), d.getMonth(), 1))
  const gridStart = startOfWeek(firstOfMonth)
  const month = d.getMonth()

  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = addDays(gridStart, week * 7 + day)
      return { date, inMonth: fromDateOnly(date).getMonth() === month }
    }),
  )
}

export function monthLabel(dateOnly) {
  const d = fromDateOnly(dateOnly)
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

export function weekRangeLabel(dateOnly) {
  const [start, end] = [startOfWeek(dateOnly), addDays(startOfWeek(dateOnly), 6)]
  return `${formatShort(start)} – ${formatShort(end)}`
}

function formatShort(dateOnly) {
  const d = fromDateOnly(dateOnly)
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`
}
