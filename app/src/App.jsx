import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CalendarDays, ClipboardList, FolderKanban } from 'lucide-react'
import { appReducer, initialState } from './reducer.js'
import { loadAll, saveProjects, saveTasks, saveMeta, createDebouncedWriter } from './storage.js'
import { emptyTask, emptyProject } from './model.js'
import { EisenhowerMatrix } from './components/EisenhowerMatrix.jsx'
import { TaskModal } from './components/TaskModal.jsx'
import { ProjectsTab } from './components/ProjectsTab.jsx'
import { ProjectDetailPanel } from './components/ProjectDetailPanel.jsx'
import { CalendarGanttTab } from './components/CalendarGanttTab.jsx'
import { BackupControls } from './components/BackupControls.jsx'

const TABS = [
  { key: 'tasks', label: 'Tareas', icon: ClipboardList },
  { key: 'projects', label: 'Proyectos', icon: FolderKanban },
  { key: 'calendar', label: 'Calendario / Gantt', icon: CalendarDays },
]

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [activeTab, setActiveTab] = useState('tasks')
  const [openTask, setOpenTask] = useState(null) // { task, isNew }
  const [openProject, setOpenProject] = useState(null) // { project, isNew }

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

  const handleOpenProject = (project) => setOpenProject({ project, isNew: false })

  const handleCreateProject = () => setOpenProject({ project: emptyProject(), isNew: true })

  const handleDeleteProject = async (id) => {
    dispatch({ type: 'DELETE_PROJECT', payload: { id } })
    setOpenProject(null)
    await Promise.all([projectsWriter.current.flush(), tasksWriter.current.flush()])
  }

  // Nueva tarea disparada desde dentro del detalle de un proyecto: queda
  // preasignada a ese proyecto y a la actividad sobre la que se hizo click.
  const handleCreateTaskInProject = (project, activityName) => {
    setOpenTask({
      task: emptyTask({ projectId: project.id, activity: activityName }),
      isNew: true,
    })
  }

  const projectOptions = useMemo(
    () => state.projects.filter((p) => !p.archived),
    [state.projects],
  )

  // Cargar un respaldo es una acción explícita y destructiva: se escribe de
  // inmediato con los datos recién importados (el efecto de persistencia
  // debounced todavía no corrió con el nuevo estado en este punto).
  const handleBackupImported = async (data) => {
    await Promise.all([saveProjects(data.projects), saveTasks(data.tasks), saveMeta(data.meta)])
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-start justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Gestor Académico</h1>
            <p className="text-xs text-gray-500">Tareas y proyectos — geología estructural</p>
          </div>
          {state.hydrated && <BackupControls state={state} dispatch={dispatch} onImported={handleBackupImported} />}
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
            {activeTab === 'projects' && (
              <ProjectsTab
                projects={state.projects}
                tasks={state.tasks}
                onOpenProject={handleOpenProject}
                onCreateProject={handleCreateProject}
              />
            )}
            {activeTab === 'calendar' && (
              <CalendarGanttTab
                tasks={state.tasks}
                projects={state.projects}
                onOpenTask={handleOpenTask}
                onOpenProject={handleOpenProject}
              />
            )}
          </>
        )}
      </main>

      {openProject && (
        <ProjectDetailPanel
          project={openProject.project}
          isNew={openProject.isNew}
          tasks={state.tasks}
          dispatch={dispatch}
          onClose={() => setOpenProject(null)}
          onDelete={handleDeleteProject}
          onOpenTask={handleOpenTask}
          onCreateTask={handleCreateTaskInProject}
        />
      )}

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
