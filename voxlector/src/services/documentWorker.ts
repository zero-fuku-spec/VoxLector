import { parseDocument, type ParseSummary } from './documentParser'
import { dbService } from './dbService'

interface ParseRequest {
  type: 'parse'
  file: File
  bookId: string
}

type WorkerResponse =
  | { type: 'progress'; percent: number; current: number; total: number }
  | { type: 'result'; result: ParseSummary }
  | { type: 'error'; message: string }

interface DocumentWorkerScope {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
}

const workerScope = self as unknown as DocumentWorkerScope

workerScope.onmessage = async event => {
  if (event.data?.type !== 'parse' || !(event.data.file instanceof File) || typeof event.data.bookId !== 'string') {
    workerScope.postMessage({ type: 'error', message: 'La solicitud de análisis del documento no es válida.' })
    return
  }

  try {
    const result = await parseDocument(event.data.file, (percent, current, total) => {
      workerScope.postMessage({ type: 'progress', percent, current, total })
    })
    // Keep large sentence/page arrays and PDF buffers inside the worker. The
    // IndexedDB structured clone therefore never runs on the WebView UI thread.
    await dbService.saveBookContent(
      event.data.bookId,
      result.sentences,
      result.pages,
      result.sourceData,
    )
    const { characters, totalPages, title, author, format } = result
    workerScope.postMessage({
      type: 'result',
      result: { characters, totalPages, title, author, format },
    })
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
