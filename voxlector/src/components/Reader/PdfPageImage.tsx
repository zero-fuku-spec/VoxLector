import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api'
import { acquirePdfDocument } from '@/services/pdfPageRenderer'

interface PdfPageImageProps {
  bookId: string
  pageNumber: number
}

export default function PdfPageImage({ bookId, pageNumber }: PdfPageImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    let releaseDocument: (() => void) | undefined
    let renderTask: ReturnType<PDFPageProxy['render']> | undefined
    let page: PDFPageProxy | undefined

    void (async () => {
      try {
        const acquired = await acquirePdfDocument(bookId)
        releaseDocument = acquired.release
        if (cancelled) return
        page = await acquired.document.getPage(pageNumber)
        if (cancelled) return
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(1.5, 1200 / baseViewport.width)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        const context = canvas?.getContext('2d')
        if (!canvas || !context) throw new Error('No se pudo crear el área de imagen de la página.')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        renderTask = page.render({ canvasContext: context, viewport })
        await renderTask.promise
        if (!cancelled) setLoaded(true)
      } catch (cause) {
        if (!cancelled) {
          console.error(`[VoxLector] No se pudo mostrar la imagen de la página ${pageNumber}:`, cause)
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        page?.cleanup()
        releaseDocument?.()
      }
    })()

    return () => {
      cancelled = true
      renderTask?.cancel()
      releaseDocument?.()
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }, [bookId, pageNumber])

  return (
    <div className="w-full">
      {error ? (
        <p role="alert" className="rounded-lg border border-[var(--border-color)] p-3 text-sm text-[var(--text-secondary)]">
          No se pudo cargar la imagen original: {error}
        </p>
      ) : (
        <>
          {!loaded && <p className="p-3 text-center text-sm text-[var(--text-secondary)]">Cargando página original…</p>}
          <canvas
            ref={canvasRef}
            aria-label={`Imagen original de la página ${pageNumber}`}
            className={`mx-auto h-auto max-w-full rounded-lg shadow-lg ${loaded ? 'block' : 'hidden'}`}
          />
        </>
      )}
    </div>
  )
}
