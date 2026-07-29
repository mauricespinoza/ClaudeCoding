// Documento del editor con historial de deshacer/rehacer.
//
// Las manipulaciones continuas (arrastres) llaman a `snapshot()` una vez al empezar
// y luego a `update()` en cada movimiento, de modo que el gesto completo ocupa
// una sola entrada del historial.

import { useCallback, useRef, useState } from 'react'
import { DEFAULT_COMPASS } from '../../lib/vector'

const LIMIT = 80

export function emptyDoc(overrides = {}) {
  return {
    shapes: [],
    compass: { ...DEFAULT_COMPASS, ...(overrides.compass || {}) },
    ...('shapes' in overrides ? { shapes: overrides.shapes } : {}),
  }
}

export function useEditorDoc(initial) {
  const [state, setState] = useState(() => ({
    past: [],
    present: initial || emptyDoc(),
    future: [],
  }))
  const pendingRef = useRef(false)

  /** Guarda el estado actual en el historial (inicio de un gesto o de una acción). */
  const snapshot = useCallback(() => {
    setState((s) => ({
      past: [...s.past, s.present].slice(-LIMIT),
      present: s.present,
      future: [],
    }))
    pendingRef.current = true
  }, [])

  /** Modifica el documento sin tocar el historial. */
  const update = useCallback((updater) => {
    setState((s) => ({
      ...s,
      present: typeof updater === 'function' ? updater(s.present) : updater,
    }))
  }, [])

  /** Acción atómica: guarda historial y aplica el cambio. */
  const commit = useCallback(
    (updater) => {
      setState((s) => ({
        past: [...s.past, s.present].slice(-LIMIT),
        present: typeof updater === 'function' ? updater(s.present) : updater,
        future: [],
      }))
    },
    []
  )

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s
      const previous = s.past[s.past.length - 1]
      return {
        past: s.past.slice(0, -1),
        present: previous,
        future: [s.present, ...s.future].slice(0, LIMIT),
      }
    })
  }, [])

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s
      return {
        past: [...s.past, s.present].slice(-LIMIT),
        present: s.future[0],
        future: s.future.slice(1),
      }
    })
  }, [])

  const reset = useCallback((doc) => {
    setState({ past: [], present: doc, future: [] })
  }, [])

  return {
    doc: state.present,
    snapshot,
    update,
    commit,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

// --- Operaciones de alto nivel sobre el documento ----------------------------

export function replaceShape(doc, id, updater) {
  return {
    ...doc,
    shapes: doc.shapes.map((s) => (s.id === id ? (typeof updater === 'function' ? updater(s) : updater) : s)),
  }
}

export function replaceShapes(doc, ids, updater) {
  const set = new Set(ids)
  return {
    ...doc,
    shapes: doc.shapes.map((s) => (set.has(s.id) ? updater(s) : s)),
  }
}

export function addShape(doc, shape) {
  return { ...doc, shapes: [...doc.shapes, shape] }
}

export function removeShapes(doc, ids) {
  const set = new Set(ids)
  return { ...doc, shapes: doc.shapes.filter((s) => !set.has(s.id)) }
}

export function reorderShape(doc, id, direction) {
  const idx = doc.shapes.findIndex((s) => s.id === id)
  if (idx < 0) return doc
  const shapes = [...doc.shapes]
  const [item] = shapes.splice(idx, 1)
  let target = idx
  if (direction === 'up') target = Math.min(shapes.length, idx + 1)
  else if (direction === 'down') target = Math.max(0, idx - 1)
  else if (direction === 'top') target = shapes.length
  else if (direction === 'bottom') target = 0
  shapes.splice(target, 0, item)
  return { ...doc, shapes }
}
