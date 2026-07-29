import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, width = 'max-w-2xl', fullscreen }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-ink-500 bg-ink-800 shadow-2xl ${
          fullscreen ? 'h-full max-w-none' : width
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink-600 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} title="Cerrar (Esc)">
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}
