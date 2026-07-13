// Fase 0 — modelo de datos: constantes, generación de IDs, helpers de fecha
// y cálculo de % de cumplimiento. Ver ARQUITECTURA.md secciones 1 y 4.

export const STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
}

export const STATUS_LABEL = {
  [STATUS.NOT_STARTED]: 'No iniciado',
  [STATUS.IN_PROGRESS]: 'En proceso',
  [STATUS.DONE]: 'Completado',
}

export const STATUS_ORDER = [STATUS.NOT_STARTED, STATUS.IN_PROGRESS, STATUS.DONE]

export function nextStatus(status) {
  const i = STATUS_ORDER.indexOf(status)
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length]
}

// Colores por defecto de cada tag de proyecto (hex, no clases Tailwind
// estáticas) — el usuario puede sobrescribirlos globalmente (meta.tagColors,
// vía TagColorSettings) o por proyecto individual (project.color).
export const PROJECT_COLOR_TAGS = {
  investigacion: { label: 'Investigación', defaultColor: '#7c3aed' },
  docencia: { label: 'Docencia', defaultColor: '#0284c7' },
  vinculacion: { label: 'Vinculación', defaultColor: '#059669' },
  administracion: { label: 'Administración', defaultColor: '#475569' },
  varios: { label: 'Varios', defaultColor: '#78716c' },
}

export function defaultTagColors() {
  return Object.fromEntries(Object.entries(PROJECT_COLOR_TAGS).map(([key, v]) => [key, v.defaultColor]))
}

// Color de un tag, respetando el override global del usuario si existe.
export function tagColor(tagKey, tagColors) {
  return tagColors?.[tagKey] ?? PROJECT_COLOR_TAGS[tagKey]?.defaultColor ?? '#6b7280'
}

// Color efectivo de un proyecto: su propio override si lo tiene, si no el
// de su tag.
export function projectColor(project, tagColors) {
  return project.color ?? tagColor(project.colorTag, tagColors)
}

export const QUADRANTS = [
  {
    key: 'important-urgent',
    important: true,
    urgent: true,
    title: 'Importante + Urgente',
    subtitle: 'Hacer ahora',
    accent: 'red',
    classes: {
      header: 'bg-red-100 border-red-300 text-red-900',
      panel: 'bg-red-50/60 border-red-200',
      button: 'bg-red-600 hover:bg-red-700 text-white',
    },
  },
  {
    key: 'important-not_urgent',
    important: true,
    urgent: false,
    title: 'Importante + No urgente',
    subtitle: 'Planificar',
    accent: 'amber',
    classes: {
      header: 'bg-amber-100 border-amber-300 text-amber-900',
      panel: 'bg-amber-50/60 border-amber-200',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
  },
  {
    key: 'not_important-urgent',
    important: false,
    urgent: true,
    title: 'No importante + Urgente',
    subtitle: 'Delegar',
    accent: 'blue',
    classes: {
      header: 'bg-blue-100 border-blue-300 text-blue-900',
      panel: 'bg-blue-50/60 border-blue-200',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  },
  {
    key: 'not_important-not_urgent',
    important: false,
    urgent: false,
    title: 'No importante + No urgente',
    subtitle: 'Eliminar / algún día',
    accent: 'gray',
    classes: {
      header: 'bg-gray-100 border-gray-300 text-gray-800',
      panel: 'bg-gray-50/60 border-gray-200',
      button: 'bg-gray-600 hover:bg-gray-700 text-white',
    },
  },
]

export function quadrantOf(task) {
  return QUADRANTS.find((q) => q.important === !!task.important && q.urgent === !!task.urgent)
}

// IDs: prefijo + timestamp base36 + sufijo aleatorio. No requieren red ni
// coordinación (uso personal, sin backend).
function makeId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${rand}`
}

export const newTaskId = () => makeId('t')
export const newProjectId = () => makeId('p')
export const newChecklistItemId = () => makeId('c')
export const newAttachmentId = () => makeId('a')

export const DEFAULT_SUBTITLE = 'Tareas y proyectos — geología estructural'

export function defaultMeta() {
  return {
    schemaVersion: 1,
    lastTab: 'tasks',
    tagColors: {},
    subtitle: DEFAULT_SUBTITLE,
    notificationsEnabled: false,
    ai: { provider: 'claude', ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3.1' },
  }
}

export function nowIso() {
  return new Date().toISOString()
}

// Fecha pura YYYY-MM-DD, interpretada en hora local (ver ARQUITECTURA.md §7,
// riesgo de corrimiento por UTC).
export function todayDateOnly() {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d - tz).toISOString().slice(0, 10)
}

export function isOverdue(dateOnly) {
  if (!dateOnly) return false
  return dateOnly < todayDateOnly()
}

export function formatDateOnly(dateOnly) {
  if (!dateOnly) return ''
  const [y, m, d] = dateOnly.split('-')
  return `${d}/${m}/${y}`
}

export function emptyChecklistItem(text) {
  return { id: newChecklistItemId(), text, status: STATUS.NOT_STARTED }
}

export function emptyTask({ important, urgent, projectId = null, activity = null } = {}) {
  const ts = nowIso()
  return {
    id: newTaskId(),
    name: '',
    description: '',
    deadline: null,
    startDate: null,
    projectId,
    activity,
    assignee: '',
    important: !!important,
    urgent: !!urgent,
    status: STATUS.NOT_STARTED,
    checklist: [],
    attachments: [],
    order: ts,
    createdAt: ts,
    updatedAt: ts,
  }
}

export function emptyProject({ name = '' } = {}) {
  const ts = nowIso()
  return {
    id: newProjectId(),
    name,
    description: '',
    objective: '',
    notes: '',
    collaborators: '',
    deadline: null,
    startDate: null,
    colorTag: 'investigacion',
    color: null,
    importance: 2,
    completionOverride: null,
    activityOrder: [],
    archived: false,
    createdAt: ts,
    updatedAt: ts,
  }
}

// % de cumplimiento derivado — nunca persistido salvo override (ARQUITECTURA.md §4).
export function projectCompletion(project, tasks) {
  if (project.completionOverride != null) return project.completionOverride

  const projectTasks = tasks.filter((t) => t.projectId === project.id)
  if (projectTasks.length === 0) return 0

  const weightOf = (task) => {
    if (task.status === STATUS.DONE) return 1
    if (task.status === STATUS.NOT_STARTED) return 0
    if (task.checklist.length > 0) {
      const done = task.checklist.filter((c) => c.status === STATUS.DONE).length
      return done / task.checklist.length
    }
    return 0.5
  }

  const total = projectTasks.reduce((sum, t) => sum + weightOf(t), 0)
  return Math.round((100 * total) / projectTasks.length)
}
