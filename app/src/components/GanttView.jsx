import { useMemo, useRef, useState } from 'react'
import groupBy from 'lodash/groupBy.js'
import { scaleTime, timeMonth, timeWeek } from 'd3'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { STATUS, formatDateOnly, projectColor } from '../model.js'
import { chipStyle } from '../color.js'
import { fromDateOnly, toDateOnly } from '../calendarDates.js'
import {
  ZOOM_LEVELS,
  clipToWindow,
  taskBarRange,
  ticksFor,
  windowFor,
} from '../ganttLayout.js'

const ROW_HEIGHT = 30
const DETAIL_HEIGHT = 32
const HEADER_HEIGHT = 28
const GROUP_ROW_HEIGHT = 24
const PROJECT_ROW_HEIGHT = 26
const ALL_PROJECTS = '__all__'

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

function buildActivityGroups(projectTasks, activityOrder) {
  const byActivity = groupBy(projectTasks, (t) => t.activity ?? '')
  const names = [...(activityOrder ?? [])]
  for (const name of Object.keys(byActivity)) {
    if (name && !names.includes(name)) names.push(name)
  }
  const groups = names.map((name) => ({ name, tasks: byActivity[name] ?? [] }))
  if (byActivity['']?.length) groups.push({ name: null, tasks: byActivity[''] })
  return groups.filter((g) => g.tasks.length > 0)
}

export function GanttView({ projects, tasks, tagColors, dispatch, onOpenTask }) {
  const projectsWithTasks = useMemo(() => projects.filter((p) => !p.archived), [projects])
  const [selectedProjectId, setSelectedProjectId] = useState(ALL_PROJECTS)
  const [zoom, setZoom] = useState(ZOOM_LEVELS.PROJECT)
  const [cursor, setCursor] = useState(new Date())
  const [expanded, setExpanded] = useState(() => new Set())
  const [drag, setDrag] = useState(null) // { taskId, edge: 'start'|'end', previewDateOnly }
  const svgRef = useRef(null)

  const isAllProjects = selectedProjectId === ALL_PROJECTS
  const relevantProjects = isAllProjects
    ? projectsWithTasks
    : projectsWithTasks.filter((p) => p.id === selectedProjectId)
  const relevantTasks = useMemo(
    () => tasks.filter((t) => relevantProjects.some((p) => p.id === t.projectId)),
    [tasks, relevantProjects],
  )

  const window_ = relevantProjects.length
    ? windowFor(zoom, cursor, isAllProjects ? null : relevantProjects[0], relevantTasks)
    : null
  const ticks = window_ ? ticksFor(zoom, window_) : []
  const plotWidth = window_ ? plotWidthFor(zoom, ticks.length) : 0
  const scale = window_ ? scaleTime().domain(window_).range([0, plotWidth]) : null

  const toggleExpand = (taskId) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      return next
    })

  // Lista plana de filas: [encabezado de proyecto opcional] -> encabezado de
  // actividad -> tareas, cada una recortada a la ventana visible.
  const rows = useMemo(() => {
    if (!window_) return []
    const flat = []
    for (const project of relevantProjects) {
      const projectTasks = relevantTasks.filter((t) => t.projectId === project.id)
      const groups = buildActivityGroups(projectTasks, project.activityOrder)
      if (groups.length === 0) continue

      if (isAllProjects) flat.push({ type: 'project', project })
      for (const group of groups) {
        flat.push({ type: 'group', label: group.name ?? 'Sin actividad' })
        for (const task of group.tasks) {
          let range = taskBarRange(task)
          if (drag && drag.taskId === task.id && drag.previewDateOnly) {
            range =
              drag.edge === 'start'
                ? [fromDateOnly(drag.previewDateOnly), range[1]]
                : [range[0], fromDateOnly(drag.previewDateOnly)]
          }
          flat.push({
            type: 'task',
            task,
            clip: clipToWindow(range, window_),
            expanded: expanded.has(task.id),
          })
        }
      }
    }
    return flat
  }, [relevantProjects, relevantTasks, isAllProjects, window_, drag, expanded])

  const rowHeight = (row) => {
    if (row.type === 'project') return PROJECT_ROW_HEIGHT
    if (row.type === 'group') return GROUP_ROW_HEIGHT
    return ROW_HEIGHT + (row.expanded ? DETAIL_HEIGHT : 0)
  }

  let y = 0
  const rowPositions = rows.map((row) => {
    const rowY = y
    y += rowHeight(row)
    return rowY
  })
  const plotHeight = y + HEADER_HEIGHT

  const xToDateOnly = (clientX) => {
    const rect = svgRef.current.getBoundingClientRect()
    const localX = Math.max(0, Math.min(plotWidth, clientX - rect.left))
    return toDateOnly(scale.invert(localX))
  }

  const startDrag = (e, task, edge) => {
    e.stopPropagation()
    e.preventDefault()
    svgRef.current?.setPointerCapture(e.pointerId)
    setDrag({ taskId: task.id, edge, previewDateOnly: null })
  }

  const handlePointerMove = (e) => {
    if (!drag || !scale) return
    setDrag((prev) => (prev ? { ...prev, previewDateOnly: xToDateOnly(e.clientX) } : prev))
  }

  const handlePointerUp = () => {
    if (!drag) return
    const task = tasks.find((t) => t.id === drag.taskId)
    if (task && drag.previewDateOnly) {
      const fallbackStart = task.startDate ?? task.createdAt.slice(0, 10)
      let value = drag.previewDateOnly
      if (drag.edge === 'start' && task.deadline && value > task.deadline) value = task.deadline
      if (drag.edge === 'end' && value < fallbackStart) value = fallbackStart
      const field = drag.edge === 'start' ? 'startDate' : 'deadline'
      dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, patch: { [field]: value } } })
    }
    setDrag(null)
  }

  if (projectsWithTasks.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400">
        <p className="text-sm">Crea un proyecto para ver su Gantt.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        >
          <option value={ALL_PROJECTS}>Todos los proyectos</option>
          {projectsWithTasks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-wrap rounded-md border border-gray-300 p-0.5 text-xs">
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
          {isAllProjects ? 'Ningún proyecto tiene tareas todavía.' : 'Este proyecto no tiene tareas todavía.'}
        </div>
      ) : (
        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          <div className="w-36 shrink-0 border-r border-gray-200 bg-gray-50 sm:w-48">
            <div style={{ height: HEADER_HEIGHT }} className="border-b border-gray-200" />
            {rows.map((row, i) => (
              <div
                key={i}
                style={{ height: rowHeight(row) }}
                className={`flex items-start px-2 py-1 text-xs ${
                  row.type === 'group'
                    ? 'items-center font-semibold uppercase tracking-wide text-gray-500'
                    : row.type === 'project'
                      ? 'items-center font-bold text-gray-900'
                      : 'text-gray-700'
                }`}
              >
                {row.type === 'project' && (
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: projectColor(row.project, tagColors) }}
                    />
                    <span className="truncate">{row.project.name}</span>
                  </span>
                )}
                {row.type === 'group' && row.label}
                {row.type === 'task' && (
                  <div className="flex min-w-0 flex-1 items-start gap-1">
                    <button
                      type="button"
                      onClick={() => toggleExpand(row.task.id)}
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-700"
                      title="Ver inicio/deadline"
                    >
                      {row.expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    <div className="min-w-0">
                      <p className="truncate">{row.task.name || 'Sin nombre'}</p>
                      {row.task.assignee && <p className="truncate text-[10px] text-gray-400">{row.task.assignee}</p>}
                      {row.expanded && (
                        <p className="mt-1 text-[10px] leading-tight text-gray-500">
                          Inicio: {formatDateOnly(row.task.startDate ?? row.task.createdAt.slice(0, 10))}
                          <br />
                          Deadline: {row.task.deadline ? formatDateOnly(row.task.deadline) : 'sin definir'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-x-auto">
            <svg
              ref={svgRef}
              width={plotWidth}
              height={plotHeight}
              role="img"
              aria-label="Diagrama de Gantt"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
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
                const h = rowHeight(row)

                if (row.type === 'project' || row.type === 'group') {
                  return <line key={i} x1={0} x2={plotWidth} y1={rowY + h} y2={rowY + h} stroke="#f3f4f6" />
                }

                if (!row.clip) return <g key={i} />

                const { range, overflowsLeft, overflowsRight } = row.clip
                const x = scale(range[0])
                const width = Math.max(scale(range[1]) - x, 5)
                const barY = rowY + 4
                const barHeight = ROW_HEIGHT - 8
                const color = STATUS_COLOR[row.task.status]
                const isDraggingThis = drag && drag.taskId === row.task.id

                return (
                  <g key={i}>
                    <rect
                      x={x}
                      y={barY}
                      width={width}
                      height={barHeight}
                      rx={4}
                      fill={color}
                      opacity={0.9}
                      className="cursor-pointer"
                      onClick={() => onOpenTask(row.task)}
                    >
                      <title>
                        {row.task.name}
                        {row.task.assignee ? ` · ${row.task.assignee}` : ''}
                        {' · inicio '}
                        {formatDateOnly(row.task.startDate ?? row.task.createdAt.slice(0, 10))}
                        {row.task.deadline ? ` · deadline ${row.task.deadline}` : ''}
                      </title>
                    </rect>
                    {overflowsLeft && (
                      <text x={x + 2} y={barY + barHeight / 2 + 3} fontSize={9} fill="white" pointerEvents="none">
                        ◄
                      </text>
                    )}
                    {overflowsRight && (
                      <text x={x + width - 9} y={barY + barHeight / 2 + 3} fontSize={9} fill="white" pointerEvents="none">
                        ►
                      </text>
                    )}
                    {row.task.deadline && !overflowsRight && (
                      <rect
                        x={scale(range[1]) - 3}
                        y={rowY + ROW_HEIGHT / 2 - 3}
                        width={6}
                        height={6}
                        fill="#1f2937"
                        pointerEvents="none"
                        transform={`rotate(45 ${scale(range[1])} ${rowY + ROW_HEIGHT / 2})`}
                      />
                    )}

                    {/* Manijas de arrastre: mueven inicio/deadline como un slider. */}
                    {!overflowsLeft && (
                      <rect
                        x={x - 3}
                        y={barY}
                        width={6}
                        height={barHeight}
                        fill="transparent"
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={(e) => startDrag(e, row.task, 'start')}
                      />
                    )}
                    {!overflowsRight && (
                      <rect
                        x={x + width - 3}
                        y={barY}
                        width={6}
                        height={barHeight}
                        fill="transparent"
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={(e) => startDrag(e, row.task, 'end')}
                      />
                    )}
                    {isDraggingThis && drag.previewDateOnly && (
                      <text
                        x={drag.edge === 'start' ? x : x + width}
                        y={barY - 6}
                        fontSize={10}
                        fontWeight="600"
                        textAnchor="middle"
                        fill="#111827"
                        pointerEvents="none"
                      >
                        {formatDateOnly(drag.previewDateOnly)}
                      </text>
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
