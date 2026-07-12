import { useMemo, useState } from 'react'
import groupBy from 'lodash/groupBy.js'
import { scaleTime, timeMonth, timeWeek } from 'd3'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { STATUS } from '../model.js'
import {
  ZOOM_LEVELS,
  clipToWindow,
  taskBarRange,
  ticksFor,
  windowFor,
} from '../ganttLayout.js'

const ROW_HEIGHT = 30
const HEADER_HEIGHT = 28
const GROUP_ROW_HEIGHT = 24

const STATUS_COLOR = {
  [STATUS.NOT_STARTED]: '#9ca3af',
  [STATUS.IN_PROGRESS]: '#d97706',
  [STATUS.DONE]: '#059669',
}

const ZOOM_OPTIONS = [
  { key: ZOOM_LEVELS.PROJECT, label: 'Proyecto completo', navigable: false },
  { key: ZOOM_LEVELS.WEEK, label: 'Semanal', navigable: true },
  { key: ZOOM_LEVELS.MONTH, label: 'Mensual', navigable: true },
  { key: ZOOM_LEVELS.SEMESTER, label: 'Semestral', navigable: true },
]

const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function formatTick(date, zoom) {
  if (zoom === ZOOM_LEVELS.WEEK) return `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()}`
  if (zoom === ZOOM_LEVELS.MONTH) return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
  if (zoom === ZOOM_LEVELS.SEMESTER) return MONTH_SHORT[date.getMonth()]
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
}

function plotWidthFor(zoom, tickCount) {
  const pxPerTick = { [ZOOM_LEVELS.WEEK]: 90, [ZOOM_LEVELS.MONTH]: 60, [ZOOM_LEVELS.SEMESTER]: 130 }[zoom] ?? 90
  return Math.max(700, tickCount * pxPerTick)
}

function navigate(zoom, cursor, dir) {
  if (zoom === ZOOM_LEVELS.WEEK) return timeWeek.offset(cursor, dir)
  if (zoom === ZOOM_LEVELS.MONTH) return timeMonth.offset(cursor, dir)
  if (zoom === ZOOM_LEVELS.SEMESTER) return timeMonth.offset(cursor, dir * 6)
  return cursor
}

export function GanttView({ projects, tasks, onOpenTask }) {
  const projectsWithTasks = useMemo(() => projects.filter((p) => !p.archived), [projects])
  const [selectedProjectId, setSelectedProjectId] = useState(projectsWithTasks[0]?.id ?? null)
  const [zoom, setZoom] = useState(ZOOM_LEVELS.PROJECT)
  const [cursor, setCursor] = useState(new Date())

  const selectedProject = projectsWithTasks.find((p) => p.id === selectedProjectId) ?? null
  const projectTasks = useMemo(
    () => (selectedProject ? tasks.filter((t) => t.projectId === selectedProject.id) : []),
    [tasks, selectedProject],
  )

  const window_ = selectedProject ? windowFor(zoom, cursor, selectedProject, tasks) : null
  const ticks = window_ ? ticksFor(zoom, window_) : []
  const plotWidth = window_ ? plotWidthFor(zoom, ticks.length) : 0
  const scale = window_ ? scaleTime().domain(window_).range([0, plotWidth]) : null

  const groups = useMemo(() => {
    const byActivity = groupBy(projectTasks, (t) => t.activity ?? '')
    const names = [...selectedProject?.activityOrder ?? []]
    for (const name of Object.keys(byActivity)) {
      if (name && !names.includes(name)) names.push(name)
    }
    const list = names.map((name) => ({ name, tasks: byActivity[name] ?? [] }))
    if (byActivity['']?.length) list.push({ name: null, tasks: byActivity[''] })
    return list.filter((g) => g.tasks.length > 0)
  }, [projectTasks, selectedProject])

  // Lista plana de filas a dibujar: encabezado de actividad + sus tareas,
  // cada una con su recorte a la ventana visible (null si no intersecta).
  const rows = useMemo(() => {
    if (!window_) return []
    const flat = []
    for (const group of groups) {
      flat.push({ type: 'group', label: group.name ?? 'Sin actividad' })
      for (const task of group.tasks) {
        flat.push({ type: 'task', task, clip: clipToWindow(taskBarRange(task), window_) })
      }
    }
    return flat
  }, [groups, window_])

  if (projectsWithTasks.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400">
        <p className="text-sm">Crea un proyecto para ver su Gantt.</p>
      </div>
    )
  }

  let y = 0
  const rowPositions = rows.map((row) => {
    const rowY = y
    y += row.type === 'group' ? GROUP_ROW_HEIGHT : ROW_HEIGHT
    return rowY
  })
  const plotHeight = y + HEADER_HEIGHT

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={selectedProjectId ?? ''}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        >
          {projectsWithTasks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          {ZOOM_OPTIONS.find((z) => z.key === zoom)?.navigable && (
            <>
              <button
                type="button"
                onClick={() => setCursor((c) => navigate(zoom, c, -1))}
                className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-100"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCursor((c) => navigate(zoom, c, 1))}
                className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-100"
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
          <div className="flex rounded-md border border-gray-300 p-0.5 text-xs">
            {ZOOM_OPTIONS.map((z) => (
              <button
                key={z.key}
                type="button"
                onClick={() => setZoom(z.key)}
                className={`rounded px-2.5 py-1 ${
                  zoom === z.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
          Este proyecto no tiene tareas todavía.
        </div>
      ) : (
        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          <div className="w-48 shrink-0 border-r border-gray-200 bg-gray-50">
            <div style={{ height: HEADER_HEIGHT }} className="border-b border-gray-200" />
            {rows.map((row, i) => (
              <div
                key={i}
                style={{ height: row.type === 'group' ? GROUP_ROW_HEIGHT : ROW_HEIGHT }}
                className={`flex items-center truncate px-2 text-xs ${
                  row.type === 'group'
                    ? 'font-semibold uppercase tracking-wide text-gray-500'
                    : 'text-gray-700'
                }`}
              >
                {row.type === 'group' ? (
                  row.label
                ) : (
                  <div className="min-w-0">
                    <p className="truncate">{row.task.name || 'Sin nombre'}</p>
                    {row.task.assignee && <p className="truncate text-[10px] text-gray-400">{row.task.assignee}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-x-auto">
            <svg width={plotWidth} height={plotHeight} role="img" aria-label="Diagrama de Gantt">
              {ticks.map((tick, i) => {
                const x = scale(tick)
                return (
                  <g key={i}>
                    <line x1={x} x2={x} y1={0} y2={plotHeight} stroke="#e5e7eb" />
                    <text x={x + 3} y={16} fontSize={10} fill="#6b7280">
                      {formatTick(tick, zoom)}
                    </text>
                  </g>
                )
              })}
              <line x1={0} x2={plotWidth} y1={HEADER_HEIGHT} y2={HEADER_HEIGHT} stroke="#d1d5db" />

              {rows.map((row, i) => {
                const rowY = rowPositions[i] + HEADER_HEIGHT

                if (row.type === 'group') {
                  return (
                    <line
                      key={i}
                      x1={0}
                      x2={plotWidth}
                      y1={rowY + GROUP_ROW_HEIGHT}
                      y2={rowY + GROUP_ROW_HEIGHT}
                      stroke="#f3f4f6"
                    />
                  )
                }

                if (!row.clip) return <g key={i} />

                const { range, overflowsLeft, overflowsRight } = row.clip
                const x = scale(range[0])
                const width = Math.max(scale(range[1]) - x, 5)
                const barY = rowY + 4
                const barHeight = ROW_HEIGHT - 8
                const color = STATUS_COLOR[row.task.status]
                const deadlineX = row.task.deadline && !overflowsRight ? scale(range[1]) : null

                return (
                  <g key={i} onClick={() => onOpenTask(row.task)} className="cursor-pointer">
                    <rect x={x} y={barY} width={width} height={barHeight} rx={4} fill={color} opacity={0.9}>
                      <title>
                        {row.task.name}
                        {row.task.assignee ? ` · ${row.task.assignee}` : ''}
                        {row.task.deadline ? ` · deadline ${row.task.deadline}` : ''}
                      </title>
                    </rect>
                    {overflowsLeft && (
                      <text x={x + 2} y={barY + barHeight / 2 + 3} fontSize={9} fill="white">
                        ◄
                      </text>
                    )}
                    {overflowsRight && (
                      <text x={x + width - 9} y={barY + barHeight / 2 + 3} fontSize={9} fill="white">
                        ►
                      </text>
                    )}
                    {row.task.deadline && deadlineX != null && (
                      <rect
                        x={deadlineX - 3}
                        y={rowY + ROW_HEIGHT / 2 - 3}
                        width={6}
                        height={6}
                        fill="#1f2937"
                        transform={`rotate(45 ${deadlineX} ${rowY + ROW_HEIGHT / 2})`}
                      />
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}
