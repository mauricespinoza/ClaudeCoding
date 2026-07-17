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
  defaultMeta,
} from './model.js'

export const initialState = {
  hydrated: false,
  projects: [],
  tasks: [],
  meetings: [],
  meta: defaultMeta(),
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
        meetings: action.payload.meetings ?? [],
        meta: action.payload.meta,
      }

    case 'SET_LAST_TAB':
      return { ...state, meta: { ...state.meta, lastTab: action.payload } }

    case 'SET_SUBTITLE':
      return { ...state, meta: { ...state.meta, subtitle: action.payload } }

    case 'SET_NOTIFICATIONS_ENABLED':
      return { ...state, meta: { ...state.meta, notificationsEnabled: action.payload } }

    case 'SET_AI_CONFIG':
      return { ...state, meta: { ...state.meta, ai: { ...state.meta.ai, ...action.payload } } }

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

    // Reordenar filas de tarea dentro de una misma actividad (drag & drop en
    // el Gantt): reasigna `order` en secuencia para exactamente esos ids,
    // generando timestamps consecutivos para no chocar con valores de otras
    // tareas ni depender de mezclar tipos en el campo (sigue siendo string
    // ISO, igual que el resto de la app).
    case 'REORDER_TASKS': {
      const { taskIds } = action.payload
      const base = Date.now()
      const orderMap = new Map(taskIds.map((id, i) => [id, new Date(base + i).toISOString()]))
      return {
        ...state,
        tasks: state.tasks.map((t) => (orderMap.has(t.id) ? touch({ ...t, order: orderMap.get(t.id) }) : t)),
      }
    }

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

    // Agregar una actividad desde fuera del formulario de proyecto (ej. el
    // botón "+ Nueva actividad" del Gantt): el reducer lee el activityOrder
    // actual, evitando que el componente que dispara la acción tenga que
    // arrastrar una copia potencialmente desactualizada.
    case 'ADD_ACTIVITY': {
      const { projectId, name } = action.payload
      const trimmed = name.trim()
      if (!trimmed) return state
      return {
        ...state,
        projects: updateProjectById(state.projects, projectId, (p) =>
          p.activityOrder.includes(trimmed) ? p : { ...p, activityOrder: [...p.activityOrder, trimmed] },
        ),
      }
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

    // ---- Notas categorizadas del proyecto (Idea/Dato/Hipótesis/GAP) ----

    case 'ADD_IDEA_NOTE':
      return {
        ...state,
        projects: updateProjectById(state.projects, action.payload.projectId, (p) => ({
          ...p,
          ideaNotes: [...(p.ideaNotes ?? []), action.payload.note],
        })),
      }

    case 'REMOVE_IDEA_NOTE':
      return {
        ...state,
        projects: updateProjectById(state.projects, action.payload.projectId, (p) => ({
          ...p,
          ideaNotes: (p.ideaNotes ?? []).filter((n) => n.id !== action.payload.noteId),
        })),
      }

    // ---- Reuniones ----

    case 'ADD_MEETING':
      return { ...state, meetings: [...state.meetings, action.payload.meeting] }

    case 'UPDATE_MEETING':
      return {
        ...state,
        meetings: state.meetings.map((m) =>
          m.id === action.payload.id ? touch({ ...m, ...action.payload.patch }) : m,
        ),
      }

    case 'DELETE_MEETING':
      return { ...state, meetings: state.meetings.filter((m) => m.id !== action.payload.id) }

    default:
      return state
  }
}
