// ============================================================
// VoxLector AI — FloatingVoiceMenu Component
// In-reading slideable panel to switch voices, modify narrator,
// and sculpt character voices without leaving the book
// ============================================================

import React, { useState } from 'react'
import type { Book } from '@/types'
import { useVoiceStore } from '@/stores/voiceStore'
import { useLibraryStore } from '@/stores/libraryStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { getCharacterId } from '@/services/characterDetector'

interface Props {
  book: Book
  onClose: () => void
  onOpenStudioForVoice: (voiceId: string, charName?: string) => void
  onVoiceSelected?: (voiceId: string) => void
}

export default function FloatingVoiceMenu({ book, onClose, onOpenStudioForVoice, onVoiceSelected }: Props) {
  const { voices, updateVoice } = useVoiceStore()
  const { setReadingMode, setNarratorVoice, assignVoice } = useLibraryStore()
  const { announceCharacterDialogue, setAnnounceCharacterDialogue } = useSettingsStore()

  const [selectedChar, setSelectedChar] = useState<string>('__narrator__')

  const currentVoiceId = selectedChar === '__narrator__'
    ? book.narratorVoiceId
    : (book.voiceAssignments?.[getCharacterId(selectedChar)]
      || book.voiceAssignments?.[selectedChar]
      || book.narratorVoiceId)

  const activeVoice = voices.find(v => v.id === currentVoiceId) || voices[0]

  return (
    <div
      className="modal-overlay modal-overlay-bottom-end animate-fade-in-up"
      onClick={onClose}
    >
      <div
        className="modal-container glass-card p-5 shadow-2xl rounded-2xl flex flex-col gap-4 border"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-xl" style={{ color: 'var(--accent)' }}>
              tune
            </span>
            <h3 className="font-bold text-base">Ajuste Rápido de Voz</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--bg-input)] hover:bg-[var(--danger)] hover:text-white transition-colors"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Modo de Lectura:</span>
          <button
            onClick={() => setReadingMode(book.id, book.readingMode === 'narrator' ? 'multivoice' : 'narrator')}
            className="px-3 py-1 text-xs font-bold rounded-lg transition-all"
            style={{
              background: book.readingMode === 'multivoice' ? 'var(--accent-secondary)' : 'var(--accent)',
              color: '#fff',
            }}
          >
            {book.readingMode === 'multivoice' ? '🎭 Multi-Voz' : '🎙️ Narrador Único'}
          </button>
        </div>

        {book.readingMode === 'multivoice' && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3">
            <span className="text-xs font-semibold leading-relaxed text-[var(--text-primary)]">
              El narrador anuncia personaje y emoción
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={announceCharacterDialogue}
              aria-label="El narrador anuncia personaje y emoción"
              onClick={() => setAnnounceCharacterDialogue(!announceCharacterDialogue)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                announceCharacterDialogue ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]/50'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  announceCharacterDialogue ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}

        {/* Character Selector (if multi-voice) */}
        {book.readingMode === 'multivoice' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              Personaje a ajustar:
            </label>
            <select
              value={selectedChar}
              onChange={(e) => setSelectedChar(e.target.value)}
              className="p-2 rounded-xl text-xs font-medium bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
            >
              <option value="__narrator__">📖 Narrador Principal</option>
              {book.characters.map(char => (
                <option key={char.name} value={char.name}>
                  {char.emoji} {char.name} ({char.lineCount} diálogos)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Active Voice Selection with direct Edit button */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              Voz para {selectedChar === '__narrator__' ? 'Narrador Principal' : selectedChar}:
            </label>
            {activeVoice && (
              <button
                type="button"
                onClick={() => onOpenStudioForVoice(activeVoice.id, selectedChar === '__narrator__' ? undefined : selectedChar)}
                className="text-[0.68rem] font-bold text-[var(--accent)] hover:underline flex items-center gap-1"
              >
                <span className="material-icons-round text-xs">edit</span>
                Modificar esta voz
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
            {voices.map(v => (
              <button
                key={v.id}
                onClick={() => {
                  if (v.id !== currentVoiceId) onVoiceSelected?.(v.id)
                  if (selectedChar === '__narrator__') {
                    void setNarratorVoice(book.id, v.id).catch(error => {
                      console.error('[VoxLector] No se pudo guardar la voz del narrador:', error)
                    })
                  } else {
                    void assignVoice(book.id, selectedChar, v.id).catch(error => {
                      console.error('[VoxLector] No se pudo guardar la voz del personaje:', error)
                    })
                  }
                }}
                className={`flex items-center justify-between p-2 rounded-xl text-left text-xs font-semibold transition-all border ${
                  v.id === currentVoiceId
                    ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]'
                    : 'border-transparent bg-[var(--bg-input)] text-[var(--text-primary)] hover:border-[var(--accent)]'
                }`}
              >
                <span>{v.name}</span>
                {v.id === currentVoiceId && (
                  <span className="material-icons-round text-sm">check_circle</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Pitch & Speed Sliders */}
        {activeVoice && (
          <div className="flex flex-col gap-3 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span>Tono (Pitch)</span>
                <span className="font-mono text-[var(--accent)]">{activeVoice.pitch.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="2.5"
                step="0.05"
                value={activeVoice.pitch}
                onChange={(e) => updateVoice(activeVoice.id, { pitch: parseFloat(e.target.value) })}
                className="styled-range w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span>Velocidad (Rate)</span>
                <span className="font-mono text-[var(--accent)]">{activeVoice.rate.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="3.0"
                step="0.1"
                value={activeVoice.rate}
                onChange={(e) => updateVoice(activeVoice.id, { rate: parseFloat(e.target.value) })}
                className="styled-range w-full"
              />
            </div>
          </div>
        )}

        {/* Open Full Voice Studio */}
        <button
          onClick={() => onOpenStudioForVoice(currentVoiceId, selectedChar === '__narrator__' ? undefined : selectedChar)}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 shadow-lg transition-all"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
          }}
        >
          <span className="material-icons-round text-base">graphic_eq</span>
          Esculpir en Estudio (Malla 17 Nodos)
        </button>
      </div>
    </div>
  )
}
