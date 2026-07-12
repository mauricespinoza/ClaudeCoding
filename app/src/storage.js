// Fase 0 — capa de persistencia sobre window.storage.
// Claves y justificación en ARQUITECTURA.md §2. Todas con shared: false
// (window.storage por defecto ya es personal en este entorno; se documenta
// explícitamente para claridad de intención).

export const KEYS = {
  META: 'app:meta',
  PROJECTS: 'app:projects',
  TASKS: 'app:tasks',
}

const SCHEMA_VERSION = 1

export async function loadAll() {
  const [meta, projects, tasks] = await Promise.all([
    window.storage.get(KEYS.META),
    window.storage.get(KEYS.PROJECTS),
    window.storage.get(KEYS.TASKS),
  ])

  return {
    meta: meta ?? { schemaVersion: SCHEMA_VERSION, lastTab: 'tasks' },
    projects: projects ?? [],
    tasks: tasks ?? [],
  }
}

export async function saveProjects(projects) {
  await window.storage.set(KEYS.PROJECTS, projects)
}

export async function saveTasks(tasks) {
  await window.storage.set(KEYS.TASKS, tasks)
}

export async function saveMeta(meta) {
  await window.storage.set(KEYS.META, meta)
}

// Escritura debounced: evita una llamada a storage por cada tecla al editar
// (ej. checklist). Un flush() inmediato se usa al confirmar un modal.
export function createDebouncedWriter(writeFn, delayMs = 500) {
  let timeoutId = null
  let pendingValue = null
  let hasPending = false

  const flushNow = () => {
    if (!hasPending) return Promise.resolve()
    const value = pendingValue
    hasPending = false
    pendingValue = null
    return writeFn(value)
  }

  return {
    schedule(value) {
      pendingValue = value
      hasPending = true
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        timeoutId = null
        flushNow()
      }, delayMs)
    },
    async flush() {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      await flushNow()
    },
  }
}
