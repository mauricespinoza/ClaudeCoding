import { useCallback, useEffect, useRef, useState } from 'react'

// Wrapper sobre Web Speech API (ARQUITECTURA.md §3 "Voz").
// Sin soporte del navegador -> supported=false; el botón que lo consume
// debe deshabilitarse mostrando un tooltip, nunca ocultarse en silencio.
export function useSpeechRecognition({ lang = 'es-CL' } = {}) {
  const SpeechRecognitionCtor =
    typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const supported = !!SpeechRecognitionCtor

  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  const onFinalRef = useRef(null)

  useEffect(() => {
    if (!supported) return undefined
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (event) => {
      let finalText = ''
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += transcript
        else interim += transcript
      }
      if (finalText) {
        setInterimText('')
        onFinalRef.current?.(finalText.trim())
      } else {
        setInterimText(interim)
      }
    }

    recognition.onerror = (event) => {
      setError(event.error)
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
      setInterimText('')
    }

    recognitionRef.current = recognition
    return () => recognition.stop()
  }, [supported, lang])

  const start = useCallback((onFinal) => {
    if (!recognitionRef.current) return
    onFinalRef.current = onFinal
    setError(null)
    setListening(true)
    try {
      recognitionRef.current.start()
    } catch {
      // start() lanza si ya estaba escuchando; se ignora.
    }
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  return { supported, listening, interimText, error, start, stop }
}
