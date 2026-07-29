import { useCallback, useEffect, useMemo, useState } from 'react'
import { Camera, Loader2, Settings, Trash2, Waypoints } from 'lucide-react'
import ImportPanel from './components/ImportPanel'
import MapPanel from './components/MapPanel'
import PhotoTable from './components/PhotoTable'
import DetailsPanel from './components/DetailsPanel'
import SettingsModal from './components/SettingsModal'
import KmlExportModal from './components/KmlExportModal'
import EditorModal from './components/editor/EditorModal'
import { usePhotoLibrary } from './lib/store'
import { loadSettings, saveSettings, storageEstimate } from './lib/db'

export default function App() {
  const lib = usePhotoLibrary()
  const [settings, setSettings] = useState(loadSettings)
  const [selectedIds, setSelectedIds] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [placingId, setPlacingId] = useState(null)
  const [editorId, setEditorId] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showKml, setShowKml] = useState(false)
  const [storage, setStorage] = useState(null)

  useEffect(() => {
    storageEstimate().then(setStorage)
  }, [lib.photos.length])

  const persistSettings = useCallback((next) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  const activePhoto = useMemo(
    () => lib.photos.find((p) => p.id === activeId) || null,
    [lib.photos, activeId]
  )
  const editorPhoto = useMemo(
    () => lib.photos.find((p) => p.id === editorId) || null,
    [lib.photos, editorId]
  )

  const toggle = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const toggleAll = useCallback((ids, on) => {
    setSelectedIds((prev) => (on ? [...new Set([...prev, ...ids])] : prev.filter((x) => !ids.includes(x))))
  }, [])

  const handlePlace = useCallback(
    (id, lat, lon) => {
      lib.updateMeta(id, { lat, lon, manualLocation: true })
      setPlacingId(null)
    },
    [lib]
  )

  const handleMove = useCallback(
    (id, lat, lon) => lib.updateMeta(id, { lat, lon, manualLocation: true }),
    [lib]
  )

  const handleDelete = useCallback(
    async (id) => {
      const p = lib.photos.find((x) => x.id === id)
      if (!p) return
      if (!window.confirm(`¿Eliminar «${p.title || p.name}» de la biblioteca local?`)) return
      await lib.remove(id)
      setSelectedIds((prev) => prev.filter((x) => x !== id))
      if (activeId === id) setActiveId(null)
    },
    [lib, activeId]
  )

  const deleteSelected = useCallback(async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`¿Eliminar ${selectedIds.length} fotos de la biblioteca local?`)) return
    await lib.remove(selectedIds)
    setSelectedIds([])
  }, [lib, selectedIds])

  const saveAnnotations = useCallback(
    (id, annotations) => lib.updateMeta(id, { annotations }),
    [lib]
  )

  const exportSelection = selectedIds.length
    ? lib.photos.filter((p) => selectedIds.includes(p.id))
    : lib.photos

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-ink-600 bg-ink-800 px-4 py-2.5">
        <Camera size={18} className="text-sky-400" />
        <div>
          <h1 className="text-sm font-semibold text-slate-100">GeoPhoto Studio</h1>
          <p className="text-[10px] text-slate-500">
            Fotos geolocalizadas · mapa · KML/KMZ · anotación vectorial
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {lib.loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          <span className="chip">{lib.photos.length} fotos</span>
          {selectedIds.length > 0 && (
            <button type="button" className="btn btn-danger" onClick={deleteSelected}>
              <Trash2 size={13} /> Eliminar ({selectedIds.length})
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!lib.photos.length}
            onClick={() => setShowKml(true)}
          >
            <Waypoints size={13} /> Exportar KML{selectedIds.length ? ` (${selectedIds.length})` : ''}
          </button>
          <button type="button" className="btn" onClick={() => setShowSettings(true)}>
            <Settings size={13} /> Ajustes
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 flex-col gap-3 overflow-auto border-r border-ink-600 bg-ink-900 p-3 lg:flex">
          <ImportPanel
            onFiles={lib.addFiles}
            onUrls={(urls, opts) => lib.addUrls(urls, { ...opts, corsProxy: settings.corsProxy })}
            corsProxy={settings.corsProxy}
            progress={lib.progress}
            onOpenSettings={() => setShowSettings(true)}
          />
          <DetailsPanel
            photo={activePhoto}
            thumbUrl={activePhoto ? lib.thumbUrls[activePhoto.id] : null}
            compassPoints={settings.compassPoints}
            onUpdateMeta={lib.updateMeta}
            onEdit={setEditorId}
            onPlace={setPlacingId}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-[3] border-b border-ink-600">
            <MapPanel
              photos={lib.photos}
              selectedIds={selectedIds}
              activeId={activeId}
              apiKey={settings.googleMapsApiKey}
              mapType={settings.mapType}
              onMapType={(mapType) => persistSettings({ ...settings, mapType })}
              placingId={placingId}
              onCancelPlacing={() => setPlacingId(null)}
              onSelect={setActiveId}
              onMove={handleMove}
              onPlace={handlePlace}
            />
          </div>
          <div className="min-h-0 flex-[2]">
            <PhotoTable
              photos={lib.photos}
              thumbUrls={lib.thumbUrls}
              selectedIds={selectedIds}
              activeId={activeId}
              compassPoints={settings.compassPoints}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onActivate={setActiveId}
              onEdit={setEditorId}
              onPlace={setPlacingId}
              onDelete={handleDelete}
              onUpdateMeta={lib.updateMeta}
            />
          </div>
        </main>
      </div>

      <SettingsModal
        open={showSettings}
        settings={settings}
        storage={storage}
        onClose={() => setShowSettings(false)}
        onSave={persistSettings}
      />

      <KmlExportModal
        open={showKml}
        photos={exportSelection}
        compassPoints={settings.compassPoints}
        defaultFov={settings.defaultFov}
        onClose={() => setShowKml(false)}
        getFull={lib.getFull}
        getThumb={lib.getThumb}
        getAnnotated={lib.getAnnotated}
      />

      {editorPhoto && (
        <EditorModal
          key={editorPhoto.id}
          photo={editorPhoto}
          settings={settings}
          getFull={lib.getFull}
          onSaveAnnotations={saveAnnotations}
          onSaveAnnotatedRender={lib.saveAnnotatedRender}
          onClose={() => setEditorId(null)}
        />
      )}
    </div>
  )
}
