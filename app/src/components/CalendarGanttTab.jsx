import { useState } from 'react'
import { CalendarView } from './CalendarView.jsx'

function GanttComingSoon() {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400">
      <p className="text-sm">La vista Gantt llega en la Fase 5 del build.</p>
      <p className="mt-1 text-xs">Ver plan de fases en ARQUITECTURA.md</p>
    </div>
  )
}

export function CalendarGanttTab({ tasks, projects, onOpenTask, onOpenProject }) {
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
        <CalendarView tasks={tasks} projects={projects} onOpenTask={onOpenTask} onOpenProject={onOpenProject} />
      ) : (
        <GanttComingSoon />
      )}
    </div>
  )
}
