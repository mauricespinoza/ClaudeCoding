// Estado de la biblioteca de fotos, respaldado en IndexedDB.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deletePhoto as dbDeletePhoto,
  getAllPhotoMeta,
  getBlob,
  putBlob,
  putPhotoMeta,
} from './db'
import { fetchImageBlob, ingestBlob } from './images'

export function usePhotoLibrary() {
  const [photos, setPhotos] = useState([])
  const [thumbUrls, setThumbUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(null) // { done, total, label }
  const urlCache = useRef(new Map())

  const cacheThumb = useCallback(async (id) => {
    if (urlCache.current.has(id)) return urlCache.current.get(id)
    const blob = await getBlob(`${id}:thumb`)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.current.set(id, url)
    return url
  }, [])

  const refreshThumbs = useCallback(
    async (list) => {
      const entries = await Promise.all(
        list.map(async (p) => [p.id, await cacheThumb(p.id)])
      )
      setThumbUrls(Object.fromEntries(entries.filter(([, u]) => u)))
    },
    [cacheThumb]
  )

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const metas = await getAllPhotoMeta()
        metas.sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''))
        if (!alive) return
        setPhotos(metas)
        await refreshThumbs(metas)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [refreshThumbs])

  const addOne = useCallback(
    async (blob, opts) => {
      const { meta, fullBlob, thumbBlob } = await ingestBlob(blob, opts)
      await putBlob(`${meta.id}:full`, fullBlob)
      await putBlob(`${meta.id}:thumb`, thumbBlob)
      await putPhotoMeta(meta)
      const url = URL.createObjectURL(thumbBlob)
      urlCache.current.set(meta.id, url)
      setThumbUrls((prev) => ({ ...prev, [meta.id]: url }))
      setPhotos((prev) => [...prev, meta])
      return meta
    },
    []
  )

  /** Importa archivos locales. Devuelve { added, errors }. */
  const addFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|tiff?|webp)$/i.test(f.name))
      const errors = []
      const added = []
      for (let i = 0; i < files.length; i++) {
        setProgress({ done: i, total: files.length, label: files[i].name })
        try {
          added.push(await addOne(files[i], { name: files[i].name, origin: 'upload' }))
        } catch (err) {
          errors.push(`${files[i].name}: ${err.message}`)
        }
      }
      setProgress(null)
      return { added, errors }
    },
    [addOne]
  )

  /** Importa una lista de URLs remotas (Google Photos u otras). */
  const addUrls = useCallback(
    async (urls, { corsProxy = '', origin = 'url' } = {}) => {
      const errors = []
      const added = []
      for (let i = 0; i < urls.length; i++) {
        setProgress({ done: i, total: urls.length, label: urls[i].slice(-42) })
        try {
          const blob = await fetchImageBlob(urls[i], corsProxy)
          const name = decodeURIComponent(urls[i].split('/').pop().split('?')[0]).slice(0, 60)
          added.push(
            await addOne(blob, { name: name || `foto_${i + 1}.jpg`, origin, sourceUrl: urls[i] })
          )
        } catch (err) {
          errors.push(`${urls[i].slice(-40)}: ${err.message}`)
        }
      }
      setProgress(null)
      return { added, errors }
    },
    [addOne]
  )

  const updateMeta = useCallback(async (id, patch) => {
    let next = null
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        next = { ...p, ...patch }
        return next
      })
    )
    // La persistencia usa el registro más reciente de IndexedDB para no perder campos.
    const metas = await getAllPhotoMeta()
    const current = metas.find((m) => m.id === id)
    if (current) await putPhotoMeta({ ...current, ...patch })
    return next
  }, [])

  const remove = useCallback(async (ids) => {
    const list = Array.isArray(ids) ? ids : [ids]
    for (const id of list) {
      await dbDeletePhoto(id)
      const url = urlCache.current.get(id)
      if (url) URL.revokeObjectURL(url)
      urlCache.current.delete(id)
    }
    setPhotos((prev) => prev.filter((p) => !list.includes(p.id)))
    setThumbUrls((prev) => {
      const next = { ...prev }
      list.forEach((id) => delete next[id])
      return next
    })
  }, [])

  const getFull = useCallback((id) => getBlob(`${id}:full`), [])
  const getThumb = useCallback((id) => getBlob(`${id}:thumb`), [])

  /** Guarda el render anotado (para reutilizarlo en KML/KMZ). */
  const saveAnnotatedRender = useCallback(
    async (id, blob) => {
      await putBlob(`${id}:annotated`, blob)
      await updateMeta(id, { hasAnnotatedRender: true })
    },
    [updateMeta]
  )

  const getAnnotated = useCallback((id) => getBlob(`${id}:annotated`), [])

  return {
    photos,
    thumbUrls,
    loading,
    progress,
    addFiles,
    addUrls,
    updateMeta,
    remove,
    getFull,
    getThumb,
    getAnnotated,
    saveAnnotatedRender,
  }
}
