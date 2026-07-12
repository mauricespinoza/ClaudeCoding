import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CalendarDays, ClipboardList, FolderKanban } from 'lucide-react'
import { appReducer, initialState } from './reducer.js'
import { loadAll, saveProjects, saveTasks, saveMeta, createDebouncedWriter } from './storage.js'
import { emptyTask } from './model.js'
import { EisenhowerMatrix } from './components/EisenhowerMatrix.jsx'
import { TaskModal } from './components/TaskModal.jsx'

const TABS = [
  { key: 'tasks', label: 'Tareas', icon: ClipboardList },
  { key: 'projects', label: 'Proyectos', icon: FolderKanban },
  { key: 'calendar', label: 'Calendario / Gantt', icon: CalendarDays },
]

function ComingSoon({ label }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400">
      <p className="text-sm">{label} llega en una fase posterior del build.</p>
      <p className="text-xs mt-1">Ver plan de fases en ARQUITECTURA.md</p>
    </div>
  )
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [activeTab, setActiveTab] = useState('tasks')
  const [openTask, setOpenTask] = useState(null) // { task, isNew }

  const projectsWriter = useRef(createDebouncedWriter(saveProjects))
  const tasksWriter = useRef(createDebouncedWriter(saveTasks))
  const metaWriter = useRef(createDebouncedWriter(saveMeta))

  // Carga inicial (Fase 0): una lectura de cada colección al montar.
  useEffect(() => {
    let cancelled = false
    loadAll().then((data) => {
      if (!cancelled) dispatch({ type: 'HYDRATE', payload: data })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Persistencia debounced: cada mutación de colección agenda una escritura.
  useEffect(() => {
    if (!state.hydrated) return
    projectsWriter.current.schedule(state.projects)
  }, [state.hydrated, state.projects])

  useEffect(() => {
    if (!state.hydrated) return
    tasksWriter.current.schedule(state.tasks)
  }, [state.hydrated, state.tasks])

  useEffect(() => {
    if (!state.hydrated) return
    metaWriter.current.schedule(state.meta)
  }, [state.hydrated, state.meta])

  const changeTab = (tab) => {
    setActiveTab(tab)
    dispatch({ type: 'SET_LAST_TAB', payload: tab })
  }

  const handleCreateTask = (quadrant) => {
    setOpenTask({ task: emptyTask({ important: quadrant.important, urgent: quadrant.urgent }), isNew: true })
  }

  const handleQuickVoiceCreate = (quadrant, text) => {
    const task = emptyTask({ important: quadrant.important, urgent: quadrant.urgent })
    task.name = text
    setOpenTask({ task, isNew: true })
  }

  const handleOpenTask = (task) => {
    setOpenTask({ task, isNew: false })
  }

  const handleSaveTask = async (draft) => {
    if (openTask?.isNew) {
      dispatch({ type: 'ADD_TASK', payload: { seed: {}, overrides: draft } })
    } else {
      dispatch({ type: 'UPDATE_TASK', payload: { id: draft.id, patch: draft } })
    }
    setOpenTask(null)
    // Flush inmediato: guardar desde el modal es una acción explícita del usuario.
    await tasksWriter.current.flush()
    await projectsWriter.current.flush()
  }

  const handleDeleteTask = async (id) => {
    dispatch({ type: 'DELETE_TASK', payload: { id } })
    setOpenTask(null)
    await tasksWriter.current.flush()
  }

  const projectOptions = useMemo(
    () => state.projects.filter((p) => !p.archived),
    [state.projects],
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <h1 className="text-lg font-semibold text-gray-900">Gestor Académico</h1>
          <p className="text-xs text-gray-500">Tareas y proyectos — geología estructural</p>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-4">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => changeTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                activeTab === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {!state.hydrated ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : (
          <>
            {activeTab === 'tasks' && (
              <EisenhowerMatrix
                tasks={state.tasks}
                projects={projectOptions}
                onOpenTask={handleOpenTask}
                onCreateTask={handleCreateTask}
                onQuickVoiceCreate={handleQuickVoiceCreate}
              />
            )}
            {activeTab === 'projects' && <ComingSoon label="La pestaña de Proyectos" />}
            {activeTab === 'calendar' && <ComingSoon label="Calendario / Gantt" />}
          </>
        )}
      </main>

      {openTask && (
        <TaskModal
          task={openTask.task}
          projects={projectOptions}
          dispatch={dispatch}
          onClose={() => setOpenTask(null)}
          onSave={handleSaveTask}
          onDelete={openTask.isNew ? null : handleDeleteTask}
        />
      )}
    </div>
  )
}
