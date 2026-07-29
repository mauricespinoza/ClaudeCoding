import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { boundsOf } from '../lib/geo'

// Capas equivalentes a los tipos de vista de Google Maps, sin necesidad de API key.
const LAYERS = {
  roadmap: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap, © OpenStreetMap',
    maxZoom: 17,
  },
}

function markerIcon(index, { active, selected }) {
  const bg = active ? '#f59e0b' : selected ? '#38bdf8' : '#e2e8f0'
  const size = active ? 30 : selected ? 26 : 22
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};
      border:2px solid #0b1020;box-shadow:0 1px 6px rgba(0,0,0,.6);display:flex;
      align-items:center;justify-content:center;font:700 ${
        size > 24 ? 12 : 10
      }px system-ui;color:#0b1020">${index + 1}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export default function LeafletMapView({
  photos,
  selectedIds,
  activeId,
  mapType = 'satellite',
  placingId = null,
  onSelect,
  onMove,
  onPlace,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const labelLayerRef = useRef(null)
  const markersRef = useRef(new Map())
  const fittedRef = useRef(false)
  const placingRef = useRef(placingId)
  placingRef.current = placingId

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return undefined
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([-33.45, -70.66], 4)
    // Abajo a la derecha, como en Google Maps, para no chocar con el selector de capas.
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map
    map.on('click', (ev) => {
      if (placingRef.current) onPlace?.(placingRef.current, ev.latlng.lat, ev.latlng.lng)
    })
    return () => {
      // Se limpian las referencias antes de destruir el mapa: si quedan marcadores
      // de una instancia anterior (React StrictMode remonta los efectos), Leaflet
      // falla al reposicionarlos sobre un mapa ya eliminado.
      markersRef.current.clear()
      layerRef.current = null
      labelLayerRef.current = null
      fittedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [onPlace])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const cfg = LAYERS[mapType] || LAYERS.satellite
    if (layerRef.current) map.removeLayer(layerRef.current)
    if (labelLayerRef.current) {
      map.removeLayer(labelLayerRef.current)
      labelLayerRef.current = null
    }
    layerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map)
    if (cfg.labels) {
      labelLayerRef.current = L.tileLayer(cfg.labels, { maxZoom: cfg.maxZoom }).addTo(map)
    }
  }, [mapType])

  useEffect(() => {
    const el = containerRef.current
    if (el) el.style.cursor = placingId ? 'crosshair' : ''
  }, [placingId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set()
    photos.forEach((p, index) => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return
      seen.add(p.id)
      const state = { active: activeId === p.id, selected: selectedIds.includes(p.id) }
      let marker = markersRef.current.get(p.id)
      if (!marker) {
        marker = L.marker([p.lat, p.lon], {
          icon: markerIcon(index, state),
          draggable: true,
          title: p.title || p.name,
        }).addTo(map)
        marker.on('click', () => onSelect?.(p.id))
        marker.on('dragend', (ev) => {
          const ll = ev.target.getLatLng()
          onMove?.(p.id, ll.lat, ll.lng)
        })
        markersRef.current.set(p.id, marker)
      } else {
        marker.setLatLng([p.lat, p.lon])
        marker.setIcon(markerIcon(index, state))
      }
      marker.setZIndexOffset(state.active ? 1000 : state.selected ? 500 : 0)
    })
    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        map.removeLayer(marker)
        markersRef.current.delete(id)
      }
    })

    const b = boundsOf(photos.map((p) => ({ lat: p.lat, lon: p.lon })))
    if (b && !fittedRef.current) {
      fittedRef.current = true
      if (b.north === b.south && b.east === b.west) map.setView([b.north, b.east], 16)
      else map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [48, 48] })
    }
  }, [photos, selectedIds, activeId, onSelect, onMove])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !activeId) return
    const p = photos.find((x) => x.id === activeId)
    if (p && Number.isFinite(p.lat)) map.panTo([p.lat, p.lon])
  }, [activeId, photos])

  return <div ref={containerRef} className="h-full w-full" />
}
