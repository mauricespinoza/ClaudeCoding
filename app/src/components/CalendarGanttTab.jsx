import { useState } from 'react'
import { CalendarView } from './CalendarView.jsx'
import { GanttView } from './GanttView.jsx'

export function CalendarGanttTab({ tasks, projects, tagColors, dispatch, onOpenTask, onOpenProject }) {
  const [subView, setSubView] = useState('calendar')

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {[
          { key: 'calendar', label: 'Calendario' },
          { key: 'gantt', label: 'Gantt' },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubView(key)}
            className={`border-b-2 px-3 py-1.5 text-sm font-medium ${
              subView === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subView === 'calendar' ? (
        <CalendarView
          tasks={tasks}
          projects={projects}
          tagColors={tagColors}
          onOpenTask={onOpenTask}
          onOpenProject={onOpenProject}
        />
      ) : (
        <GanttView tasks={tasks} projects={projects} tagColors={tagColors} dispatch={dispatch} onOpenTask={onOpenTask} />
      )}
    </div>
  )
}
