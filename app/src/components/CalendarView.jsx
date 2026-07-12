import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { todayDateOnly } from '../model.js'
import {
  addDays,
  addMonths,
  monthLabel,
  monthMatrix,
  weekDates,
  weekRangeLabel,
  WEEKDAY_LABELS,
} from '../calendarDates.js'
import { IcsExportButton } from './IcsExportButton.jsx'

const STATUS_DOT = { not_started: 'bg-gray-400', in_progress: 'bg-amber-500', done: 'bg-emerald-500' }

function buildItemsByDate(tasks, projects) {
  const map = new Map()
  const push = (dateOnly, item) => {
    if (!map.has(dateOnly)) map.set(dateOnly, [])
    map.get(dateOnly).push(item)
  }

  for (const task of tasks) {
    if (task.deadline) push(task.deadline, { type: 'task', entity: task })
  }
  for (const project of projects) {
    if (project.deadline && !project.archived) push(project.deadline, { type: 'project', entity: project })
  }
  return map
}

function ItemChip({ item }) {
  const label = item.entity.name || 'Sin nombre'
  if (item.type === 'project') {
    return (
      <span className="flex items-center gap-1 truncate rounded bg-violet-100 px-1 py-0.5 text-[11px] text-violet-800">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
        <span className="truncate">{label}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 truncate rounded bg-gray-100 px-1 py-0.5 text-[11px] text-gray-700">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.entity.status]}`} />
      <span className="truncate">{label}</span>
    </span>
  )
}

function DayDetailModal({ date, items, onClose, onOpenTask, onOpenProject }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-16 w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">{date}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto px-5 py-4">
          {items.length === 0 && <p className="text-sm text-gray-400">Sin deadlines este día.</p>}
          {items.map((item) => (
            <div key={`${item.type}-${item.entity.id}`} className="rounded-md border border-gray-200 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    item.type === 'task' ? onOpenTask(item.entity) : onOpenProject(item.entity)
                  }
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-800 hover:text-blue-700"
                >
                  {item.entity.name}
                </button>
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">
                  {item.type === 'task' ? 'Tarea' : 'Proyecto'}
                </span>
              </div>
              <IcsExportButton entity={item.entity} className="mt-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CalendarView({ tasks, projects, onOpenTask, onOpenProject }) {
  const [mode, setMode] = useState('month')
  const [cursor, setCursor] = useState(todayDateOnly())
  const [selectedDate, setSelectedDate] = useState(null)

  const itemsByDate = useMemo(() => buildItemsByDate(tasks, projects), [tasks, projects])
  const today = todayDateOnly()

  const goPrev = () => setCursor((c) => (mode === 'month' ? addMonths(c, -1) : addDays(c, -7)))
  const goNext = () => setCursor((c) => (mode === 'month' ? addMonths(c, 1) : addDays(c, 7)))
  const goToday = () => setCursor(today)

  const days = mode === 'month' ? monthMatrix(cursor).flat() : weekDates(cursor).map((date) => ({ date, inMonth: true }))
  const label = mode === 'month' ? monthLabel(cursor) : weekRangeLabel(cursor)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={goPrev} className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-100">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={goNext} className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-100">
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
          >
            Hoy
          </button>
          <span className="ml-1 text-sm font-semibold capitalize text-gray-800">{label}</span>
        </div>
        <div className="flex rounded-md border border-gray-300 p-0.5 text-xs">
          {['month', 'week'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-2.5 py-1 ${mode === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {m === 'month' ? 'Mensual' : 'Semanal'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 text-xs">
        {WEEKDAY_LABELS.map((wd) => (
          <div key={wd} className="bg-gray-50 px-2 py-1.5 text-center font-medium text-gray-500">
            {wd}
          </div>
        ))}
        {days.map(({ date, inMonth }) => {
          const items = itemsByDate.get(date) ?? []
          const isToday = date === today
          const dayNumber = Number(date.slice(8, 10))

          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={`flex min-h-[92px] flex-col items-stretch gap-1 bg-white p-1.5 text-left hover:bg-blue-50 ${
                inMonth ? '' : 'bg-gray-50 text-gray-400'
              }`}
            >
              <span
                className={`self-start rounded-full px-1.5 text-[11px] ${
                  isToday ? 'bg-blue-600 font-semibold text-white' : 'text-gray-600'
                }`}
              >
                {dayNumber}
              </span>
              <div className="space-y-0.5 overflow-hidden">
                {items.slice(0, mode === 'month' ? 2 : 6).map((item) => (
                  <ItemChip key={`${item.type}-${item.entity.id}`} item={item} />
                ))}
                {items.length > (mode === 'month' ? 2 : 6) && (
                  <span className="block text-[10px] text-gray-400">
                    +{items.length - (mode === 'month' ? 2 : 6)} más
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          items={itemsByDate.get(selectedDate) ?? []}
          onClose={() => setSelectedDate(null)}
          onOpenTask={(task) => {
            setSelectedDate(null)
            onOpenTask(task)
          }}
          onOpenProject={(project) => {
            setSelectedDate(null)
            onOpenProject(project)
          }}
        />
      )}
    </div>
  )
}
