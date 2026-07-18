import { useState } from 'react'
import { Calendar, CheckSquare, ChevronDown, ChevronRight, GripVertical, Paperclip, User } from 'lucide-react'
import { STATUS, formatDateOnly, isOverdue } from '../model.js'

const STATUS_DOT = {
  [STATUS.NOT_STARTED]: 'bg-gray-300',
  [STATUS.IN_PROGRESS]: 'bg-amber-500',
  [STATUS.DONE]: 'bg-emerald-500',
}

// Tarjeta de tarea de la matriz Eisenhower. `dispatchAndPersist` es opcional:
// si se pasa, se puede expandir el checklist y togglear ítems sin abrir el
// modal completo; `dragHandlers` es opcional también, para reordenar por
// arrastre dentro del mismo cuadrante (ver EisenhowerMatrix).
export function TaskCard({ task, project, onOpen, dispatchAndPersist, dragHandlers }) {
  const [expanded, setExpanded] = useState(false)
  const checklistDone = task.checklist.filter((c) => c.status === STATUS.DONE).length
  const overdue = isOverdue(task.deadline) && task.status !== STATUS.DONE

  const cycleItem = (itemId) => {
    if (!dispatchAndPersist) return
    dispatchAndPersist(
      { type: 'CYCLE_CHECKLIST_ITEM_STATUS', payload: { taskId: task.id, itemId } },
      ['tasks'],
    )
  }

  return (
    <div
      draggable={!!dragHandlers}
      onDragStart={dragHandlers?.onDragStart}
      onDragOver={dragHandlers?.onDragOver}
      onDrop={dragHandlers?.onDrop}
      className={`w-full rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md ${
        task.status === STATUS.DONE ? 'opacity-60' : ''
      } ${overdue ? 'border-red-400' : 'border-gray-200'} ${dragHandlers ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <button type="button" onClick={onOpen} className="w-full p-3 text-left">
        <div className="flex items-start gap-2">
          {dragHandlers && <GripVertical size={14} className="mt-1 shrink-0 text-gray-300" />}
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
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpanded((v) => !v)
                  }}
                  className="inline-flex items-center gap-1 hover:text-gray-800"
                >
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
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

      {expanded && task.checklist.length > 0 && (
        <div className="space-y-1 border-t border-gray-100 px-3 py-2 pl-9">
          {task.checklist.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                cycleItem(item.id)
              }}
              disabled={!dispatchAndPersist}
              className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-gray-50 disabled:cursor-default"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />
              <span
                className={`min-w-0 flex-1 truncate text-xs text-gray-700 ${
                  item.status === STATUS.DONE ? 'line-through text-gray-400' : ''
                }`}
              >
                {item.text}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
