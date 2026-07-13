// Fase 0 — reducer central. Toda mutación de datos pasa por aquí; el efecto
// de persistencia (App.jsx) observa `state.projects`/`state.tasks` y agenda
// escrituras debounced. Ver ARQUITECTURA.md §2 y §3.

import {
  STATUS,
  nextStatus,
  nowIso,
  emptyTask,
  emptyProject,
  emptyChecklistItem,
  newAttachmentId,
} from './model.js'

export const initialState = {
  hydrated: false,
  projects: [],
  tasks: [],
  meta: { schemaVersion: 1, lastTab: 'tasks', tagColors: {} },
}

function touch(entity) {
  return { ...entity, updatedAt: nowIso() }
}

function updateTaskById(tasks, id, updater) {
  return tasks.map((t) => (t.id === id ? touch(updater(t)) : t))
}

function updateProjectById(projects, id, updater) {
  return projects.map((p) => (p.id === id ? touch(updater(p)) : p))
}

// Si un ítem de checklist deja de estar not_started y la tarea seguía
// not_started, la tarea se promueve a in_progress automáticamente
// (ARQUITECTURA.md §4). El resto de las transiciones son manuales.
function withChecklistPromotion(task) {
  if (task.status !== STATUS.NOT_STARTED) return task
  const anyStarted = task.checklist.some((c) => c.status !== STATUS.NOT_STARTED)
  return anyStarted ? { ...task, status: STATUS.IN_PROGRESS } : task
}

export function appReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return {
        ...state,
        hydrated: true,
        projects: action.payload.projects,
        tasks: action.payload.tasks,
        meta: action.payload.meta,
      }

    case 'SET_LAST_TAB':
      return { ...state, meta: { ...state.meta, lastTab: action.payload } }

    // Colores de tag personalizados por el usuario (ARQUITECTURA.md — ver
    // model.js tagColor()/defaultTagColors()). Merge parcial: solo se
    // sobrescriben los tags que el usuario efectivamente cambió.
    case 'SET_TAG_COLORS':
      return { ...state, meta: { ...state.meta, tagColors: { ...state.meta.tagColors, ...action.payload } } }

    case 'RESET_TAG_COLORS':
      return { ...state, meta: { ...state.meta, tagColors: {} } }

    // ---- Tareas ----

    case 'ADD_TASK': {
      const task = { ...emptyTask(action.payload.seed), ...action.payload.overrides }
      return { ...state, tasks: [...state.tasks, task] }
    }

    case 'UPDATE_TASK': {
      const { id, patch } = action.payload
      return {
        ...state,
        tasks: updateTaskById(state.tasks, id, (t) => ({ ...t, ...patch })),
      }
    }

    case 'DELETE_TASK':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.payload.id) }

    case 'SET_TASK_QUADRANT': {
      const { id, important, urgent } = action.payload
      return {
        ...state,
        tasks: updateTaskById(state.tasks, id, (t) => ({ ...t, important, urgent })),
      }
    }

    case 'CYCLE_TASK_STATUS':
      return {
        ...state,
        tasks: updateTaskById(state.tasks, action.payload.id, (t) => ({
          ...t,
          status: nextStatus(t.status),
        })),
      }

    case 'SET_TASK_STATUS':
      return {
        ...state,
        tasks: updateTaskById(state.tasks, action.payload.id, (t) => ({
          ...t,
          status: action.payload.status,
        })),
      }

    // ---- Checklist (embebido en tarea) ----

    case 'ADD_CHECKLIST_ITEM':
      return {
        ...state,
        tasks: updateTaskById(state.tasks, action.payload.taskId, (t) => ({
          ...t,
          checklist: [...t.checklist, emptyChecklistItem(action.payload.text)],
        })),
      }

    case 'CYCLE_CHECKLIST_ITEM_STATUS':
      return {
        ...state,
        tasks: updateTaskById(state.tasks, action.payload.taskId, (t) =>
          withChecklistPromotion({
            ...t,
            checklist: t.checklist.map((c) =>
              c.id === action.payload.itemId ? { ...c, status: nextStatus(c.status) } : c,
            ),
          }),
        ),
      }

    case 'REMOVE_CHECKLIST_ITEM':
      return {
        ...state,
        tasks: updateTaskById(state.tasks, action.payload.taskId, (t) => ({
          ...t,
          checklist: t.checklist.filter((c) => c.id !== action.payload.itemId),
        })),
      }

    // ---- Attachments (embebidos en tarea) ----

    case 'ADD_ATTACHMENT':
      return {
        ...state,
        tasks: updateTaskById(state.tasks, action.payload.taskId, (t) => ({
          ...t,
          attachments: [
            ...t.attachments,
            {
              id: newAttachmentId(),
              label: action.payload.label,
              ref: action.payload.ref,
              kind: action.payload.kind,
            },
          ],
        })),
      }

    case 'REMOVE_ATTACHMENT':
      return {
        ...state,
        tasks: updateTaskById(state.tasks, action.payload.taskId, (t) => ({
          ...t,
          attachments: t.attachments.filter((a) => a.id !== action.payload.attachmentId),
        })),
      }

    // ---- Proyectos (mínimo necesario para el dropdown de la Fase 1;
    //      la pestaña de Proyectos completa llega en Fase 2) ----

    case 'ADD_PROJECT': {
      const project = { ...emptyProject(action.payload.seed), ...action.payload.overrides }
      return { ...state, projects: [...state.projects, project] }
    }

    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: updateProjectById(state.projects, action.payload.id, (p) => ({
          ...p,
          ...action.payload.patch,
        })),
      }

    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload.id),
        // Las tareas del proyecto quedan sueltas (projectId: null) en vez de
        // borrarse en cascada — perder tareas por accidente es peor que
        // dejarlas sin proyecto.
        tasks: state.tasks.map((t) =>
          t.projectId === action.payload.id ? touch({ ...t, projectId: null, activity: null }) : t,
        ),
      }

    // Inserción en bloque de las actividades/tareas aceptadas desde la
    // revisión de sugerencias de IA (ARQUITECTURA.md §5, paso 4): una sola
    // acción -> una sola escritura debounced de projects y de tasks.
    case 'INSERT_AI_SUGGESTIONS': {
      const { projectId, activities } = action.payload
      const newActivityNames = activities.map((a) => a.name)
      const newTasks = activities.flatMap((activity) =>
        activity.tasks.map((t) => {
          const task = emptyTask({
            important: t.important,
            urgent: t.urgent,
            projectId,
            activity: activity.name,
          })
          return { ...task, name: t.name, description: t.description ?? '', deadline: t.suggestedDeadline ?? null }
        }),
      )

      return {
        ...state,
        projects: updateProjectById(state.projects, projectId, (p) => ({
          ...p,
          activityOrder: [...p.activityOrder, ...newActivityNames.filter((n) => !p.activityOrder.includes(n))],
        })),
        tasks: [...state.tasks, ...newTasks],
      }
    }

    default:
      return state
  }
}
