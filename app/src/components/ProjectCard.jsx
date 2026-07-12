import { Archive, Calendar } from 'lucide-react'
import { PROJECT_COLOR_TAGS, formatDateOnly, isOverdue, projectCompletion } from '../model.js'

const IMPORTANCE_LABEL = { 1: 'Baja', 2: 'Media', 3: 'Alta' }

export function ProjectCard({ project, tasks, onOpen }) {
  const completion = projectCompletion(project, tasks)
  const colorTag = PROJECT_COLOR_TAGS[project.colorTag]
  const overdue = isOverdue(project.deadline) && completion < 100
  const taskCount = tasks.filter((t) => t.projectId === project.id).length

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left rounded-lg border bg-white p-4 shadow-sm hover:shadow-md transition-shadow ${
        overdue ? 'border-red-300' : 'border-gray-200'
      } ${project.archived ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{project.name || 'Sin nombre'}</p>
          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{project.description}</p>
        </div>
        {project.archived && <Archive size={14} className="shrink-0 text-gray-400" />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorTag.className}`}>
          {colorTag.label}
        </span>
        <span className="text-xs text-gray-500">Importancia: {IMPORTANCE_LABEL[project.importance]}</span>
        {project.deadline && (
          <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            <Calendar size={12} />
            {formatDateOnly(project.deadline)}
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{taskCount} tarea{taskCount === 1 ? '' : 's'}</span>
          <span className="font-medium text-gray-700">
            {completion}%{project.completionOverride != null ? ' (manual)' : ''}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${completion}%` }} />
        </div>
      </div>
    </button>
  )
}
