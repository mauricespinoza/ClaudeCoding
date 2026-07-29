// Modelo vectorial del editor: formas, geometría de Bézier y serialización SVG.
//
// Todas las coordenadas están en el espacio de píxeles de la imagen original,
// de modo que la exportación a cualquier resolución es una simple escala del viewBox.

import { bearingToCompass, edgeBearings, normalizeBearing } from './geo'

export const SHAPE_TYPES = ['path', 'rect', 'ellipse', 'text']

export function shapeId(prefix = 's') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function defaultStyle() {
  return {
    stroke: '#ff3b30',
    strokeWidth: 4,
    strokeOpacity: 1,
    strokeDash: '',
    lineCap: 'round',
    lineJoin: 'round',
    fill: 'none',
    fillOpacity: 0.25,
    markerStart: false,
    markerEnd: false,
  }
}

export function defaultTextStyle() {
  return {
    ...defaultStyle(),
    stroke: 'none',
    strokeWidth: 0,
    fill: '#ffd60a',
    fillOpacity: 1,
  }
}

// --- Constructores -----------------------------------------------------------

export function makeNode(x, y, hIn = null, hOut = null, smooth = false) {
  return { x, y, hIn, hOut, smooth }
}

export function makePath(nodes, { closed = false, style, name } = {}) {
  return {
    id: shapeId('path'),
    type: 'path',
    nodes,
    closed,
    style: style || defaultStyle(),
    name: name || (closed ? 'Polígono' : 'Trazo'),
    visible: true,
    locked: false,
  }
}

export function makeRect(x, y, w, h, style) {
  return {
    id: shapeId('rect'),
    type: 'rect',
    x,
    y,
    w,
    h,
    rx: 0,
    style: style || defaultStyle(),
    name: 'Rectángulo',
    visible: true,
    locked: false,
  }
}

export function makeEllipse(cx, cy, rx, ry, style) {
  return {
    id: shapeId('ell'),
    type: 'ellipse',
    cx,
    cy,
    rx,
    ry,
    style: style || defaultStyle(),
    name: 'Elipse',
    visible: true,
    locked: false,
  }
}

export function makeText(x, y, text, style, fontSize = 48) {
  return {
    id: shapeId('txt'),
    type: 'text',
    x,
    y,
    text: text || 'Texto',
    fontSize,
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontWeight: 700,
    italic: false,
    anchor: 'start',
    halo: true,
    haloColor: '#000000',
    haloWidth: 3,
    style: style || defaultTextStyle(),
    name: 'Texto',
    visible: true,
    locked: false,
  }
}

/** Polígono regular de n lados, útil para el atajo de polígonos. */
export function makeRegularPolygon(cx, cy, radius, sides = 5, style) {
  const nodes = []
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2
    nodes.push(makeNode(cx + radius * Math.cos(a), cy + radius * Math.sin(a)))
  }
  const p = makePath(nodes, { closed: true, style })
  p.name = `Polígono ${sides}`
  return p
}

// --- Geometría ---------------------------------------------------------------

/** Construye el atributo `d` de una forma de tipo path. */
export function pathD(shape) {
  const { nodes, closed } = shape
  if (!nodes?.length) return ''
  const seg = (a, b) => {
    const c1 = a.hOut
    const c2 = b.hIn
    if (!c1 && !c2) return `L ${num(b.x)} ${num(b.y)}`
    const p1 = c1 || { x: a.x, y: a.y }
    const p2 = c2 || { x: b.x, y: b.y }
    return `C ${num(p1.x)} ${num(p1.y)} ${num(p2.x)} ${num(p2.y)} ${num(b.x)} ${num(b.y)}`
  }
  let d = `M ${num(nodes[0].x)} ${num(nodes[0].y)}`
  for (let i = 1; i < nodes.length; i++) d += ` ${seg(nodes[i - 1], nodes[i])}`
  if (closed && nodes.length > 2) d += ` ${seg(nodes[nodes.length - 1], nodes[0])} Z`
  return d
}

function num(v) {
  return Math.round(v * 100) / 100
}

/** Punto de una curva cúbica en t. */
function cubicAt(p0, p1, p2, p3, t) {
  const mt = 1 - t
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  }
}

/** Puntos de control efectivos de un segmento entre dos nodos. */
export function segmentControls(a, b) {
  return [a, a.hOut || { x: a.x, y: a.y }, b.hIn || { x: b.x, y: b.y }, b]
}

/** Número de segmentos de un path (considera el cierre). */
export function segmentCount(shape) {
  const n = shape.nodes?.length || 0
  if (n < 2) return 0
  return shape.closed ? n : n - 1
}

/**
 * Punto más cercano del trazo a `pt`, por muestreo.
 * Devuelve { segIndex, t, dist, point } o null.
 */
export function nearestOnPath(shape, pt, samples = 24) {
  const count = segmentCount(shape)
  if (!count) return null
  let best = null
  for (let i = 0; i < count; i++) {
    const a = shape.nodes[i]
    const b = shape.nodes[(i + 1) % shape.nodes.length]
    const [p0, p1, p2, p3] = segmentControls(a, b)
    for (let s = 0; s <= samples; s++) {
      const t = s / samples
      const q = cubicAt(p0, p1, p2, p3, t)
      const d = Math.hypot(q.x - pt.x, q.y - pt.y)
      if (!best || d < best.dist) best = { segIndex: i, t, dist: d, point: q }
    }
  }
  return best
}

/** Inserta un nodo en el segmento `index` (de nodes[index] a nodes[index+1]) en t. */
export function splitSegment(shape, index, t = 0.5) {
  const nodes = shape.nodes.map(cloneNode)
  const n = nodes.length
  const a = nodes[index]
  const b = nodes[(index + 1) % n]
  const p1 = a.hOut || { x: a.x, y: a.y }
  const p2 = b.hIn || { x: b.x, y: b.y }

  const lerp = (p, q, k) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k })
  const q0 = lerp(a, p1, t)
  const q1 = lerp(p1, p2, t)
  const q2 = lerp(p2, b, t)
  const r0 = lerp(q0, q1, t)
  const r1 = lerp(q1, q2, t)
  const mid = cubicAt(a, p1, p2, b, t)

  const isLine = !a.hOut && !b.hIn
  const newNode = makeNode(
    mid.x,
    mid.y,
    isLine ? null : { ...r0 },
    isLine ? null : { ...r1 },
    !isLine
  )
  if (!isLine) {
    a.hOut = q0
    b.hIn = q2
  }
  nodes.splice(index + 1, 0, newNode)
  return { ...shape, nodes }
}

function cloneNode(n) {
  return {
    x: n.x,
    y: n.y,
    hIn: n.hIn ? { ...n.hIn } : null,
    hOut: n.hOut ? { ...n.hOut } : null,
    smooth: !!n.smooth,
  }
}

// --- Trazo a mano alzada -----------------------------------------------------

/** Simplificación Ramer–Douglas–Peucker. */
export function simplify(points, tolerance = 2) {
  if (points.length < 3) return points.slice()
  const sqTol = tolerance * tolerance
  const sqSegDist = (p, a, b) => {
    let x = a.x
    let y = a.y
    let dx = b.x - x
    let dy = b.y - y
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = b.x
        y = b.y
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }
    dx = p.x - x
    dy = p.y - y
    return dx * dx + dy * dy
  }
  const step = (first, last, out) => {
    let maxSq = sqTol
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(points[i], points[first], points[last])
      if (sq > maxSq) {
        index = i
        maxSq = sq
      }
    }
    if (index > 0) {
      if (index - first > 1) step(first, index, out)
      out.push(points[index])
      if (last - index > 1) step(index, last, out)
    }
  }
  const out = [points[0]]
  step(0, points.length - 1, out)
  out.push(points[points.length - 1])
  return out
}

/** Convierte una polilínea en nodos suaves (Catmull-Rom → Bézier). */
export function polylineToNodes(points, smoothing = 0.28) {
  const pts = points
  const n = pts.length
  if (n < 2) return pts.map((p) => makeNode(p.x, p.y))
  return pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(n - 1, i + 1)]
    const dx = (next.x - prev.x) * smoothing
    const dy = (next.y - prev.y) * smoothing
    const hIn = i === 0 ? null : { x: p.x - dx, y: p.y - dy }
    const hOut = i === n - 1 ? null : { x: p.x + dx, y: p.y + dy }
    return makeNode(p.x, p.y, hIn, hOut, true)
  })
}

/** Bounding box aproximado (incluye handles para paths). */
export function shapeBBox(shape) {
  if (shape.type === 'rect') {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
  }
  if (shape.type === 'ellipse') {
    return { x: shape.cx - shape.rx, y: shape.cy - shape.ry, w: shape.rx * 2, h: shape.ry * 2 }
  }
  if (shape.type === 'text') {
    const lines = String(shape.text || '').split('\n')
    const w = Math.max(...lines.map((l) => l.length)) * shape.fontSize * 0.55
    const h = lines.length * shape.fontSize * 1.2
    const x = shape.anchor === 'middle' ? shape.x - w / 2 : shape.anchor === 'end' ? shape.x - w : shape.x
    return { x, y: shape.y - shape.fontSize, w, h }
  }
  const pts = []
  for (const n of shape.nodes || []) {
    pts.push({ x: n.x, y: n.y })
    if (n.hIn) pts.push(n.hIn)
    if (n.hOut) pts.push(n.hOut)
  }
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

export function unionBBox(boxes) {
  const valid = boxes.filter(Boolean)
  if (!valid.length) return null
  const x = Math.min(...valid.map((b) => b.x))
  const y = Math.min(...valid.map((b) => b.y))
  const x2 = Math.max(...valid.map((b) => b.x + b.w))
  const y2 = Math.max(...valid.map((b) => b.y + b.h))
  return { x, y, w: x2 - x, h: y2 - y }
}

export function translateShape(shape, dx, dy) {
  switch (shape.type) {
    case 'rect':
      return { ...shape, x: shape.x + dx, y: shape.y + dy }
    case 'ellipse':
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy }
    case 'text':
      return { ...shape, x: shape.x + dx, y: shape.y + dy }
    default:
      return {
        ...shape,
        nodes: shape.nodes.map((n) => ({
          ...cloneNode(n),
          x: n.x + dx,
          y: n.y + dy,
          hIn: n.hIn ? { x: n.hIn.x + dx, y: n.hIn.y + dy } : null,
          hOut: n.hOut ? { x: n.hOut.x + dx, y: n.hOut.y + dy } : null,
        })),
      }
  }
}

/** Escala una forma respecto de un origen. */
export function scaleShape(shape, origin, sx, sy) {
  const tp = (p) => ({ x: origin.x + (p.x - origin.x) * sx, y: origin.y + (p.y - origin.y) * sy })
  switch (shape.type) {
    case 'rect': {
      const a = tp({ x: shape.x, y: shape.y })
      return { ...shape, x: a.x, y: a.y, w: shape.w * sx, h: shape.h * sy }
    }
    case 'ellipse': {
      const c = tp({ x: shape.cx, y: shape.cy })
      return { ...shape, cx: c.x, cy: c.y, rx: shape.rx * sx, ry: shape.ry * sy }
    }
    case 'text': {
      const p = tp({ x: shape.x, y: shape.y })
      const k = (Math.abs(sx) + Math.abs(sy)) / 2
      return { ...shape, x: p.x, y: p.y, fontSize: Math.max(4, shape.fontSize * k) }
    }
    default:
      return {
        ...shape,
        nodes: shape.nodes.map((n) => {
          const p = tp(n)
          return {
            ...cloneNode(n),
            x: p.x,
            y: p.y,
            hIn: n.hIn ? tp(n.hIn) : null,
            hOut: n.hOut ? tp(n.hOut) : null,
          }
        }),
      }
  }
}

/** Convierte rect/ellipse en path editable por nodos. */
export function toPath(shape) {
  if (shape.type === 'path') return shape
  if (shape.type === 'rect') {
    const { x, y, w, h } = shape
    return makePath(
      [makeNode(x, y), makeNode(x + w, y), makeNode(x + w, y + h), makeNode(x, y + h)],
      { closed: true, style: shape.style }
    )
  }
  if (shape.type === 'ellipse') {
    const { cx, cy, rx, ry } = shape
    const k = 0.5522847498
    const nodes = [
      makeNode(cx, cy - ry, { x: cx - rx * k, y: cy - ry }, { x: cx + rx * k, y: cy - ry }, true),
      makeNode(cx + rx, cy, { x: cx + rx, y: cy - ry * k }, { x: cx + rx, y: cy + ry * k }, true),
      makeNode(cx, cy + ry, { x: cx + rx * k, y: cy + ry }, { x: cx - rx * k, y: cy + ry }, true),
      makeNode(cx - rx, cy, { x: cx - rx, y: cy + ry * k }, { x: cx - rx, y: cy - ry * k }, true),
    ]
    return makePath(nodes, { closed: true, style: shape.style })
  }
  return shape
}

// --- Serialización SVG -------------------------------------------------------

function styleAttrs(style, isText = false) {
  const a = []
  const stroke = style.stroke && style.stroke !== 'none' ? style.stroke : 'none'
  a.push(`fill="${style.fill && style.fill !== 'none' ? style.fill : 'none'}"`)
  if (style.fill && style.fill !== 'none') a.push(`fill-opacity="${style.fillOpacity ?? 1}"`)
  a.push(`stroke="${stroke}"`)
  if (stroke !== 'none') {
    a.push(`stroke-width="${style.strokeWidth ?? 2}"`)
    a.push(`stroke-opacity="${style.strokeOpacity ?? 1}"`)
    a.push(`stroke-linecap="${style.lineCap || 'round'}"`)
    a.push(`stroke-linejoin="${style.lineJoin || 'round'}"`)
    if (style.strokeDash) a.push(`stroke-dasharray="${style.strokeDash}"`)
  }
  if (isText) a.push('paint-order="stroke fill"')
  return a.join(' ')
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Markers de flecha por forma (color explícito para que exporten bien). */
function markerDefs(shape) {
  const defs = []
  const color = shape.style.stroke || '#000'
  const mk = (id, orient) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="${orient}" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" fill-opacity="${
      shape.style.strokeOpacity ?? 1
    }"/></marker>`
  if (shape.style.markerEnd) defs.push(mk(`me-${shape.id}`, 'auto'))
  if (shape.style.markerStart) defs.push(mk(`ms-${shape.id}`, 'auto-start-reverse'))
  return defs.join('')
}

export function shapeToSvg(shape) {
  if (shape.visible === false) return ''
  const s = shape.style
  switch (shape.type) {
    case 'rect':
      return `<rect x="${num(shape.x)}" y="${num(shape.y)}" width="${num(
        shape.w
      )}" height="${num(shape.h)}" rx="${num(shape.rx || 0)}" ${styleAttrs(s)}/>`
    case 'ellipse':
      return `<ellipse cx="${num(shape.cx)}" cy="${num(shape.cy)}" rx="${num(
        shape.rx
      )}" ry="${num(shape.ry)}" ${styleAttrs(s)}/>`
    case 'text': {
      const lines = String(shape.text || '').split('\n')
      const tspans = lines
        .map(
          (l, i) =>
            `<tspan x="${num(shape.x)}" dy="${i === 0 ? 0 : num(shape.fontSize * 1.2)}">${esc(
              l
            )}</tspan>`
        )
        .join('')
      const halo = shape.halo
        ? ` stroke="${shape.haloColor || '#000'}" stroke-width="${
            shape.haloWidth ?? 3
          }" stroke-linejoin="round" paint-order="stroke fill"`
        : ''
      return `<text x="${num(shape.x)}" y="${num(shape.y)}" font-family="${esc(
        shape.fontFamily
      )}" font-size="${num(shape.fontSize)}" font-weight="${shape.fontWeight}" ${
        shape.italic ? 'font-style="italic" ' : ''
      }text-anchor="${shape.anchor}" fill="${s.fill}" fill-opacity="${
        s.fillOpacity ?? 1
      }"${halo}>${tspans}</text>`
    }
    default: {
      const marker = `${shape.style.markerStart ? ` marker-start="url(#ms-${shape.id})"` : ''}${
        shape.style.markerEnd ? ` marker-end="url(#me-${shape.id})"` : ''
      }`
      return `<path d="${pathD(shape)}" ${styleAttrs(s)}${marker}/>`
    }
  }
}

// --- Rótulos de rumbo (rosa de los vientos) ----------------------------------

export const DEFAULT_COMPASS = {
  enabled: false,
  bearing: 0,
  fov: 65,
  points: 16,
  showDegrees: true,
  fontSize: 0, // 0 = automático a partir del ancho de la imagen
  color: '#ffffff',
  haloColor: '#000000',
  plate: true,
  plateColor: '#000000',
  plateOpacity: 0.45,
  margin: 0, // 0 = automático
  prefix: '',
}

/** Etiquetas izquierda/derecha calculadas para la foto. */
export function compassLabels(compass) {
  const { left, right } = edgeBearings(compass.bearing, compass.fov)
  const fmt = (b) =>
    `${compass.prefix || ''}${bearingToCompass(b, compass.points)}${
      compass.showDegrees ? ` ${Math.round(normalizeBearing(b))}°` : ''
    }`
  return { left: fmt(left), right: fmt(right), leftDeg: left, rightDeg: right }
}

/**
 * SVG de los rótulos cardinales en las esquinas superiores.
 * Se genera como marcado plano para que sea idéntico en pantalla y exportación.
 */
export function compassToSvg(compass, width, height) {
  if (!compass?.enabled) return ''
  const fontSize = compass.fontSize > 0 ? compass.fontSize : Math.max(14, Math.round(width * 0.035))
  const margin = compass.margin > 0 ? compass.margin : Math.round(width * 0.02)
  const { left, right } = compassLabels(compass)
  const padX = fontSize * 0.45
  const padY = fontSize * 0.3
  const baseline = margin + fontSize

  const item = (text, side) => {
    const w = text.length * fontSize * 0.62 + padX * 2
    const h = fontSize * 1.15 + padY * 2
    const x = side === 'left' ? margin : width - margin - w
    const anchorX = side === 'left' ? x + padX : x + w - padX
    const plate = compass.plate
      ? `<rect x="${num(x)}" y="${num(margin)}" width="${num(w)}" height="${num(
          h
        )}" rx="${num(fontSize * 0.25)}" fill="${compass.plateColor}" fill-opacity="${
          compass.plateOpacity
        }"/>`
      : ''
    return `${plate}<text x="${num(anchorX)}" y="${num(
      baseline + padY * 0.6
    )}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="${
      side === 'left' ? 'start' : 'end'
    }" fill="${compass.color}" stroke="${compass.haloColor}" stroke-width="${(
      fontSize * 0.09
    ).toFixed(2)}" stroke-linejoin="round" paint-order="stroke fill">${esc(text)}</text>`
  }

  return `<g id="gp-compass" data-compass="1">${item(left, 'left')}${item(right, 'right')}</g>`
}

/**
 * Documento SVG completo: imagen base + anotaciones + rótulos cardinales.
 * `imageHref` debe ser un data URI para que el SVG sea autocontenido.
 */
export function buildSvgDocument({
  width,
  height,
  imageHref,
  shapes = [],
  compass = null,
  includeImage = true,
  background = null,
}) {
  const defs = shapes
    .filter((s) => s.type === 'path' && (s.style.markerStart || s.style.markerEnd))
    .map(markerDefs)
    .join('')
  const bg = background ? `<rect width="${width}" height="${height}" fill="${background}"/>` : ''
  const img =
    includeImage && imageHref
      ? `<image x="0" y="0" width="${width}" height="${height}" href="${imageHref}" xlink:href="${imageHref}" preserveAspectRatio="none"/>`
      : ''
  const body = shapes.map(shapeToSvg).join('\n  ')
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs ? `<defs>${defs}</defs>` : ''}
  ${bg}
  ${img}
  ${body}
  ${compassToSvg(compass, width, height)}
</svg>`
}
