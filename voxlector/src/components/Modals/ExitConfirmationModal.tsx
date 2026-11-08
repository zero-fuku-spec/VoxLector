// ============================================================
// VoxLector AI — ExitConfirmationModal Component
// Friendly, polite, and respectful prompt when attempting to exit
// or pressing Android physical back button, with instant progress save
// ============================================================

import React from 'react'

interface Props {
  isOpen: boolean
  bookTitle?: string
  currentPage?: number
  totalPages?: number
  progressPercent?: number
  onContinueReading: () => void
  onExit: () => void
  onBackToLibrary?: () => void
}

export default function ExitConfirmationModal({
  isOpen,
  bookTitle,
  currentPage,
  totalPages,
  progressPercent = 0,
  onContinueReading,
  onExit,
  onBackToLibrary,
}: Props) {
  if (!isOpen) return null

  return (
    <div
      className="modal-overlay animate-fade-in-up select-none"
      onClick={onContinueReading}
    >
      <div
        className="modal-container glass-card p-6 rounded-3xl border shadow-2xl flex flex-col gap-5 text-center relative"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
          boxShadow: '0 0 35px var(--accent-glow), 0 20px 40px rgba(0,0,0,0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Soft Glowing Emblem */}
        <div className="flex justify-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg border"
            style={{
              background: 'linear-gradient(135deg, rgba(124, 92, 255, 0.2), rgba(255, 107, 157, 0.2))',
              borderColor: 'var(--accent)',
              boxShadow: '0 0 20px var(--accent-glow)',
            }}
          >
            <span className="material-icons-round text-3xl" style={{ color: 'var(--accent)' }}>
              bookmark_added
            </span>
          </div>
        </div>

        {/* Polite & Respectful Message */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            ¿Deseas tomar un descanso?
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed px-2">
            Guardaremos tu progreso exactamente aquí para cuando decidas regresar. Cada párrafo y página permanecerán listos para reanudar.
          </p>
        </div>

        {/* Current Book Progress Card (if available) */}
        {bookTitle && (
          <div className="p-3.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-col gap-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white truncate max-w-[220px]">
                {bookTitle}
              </span>
              <span className="font-mono text-xs font-bold text-[var(--accent)]">
                {Math.round(progressPercent)}%
              </span>
            </div>

            {currentPage !== undefined && totalPages !== undefined && (
              <span className="text-[0.68rem] text-[var(--text-muted)] font-mono">
                Página {currentPage + 1} de {totalPages}
              </span>
            )}

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div
                className="h-full progress-gradient transition-all rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-1">
          {/* Continue Reading Button (Primary) */}
          <button
            type="button"
            onClick={onContinueReading}
            className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              boxShadow: '0 4px 20px var(--accent-glow)',
            }}
          >
            <span className="material-icons-round text-base">auto_stories</span>
            Continuar leyendo
          </button>

          {/* Return to Library (if in Reader) */}
          {onBackToLibrary && (
            <button
              type="button"
              onClick={onBackToLibrary}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-input)] hover:bg-[var(--accent)] hover:text-white border border-[var(--border-color)] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-icons-round text-base">local_library</span>
              Ir a la biblioteca
            </button>
          )}

          {/* Exit Application Button */}
          <button
            type="button"
            onClick={onExit}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="material-icons-round text-sm">exit_to_app</span>
            Salir de la aplicación
          </button>
        </div>
      </div>
    </div>
  )
}
