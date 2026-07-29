import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import {
  compassToSvg,
  makeEllipse,
  makeNode,
  makePath,
  makeRect,
  makeText,
  nearestOnPath,
  pathD,
  polylineToNodes,
  scaleShape,
  shapeBBox,
  simplify,
  splitSegment,
  translateShape,
  unionBBox,
} from '../../lib/vector'
import { addShape, replaceShape } from './useEditorDoc'

const HANDLE_KEYS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export default function Canvas({
  imageUrl,
  width,
  height,
  doc,
  snapshot,
  update,
  commit,
  tool,
  setTool,
  selection,
  setSelection,
  activeNode,
  setActiveNode,
  currentStyle,
  showImage = true,
  checkerboard = true,
}) {
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const dragRef = useRef(null)
  const [view, setView] = useState({ x: 0, y: 0, w: width, h: height })
  const [draft, setDraft] = useState(null) // trazo en construcción (pluma / polígono)
  const [preview, setPreview] = useState(null) // forma en creación por arrastre
  const [spaceDown, setSpaceDown] = useState(false)
  const [pointer, setPointer] = useState(null)

  const fit = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const scale = Math.min(rect.width / width, rect.height / height) || 1
    const w = rect.width / scale
    const h = rect.height / scale
    setView({ x: (width - w) / 2, y: (height - h) / 2, w, h })
  }, [width, height])

  useEffect(() => {
    fit()
  }, [fit])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        setSpaceDown(e.type === 'keydown')
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  /** Escala: unidades de imagen por píxel de pantalla. */
  const k = useMemo(() => {
    const rect = wrapRef.current?.getBoundingClientRect()
    return rect?.width ? view.w / rect.width : 1
  }, [view])

  const toImage = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    return pt.matrixTransform(ctm.inverse())
  }, [])

  const selectedShapes = useMemo(
    () => doc.shapes.filter((s) => selection.includes(s.id)),
    [doc.shapes, selection]
  )
  const selectionBox = useMemo(
    () => unionBBox(selectedShapes.map(shapeBBox)),
    [selectedShapes]
  )
  const nodeShape =
    tool === 'node' && selection.length === 1
      ? doc.shapes.find((s) => s.id === selection[0] && s.type === 'path')
      : null

  // --- Zoom / pan -------------------------------------------------------------

  const zoomAt = useCallback(
    (factor, center) => {
      setView((v) => {
        const w = Math.min(width * 8, Math.max(width / 200, v.w * factor))
        const h = (w / v.w) * v.h
        const cx = center?.x ?? v.x + v.w / 2
        const cy = center?.y ?? v.y + v.h / 2
        return {
          w,
          h,
          x: cx - ((cx - v.x) * w) / v.w,
          y: cy - ((cy - v.y) * h) / v.h,
        }
      })
    },
    [width]
  )

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    e.preventDefault()
    zoomAt(e.deltaY > 0 ? 1.12 : 1 / 1.12, toImage(e))
  }

  // --- Creación de formas -----------------------------------------------------

  const finishDraft = useCallback(
    (closed) => {
      setDraft((d) => {
        if (!d || d.nodes.length < 2) return null
        const shape = makePath(d.nodes, { closed, style: { ...currentStyle } })
        commit((doc0) => addShape(doc0, shape))
        setSelection([shape.id])
        return null
      })
    },
    [commit, currentStyle, setSelection]
  )

  const cancelDraft = useCallback(() => setDraft(null), [])

  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName)
      if (typing) return
      if (e.key === 'Enter' && draft) {
        e.preventDefault()
        finishDraft(false)
      }
      if (e.key === 'Escape' && draft) {
        e.preventDefault()
        cancelDraft()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft, finishDraft, cancelDraft])

  // Al cambiar de herramienta se cierra cualquier trazo pendiente.
  useEffect(() => {
    if (!['pen', 'polygon'].includes(tool)) setDraft(null)
  }, [tool])

  // --- Interacción ------------------------------------------------------------

  const startPan = (e) => {
    dragRef.current = { mode: 'pan', start: { x: e.clientX, y: e.clientY }, view: { ...view } }
  }

  const onPointerDown = (e) => {
    if (e.button === 1 || spaceDown || tool === 'pan') {
      e.preventDefault()
      startPan(e)
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    const p = toImage(e)
    const target = e.target
    const shapeId = target.getAttribute?.('data-shape-id')
    const handle = target.getAttribute?.('data-handle')
    const nodeIdx = target.getAttribute?.('data-node')
    const handleKind = target.getAttribute?.('data-handle-kind')
    e.currentTarget.setPointerCapture(e.pointerId)

    // Edición de nodos y manejadores Bézier.
    if (nodeShape && nodeIdx !== null && nodeIdx !== undefined) {
      const index = Number(nodeIdx)
      if (e.altKey) {
        commit((d) =>
          replaceShape(d, nodeShape.id, (s) => {
            const nodes = s.nodes.map((n, i) =>
              i === index
                ? n.hIn || n.hOut
                  ? { ...n, hIn: null, hOut: null, smooth: false }
                  : {
                      ...n,
                      smooth: true,
                      hIn: { x: n.x - 40, y: n.y },
                      hOut: { x: n.x + 40, y: n.y },
                    }
                : n
            )
            return { ...s, nodes }
          })
        )
        return
      }
      setActiveNode({ shapeId: nodeShape.id, index })
      snapshot()
      dragRef.current = { mode: 'node', shapeId: nodeShape.id, index, start: p }
      return
    }
    if (nodeShape && handleKind) {
      const [kind, idxStr] = handleKind.split(':')
      setActiveNode({ shapeId: nodeShape.id, index: Number(idxStr) })
      snapshot()
      dragRef.current = { mode: 'bezier', shapeId: nodeShape.id, index: Number(idxStr), kind }
      return
    }

    // Manejadores de escala del cuadro de selección.
    if (handle && selectionBox) {
      snapshot()
      dragRef.current = {
        mode: 'scale',
        handle,
        box: selectionBox,
        shapes: selectedShapes.map((s) => ({ ...s })),
        start: p,
      }
      return
    }

    switch (tool) {
      case 'select':
      case 'node': {
        if (shapeId) {
          const next = e.shiftKey
            ? selection.includes(shapeId)
              ? selection.filter((id) => id !== shapeId)
              : [...selection, shapeId]
            : selection.includes(shapeId)
              ? selection
              : [shapeId]
          setSelection(next)
          if (tool === 'select') {
            snapshot()
            dragRef.current = { mode: 'move', start: p, ids: next, moved: false }
          }
        } else {
          if (!e.shiftKey) setSelection([])
          dragRef.current = { mode: 'marquee', start: p, current: p }
        }
        break
      }
      case 'pen':
      case 'polygon': {
        const nodes = draft?.nodes || []
        if (nodes.length > 1) {
          const first = nodes[0]
          if (Math.hypot(first.x - p.x, first.y - p.y) < 10 * k) {
            finishDraft(true)
            return
          }
        }
        const node = makeNode(p.x, p.y)
        const next = { nodes: [...nodes, node] }
        setDraft(next)
        if (tool === 'pen') {
          dragRef.current = { mode: 'pen-drag', index: next.nodes.length - 1 }
        }
        break
      }
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'arrow':
        dragRef.current = { mode: 'create', start: p }
        setPreview({ tool, start: p, end: p })
        break
      case 'pencil':
        dragRef.current = { mode: 'pencil', points: [p] }
        setPreview({ tool: 'pencil', points: [p] })
        break
      case 'text': {
        const shape = makeText(
          p.x,
          p.y,
          'Texto',
          { ...currentStyle, stroke: 'none', fill: currentStyle.stroke },
          Math.max(14, Math.round(width * 0.035))
        )
        commit((d) => addShape(d, shape))
        setSelection([shape.id])
        setTool('select')
        break
      }
      default:
        break
    }
  }

  const onPointerMove = (e) => {
    const p = toImage(e)
    setPointer(p)
    const drag = dragRef.current
    if (!drag) return

    switch (drag.mode) {
      case 'pan': {
        const rect = wrapRef.current.getBoundingClientRect()
        const dx = ((e.clientX - drag.start.x) * drag.view.w) / rect.width
        const dy = ((e.clientY - drag.start.y) * drag.view.h) / rect.height
        setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy })
        break
      }
      case 'move': {
        const dx = p.x - drag.start.x
        const dy = p.y - drag.start.y
        drag.start = p
        drag.moved = true
        update((d) => ({
          ...d,
          shapes: d.shapes.map((s) =>
            drag.ids.includes(s.id) && !s.locked ? translateShape(s, dx, dy) : s
          ),
        }))
        break
      }
      case 'scale': {
        const { box, handle } = drag
        const anchor = {
          x: handle.includes('w') ? box.x + box.w : box.x,
          y: handle.includes('n') ? box.y + box.h : box.y,
        }
        let sx = handle.includes('e') || handle.includes('w')
          ? (p.x - anchor.x) / ((handle.includes('w') ? box.x : box.x + box.w) - anchor.x || 1)
          : 1
        let sy = handle.includes('n') || handle.includes('s')
          ? (p.y - anchor.y) / ((handle.includes('n') ? box.y : box.y + box.h) - anchor.y || 1)
          : 1
        if (e.shiftKey) {
          const s = Math.max(Math.abs(sx), Math.abs(sy))
          sx = sx === 1 ? 1 : Math.sign(sx) * s
          sy = sy === 1 ? 1 : Math.sign(sy) * s
        }
        sx = Number.isFinite(sx) && Math.abs(sx) > 0.01 ? sx : 0.01
        sy = Number.isFinite(sy) && Math.abs(sy) > 0.01 ? sy : 0.01
        const byId = new Map(drag.shapes.map((s) => [s.id, s]))
        update((d) => ({
          ...d,
          shapes: d.shapes.map((s) =>
            byId.has(s.id) ? scaleShape(byId.get(s.id), anchor, sx, sy) : s
          ),
        }))
        break
      }
      case 'node': {
        update((d) =>
          replaceShape(d, drag.shapeId, (s) => {
            const nodes = s.nodes.map((n, i) => {
              if (i !== drag.index) return n
              const dx = p.x - n.x
              const dy = p.y - n.y
              return {
                ...n,
                x: p.x,
                y: p.y,
                hIn: n.hIn ? { x: n.hIn.x + dx, y: n.hIn.y + dy } : null,
                hOut: n.hOut ? { x: n.hOut.x + dx, y: n.hOut.y + dy } : null,
              }
            })
            return { ...s, nodes }
          })
        )
        break
      }
      case 'bezier': {
        update((d) =>
          replaceShape(d, drag.shapeId, (s) => {
            const nodes = s.nodes.map((n, i) => {
              if (i !== drag.index) return n
              const mirror = { x: 2 * n.x - p.x, y: 2 * n.y - p.y }
              if (drag.kind === 'out') {
                return { ...n, hOut: p, hIn: n.smooth && n.hIn ? mirror : n.hIn }
              }
              return { ...n, hIn: p, hOut: n.smooth && n.hOut ? mirror : n.hOut }
            })
            return { ...s, nodes }
          })
        )
        break
      }
      case 'pen-drag': {
        setDraft((d) => {
          if (!d) return d
          const nodes = d.nodes.map((n, i) =>
            i === drag.index
              ? { ...n, smooth: true, hOut: { x: p.x, y: p.y }, hIn: { x: 2 * n.x - p.x, y: 2 * n.y - p.y } }
              : n
          )
          return { ...d, nodes }
        })
        break
      }
      case 'create':
        setPreview((pv) => (pv ? { ...pv, end: p, shift: e.shiftKey } : pv))
        break
      case 'pencil':
        drag.points.push(p)
        setPreview({ tool: 'pencil', points: [...drag.points] })
        break
      case 'marquee':
        drag.current = p
        setPreview({ tool: 'marquee', start: drag.start, end: p })
        break
      default:
        break
    }
  }

  const onPointerUp = (e) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    const p = toImage(e)

    if (drag.mode === 'create') {
      const { start } = drag
      let end = p
      if (e.shiftKey && (drag.mode === 'create')) {
        const dx = end.x - start.x
        const dy = end.y - start.y
        if (['line', 'arrow'].includes(tool)) {
          // Ángulos múltiplos de 45°.
          const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
          const len = Math.hypot(dx, dy)
          end = { x: start.x + Math.cos(ang) * len, y: start.y + Math.sin(ang) * len }
        } else {
          const s = Math.max(Math.abs(dx), Math.abs(dy))
          end = { x: start.x + Math.sign(dx) * s, y: start.y + Math.sign(dy) * s }
        }
      }
      const w = Math.abs(end.x - start.x)
      const h = Math.abs(end.y - start.y)
      let shape = null
      if (tool === 'rect' && w > 2 && h > 2) {
        shape = makeRect(Math.min(start.x, end.x), Math.min(start.y, end.y), w, h, {
          ...currentStyle,
          fill: currentStyle.fill,
        })
      } else if (tool === 'ellipse' && w > 2 && h > 2) {
        shape = makeEllipse((start.x + end.x) / 2, (start.y + end.y) / 2, w / 2, h / 2, {
          ...currentStyle,
        })
      } else if ((tool === 'line' || tool === 'arrow') && Math.hypot(w, h) > 2) {
        shape = makePath([makeNode(start.x, start.y), makeNode(end.x, end.y)], {
          style: {
            ...currentStyle,
            fill: 'none',
            markerEnd: tool === 'arrow' ? true : currentStyle.markerEnd,
          },
        })
        shape.name = tool === 'arrow' ? 'Flecha' : 'Línea'
      }
      if (shape) {
        commit((d) => addShape(d, shape))
        setSelection([shape.id])
      }
      setPreview(null)
      return
    }

    if (drag.mode === 'pencil') {
      const pts = simplify(drag.points, 1.5 * k)
      if (pts.length >= 2) {
        const shape = makePath(polylineToNodes(pts), { style: { ...currentStyle, fill: 'none' } })
        shape.name = 'Trazo libre'
        commit((d) => addShape(d, shape))
        setSelection([shape.id])
      }
      setPreview(null)
      return
    }

    if (drag.mode === 'marquee') {
      const box = {
        x: Math.min(drag.start.x, drag.current.x),
        y: Math.min(drag.start.y, drag.current.y),
        w: Math.abs(drag.current.x - drag.start.x),
        h: Math.abs(drag.current.y - drag.start.y),
      }
      if (box.w > 3 && box.h > 3) {
        const hit = doc.shapes
          .filter((s) => s.visible !== false)
          .filter((s) => {
            const b = shapeBBox(s)
            return b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y
          })
          .map((s) => s.id)
        setSelection(hit)
      }
      setPreview(null)
    }
  }

  const onDoubleClick = (e) => {
    const shapeId = e.target.getAttribute?.('data-shape-id')
    if (!shapeId) return
    const shape = doc.shapes.find((s) => s.id === shapeId)
    if (!shape) return
    if (shape.type === 'path' && tool === 'node') {
      const near = nearestOnPath(shape, toImage(e))
      if (near && near.dist < 12 * k) {
        commit((d) => replaceShape(d, shape.id, (s) => splitSegment(s, near.segIndex, near.t)))
      }
      return
    }
    setSelection([shapeId])
    if (shape.type === 'path') setTool('node')
  }

  // --- Render -----------------------------------------------------------------

  const cursor =
    spaceDown || tool === 'pan'
      ? 'grab'
      : ['pen', 'polygon', 'line', 'arrow', 'rect', 'ellipse', 'pencil'].includes(tool)
        ? 'crosshair'
        : tool === 'text'
          ? 'text'
          : 'default'

  const handleSize = 7 * k
  const compassMarkup = compassToSvg(doc.compass, width, height)

  const draftD = draft
    ? pathD({ nodes: draft.nodes, closed: false, type: 'path' })
    : null

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-ink-900">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        style={{ cursor }}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="checker" width="24" height="24" patternUnits="userSpaceOnUse">
            <rect width="24" height="24" fill="#1b2540" />
            <rect width="12" height="12" fill="#26324f" />
            <rect x="12" y="12" width="12" height="12" fill="#26324f" />
          </pattern>
          {doc.shapes
            .filter((s) => s.type === 'path' && (s.style.markerStart || s.style.markerEnd))
            .map((s) => (
              <g key={`mk-${s.id}`}>
                {s.style.markerEnd && (
                  <marker
                    id={`me-${s.id}`}
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={s.style.stroke} fillOpacity={s.style.strokeOpacity} />
                  </marker>
                )}
                {s.style.markerStart && (
                  <marker
                    id={`ms-${s.id}`}
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={s.style.stroke} fillOpacity={s.style.strokeOpacity} />
                  </marker>
                )}
              </g>
            ))}
        </defs>

        {checkerboard && <rect x={-width} y={-height} width={width * 3} height={height * 3} fill="url(#checker)" />}
        {showImage && imageUrl && (
          <image href={imageUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
        )}
        <rect x={0} y={0} width={width} height={height} fill="none" stroke="#38466a" strokeWidth={k} />

        {/* Formas */}
        {doc.shapes.map((s) => (
          <ShapeNode key={s.id} shape={s} selected={selection.includes(s.id)} k={k} />
        ))}

        {/* Rótulos cardinales */}
        {/* eslint-disable-next-line react/no-danger */}
        <g dangerouslySetInnerHTML={{ __html: compassMarkup }} />

        {/* Vista previa de creación */}
        {preview && <PreviewNode preview={preview} style={currentStyle} k={k} tool={tool} />}

        {/* Trazo en construcción */}
        {draft && (
          <g pointerEvents="none">
            <path
              d={
                pointer
                  ? `${draftD} L ${pointer.x} ${pointer.y}`
                  : draftD
              }
              fill="none"
              stroke={currentStyle.stroke}
              strokeWidth={currentStyle.strokeWidth}
              strokeOpacity={0.75}
              strokeDasharray={`${4 * k} ${4 * k}`}
            />
            {draft.nodes.map((n, i) => (
              <circle
                key={i}
                cx={n.x}
                cy={n.y}
                r={handleSize * 0.7}
                fill={i === 0 ? '#22c55e' : '#38bdf8'}
                stroke="#0b1020"
                strokeWidth={k}
              />
            ))}
          </g>
        )}

        {/* Cuadro de selección */}
        {tool === 'select' && selectionBox && (
          <g>
            <rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.w}
              height={selectionBox.h}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={k}
              strokeDasharray={`${5 * k} ${3 * k}`}
              pointerEvents="none"
            />
            {HANDLE_KEYS.map((h) => {
              const cx =
                h.includes('w') ? selectionBox.x : h.includes('e') ? selectionBox.x + selectionBox.w : selectionBox.x + selectionBox.w / 2
              const cy =
                h.includes('n') ? selectionBox.y : h.includes('s') ? selectionBox.y + selectionBox.h : selectionBox.y + selectionBox.h / 2
              return (
                <rect
                  key={h}
                  data-handle={h}
                  x={cx - handleSize / 2}
                  y={cy - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill="#38bdf8"
                  stroke="#0b1020"
                  strokeWidth={k}
                  style={{ cursor: `${h}-resize` }}
                />
              )
            })}
          </g>
        )}

        {/* Nodos y manejadores Bézier */}
        {nodeShape && (
          <g>
            {nodeShape.nodes.map((n, i) => (
              <g key={i}>
                {n.hIn && (
                  <>
                    <line x1={n.x} y1={n.y} x2={n.hIn.x} y2={n.hIn.y} stroke="#f59e0b" strokeWidth={k} />
                    <circle
                      data-handle-kind={`in:${i}`}
                      cx={n.hIn.x}
                      cy={n.hIn.y}
                      r={handleSize * 0.55}
                      fill="#f59e0b"
                      stroke="#0b1020"
                      strokeWidth={k}
                      style={{ cursor: 'move' }}
                    />
                  </>
                )}
                {n.hOut && (
                  <>
                    <line x1={n.x} y1={n.y} x2={n.hOut.x} y2={n.hOut.y} stroke="#f59e0b" strokeWidth={k} />
                    <circle
                      data-handle-kind={`out:${i}`}
                      cx={n.hOut.x}
                      cy={n.hOut.y}
                      r={handleSize * 0.55}
                      fill="#f59e0b"
                      stroke="#0b1020"
                      strokeWidth={k}
                      style={{ cursor: 'move' }}
                    />
                  </>
                )}
                <rect
                  data-node={i}
                  x={n.x - handleSize * 0.55}
                  y={n.y - handleSize * 0.55}
                  width={handleSize * 1.1}
                  height={handleSize * 1.1}
                  fill={
                    activeNode?.shapeId === nodeShape.id && activeNode.index === i ? '#22c55e' : '#ffffff'
                  }
                  stroke="#0b1020"
                  strokeWidth={k}
                  style={{ cursor: 'move' }}
                />
              </g>
            ))}
          </g>
        )}
      </svg>

      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md border border-ink-500 bg-ink-800/95 px-1 py-1 text-xs backdrop-blur">
        <button type="button" className="btn btn-ghost" onClick={() => zoomAt(1.25)} title="Alejar">
          <Minus size={12} />
        </button>
        <span className="w-12 text-center tabular-nums text-slate-400">
          {Math.round((width / view.w) * 100)}%
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => zoomAt(1 / 1.25)} title="Acercar">
          <Plus size={12} />
        </button>
        <button type="button" className="btn btn-ghost" onClick={fit} title="Ajustar a la ventana">
          <Maximize2 size={12} />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-ink-800/90 px-2 py-1 text-[10px] text-slate-400 backdrop-blur">
        {pointer ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)} px` : `${width}×${height} px`}
      </div>
    </div>
  )
}

function ShapeNode({ shape, selected, k }) {
  if (shape.visible === false) return null
  const s = shape.style
  const common = {
    'data-shape-id': shape.id,
    fill: s.fill && s.fill !== 'none' ? s.fill : 'none',
    fillOpacity: s.fillOpacity ?? 1,
    stroke: s.stroke && s.stroke !== 'none' ? s.stroke : 'none',
    strokeWidth: s.strokeWidth,
    strokeOpacity: s.strokeOpacity ?? 1,
    strokeLinecap: s.lineCap || 'round',
    strokeLinejoin: s.lineJoin || 'round',
    strokeDasharray: s.strokeDash || undefined,
    style: { cursor: shape.locked ? 'not-allowed' : 'move' },
  }
  const halo = selected ? (
    <g pointerEvents="none" opacity={0.9}>
      {shape.type === 'path' && (
        <path d={pathD(shape)} fill="none" stroke="#38bdf8" strokeWidth={Math.max(1.5 * k, s.strokeWidth + 2 * k)} strokeOpacity={0.35} />
      )}
    </g>
  ) : null

  switch (shape.type) {
    case 'rect':
      return (
        <g>
          {halo}
          <rect {...common} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx || 0} />
        </g>
      )
    case 'ellipse':
      return (
        <g>
          {halo}
          <ellipse {...common} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
        </g>
      )
    case 'text': {
      const lines = String(shape.text || '').split('\n')
      return (
        <text
          data-shape-id={shape.id}
          x={shape.x}
          y={shape.y}
          fontFamily={shape.fontFamily}
          fontSize={shape.fontSize}
          fontWeight={shape.fontWeight}
          fontStyle={shape.italic ? 'italic' : 'normal'}
          textAnchor={shape.anchor}
          fill={s.fill}
          fillOpacity={s.fillOpacity ?? 1}
          stroke={shape.halo ? shape.haloColor : 'none'}
          strokeWidth={shape.halo ? shape.haloWidth : 0}
          strokeLinejoin="round"
          paintOrder="stroke fill"
          style={{ cursor: 'move' }}
        >
          {lines.map((l, i) => (
            <tspan key={i} x={shape.x} dy={i === 0 ? 0 : shape.fontSize * 1.2}>
              {l}
            </tspan>
          ))}
        </text>
      )
    }
    default:
      return (
        <g>
          {halo}
          <path
            {...common}
            d={pathD(shape)}
            markerEnd={s.markerEnd ? `url(#me-${shape.id})` : undefined}
            markerStart={s.markerStart ? `url(#ms-${shape.id})` : undefined}
          />
        </g>
      )
  }
}

function PreviewNode({ preview, style, k, tool }) {
  const common = {
    fill: style.fill && style.fill !== 'none' ? style.fill : 'none',
    fillOpacity: (style.fillOpacity ?? 1) * 0.6,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    strokeOpacity: 0.85,
    pointerEvents: 'none',
  }
  if (preview.tool === 'marquee') {
    const x = Math.min(preview.start.x, preview.end.x)
    const y = Math.min(preview.start.y, preview.end.y)
    return (
      <rect
        x={x}
        y={y}
        width={Math.abs(preview.end.x - preview.start.x)}
        height={Math.abs(preview.end.y - preview.start.y)}
        fill="#38bdf8"
        fillOpacity={0.12}
        stroke="#38bdf8"
        strokeWidth={k}
        strokeDasharray={`${4 * k} ${3 * k}`}
        pointerEvents="none"
      />
    )
  }
  if (preview.tool === 'pencil') {
    const d = preview.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
    return <path d={d} {...common} fill="none" />
  }
  const { start, end } = preview
  if (!start || !end) return null
  if (tool === 'rect') {
    return (
      <rect
        x={Math.min(start.x, end.x)}
        y={Math.min(start.y, end.y)}
        width={Math.abs(end.x - start.x)}
        height={Math.abs(end.y - start.y)}
        {...common}
      />
    )
  }
  if (tool === 'ellipse') {
    return (
      <ellipse
        cx={(start.x + end.x) / 2}
        cy={(start.y + end.y) / 2}
        rx={Math.abs(end.x - start.x) / 2}
        ry={Math.abs(end.y - start.y) / 2}
        {...common}
      />
    )
  }
  return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...common} fill="none" />
}
