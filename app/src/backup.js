// Respaldo manual en JSON, independiente de dónde viva window.storage.
// Resuelve dos escenarios: (1) mover datos entre el preview standalone
// (localStorage por archivo file://, poco confiable entre builds) y el host
// real de artifacts; (2) que el usuario tenga su propia copia de seguridad
// sin depender de ningún backend.

const SCHEMA_VERSION = 1

export function buildBackup(state) {
  return JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      projects: state.projects,
      tasks: state.tasks,
      meta: state.meta,
    },
    null,
    2,
  )
}

export function downloadBackup(state) {
  const content = buildBackup(state)
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const dateStamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `gestor-academico-respaldo-${dateStamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Validación estructural mínima, igual de estricta que el parseo de
// sugerencias de IA (ARQUITECTURA.md §5): campos con forma incorrecta se
// rechazan explícitamente en vez de dejar que la app quede en un estado
// inconsistente.
export function parseBackupFile(rawText) {
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' }
  }

  if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.tasks)) {
    return { ok: false, error: 'El archivo no tiene el formato de un respaldo de esta app (faltan projects[]/tasks[]).' }
  }

  return {
    ok: true,
    data: {
      projects: parsed.projects,
      tasks: parsed.tasks,
      meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : { schemaVersion: SCHEMA_VERSION, lastTab: 'tasks' },
    },
  }
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}
