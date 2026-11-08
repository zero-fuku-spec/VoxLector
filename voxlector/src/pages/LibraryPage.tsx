// ============================================================
// VoxLector AI — Library Page
// 3 View Modes: Large Grid, Compact List, Pure Minimal List
// Drag & drop import, document parser, demo books, settings
// ============================================================

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '@/stores/libraryStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVoiceStore } from '@/stores/voiceStore'
import {
  getDocumentFormat,
  getSelectedDocumentMetadata,
  parseSelectedDocument,
} from '@/services/importService'
import type { Book, LibraryViewMode } from '@/types'
import SettingsModal from '@/components/Modals/SettingsModal'
import BookCard from '@/components/Library/BookCard'
import DemoBooks from '@/components/Library/DemoBooks'
import ExitConfirmationModal from '@/components/Modals/ExitConfirmationModal'
import ReadingSetupModal from '@/components/Modals/ReadingSetupModal'
import PrivacyConsentModal from '@/components/Modals/PrivacyConsentModal'
import type { PrivacyConsentPurpose } from '@/components/Modals/PrivacyConsentModal'
import { App as CapApp } from '@capacitor/app'
import { PermissionsService } from '@/services/PermissionsService'

type LibraryIconName =
  | 'grid'
  | 'list'
  | 'bulleted-list'
  | 'refresh'
  | 'add'
  | 'settings'
  | 'error'
  | 'close'
  | 'library'
  | 'delete'

function LibraryIcon({ name, className = '' }: { name: LibraryIconName; className?: string }) {
  const common = {
    className,
    width: '1em',
    height: '1em',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    focusable: false as const,
  }

  switch (name) {
    case 'grid':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
    case 'list':
      return <svg {...common}><rect x="3" y="4" width="18" height="5" rx="1" /><rect x="3" y="15" width="18" height="5" rx="1" /></svg>
    case 'bulleted-list':
      return <svg {...common}><circle cx="5" cy="6" r="1" fill="currentColor" /><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="5" cy="18" r="1" fill="currentColor" /><path d="M10 6h10M10 12h10M10 18h10" /></svg>
    case 'refresh':
      return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></svg>
    case 'add':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></svg>
    case 'error':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
    case 'close':
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>
    case 'library':
      return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>
    case 'delete':
      return <svg {...common}><path d="M3 6h18M8 6V4h8v2m3 0-.8 14H5.8L5 6m4 4v6m6-6v6" /></svg>
  }
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const { books, addBook, removeBook, setActiveBook, saveBookChanges, pickEmoji, pickColor } = useLibraryStore()
  const { libraryViewMode, setLibraryViewMode } = useSettingsStore()
  const voices = useVoiceStore(state => state.voices)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ percent: number; current: number; total: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [privacyConsent, setPrivacyConsent] = useState<PrivacyConsentPurpose | null>(null)
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null)
  const [pendingImportBookId, setPendingImportBookId] = useState<string | null>(null)
  const [pendingDroppedFile, setPendingDroppedFile] = useState<File | null>(null)
  const [pendingImportMetadata, setPendingImportMetadata] = useState<Book | null>(null)
  const [pendingReadingSetupBook, setPendingReadingSetupBook] = useState<Book | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importStartedRef = useRef(false)
  const registeringImportRef = useRef(false)
  const importAbortControllerRef = useRef<AbortController | null>(null)
  const autoStartedImportIdRef = useRef<string | null>(null)
  const openModeForFile = useCallback((file: File) => {
    if (registeringImportRef.current || importStartedRef.current) return
    registeringImportRef.current = true
    const id = `book_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setPendingImportFile(file)
    setPendingImportBookId(id)
    setPendingImportMetadata(null)
    setImportProgress(null)
    setImportError(null)
    try {
      const sourceMetadata = getSelectedDocumentMetadata(file)
      const idx = useLibraryStore.getState().books.length
      setPendingImportMetadata({
        id,
        title: file.name.replace(/\.[^.]+$/, ''),
        author: 'Desconocido',
        format: getDocumentFormat(file.name),
        emoji: pickEmoji(idx),
        colorGradient: pickColor(idx),
        sentences: [],
        characters: [],
        pages: [],
        totalPages: 0,
        lastSentenceIndex: 0,
        lastPageIndex: 0,
        readingMode: 'narrator',
        voiceAssignments: {},
        narratorVoiceId: 'narrator_default',
        sourceMetadata,
        importStatus: 'pending',
        addedAt: Date.now(),
      })
    } catch (error) {
      console.error('[VoxLector] No se pudieron registrar los metadatos del documento:', error)
      setPendingImportBookId(null)
      setPendingImportFile(null)
      setImportError(`No se pudo registrar el documento. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      registeringImportRef.current = false
    }
  }, [pickEmoji, pickColor])

  const requestDocumentImport = useCallback(() => {
    setPermissionError(null)
    try {
      if (PermissionsService.hasRequestedStoragePermission()) {
        fileInputRef.current?.click()
      } else {
        setPrivacyConsent('document')
      }
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : String(error))
      setPrivacyConsent('document')
    }
  }, [])

  // Hardware Back Button on Library Home
  useEffect(() => {
    let sub: any = null
    const initBackButton = async () => {
      sub = await CapApp.addListener('backButton', () => {
        if (importing) {
          importAbortControllerRef.current?.abort()
          return
        }
        if (pendingImportFile) {
          setPendingImportFile(null)
          setPendingImportBookId(null)
          setPendingImportMetadata(null)
          return
        }
        if (pendingReadingSetupBook) {
          setPendingReadingSetupBook(null)
          return
        }
        if (settingsOpen) {
          setSettingsOpen(false)
          return
        }
        if (showExitModal) {
          setShowExitModal(false)
          return
        }
        setShowExitModal(true)
      })
    }
    initBackButton()
    return () => {
      if (sub) sub.remove()
    }
  }, [settingsOpen, showExitModal, importing, pendingImportFile, pendingImportBookId, pendingReadingSetupBook])

  const handleImport = useCallback(async (
    file: File,
    bookId: string,
  ) => {
    if (importStartedRef.current) return
    importStartedRef.current = true
    const controller = new AbortController()
    importAbortControllerRef.current = controller
    setImporting(true)
    setImportError(null)
    setImportProgress({ percent: 0, current: 0, total: 100 })
    try {
      const result = await parseSelectedDocument(file, bookId, (percent, current, total) => {
        setImportProgress({ percent, current, total })
      }, controller.signal)

      const existingBook = pendingImportMetadata?.id === bookId
        ? pendingImportMetadata
        : useLibraryStore.getState().books.find(book => book.id === bookId)
      if (!existingBook) {
        throw new Error('No se encontró el registro preliminar del documento.')
      }
      const book: Omit<Book, 'addedAt'> = {
        id: bookId,
        title: result.title,
        author: result.author,
        format: result.format,
        emoji: existingBook.emoji,
        colorGradient: existingBook.colorGradient,
        // Heavy content stays in IndexedDB from the Worker; only metadata is
        // passed back through React state on the WebView main thread.
        sentences: [],
        characters: result.characters,
        pages: [],
        totalPages: result.totalPages,
        lastSentenceIndex: 0,
        lastPageIndex: 0,
        readingMode: 'narrator',
        voiceAssignments: {},
        narratorVoiceId: 'narrator_default',
        sourceMetadata: existingBook.sourceMetadata,
        importStatus: 'ready',
      }
      await addBook(book)
      const importedBook = useLibraryStore.getState().books.find(candidate => candidate.id === bookId)
      if (!importedBook) throw new Error('El libro se guardó, pero no aparece en la biblioteca local.')
      setPendingImportFile(null)
      setPendingImportBookId(null)
      setPendingImportMetadata(null)
      setPendingReadingSetupBook(importedBook)
    } catch (err) {
      console.error('[VoxLector] Falló la importación del documento:', err)
      const cancelled = err instanceof DOMException && err.name === 'AbortError'
      setImportError(cancelled
        ? 'Importación cancelada. Puedes volver a intentarlo.'
        : `No se pudo importar el documento. ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
      setImportProgress(null)
      importStartedRef.current = false
      importAbortControllerRef.current = null
    }
  }, [addBook, pendingImportMetadata])

  const handleReadingSetupConfirm = useCallback(async (
    setup: Pick<Book, 'readingMode' | 'narratorVoiceId' | 'voiceAssignments' | 'characters'>,
  ) => {
    if (!pendingReadingSetupBook) return
    const setupBookId = pendingReadingSetupBook.id
    await saveBookChanges(setupBookId, setup)
    setActiveBook(setupBookId)
    setPendingReadingSetupBook(null)
    requestAnimationFrame(() => navigate(`/reader/${setupBookId}`))
  }, [pendingReadingSetupBook, saveBookChanges, setActiveBook, navigate])

  useEffect(() => {
    if (!pendingImportFile || !pendingImportBookId || !pendingImportMetadata || importing) return
    if (autoStartedImportIdRef.current === pendingImportBookId) return
    autoStartedImportIdRef.current = pendingImportBookId
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        void handleImport(pendingImportFile, pendingImportBookId)
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      if (secondFrame) cancelAnimationFrame(secondFrame)
    }
  }, [pendingImportFile, pendingImportBookId, pendingImportMetadata, importing, handleImport])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    openModeForFile(file)
    e.target.value = ''
  }, [openModeForFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      try {
        if (PermissionsService.hasRequestedStoragePermission()) {
          void openModeForFile(file)
        } else {
          setPendingDroppedFile(file)
          setPermissionError(null)
          setPrivacyConsent('document')
        }
      } catch (error) {
        setPendingDroppedFile(file)
        setPermissionError(error instanceof Error ? error.message : String(error))
        setPrivacyConsent('document')
      }
    }
  }, [openModeForFile])

  const handleDocumentConsent = useCallback(() => {
    try {
      PermissionsService.markStoragePermissionRequested()
      setPermissionError(null)
      setPrivacyConsent(null)
      if (pendingDroppedFile) {
        void openModeForFile(pendingDroppedFile)
        setPendingDroppedFile(null)
        return
      }
      fileInputRef.current?.click()
    } catch (error) {
      console.error('[VoxLector] No se pudo aceptar el consentimiento de documentos:', error)
      setPermissionError(error instanceof Error ? error.message : String(error))
    }
  }, [pendingDroppedFile, openModeForFile])

  const cancelDocumentConsent = useCallback(() => {
    try {
      PermissionsService.markStoragePermissionRequested()
      setPermissionError(null)
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : String(error))
      return
    }
    setPrivacyConsent(null)
    setPendingDroppedFile(null)
  }, [])

  const handleOpenBook = useCallback((book: Book) => {
    setActiveBook(book.id)
    setImportError(null)
    navigate(`/reader/${book.id}`)
  }, [setActiveBook, navigate])

  return (
    <div
      className="flex flex-col min-h-screen select-none"
      style={{ background: 'var(--bg-primary)' }}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* ─── Top Bar ─── */}
      <header
        className="glass sticky top-0 z-40 flex w-full flex-nowrap items-center justify-between gap-2 overflow-hidden border-b px-2 py-3.5 sm:px-6"
        style={{ borderColor: 'var(--border-color)', background: 'var(--bg-glass)' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <span
            aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl font-black text-white shadow-lg sm:h-10 sm:w-10"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))' }}
          >
            V
          </span>
            <h1 className="min-w-0 truncate text-base font-black tracking-tight sm:text-xl">
            VoxLector <span style={{ color: 'var(--accent)' }}>AI</span>
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Quick View Mode Toggle */}
            <div className="flex shrink-0 items-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-0.5">
            {[
                { id: 'grid_large', icon: 'grid', title: 'Cuadros Grandes' },
                { id: 'list_compact', icon: 'list', title: 'Lista Compacta' },
                { id: 'list_pure', icon: 'bulleted-list', title: 'Lista Pura' },
            ].map(m => (
              <button
                key={m.id}
                  type="button"
                  onClick={() => setLibraryViewMode(m.id as LibraryViewMode)}
                  aria-label={m.title}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors sm:h-9 sm:w-9 ${
                    libraryViewMode === m.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                  title={m.title}
                >
                  <LibraryIcon name={m.icon as LibraryIconName} className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                </button>
              ))}
          </div>

          {/* Import Button */}
          <button
            onClick={requestDocumentImport}
            className="btn-icon !h-9 !w-9 shrink-0 sm:!h-[42px] sm:!w-[42px]"
            title="Importar libro (PDF, EPUB, TXT, DOCX, FB2)"
            disabled={importing}
          >
            {importing ? (
              <LibraryIcon name="refresh" className="h-5 w-5 animate-spin text-[var(--accent)]" />
            ) : (
              <LibraryIcon name="add" className="h-5 w-5" />
            )}
          </button>

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="btn-icon !h-9 !w-9 shrink-0 sm:!h-[42px] sm:!w-[42px]"
            title="Configuración y Personalización"
          >
            <LibraryIcon name="settings" className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* Import Progress Notification */}
        {importing && importProgress && (
          <div
            className="mb-5 p-4 rounded-2xl border flex flex-col gap-2 animate-fade-in-up"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--accent)',
              boxShadow: '0 0 20px var(--accent-glow)',
            }}
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-2 text-[var(--accent)]">
                <LibraryIcon name="refresh" className="h-4 w-4 animate-spin" />
                <span role="status">
                  Procesando el documento en segundo plano...
                </span>
              </span>
              <span className="font-mono text-white">
                Pág. {importProgress.current} de {importProgress.total} ({importProgress.percent}%)
              </span>
              <button
                type="button"
                onClick={() => importAbortControllerRef.current?.abort()}
                className="rounded-lg px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"
              >
                Cancelar
              </button>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--bg-input)] overflow-hidden">
              <div
                className="h-full progress-gradient transition-all duration-200"
                style={{ width: `${importProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {importError && (
          <div
            className="mb-4 flex items-center gap-3 p-3.5 rounded-2xl border"
            style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'var(--danger)', color: 'var(--danger)' }}
          >
            <LibraryIcon name="error" className="h-5 w-5 shrink-0" />
            <span className="text-xs font-semibold">{importError}</span>
            {pendingImportFile && pendingImportBookId && !importing && pendingImportMetadata && (
              <button
                type="button"
                className="ml-auto rounded-lg border border-[var(--danger)] px-3 py-1.5 text-xs font-bold"
                onClick={() => void handleImport(pendingImportFile, pendingImportBookId)}
              >
                Reintentar
              </button>
            )}
            <button className="ml-auto" onClick={() => setImportError(null)}>
              <LibraryIcon name="close" className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Empty library */}
        {books.length === 0 && !importing && (
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] px-5 py-8 text-center shadow-xl sm:px-10 sm:py-10">
            <div
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black text-white"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))' }}
            >
              V
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-black text-[var(--text-primary)]">Tu próxima lectura empieza aquí</h2>
              <p className="max-w-md text-sm text-[var(--text-secondary)]">
                Importa un libro desde tu dispositivo o comienza con Alicia en el País de las Maravillas.
              </p>
            </div>
            <button
              type="button"
              onClick={requestDocumentImport}
              className="min-h-12 w-full max-w-sm rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-lg transition-transform active:scale-[0.98] sm:w-auto"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))' }}
            >
              Importar un libro
            </button>
          </div>
        )}

        {/* Books List / Grid */}
        {books.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <LibraryIcon name="library" className="h-5 w-5 text-[var(--accent)]" />
                  Mi Biblioteca
                </h2>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[var(--accent-glow)] text-[var(--accent)]">
                  {books.length} {books.length === 1 ? 'libro' : 'libros'}
                </span>
              </div>
            </div>

            {/* 1. Large Grid View */}
            {libraryViewMode === 'grid_large' && (
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {books.map((book, i) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    animDelay={i * 40}
                    onOpen={() => handleOpenBook(book)}
                    onDelete={() => removeBook(book.id)}
                  />
                ))}
              </div>
            )}

            {/* 2. Compact List View */}
            {libraryViewMode === 'list_compact' && (
              <div className="flex flex-col gap-2.5">
                {books.map((book) => {
                  const progress = book.sentences.length > 0
                    ? Math.round((book.lastSentenceIndex / Math.max(1, book.sentences.length)) * 100)
                    : 0

                  return (
                    <div
                      key={book.id}
                      onClick={() => handleOpenBook(book)}
                      className="p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent)] flex items-center justify-between gap-3 cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="relative w-12 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 shadow overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${book.colorGradient[0]}, ${book.colorGradient[1]})` }}
                        >
                          {book.coverImage
                            ? <img src={book.coverImage} alt={`Portada de ${book.title}`} className="absolute inset-0 h-full w-full object-cover" />
                            : book.emoji}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-white truncate">{book.title}</h3>
                          <span className="text-[0.68rem] text-[var(--text-secondary)] block truncate">
                            {book.author} · {book.totalPages} páginas
                          </span>
                          <span className="text-[0.62rem] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--accent)]">
                            {book.format}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-mono font-bold text-[var(--accent)]">
                            {progress}%
                          </span>
                          <div className="w-16 h-1.5 rounded-full bg-[var(--bg-input)] overflow-hidden mt-1">
                            <div className="h-full progress-gradient" style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`¿Eliminar "${book.title}"?`)) removeBook(book.id)
                          }}
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-input)]"
                        >
                          <LibraryIcon name="delete" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 3. Pure List View */}
            {libraryViewMode === 'list_pure' && (
              <div className="flex flex-col divide-y divide-[var(--border-color)] bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
                {books.map((book) => {
                  const progress = book.sentences.length > 0
                    ? Math.round((book.lastSentenceIndex / Math.max(1, book.sentences.length)) * 100)
                    : 0

                  return (
                    <div
                      key={book.id}
                      onClick={() => handleOpenBook(book)}
                      className="px-4 py-3 flex items-center justify-between hover:bg-[var(--highlight-bg)] cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-3">
                        {book.coverImage
                          ? <img src={book.coverImage} alt="" className="h-9 w-7 flex-shrink-0 rounded object-cover" />
                          : <span className="text-base">{book.emoji}</span>}
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white block truncate">{book.title}</span>
                          <span className="text-[0.65rem] text-[var(--text-muted)]">
                            {book.format.toUpperCase()} · Pág. {book.lastPageIndex + 1} / {book.totalPages}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs font-mono font-black text-[var(--accent)]">
                          {progress}% leído
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`¿Eliminar "${book.title}"?`)) removeBook(book.id)
                          }}
                          className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                        >
                          <LibraryIcon name="delete" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Demo Books */}
        <DemoBooks onOpen={handleOpenBook} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.epub,.txt,.md,.docx,.fb2,.rtf"
        hidden
        onChange={handleFileChange}
      />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {privacyConsent === 'document' && (
        <PrivacyConsentModal
          purpose="document"
          error={permissionError}
          onConfirm={handleDocumentConsent}
          onCancel={cancelDocumentConsent}
        />
      )}
      {pendingReadingSetupBook && (
        <ReadingSetupModal
          book={pendingReadingSetupBook}
          voices={voices}
          onCancel={() => {
            setPendingReadingSetupBook(null)
          }}
          onConfirm={handleReadingSetupConfirm}
        />
      )}
      {/* Friendly Exit Prompt on Library Screen */}
      {showExitModal && (
        <ExitConfirmationModal
          isOpen={showExitModal}
          onContinueReading={() => setShowExitModal(false)}
          onExit={async () => {
            setShowExitModal(false)
            await CapApp.exitApp()
          }}
        />
      )}
    </div>
  )
}
