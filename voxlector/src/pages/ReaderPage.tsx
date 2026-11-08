// ============================================================
// VoxLector AI — Reader Page
// Continuous smooth document scroll (ReadEra style), true persistent
// text highlighting (marker pen style), word-by-word karaoke trail,
// long-press context menu, -15s/+15s seek, and multi-voice execution
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react'
import './reader.css'
import { useParams, useNavigate } from 'react-router-dom'
import { useLibraryStore } from '@/stores/libraryStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { preloadNativeSpeech, speakText, stopSpeaking, updateSpeakingRate } from '@/services/ttsService'
import { DialogueParser } from '@/services/tts/dialogueParser'
import { AudioScriptBuilder } from '@/services/tts/audioScriptBuilder'
import { MissingScriptVoiceError, ScriptCancelledError, ScriptRenderer } from '@/services/tts/scriptRenderer'
import { ProsodyEngine } from '@/services/ProsodyEngine'
import type { ScriptTextInstruction } from '@/services/tts/audioScriptTypes'
import type { ParsedSentence } from '@/types'
import VoiceStudioModal from '@/components/Modals/VoiceStudioModal'
import CharacterBoardModal from '@/components/Modals/CharacterBoardModal'
import SettingsModal from '@/components/Modals/SettingsModal'
import FloatingVoiceMenu from '@/components/Reader/FloatingVoiceMenu'
import SleepTimerModal from '@/components/Modals/SleepTimerModal'
import UnregisteredCharacterModal from '@/components/Modals/UnregisteredCharacterModal'
import NotesDrawer from '@/components/Reader/NotesDrawer'
import PlayerBar from '@/components/Reader/PlayerBar'
import ExitConfirmationModal from '@/components/Modals/ExitConfirmationModal'
import { App as CapApp } from '@capacitor/app'
import { audioEngine } from '@/services/audioEngine'
import { dbService } from '@/services/dbService'
import { filterPdfExtractionArtifacts, hasPdfTextEncodingErrors, isPdfNumericArtifactText } from '@/services/pdfTextUtils'

function getDialogueAnnouncement(character: string, emotion?: string, parserAnnouncement?: string): string {
  const toneByEmotion: Record<string, string> = {
    triste: 'con voz triste',
    alegre: 'con voz alegre',
    nervioso: 'con voz nerviosa',
    riendo: 'riendo',
    sollozando: 'llorando',
    miedo: 'con voz temblorosa',
    tartamudeando: 'con voz entrecortada',
    tembloroso: 'con voz temblorosa',
    enojado: 'con voz enojada',
    susurro: 'en un susurro',
    jadeando: 'jadeando',
    dolor: 'con dolor',
    sorpresa: 'con sorpresa',
    suspiro: 'suspirando',
    épico: 'con tono épico',
    misterioso: 'con tono misterioso',
  }
  const tone = emotion ? toneByEmotion[emotion.toLocaleLowerCase('es')] : undefined
  const cue = parserAnnouncement?.split(':').slice(1).join(':').trim()
  const spokenCue = cue?.replace(/[.!?…]+$/u, '').trim()
  const description = spokenCue || tone
  return description ? `${character}. ${description}.` : `${character}.`
}

function isPdfNumericArtifactPage(sentences: ParsedSentence[]): boolean {
  const texts = sentences.map(sentence => sentence.text.trim()).filter(Boolean)
  if (texts.length === 0) return false
  if (!texts.every(isPdfNumericArtifactText)) return false
  const numericTokens = texts.flatMap(text => text.match(/\d{1,5}/gu) ?? [])
  return numericTokens.length >= 2
}

function mapDisplayWordsToSpeech(displayText: string, speechText: string): Array<number | undefined> {
  const displayTokens = displayText.match(/\s+|[^\s]+/gu) ?? []
  const speechWords = speechText.match(/\S+/gu) ?? []
  const normalizeWord = (word: string) => word
    .replace(/\([^)]*\)|\[[^\]]*\]/gu, '')
    .replace(/[^\p{L}\p{N}'’]/gu, '')
    .toLocaleLowerCase('es')
  let speechIndex = 0
  return displayTokens.map(token => {
    if (/^\s+$/u.test(token)) return undefined
    const word = normalizeWord(token)
    if (!word) return undefined
    for (let index = speechIndex; index < speechWords.length; index++) {
      if (normalizeWord(speechWords[index]) === word) {
        speechIndex = index + 1
        return index
      }
    }
    return undefined
  })
}

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()

  const { books, savePosition, assignVoice, setNarratorVoice } = useLibraryStore()
  const {
    isPlaying, isPaused, currentSentenceIndex, currentPageIndex, speed, sleepTimerEndAt,
    play, pause, resume, stop, seekToSentence, setCurrentPage, setSpeed, setSleepTimer,
  } = usePlayerStore()
  const speedRef = useRef(speed)
  speedRef.current = speed

  const { getVoiceById, flush: flushVoiceProfiles } = useVoiceStore()
  const {
    cloudProvider, apiKeys, fontSize, lineHeight, textAlign, readerPadding,
    backgroundImage, backgroundOpacity, announceCharacterDialogue,
  } = useSettingsStore()

  const { addHighlight, addNote, removeAnnotation, getAnnotationsForBook } = useAnnotationStore()

  const bookMetadata = bookId ? books.find(b => b.id === bookId) : undefined
  const [loadedBookContent, setLoadedBookContent] = useState<{
    bookId: string;
    sentences: ParsedSentence[];
    pages: number[][];
  } | null>(null)
  const [bookContentLoadError, setBookContentLoadError] = useState<string | null>(null)
  const book = bookMetadata && bookMetadata.sentences.length > 0
    ? bookMetadata
    : bookMetadata && loadedBookContent?.bookId === bookMetadata.id
      ? {
          ...bookMetadata,
          sentences: loadedBookContent.sentences,
          pages: loadedBookContent.pages.length > 0 ? loadedBookContent.pages : bookMetadata.pages,
          totalPages: loadedBookContent.pages.length || bookMetadata.totalPages,
      }
      : undefined
  const readerContentReady = Boolean(bookMetadata && (
    bookMetadata.sentences.length > 0 ||
    (loadedBookContent?.bookId === bookMetadata.id && loadedBookContent.sentences.length > 0) ||
    (bookMetadata.format === 'pdf' && loadedBookContent?.bookId === bookMetadata.id && loadedBookContent.pages.length > 0)
  ))
  const annotations = bookId ? getAnnotationsForBook(bookId) : []
  const annotationsBySentence = React.useMemo(
    () => {
      const bySentence = new Map<number, typeof annotations[number]>()
      for (const annotation of annotations) {
        if (!bySentence.has(annotation.sentenceIndex)) {
          bySentence.set(annotation.sentenceIndex, annotation)
        }
      }
      return bySentence
    },
    [annotations],
  )

  // Word-by-word karaoke tracking
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1)
  const currentWordIndexRef = useRef(-1)
  const dialogueParserRef = useRef(new DialogueParser())
  const prosodyEngineRef = useRef(new ProsodyEngine())
  const audioScriptBuilderRef = useRef(new AudioScriptBuilder())
  const scriptRendererRef = useRef(new ScriptRenderer())
  const lastAnnouncedDialogueRef = useRef<{
    speaker: string
    sentenceIndex: number
    emotion?: string
    announcement?: string
  } | null>(null)

  useEffect(() => {
    dialogueParserRef.current.reset()
    prosodyEngineRef.current.reset()
    lastAnnouncedDialogueRef.current = null
  }, [book?.id])

  // Modals
  const [showCharBoard, setShowCharBoard] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSleepTimer, setShowSleepTimer] = useState(false)
  const [showFloatingVoice, setShowFloatingVoice] = useState(false)
  const [showNotesDrawer, setShowNotesDrawer] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [showVoiceStudio, setShowVoiceStudio] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [showReaderHeader, setShowReaderHeader] = useState(true)
  const [virtualPageRange, setVirtualPageRange] = useState<[number, number]>([0, 8])
  const [mountedReaderBookId, setMountedReaderBookId] = useState<string | null>(null)
  const [readerIsForeground, setReaderIsForeground] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'visible',
  )
  const [timerNow, setTimerNow] = useState(Date.now())
  const [sleepTimerStartedAt, setSleepTimerStartedAt] = useState<number | null>(null)

  // Voice Studio Target
  const [studioTargetVoiceId, setStudioTargetVoiceId] = useState<string | null>(null)
  const [studioTargetCharName, setStudioTargetCharName] = useState<string | null>(null)
  const [studioAssignsNewNarrator, setStudioAssignsNewNarrator] = useState(false)

  // Unregistered Character Neon Modal
  const [unregisteredChar, setUnregisteredChar] = useState<string | null>(null)

  // Long-press Context Action (>= 500ms)
  const [contextAction, setContextAction] = useState<{
    sentenceIndex: number;
    text: string;
    existingAnnotationId?: string;
  } | null>(null)

  const [noteInputText, setNoteInputText] = useState('')
  const [showAddNoteInput, setShowAddNoteInput] = useState(false)

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isPointerDownRef = useRef(false)
  const longPressTriggeredRef = useRef(false)
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null)
  const readerScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  const previousScrollTopRef = useRef(0)
  const currentPageIndexRef = useRef(currentPageIndex)
  currentPageIndexRef.current = currentPageIndex
  const playbackRunIdRef = useRef(0)
  const cancelActivePlayback = useCallback(() => {
    playbackRunIdRef.current++
    stop()
  }, [stop])
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const centerTapHandledAtRef = useRef(0)
  const lastCenterTouchAtRef = useRef(0)
  const ignoreCenterClickRef = useRef(false)
  const isProgrammaticNavigationRef = useRef(false)
  const programmaticNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setProgrammaticNavigation = useCallback((durationMs = 1000) => {
    isProgrammaticNavigationRef.current = true
    if (programmaticNavTimerRef.current) {
      clearTimeout(programmaticNavTimerRef.current)
    }
    programmaticNavTimerRef.current = setTimeout(() => {
      isProgrammaticNavigationRef.current = false
      programmaticNavTimerRef.current = null
    }, durationMs)
  }, [])

  const readerPageCount = book
    ? book.format === 'pdf'
      ? Math.max(book.pages.length, book.totalPages)
      : book.pages.length
    : 0

  // Problema de duplicados: cada frase solo puede pertenecer a una página renderizada.
  const pageSentenceIndices = React.useMemo(() => {
    if (!book) return []
    const seen = new Set<number>()
    return book.pages.map(indices => indices.filter(index => {
      if (!book.sentences[index] || seen.has(index)) return false
      seen.add(index)
      return true
    }))
  }, [book?.pages, book?.sentences])

  useEffect(() => {
    if (!book || !readerContentReady) {
      setMountedReaderBookId(null)
      return
    }
    // Problema C: deja montar el contenedor antes de insertar el texto del documento.
    const frame = requestAnimationFrame(() => setMountedReaderBookId(book.id))
    return () => cancelAnimationFrame(frame)
  }, [book?.id, readerContentReady])

  useEffect(() => {
    const updateVisibility = () => {
      setReaderIsForeground(document.visibilityState === 'visible')
      setTimerNow(Date.now())
    }
    document.addEventListener('visibilitychange', updateVisibility)
    let cancelled = false
    let appStateSubscription: { remove: () => Promise<void> } | undefined
    void CapApp.addListener('appStateChange', state => {
      setReaderIsForeground(state.isActive && document.visibilityState === 'visible')
      setTimerNow(Date.now())
    }).then(subscription => {
      if (cancelled) void subscription.remove()
      else appStateSubscription = subscription
    }).catch(error => {
      console.warn('[VoxLector] No se pudo observar el estado de la aplicación:', error)
    })

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', updateVisibility)
      if (appStateSubscription) void appStateSubscription.remove()
    }
  }, [])

  useEffect(() => {
    if (!sleepTimerEndAt) {
      setSleepTimerStartedAt(null)
      try {
        localStorage.removeItem('voxlector.sleepTimerStartedAt')
      } catch (error) {
        console.warn('[VoxLector] No se pudo limpiar el inicio del temporizador:', error)
      }
      return
    }
    try {
      const storedStartAt = Number(localStorage.getItem('voxlector.sleepTimerStartedAt'))
      setSleepTimerStartedAt(
        Number.isFinite(storedStartAt) && storedStartAt > 0 && storedStartAt < sleepTimerEndAt
          ? storedStartAt
          : timerNow,
      )
    } catch (error) {
      console.warn('[VoxLector] No se pudo leer el inicio del temporizador:', error)
      setSleepTimerStartedAt(timerNow)
    }
  }, [sleepTimerEndAt])

  useEffect(() => {
    if (!sleepTimerEndAt) return
    let handled = false
    const updateTimer = () => {
      const now = Date.now()
      setTimerNow(now)
      if (!handled && now >= sleepTimerEndAt) {
        handled = true
        cancelActivePlayback()
        setSleepTimer(null)
      }
    }
    updateTimer()
    const timer = window.setInterval(updateTimer, 1000)
    return () => window.clearInterval(timer)
  }, [sleepTimerEndAt, cancelActivePlayback, setSleepTimer])

  // Problema B: estima el desplazamiento usando la escala tipográfica del texto PDF.
  const pageOffsets = React.useMemo(() => {
    if (!book) return [0]
    const width = Math.max(280, window.innerWidth - (readerPadding === 'spacious' ? 96 : 48))
    const offsets = [0]
    for (let pageIndex = 0; pageIndex < readerPageCount; pageIndex++) {
      const indices = pageSentenceIndices[pageIndex] ?? []
      const textLength = indices.reduce((sum, index) => sum + (book.sentences[index]?.text.length ?? 0), 0)
      const pageFontScale = book.format === 'pdf'
        ? indices.reduce((scale, index) => Math.max(scale, book.sentences[index]?.pdfFontScale ?? 1), 1)
        : 1
      const effectiveFontSize = fontSize * pageFontScale
      const charsPerLine = Math.max(24, Math.floor(width / (effectiveFontSize * 0.55)))
      const paragraphs = indices.reduce((sum, index) =>
        sum + (book.sentences[index]?.isParagraphStart ? 1 : 0), 0)
      const estimatedHeight = Math.max(
        effectiveFontSize * lineHeight * 2,
        Math.ceil(textLength / charsPerLine) * effectiveFontSize * lineHeight + paragraphs * effectiveFontSize * lineHeight + 80,
      )
      offsets.push(offsets[offsets.length - 1] + estimatedHeight)
    }
    return offsets
  }, [pageSentenceIndices, book?.sentences, book?.format, readerPageCount, fontSize, lineHeight, readerPadding])
  const sentencePages = React.useMemo(() => {
    if (!book) return []
    const mapping = new Array<number>(book.sentences.length)
    pageSentenceIndices.forEach((indices, pageIndex) => {
      indices.forEach(sentenceIndex => { mapping[sentenceIndex] = pageIndex })
    })
    return mapping
  }, [pageSentenceIndices, book?.sentences.length])
  const virtualPageRangeRef = useRef(virtualPageRange)
  virtualPageRangeRef.current = virtualPageRange

  const jumpToPage = useCallback((pageIndex: number) => {
    if (!book) return
    if (pageIndex < 0 || pageIndex >= readerPageCount) return
    setProgrammaticNavigation(1200)
    setCurrentPage(pageIndex)
    setVirtualPageRange([Math.max(0, pageIndex - 3), Math.min(readerPageCount, pageIndex + 6)])
    const container = readerScrollContainerRef.current
    if (container) {
      requestAnimationFrame(() => {
        const pageElement = document.getElementById(`page-block-${pageIndex}`)
        if (pageElement) pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        else container.scrollTo({ top: pageOffsets[pageIndex] ?? 0, behavior: 'smooth' })
      })
    }
  }, [book, pageOffsets, readerPageCount, setCurrentPage, setProgrammaticNavigation])

  const previewPage = useCallback((pageIndex: number) => {
    if (!book) return
    if (pageIndex < 0 || pageIndex >= readerPageCount) return
    setProgrammaticNavigation(800)
    setCurrentPage(pageIndex)
    setVirtualPageRange([Math.max(0, pageIndex - 3), Math.min(readerPageCount, pageIndex + 7)])
    const container = readerScrollContainerRef.current
    if (container) {
      requestAnimationFrame(() => {
        const pageElement = document.getElementById(`page-block-${pageIndex}`)
        if (pageElement) pageElement.scrollIntoView({ behavior: 'auto', block: 'start' })
        else container.scrollTo({ top: pageOffsets[pageIndex] ?? 0, behavior: 'auto' })
      })
    }
  }, [book, pageOffsets, readerPageCount, setCurrentPage, setProgrammaticNavigation])

  const findSentenceForPage = useCallback((pageIndex: number): number | undefined => {
    if (!book) return undefined
    const sentenceOnPage = book.pages[pageIndex]?.find(index => Boolean(book.sentences[index]))
    if (sentenceOnPage !== undefined) return sentenceOnPage

    const taggedSentences = book.sentences.filter(sentence => sentence.pageNumber !== undefined)
    const onExactPdfPage = taggedSentences.find(sentence => sentence.pageNumber === pageIndex + 1)
    if (onExactPdfPage) return onExactPdfPage.index

    const followingSentence = taggedSentences.find(sentence => sentence.pageNumber! > pageIndex + 1)
    if (followingSentence) return followingSentence.index
    return taggedSentences[taggedSentences.length - 1]?.index
  }, [book])

  // Restore the saved reading position after the document content is loaded.
  useEffect(() => {
    if (!book) return
    const pageToScroll = readerPageCount > 0
      ? Math.min(readerPageCount - 1, Math.max(0, book.lastPageIndex || 0))
      : 0
    setCurrentPage(pageToScroll)
    setTimeout(() => jumpToPage(pageToScroll), 200)
  }, [book?.id, readerPageCount])

  useEffect(() => {
    if (!bookMetadata) {
      setLoadedBookContent(null)
      setBookContentLoadError(null)
      return
    }
    if (bookMetadata.sentences.length > 0) {
      setBookContentLoadError(null)
      setLoadedBookContent({
        bookId: bookMetadata.id,
        sentences: bookMetadata.sentences,
        pages: bookMetadata.pages,
      })
      return
    }
    let cancelled = false
    setBookContentLoadError(null)
    void dbService.loadBookContent(bookMetadata.id).then(content => {
      if (cancelled) return
      const imageOnlyPdf = bookMetadata.format === 'pdf' && Boolean(content?.pages.length)
      if (!content || (content.sentences.length === 0 && !imageOnlyPdf)) {
        setLoadedBookContent({ bookId: bookMetadata.id, sentences: [], pages: [] })
        setBookContentLoadError('El almacenamiento no devolvió el contenido del documento.')
        return
      }
      setBookContentLoadError(null)
      setLoadedBookContent({
        bookId: bookMetadata.id,
        sentences: content.sentences,
        pages: content.pages,
      })
    }).catch(error => {
      if (!cancelled) {
        console.error('[VoxLector] No se pudo cargar el contenido del libro:', error)
        setBookContentLoadError(error instanceof Error ? error.message : String(error))
        setLoadedBookContent({ bookId: bookMetadata.id, sentences: [], pages: [] })
      }
    })
    return () => { cancelled = true }
  }, [bookMetadata?.id])

  useEffect(() => {
    const container = readerScrollContainerRef.current
    if (container) container.scrollTop = 0
    previousScrollTopRef.current = 0
    setVirtualPageRange([0, 8])
    setShowReaderHeader(true)
  }, [book?.id])

  // Problema de animación: evita encadenar desplazamientos suaves en cada frase durante el TTS.
  useEffect(() => {
    const container = readerScrollContainerRef.current
    const sentence = activeSentenceRef.current
    if (!container || !sentence || !isPlaying) return
    const containerBounds = container.getBoundingClientRect()
    const visibleTop = containerBounds.top + 72
    const visibleBottom = containerBounds.bottom - 48
    const activeWord = sentence.querySelector<HTMLElement>(`[data-tts-word="${currentWordIndex}"]`)
    const target = activeWord ?? sentence
    const targetBounds = target.getBoundingClientRect()
    if (targetBounds.bottom < visibleTop || targetBounds.top > visibleBottom) {
      target.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    }
  }, [currentSentenceIndex, currentWordIndex, isPlaying])

  // Auto-save position every 3 seconds while reading
  useEffect(() => {
    if (!book || !isPlaying) return
    const interval = setInterval(() => {
      savePosition(book.id, currentSentenceIndex, currentPageIndex)
    }, 3000)
    return () => clearInterval(interval)
  }, [book, isPlaying, currentSentenceIndex, currentPageIndex, savePosition])

  // ─── Background / Foreground Lifecycle & Freeze Prevention ───
  useEffect(() => {
    let appStateSub: any = null

    const handleBackgroundSave = () => {
      if (isPlayingRef.current) {
        // Reactivate Web Audio at the lifecycle transition so Android can continue locked-screen reading.
        void audioEngine.unlock().catch(error => {
          console.warn('[VoxLector] No se pudo mantener activo el audio al pasar a segundo plano:', error)
        })
      }
      if (book) {
        savePosition(book.id, currentSentenceIndex, currentPageIndex)
        try {
          localStorage.setItem('vox_session_snapshot', JSON.stringify({
            bookId: book.id,
            sentenceIndex: currentSentenceIndex,
            pageIndex: currentPageIndex,
            isPlaying: isPlayingRef.current,
            timestamp: Date.now(),
          }))
        } catch {}
      }
    }

    const handleForegroundSync = async () => {
      await audioEngine.unlock()
      // Re-align viewport smoothly to the active reading sentence or last paused paragraph
      setTimeout(() => {
        if (activeSentenceRef.current) {
          activeSentenceRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' })
        }
      }, 150)
    }

    // Capacitor App Lifecycle listener
    const initAppLifecycle = async () => {
      appStateSub = await CapApp.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) {
          handleBackgroundSave()
        } else {
          await handleForegroundSync()
        }
      })
    }
    initAppLifecycle()

    // Browser / WebView visibilitychange listener
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        handleBackgroundSave()
      } else {
        await handleForegroundSync()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (appStateSub) appStateSub.remove()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [book, currentSentenceIndex, currentPageIndex, savePosition])

  // ─── Hardware Back Button Interception (Android) ───────────
  useEffect(() => {
    let backSub: any = null

    const initBackButton = async () => {
      backSub = await CapApp.addListener('backButton', () => {
        // The loading screen does not mount reader modals. Leave the route
        // directly while document metadata/content is still being resolved.
        if (!readerContentReady) {
          stopSpeaking()
          navigate('/')
          return
        }
        // Priority 1: Dismiss active context menu or open drawers/modals first
        if (contextAction) { setContextAction(null); return }
        if (showNotesDrawer) { setShowNotesDrawer(false); return }
        if (showFloatingVoice) { setShowFloatingVoice(false); return }
        if (showCharBoard) { setShowCharBoard(false); return }
        if (showSettings) { setShowSettings(false); return }
        if (showSleepTimer) { setShowSleepTimer(false); return }
        if (showVoiceStudio) {
          setShowVoiceStudio(false)
          setStudioTargetVoiceId(null)
          setStudioTargetCharName(null)
          setStudioAssignsNewNarrator(false)
          return
        }
        if (unregisteredChar) { setUnregisteredChar(null); return }

        // Priority 2: If the exit modal is already open, close it (cancel exit)
        if (showExitModal) {
          setShowExitModal(false)
          return
        }

        // Priority 3: Show polite and friendly Exit Confirmation Modal
        setShowExitModal(true)
      })
    }
    initBackButton()

    return () => {
      if (backSub) backSub.remove()
    }
  }, [
    contextAction, showNotesDrawer, showFloatingVoice, showCharBoard,
    showSettings, showSleepTimer, studioTargetVoiceId, showVoiceStudio,
    unregisteredChar, showExitModal, readerContentReady, navigate,
  ])

  // Update current page based on continuous scroll position
  const handleScroll = useCallback(() => {
    if (!book || !readerScrollContainerRef.current) return
    if (isProgrammaticNavigationRef.current) return
    const container = readerScrollContainerRef.current
    const scrollTop = container.scrollTop
    const containerTop = container.getBoundingClientRect().top
    let target = -1
    const [visibleStart, visibleEnd] = virtualPageRangeRef.current
    for (let index = visibleStart; index < Math.min(visibleEnd, readerPageCount); index++) {
      const element = document.getElementById(`page-block-${index}`)
      if (!element) continue
      const rect = element.getBoundingClientRect()
      if (rect.top - containerTop <= 150 && rect.bottom - containerTop > 0) {
        target = index
        break
      }
    }
    if (target < 0 && readerPageCount > 0) {
      let low = 0
      let high = readerPageCount
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if ((pageOffsets[middle + 1] ?? Number.POSITIVE_INFINITY) <= scrollTop) low = middle + 1
        else high = middle
      }
      target = Math.max(0, Math.min(readerPageCount - 1, low))
    }
    if (target >= 0) {
      if (currentPageIndex !== target) setCurrentPage(target)
      const nextRange: [number, number] = [Math.max(0, target - 3), Math.min(readerPageCount, target + 7)]
      if (nextRange[0] !== virtualPageRange[0] || nextRange[1] !== virtualPageRange[1]) {
        setVirtualPageRange(nextRange)
      }
    }
    const scrollDelta = scrollTop - previousScrollTopRef.current
    if (Math.abs(scrollDelta) >= 7) {
      setShowReaderHeader(current => {
        const shouldShow = scrollDelta < 0
        return current === shouldShow ? current : shouldShow
      })
      previousScrollTopRef.current = scrollTop
    }
  }, [book, currentPageIndex, pageOffsets, readerPageCount, setCurrentPage, virtualPageRange])

  // ── Main Speech Function with Karaoke Word Boundary Tracking ──
  const playFromSentence = useCallback(async (
    sentenceIdx: number,
    startWordIndex = 0,
    voiceOverride?: string,
    inheritedRunId?: number,
  ) => {
    if (!book) return
    const runId = inheritedRunId ?? ++playbackRunIdRef.current
    if (inheritedRunId === undefined) stopSpeaking()
    await flushVoiceProfiles()
    if (runId !== playbackRunIdRef.current) return
    const sentence = book.sentences[sentenceIdx]
    if (!sentence) {
      cancelActivePlayback()
      currentWordIndexRef.current = -1
      setCurrentWordIndex(-1)
      savePosition(book.id, 0, 0)
      return
    }
    if (book.format === 'pdf' && sentence.pageNumber !== undefined) {
      const pageSentences = book.sentences.filter(item => item.pageNumber === sentence.pageNumber)
      if (isPdfNumericArtifactPage(pageSentences)) {
        const nextSentence = book.sentences.find(item =>
          item.index > sentenceIdx &&
          item.pageNumber !== undefined &&
          item.pageNumber > sentence.pageNumber!,
        )
        if (nextSentence) {
          setCurrentPage(nextSentence.pageNumber! - 1)
          void playFromSentence(nextSentence.index, 0, undefined, runId)
        } else {
          cancelActivePlayback()
        }
        return
      }
    }

    const narratorAnnouncement = book.readingMode === 'narrator' && sentence.character
      ? getDialogueAnnouncement(sentence.character, sentence.emotion, sentence.narratorAnnouncement)
      : undefined
    const stageCueMatch = sentence.displayText?.match(/^\s*(?:\(([^)]*)\)|\[([^\]]*)\])/u)
    const stageCue = (stageCueMatch?.[1] ?? stageCueMatch?.[2])?.trim()
    const dialogueAnnouncement = sentence.narratorAnnouncement ?? stageCue
    const currentAnnouncement = dialogueAnnouncement?.replace(/^[^:]+:\s*/u, '').trim() || undefined
    const baseSpeechText = book.readingMode === 'multivoice' && sentence.character
        ? sentence.spokenText ?? sentence.text
        : sentence.text
    const narratorAnalysis = book.readingMode === 'narrator' && sentence.character
      ? prosodyEngineRef.current.analyze(baseSpeechText, sentence.emotion, true)
      : undefined
    const playableBaseText = narratorAnalysis?.text ?? baseSpeechText
    const speechWords = playableBaseText.split(/\s+/).filter(Boolean)
    const safeStartWord = Math.min(startWordIndex, Math.max(0, speechWords.length - 1))
    const sentenceSpeechText = safeStartWord > 0
      ? speechWords.slice(safeStartWord).join(' ')
      : playableBaseText
    const previousAnnouncedDialogue = lastAnnouncedDialogueRef.current
    const continuesDialogue = Boolean(
      sentence.character &&
      !sentence.isParagraphStart &&
      previousAnnouncedDialogue?.sentenceIndex === sentenceIdx - 1 &&
      previousAnnouncedDialogue.speaker.toLocaleLowerCase('es') === sentence.character.toLocaleLowerCase('es'),
    )
    const inheritedAnnouncementEmotion = !dialogueAnnouncement &&
      continuesDialogue &&
      previousAnnouncedDialogue?.announcement
      ? previousAnnouncedDialogue.emotion
      : undefined
    const dialogueEmotion = inheritedAnnouncementEmotion ?? sentence.emotion
    const narratorDialogueSegments = book.readingMode === 'narrator' && sentence.character
      // Problema 1: parse character cues for the single narrator without changing its one-voice routing.
      ? dialogueParserRef.current.parse(sentenceSpeechText, {
          knownCharacters: book.characters.map(character => character.name),
          fallbackSpeaker: sentence.character,
          emotion: narratorAnalysis?.emotion ?? sentence.emotion,
          announcement: dialogueAnnouncement,
          resetState: sentence.isParagraphStart || sentenceIdx === 0,
          emitAction: safeStartWord === 0,
        }).map(segment => ({
          ...segment,
          kind: 'narration' as const,
          speakerName: undefined,
        }))
      : undefined
    const segments = narratorDialogueSegments
      ? [
          ...(safeStartWord === 0 && narratorAnnouncement && (
            !continuesDialogue ||
            Boolean(currentAnnouncement && currentAnnouncement !== previousAnnouncedDialogue?.announcement) ||
            Boolean(dialogueEmotion && dialogueEmotion !== previousAnnouncedDialogue?.emotion)
          )
            ? [{
                kind: 'narration' as const,
                text: narratorAnnouncement,
                emotion: undefined,
                wordOffset: 0,
                trackWords: false,
              }]
            : []),
          ...narratorDialogueSegments,
        ]
      : dialogueParserRef.current.parse(sentenceSpeechText, {
          knownCharacters: book.characters.map(character => character.name),
          fallbackSpeaker: sentence.character,
          emotion: dialogueEmotion,
          announcement: dialogueAnnouncement,
          isNarration: sentence.isNarration && !sentence.character,
          resetState: sentence.isParagraphStart || sentenceIdx === 0,
          emitAction: safeStartWord === 0,
        })
    const prosodicSegments = prosodyEngineRef.current.prepareSegments(segments, {
      streamId: book.id,
      sentenceIndex: sentenceIdx,
      reset: safeStartWord > 0,
    })
    const hasDialogue = prosodicSegments.some(segment => segment.kind === 'dialogue' && segment.speakerName)
    const shouldAnnounceDialogue = announceCharacterDialogue &&
      book.readingMode === 'multivoice' &&
      hasDialogue &&
      !voiceOverride
    const shouldAnnounceCharacterName = shouldAnnounceDialogue && !continuesDialogue
    const shouldAnnounceEmotion = shouldAnnounceDialogue && (
      currentAnnouncement
        ? currentAnnouncement !== previousAnnouncedDialogue?.announcement
        : Boolean(dialogueEmotion && dialogueEmotion !== previousAnnouncedDialogue?.emotion)
    )
    const script = audioScriptBuilderRef.current.build(prosodicSegments, {
      readingMode: book.readingMode,
      narratorVoiceId: book.narratorVoiceId,
      characters: book.characters,
      voiceAssignments: book.voiceAssignments ?? {},
      announceCharacterDialogue: shouldAnnounceDialogue,
      announceCharacterName: shouldAnnounceCharacterName,
      announceEmotion: shouldAnnounceEmotion,
      narratorAnnouncement: dialogueAnnouncement,
      voiceOverride,
      initialWordOffset: safeStartWord,
    })

    if (script.unassignedCharacters.length > 0) {
      cancelActivePlayback()
      currentWordIndexRef.current = -1
      setCurrentWordIndex(-1)
      setUnregisteredChar(script.unassignedCharacters[0])
      return
    }
    const missingVoiceId = script.instructions.find(instruction => !getVoiceById(instruction.voiceId))?.voiceId
    if (missingVoiceId) {
      setVoiceError(`No existe el perfil de voz configurado para "${missingVoiceId}". Selecciona un perfil guardado.`)
      cancelActivePlayback()
      currentWordIndexRef.current = -1
      setCurrentWordIndex(-1)
      return
    }
    setVoiceError(null)

    // Update page/player state only after every script instruction has an
    // exact configured Voice_ID. The renderer never substitutes another one.
    const sentencePageIdx = sentencePages[sentenceIdx] ?? (sentence.pageNumber ? sentence.pageNumber - 1 : currentPageIndex)
    play(book.id, sentenceIdx, sentencePageIdx)
    const [renderStart, renderEnd] = virtualPageRangeRef.current
    if (sentencePageIdx < renderStart || sentencePageIdx >= renderEnd) {
      setVirtualPageRange([
        Math.max(0, sentencePageIdx - 3),
        Math.min(readerPageCount, sentencePageIdx + 7),
      ])
      requestAnimationFrame(() => {
        document.getElementById(`page-block-${sentencePageIdx}`)?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
      })
    }
    currentWordIndexRef.current = safeStartWord
    setCurrentWordIndex(-1)

    const apiKey = apiKeys[cloudProvider] ?? ''

    // Keep native prefetch, but only for a single clean instruction. Complex
    // scripts render in order and are never preloaded as raw text.
    if (cloudProvider === 'none' && startWordIndex === 0) {
      const nextSentence = book.sentences[sentenceIdx + 1]
      if (nextSentence) {
        const preloadParser = new DialogueParser()
        const nextSegments = preloadParser.parse(nextSentence.spokenText ?? nextSentence.text, {
          knownCharacters: book.characters.map(character => character.name),
          fallbackSpeaker: nextSentence.character,
          emotion: nextSentence.emotion,
          isNarration: nextSentence.isNarration,
          resetState: true,
        })
        const nextScript = new AudioScriptBuilder().build(nextSegments, {
          readingMode: book.readingMode,
          narratorVoiceId: book.narratorVoiceId,
          characters: book.characters,
          voiceAssignments: book.voiceAssignments ?? {},
        })
        const nextInstruction = nextScript.instructions.length === 1 ? nextScript.instructions[0] : undefined
        if (nextInstruction && nextInstruction.type !== 'SFX_INJECTION' && nextScript.unassignedCharacters.length === 0) {
          const nextVoice = getVoiceById(nextInstruction.voiceId)
          if (nextVoice) {
            preloadNativeSpeech(
              nextInstruction.text,
              { ...nextVoice, rate: nextVoice.rate * speedRef.current },
              nextInstruction.emotion,
            )
          }
        }
      }
    }

    try {
      await scriptRendererRef.current.render(script.instructions, {
        resolveVoice: voiceId => getVoiceById(voiceId),
        speak: (instruction, voice, onWordBoundary) => new Promise<void>((resolve, reject) => {
          void speakText(
            instruction.text,
            { ...voice, rate: voice.rate * speedRef.current },
            cloudProvider,
            apiKey,
            instruction.emotion,
            onWordBoundary,
            resolve,
            error => reject(new Error(error)),
            true,
            () => reject(new ScriptCancelledError()),
          ).catch(reject)
        }),
        onWordBoundary: (instruction: ScriptTextInstruction, wordIndex: number) => {
          if (!isPlayingRef.current || !instruction.trackWords) return
          const absoluteWordIndex = Math.min(
            Math.max(0, instruction.wordOffset + wordIndex),
            Math.max(0, (sentence.words?.length ?? 1) - 1),
          )
          currentWordIndexRef.current = absoluteWordIndex
          setCurrentWordIndex(absoluteWordIndex)
        },
      })
    } catch (error) {
      if (runId !== playbackRunIdRef.current) return
      if (error instanceof ScriptCancelledError) return
      console.warn('[VoxLector TTS] Falló la ejecución del guion:', error)
      if (error instanceof MissingScriptVoiceError) {
        setVoiceError(error.message)
        cancelActivePlayback()
        currentWordIndexRef.current = -1
        setCurrentWordIndex(-1)
        return
      }
      if (isPlayingRef.current) void playFromSentence(sentenceIdx + 1, 0, undefined, runId)
      return
    }

    if (runId !== playbackRunIdRef.current) return
    lastAnnouncedDialogueRef.current = sentence.character
      ? {
          speaker: sentence.character,
          sentenceIndex: sentenceIdx,
          emotion: prosodicSegments.find(segment => segment.kind === 'dialogue')?.emotion ?? dialogueEmotion,
          announcement: currentAnnouncement ?? (continuesDialogue ? previousAnnouncedDialogue?.announcement : undefined),
        }
      : null
    if (isPlayingRef.current) void playFromSentence(sentenceIdx + 1, 0, undefined, runId)
  }, [book, cloudProvider, apiKeys, getVoiceById, flushVoiceProfiles, play, cancelActivePlayback, currentPageIndex, readerPageCount, savePosition, sentencePages, announceCharacterDialogue])

  const previousAnnouncementSettingRef = useRef(announceCharacterDialogue)
  useEffect(() => {
    if (previousAnnouncementSettingRef.current === announceCharacterDialogue) return
    previousAnnouncementSettingRef.current = announceCharacterDialogue
    if (book?.readingMode !== 'multivoice') return
    lastAnnouncedDialogueRef.current = null
    if (!isPlaying) return
    // Problema de anuncio multivoz: reconstruye el guion activo al cambiar el ajuste, sin pausar manualmente.
    void playFromSentence(currentSentenceIndex, Math.max(0, currentWordIndexRef.current))
  }, [announceCharacterDialogue, book?.readingMode, currentSentenceIndex, isPlaying, playFromSentence])

  // Play / Pause Toggle
  const handlePlayPause = useCallback(async () => {
    if (!book) return
    if (isPlaying) {
      playbackRunIdRef.current++
      await pause()
    } else if (isPaused) {
      await resume()
      await playFromSentence(currentSentenceIndex, Math.max(0, currentWordIndexRef.current + 1))
    } else {
      const startIdx = currentSentenceIndex > 0 ? currentSentenceIndex : (book.lastSentenceIndex || 0)
      await playFromSentence(startIdx)
    }
  }, [book, isPlaying, isPaused, currentSentenceIndex, pause, resume, playFromSentence])

  const handleRateChange = useCallback((newSpeed: number) => {
    const previousSpeed = speedRef.current
    if (!Number.isFinite(newSpeed) || newSpeed <= 0 || newSpeed === previousSpeed) return
    speedRef.current = newSpeed
    setSpeed(newSpeed)
    if (!isPlayingRef.current) return

    if (!updateSpeakingRate(previousSpeed, newSpeed)) {
      const resumeWord = Math.max(0, currentWordIndexRef.current)
      stopSpeaking()
      void playFromSentence(currentSentenceIndex, resumeWord)
    }
  }, [setSpeed, currentSentenceIndex, playFromSentence])

  const handleReaderCenterTap = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest('button, a, input, select, textarea, [role="button"]')) return
    if (ignoreCenterClickRef.current) {
      ignoreCenterClickRef.current = false
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const relativeX = (event.clientX - bounds.left) / bounds.width
    const relativeY = (event.clientY - bounds.top) / bounds.height
    if (relativeX < 0.2 || relativeX > 0.8 || relativeY < 0.25 || relativeY > 0.75) return
    if (centerTapHandledAtRef.current) window.clearTimeout(centerTapHandledAtRef.current)
    centerTapHandledAtRef.current = window.setTimeout(() => {
      setShowReaderHeader(current => !current)
      centerTapHandledAtRef.current = 0
    }, 260)
  }

  const handleReaderCenterDoubleTap = (event: React.MouseEvent<HTMLElement>) => {
    if (Date.now() - lastCenterTouchAtRef.current < 350) return
    const target = event.target
    if (!(target instanceof Element) || target.closest('button, a, input, select, textarea, [role="button"]')) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const relativeX = (event.clientX - bounds.left) / bounds.width
    const relativeY = (event.clientY - bounds.top) / bounds.height
    if (relativeX < 0.2 || relativeX > 0.8 || relativeY < 0.25 || relativeY > 0.75) return
    if (centerTapHandledAtRef.current) {
      window.clearTimeout(centerTapHandledAtRef.current)
      centerTapHandledAtRef.current = 0
    }
    setShowReaderHeader(current => !current)
  }

  const handleReaderTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.changedTouches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }

  const handleReaderCenterTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const target = event.target
    const touch = event.changedTouches[0]
    if (!(target instanceof Element) || !touch || target.closest('button, a, input, select, textarea, [role="button"]')) return
    const start = touchStartRef.current
    touchStartRef.current = null
    if (
      !start ||
      Date.now() - start.time > 450 ||
      Math.abs(touch.clientX - start.x) > 15 ||
      Math.abs(touch.clientY - start.y) > 15
    ) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const relativeX = (touch.clientX - bounds.left) / bounds.width
    const relativeY = (touch.clientY - bounds.top) / bounds.height
    if (relativeX < 0.2 || relativeX > 0.8 || relativeY < 0.25 || relativeY > 0.75) return

    const now = Date.now()
    if (now - lastCenterTouchAtRef.current > 350) {
      lastCenterTouchAtRef.current = now
      return
    }
    lastCenterTouchAtRef.current = now
    if (centerTapHandledAtRef.current) {
      window.clearTimeout(centerTapHandledAtRef.current)
      centerTapHandledAtRef.current = 0
    }
    ignoreCenterClickRef.current = true
    setShowReaderHeader(current => !current)
  }

  // Stop Playback
  const handleStop = useCallback(() => {
    cancelActivePlayback()
    currentWordIndexRef.current = -1
    setCurrentWordIndex(-1)
    if (book) savePosition(book.id, currentSentenceIndex, currentPageIndex)
  }, [cancelActivePlayback, book, currentSentenceIndex, currentPageIndex, savePosition])

  // -15s and +15s Seek
  const handleSeekSeconds = useCallback((offsetSeconds: number) => {
    if (!book) return
    stopSpeaking()

    const wordsToJump = Math.round(offsetSeconds * 3 * Math.max(0.5, speed))
    let targetSentenceIdx = currentSentenceIndex

    if (wordsToJump < 0) {
      const sentencesBack = Math.max(1, Math.round(Math.abs(wordsToJump) / 15))
      targetSentenceIdx = Math.max(0, currentSentenceIndex - sentencesBack)
    } else {
      const sentencesForward = Math.max(1, Math.round(wordsToJump / 15))
      targetSentenceIdx = Math.min(book.sentences.length - 1, currentSentenceIndex + sentencesForward)
    }

    const targetSentence = book.sentences[targetSentenceIdx]
    if (targetSentence && targetSentence.pageNumber) {
      const pIdx = targetSentence.pageNumber - 1
      jumpToPage(pIdx)
    }

    seekToSentence(targetSentenceIdx)
    playFromSentence(targetSentenceIdx)
  }, [book, currentSentenceIndex, speed, seekToSentence, jumpToPage, playFromSentence])

  // Long-press handling (>= 500ms)
  const handlePointerDown = (sentence: ParsedSentence) => {
    isPointerDownRef.current = true
    longPressTriggeredRef.current = false
    const existingAnno = annotations.find(a => a.sentenceIndex === sentence.index)

    longPressTimerRef.current = setTimeout(() => {
      if (isPointerDownRef.current) {
        longPressTriggeredRef.current = true
        if (navigator.vibrate) navigator.vibrate(35)
        setContextAction({
          sentenceIndex: sentence.index,
          text: sentence.text,
          existingAnnotationId: existingAnno?.id,
        })
      }
    }, 500)
  }

  const handleSelectSentence = (sentence: ParsedSentence) => {
    if (!book || longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }
    const selectedPageIndex = sentencePages[sentence.index] ?? (sentence.pageNumber ? sentence.pageNumber - 1 : currentPageIndex)
    const pageIndex = readerPageCount > 0
      ? Math.max(0, Math.min(readerPageCount - 1, selectedPageIndex))
      : Math.max(0, selectedPageIndex)
    cancelActivePlayback()
    seekToSentence(sentence.index)
    setCurrentPage(pageIndex)
    currentWordIndexRef.current = -1
    setCurrentWordIndex(-1)
    savePosition(book.id, sentence.index, pageIndex)
    if (pageIndex >= 0 && pageIndex < readerPageCount) {
      jumpToPage(pageIndex)
    }
  }

  const handlePointerUpOrLeave = () => {
    isPointerDownRef.current = false
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleReadFromContext = (idx: number) => {
    setContextAction(null)
    stopSpeaking()
    seekToSentence(idx)
    playFromSentence(idx)
  }

  const handleHighlight = (color: string) => {
    if (!book || !contextAction) return
    addHighlight(book.id, contextAction.sentenceIndex, contextAction.text, color)
    setContextAction(null)
  }

  const handleRemoveHighlight = (annoId: string) => {
    removeAnnotation(annoId)
    setContextAction(null)
  }

  const handleSaveNote = () => {
    if (!book || !contextAction || !noteInputText.trim()) return
    addNote(book.id, contextAction.sentenceIndex, contextAction.text, noteInputText.trim())
    setShowAddNoteInput(false)
    setNoteInputText('')
    setContextAction(null)
  }

  const handleConfirmExitApp = async () => {
    if (book) {
      savePosition(book.id, currentSentenceIndex, currentPageIndex)
    }
    cancelActivePlayback()
    setShowExitModal(false)
    await CapApp.exitApp()
  }

  const handleBackToLibrary = () => {
    if (book) {
      savePosition(book.id, currentSentenceIndex, currentPageIndex)
    }
    if (isPlaying) cancelActivePlayback()
    setShowExitModal(false)
    navigate('/')
  }


  if (!book || !readerContentReady || (bookMetadata?.sourceMetadata && bookMetadata.importStatus !== 'ready')) {
    const metadataOnlyBook = Boolean(bookMetadata?.sourceMetadata && bookMetadata.importStatus !== 'ready')
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <span className={`material-icons-round text-5xl ${bookMetadata && (metadataOnlyBook || loadedBookContent?.bookId !== bookMetadata.id) ? 'animate-spin text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
            {bookMetadata && (metadataOnlyBook || loadedBookContent?.bookId !== bookMetadata.id) ? 'sync' : 'error'}
          </span>
          <p className="mt-3 text-[var(--text-secondary)]">
            {metadataOnlyBook
              ? bookMetadata?.importStatus === 'error'
                ? 'El documento no se procesó. Regresa a la biblioteca e inténtalo de nuevo.'
                : 'Preparando el documento antes de abrir el lector…'
              : bookMetadata
              ? loadedBookContent?.bookId === bookMetadata.id
                ? bookContentLoadError
                  ? `No se pudo cargar el contenido: ${bookContentLoadError}`
                  : 'El contenido del libro no está disponible en el almacenamiento.'
                : 'Cargando el contenido del libro…'
              : 'Libro no encontrado'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-5 py-2.5 rounded-xl font-bold text-white bg-[var(--accent)]"
          >
            Volver a la Biblioteca
          </button>
        </div>
      </div>
    )
  }

  const totalSentences = book.sentences.length
  const activePageCount = readerPageCount
  const playerBook = book.totalPages === readerPageCount
    ? book
    : { ...book, totalPages: readerPageCount }
  const virtualStart = Math.min(virtualPageRange[0], readerPageCount)
  const virtualEnd = Math.min(virtualPageRange[1], readerPageCount)

  const paddingClass = readerPadding === 'compact'
    ? 'px-3 sm:px-6 py-4'
    : readerPadding === 'spacious'
    ? 'px-8 sm:px-14 py-8'
    : 'px-5 sm:px-10 py-6'
  const timerRemainingSeconds = sleepTimerEndAt
    ? Math.max(0, Math.ceil((sleepTimerEndAt - timerNow) / 1000))
    : 0
  const timerDuration = sleepTimerEndAt && sleepTimerStartedAt
    ? Math.max(1, sleepTimerEndAt - sleepTimerStartedAt)
    : 1
  const timerProgress = sleepTimerEndAt
    ? Math.min(1, Math.max(0, 1 - (sleepTimerEndAt - timerNow) / timerDuration))
    : 0
  const timerLabel = `${Math.floor(timerRemainingSeconds / 60).toString().padStart(2, '0')}:${(timerRemainingSeconds % 60).toString().padStart(2, '0')}`
  const timerCircleCircumference = 2 * Math.PI * 10

  return (
    <div className="reader-page-shell flex flex-col relative select-none">
      {/* ─── Static Fixed Background Image (Text scrolls independently) ─── */}
      {backgroundImage && (
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
          }}
        >
          <div
            className="absolute inset-0"
            style={{ background: `rgba(0,0,0,${backgroundOpacity})` }}
          />
        </div>
      )}

      {/* ─── Top Navigation Bar ─── */}
      <header
        className={`reader-top-navbar glass flex items-center justify-between px-3 sm:px-5 py-2.5 border-b ${
          showReaderHeader ? 'is-visible' : 'is-hidden'
        }`}
        style={{ borderColor: 'var(--border-color)', background: 'var(--bg-glass)' }}
      >
        <div className="reader-header-book">
          <button
            onClick={() => {
              if (isPlaying) cancelActivePlayback()
              savePosition(book.id, currentSentenceIndex, currentPageIndex)
              navigate('/')
            }}
            className="btn-icon !w-9 !h-9"
            title="Volver a la biblioteca"
          >
            <span className="material-icons-round text-base">arrow_back</span>
          </button>

          <div className="reader-header-title flex-col">
            <h2 className="text-xs sm:text-sm font-black truncate text-white">{book.title}</h2>
            <span className="text-[0.65rem] text-[var(--text-muted)] font-mono">
              Pág. {currentPageIndex + 1} de {activePageCount} · {book.readingMode === 'multivoice' ? '🎭 Multi-Voz' : '🎙️ Narrador'}
            </span>
          </div>
        </div>

        <div className="reader-header-actions">
          {/* Notes Drawer Button */}
          <button
            onClick={() => setShowNotesDrawer(true)}
            className="btn-icon !w-9 !h-9 relative"
            title="Ver notas y subrayados"
          >
            <span className="material-icons-round text-base">edit_note</span>
            {annotations.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[0.6rem] font-bold flex items-center justify-center">
                {annotations.length}
              </span>
            )}
          </button>

          {/* Quick Voice Switcher */}
          <button
            onClick={() => setShowFloatingVoice(v => !v)}
            className="btn-icon !w-9 !h-9"
            title="Cambiar o esculpir voz activa"
          >
            <span className="material-icons-round text-base">graphic_eq</span>
          </button>

          {/* Character Board */}
          <button
            onClick={() => setShowCharBoard(true)}
            className="btn-icon !w-9 !h-9"
            title="Panel de personajes"
          >
            <span className="material-icons-round text-base">groups</span>
          </button>

          {/* Settings & Circular Sleep Stopwatch Widget */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(true)}
              className="btn-icon !w-9 !h-9"
              title="Ajustes de lectura y color"
            >
              <span className="material-icons-round text-base">settings</span>
            </button>

            {/* Circular stopwatch widget in top-right corner, directly under Settings icon */}
            {Boolean(sleepTimerEndAt && timerRemainingSeconds > 0) && (
              <button
                type="button"
                onClick={() => setShowSleepTimer(true)}
                className="reader-sleep-stopwatch-widget"
                title={`Temporizador activo: ${timerLabel} restantes. Toca para configurar o desactivar.`}
                aria-label={`Temporizador de sueño: ${timerLabel}`}
              >
                <svg className="reader-sleep-stopwatch-svg" viewBox="0 0 36 36">
                  <circle className="reader-sleep-stopwatch-track" cx="18" cy="18" r="15" />
                  <circle
                    className="reader-sleep-stopwatch-progress"
                    cx="18"
                    cy="18"
                    r="15"
                    strokeDasharray={2 * Math.PI * 15}
                    strokeDashoffset={2 * Math.PI * 15 * (1 - timerProgress)}
                  />
                </svg>
                <div className="reader-sleep-stopwatch-inner">
                  <span className="reader-sleep-stopwatch-time">{timerLabel}</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Continuous Scroll Reading Viewport ─── */}
      {/* Problema A: los PDF se muestran exclusivamente como texto extraído, sin canvas ni visor PDF. */}
      <main
        ref={readerScrollContainerRef}
        onScroll={handleScroll}
        onClick={handleReaderCenterTap}
        onDoubleClick={handleReaderCenterDoubleTap}
        onTouchStart={handleReaderTouchStart}
        onTouchEnd={handleReaderCenterTouchEnd}
        className={`reader-main-viewport reader-main-container reader-text-container reader-scroll-container reader-scroll-viewport flex-1 ${paddingClass} pb-40 z-10`}
        style={{
          maxWidth: 860,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {voiceError && (
          <div role="alert" className="mb-4 rounded-xl border border-[var(--danger)] bg-[var(--danger)]/10 p-3 text-sm text-[var(--text-primary)]">
            {voiceError}
            <button type="button" onClick={() => setVoiceError(null)} className="ml-3 font-bold text-[var(--danger)]">×</button>
          </div>
        )}
        {mountedReaderBookId !== book.id ? (
          <p className="p-6 text-center text-[var(--text-secondary)]">Preparando el texto del documento…</p>
        ) : (
        <div
          style={{
            fontSize: `${fontSize}px`,
            lineHeight,
            textAlign,
            color: backgroundImage ? '#ffffff' : 'var(--text-primary)',
            fontFamily: 'var(--font-main)',
            whiteSpace: 'pre-wrap',
            textShadow: backgroundImage
              ? '0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.75)'
              : undefined,
          }}
          className="reader-document-text space-y-6"
        >
          <div aria-hidden="true" style={{ height: `${pageOffsets[virtualStart] ?? 0}px` }} />
          {Array.from({ length: Math.max(0, virtualEnd - virtualStart) }, (_, visiblePageIdx) => {
            const pIdx = visiblePageIdx + virtualStart
            const pageSentences = (pageSentenceIndices[pIdx] ?? [])
              .map(idx => book.sentences[idx])
              .filter(Boolean) as ParsedSentence[]
            const pageHasTextEncodingErrors = book.format === 'pdf' &&
              hasPdfTextEncodingErrors(pageSentences)
            const readablePageSentences = book.format === 'pdf'
              ? filterPdfExtractionArtifacts(pageSentences)
              : pageSentences
            const pageLayout = readablePageSentences.find(sentence => sentence.pdfPageMarginLeft !== undefined)
            if (book.format === 'pdf' &&
              (pageHasTextEncodingErrors || readablePageSentences.length === 0 || isPdfNumericArtifactPage(readablePageSentences))) {
              return (
                <section
                  key={pIdx}
                  id={`page-block-${pIdx}`}
                  className="my-6 flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-glass)] p-6 text-center text-white"
                  role="note"
                >
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    Página {pIdx + 1} · No se pudo extraer texto legible
                  </span>
                </section>
              )
            }
            const paragraphs: ParsedSentence[][] = []
            for (const sentence of readablePageSentences) {
              const previousParagraph = paragraphs[paragraphs.length - 1]
              if (
                !previousParagraph ||
                sentence.isParagraphStart ||
                (sentence.paragraphIndex !== undefined &&
                  previousParagraph[0].paragraphIndex !== sentence.paragraphIndex)
              ) {
                paragraphs.push([])
              }
              paragraphs[paragraphs.length - 1].push(sentence)
            }

            return (
              <div
                key={pIdx}
                id={`page-block-${pIdx}`}
                className={`page-section-block relative ${backgroundImage ? 'reader-page-container' : ''}`}
                style={pageLayout ? {
                  marginLeft: `${(pageLayout.pdfPageMarginLeft ?? 0) * 100}%`,
                  marginRight: `${(pageLayout.pdfPageMarginRight ?? 0) * 100}%`,
                } : undefined}
              >
                {/* Separador sin vista completa de la página PDF. */}
                <div className="relative flex items-center justify-center my-6 select-none opacity-60">
                  <span className="text-[0.65rem] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-color)]">
                    Página {pIdx + 1} de {activePageCount}
                  </span>
                </div>

                <div className="space-y-5">
                  {paragraphs.map((paragraph, paragraphNumber) => (
                    <p
                      key={`${pIdx}-${paragraphNumber}`}
                      className="leading-relaxed"
                      style={paragraph[0]?.pdfFontScale ? {
                        fontFamily: paragraph[0].pdfFontFamily,
                        fontSize: `${paragraph[0].pdfFontScale}em`,
                        fontWeight: paragraph[0].pdfFontWeight,
                        fontStyle: paragraph[0].pdfFontStyle,
                        textIndent: `${paragraph[0].pdfTextIndentEm ?? 0}em`,
                      } : undefined}
                    >
                      {paragraph.map((sentence, sentenceNumber) => {
                        const isSentenceSelected = sentence.index === currentSentenceIndex &&
                          (!(isPlaying || isPaused) || currentWordIndex >= 0)
                        const isSentenceActive = isSentenceSelected && (isPlaying || isPaused) && currentWordIndex >= 0
                        const displayText = sentence.displayText
                          ?? sentence.text
                        const displayTokens = displayText.match(/\s+|[^\s]+/gu) ?? []
                        const speechMappingText = book.readingMode === 'multivoice'
                          ? sentence.spokenText ?? sentence.text
                          : sentence.text
                        const displayWordIndexes = mapDisplayWordsToSpeech(displayText, speechMappingText)
                        const previousSentence = paragraph[sentenceNumber - 1]
                        const showCharacterName = Boolean(sentence.character) &&
                          (!previousSentence || previousSentence.character !== sentence.character)
                        const sentenceAnnotation = annotationsBySentence.get(sentence.index)
                        const isHighlighted = !!sentenceAnnotation
                        const highlightColor = sentenceAnnotation?.color || '#facc15'

                        return (
                          <React.Fragment key={sentence.index}>
                            {/* Problema: muestra recursos incrustados en el documento, no una captura de página. */}
                            {sentence.embeddedImages?.map((image, imageIndex) => (
                              <img
                                key={`${sentence.index}-embedded-${imageIndex}`}
                                src={image.src}
                                alt={image.alt}
                                loading="lazy"
                                className="my-4 block max-h-96 max-w-full rounded-lg object-contain shadow-lg"
                              />
                            ))}
                            <span
                              data-tts-sentence={sentence.index}
                              aria-current={isSentenceSelected ? 'location' : undefined}
                              title="Toca para elegir desde aquí dónde continuar la lectura"
                              ref={isSentenceSelected ? activeSentenceRef : null}
                              onClick={() => handleSelectSentence(sentence)}
                              onPointerDown={() => handlePointerDown(sentence)}
                              onPointerUp={handlePointerUpOrLeave}
                              onPointerLeave={handlePointerUpOrLeave}
                              className={`reader-sentence inline rounded transition-all cursor-pointer ${
                                isSentenceSelected ? 'reader-sentence-selected' : 'hover:bg-[var(--highlight-bg)]'
                              } ${
                                isSentenceActive ? 'reader-sentence-active bg-[var(--accent-glow)] ring-1 ring-[var(--accent)] shadow-md' : ''
                              }`}
                            >
                              <span
                                style={{
                                  backgroundColor: isHighlighted ? `${highlightColor}38` : undefined,
                                  borderBottom: isHighlighted ? `2.5px solid ${highlightColor}` : undefined,
                                  boxShadow: isHighlighted ? `0 0 12px ${highlightColor}44` : undefined,
                                  borderRadius: '4px',
                                  padding: isHighlighted ? '2px 4px' : undefined,
                                }}
                              >
                                {showCharacterName && (
                                  <span className="mr-1 font-semibold text-[var(--accent)]">
                                    {sentence.character}:
                                  </span>
                                )}
                                {(() => {
                                  return displayTokens.map((token, tokenIndex) => {
                                    if (/^\s+$/u.test(token)) {
                                      return <React.Fragment key={`space-${tokenIndex}`}>{token}</React.Fragment>
                                    }
                                    const speechWordIndex = displayWordIndexes[tokenIndex]
                                    const isWordActive = isSentenceActive && speechWordIndex === currentWordIndex
                                    const isWordTrail = isSentenceActive && currentWordIndex > -1 &&
                                      speechWordIndex !== undefined && speechWordIndex < currentWordIndex
                                    return (
                                      <span
                                        key={`word-${tokenIndex}`}
                                        data-tts-word={speechWordIndex}
                                        className={`rounded transition-all duration-150 ${
                                          isWordActive
                                            ? 'bg-[var(--accent)] text-white font-black shadow-md shadow-[var(--accent-glow)]'
                                            : isWordTrail
                                            ? 'text-[var(--accent)] font-semibold opacity-80'
                                            : ''
                                        }`}
                                      >
                                        {token}
                                      </span>
                                    )
                                  })
                                })()}
                              </span>
                              {sentenceNumber < paragraph.length - 1 ? ' ' : null}
                              {sentenceAnnotation?.noteText && (
                                <span className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-2.5 text-xs text-[var(--text-secondary)]">
                                  <span className="material-icons-round text-base text-[var(--accent)]">sticky_note_2</span>
                                  <span>{sentenceAnnotation.noteText}</span>
                                </span>
                              )}
                            </span>
                            {sentenceNumber < paragraph.length - 1 ? ' ' : ''}
                          </React.Fragment>
                        )
                      })}
                    </p>
                  ))}
                </div>
              </div>
            )
          })}
          <div aria-hidden="true" style={{
            height: `${Math.max(0, (pageOffsets[readerPageCount] ?? 0) - (pageOffsets[virtualEnd] ?? 0))}px`,
          }} />
        </div>
        )}
      </main>

      {/* ─── Long-Press Context Menu (>= 500ms) ─── */}
      {contextAction && (
        <div
          className="modal-overlay modal-overlay-bottom animate-fade-in-up"
          onClick={() => { setContextAction(null); setShowAddNoteInput(false) }}
        >
          <div
            className="modal-container glass-card p-4 rounded-3xl border shadow-2xl flex flex-col gap-3"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--accent)',
              boxShadow: '0 0 25px var(--accent-glow)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider">
              Acción en el Texto
            </span>

            <p className="text-xs italic text-[var(--text-secondary)] line-clamp-2">
              «{contextAction.text}»
            </p>

            {/* Read From Here Button */}
            <button
              onClick={() => handleReadFromContext(contextAction.sentenceIndex)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 shadow-lg"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              }}
            >
              <span className="material-icons-round text-base">play_arrow</span>
              Continuar Lectura Desde Aquí
            </button>

            {/* Highlight or Remove Highlight */}
            {contextAction.existingAnnotationId ? (
              <button
                onClick={() => handleRemoveHighlight(contextAction.existingAnnotationId!)}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-[var(--bg-input)] text-[var(--danger)] border border-[var(--danger)] flex items-center justify-center gap-2"
              >
                <span className="material-icons-round text-base">format_color_reset</span>
                Quitar Subrayado de este Texto
              </button>
            ) : (
              <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-input)]">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Subrayar:</span>
                <div className="flex items-center gap-2">
                  {[
                    { color: '#facc15', label: 'Amarillo' },
                    { color: '#4ade80', label: 'Verde' },
                    { color: '#ff6b9d', label: 'Rosa' },
                    { color: '#60a5fa', label: 'Azul' },
                  ].map(c => (
                    <button
                      key={c.color}
                      onClick={() => handleHighlight(c.color)}
                      className="w-6 h-6 rounded-full border-2 border-white shadow transition-transform hover:scale-125"
                      style={{ background: c.color }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Add Note Button */}
            {!showAddNoteInput ? (
              <button
                onClick={() => setShowAddNoteInput(true)}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-[var(--bg-input)] text-[var(--text-primary)] hover:border-[var(--accent)] border border-[var(--border-color)] flex items-center justify-center gap-2"
              >
                <span className="material-icons-round text-base">edit_note</span>
                Escribir Nota Personal
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <textarea
                  value={noteInputText}
                  onChange={(e) => setNoteInputText(e.target.value)}
                  placeholder="Escribe tu nota aquí..."
                  className="w-full p-2.5 rounded-xl text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none resize-none h-18"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowAddNoteInput(false)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-input)]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveNote}
                    className="px-4 py-1.5 text-xs font-bold text-white rounded-lg bg-[var(--accent)]"
                  >
                    Guardar Nota
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Bottom Player Bar ─── */}
      <PlayerBar
        book={playerBook}
        totalSentences={totalSentences}
        currentSentenceIndex={currentSentenceIndex}
        currentPageIndex={currentPageIndex}
        isPlaying={isPlaying}
        isPaused={isPaused}
        speed={speed}
        onPlayPause={handlePlayPause}
        onStop={handleStop}
        onSeekSeconds={handleSeekSeconds}
        onSeekStart={() => {
          setProgrammaticNavigation(2000)
          if (isPlaying) cancelActivePlayback()
        }}
        onSeekFraction={(fraction) => {
          setProgrammaticNavigation(1000)
          // Problema 4: traduce el avance a una página y busca su primera frase.
          if (readerPageCount === 0) return
          const targetPage = Math.round(fraction * Math.max(0, readerPageCount - 1))
          previewPage(targetPage)
          const targetSentence = findSentenceForPage(targetPage)
          if (targetSentence !== undefined) seekToSentence(targetSentence)
        }}
        onSeekComplete={(fraction) => {
          setProgrammaticNavigation(1500)
          if (!isPlaying) return
          if (readerPageCount === 0) return
          const targetPage = Math.round(fraction * Math.max(0, readerPageCount - 1))
          const targetSentence = findSentenceForPage(targetPage)
          if (targetSentence !== undefined) void playFromSentence(targetSentence)
        }}
        onJumpToPage={(pageIndex) => {
          setProgrammaticNavigation(1500)
          const wasPlaying = isPlaying
          jumpToPage(pageIndex)
          const firstSentence = findSentenceForPage(pageIndex)
          if (firstSentence !== undefined) {
            if (isPlaying || isPaused) cancelActivePlayback()
            seekToSentence(firstSentence)
            if (wasPlaying) void playFromSentence(firstSentence)
          }
        }}
        onSeekPagePreview={(targetPage) => {
          setProgrammaticNavigation(800)
          previewPage(targetPage)
        }}
        onSleepTimer={() => setShowSleepTimer(true)}
        onSpeedChange={handleRateChange}
      />

      {/* ─── Floating Voice Drawer ─── */}
      {showFloatingVoice && (
        <FloatingVoiceMenu
          book={book}
          onClose={() => setShowFloatingVoice(false)}
          onVoiceSelected={voiceId => {
            if (!isPlayingRef.current) return
            const resumeWordIndex = Math.max(0, currentWordIndexRef.current)
            cancelActivePlayback()
            void playFromSentence(currentSentenceIndex, resumeWordIndex, voiceId)
          }}
          onOpenStudioForVoice={(vId, charName) => {
            setShowFloatingVoice(false)
            setStudioTargetVoiceId(vId)
            setStudioTargetCharName(charName || null)
          }}
        />
      )}

      {/* ─── Notes & Highlights Drawer ─── */}
      {showNotesDrawer && (
        <NotesDrawer
          book={book}
          onClose={() => setShowNotesDrawer(false)}
          onJumpToSentence={(sentenceIdx) => {
            const targetSentence = book.sentences[sentenceIdx]
            if (targetSentence && targetSentence.pageNumber) {
              const pIdx = targetSentence.pageNumber - 1
              jumpToPage(sentencePages[sentenceIdx] ?? pIdx)
            }
            seekToSentence(sentenceIdx)
            if (isPlaying) playFromSentence(sentenceIdx)
          }}
        />
      )}

      {/* ─── Unregistered Character Neon Modal ─── */}
      {unregisteredChar && (
        <UnregisteredCharacterModal
          characterName={unregisteredChar}
          narratorVoiceName={getVoiceById(book.narratorVoiceId)?.name || 'Narrador'}
          onUseNarrator={async () => {
            try {
              await assignVoice(book.id, unregisteredChar, book.narratorVoiceId)
              setUnregisteredChar(null)
              void playFromSentence(currentSentenceIndex, 0, book.narratorVoiceId)
            } catch (error) {
              console.error('[VoxLector] No se pudo guardar la voz del personaje:', error)
              window.alert('No se pudo guardar la asignación de voz. Inténtalo de nuevo.')
            }
          }}
          onAssignExisting={async (voiceId) => {
            try {
              await assignVoice(book.id, unregisteredChar, voiceId)
              setUnregisteredChar(null)
              void playFromSentence(currentSentenceIndex, 0, voiceId)
            } catch (error) {
              console.error('[VoxLector] No se pudo guardar la voz del personaje:', error)
              window.alert('No se pudo guardar la asignación de voz. Inténtalo de nuevo.')
            }
          }}
          onOpenStudio={() => {
            setStudioTargetCharName(unregisteredChar)
            setStudioTargetVoiceId(null)
            setStudioAssignsNewNarrator(false)
            setShowVoiceStudio(true)
            setUnregisteredChar(null)
          }}
        />
      )}

      {/* ─── Other Modals ─── */}
      {showCharBoard && (
        <CharacterBoardModal
          book={book}
          onClose={() => setShowCharBoard(false)}
          onVoiceSelected={voiceId => {
            if (!isPlayingRef.current) return
            const resumeWordIndex = Math.max(0, currentWordIndexRef.current)
            cancelActivePlayback()
            void playFromSentence(currentSentenceIndex, resumeWordIndex, voiceId)
          }}
          onOpenStudio={(vId, charName) => {
            setShowCharBoard(false)
            setStudioTargetVoiceId(vId || null)
            setStudioTargetCharName(charName || null)
            setStudioAssignsNewNarrator(!vId && !charName)
            setShowVoiceStudio(true)
          }}
        />
      )}
      {showSettings && <SettingsModal readingMode={book.readingMode} onClose={() => setShowSettings(false)} />}
      {showSleepTimer && <SleepTimerModal onClose={() => setShowSleepTimer(false)} />}

      {/* Studio Modal Target */}
      {showVoiceStudio && (
        <VoiceStudioModal
          voiceToEditId={studioTargetVoiceId || undefined}
          initialCharacter={studioTargetCharName || undefined}
          onClose={() => {
            setShowVoiceStudio(false)
            setStudioTargetVoiceId(null)
            setStudioTargetCharName(null)
            setStudioAssignsNewNarrator(false)
          }}
          onVoiceSaved={async savedVoiceId => {
            if (studioTargetCharName) {
              await assignVoice(book.id, studioTargetCharName, savedVoiceId)
            } else if (studioAssignsNewNarrator) {
              await setNarratorVoice(book.id, savedVoiceId)
            }
            const shouldPlaySavedVoice = Boolean(studioTargetCharName || studioAssignsNewNarrator)
            setShowVoiceStudio(false)
            setStudioTargetVoiceId(null)
            setStudioTargetCharName(null)
            setStudioAssignsNewNarrator(false)
            void playFromSentence(
              currentSentenceIndex,
              0,
              shouldPlaySavedVoice ? savedVoiceId : undefined,
            )
          }}
        />
      )}

      {/* Friendly Exit / Pause Confirmation Modal */}
      {showExitModal && (
        <ExitConfirmationModal
          isOpen={showExitModal}
          bookTitle={book.title}
          currentPage={currentPageIndex}
          totalPages={activePageCount}
          progressPercent={totalSentences > 0 ? (currentSentenceIndex / totalSentences) * 100 : 0}
          onContinueReading={() => setShowExitModal(false)}
          onBackToLibrary={handleBackToLibrary}
          onExit={handleConfirmExitApp}
        />
      )}
    </div>
  )
}
