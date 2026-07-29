// Generación de KML / KMZ para Google Earth.

import JSZip from 'jszip'
import { blobToDataUrl } from './images'
import { bearingToCompass, formatBearing, normalizeBearing } from './geo'

export function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function slug(str, fallback = 'foto') {
  const s = String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return s || fallback
}

function extForMime(mime) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/tiff') return 'tif'
  return 'jpg'
}

/** Balloon HTML: miniatura clicable que abre la imagen completa. */
function balloonHtml({ meta, thumbSrc, fullSrc, thumbWidth, compassPoints }) {
  const rows = []
  if (Number.isFinite(meta.lat) && Number.isFinite(meta.lon)) {
    rows.push(['Coordenadas', `${meta.lat.toFixed(6)}, ${meta.lon.toFixed(6)}`])
  }
  if (Number.isFinite(meta.altitude)) rows.push(['Altitud', `${meta.altitude.toFixed(1)} m`])
  if (Number.isFinite(meta.bearing)) {
    rows.push(['Rumbo de cámara', formatBearing(meta.bearing, compassPoints)])
  }
  if (meta.takenAt) rows.push(['Fecha', new Date(meta.takenAt).toLocaleString()])
  if (meta.make || meta.model) rows.push(['Cámara', [meta.make, meta.model].filter(Boolean).join(' ')])

  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 8px 2px 0;color:#555;white-space:nowrap">${escapeXml(
          k
        )}</td><td style="padding:2px 0"><b>${escapeXml(v)}</b></td></tr>`
    )
    .join('')

  const title = escapeXml(meta.title || meta.name)
  const desc = meta.description
    ? `<p style="margin:8px 0 0;color:#333">${escapeXml(meta.description)}</p>`
    : ''

  return `<![CDATA[<div style="font-family:Helvetica,Arial,sans-serif;max-width:${
    thumbWidth + 20
  }px">
<h3 style="margin:0 0 6px">${title}</h3>
<a href="${fullSrc}" title="Abrir la imagen completa"><img src="${thumbSrc}" width="${thumbWidth}" style="border:1px solid #ccc;border-radius:4px;display:block"/></a>
<div style="font-size:11px;color:#777;margin:4px 0 8px">Haz clic en la miniatura para ver la imagen completa.</div>
<table style="font-size:12px;border-collapse:collapse">${table}</table>
${desc}
</div>]]>`
}

/** Extremo del cono de visión: destino a `dist` metros con rumbo `brg`. */
function destinationPoint(lat, lon, brg, dist) {
  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180
  const toDeg = (x) => (x * 180) / Math.PI
  const d = dist / R
  const b = toRad(normalizeBearing(brg))
  const lat1 = toRad(lat)
  const lon1 = toRad(lon)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    )
  return { lat: toDeg(lat2), lon: ((toDeg(lon2) + 540) % 360) - 180 }
}

function fovWedgePlacemark(meta, { fovDistance = 150, defaultFov = 65 }) {
  if (!Number.isFinite(meta.lat) || !Number.isFinite(meta.lon)) return ''
  if (!Number.isFinite(meta.bearing)) return ''
  const fov = Number.isFinite(meta.fov) ? meta.fov : defaultFov
  const start = normalizeBearing(meta.bearing - fov / 2)
  const steps = 12
  const coords = [`${meta.lon},${meta.lat},0`]
  for (let i = 0; i <= steps; i++) {
    const b = start + (fov * i) / steps
    const p = destinationPoint(meta.lat, meta.lon, b, fovDistance)
    coords.push(`${p.lon},${p.lat},0`)
  }
  coords.push(`${meta.lon},${meta.lat},0`)
  return `    <Placemark>
      <name>${escapeXml(meta.title || meta.name)} — campo de visión</name>
      <styleUrl>#gp-fov</styleUrl>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        ${coords.join(' ')}
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`
}

function extendedData(meta, compassPoints) {
  const data = [
    ['archivo', meta.name],
    ['origen', meta.origin],
    ['latitud', meta.lat],
    ['longitud', meta.lon],
    ['altitud_m', meta.altitude],
    ['rumbo_grados', Number.isFinite(meta.bearing) ? Math.round(meta.bearing) : null],
    ['rumbo_rosa', Number.isFinite(meta.bearing) ? bearingToCompass(meta.bearing, compassPoints) : null],
    ['fecha', meta.takenAt],
    ['camara', [meta.make, meta.model].filter(Boolean).join(' ') || null],
    ['ancho_px', meta.width],
    ['alto_px', meta.height],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (!data.length) return ''
  return `      <ExtendedData>
${data
  .map(([k, v]) => `        <Data name="${k}"><value>${escapeXml(v)}</value></Data>`)
  .join('\n')}
      </ExtendedData>`
}

/**
 * Construye el documento KML.
 * `entries`: [{ meta, thumbSrc, fullSrc }] donde los src ya son rutas KMZ o URLs/data URIs.
 */
export function buildKmlDocument(entries, opts = {}) {
  const {
    documentName = 'GeoPhoto Studio',
    thumbWidth = 320,
    iconMode = 'pin',
    includeFovWedge = false,
    fovDistance = 150,
    defaultFov = 65,
    compassPoints = 16,
    lookAtRange = 400,
  } = opts

  const styles = entries
    .map((e, i) => {
      if (iconMode !== 'thumb') return ''
      return `    <Style id="gp-icon-${i}">
      <IconStyle><scale>1.1</scale><Icon><href>${escapeXml(e.thumbSrc)}</href></Icon>
        <hotSpot x="0.5" y="0" xunits="fraction" yunits="fraction"/></IconStyle>
      <LabelStyle><scale>0.8</scale></LabelStyle>
      <BalloonStyle><text>$[description]</text></BalloonStyle>
    </Style>`
    })
    .filter(Boolean)
    .join('\n')

  const placemarks = entries
    .map((e, i) => {
      const { meta } = e
      const hasPos = Number.isFinite(meta.lat) && Number.isFinite(meta.lon)
      if (!hasPos) return ''
      const styleUrl = iconMode === 'thumb' ? `#gp-icon-${i}` : '#gp-pin'
      const look = Number.isFinite(meta.bearing)
        ? `      <LookAt>
        <longitude>${meta.lon}</longitude><latitude>${meta.lat}</latitude>
        <altitude>0</altitude><heading>${normalizeBearing(meta.bearing).toFixed(1)}</heading>
        <tilt>75</tilt><range>${lookAtRange}</range>
        <altitudeMode>relativeToGround</altitudeMode>
      </LookAt>`
        : ''
      const wedge = includeFovWedge
        ? fovWedgePlacemark(meta, { fovDistance, defaultFov })
        : ''
      return `    <Placemark>
      <name>${escapeXml(meta.title || meta.name)}</name>
      <styleUrl>${styleUrl}</styleUrl>
${look}
      <description>${balloonHtml({
        meta,
        thumbSrc: e.thumbSrc,
        fullSrc: e.fullSrc,
        thumbWidth,
        compassPoints,
      })}</description>
${extendedData(meta, compassPoints)}
      <Point><coordinates>${meta.lon},${meta.lat},${
        Number.isFinite(meta.altitude) ? meta.altitude : 0
      }</coordinates></Point>
    </Placemark>
${wedge}`
    })
    .filter(Boolean)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    <open>1</open>
    <Style id="gp-pin">
      <IconStyle><scale>1.1</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/camera.png</href></Icon>
      </IconStyle>
      <LabelStyle><scale>0.8</scale></LabelStyle>
      <BalloonStyle><text>$[description]</text></BalloonStyle>
    </Style>
    <Style id="gp-fov">
      <LineStyle><color>b400a5ff</color><width>1.5</width></LineStyle>
      <PolyStyle><color>3c00a5ff</color></PolyStyle>
    </Style>
${styles}
${placemarks}
  </Document>
</kml>
`
}

/**
 * Exporta un KMZ autocontenido: doc.kml + imágenes empaquetadas.
 * `items`: [{ meta, fullBlob, thumbBlob }].
 */
export async function buildKmz(items, opts = {}) {
  const zip = new JSZip()
  const files = zip.folder('files')
  const entries = []

  items.forEach((item, i) => {
    const base = `${String(i + 1).padStart(3, '0')}_${slug(
      (item.meta.name || 'foto').replace(/\.[^.]+$/, '')
    ).slice(0, 40)}`
    // La extensión sale del blob real: la versión anotada es PNG aunque el
    // original fuese JPEG, y Google Earth resuelve la imagen por extensión.
    const ext = extForMime(item.fullBlob?.type || item.meta.mime)
    const thumbPath = `files/${base}_thumb.jpg`
    const fullPath = `files/${base}.${ext}`
    files.file(`${base}_thumb.jpg`, item.thumbBlob)
    files.file(`${base}.${ext}`, item.fullBlob)
    entries.push({ meta: item.meta, thumbSrc: thumbPath, fullSrc: fullPath })
  })

  zip.file('doc.kml', buildKmlDocument(entries, opts))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' })
}

/**
 * KML plano. Las imágenes se referencian por URL remota cuando existe;
 * si no, se incrustan como data URI (funciona en Google Earth Pro).
 */
export async function buildStandaloneKml(items, opts = {}) {
  const entries = []
  for (const item of items) {
    let thumbSrc
    let fullSrc
    if (opts.preferRemoteUrls !== false && item.meta.sourceUrl) {
      thumbSrc = item.meta.sourceUrl
      fullSrc = item.meta.sourceUrl
    } else {
      thumbSrc = await blobToDataUrl(item.thumbBlob)
      fullSrc = opts.embedFullImage ? await blobToDataUrl(item.fullBlob) : thumbSrc
    }
    entries.push({ meta: item.meta, thumbSrc, fullSrc })
  }
  return buildKmlDocument(entries, opts)
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
