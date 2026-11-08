// ============================================================
// VoxLector AI — PlayerBar Component
// Seek bar with real-time target page preview, -15s and +15s buttons,
// play/pause, stop, speed selector, and sleep timer
// ============================================================

import React, { useRef, useState, useCallback } from 'react'
import type { Book } from '@/types'

interface Props {
  book: Book
  totalSentences: number
  currentSentenceIndex: number
  currentPageIndex: number
  isPlaying: boolean
  isPaused: boolean
  speed: number
  onPlayPause: () => void
  onStop: () => void
  onSeekSeconds: (secondsOffset: number) => void
  onSeekFraction: (fraction: number) => void
  onSeekStart?: () => void
  onSeekComplete?: (fraction: number) => void
  onJumpToPage?: (pageIndex: number) => void
  onSeekPagePreview?: (pageIndex: number) => void
  onSleepTimer: () => void
  onSpeedChange: (newSpeed: number) => void
}

export default function PlayerBar({
  book,
  totalSentences,
  currentSentenceIndex,
  currentPageIndex,
  isPlaying,
  isPaused,
  speed,
  onPlayPause,
  onStop,
  onSeekSeconds,
  onSeekFraction,
  onSeekStart,
  onSeekComplete,
  onJumpToPage,
  onSeekPagePreview,
  onSleepTimer,
  onSpeedChange,
}: Props) {
  const progressBarRef = useRef<HTMLDivElement>(null)
  const [hoverTarget, setHoverTarget] = useState<{
    fraction: number;
    targetPage: number;
    x: number;
  } | null>(null)
  const [showSpeedPopover, setShowSpeedPopover] = useState(false)
  const [pageInputOpen, setPageInputOpen] = useState(false)
  const [pageInput, setPageInput] = useState('')
  const isDraggingRef = useRef(false)
  const lastSeekFractionRef = useRef<number | null>(null)

  // Problema 4: el avance y el destino del control usan ambos la página actual.
  const progressFraction = book.totalPages > 1
    ? Math.min(1, Math.max(0, currentPageIndex / (book.totalPages - 1)))
    : 0

  const calculateTarget = useCallback((clientX: number) => {
    if (!progressBarRef.current) return null
    const rect = progressBarRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const totalPages = Math.max(1, book.totalPages)
    const targetPage = Math.round(fraction * (totalPages - 1))
    return { fraction, targetPage, x: clientX - rect.left }
  }, [book.totalPages])

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = calculateTarget(e.clientX)
    if (!target) return
    setHoverTarget(target)
  }

  const updateSeek = (value: string) => {
    const fraction = Number(value) / 10000
    if (!Number.isFinite(fraction) || fraction === lastSeekFractionRef.current) return
    lastSeekFractionRef.current = fraction
    onSeekFraction(fraction)
    onSeekPagePreview?.(Math.round(fraction * Math.max(0, book.totalPages - 1)))
  }

  const handleSeekPointerUp = () => {
    if (isDraggingRef.current) {
      if (lastSeekFractionRef.current !== null) onSeekComplete?.(lastSeekFractionRef.current)
    }
    isDraggingRef.current = false
    setHoverTarget(null)
  }

  const handlePointerLeave = () => {
    setHoverTarget(null)
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t glass select-none"
      style={{
        background: 'var(--player-bg)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* ─── Real-Time Seek Bar with Target Page Tooltip ─── */}
      <div
        ref={progressBarRef}
        className="w-full h-3.5 bg-black/40 cursor-pointer relative group transition-all hover:h-4.5 touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        title="Arrastra o haz clic para saltar libremente a cualquier página o párrafo"
      >
        {/* Progress Fill */}
        <div
          className="h-full progress-gradient relative transition-all"
          style={{ width: `${progressFraction * 100}%` }}
        >
          {/* Thumb Indicator */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-xl border-2 border-[var(--accent)]"
            style={{ transform: 'translate(50%, -50%)' }}
          />
        </div>
        <input
          aria-label="Posición de lectura"
          type="range"
          min="0"
          max="10000"
          step="1"
          value={Math.round(progressFraction * 10000)}
          onPointerDown={() => {
            isDraggingRef.current = true
            lastSeekFractionRef.current = null
            onSeekStart?.()
          }}
          onFocus={() => { if (!isDraggingRef.current) onSeekStart?.() }}
          onPointerUp={handleSeekPointerUp}
          onPointerCancel={handleSeekPointerUp}
          onKeyUp={event => {
            if (event.key.startsWith('Arrow') && lastSeekFractionRef.current !== null) {
              onSeekComplete?.(lastSeekFractionRef.current)
            }
          }}
          onInput={event => updateSeek(event.currentTarget.value)}
          onChange={event => updateSeek(event.currentTarget.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 touch-none"
        />

        {/* Hover / Drag Floating Tooltip */}
        {hoverTarget && (
          <div
            className="absolute bottom-5 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-mono font-bold text-white shadow-2xl pointer-events-none z-50 whitespace-nowrap flex items-center gap-1.5"
            style={{
              left: `${hoverTarget.x}px`,
              background: 'rgba(15, 15, 25, 0.95)',
              border: '1px solid var(--accent)',
              boxShadow: '0 0 15px var(--accent-glow)',
            }}
          >
            <span className="material-icons-round text-sm text-[var(--accent)]">auto_stories</span>
            <span>Pág. {hoverTarget.targetPage + 1} de {book.totalPages}</span>
            <span className="text-[var(--text-muted)]">({Math.round(hoverTarget.fraction * 100)}%)</span>
          </div>
        )}
      </div>

      {/* ─── Main Playback Controls Bar ─── */}
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Stop button & Current Page badge */}
        <div className="flex items-center gap-2">
          <button
            onClick={onStop}
            className="btn-icon !w-10 !h-10 hover:!bg-[var(--danger)] hover:!text-white"
            title="Detener lectura y guardar posición exacta"
          >
            <span className="material-icons-round text-xl">stop</span>
          </button>

          <div className="flex flex-col">
            <span className="text-[0.65rem] font-bold font-mono text-[var(--text-primary)] sm:text-xs">
              <button
                type="button"
                onClick={() => { setPageInput(String(currentPageIndex + 1)); setPageInputOpen(true) }}
                className="underline decoration-dotted underline-offset-2 hover:text-[var(--accent)]"
                title="Ir a una página específica"
              >
                <span className="hidden sm:inline">Página </span>{currentPageIndex + 1} / {book.totalPages}
              </button>
            </span>
            <span className="hidden text-[0.65rem] text-[var(--text-muted)] font-mono sm:block">
              Frase {currentSentenceIndex + 1} de {totalSentences} · Página {currentPageIndex + 1} ({Math.round(progressFraction * 100)}%)
            </span>
          </div>

          {pageInputOpen && (
            <form
              className="absolute bottom-full left-3 mb-2 flex items-center gap-2 rounded-xl border p-2 shadow-xl"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
              onSubmit={(event) => {
                event.preventDefault()
                const page = Number(pageInput)
                if (!Number.isInteger(page) || page < 1 || page > book.totalPages) return
                onJumpToPage?.(page - 1)
                setPageInputOpen(false)
              }}
            >
              <label htmlFor="reader-page-input" className="text-xs text-[var(--text-secondary)]">Ir a página</label>
              <input
                id="reader-page-input"
                autoFocus
                type="number"
                min="1"
                max={book.totalPages}
                value={pageInput}
                onChange={event => setPageInput(event.target.value)}
                className="w-20 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1 text-sm text-white"
              />
              <button
                type="submit"
                className="min-h-12 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white shadow-md"
              >
                Ir
              </button>
              <button type="button" onClick={() => setPageInputOpen(false)} className="px-1 text-[var(--text-secondary)]">×</button>
            </form>
          )}
        </div>

        {/* Center: -15s, Play/Pause, +15s */}
        <div className="flex items-center gap-3 sm:gap-5">
          {/* Seek -15 seconds */}
          <button
            onClick={() => onSeekSeconds(-15)}
            className="w-11 h-11 rounded-2xl flex flex-col items-center justify-center bg-[var(--bg-input)] hover:bg-[var(--accent)] hover:text-white transition-all border border-[var(--border-color)] active:scale-95"
            title="Retroceder 15 segundos"
          >
            <span className="material-icons-round text-base leading-none">replay</span>
            <span className="text-[0.6rem] font-black leading-none mt-0.5">-15s</span>
          </button>

          {/* Large Main Play/Pause Button */}
          <button
            onClick={onPlayPause}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white shadow-2xl transition-all transform active:scale-90"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              boxShadow: '0 4px 25px var(--accent-glow)',
            }}
            title={isPlaying ? 'Pausar lectura' : 'Comenzar lectura'}
          >
            <span className="material-icons-round text-3xl sm:text-4xl">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>

          {/* Seek +15 seconds */}
          <button
            onClick={() => onSeekSeconds(15)}
            className="w-11 h-11 rounded-2xl flex flex-col items-center justify-center bg-[var(--bg-input)] hover:bg-[var(--accent)] hover:text-white transition-all border border-[var(--border-color)] active:scale-95"
            title="Adelantar 15 segundos"
          >
            <span className="material-icons-round text-base leading-none">forward_10</span>
            <span className="text-[0.6rem] font-black leading-none mt-0.5">+15s</span>
          </button>
        </div>

        {/* Right: Speed selector & Sleep Timer */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Speed Selector Button & Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSpeedPopover(v => !v)}
              className={`h-10 px-2.5 rounded-xl flex items-center justify-center border text-xs font-mono font-bold transition-all ${
                showSpeedPopover
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-md'
                  : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--accent)] hover:border-[var(--accent)]'
              }`}
              title="Seleccionar velocidad de lectura"
            >
              {speed.toFixed(1)}×
            </button>

            {/* Speed Selection Popover */}
            {showSpeedPopover && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSpeedPopover(false)}
                />
                <div
                  className="absolute bottom-12 right-0 z-50 w-64 p-3.5 rounded-2xl glass-card border shadow-2xl flex flex-col gap-2.5 animate-fade-in-up"
                  style={{
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 15px var(--accent-glow)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-color)]">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="material-icons-round text-base text-[var(--accent)]">speed</span>
                      Velocidad de Lectura
                    </span>
                    <span className="font-mono text-xs font-bold text-[var(--accent)] bg-[var(--bg-input)] px-2 py-0.5 rounded-md border border-[var(--border-color)]">
                      {speed.toFixed(2)}×
                    </span>
                  </div>

                  {/* Preset Speed Buttons Grid */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {[0.5, 0.75, 0.9, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0].map((s) => {
                      const isSelected = Math.abs(speed - s) < 0.04
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            onSpeedChange(s)
                            setShowSpeedPopover(false)
                          }}
                          className={`py-1.5 px-1.5 rounded-xl text-xs font-bold font-mono transition-all text-center border ${
                            isSelected
                              ? 'bg-[var(--accent)] text-white border-transparent shadow-md ring-1 ring-[var(--accent)]'
                              : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-white hover:border-[var(--accent)]'
                          }`}
                        >
                          {s.toFixed(2).replace(/\.00$/, '')}×
                          {s === 0.9 && <span className="text-[0.55rem] block font-normal opacity-80">Normal</span>}
                        </button>
                      )
                    })}
                  </div>

                  {/* Fine-Tuning Slider */}
                  <div className="flex flex-col gap-1 pt-1 border-t border-[var(--border-color)]">
                    <div className="flex justify-between text-[0.65rem] text-[var(--text-muted)] font-mono">
                      <span>0.5×</span>
                      <span>Ajuste fino</span>
                      <span>3.0×</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.05"
                      value={speed}
                      onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)] cursor-pointer"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sleep Timer */}
          <button
            onClick={onSleepTimer}
            className="btn-icon !w-10 !h-10"
            title="Temporizador de sueño flexible"
          >
            <span className="material-icons-round text-lg">bedtime</span>
          </button>
        </div>
      </div>
    </div>
  )
}
