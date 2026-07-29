import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Circle,
  Compass,
  Download,
  Hand,
  Hexagon,
  Layers,
  Loader2,
  Minus,
  MousePointer2,
  Palette,
  PenTool,
  Pencil,
  Redo2,
  Save,
  Spline,
  Square,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import Canvas from './Canvas'
import StylePanel from './StylePanel'
import LayersPanel from './LayersPanel'
import CompassPanel from './CompassPanel'
import ExportPanel from './ExportPanel'
import {
  addShape,
  emptyDoc,
  removeShapes,
  reorderShape,
  replaceShapes,
  useEditorDoc,
} from './useEditorDoc'
import { buildSvgDocument, defaultStyle, shapeId, translateShape } from '../../lib/vector'
import { blobToDataUrl, canvasToBlob, decodeOriented } from '../../lib/images'

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', key: 'V' },
  { id: 'node', icon: Spline, label: 'Editar nodos y curvas', key: 'A' },
  { id: 'pen', icon: PenTool, label: 'Pluma (curvas Bézier)', key: 'P' },
  { id: 'pencil', icon: Pencil, label: 'Trazo libre', key: 'N' },
  { id: 'line', icon: Minus, label: 'Línea', key: 'L' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Flecha', key: 'F' },
  { id: 'polygon', icon: Hexagon, label: 'Polígono', key: 'G' },
  { id: 'rect', icon: Square, label: 'Rectángulo', key: 'R' },
  { id: 'ellipse', icon: Circle, label: 'Elipse', key: 'E' },
  { id: 'text', icon: Type, label: 'Texto', key: 'T' },
  { id: 'pan', icon: Hand, label: 'Desplazar (o barra espaciadora)', key: 'H' },
]

const TABS = [
  { id: 'style', label: 'Estilo', icon: Palette },
  { id: 'layers', label: 'Objetos', icon: Layers },
  { id: 'compass', label: 'Rumbo', icon: Compass },
  { id: 'export', label: 'Exportar', icon: Download },
]

export default function EditorModal({ photo, settings, onClose, getFull, onSaveAnnotations, onSaveAnnotatedRender }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [size, setSize] = useState({ width: photo.width || 1000, height: photo.height || 750 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tool, setTool] = useState('select')
  const [selection, setSelection] = useState([])
  const [activeNode, setActiveNode] = useState(null)
  const [tab, setTab] = useState('style')
  const [currentStyle, setCurrentStyle] = useState(() => photo.annotations?.lastStyle || defaultStyle())
  const [saving, setSaving] = useState(false)
  const dataUrlRef = useRef(null)
  const decodedRef = useRef(null)

  const { doc, snapshot, update, commit, undo, redo, canUndo, canRedo } = useEditorDoc(
    photo.annotations?.shapes
      ? {
          shapes: photo.annotations.shapes,
          compass: { ...emptyDoc().compass, ...photo.annotations.compass },
        }
      : emptyDoc({
          compass: {
            bearing: Number.isFinite(photo.bearing) ? photo.bearing : 0,
            fov: Number.isFinite(photo.fov) ? photo.fov : settings.defaultFov,
            points: settings.compassPoints,
          },
        })
  )

  // Carga de la imagen a resolución nativa.
  useEffect(() => {
    let alive = true
    let url = null
    ;(async () => {
      try {
        const blob = await getFull(photo.id)
        if (!blob) throw new Error('No se encontró el archivo original en el almacenamiento local.')
        const decoded = await decodeOriented(blob)
        if (!alive) return
        setSize({ width: decoded.width, height: decoded.height })
        // Se normaliza mediante canvas para que la orientación EXIF quede aplicada.
        const canvas = document.createElement('canvas')
        canvas.width = decoded.width
        canvas.height = decoded.height
        canvas.getContext('2d').drawImage(decoded.source, 0, 0)
        decoded.close?.()
        const normalized = await canvasToBlob(canvas, 'image/jpeg', 0.95)
        decodedRef.current = normalized
        url = URL.createObjectURL(normalized)
        setImageUrl(url)
      } catch (err) {
        if (alive) setError(err.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [photo.id, getFull])

  const selectedShapes = useMemo(
    () => doc.shapes.filter((s) => selection.includes(s.id)),
    [doc.shapes, selection]
  )

  // --- Acciones ---------------------------------------------------------------

  const patchStyle = useCallback(
    (patch) => {
      setCurrentStyle((s) => ({ ...s, ...patch }))
      if (selection.length) {
        commit((d) => replaceShapes(d, selection, (s) => ({ ...s, style: { ...s.style, ...patch } })))
      }
    },
    [commit, selection]
  )

  const patchShape = useCallback(
    (patch) => {
      if (!selection.length) return
      commit((d) => replaceShapes(d, selection, (s) => ({ ...s, ...patch })))
    },
    [commit, selection]
  )

  const deleteSelection = useCallback(() => {
    if (!selection.length) return
    commit((d) => removeShapes(d, selection))
    setSelection([])
  }, [commit, selection])

  const duplicateSelection = useCallback(() => {
    if (!selection.length) return
    const clones = selectedShapes.map((s) => ({
      ...translateShape(s, 24, 24),
      id: shapeId(s.type),
      name: `${s.name || s.type} copia`,
    }))
    commit((d) => clones.reduce((acc, c) => addShape(acc, c), d))
    setSelection(clones.map((c) => c.id))
  }, [commit, selectedShapes, selection])

  const orderSelection = useCallback(
    (direction) => {
      if (!selection.length) return
      commit((d) => selection.reduce((acc, id) => reorderShape(acc, id, direction), d))
    },
    [commit, selection]
  )

  const setCompass = useCallback(
    (patch) => commit((d) => ({ ...d, compass: { ...d.compass, ...patch } })),
    [commit]
  )

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelection()
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelection(doc.shapes.filter((s) => !s.locked).map((s) => s.id))
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.length) {
          e.preventDefault()
          deleteSelection()
        }
        return
      }
      if (e.key === 'Escape') {
        setSelection([])
        return
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selection.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        commit((d) => replaceShapes(d, selection, (s) => translateShape(s, dx, dy)))
        return
      }
      if (!mod && !e.altKey) {
        const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase())
        if (t) {
          e.preventDefault()
          setTool(t.id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, duplicateSelection, deleteSelection, selection, doc.shapes, commit])

  // --- Construcción del SVG ----------------------------------------------------

  const getDataUrl = useCallback(async () => {
    if (dataUrlRef.current) return dataUrlRef.current
    if (!decodedRef.current) return null
    dataUrlRef.current = await blobToDataUrl(decodedRef.current)
    return dataUrlRef.current
  }, [])

  const buildSvg = useCallback(
    async ({ includeImage = true, background = null } = {}) => {
      const href = includeImage ? await getDataUrl() : null
      return buildSvgDocument({
        width: size.width,
        height: size.height,
        imageHref: href,
        shapes: doc.shapes,
        compass: doc.compass,
        includeImage,
        background,
      })
    },
    [doc.shapes, doc.compass, getDataUrl, size]
  )

  const persist = useCallback(async () => {
    setSaving(true)
    try {
      await onSaveAnnotations(photo.id, {
        shapes: doc.shapes,
        compass: doc.compass,
        lastStyle: currentStyle,
        updatedAt: new Date().toISOString(),
      })
    } finally {
      setSaving(false)
    }
  }, [doc, currentStyle, onSaveAnnotations, photo.id])

  const closeAndSave = useCallback(async () => {
    await persist()
    onClose()
  }, [persist, onClose])

  const baseName = (photo.title || photo.name || 'foto').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_')

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-ink-900">
      {/* Barra superior */}
      <header className="flex items-center gap-2 border-b border-ink-600 bg-ink-800 px-3 py-2">
        <h2 className="truncate text-sm font-semibold text-slate-100">
          {photo.title || photo.name}
        </h2>
        <span className="chip">{size.width}×{size.height} px</span>
        <span className="chip">{doc.shapes.length} objetos</span>

        <div className="ml-4 flex gap-1">
          <button type="button" className="btn" disabled={!canUndo} onClick={undo} title="Deshacer (Ctrl+Z)">
            <Undo2 size={13} />
          </button>
          <button type="button" className="btn" disabled={!canRedo} onClick={redo} title="Rehacer (Ctrl+Shift+Z)">
            <Redo2 size={13} />
          </button>
        </div>

        <div className="ml-auto flex gap-2">
          <button type="button" className="btn" onClick={persist} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar
          </button>
          <button type="button" className="btn btn-primary" onClick={closeAndSave}>
            <X size={13} /> Guardar y cerrar
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Herramientas */}
        <nav className="flex w-12 flex-col items-center gap-1 border-r border-ink-600 bg-ink-800 py-2">
          {TOOLS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                title={`${t.label} (${t.key})`}
                onClick={() => setTool(t.id)}
                className={`flex h-9 w-9 items-center justify-center rounded-md transition ${
                  tool === t.id ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-ink-600'
                }`}
              >
                <Icon size={16} />
              </button>
            )
          })}
        </nav>

        {/* Lienzo */}
        <main className="relative min-w-0 flex-1">
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Cargando la imagen…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-rose-300">
              {error}
            </div>
          )}
          {!loading && !error && (
            <Canvas
              imageUrl={imageUrl}
              width={size.width}
              height={size.height}
              doc={doc}
              snapshot={snapshot}
              update={update}
              commit={commit}
              tool={tool}
              setTool={setTool}
              selection={selection}
              setSelection={setSelection}
              activeNode={activeNode}
              setActiveNode={setActiveNode}
              currentStyle={currentStyle}
            />
          )}
          <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-ink-800/90 px-2 py-1 text-[10px] text-slate-400 backdrop-blur">
            {tool === 'pen' && 'Clic = nodo · clic y arrastra = curva · clic en el primer nodo o Enter = cerrar'}
            {tool === 'node' && 'Arrastra nodos y manejadores · Alt+clic = esquina/curva · doble clic = añadir nodo'}
            {tool === 'polygon' && 'Clic por vértice · clic en el primer nodo o Enter para cerrar'}
            {tool === 'select' && 'Arrastra para mover · Shift+clic = multiselección · doble clic = editar nodos'}
            {['rect', 'ellipse', 'line', 'arrow'].includes(tool) && 'Arrastra para dibujar · Shift = proporción/45°'}
            {tool === 'pencil' && 'Arrastra para dibujar a mano alzada (se vectoriza al soltar)'}
          </div>
        </main>

        {/* Inspector */}
        <aside className="flex w-72 flex-col border-l border-ink-600 bg-ink-800">
          <div className="flex border-b border-ink-600">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1 px-1 py-2 text-[11px] transition ${
                    tab === t.id ? 'border-b-2 border-sky-500 text-sky-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon size={12} /> {t.label}
                </button>
              )
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {tab === 'style' && (
              <StylePanel
                style={selectedShapes.length === 1 ? selectedShapes[0].style : currentStyle}
                onStyle={patchStyle}
                selectedShapes={selectedShapes}
                onShapePatch={patchShape}
                onDelete={deleteSelection}
                onDuplicate={duplicateSelection}
                onOrder={orderSelection}
              />
            )}
            {tab === 'layers' && (
              <LayersPanel
                shapes={doc.shapes}
                selection={selection}
                onSelect={setSelection}
                onPatch={(id, patch) => commit((d) => replaceShapes(d, [id], (s) => ({ ...s, ...patch })))}
                onDelete={(ids) => {
                  commit((d) => removeShapes(d, ids))
                  setSelection((sel) => sel.filter((x) => !ids.includes(x)))
                }}
                onOrder={(id, dir) => commit((d) => reorderShape(d, id, dir))}
              />
            )}
            {tab === 'compass' && (
              <CompassPanel
                compass={doc.compass}
                onChange={setCompass}
                photo={photo}
                defaultFov={settings.defaultFov}
              />
            )}
            {tab === 'export' && (
              <ExportPanel
                width={size.width}
                height={size.height}
                baseName={baseName}
                buildSvg={buildSvg}
                onSaveAnnotated={async (blob) => {
                  await persist()
                  await onSaveAnnotatedRender(photo.id, blob)
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
