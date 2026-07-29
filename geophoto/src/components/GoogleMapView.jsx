import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../lib/googleMaps'
import { boundsOf } from '../lib/geo'

/**
 * Vista de mapa con la Google Maps JavaScript API.
 * Expone los mismos props que LeafletMapView para que sean intercambiables.
 */
export default function GoogleMapView({
  apiKey,
  photos,
  selectedIds,
  activeId,
  mapType = 'satellite',
  placingId = null,
  onSelect,
  onMove,
  onPlace,
  onError,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const [ready, setReady] = useState(false)
  const fittedRef = useRef(false)

  useEffect(() => {
    let alive = true
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (!alive || !containerRef.current) return
        mapRef.current = new maps.Map(containerRef.current, {
          center: { lat: -33.45, lng: -70.66 },
          zoom: 4,
          mapTypeId: mapType,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          tilt: 0,
        })
        setReady(true)
      })
      .catch((err) => onError?.(err.message))
    return () => {
      alive = false
    }
    // El mapa se crea una sola vez; el tipo se sincroniza en otro efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  useEffect(() => {
    if (ready && mapRef.current) mapRef.current.setMapTypeId(mapType)
  }, [mapType, ready])

  // Clic en el mapa para geolocalizar manualmente una foto.
  useEffect(() => {
    if (!ready || !mapRef.current) return undefined
    const maps = window.google.maps
    const listener = mapRef.current.addListener('click', (ev) => {
      if (!placingId) return
      onPlace?.(placingId, ev.latLng.lat(), ev.latLng.lng())
    })
    mapRef.current.setOptions({ draggableCursor: placingId ? 'crosshair' : null })
    return () => maps.event.removeListener(listener)
  }, [ready, placingId, onPlace])

  // Marcadores.
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const maps = window.google.maps
    const map = mapRef.current
    const seen = new Set()

    photos.forEach((p, index) => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return
      seen.add(p.id)
      const selected = selectedIds.includes(p.id)
      const active = activeId === p.id
      let marker = markersRef.current.get(p.id)
      const position = { lat: p.lat, lng: p.lon }
      const icon = {
        path: maps.SymbolPath.CIRCLE,
        scale: active ? 11 : selected ? 9 : 7,
        fillColor: active ? '#f59e0b' : selected ? '#38bdf8' : '#e2e8f0',
        fillOpacity: 1,
        strokeColor: '#0b1020',
        strokeWeight: 2,
      }
      if (!marker) {
        marker = new maps.Marker({
          position,
          map,
          draggable: true,
          title: p.title || p.name,
        })
        marker.addListener('click', () => onSelect?.(p.id))
        marker.addListener('dragend', (ev) => onMove?.(p.id, ev.latLng.lat(), ev.latLng.lng()))
        markersRef.current.set(p.id, marker)
      } else {
        marker.setPosition(position)
      }
      marker.setIcon(icon)
      marker.setLabel({
        text: String(index + 1),
        color: '#0b1020',
        fontSize: '10px',
        fontWeight: '700',
      })
      marker.setZIndex(active ? 1000 : selected ? 500 : 1)
    })

    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.setMap(null)
        markersRef.current.delete(id)
      }
    })

    const bounds = boundsOf(photos.map((p) => ({ lat: p.lat, lon: p.lon })))
    if (bounds && !fittedRef.current) {
      fittedRef.current = true
      const gb = new maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east }
      )
      map.fitBounds(gb, 64)
      if (bounds.north === bounds.south && bounds.east === bounds.west) map.setZoom(16)
    }
  }, [photos, selectedIds, activeId, ready, onSelect, onMove])

  // Centrado sobre la foto activa.
  useEffect(() => {
    if (!ready || !mapRef.current || !activeId) return
    const p = photos.find((x) => x.id === activeId)
    if (p && Number.isFinite(p.lat)) mapRef.current.panTo({ lat: p.lat, lng: p.lon })
  }, [activeId, photos, ready])

  return <div ref={containerRef} className="h-full w-full" />
}
