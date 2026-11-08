import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
import { dbService } from './dbService'

interface CachedPdf {
  document: Promise<PDFDocumentProxy>
  references: number
  cleanupTimer?: ReturnType<typeof setTimeout>
}

const pdfDocuments = new Map<string, CachedPdf>()

export async function acquirePdfDocument(bookId: string): Promise<{
  document: PDFDocumentProxy
  release: () => void
}> {
  let cached = pdfDocuments.get(bookId)
  if (!cached) {
    const entry: CachedPdf = {
      references: 0,
      document: (async () => {
        const source = await dbService.loadPdfSourceData(bookId)
        if (!source) throw new Error('No se encontró el PDF original guardado para este libro.')
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        return pdfjs.getDocument({
          data: new Uint8Array(source.slice(0)),
          useSystemFonts: true,
        }).promise
      })(),
    }
    cached = entry
    pdfDocuments.set(bookId, entry)
    void entry.document.catch(() => {
      if (pdfDocuments.get(bookId) === entry) pdfDocuments.delete(bookId)
    })
  }

  if (cached.cleanupTimer) {
    clearTimeout(cached.cleanupTimer)
    cached.cleanupTimer = undefined
  }
  cached.references++

  try {
    const document = await cached.document
    let released = false
    return {
      document,
      release: () => {
        if (released) return
        released = true
        cached!.references--
        if (cached!.references === 0) {
          cached!.cleanupTimer = setTimeout(() => {
            if (cached!.references !== 0 || pdfDocuments.get(bookId) !== cached) return
            pdfDocuments.delete(bookId)
            void cached!.document.then(pdf => pdf.destroy()).catch(error => {
              console.warn('[VoxLector] No se pudo liberar el PDF de la vista de página:', error)
            })
          }, 30_000)
        }
      },
    }
  } catch (error) {
    cached.references--
    throw error
  }
}
