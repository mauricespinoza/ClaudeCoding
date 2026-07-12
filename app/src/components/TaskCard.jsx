import { Calendar, CheckSquare, Paperclip, User } from 'lucide-react'
import { STATUS, formatDateOnly, isOverdue } from '../model.js'

const STATUS_DOT = {
  [STATUS.NOT_STARTED]: 'bg-gray-300',
  [STATUS.IN_PROGRESS]: 'bg-amber-500',
  [STATUS.DONE]: 'bg-emerald-500',
}

export function TaskCard({ task, project, onOpen }) {
  const checklistDone = task.checklist.filter((c) => c.status === STATUS.DONE).length
  const overdue = isOverdue(task.deadline) && task.status !== STATUS.DONE

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left bg-white rounded-lg border shadow-sm p-3 hover:shadow-md transition-shadow ${
        task.status === STATUS.DONE ? 'opacity-60' : ''
      } ${overdue ? 'border-red-400' : 'border-gray-200'}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium text-gray-900 truncate ${
              task.status === STATUS.DONE ? 'line-through' : ''
            }`}
          >
            {task.name || 'Sin nombre'}
          </p>
          {project && (
            <p className="text-xs text-gray-500 truncate">{project.name}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {task.deadline && (
              <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : ''}`}>
                <Calendar size={12} />
                {formatDateOnly(task.deadline)}
              </span>
            )}
            {task.assignee && (
              <span className="inline-flex items-center gap-1">
                <User size={12} />
                {task.assignee}
              </span>
            )}
            {task.checklist.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <CheckSquare size={12} />
                {checklistDone}/{task.checklist.length}
              </span>
            )}
            {task.attachments.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip size={12} />
                {task.attachments.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
