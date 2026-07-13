import { useMemo, useRef, useState } from 'react'
import groupBy from 'lodash/groupBy.js'
import { scaleTime, timeMonth, timeWeek } from 'd3'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, Plus } from 'lucide-react'
import { STATUS, formatDateOnly, projectColor } from '../model.js'
import { fromDateOnly, toDateOnly } from '../calendarDates.js'
import {
  ZOOM_LEVELS,
  clipToWindow,
  taskBarRange,
  ticksFor,
  unionRange,
  windowFor,
} from '../ganttLayout.js'

const ROW_HEIGHT = 30
const DETAIL_HEIGHT = 32
const HEADER_HEIGHT = 28
const GROUP_ROW_HEIGHT = 24
const PROJECT_ROW_HEIGHT = 26
const SUMMARY_BAR_HEIGHT = 10
const ALL_PROJECTS = '__all__'
const NO_ACTIVITY_KEY = '__none__'

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

function sortByOrder(list) {
  return [...list].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
}

// Actividades vacías (definidas pero sin tareas todavía) se conservan: el
// Gantt es ahora un lugar válido para armar la estructura del proyecto, no
// solo para visualizar tareas ya creadas. Las tareas de cada actividad se
// ordenan por `order`, el mismo campo que controla el orden en la matriz
// Eisenhower — reordenar acá (drag & drop) reescribe ese campo.
function buildActivityGroups(projectTasks, activityOrder) {
  const byActivity = groupBy(projectTasks, (t) => t.activity ?? '')
  const names = [...(activityOrder ?? [])]
  for (const name of Object.keys(byActivity)) {
    if (name && !names.includes(name)) names.push(name)
  }
  const groups = names.map((name) => ({ name, tasks: sortByOrder(byActivity[name] ?? []) }))
  if (byActivity['']?.length) groups.push({ name: null, tasks: sortByOrder(byActivity['']) })
  return groups
}

export function GanttView({ projects, tasks, tagColors, dispatchAndPersist, onOpenTask, onCreateTask }) {
  const projectsWithTasks = useMemo(() => projects.filter((p) => !p.archived), [projects])
  const [selectedProjectId, setSelectedProjectId] = useState(ALL_PROJECTS)
  const [zoom, setZoom] = useState(ZOOM_LEVELS.PROJECT)
  const [cursor, setCursor] = useState(new Date())
  const [expanded, setExpanded] = useState(() => new Set())
  const [collapsedProjects, setCollapsedProjects] = useState(() => new Set())
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  const [drag, setDrag] = useState(null) // { taskId, edge: 'start'|'end', previewDateOnly }
  const [draggedRow, setDraggedRow] = useState(null) // { type: 'group'|'task', ... } — reordenar filas
  const [addingActivityForProjectId, setAddingActivityForProjectId] = useState(null)
  const [activityDraftName, setActivityDraftName] = useState('')
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

  const toggleProjectCollapsed = (projectId) =>
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      next.has(projectId) ? next.delete(projectId) : next.add(projectId)
      return next
    })

  const toggleGroupCollapsed = (groupKey) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey)
      return next
    })

  // Rango de una tarea, sustituyendo el extremo que se está arrastrando por
  // la fecha de vista previa — así las barras resumen (proyecto/actividad
  // colapsados) también se actualizan en vivo mientras se arrastra.
  const taskRangeWithPreview = (task) => {
    let range = taskBarRange(task)
    if (drag && drag.taskId === task.id && drag.previewDateOnly) {
      range =
        drag.edge === 'start'
          ? [fromDateOnly(drag.previewDateOnly), range[1]]
          : [range[0], fromDateOnly(drag.previewDateOnly)]
    }
    return range
  }

  // Lista plana de filas: encabezado de proyecto -> encabezado de actividad
  // -> tareas. Proyecto/actividad siempre se muestran (incluso sin tareas)
  // para poder construir la estructura desde el propio Gantt; al colapsar
  // uno, sus filas hijas se ocultan y se dibuja una barra resumen con el
  // rango [inicio más antiguo, deadline más posterior] de sus tareas.
  const rows = useMemo(() => {
    if (!window_) return []
    const flat = []
    for (const project of relevantProjects) {
      const projectTasks = relevantTasks.filter((t) => t.projectId === project.id)
      const groups = buildActivityGroups(projectTasks, project.activityOrder)
      const projectCollapsed = collapsedProjects.has(project.id)

      flat.push({
        type: 'project',
        project,
        collapsed: projectCollapsed,
        summaryRange: projectCollapsed ? unionRange(projectTasks.map(taskRangeWithPreview)) : null,
      })
      if (projectCollapsed) continue

      for (const group of groups) {
        const groupKey = `${project.id}::${group.name ?? NO_ACTIVITY_KEY}`
        const groupCollapsed = collapsedGroups.has(groupKey)
        flat.push({
          type: 'group',
          label: group.name ?? 'Sin actividad',
          project,
          activityName: group.name,
          collapsed: groupCollapsed,
          summaryRange: groupCollapsed ? unionRange(group.tasks.map(taskRangeWithPreview)) : null,
        })
        if (groupCollapsed) continue

        for (const task of group.tasks) {
          flat.push({
            type: 'task',
            task,
            clip: clipToWindow(taskRangeWithPreview(task), window_),
            expanded: expanded.has(task.id),
          })
        }
      }
    }
    return flat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantProjects, relevantTasks, window_, drag, expanded, collapsedProjects, collapsedGroups])

  const startAddActivity = (projectId) => {
    setAddingActivityForProjectId(projectId)
    setActivityDraftName('')
  }

  const commitAddActivity = (projectId) => {
    const name = activityDraftName.trim()
    setAddingActivityForProjectId(null)
    setActivityDraftName('')
    if (name) dispatchAndPersist({ type: 'ADD_ACTIVITY', payload: { projectId, name } }, ['projects'])
  }

  // Reordenar actividades (arrastrar un encabezado de actividad sobre otro
  // del mismo proyecto) reescribe project.activityOrder.
  const handleGroupDrop = (targetRow) => {
    if (!draggedRow || draggedRow.type !== 'group') return setDraggedRow(null)
    const { projectId, name } = draggedRow
    if (
      projectId !== targetRow.project.id ||
      targetRow.activityName == null ||
      name === targetRow.activityName
    ) {
      return setDraggedRow(null)
    }
    const order = [...targetRow.project.activityOrder]
    const fromIdx = order.indexOf(name)
    const toIdx = order.indexOf(targetRow.activityName)
    setDraggedRow(null)
    if (fromIdx === -1 || toIdx === -1) return
    order.splice(fromIdx, 1)
    order.splice(toIdx, 0, name)
    dispatchAndPersist({ type: 'UPDATE_PROJECT', payload: { id: projectId, patch: { activityOrder: order } } }, [
      'projects',
    ])
  }

  // Reordenar tareas (arrastrar una tarea sobre otra de la misma actividad)
  // reasigna `order` según la posición visual resultante.
  const handleTaskDrop = (targetRow) => {
    if (!draggedRow || draggedRow.type !== 'task') return setDraggedRow(null)
    const targetActivityKey = targetRow.task.activity ?? null
    if (
      draggedRow.projectId !== targetRow.task.projectId ||
      draggedRow.activityKey !== targetActivityKey ||
      draggedRow.id === targetRow.task.id
    ) {
      return setDraggedRow(null)
    }
    const groupTaskIds = rows
      .filter(
        (r) =>
          r.type === 'task' &&
          r.task.projectId === targetRow.task.projectId &&
          (r.task.activity ?? null) === targetActivityKey,
      )
      .map((r) => r.task.id)
    const fromIdx = groupTaskIds.indexOf(draggedRow.id)
    const toIdx = groupTaskIds.indexOf(targetRow.task.id)
    setDraggedRow(null)
    if (fromIdx === -1 || toIdx === -1) return
    groupTaskIds.splice(fromIdx, 1)
    groupTaskIds.splice(toIdx, 0, draggedRow.id)
    dispatchAndPersist({ type: 'REORDER_TASKS', payload: { taskIds: groupTaskIds } }, ['tasks'])
  }

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
      dispatchAndPersist({ type: 'UPDATE_TASK', payload: { id: task.id, patch: { [field]: value } } }, ['tasks'])
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
          Selecciona un proyecto.
        </div>
      ) : (
        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          <div className="w-40 shrink-0 border-r border-gray-200 bg-gray-50 sm:w-52">
            <div style={{ height: HEADER_HEIGHT }} className="border-b border-gray-200" />
            {rows.map((row, i) => (
              <div
                key={i}
                style={{ height: rowHeight(row) }}
                draggable={row.type === 'group' ? row.activityName != null : row.type === 'task'}
                onDragStart={
                  row.type === 'group'
                    ? () => setDraggedRow({ type: 'group', projectId: row.project.id, name: row.activityName })
                    : row.type === 'task'
                      ? () =>
                          setDraggedRow({
                            type: 'task',
                            id: row.task.id,
                            projectId: row.task.projectId,
                            activityKey: row.task.activity ?? null,
                          })
                      : undefined
                }
                onDragOver={row.type === 'group' || row.type === 'task' ? (e) => e.preventDefault() : undefined}
                onDrop={
                  row.type === 'group'
                    ? () => handleGroupDrop(row)
                    : row.type === 'task'
                      ? () => handleTaskDrop(row)
                      : undefined
                }
                className={`flex items-start px-1.5 py-1 text-xs ${
                  row.type === 'group'
                    ? 'items-center font-semibold uppercase tracking-wide text-gray-500'
                    : row.type === 'project'
                      ? 'items-center font-bold text-gray-900'
                      : 'text-gray-700'
                }`}
              >
                {row.type === 'project' &&
                  (addingActivityForProjectId === row.project.id ? (
                    <input
                      autoFocus
                      value={activityDraftName}
                      onChange={(e) => setActivityDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitAddActivity(row.project.id)
                        if (e.key === 'Escape') setAddingActivityForProjectId(null)
                      }}
                      onBlur={() => commitAddActivity(row.project.id)}
                      placeholder="Nombre de actividad…"
                      className="w-full rounded border border-blue-300 px-1 py-0.5 text-xs focus:outline-none"
                    />
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleProjectCollapsed(row.project.id)}
                        className="shrink-0 text-gray-400 hover:text-gray-700"
                        title={row.collapsed ? 'Mostrar actividades' : 'Ocultar actividades'}
                      >
                        {row.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </button>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: projectColor(row.project, tagColors) }}
                        />
                        <span className="truncate">{row.project.name}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => startAddActivity(row.project.id)}
                        title="Nueva actividad"
                        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  ))}
                {row.type === 'group' && (
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-0.5">
                    <GripVertical size={11} className="shrink-0 cursor-grab text-gray-300" />
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapsed(`${row.project.id}::${row.activityName ?? NO_ACTIVITY_KEY}`)}
                      className="shrink-0 text-gray-400 hover:text-gray-700"
                      title={row.collapsed ? 'Mostrar tareas' : 'Ocultar tareas'}
                    >
                      {row.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <span className="min-w-0 flex-1 truncate normal-case">{row.label}</span>
                    <button
                      type="button"
                      onClick={() => onCreateTask(row.project, row.activityName)}
                      title="Nueva tarea"
                      className="shrink-0 rounded p-0.5 normal-case text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                )}
                {row.type === 'task' && (
                  <div className="flex min-w-0 flex-1 items-start gap-0.5">
                    <GripVertical size={11} className="mt-0.5 shrink-0 cursor-grab text-gray-300" />
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
                  const clip = row.summaryRange && clipToWindow(row.summaryRange, window_)
                  if (!clip) {
                    return <line key={i} x1={0} x2={plotWidth} y1={rowY + h} y2={rowY + h} stroke="#f3f4f6" />
                  }
                  const x = scale(clip.range[0])
                  const width = Math.max(scale(clip.range[1]) - x, 5)
                  const barY = rowY + (h - SUMMARY_BAR_HEIGHT) / 2
                  const summaryColor = row.type === 'project' ? projectColor(row.project, tagColors) : '#6b7280'
                  return (
                    <g key={i}>
                      <rect
                        x={x}
                        y={barY}
                        width={width}
                        height={SUMMARY_BAR_HEIGHT}
                        rx={3}
                        fill={summaryColor}
                        opacity={0.55}
                        pointerEvents="none"
                      />
                      {clip.overflowsLeft && (
                        <text x={x + 1} y={barY + SUMMARY_BAR_HEIGHT / 2 + 3} fontSize={8} fill="white" pointerEvents="none">
                          ◄
                        </text>
                      )}
                      {clip.overflowsRight && (
                        <text
                          x={x + width - 7}
                          y={barY + SUMMARY_BAR_HEIGHT / 2 + 3}
                          fontSize={8}
                          fill="white"
                          pointerEvents="none"
                        >
                          ►
                        </text>
                      )}
                      <line x1={0} x2={plotWidth} y1={rowY + h} y2={rowY + h} stroke="#f3f4f6" />
                    </g>
                  )
                }

                if (!row.clip) return <g key={i} />

                const { range, overflowsLeft, overflowsRight } = row.clip
                const x = scale(range[0])
                const width = Math.max(scale(range[1]) - x, 5)
                const barY = rowY + 4
                const barHeight = ROW_HEIGHT - 8
                const color = STATUS_COLOR[row.task.status]
                const isDraggingThis = drag && drag.taskId === row.task.id

                const clipId = `bar-clip-${i}`

                return (
                  <g key={i}>
                    {row.task.assignee && width > 28 && (
                      <clipPath id={clipId}>
                        <rect x={x} y={barY} width={width} height={barHeight} rx={4} />
                      </clipPath>
                    )}
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
                    {row.task.assignee && width > 28 && (
                      <text
                        x={x + 5}
                        y={barY + barHeight / 2 + 3}
                        fontSize={9}
                        fill="white"
                        clipPath={`url(#${clipId})`}
                        pointerEvents="none"
                      >
                        {row.task.assignee}
                      </text>
                    )}
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
