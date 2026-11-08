// ============================================================
// VoxLector AI — CharacterBoardModal Component
// Full character management, voice mapping, and individual voice sculpting
// ============================================================

import React, { useState } from 'react'
import type { Book } from '@/types'
import { useLibraryStore } from '@/stores/libraryStore'
import { getCharacterId } from '@/services/characterDetector'
import { useVoiceStore } from '@/stores/voiceStore'

interface Props {
  book: Book
  onClose: () => void
  onOpenStudio: (voiceId?: string, charName?: string) => void
  onVoiceSelected?: (voiceId: string) => void
}

export default function CharacterBoardModal({ book, onClose, onOpenStudio, onVoiceSelected }: Props) {
  const { assignVoice, setNarratorVoice, updateBook } = useLibraryStore()
  const { voices, saveCharacters } = useVoiceStore()

  const [newCharName, setNewCharName] = useState('')
  const [characters, setCharacters] = useState([...book.characters])
  const [openCharacterMenu, setOpenCharacterMenu] = useState<string | null>(null)
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null)
  const [editingCharacterName, setEditingCharacterName] = useState('')

  const persistCharacters = async (
    updatedCharacters: typeof characters,
    voiceAssignments: Record<string, string>,
  ) => {
    await saveCharacters(book.id, updatedCharacters, voiceAssignments)
    updateBook(book.id, { characters: updatedCharacters, voiceAssignments })
    setCharacters(updatedCharacters)
  }

  const handleAddCharacter = async () => {
    const trimmed = newCharName.trim()
    if (!trimmed) return
    if (characters.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Este personaje ya existe.')
      return
    }
    const newChar = {
      characterId: getCharacterId(trimmed),
      name: trimmed,
      emoji: '👤',
      color: '#7c5cff',
      lineCount: 0,
    }
    const updated = [...characters, newChar]
    const assignments = {
      ...book.voiceAssignments,
      [newChar.characterId]: book.narratorVoiceId,
    }
    try {
      await persistCharacters(updated, assignments)
    } catch (error) {
      console.error('[VoxLector] No se pudo guardar el personaje:', error)
      window.alert('No se pudo guardar el personaje. Inténtalo de nuevo.')
      return
    }
    setNewCharName('')
  }

  const handleDeleteCharacter = async (charName: string) => {
    if (!confirm(`¿Eliminar personaje "${charName}"?`)) return
    const updated = characters.filter(c => c.name !== charName)
    const nextAssignments = { ...book.voiceAssignments }
    const deletedCharacter = characters.find(character => character.name === charName)
    delete nextAssignments[deletedCharacter?.characterId ?? getCharacterId(charName)]
    delete nextAssignments[charName]
    try {
      await persistCharacters(updated, nextAssignments)
    } catch (error) {
      console.error('[VoxLector] No se pudo eliminar el personaje:', error)
      window.alert('No se pudo guardar la eliminación del personaje. Inténtalo de nuevo.')
    }
  }

  const handleRenameCharacter = async (characterName: string) => {
    const newName = editingCharacterName.trim()
    const character = characters.find(item => (item.characterId ?? getCharacterId(item.name)) === editingCharacterId)
    if (!character || !newName || newName === characterName) {
      setEditingCharacterId(null)
      return
    }
    if (characters.some(item => item.name.toLocaleLowerCase() === newName.toLocaleLowerCase())) {
      window.alert('Ya existe un personaje con ese nombre.')
      return
    }

    const characterId = character.characterId ?? getCharacterId(character.name)
    const updated = characters.map(item => item === character
      ? { ...item, characterId, name: newName }
      : item)
    const assignments = { ...book.voiceAssignments }
    if (assignments[character.name] && !assignments[characterId]) {
      assignments[characterId] = assignments[character.name]
    }
    delete assignments[character.name]
    try {
      await persistCharacters(updated, assignments)
      setEditingCharacterId(null)
    } catch (error) {
      console.error('[VoxLector] No se pudo renombrar el personaje:', error)
      window.alert('No se pudo guardar el nuevo nombre. Inténtalo de nuevo.')
    }
  }

  return (
    <div
      className="modal-overlay animate-fade-in-up select-none"
      onClick={onClose}
    >
      <div
        className="modal-container glass-card p-5 sm:p-6 rounded-3xl border shadow-2xl flex flex-col gap-5"
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
              groups
            </span>
            <div>
              <h2 className="text-lg font-bold">Panel de Personajes y Voces</h2>
              <span className="text-[0.68rem] text-[var(--text-secondary)]">
                Configura y esculpe la voz de cada integrante de la historia
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--bg-input)] hover:bg-[var(--danger)] hover:text-white transition-colors"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>

        {/* Narrator Voice */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📖</span>
            <div>
              <span className="text-xs font-bold block text-white">Narrador Principal</span>
              <span className="text-[0.68rem] text-[var(--text-secondary)]">
                Lee acotaciones y partes sin diálogo
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={book.narratorVoiceId}
              onChange={(e) => {
                if (e.target.value !== book.narratorVoiceId) onVoiceSelected?.(e.target.value)
                void setNarratorVoice(book.id, e.target.value).catch(error => {
                  console.error('[VoxLector] No se pudo guardar la voz del narrador:', error)
                })
              }}
              className="p-2 rounded-xl text-xs font-semibold bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
            >
              {voices.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onOpenStudio(book.narratorVoiceId)}
              className="btn-icon !w-8 !h-8"
              title="Esculpir o modificar la voz del Narrador en la Malla de 17 Nodos"
            >
              <span className="material-icons-round text-sm">tune</span>
            </button>
          </div>
        </div>

        {/* Character List */}
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
          {characters.length === 0 ? (
            <div className="p-4 text-center rounded-xl bg-[var(--bg-input)] text-xs text-[var(--text-secondary)]">
              No hay personajes registrados en este libro.
            </div>
          ) : (
            characters.map(char => {
              const characterId = char.characterId ?? getCharacterId(char.name)
              const currentVoiceId = book.voiceAssignments?.[characterId]
                ?? book.voiceAssignments?.[char.name]
                ?? ''
              return (
                <div
                  key={characterId}
                  className="flex items-center justify-between p-3 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="text-xl flex-shrink-0">{char.emoji}</span>
                    <div className="min-w-0">
                      {editingCharacterId === characterId ? (
                        <input
                          autoFocus
                          aria-label={`Nuevo nombre para ${char.name}`}
                          value={editingCharacterName}
                          onChange={event => setEditingCharacterName(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') void handleRenameCharacter(char.name)
                            if (event.key === 'Escape') setEditingCharacterId(null)
                          }}
                          className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        />
                      ) : (
                        <span className="text-xs font-bold block text-white truncate">{char.name}</span>
                      )}
                      <span className="text-[0.65rem] text-[var(--text-secondary)] block">
                        {char.lineCount} diálogos
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="hidden max-w-[110px] truncate text-[0.65rem] text-[var(--text-secondary)] sm:block">
                      {voices.find(voice => voice.id === currentVoiceId)?.name ?? 'Sin voz asignada'}
                    </span>
                    <select
                      value={currentVoiceId}
                      onChange={event => {
                        if (event.target.value !== currentVoiceId) onVoiceSelected?.(event.target.value)
                        void assignVoice(book.id, char.name, event.target.value).catch(error => {
                          console.error('[VoxLector] No se pudo guardar la voz del personaje:', error)
                        })
                      }}
                      className="p-2 rounded-xl text-xs font-medium bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none max-w-[130px] truncate"
                    >
                      <option value="">Sin asignar (elegir al leer)</option>
                      {currentVoiceId && !voices.some(voice => voice.id === currentVoiceId) && (
                        <option value={currentVoiceId}>(Perfil eliminado; reasignar)</option>
                      )}
                      {voices.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.id === book.narratorVoiceId ? `${v.name} (Narrador)` : v.name}
                        </option>
                      ))}
                    </select>

                    {editingCharacterId === characterId ? (
                      <>
                        <button
                          type="button"
                          aria-label={`Guardar nombre de ${char.name}`}
                          onClick={() => void handleRenameCharacter(char.name)}
                          className="btn-icon !h-9 !w-9 text-[var(--accent)]"
                        >
                          <span className="material-icons-round text-sm">check</span>
                        </button>
                        <button
                          type="button"
                          aria-label="Cancelar edición"
                          onClick={() => setEditingCharacterId(null)}
                          className="btn-icon !h-9 !w-9"
                        >
                          <span className="material-icons-round text-sm">close</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`Editar personaje ${char.name}`}
                          onClick={() => {
                            setEditingCharacterId(characterId)
                            setEditingCharacterName(char.name)
                          }}
                          className="btn-icon !h-9 !w-9"
                        >
                          <span className="material-icons-round text-sm">edit</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Eliminar personaje ${char.name}`}
                          onClick={() => void handleDeleteCharacter(char.name)}
                          className="btn-icon !h-9 !w-9 text-[var(--danger)]"
                        >
                          <span className="material-icons-round text-sm">delete</span>
                        </button>
                      </>
                    )}

                    <div className="relative">
                      <button
                        type="button"
                        aria-label={`Más opciones para ${char.name}`}
                        aria-expanded={openCharacterMenu === char.name}
                        onClick={() => setOpenCharacterMenu(openCharacterMenu === char.name ? null : char.name)}
                        className="btn-icon !h-9 !w-9"
                      >
                        <span className="material-icons-round text-lg">more_vert</span>
                      </button>
                      {openCharacterMenu === char.name && (
                        <div className="absolute right-0 top-full z-20 mt-1 flex min-w-44 flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 shadow-xl">
                          <button
                            type="button"
                            onClick={() => { setOpenCharacterMenu(null); onOpenStudio(currentVoiceId || undefined, char.name) }}
                            className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                          >
                            Editar perfil de voz
                          </button>
                          <button
                            type="button"
                            onClick={() => { setOpenCharacterMenu(null); handleDeleteCharacter(char.name) }}
                            className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--danger)] hover:bg-[var(--bg-input)]"
                          >
                            Eliminar personaje
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Add custom character */}
        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
          <input
            type="text"
            placeholder="Añadir nuevo personaje manual..."
            value={newCharName}
            onChange={(e) => setNewCharName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCharacter()}
            className="flex-1 p-2.5 rounded-xl text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
          />
          <button
            type="button"
            onClick={handleAddCharacter}
            className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-1 bg-[var(--accent)]"
          >
            <span className="material-icons-round text-sm">add</span>
            Añadir
          </button>
        </div>

        {/* Open Voice Studio button */}
        <button
          onClick={() => onOpenStudio()}
          className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 shadow-lg transition-all"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
          }}
        >
          <span className="material-icons-round text-base">graphic_eq</span>
          Crear Nueva Voz en la Malla de 17 Nodos
        </button>
      </div>
    </div>
  )
}
