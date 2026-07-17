import { useMemo, useState } from 'react'
import { CalendarDays, CheckSquare, Plus, Users } from 'lucide-react'
import { STATUS, formatDateOnly, projectColor } from '../model.js'
import { chipStyle } from '../color.js'

const ALL = '__all__'

export function MeetingsTab({ meetings, projects, tagColors, onOpenMeeting, onCreateMeeting }) {
  const [projectFilter, setProjectFilter] = useState(ALL)

  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects])

  const visible = useMemo(() => {
    const filtered =
      projectFilter === ALL ? meetings : meetings.filter((m) => (m.projectId ?? '') === projectFilter)
    // Más recientes primero; las sin fecha al final.
    return [...filtered].sort((a, b) => (b.date ?? '') < (a.date ?? '') ? -1 : 1)
  }, [meetings, projectFilter])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        >
          <option value={ALL}>Todas las reuniones</option>
          <option value="">Sin proyecto</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCreateMeeting}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={15} />
          Nueva reunión
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400">
          <p className="text-sm">Aún no hay reuniones registradas.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((meeting) => {
            const project = meeting.projectId ? projectById[meeting.projectId] : null
            const pendingActions = meeting.actions.filter((a) => a.status !== STATUS.DONE).length
            return (
              <button
                key={meeting.id}
                type="button"
                onClick={() => onOpenMeeting(meeting)}
                className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{meeting.title || 'Sin título'}</p>
                  <div className="flex items-center gap-2">
                    {project && (
                      <span
                        className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                        style={chipStyle(projectColor(project, tagColors))}
                      >
                        {project.name}
                      </span>
                    )}
                    {meeting.date && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <CalendarDays size={12} />
                        {formatDateOnly(meeting.date)}
                      </span>
                    )}
                  </div>
                </div>
                {meeting.mainIdeas && (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{meeting.mainIdeas}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  {meeting.attendees && (
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} />
                      {meeting.attendees}
                    </span>
                  )}
                  {meeting.actions.length > 0 && (
                    <span className={`inline-flex items-center gap-1 ${pendingActions > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      <CheckSquare size={12} />
                      {meeting.actions.length - pendingActions}/{meeting.actions.length} acciones completadas
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
