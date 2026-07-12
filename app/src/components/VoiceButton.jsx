import { Mic, MicOff, Square } from 'lucide-react'
import { useSpeechRecognition } from '../useSpeechRecognition.js'

// Botón de dictado reutilizable (matriz -> nombre de tarea nueva;
// modal -> nombre/descripción). Fallback visible si no hay soporte
// (ARQUITECTURA.md §3, §7).
export function VoiceButton({ onResult, title = 'Dictar por voz', className = '' }) {
  const { supported, listening, start, stop } = useSpeechRecognition()

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Dictado por voz no disponible en este navegador (prueba Chrome de escritorio)"
        className={`inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-300 p-1.5 cursor-not-allowed ${className}`}
      >
        <MicOff size={16} />
      </button>
    )
  }

  return (
    <button
      type="button"
      title={title}
      onClick={() => (listening ? stop() : start(onResult))}
      className={`inline-flex items-center justify-center rounded-md border p-1.5 transition-colors ${
        listening
          ? 'border-red-400 bg-red-50 text-red-600 animate-pulse'
          : 'border-gray-300 text-gray-600 hover:bg-gray-100'
      } ${className}`}
    >
      {listening ? <Square size={16} /> : <Mic size={16} />}
    </button>
  )
}
