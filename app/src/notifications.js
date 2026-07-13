// Notificaciones del navegador (Web Notification API). Limitación honesta:
// solo funcionan mientras la pestaña está abierta (o recién se abrió) y con
// permiso concedido — no hay push real en segundo plano sin un service
// worker + servidor, que está fuera del alcance de una app personal sin
// backend (ARQUITECTURA.md §7).

import { STATUS, todayDateOnly } from './model.js'

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

// Tareas no completadas cuyo deadline ya llegó o pasó, al momento en que se
// abre/recarga la app (o se activa la opción).
export function dueTasks(tasks) {
  const today = todayDateOnly()
  return tasks.filter((t) => t.status !== STATUS.DONE && t.deadline && t.deadline <= today)
}

export function notifyDueTasks(tasks) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const due = dueTasks(tasks)
  if (due.length === 0) return

  const preview = due.slice(0, 5).map((t) => `• ${t.name || 'Sin nombre'}`)
  if (due.length > 5) preview.push(`… y ${due.length - 5} más`)

  new Notification(`${due.length} tarea${due.length === 1 ? '' : 's'} con deadline vencido o de hoy`, {
    body: preview.join('\n'),
  })
}
