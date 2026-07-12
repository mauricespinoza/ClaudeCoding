// Fase 4 — export .ics por tarea/proyecto (ARQUITECTURA.md §3, §7). Genera
// un evento de día completo (VALUE=DATE) para evitar el corrimiento de zona
// horaria; la importación a Google Calendar/Outlook es manual y unidireccional.

function icsEscape(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function dateOnlyToIcs(dateOnly) {
  return dateOnly.replace(/-/g, '')
}

function utcTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function buildIcsForEntity({ id, name, description, deadline }) {
  if (!deadline) return null

  const dtStart = dateOnlyToIcs(deadline)
  // DTEND es exclusivo en eventos de día completo: el día siguiente.
  const nextDay = new Date(deadline + 'T00:00:00')
  nextDay.setDate(nextDay.getDate() + 1)
  const dtEnd = dateOnlyToIcs(nextDay.toISOString().slice(0, 10))

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gestor Academico//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${id}@gestor-academico`,
    `DTSTAMP:${utcTimestamp()}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${icsEscape(name)}`,
    ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function downloadIcs(filename, icsContent) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportEntityToIcs(entity) {
  const ics = buildIcsForEntity(entity)
  if (!ics) return false
  const safeName = (entity.name || 'evento').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  downloadIcs(`${safeName}.ics`, ics)
  return true
}
