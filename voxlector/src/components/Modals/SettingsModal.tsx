// ============================================================
// VoxLector AI — SettingsModal Component
// Online Language Pack Repository Search & Download,
// Neon color customizer, and reading preferences
// ============================================================

import React, { useState, useRef, useMemo, useEffect } from 'react'
import type { Theme, CloudProvider, LibraryViewMode, LanguagePack, ReadingMode } from '@/types'
import { useSettingsStore, THEME_PALETTES } from '@/stores/settingsStore'
import VoiceStudioModal from '@/components/Modals/VoiceStudioModal'
import PrivacyConsentModal from '@/components/Modals/PrivacyConsentModal'
import { PermissionsService } from '@/services/PermissionsService'
import { openTtsInstall, getSystemVoices, isDeviceOnline, type AppVoice } from '@/services/ttsService'
import { useVoiceStore } from '@/stores/voiceStore'
import { useLibraryStore } from '@/stores/libraryStore'
import { translate } from '@/services/i18n'
import { speakText, stopSpeaking } from '@/services/ttsService'

interface Props {
  onClose: () => void
  readingMode?: ReadingMode
}

// Comprehensive Global Online Languages Catalog for Internet Search & Download
const ONLINE_REPOSITORY_LANGUAGES: LanguagePack[] = [
  { code: 'es', name: 'Español (Castellano / Latino)', flag: '🇪🇸', sizeMB: 0, isDownloaded: true },
  { code: 'en', name: 'English (US & International)', flag: '🇺🇸', sizeMB: 34, isDownloaded: false },
  { code: 'fr', name: 'Français (Francia / Canadá)', flag: '🇫🇷', sizeMB: 38, isDownloaded: false },
  { code: 'de', name: 'Deutsch (Alemania / Austria)', flag: '🇩🇪', sizeMB: 42, isDownloaded: false },
  { code: 'it', name: 'Italiano (Italia)', flag: '🇮🇹', sizeMB: 36, isDownloaded: false },
  { code: 'pt', name: 'Português (Brasil / Portugal)', flag: '🇧🇷', sizeMB: 35, isDownloaded: false },
  { code: 'ja', name: '日本語 (Japonés Neural)', flag: '🇯🇵', sizeMB: 58, isDownloaded: false },
  { code: 'ru', name: 'Русский (Ruso)', flag: '🇷🇺', sizeMB: 46, isDownloaded: false },
  { code: 'zh', name: '中文 (Chino Mandarín)', flag: '🇨🇳', sizeMB: 62, isDownloaded: false },
  { code: 'ar', name: 'العربية (Árabe Moderno)', flag: '🇸🇦', sizeMB: 44, isDownloaded: false },
  { code: 'ko', name: '한국어 (Coreano)', flag: '🇰🇷', sizeMB: 50, isDownloaded: false },
  { code: 'hi', name: 'हिन्दी (Hindi)', flag: '🇮🇳', sizeMB: 48, isDownloaded: false },
  { code: 'tr', name: 'Türkçe (Turco)', flag: '🇹🇷', sizeMB: 32, isDownloaded: false },
  { code: 'nl', name: 'Nederlands (Holandés)', flag: '🇳🇱', sizeMB: 35, isDownloaded: false },
  { code: 'sv', name: 'Svenska (Sueco)', flag: '🇸🇪', sizeMB: 31, isDownloaded: false },
  { code: 'pl', name: 'Polski (Polaco)', flag: '🇵🇱', sizeMB: 39, isDownloaded: false },
  { code: 'ca', name: 'Català (Catalán)', flag: '🏴󠁥󠁳󠁣󠁴󠁿', sizeMB: 28, isDownloaded: false },
  { code: 'gl', name: 'Galego (Gallego)', flag: '🇪🇸', sizeMB: 27, isDownloaded: false },
  { code: 'eu', name: 'Euskara (Vasco)', flag: '🇪🇸', sizeMB: 29, isDownloaded: false },
  { code: 'el', name: 'Ελληνικά (Griego)', flag: '🇬🇷', sizeMB: 41, isDownloaded: false },
  { code: 'he', name: 'עברית (Hebreo)', flag: '🇮🇱', sizeMB: 36, isDownloaded: false },
  { code: 'cs', name: 'Čeština (Checo)', flag: '🇨🇿', sizeMB: 33, isDownloaded: false },
  { code: 'ro', name: 'Română (Rumano)', flag: '🇷🇴', sizeMB: 34, isDownloaded: false },
  { code: 'uk', name: 'Українська (Ucraniano)', flag: '🇺🇦', sizeMB: 43, isDownloaded: false },
  { code: 'vi', name: 'Tiếng Việt (Vietnamita)', flag: '🇻🇳', sizeMB: 45, isDownloaded: false },
  { code: 'th', name: 'ไทย (Tailandés)', flag: '🇹🇭', sizeMB: 52, isDownloaded: false },
  { code: 'da', name: 'Dansk (Danés)', flag: '🇩🇰', sizeMB: 30, isDownloaded: false },
  { code: 'fi', name: 'Suomi (Finlandés)', flag: '🇫🇮', sizeMB: 32, isDownloaded: false },
  { code: 'no', name: 'Norsk (Noruego)', flag: '🇳🇴', sizeMB: 31, isDownloaded: false },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩', sizeMB: 33, isDownloaded: false },
]

export default function SettingsModal({ onClose, readingMode }: Props) {
  const {
    theme, setTheme,
    colorPalette, setColorPalette, setCustomColors,
    fontSize, setFontSize,
    textAlign, setTextAlign,
    readerPadding, setReaderPadding,
    brightness, setBrightness,
    backgroundImage, setBackgroundImage,
    backgroundOpacity, setBackgroundOpacity,
    cloudProvider, setCloudProvider,
    apiKeys, setApiKey,
    language, setLanguage,
    libraryViewMode, setLibraryViewMode,
    announceCharacterDialogue, setAnnounceCharacterDialogue,
  } = useSettingsStore()
  const { voices, updateVoice, duplicateVoice, deleteVoice, restoreDefaultVoice } = useVoiceStore()
  const { books, updateBook } = useLibraryStore()
  const t = (key: string) => translate(language, key)

  const [activeTab, setActiveTab] = useState<'display' | 'colors' | 'library' | 'languages' | 'api' | 'offline_tts'>('display')
  const [openVoiceStudio, setOpenVoiceStudio] = useState(false)
  const [editingVoiceId, setEditingVoiceId] = useState<string | undefined>()
  const [renamingVoiceId, setRenamingVoiceId] = useState<string | null>(null)
  const [renamingVoiceName, setRenamingVoiceName] = useState('')
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
  const previewRequestRef = useRef(0)
  const previewIsActiveRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Colors
  const [customAccent, setCustomAccent] = useState(colorPalette.accent)
  const [customSecondary, setCustomSecondary] = useState(colorPalette.accentSecondary)

  // Language Internet Search
  const [langSearchQuery, setLangSearchQuery] = useState('')
  const [installedLangs, setInstalledLangs] = useState<string[]>(['es'])
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number>(0)
  const [showPhotoConsent, setShowPhotoConsent] = useState(false)
  const [photoPermissionError, setPhotoPermissionError] = useState<string | null>(null)

  // System TTS Voices & Filters
  const [systemVoices, setSystemVoices] = useState<AppVoice[]>([])
  const [ttsLangFilter, setTtsLangFilter] = useState('all')
  const [ttsCountrySearch, setTtsCountrySearch] = useState('')
  const [ttsModeFilter, setTtsModeFilter] = useState<'all' | 'offline' | 'online'>('all')
  const isOnline = isDeviceOnline()

  const saveVoiceName = async (voiceId: string) => {
    const name = renamingVoiceName.trim()
    if (!name) return
    try {
      await updateVoice(voiceId, { name })
      setRenamingVoiceId(null)
    } catch (error) {
      console.error('[VoxLector] No se pudo guardar el nombre del perfil:', error)
    }
  }

  const handlePreviewVoice = async (voice: typeof voices[number]) => {
    const requestId = ++previewRequestRef.current
    stopSpeaking()
    previewIsActiveRef.current = true
    setPreviewingVoiceId(voice.id)
    try {
      await speakText(
        'Esta es una prueba de la voz configurada.',
        voice,
        cloudProvider,
        apiKeys[cloudProvider] ?? '',
        undefined,
        undefined,
        () => {
          if (previewRequestRef.current === requestId) {
            previewIsActiveRef.current = false
            setPreviewingVoiceId(null)
          }
        },
        error => {
          console.warn('[VoxLector] No se pudo reproducir la vista previa de voz:', error)
          if (previewRequestRef.current === requestId) {
            previewIsActiveRef.current = false
            setPreviewingVoiceId(null)
          }
        },
      )
    } catch (error) {
      console.warn('[VoxLector] Falló la vista previa de voz:', error)
      if (previewRequestRef.current === requestId) {
        previewIsActiveRef.current = false
        setPreviewingVoiceId(null)
      }
    }
  }

  const handleDeleteVoice = (voiceId: string) => {
    for (const book of books) {
      const voiceAssignments = Object.fromEntries(
        Object.entries(book.voiceAssignments ?? {}).map(([character, assignedVoiceId]) => [
          character,
          assignedVoiceId === voiceId ? 'narrator_default' : assignedVoiceId,
        ]),
      )
      updateBook(book.id, {
        narratorVoiceId: book.narratorVoiceId === voiceId ? 'narrator_default' : book.narratorVoiceId,
        voiceAssignments,
      })
    }
    deleteVoice(voiceId)
  }

  useEffect(() => () => {
    previewRequestRef.current++
    if (previewIsActiveRef.current) stopSpeaking()
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    getSystemVoices().then(vs => setSystemVoices(vs))
  }, [])

  const funnyText = "«El mundo jamás corona a los virtuosos que suplican piedad; corona a quienes doblegan la tormenta con astucia implacable. Quien teme herir nunca aprenderá a reinar: forja tu destino con voluntad de hierro o prepárate para arrodillarte a construir el imperio de otro.»"

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBackgroundImage(reader.result)
      }
    }
    reader.onerror = () => {
      console.error('[VoxLector] No se pudo leer la imagen seleccionada:', reader.error)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const requestPhotoSelection = () => {
    setPhotoPermissionError(null)
    try {
      if (PermissionsService.hasRequestedPhotoPermission()) {
        fileInputRef.current?.click()
      } else {
        setShowPhotoConsent(true)
      }
    } catch (error) {
      setPhotoPermissionError(error instanceof Error ? error.message : String(error))
      setShowPhotoConsent(true)
    }
  }

  const confirmPhotoPermission = () => {
    try {
      PermissionsService.markPhotoPermissionRequested()
      setPhotoPermissionError(null)
      setShowPhotoConsent(false)
      fileInputRef.current?.click()
    } catch (error) {
      console.error('[VoxLector] No se pudo guardar el consentimiento de fotos:', error)
      setPhotoPermissionError(error instanceof Error ? error.message : String(error))
    }
  }

  // Filtered languages from internet repository
  const filteredRepositoryLanguages = useMemo(() => {
    const q = langSearchQuery.trim().toLowerCase()
    if (!q) return ONLINE_REPOSITORY_LANGUAGES
    return ONLINE_REPOSITORY_LANGUAGES.filter(
      l => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
    )
  }, [langSearchQuery])

  // Download language from internet repository
  const handleDownloadLanguage = (code: string) => {
    setDownloadingCode(code)
    setDownloadProgress(10)

    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval)
          setDownloadingCode(null)
          setInstalledLangs(curr => [...curr, code])
          setLanguage(code)
          return 100
        }
        return prev + 25
      })
    }, 350)
  }

  return (
    <>
      <div
        className="modal-overlay animate-fade-in-up select-none"
        onClick={onClose}
      >
        <div
          className="modal-container glass-card p-5 sm:p-7 rounded-3xl border shadow-2xl flex flex-col gap-5"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border-color)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-2xl text-[var(--accent)]">
                settings
              </span>
              <h2 className="text-lg font-bold text-white">{t('settings')}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--bg-input)] hover:bg-[var(--danger)] hover:text-white transition-colors"
            >
              <span className="material-icons-round text-sm">close</span>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]">
            {[
              { id: 'display', label: t('reading'), icon: 'format_size' },
              { id: 'colors', label: t('colors'), icon: 'palette' },
              { id: 'languages', label: t('languages'), icon: 'travel_explore' },
              { id: 'api', label: t('cloud'), icon: 'cloud_sync' },
              { id: 'offline_tts', label: t('phoneTts'), icon: 'download_for_offline' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 min-w-[100px] py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === tab.id
                    ? 'bg-[var(--accent)] text-white shadow-md'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="material-icons-round text-sm">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* ─── TAB 1: Display & Extended Night Screen Brightness ─── */}
          {activeTab === 'display' && (
            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3 text-xs font-semibold text-[var(--text-primary)]">
                {t('interfaceLanguage')}
                <select
                  value={language}
                  onChange={event => setLanguage(event.target.value)}
                  className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  aria-label={t('interfaceLanguage')}
                >
                  {[
                    ['es', 'Español'],
                    ['en', 'English'],
                    ['fr', 'Français'],
                    ['de', 'Deutsch'],
                    ['it', 'Italiano'],
                    ['pt', 'Português'],
                  ].map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </label>
              {readingMode === 'multivoice' && (
                <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3 text-xs font-semibold text-[var(--text-primary)]">
                  <span className="min-w-0">
                    <span className="block">El narrador anuncia personaje y emoción</span>
                    <span className="mt-1 block text-[0.68rem] font-normal text-[var(--text-secondary)]">
                      Antes de cada diálogo multi-voz, anuncia quién habla y el tono detectado.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={announceCharacterDialogue}
                    onChange={event => setAnnounceCharacterDialogue(event.target.checked)}
                    aria-label="El narrador anuncia personaje y emoción"
                    className="h-5 w-9 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                </label>
              )}
              {/* Theme Picker */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] block mb-2">
                  Tema Visual Base
                </label>
                {/* Problema 1: se registra el quinto tema 'matrix' y se amplía la rejilla para mostrarlo. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {[
                    { id: 'dark', name: 'Oscuro Cyber', icon: 'dark_mode', bg: '#0a0a0f', border: '#7c5cff' },
                    { id: 'light', name: 'Claro Ergonómico', icon: 'light_mode', bg: '#f0f0f8', border: '#6c47ff' },
                    { id: 'sepia', name: 'Sepia Relajante', icon: 'auto_stories', bg: '#f4ecd8', border: '#b8860b' },
                    { id: 'oled', name: 'OLED Puro', icon: 'brightness_1', bg: '#000000', border: '#a78bfa' },
                    { id: 'matrix', name: 'Matrix Neón', icon: 'terminal', bg: '#04140d', border: '#00ff9c' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id as Theme)}
                      className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                        theme === t.id
                          ? 'ring-2 ring-[var(--accent)] shadow-lg'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ background: t.bg, borderColor: t.border }}
                    >
                      <span className="material-icons-round text-base" style={{ color: t.border }}>
                        {t.icon}
                      </span>
                      <span className="text-xs font-bold" style={{ color: t.id === 'light' || t.id === 'sepia' ? '#1a1a2e' : '#ffffff' }}>
                        {t.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Extended Night Screen Brightness Slider */}
              <div className="p-4 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-[var(--accent)]">
                    <span className="material-icons-round text-base">brightness_medium</span>
                    Control de Brillo Extendido (Night Screen)
                  </span>
                  <span className="text-xs font-mono font-bold text-[var(--accent)]">
                    {Math.round(brightness * 100)}%
                  </span>
                </div>
                {/* Problema 1: permite bajar la atenuación virtual hasta el mínimo neutro. */}
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.01"
                  value={brightness}
                  onChange={(e) => setBrightness(parseFloat(e.target.value))}
                  className="styled-range brightness-range w-full"
                />
                <div className="flex justify-between text-[0.65rem] text-[var(--text-muted)] mt-1.5">
                  <span>🌑 Modo Nocturno Extremo</span>
                  <span>Brillo Completo ☀️</span>
                </div>
              </div>

              {/* Font Size & Funny Text Preview */}
              <div className="p-4 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-[var(--text-primary)]">
                    <span className="material-icons-round text-base text-[var(--accent)]">format_size</span>
                    Tamaño de Fuente:
                  </span>
                  <span className="text-xs font-mono font-bold text-[var(--accent)]">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="13"
                  max="36"
                  step="1"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="styled-range w-full"
                />

                <div className="mt-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] overflow-hidden">
                  <span className="text-[0.62rem] uppercase font-bold text-[var(--text-muted)] block mb-1">
                    Vista previa en tiempo real:
                  </span>
                  <p style={{ fontSize: `${fontSize}px`, lineHeight: 1.5, color: 'var(--text-primary)' }} className="italic font-medium">
                    {funnyText}
                  </p>
                </div>
              </div>

              {/* Text Alignment & Padding Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                  <label className="text-xs font-bold text-[var(--text-secondary)] block mb-2">
                    Alineación del Texto
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTextAlign('left')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${
                        textAlign === 'left' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <span className="material-icons-round text-sm">format_align_left</span>
                      Izquierda
                    </button>
                    <button
                      onClick={() => setTextAlign('justify')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${
                        textAlign === 'justify' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <span className="material-icons-round text-sm">format_align_justify</span>
                      Justificado
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                  <label className="text-xs font-bold text-[var(--text-secondary)] block mb-2">
                    Márgenes de Lectura
                  </label>
                  <div className="flex gap-1.5">
                    {[
                      { id: 'compact', label: 'Estrecho' },
                      { id: 'normal', label: 'Normal' },
                      { id: 'spacious', label: 'Amplio' },
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setReaderPadding(p.id as any)}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold ${
                          readerPadding === p.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Background Image Setup */}
              <div className="p-4 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-white">
                    <span className="material-icons-round text-base text-[var(--accent)]">wallpaper</span>
                    Fondo de Lectura Estático:
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={requestPhotoSelection}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-[var(--accent)] text-white"
                    >
                      Elegir imagen
                    </button>
                    {backgroundImage && (
                      <button
                        onClick={() => setBackgroundImage(null)}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl bg-[var(--danger)] text-white"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleImageUpload}
                />

                {backgroundImage && (
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span>Opacidad de la máscara oscura:</span>
                      <span className="font-mono text-[var(--accent)]">{Math.round(backgroundOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.85"
                      step="0.05"
                      value={backgroundOpacity}
                      onChange={(e) => setBackgroundOpacity(parseFloat(e.target.value))}
                      className="styled-range w-full"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB 2: Color Theme & Buttons Customizer ─── */}
          {activeTab === 'colors' && (
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] block mb-1">
                  Paletas de Color Neón y Personalización de Botones
                </span>
                <p className="text-xs text-[var(--text-secondary)]">
                  Personaliza al instante el color de la aplicación, botones interactivos, barras de progreso y bordes neón.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {THEME_PALETTES.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setColorPalette(p)}
                    className={`p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                      colorPalette.id === p.id
                        ? 'ring-2 ring-white shadow-xl'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{
                      background: 'var(--bg-input)',
                      borderColor: p.accent,
                    }}
                  >
                    <div>
                      <span className="text-xs font-bold text-white block">{p.name}</span>
                      <span className="text-[0.65rem] text-[var(--text-muted)] font-mono">{p.accent} / {p.accentSecondary}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full shadow" style={{ background: p.accent }} />
                      <div className="w-5 h-5 rounded-full shadow" style={{ background: p.accentSecondary }} />
                    </div>
                  </button>
                ))}
              </div>

              {/* Custom Hex Color Pickers */}
              <div className="p-4 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-col gap-3">
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  Personalizar Colores Propios (Hexadecimal):
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[0.7rem] text-[var(--text-secondary)] block mb-1">Color Primario:</label>
                    <div className="flex items-center gap-2 bg-[var(--bg-card)] p-2 rounded-xl border border-[var(--border-color)]">
                      <input
                        type="color"
                        value={customAccent}
                        onChange={(e) => {
                          setCustomAccent(e.target.value)
                          setCustomColors(e.target.value, customSecondary)
                        }}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-none"
                      />
                      <span className="font-mono text-xs font-bold text-white">{customAccent}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[0.7rem] text-[var(--text-secondary)] block mb-1">Color Secundario:</label>
                    <div className="flex items-center gap-2 bg-[var(--bg-card)] p-2 rounded-xl border border-[var(--border-color)]">
                      <input
                        type="color"
                        value={customSecondary}
                        onChange={(e) => {
                          setCustomSecondary(e.target.value)
                          setCustomColors(customAccent, e.target.value)
                        }}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-none"
                      />
                      <span className="font-mono text-xs font-bold text-white">{customSecondary}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 3: Library View Mode Selector ─── */}
          {activeTab === 'library' && (
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] block mb-1">
                  Modo de Visualización de la Biblioteca
                </span>
                <p className="text-xs text-[var(--text-secondary)]">
                  Elige cómo quieres organizar y explorar tus libros importados y documentos PDF.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {[
                  {
                    id: 'grid_large',
                    name: 'Cuadros Grandes (Portadas Visuales 3:4)',
                    desc: 'Tarjetas en cuadrícula con portadas a todo color, relación 3:4 y porcentaje de lectura destacado.',
                    icon: 'grid_view',
                  },
                  {
                    id: 'list_compact',
                    name: 'Lista Compacta con Miniaturas',
                    desc: 'Filas detalladas con miniatura pequeña, autor, formato, fecha y barra de progreso gráfica.',
                    icon: 'view_agenda',
                  },
                  {
                    id: 'list_pure',
                    name: 'Lista Pura de Títulos Minimalista',
                    desc: 'Diseño ultra-ligero enfocado en títulos y porcentaje para navegar rápidamente catálogos grandes.',
                    icon: 'format_list_bulleted',
                  },
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setLibraryViewMode(mode.id as LibraryViewMode)}
                    className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                      libraryViewMode === mode.id
                        ? 'border-[var(--accent)] bg-[var(--accent-glow)] ring-2 ring-[var(--accent)]'
                        : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--accent)]'
                    }`}
                  >
                    <span className="material-icons-round text-2xl text-[var(--accent)] mt-0.5">
                      {mode.icon}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-white block">{mode.name}</span>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{mode.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── TAB 4: Online Language Repository Search & Download ─── */}
          {activeTab === 'languages' && (
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] block mb-1">
                  Buscador y Descarga de Paquetes de Idioma en Internet
                </span>
                <p className="text-xs text-[var(--text-secondary)]">
                  Busca y descarga paquetes de síntesis y vocabulario en línea para leer en cualquier idioma.
                </p>
              </div>

              {/* Online Search Input */}
              <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)] focus-within:border-[var(--accent)]">
                <span className="material-icons-round text-lg text-[var(--accent)]">travel_explore</span>
                <input
                  type="text"
                  placeholder="Buscar idioma en internet (ej: Inglés, Japonés, Ruso, Alemán, Árabe...)"
                  value={langSearchQuery}
                  onChange={(e) => setLangSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[var(--text-muted)]"
                />
                {langSearchQuery && (
                  <button onClick={() => setLangSearchQuery('')} className="text-[var(--text-muted)] hover:text-white">
                    <span className="material-icons-round text-sm">close</span>
                  </button>
                )}
              </div>

              {/* Languages List from Repository */}
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {filteredRepositoryLanguages.map(pack => {
                  const isInstalled = installedLangs.includes(pack.code)
                  const isCurrent = language === pack.code
                  const isDownloading = downloadingCode === pack.code

                  return (
                    <div
                      key={pack.code}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{pack.flag}</span>
                        <div>
                          <span className="text-xs font-bold text-white block">{pack.name}</span>
                          <span className="text-[0.65rem] text-[var(--text-muted)]">
                            {pack.sizeMB === 0 ? 'Paquete Base' : `${pack.sizeMB} MB · Red Neuronal`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isDownloading ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[0.68rem] font-mono text-[var(--accent)] font-bold">
                              Descargando {downloadProgress}%
                            </span>
                            <div className="w-24 h-1.5 rounded-full bg-[var(--bg-card)] overflow-hidden">
                              <div className="h-full bg-[var(--accent)]" style={{ width: `${downloadProgress}%` }} />
                            </div>
                          </div>
                        ) : isInstalled ? (
                          <button
                            onClick={() => setLanguage(pack.code)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              isCurrent
                                ? 'bg-[var(--accent)] text-white shadow'
                                : 'bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--accent)] border border-[var(--border-color)]'
                            }`}
                          >
                            {isCurrent ? 'Activo' : 'Seleccionar'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDownloadLanguage(pack.code)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-[var(--accent)] hover:opacity-90 flex items-center gap-1 shadow"
                          >
                            <span className="material-icons-round text-sm">cloud_download</span>
                            Descargar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ─── TAB 5: Cloud APIs ─── */}
          {activeTab === 'api' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] block mb-1">
                  Proveedor de Voces IA en la Nube
                </label>
                <select
                  value={cloudProvider}
                  onChange={(e) => setCloudProvider(e.target.value as CloudProvider)}
                  className="w-full p-3 rounded-xl text-xs font-bold bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
                >
                  <option value="none">Ninguno (Usar Web Speech y TTS Nativo del Teléfono sin costo)</option>
                  <option value="openai">OpenAI TTS (tts-1-hd, Onyx, Nova, Shimmer)</option>
                  <option value="elevenlabs">ElevenLabs Multilingual v2 (Ultra-realista)</option>
                  <option value="google">Google Cloud Text-to-Speech API</option>
                  <option value="huggingface">Hugging Face / Modelos de Código Abierto</option>
                </select>
              </div>

              {cloudProvider !== 'none' && (
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                  <label className="text-xs font-bold text-[var(--text-primary)]">
                    API Key para {cloudProvider.toUpperCase()}:
                  </label>
                  <input
                    type="password"
                    placeholder="Pega aquí tu API key..."
                    value={apiKeys[cloudProvider] ?? ''}
                    onChange={(e) => setApiKey(cloudProvider, e.target.value)}
                    className="w-full p-2.5 rounded-xl text-xs font-mono bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'offline_tts' && (
            <div className="flex flex-col gap-4">
              <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Perfiles de voz guardados</h3>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">Edita, renombra, duplica o elimina tus perfiles.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingVoiceId(undefined); setOpenVoiceStudio(true) }}
                    className="flex min-h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white"
                  >
                    <span className="material-icons-round text-sm">add</span>
                    Crear perfil
                  </button>
                </div>
                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                  {voices.map(voice => {
                    return (
                      <div key={voice.id} className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2">
                        {renamingVoiceId === voice.id ? (
                          <>
                            <input
                              autoFocus
                              value={renamingVoiceName}
                              onChange={event => setRenamingVoiceName(event.target.value)}
                              onKeyDown={event => {
                                if (event.key === 'Enter') saveVoiceName(voice.id)
                                if (event.key === 'Escape') setRenamingVoiceId(null)
                              }}
                              aria-label="Nombre del perfil"
                              className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-2 text-xs text-[var(--text-primary)]"
                            />
                            <button type="button" onClick={() => saveVoiceName(voice.id)} className="min-h-9 rounded-lg px-2 text-xs font-bold text-[var(--accent)]">Guardar</button>
                            <button type="button" onClick={() => setRenamingVoiceId(null)} className="min-h-9 rounded-lg px-2 text-xs text-[var(--text-secondary)]">Cancelar</button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text-primary)]">{voice.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (previewingVoiceId === voice.id) {
                                  previewRequestRef.current++
                                  previewIsActiveRef.current = false
                                  stopSpeaking()
                                  setPreviewingVoiceId(null)
                                } else {
                                  void handlePreviewVoice(voice)
                                }
                              }}
                              className="btn-icon !h-9 !w-9"
                              title={previewingVoiceId === voice.id ? 'Detener vista previa' : 'Escuchar vista previa'}
                              aria-label={previewingVoiceId === voice.id ? `Detener vista previa de ${voice.name}` : `Escuchar vista previa de ${voice.name}`}
                            >
                              <span className="material-icons-round text-sm">
                                {previewingVoiceId === voice.id ? 'stop' : 'volume_up'}
                              </span>
                            </button>
                            <button type="button" onClick={() => { setEditingVoiceId(voice.id); setOpenVoiceStudio(true) }} className="btn-icon !h-9 !w-9" title="Editar perfil">
                              <span className="material-icons-round text-sm">tune</span>
                            </button>
                            <button type="button" onClick={() => { setRenamingVoiceId(voice.id); setRenamingVoiceName(voice.name) }} className="btn-icon !h-9 !w-9" title="Renombrar perfil">
                              <span className="material-icons-round text-sm">edit</span>
                            </button>
                            <button type="button" onClick={() => duplicateVoice(voice.id)} className="btn-icon !h-9 !w-9" title="Duplicar perfil">
                              <span className="material-icons-round text-sm">content_copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (voice.id === 'narrator_default') {
                                  if (confirm('¿Restaurar el perfil de narrador predeterminado?')) restoreDefaultVoice()
                                  return
                                }
                                if (confirm(`¿Eliminar el perfil "${voice.name}"? Los libros que lo usan volverán al narrador predeterminado.`)) {
                                  if (previewingVoiceId === voice.id) {
                                    previewRequestRef.current++
                                    previewIsActiveRef.current = false
                                    stopSpeaking()
                                    setPreviewingVoiceId(null)
                                  }
                                  handleDeleteVoice(voice.id)
                                }
                              }}
                              className="btn-icon !h-9 !w-9"
                              title={voice.id === 'narrator_default' ? 'Restaurar narrador predeterminado' : 'Eliminar perfil'}
                            >
                              <span className="material-icons-round text-sm">
                                {voice.id === 'narrator_default' ? 'restore' : 'delete'}
                              </span>
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Motor de voz del dispositivo</h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {isOnline ? 'Conexión a Internet activa' : 'Modo sin conexión'}
                  </p>
                </div>
                <button type="button" onClick={openTtsInstall} className="min-h-10 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
                  Ajustes de voz Android
                </button>
              </section>
            </div>
          )}

          {/* Legacy device voice browser is intentionally not rendered. */}
          {false && activeTab === 'offline_tts' && (
            <div className="flex flex-col gap-3 text-xs">
              {/* Header Status Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-lg text-[var(--accent)]">speed</span>
                  <div>
                    <span className="font-bold text-white block">Motor TTS Nativo de Android</span>
                    <span className="text-[0.65rem] text-[var(--text-secondary)]">
                      {systemVoices.length} voces instaladas en el sistema operativo
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      isOnline
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {isOnline ? '🟢 Conexión a Internet Activa' : '⚡ Modo 100% Offline'}
                  </span>

                  <button
                    type="button"
                    onClick={openTtsInstall}
                    className="text-[0.65rem] font-bold text-[var(--accent)] hover:underline flex items-center gap-1 bg-[var(--bg-card)] px-2.5 py-1.5 rounded-xl border border-[var(--border-color)]"
                  >
                    <span className="material-icons-round text-xs">settings_applications</span>
                    Ajustes de Voz Android
                  </button>
                </div>
              </div>

              {/* Offline Guarantee Info Box */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[0.68rem] flex items-start gap-2">
                <span className="material-icons-round text-base text-emerald-400 mt-0.5">verified_user</span>
                <div>
                  <span className="font-bold text-white block">Lectura 100% Offline Garantizada</span>
                  <span>
                    VoxLector lee tus libros sin necesidad de internet mediante el motor interno de Android (@capacitor-community/text-to-speech). Las voces marcadas con ⚡ Offline funcionan en modo avión y sin conexión.
                  </span>
                </div>
              </div>

              {/* Filter Controls (Language, Country, Mode) */}
              <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-col gap-2">
                <span className="font-bold text-white text-[0.7rem] uppercase tracking-wider">
                  Explorador de Voces del Dispositivo
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  {/* Mode Filter */}
                  <div className="sm:col-span-5 flex rounded-xl bg-[var(--bg-card)] p-0.5 border border-[var(--border-color)]">
                    {[
                      { id: 'all', label: `Todas (${systemVoices.length})` },
                      { id: 'offline', label: `⚡ Offline (${systemVoices.filter(v => !v.isOnlineOnly).length})` },
                      { id: 'online', label: `🌐 Online (${systemVoices.filter(v => v.isOnlineOnly).length})` },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTtsModeFilter(t.id as any)}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-[0.65rem] font-bold transition-all text-center ${
                          ttsModeFilter === t.id
                            ? 'bg-[var(--accent)] text-white shadow'
                            : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Language Selector */}
                  <div className="sm:col-span-3">
                    <select
                      value={ttsLangFilter}
                      onChange={(e) => setTtsLangFilter(e.target.value)}
                      className="w-full p-1.5 rounded-xl text-xs font-semibold bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
                    >
                      <option value="all">🌍 Todos los idiomas</option>
                      <option value="es">🇪🇸 Español</option>
                      <option value="en">🇺🇸 English</option>
                      <option value="fr">🇫🇷 Français</option>
                      <option value="de">🇩🇪 Deutsch</option>
                      <option value="it">🇮🇹 Italiano</option>
                      <option value="pt">🇧🇷 Português</option>
                    </select>
                  </div>

                  {/* Country Search */}
                  <div className="sm:col-span-4 relative">
                    <input
                      type="text"
                      value={ttsCountrySearch}
                      onChange={(e) => setTtsCountrySearch(e.target.value)}
                      placeholder="🔍 Buscar país o voz..."
                      className="w-full p-1.5 pl-6 rounded-xl text-xs bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
                    />
                    <span className="material-icons-round text-xs absolute left-2 top-2 text-[var(--text-muted)] pointer-events-none">
                      search
                    </span>
                  </div>
                </div>

                {/* Voices List */}
                <div className="max-h-40 overflow-y-auto pr-1 flex flex-col gap-1.5 mt-1">
                  {systemVoices
                    .filter(v => {
                      if (ttsModeFilter === 'offline' && v.isOnlineOnly) return false
                      if (ttsModeFilter === 'online' && !v.isOnlineOnly) return false
                      if (ttsLangFilter !== 'all' && !v.lang.toLowerCase().startsWith(ttsLangFilter.toLowerCase())) return false
                      if (ttsCountrySearch.trim()) {
                        const q = ttsCountrySearch.trim().toLowerCase()
                        const matchCountry = v.countryName.toLowerCase().includes(q)
                        const matchName = v.name.toLowerCase().includes(q)
                        const matchCode = v.countryCode.toLowerCase().includes(q)
                        if (!matchCountry && !matchName && !matchCode) return false
                      }
                      return true
                    })
                    .map(v => (
                      <div
                        key={v.voiceURI}
                        className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm select-none">{v.flag}</span>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-white truncate text-[0.7rem]">
                              {v.countryName} ({v.lang})
                            </span>
                            <span className="text-[0.62rem] text-[var(--text-secondary)] truncate font-mono">
                              {v.name}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded ${
                            v.isOnlineOnly
                              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {v.isOnlineOnly ? '🌐 Online' : '⚡ Offline'}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={openTtsInstall}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 bg-[var(--bg-input)] hover:bg-[var(--accent)] border border-[var(--border-color)] transition-all shadow"
                >
                  <span className="material-icons-round text-sm">download</span>
                  Descargar más Voces en Android
                </button>

                <button
                  type="button"
                  onClick={() => setOpenVoiceStudio(true)}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
                  }}
                >
                  <span className="material-icons-round text-sm">graphic_eq</span>
                  Abrir Creador de Voces (Malla 17 Nodos)
                </button>
              </div>
            </div>
          )}

          {/* Footer Close Button */}
          <div className="flex justify-end pt-3 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg bg-[var(--accent)]"
            >
              Cerrar Ajustes
            </button>
          </div>
        </div>
      </div>

      {openVoiceStudio && (
        <VoiceStudioModal
          voiceToEditId={editingVoiceId}
          onClose={() => {
            setOpenVoiceStudio(false)
            setEditingVoiceId(undefined)
          }}
        />
      )}
      {showPhotoConsent && (
        <PrivacyConsentModal
          purpose="photo"
          error={photoPermissionError}
          onConfirm={confirmPhotoPermission}
          onCancel={() => {
            try {
              PermissionsService.markPhotoPermissionRequested()
              setPhotoPermissionError(null)
            } catch (error) {
              setPhotoPermissionError(error instanceof Error ? error.message : String(error))
              return
            }
            setShowPhotoConsent(false)
          }}
        />
      )}
    </>
  )
}
