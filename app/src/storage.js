// Capa de persistencia. Claves y justificación en ARQUITECTURA.md §2.
//
// Desde la versión con login, el almacenamiento es un backend intercambiable:
// - local (default): window.storage (en el host de artifacts) o el shim de
//   localStorage (standalone). Datos solo en este dispositivo/navegador.
// - nube: Supabase (cloud.js), activado al iniciar sesión. Los mismos pares
//   clave/valor viven en una tabla kv_store por usuario, así la app funciona
//   igual desde celular y desktop con la misma cuenta.
// La forma de los datos no cambia entre backends; migrar es copiar claves.

import { defaultMeta } from './model.js'

export const KEYS = {
  META: 'app:meta',
  PROJECTS: 'app:projects',
  TASKS: 'app:tasks',
  MEETINGS: 'app:meetings',
  NOTES: 'app:notes',
}

const localBackend = {
  get: (key) => window.storage.get(key),
  set: (key, value) => window.storage.set(key, value),
}

let activeBackend = localBackend

export function setStorageBackend(backend) {
  activeBackend = backend ?? localBackend
}

export function usingLocalBackend() {
  return activeBackend === localBackend
}

export async function loadAll() {
  const [meta, projects, tasks, meetings, notes] = await Promise.all([
    activeBackend.get(KEYS.META),
    activeBackend.get(KEYS.PROJECTS),
    activeBackend.get(KEYS.TASKS),
    activeBackend.get(KEYS.MEETINGS),
    activeBackend.get(KEYS.NOTES),
  ])

  let finalProjects = projects ?? []
  let finalNotes = notes ?? []

  // Migración única: las notas (Idea/Dato/Hipótesis/GAP) vivían embebidas en
  // project.ideaNotes; ahora son una colección propia para poder existir sin
  // proyecto. `notes === null` (nunca se escribió app:notes en este backend,
  // a diferencia de "se escribió vacío") dispara la migración exactamente
  // una vez.
  if (notes === null && finalProjects.some((p) => p.ideaNotes?.length)) {
    finalNotes = finalProjects.flatMap((p) =>
      (p.ideaNotes ?? []).map((n) => ({ ...n, projectId: p.id, updatedAt: n.updatedAt ?? n.createdAt })),
    )
    finalProjects = finalProjects.map(({ ideaNotes, ...rest }) => rest)
    await Promise.all([saveNotes(finalNotes), saveProjects(finalProjects)])
  }

  return {
    // Merge sobre los defaults, no reemplazo: un meta guardado antes de
    // agregar un campo nuevo (subtitle, tagColors, ai...) no debe perderlo.
    meta: { ...defaultMeta(), ...meta, ai: { ...defaultMeta().ai, ...meta?.ai } },
    projects: finalProjects,
    tasks: tasks ?? [],
    meetings: meetings ?? [],
    notes: finalNotes,
  }
}

export async function saveProjects(projects) {
  await activeBackend.set(KEYS.PROJECTS, projects)
}

export async function saveTasks(tasks) {
  await activeBackend.set(KEYS.TASKS, tasks)
}

export async function saveMeta(meta) {
  await activeBackend.set(KEYS.META, meta)
}

export async function saveMeetings(meetings) {
  await activeBackend.set(KEYS.MEETINGS, meetings)
}

export async function saveNotes(notes) {
  await activeBackend.set(KEYS.NOTES, notes)
}

// Copia el estado completo al backend activo (se usa al subir los datos
// locales a la nube tras el primer login).
export async function saveAll(state) {
  await Promise.all([
    saveMeta(state.meta),
    saveProjects(state.projects),
    saveTasks(state.tasks),
    saveMeetings(state.meetings),
    saveNotes(state.notes),
  ])
}

// Escritura debounced: evita una llamada a storage por cada tecla al editar
// (ej. checklist). Solo para mutaciones "casuales" sin botón de guardar
// explícito; las acciones explícitas (guardar/borrar/confirmar) persisten
// de inmediato con save* directamente (ver App.jsx dispatchAndPersist).
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
