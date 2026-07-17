import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CalendarDays, ClipboardList, FolderKanban, GanttChart, Pencil, Users } from 'lucide-react'
import { appReducer, initialState } from './reducer.js'
import {
  loadAll,
  saveAll,
  saveProjects,
  saveTasks,
  saveMeta,
  saveMeetings,
  setStorageBackend,
  createDebouncedWriter,
} from './storage.js'
import { emptyTask, emptyProject, emptyMeeting, DEFAULT_SUBTITLE } from './model.js'
import { notifyDueTasks } from './notifications.js'
import { createCloudBackend, getSession } from './cloud.js'
import { EisenhowerMatrix } from './components/EisenhowerMatrix.jsx'
import { QuickNoteWidget } from './components/QuickNoteWidget.jsx'
import { TaskModal } from './components/TaskModal.jsx'
import { ProjectsTab } from './components/ProjectsTab.jsx'
import { ProjectDetailPanel } from './components/ProjectDetailPanel.jsx'
import { CalendarView } from './components/CalendarView.jsx'
import { GanttView } from './components/GanttView.jsx'
import { MeetingsTab } from './components/MeetingsTab.jsx'
import { MeetingModal } from './components/MeetingModal.jsx'
import { BackupControls } from './components/BackupControls.jsx'
import { NotificationsControl } from './components/NotificationsControl.jsx'
import { AccountControl } from './components/AccountControl.jsx'

const TABS = [
  { key: 'tasks', label: 'Tareas', icon: ClipboardList },
  { key: 'projects', label: 'Proyectos', icon: FolderKanban },
  { key: 'meetings', label: 'Reuniones', icon: Users },
  { key: 'calendar', label: 'Calendario', icon: CalendarDays },
  { key: 'gantt', label: 'Gantt', icon: GanttChart },
]

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [activeTab, setActiveTab] = useState('tasks')
  const [openTask, setOpenTask] = useState(null) // { task, isNew }
  const [openProject, setOpenProject] = useState(null) // { project, isNew }
  const [openMeeting, setOpenMeeting] = useState(null) // { meeting, isNew }
  const [editingSubtitle, setEditingSubtitle] = useState(false)
  const [subtitleDraft, setSubtitleDraft] = useState('')
  const [cloudSession, setCloudSession] = useState(null)
  const notifiedRef = useRef(false)

  const projectsWriter = useRef(createDebouncedWriter(saveProjects))
  const tasksWriter = useRef(createDebouncedWriter(saveTasks))
  const metaWriter = useRef(createDebouncedWriter(saveMeta))
  const meetingsWriter = useRef(createDebouncedWriter(saveMeetings))

  // Carga inicial: si hay una sesión de nube guardada (login previo en este
  // dispositivo), se activa el backend de nube ANTES de leer; si no, se lee
  // del almacenamiento local como siempre. Si la nube falla (sin red), se
  // cae al modo local en vez de dejar la app en blanco.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await getSession()
        if (session) {
          setStorageBackend(createCloudBackend())
          if (!cancelled) setCloudSession(session)
        }
        const data = await loadAll()
        if (!cancelled) dispatch({ type: 'HYDRATE', payload: data })
      } catch {
        setStorageBackend(null)
        if (!cancelled) {
          setCloudSession(null)
          const data = await loadAll()
          if (!cancelled) dispatch({ type: 'HYDRATE', payload: data })
        }
      }
    })()
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

  useEffect(() => {
    if (!state.hydrated) return
    meetingsWriter.current.schedule(state.meetings)
  }, [state.hydrated, state.meetings])

  // Aviso de tareas vencidas/con deadline hoy al abrir la app (una vez por
  // sesión), solo si el usuario activó notificaciones en una sesión previa
  // y el permiso del navegador sigue concedido.
  useEffect(() => {
    if (!state.hydrated || notifiedRef.current || !state.meta.notificationsEnabled) return
    notifiedRef.current = true
    notifyDueTasks(state.tasks)
  }, [state.hydrated, state.meta.notificationsEnabled, state.tasks])

  const changeTab = (tab) => {
    setActiveTab(tab)
    dispatch({ type: 'SET_LAST_TAB', payload: tab })
  }

  // Persistencia inmediata para acciones explícitas del usuario (guardar,
  // borrar, confirmar). `flush()` del escritor debounced NO sirve aquí:
  // se ejecuta antes de que el useEffect que agenda la escritura llegue a
  // correr con el nuevo estado (dispatch no re-renderiza sincrónicamente),
  // así que terminaría persistiendo el valor anterior. En su lugar se
  // recalcula el próximo estado con el mismo reducer puro y se escribe
  // directamente esa parte, sin depender del ciclo de efectos de React.
  const dispatchAndPersist = async (action, parts) => {
    const nextState = appReducer(state, action)
    dispatch(action)
    await Promise.all(
      parts.map((part) => {
        if (part === 'tasks') return saveTasks(nextState.tasks)
        if (part === 'projects') return saveProjects(nextState.projects)
        if (part === 'meetings') return saveMeetings(nextState.meetings)
        return saveMeta(nextState.meta)
      }),
    )
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
    const action = openTask?.isNew
      ? { type: 'ADD_TASK', payload: { seed: {}, overrides: draft } }
      : { type: 'UPDATE_TASK', payload: { id: draft.id, patch: draft } }
    setOpenTask(null)
    // 'projects' también se persiste: cubre el caso de haber creado un
    // proyecto nuevo inline desde el propio modal justo antes de guardar.
    await dispatchAndPersist(action, ['tasks', 'projects'])
  }

  const handleDeleteTask = async (id) => {
    setOpenTask(null)
    await dispatchAndPersist({ type: 'DELETE_TASK', payload: { id } }, ['tasks'])
  }

  const handleOpenProject = (project) => setOpenProject({ project, isNew: false })

  const handleCreateProject = () => setOpenProject({ project: emptyProject(), isNew: true })

  const handleDeleteProject = async (id) => {
    setOpenProject(null)
    await dispatchAndPersist({ type: 'DELETE_PROJECT', payload: { id } }, ['projects', 'tasks'])
  }

  // Nueva tarea disparada desde dentro del detalle de un proyecto o del
  // Gantt: queda preasignada a ese proyecto y a la actividad sobre la que
  // se hizo click.
  const handleCreateTaskInProject = (project, activityName) => {
    setOpenTask({
      task: emptyTask({ projectId: project.id, activity: activityName }),
      isNew: true,
    })
  }

  // Creación rápida desde el detalle de un día del calendario: solo nombre
  // y deadline, sin abrir el modal completo. Persiste de inmediato por ser
  // una acción explícita del usuario.
  const handleQuickCreateTaskOnDate = async (dateOnly, name) => {
    await dispatchAndPersist(
      { type: 'ADD_TASK', payload: { seed: {}, overrides: { name, deadline: dateOnly } } },
      ['tasks'],
    )
  }

  const handleStartEditSubtitle = () => {
    setSubtitleDraft(state.meta.subtitle)
    setEditingSubtitle(true)
  }

  const commitSubtitle = async () => {
    const trimmed = subtitleDraft.trim()
    setEditingSubtitle(false)
    await dispatchAndPersist({ type: 'SET_SUBTITLE', payload: trimmed || DEFAULT_SUBTITLE }, ['meta'])
  }

  const projectOptions = useMemo(
    () => state.projects.filter((p) => !p.archived),
    [state.projects],
  )

  // Cargar un respaldo es una acción explícita y destructiva: se escribe de
  // inmediato con los datos recién importados (el efecto de persistencia
  // debounced todavía no corrió con el nuevo estado en este punto).
  const handleBackupImported = async (data) => {
    await Promise.all([
      saveProjects(data.projects),
      saveTasks(data.tasks),
      saveMeta(data.meta),
      saveMeetings(data.meetings ?? []),
    ])
  }

  // ---- Reuniones ----

  const handleCreateMeeting = () => setOpenMeeting({ meeting: emptyMeeting(), isNew: true })

  const handleOpenMeeting = (meeting) => setOpenMeeting({ meeting, isNew: false })

  const handleSaveMeeting = async (draft) => {
    const action = openMeeting?.isNew
      ? { type: 'ADD_MEETING', payload: { meeting: draft } }
      : { type: 'UPDATE_MEETING', payload: { id: draft.id, patch: draft } }
    setOpenMeeting(null)
    await dispatchAndPersist(action, ['meetings'])
  }

  const handleDeleteMeeting = async (id) => {
    setOpenMeeting(null)
    await dispatchAndPersist({ type: 'DELETE_MEETING', payload: { id } }, ['meetings'])
  }

  // ---- Nube ----

  // Tras iniciar sesión: cambiar el backend a la nube y recargar desde ahí.
  // Si la nube está vacía y este dispositivo tiene datos locales, se ofrece
  // subirlos (típico primer login desde el computador de siempre).
  const handleSignedIn = async (session) => {
    const localState = state
    setStorageBackend(createCloudBackend())
    setCloudSession(session)
    const cloudData = await loadAll()

    const cloudIsEmpty = cloudData.projects.length === 0 && cloudData.tasks.length === 0
    const localHasData = localState.projects.length > 0 || localState.tasks.length > 0
    if (cloudIsEmpty && localHasData) {
      const upload = window.confirm(
        `Tu cuenta en la nube está vacía y este dispositivo tiene ${localState.projects.length} proyecto(s) y ` +
          `${localState.tasks.length} tarea(s) locales. ¿Subirlos a la nube para usarlos en todos tus dispositivos?`,
      )
      if (upload) {
        await saveAll(localState)
        return // el estado en pantalla ya es el correcto; quedó copiado a la nube
      }
    }
    dispatch({ type: 'HYDRATE', payload: cloudData })
  }

  // Al cerrar sesión se vuelve al modo local y se recarga lo que haya en
  // este dispositivo (los datos de la nube quedan intactos en el servidor).
  const handleSignedOut = async () => {
    setStorageBackend(null)
    setCloudSession(null)
    const data = await loadAll()
    dispatch({ type: 'HYDRATE', payload: data })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900">Gestor Académico</h1>
            {editingSubtitle ? (
              <input
                autoFocus
                value={subtitleDraft}
                onChange={(e) => setSubtitleDraft(e.target.value)}
                onBlur={commitSubtitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitSubtitle()
                  if (e.key === 'Escape') setEditingSubtitle(false)
                }}
                className="mt-0.5 rounded border border-blue-300 px-1.5 py-0.5 text-xs focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={handleStartEditSubtitle}
                title="Editar subtítulo"
                className="group mt-0.5 flex items-center gap-1 text-left"
              >
                <p className="text-xs text-gray-500">{state.meta.subtitle}</p>
                <Pencil size={11} className="text-gray-300 opacity-0 group-hover:opacity-100" />
              </button>
            )}
          </div>
          {state.hydrated && (
            <div className="flex flex-wrap items-center gap-1.5">
              <AccountControl session={cloudSession} onSignedIn={handleSignedIn} onSignedOut={handleSignedOut} />
              <NotificationsControl
                enabled={state.meta.notificationsEnabled}
                tasks={state.tasks}
                dispatch={dispatch}
              />
              <BackupControls state={state} dispatch={dispatch} onImported={handleBackupImported} />
            </div>
          )}
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => changeTab(key)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
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
              <>
                <QuickNoteWidget projects={projectOptions} dispatchAndPersist={dispatchAndPersist} />
                <EisenhowerMatrix
                  tasks={state.tasks}
                  projects={projectOptions}
                  onOpenTask={handleOpenTask}
                  onCreateTask={handleCreateTask}
                  onQuickVoiceCreate={handleQuickVoiceCreate}
                />
              </>
            )}
            {activeTab === 'projects' && (
              <ProjectsTab
                projects={state.projects}
                tasks={state.tasks}
                tagColors={state.meta.tagColors}
                dispatch={dispatch}
                onOpenProject={handleOpenProject}
                onCreateProject={handleCreateProject}
              />
            )}
            {activeTab === 'meetings' && (
              <MeetingsTab
                meetings={state.meetings}
                projects={projectOptions}
                tagColors={state.meta.tagColors}
                onOpenMeeting={handleOpenMeeting}
                onCreateMeeting={handleCreateMeeting}
              />
            )}
            {activeTab === 'calendar' && (
              <CalendarView
                tasks={state.tasks}
                projects={state.projects}
                tagColors={state.meta.tagColors}
                onOpenTask={handleOpenTask}
                onOpenProject={handleOpenProject}
                onQuickCreateTask={handleQuickCreateTaskOnDate}
              />
            )}
            {activeTab === 'gantt' && (
              <GanttView
                tasks={state.tasks}
                projects={state.projects}
                tagColors={state.meta.tagColors}
                dispatchAndPersist={dispatchAndPersist}
                onOpenTask={handleOpenTask}
                onCreateTask={handleCreateTaskInProject}
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
          tagColors={state.meta.tagColors}
          aiConfig={state.meta.ai}
          dispatchAndPersist={dispatchAndPersist}
          onClose={() => setOpenProject(null)}
          onDelete={handleDeleteProject}
          onOpenTask={handleOpenTask}
          onCreateTask={handleCreateTaskInProject}
        />
      )}

      {openMeeting && (
        <MeetingModal
          meeting={openMeeting.meeting}
          isNew={openMeeting.isNew}
          projects={projectOptions}
          onClose={() => setOpenMeeting(null)}
          onSave={handleSaveMeeting}
          onDelete={handleDeleteMeeting}
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
