// Fase 0 — capa de persistencia sobre window.storage.
// Claves y justificación en ARQUITECTURA.md §2. Todas con shared: false
// (window.storage por defecto ya es personal en este entorno; se documenta
// explícitamente para claridad de intención).

import { defaultMeta } from './model.js'

export const KEYS = {
  META: 'app:meta',
  PROJECTS: 'app:projects',
  TASKS: 'app:tasks',
}

export async function loadAll() {
  const [meta, projects, tasks] = await Promise.all([
    window.storage.get(KEYS.META),
    window.storage.get(KEYS.PROJECTS),
    window.storage.get(KEYS.TASKS),
  ])

  return {
    // Merge sobre los defaults, no reemplazo: un meta guardado antes de
    // agregar un campo nuevo (subtitle, tagColors, ...) no debe perderlo.
    meta: { ...defaultMeta(), ...meta },
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
// (ej. checklist). Solo para mutaciones "casuales" sin botón de guardar
// explícito; las acciones explícitas (guardar/borrar/confirmar) persisten
// de inmediato con saveTasks/saveProjects/saveMeta directamente (ver
// App.jsx dispatchAndPersist) en vez de depender de este debounce.
export function createDebouncedWriter(writeFn, delayMs = 500) {
  let timeoutId = null

  return {
    schedule(value) {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        timeoutId = null
        writeFn(value)
      }, delayMs)
    },
  }
}
