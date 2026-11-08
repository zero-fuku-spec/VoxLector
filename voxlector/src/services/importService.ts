import { parseDocumentInWorker, type ParseSummary } from '@/services/documentParser'
import type { BookFormat } from '@/types'

export interface SelectedDocumentMetadata {
  name: string
  path: string
  size: number
  type: string
}

const FORMAT_BY_EXTENSION: Record<string, BookFormat> = {
  pdf: 'pdf',
  epub: 'epub',
  txt: 'txt',
  md: 'md',
  docx: 'docx',
  fb2: 'fb2',
  rtf: 'rtf',
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  txt: 'text/plain',
  md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  fb2: 'application/xml',
  rtf: 'application/rtf',
}

export function getSelectedDocumentMetadata(file: File): SelectedDocumentMetadata {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!FORMAT_BY_EXTENSION[extension]) {
    throw new Error('Formato no compatible. Selecciona un archivo PDF, EPUB, TXT, MD, DOCX, FB2 o RTF.')
  }
  return {
    name: file.name,
    path: file.webkitRelativePath || file.name,
    size: file.size,
    type: file.type || MIME_BY_EXTENSION[extension],
  }
}

export function getDocumentFormat(fileName: string): BookFormat {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  const format = FORMAT_BY_EXTENSION[extension]
  if (!format) throw new Error('El tipo del documento seleccionado no es compatible.')
  return format
}

export function parseSelectedDocument(
  file: File,
  bookId: string,
  onProgress: (percent: number, current: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ParseSummary> {
  return parseDocumentInWorker(file, bookId, onProgress, signal)
}
