import { Plus } from 'lucide-react'
import { QUADRANTS } from '../model.js'
import { TaskCard } from './TaskCard.jsx'
import { VoiceButton } from './VoiceButton.jsx'

export function EisenhowerMatrix({ tasks, projects, onOpenTask, onCreateTask, onQuickVoiceCreate }) {
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]))

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {QUADRANTS.map((q) => {
        const quadrantTasks = tasks
          .filter((t) => t.important === q.important && t.urgent === q.urgent)
          .sort((a, b) => (a.order < b.order ? -1 : 1))

        return (
          <div key={q.key} className={`rounded-xl border ${q.classes.panel} flex flex-col`}>
            <div className={`flex items-center justify-between rounded-t-xl border-b px-4 py-2.5 ${q.classes.header}`}>
              <div>
                <p className="text-sm font-semibold">{q.title}</p>
                <p className="text-xs opacity-80">{q.subtitle} · {quadrantTasks.length}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <VoiceButton
                  title="Crear tarea por voz en este cuadrante"
                  onResult={(text) => onQuickVoiceCreate(q, text)}
                />
                <button
                  type="button"
                  onClick={() => onCreateTask(q)}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${q.classes.button}`}
                  title="Nueva tarea"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-2 p-3 min-h-[120px]">
              {quadrantTasks.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-gray-400">Sin tareas</p>
              )}
              {quadrantTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={task.projectId ? projectById[task.projectId] : null}
                  onOpen={() => onOpenTask(task)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
