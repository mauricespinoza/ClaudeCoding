import { Bell, BellOff } from 'lucide-react'
import { notificationsSupported, notifyDueTasks, requestNotificationPermission } from '../notifications.js'

export function NotificationsControl({ enabled, tasks, dispatch }) {
  const supported = notificationsSupported()

  const toggle = async () => {
    if (!supported) return
    if (enabled) {
      dispatch({ type: 'SET_NOTIFICATIONS_ENABLED', payload: false })
      return
    }
    const permission = await requestNotificationPermission()
    if (permission !== 'granted') return
    dispatch({ type: 'SET_NOTIFICATIONS_ENABLED', payload: true })
    notifyDueTasks(tasks)
  }

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Las notificaciones no están disponibles en este navegador"
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-300"
      >
        <BellOff size={13} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={
        enabled
          ? 'Notificaciones activas: avisan al abrir la app si hay tareas vencidas o con deadline hoy (no funcionan con la pestaña cerrada)'
          : 'Activar avisos de tareas vencidas o con deadline hoy al abrir la app'
      }
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
        enabled ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Bell size={13} />
      {enabled ? 'Notificaciones ON' : 'Notificaciones'}
    </button>
  )
}
