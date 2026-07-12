// Fase 5 — cálculo puro de ventana temporal y rango de barra para el Gantt
// (ARQUITECTURA.md, sección "Gantt — cálculo de barras"). Separado del SVG
// para poder razonar sobre las fechas sin tocar React.

import { timeDay, timeMonth, timeWeek } from 'd3'
import { fromDateOnly } from './calendarDates.js'

export const ZOOM_LEVELS = {
  PROJECT: 'project',
  WEEK: 'week',
  MONTH: 'month',
  SEMESTER: 'semester',
}

// [start, end] de la barra de una tarea. Sin startDate se usa la fecha de
// creación; sin deadline la barra colapsa a un punto (solo el rombo se ve).
export function taskBarRange(task) {
  const start = fromDateOnly((task.startDate ?? task.createdAt).slice(0, 10))
  const end = task.deadline ? fromDateOnly(task.deadline) : start
  return end < start ? [end, start] : [start, end]
}

function unionRange(ranges) {
  if (ranges.length === 0) return null
  let min = ranges[0][0]
  let max = ranges[0][1]
  for (const [s, e] of ranges) {
    if (s < min) min = s
    if (e > max) max = e
  }
  return [min, max]
}

// Ventana "proyecto completo": envolvente de las fechas de sus tareas,
// con el startDate/deadline del proyecto como respaldo si no hay tareas.
export function projectWindow(project, tasks) {
  const ranges = tasks.filter((t) => t.projectId === project.id).map(taskBarRange)
  const union = unionRange(ranges)
  if (union) {
    // Un día de margen a cada lado para que las barras extremas no queden pegadas al borde.
    return [timeDay.offset(union[0], -1), timeDay.offset(union[1], 1)]
  }
  const start = project.startDate ? fromDateOnly(project.startDate) : fromDateOnly(project.createdAt.slice(0, 10))
  const end = project.deadline ? fromDateOnly(project.deadline) : timeDay.offset(start, 30)
  return [start, end]
}

export function weekWindow(cursor) {
  const start = timeWeek.floor(cursor)
  return [start, timeWeek.offset(start, 1)]
}

export function monthWindow(cursor) {
  const start = timeMonth.floor(cursor)
  return [start, timeMonth.offset(start, 1)]
}

export function semesterWindow(cursor) {
  const monthIndex = cursor.getMonth()
  const semesterStartMonth = monthIndex < 6 ? 0 : 6
  const start = new Date(cursor.getFullYear(), semesterStartMonth, 1)
  return [start, timeMonth.offset(start, 6)]
}

export function windowFor(zoom, cursor, project, tasks) {
  switch (zoom) {
    case ZOOM_LEVELS.WEEK:
      return weekWindow(cursor)
    case ZOOM_LEVELS.MONTH:
      return monthWindow(cursor)
    case ZOOM_LEVELS.SEMESTER:
      return semesterWindow(cursor)
    case ZOOM_LEVELS.PROJECT:
    default:
      return projectWindow(project, tasks)
  }
}

// Ticks del eje temporal, con el intervalo d3 apropiado por nivel de zoom.
export function ticksFor(zoom, [start, end]) {
  switch (zoom) {
    case ZOOM_LEVELS.WEEK:
      return timeDay.range(start, end)
    case ZOOM_LEVELS.MONTH:
      return timeWeek.range(timeWeek.floor(start), end)
    case ZOOM_LEVELS.SEMESTER:
      return timeMonth.range(timeMonth.floor(start), end)
    case ZOOM_LEVELS.PROJECT:
    default: {
      const spanDays = (end - start) / 86400000
      const interval = spanDays > 240 ? timeMonth : spanDays > 45 ? timeWeek : timeDay
      return interval.range(interval.floor(start), end)
    }
  }
}

// Intersección de la barra de una tarea con la ventana visible: null si no
// intersecta (la fila se omite en ese zoom).
export function clipToWindow([start, end], [winStart, winEnd]) {
  const clippedStart = start < winStart ? winStart : start
  const clippedEnd = end > winEnd ? winEnd : end
  if (clippedStart > clippedEnd) return null
  return {
    range: [clippedStart, clippedEnd],
    overflowsLeft: start < winStart,
    overflowsRight: end > winEnd,
  }
}
