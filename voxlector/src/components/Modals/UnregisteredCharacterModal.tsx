// ============================================================
// VoxLector AI — UnregisteredCharacterModal Component
// Semitranslucent popup with NEON glowing borders shown when an
// unconfigured character appears during multi-voice reading
// ============================================================

import React, { useState } from 'react'
import { useVoiceStore } from '@/stores/voiceStore'

interface Props {
  characterName: string
  narratorVoiceName: string
  onUseNarrator: () => void
  onAssignExisting: (voiceId: string) => void
  onOpenStudio: () => void
}

export default function UnregisteredCharacterModal({
  characterName,
  narratorVoiceName,
  onUseNarrator,
  onAssignExisting,
  onOpenStudio,
}: Props) {
  const { voices } = useVoiceStore()
  const [selectedVoiceId, setSelectedVoiceId] = useState(voices[0]?.id || '')

  return (
    <div className="modal-overlay animate-fade-in-up select-none">
      <div
        className="modal-container p-6 sm:p-7 rounded-3xl flex flex-col gap-5 text-left relative overflow-hidden"
        style={{
          background: 'rgba(15, 15, 25, 0.90)',
          backdropFilter: 'blur(28px)',
          border: '2px solid var(--accent)',
          boxShadow: '0 0 35px var(--accent), inset 0 0 20px var(--accent-glow)',
        }}
      >
        {/* Neon Ambient Corner Glow */}
        <div
          className="absolute -top-12 -right-12 w-32 h-32 rounded-full pointer-events-none opacity-40 blur-2xl"
          style={{ background: 'var(--accent)' }}
        />

        {/* Header */}
        <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              boxShadow: '0 0 15px var(--accent-glow)',
            }}
          >
            <span className="material-icons-round text-2xl">person_add</span>
          </div>

          <div>
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[var(--accent)]">
              Personaje No Configurado
            </span>
            <h2 className="text-xl font-black text-white leading-tight mt-0.5">
              {characterName}
            </h2>
          </div>
        </div>

        {/* Prompt message */}
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          La lectura se ha pausado porque el personaje <strong className="text-[var(--accent)]">«{characterName}»</strong> no tiene una voz asignada en el modo multi-voz. ¿Cómo deseas proceder?
        </p>

        {/* Action Options */}
        <div className="flex flex-col gap-2.5">
          {/* Option 1: Sculpt in Studio */}
          <button
            type="button"
            onClick={onOpenStudio}
            className="w-full p-3.5 rounded-2xl flex items-center gap-3 border text-left transition-all group"
            style={{
              background: 'var(--bg-input)',
              borderColor: 'var(--accent)',
              boxShadow: '0 0 12px var(--accent-glow)',
            }}
          >
            <span className="material-icons-round text-2xl text-[var(--accent)] group-hover:scale-110 transition-transform">
              graphic_eq
            </span>
            <div>
              <span className="text-xs font-bold text-white block">
                Esculpir Nueva Voz en la Malla de 17 Nodos
              </span>
              <span className="text-[0.68rem] text-[var(--text-secondary)]">
                Personaliza timbre, graves, formantes y dale una voz única
              </span>
            </div>
          </button>

          {/* Option 2: Assign Existing Voice */}
          <div className="p-3 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-col gap-2">
            <span className="text-[0.68rem] font-bold text-[var(--text-secondary)] uppercase">
              O asignar una voz existente:
            </span>
            <div className="flex items-center gap-2">
              <select
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
                className="flex-1 p-2 rounded-xl text-xs font-semibold bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
              >
                {voices.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onAssignExisting(selectedVoiceId)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-[var(--accent)] hover:opacity-90 shadow-md"
              >
                Asignar
              </button>
            </div>
          </div>

          {/* Option 3: Use Narrator Voice */}
          <button
            type="button"
            onClick={onUseNarrator}
            className="w-full p-3 rounded-2xl flex items-center justify-between bg-[var(--bg-input)] hover:bg-[var(--highlight-bg)] border border-[var(--border-color)] text-left transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="material-icons-round text-lg text-[var(--text-muted)]">
                record_voice_over
              </span>
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Usar voz del Narrador ({narratorVoiceName})
              </span>
            </div>
            <span className="material-icons-round text-sm text-[var(--text-muted)]">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
