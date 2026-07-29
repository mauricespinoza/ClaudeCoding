import { useRef, useState } from 'react'
import { AlertTriangle, FolderUp, Link2, Loader2, Upload } from 'lucide-react'
import { isGooglePhotosUrl, listAlbumPhotos, parsePastedUrls, toOriginalUrl } from '../lib/googlePhotos'

export default function ImportPanel({ onFiles, onUrls, corsProxy, progress, onOpenSettings }) {
  const fileRef = useRef(null)
  const folderRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [tab, setTab] = useState('local')
  const [albumUrl, setAlbumUrl] = useState('')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
  }

  const importAlbum = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const urls = await listAlbumPhotos(albumUrl, { corsProxy })
      const originals = urls.map((u) => toOriginalUrl(u, 'd'))
      setMsg({ kind: 'info', text: `${originals.length} fotos encontradas. Descargando…` })
      const { added, errors } = await onUrls(originals, { origin: 'google-photos' })
      setMsg({
        kind: errors.length ? 'warn' : 'ok',
        text: `${added.length} importadas${errors.length ? `, ${errors.length} con error` : ''}.`,
        detail: errors.slice(0, 4).join('\n'),
      })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const importPasted = async () => {
    const urls = parsePastedUrls(pasted).map((u) =>
      /googleusercontent\.com/.test(u) ? toOriginalUrl(u, 'd') : u
    )
    if (!urls.length) {
      setMsg({ kind: 'error', text: 'No se detectaron URLs válidas.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const { added, errors } = await onUrls(urls, { origin: 'url' })
      setMsg({
        kind: errors.length ? 'warn' : 'ok',
        text: `${added.length} importadas${errors.length ? `, ${errors.length} con error` : ''}.`,
        detail: errors.slice(0, 4).join('\n'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-3">
      <div className="mb-3 flex gap-1 text-xs">
        {[
          ['local', 'Desde el PC'],
          ['google', 'Google Photos'],
          ['urls', 'URLs de imágenes'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-2.5 py-1.5 transition ${
              tab === id ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-ink-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'local' && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
            dragging ? 'border-sky-500 bg-sky-950/40' : 'border-ink-500 bg-ink-900/40'
          }`}
        >
          <Upload size={22} className="text-slate-400" />
          <p className="text-xs text-slate-400">
            Arrastra fotos aquí. Se lee el EXIF (GPS, rumbo, focal) al importarlas.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              <Upload size={13} /> Elegir archivos
            </button>
            <button type="button" className="btn" onClick={() => folderRef.current?.click()}>
              <FolderUp size={13} /> Carpeta
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={folderRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={(e) => {
              onFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {tab === 'google' && (
        <div className="space-y-2">
          <label className="label">Enlace del álbum compartido</label>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="https://photos.app.goo.gl/…"
              value={albumUrl}
              onChange={(e) => setAlbumUrl(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary shrink-0"
              disabled={busy || !isGooglePhotosUrl(albumUrl)}
              onClick={importAlbum}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              Importar
            </button>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-700/50 bg-amber-950/40 p-2 text-[11px] leading-relaxed text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              Google Photos no envía cabeceras CORS, así que el navegador no puede leer el álbum
              directamente. Configura un <b>proxy CORS</b> en Ajustes (
              <code>https://tu-proxy/?url={'{url}'}</code>) o usa la pestaña «URLs de imágenes».
              El álbum debe estar compartido como «cualquiera con el enlace».
              {!corsProxy && (
                <button type="button" className="btn btn-ghost ml-1 py-0" onClick={onOpenSettings}>
                  Abrir ajustes
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'urls' && (
        <div className="space-y-2">
          <label className="label">Una URL por línea</label>
          <textarea
            className="input h-24 resize-y font-mono"
            placeholder={'https://lh3.googleusercontent.com/…\nhttps://ejemplo.com/foto.jpg'}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              Las URLs de Google Photos se piden con sufijo <code>=d</code> para conservar el EXIF.
            </p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={importPasted}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              Importar
            </button>
          </div>
        </div>
      )}

      {progress && (
        <div className="mt-2 text-[11px] text-sky-300">
          <Loader2 size={11} className="mr-1 inline animate-spin" />
          {progress.done + 1}/{progress.total} — {progress.label}
        </div>
      )}
      {msg && (
        <div
          className={`mt-2 whitespace-pre-wrap rounded-md px-2 py-1.5 text-[11px] ${
            msg.kind === 'error'
              ? 'bg-rose-950/60 text-rose-200'
              : msg.kind === 'warn'
                ? 'bg-amber-950/60 text-amber-200'
                : 'bg-emerald-950/60 text-emerald-200'
          }`}
        >
          {msg.text}
          {msg.detail ? `\n${msg.detail}` : ''}
        </div>
      )}
    </div>
  )
}
