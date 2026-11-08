import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Book, DetectedCharacter, ReadingMode, VoicePreset } from '@/types'
import { getCharacterId, isValidCharacterName } from '@/services/characterDetector'
import { useLibraryStore } from '@/stores/libraryStore'
import { useVoiceStore } from '@/stores/voiceStore'

type ReadingSetup = Pick<Book, 'readingMode' | 'narratorVoiceId' | 'voiceAssignments' | 'characters'>

interface Props {
  book: Book
  voices: VoicePreset[]
  onCancel: () => void
  onConfirm: (setup: ReadingSetup) => Promise<void>
}

const ROW_HEIGHT = 64
const VIEWPORT_HEIGHT = 288

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').trim().toLocaleLowerCase('es')
}

function withCharacterIds(characters: DetectedCharacter[]): DetectedCharacter[] {
  return characters.map(character => ({
    ...character,
    characterId: character.characterId ?? getCharacterId(character.name),
  }))
}

export default function ReadingSetupModal({ book, voices, onCancel, onConfirm }: Props) {
  const updateBook = useLibraryStore(state => state.updateBook)
  const saveCharacters = useVoiceStore(state => state.saveCharacters)
  const [readingMode, setReadingMode] = useState<ReadingMode>(book.readingMode)
  const [narratorVoiceId, setNarratorVoiceId] = useState(book.narratorVoiceId)
  // Problema 1: oculta falsos positivos guardados antes de corregir el detector.
  const [characters, setCharacters] = useState(() =>
    withCharacterIds(book.characters.filter(character => isValidCharacterName(character.name))),
  )
  const [voiceAssignments, setVoiceAssignments] = useState<Record<string, string>>(() => {
    const assignments = { ...(book.voiceAssignments ?? {}) }
    for (const character of withCharacterIds(book.characters.filter(item => isValidCharacterName(item.name)))) {
      const id = character.characterId!
      assignments[id] = assignments[id] ?? assignments[character.name] ?? book.narratorVoiceId
    }
    return assignments
  })
  const [newCharacterName, setNewCharacterName] = useState('')
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null)
  const [editingCharacterName, setEditingCharacterName] = useState('')
  const [search, setSearch] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filteredCharacters = useMemo(() => {
    const query = normalizeName(search)
    if (!query) return characters
    return characters.filter(character => normalizeName(character.name).includes(query))
  }, [characters, search])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
    setScrollTop(0)
  }, [search])

  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2)
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 4
  const visibleCharacters = filteredCharacters.slice(visibleStart, visibleStart + visibleCount)
  const topSpacerHeight = visibleStart * ROW_HEIGHT
  const bottomSpacerHeight = Math.max(0, (filteredCharacters.length - visibleStart - visibleCharacters.length) * ROW_HEIGHT)

  const selectMode = (mode: ReadingMode) => setReadingMode(mode)

  const updateCharacterVoice = (character: DetectedCharacter, voiceId: string) => {
    const characterId = character.characterId ?? getCharacterId(character.name)
    setVoiceAssignments(previous => ({ ...previous, [characterId]: voiceId }))
  }

  const persistCharacterEdits = async (
    nextCharacters: DetectedCharacter[],
    nextAssignments: Record<string, string>,
  ) => {
    setCharacters(nextCharacters)
    setVoiceAssignments(nextAssignments)
    try {
      await saveCharacters(book.id, nextCharacters, nextAssignments)
      updateBook(book.id, { characters: nextCharacters, voiceAssignments: nextAssignments })
    } catch (saveError) {
      console.error('[VoxLector] No se pudo guardar los personajes editados:', saveError)
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  const renameCharacter = (character: DetectedCharacter) => {
    const newName = editingCharacterName.trim()
    if (!newName || normalizeName(newName) === normalizeName(character.name)) {
      setEditingCharacterId(null)
      return
    }
    if (characters.some(item =>
      item !== character && normalizeName(item.name) === normalizeName(newName),
    )) {
      setError('Ya existe un personaje con ese nombre.')
      return
    }
    const characterId = character.characterId ?? getCharacterId(character.name)
    const nextCharacters = characters.map(item => item === character
      ? { ...item, characterId, name: newName }
      : item)
    const nextAssignments = { ...voiceAssignments }
    if (nextAssignments[character.name] && !nextAssignments[characterId]) {
      nextAssignments[characterId] = nextAssignments[character.name]
    }
    delete nextAssignments[character.name]
    void persistCharacterEdits(nextCharacters, nextAssignments)
    setEditingCharacterId(null)
  }

  const deleteCharacter = (character: DetectedCharacter) => {
    if (!window.confirm(`¿Eliminar el personaje "${character.name}"?`)) return
    const characterId = character.characterId ?? getCharacterId(character.name)
    const nextCharacters = characters.filter(item => item !== character)
    const nextAssignments = { ...voiceAssignments }
    delete nextAssignments[characterId]
    delete nextAssignments[character.name]
    void persistCharacterEdits(nextCharacters, nextAssignments)
  }

  const addCharacter = () => {
    const name = newCharacterName.trim()
    if (!name || characters.some(character => normalizeName(character.name) === normalizeName(name))) return
    const character: DetectedCharacter = {
      characterId: getCharacterId(name),
      name,
      emoji: '👤',
      color: 'var(--accent)',
      lineCount: 0,
    }
    setCharacters(previous => [...previous, character])
    setVoiceAssignments(previous => ({ ...previous, [character.characterId!]: narratorVoiceId }))
    setNewCharacterName('')
    setSearch('')
    listRef.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER })
  }

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      const safeAssignments = { ...voiceAssignments }
      for (const character of characters) {
        const characterId = character.characterId ?? getCharacterId(character.name)
        safeAssignments[characterId] = safeAssignments[characterId] ?? narratorVoiceId
      }
      await onConfirm({
        readingMode,
        narratorVoiceId,
        voiceAssignments: safeAssignments,
        characters: withCharacterIds(characters),
      })
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : String(confirmError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-3 sm:p-5" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-setup-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
      >
        <header className="border-b border-[var(--border-color)] px-5 py-4 sm:px-6">
          <h2 id="reading-setup-title" className="text-lg font-black text-[var(--text-primary)]">Prepara la lectura</h2>
          <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{book.title}</p>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">Modo de lectura</h3>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'narrator' as const, label: 'Narrador único', detail: 'Una voz para todo el libro' },
                { id: 'multivoice' as const, label: 'Multi-Voz', detail: 'Voz asignada a cada personaje' },
              ]).map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={readingMode === option.id}
                  onClick={() => selectMode(option.id)}
                  className={`rounded-2xl border p-3 text-left ${readingMode === option.id ? 'border-[var(--accent)] bg-[var(--accent-glow)]' : 'border-[var(--border-color)] bg-[var(--bg-input)]'}`}
                >
                  <span className="block text-sm font-bold text-[var(--text-primary)]">{option.label}</span>
                  <span className="mt-1 block text-xs text-[var(--text-secondary)]">{option.detail}</span>
                </button>
              ))}
            </div>
          </section>

          <label className="block">
            <span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">Voz del narrador</span>
            <select
              value={narratorVoiceId}
              onChange={event => {
                const nextVoiceId = event.currentTarget.value
                setNarratorVoiceId(nextVoiceId)
                setVoiceAssignments(previous => {
                  const next = { ...previous }
                  for (const character of characters) {
                    const id = character.characterId ?? getCharacterId(character.name)
                    if (!next[id] || next[id] === narratorVoiceId) next[id] = nextVoiceId
                  }
                  return next
                })
              }}
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3 text-sm text-[var(--text-primary)]"
            >
              {voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
            </select>
          </label>

          <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">Personajes y voces</h3>
                  <p className="mt-1 text-[0.68rem] text-[var(--text-muted)]">
                    {readingMode === 'multivoice'
                      ? 'Los personajes sin voz detectada empiezan con la voz del narrador; puedes cambiarlos aquí.'
                      : 'Puedes preparar las voces ahora; se usarán al activar Multi-Voz.'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--bg-input)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]">{characters.length}</span>
              </div>
              <input
                value={search}
                onChange={event => setSearch(event.currentTarget.value)}
                placeholder="Buscar personaje"
                className="mb-2 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
              <div
                ref={listRef}
                onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
                className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)]"
                style={{ height: Math.min(VIEWPORT_HEIGHT, Math.max(ROW_HEIGHT, filteredCharacters.length * ROW_HEIGHT)) }}
              >
                <div aria-hidden="true" style={{ height: topSpacerHeight }} />
                {visibleCharacters.map(character => {
                  const characterId = character.characterId ?? getCharacterId(character.name)
                  return (
                    <div key={characterId} className="flex items-center gap-3 border-b border-[var(--border-color)] px-3" style={{ height: ROW_HEIGHT }}>
                      <span aria-hidden="true" className="text-lg">{character.emoji}</span>
                      {editingCharacterId === characterId ? (
                        <input
                          autoFocus
                          aria-label={`Nuevo nombre para ${character.name}`}
                          value={editingCharacterName}
                          onChange={event => setEditingCharacterName(event.currentTarget.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') renameCharacter(character)
                            if (event.key === 'Escape') setEditingCharacterId(null)
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text-primary)]">{character.name}</span>
                      )}
                      <select
                        aria-label={`Voz para ${character.name}`}
                        value={voiceAssignments[characterId] ?? narratorVoiceId}
                        onChange={event => updateCharacterVoice(character, event.currentTarget.value)}
                        className="max-w-[55%] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-2 text-xs text-[var(--text-primary)]"
                      >
                        {voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
                      </select>
                      {editingCharacterId === characterId ? (
                        <button
                          type="button"
                          aria-label={`Guardar nombre de ${character.name}`}
                          onClick={() => renameCharacter(character)}
                          className="rounded-lg p-2 text-[var(--accent)] hover:bg-[var(--bg-card)]"
                        >
                          <span className="material-icons-round text-base">check</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Editar personaje ${character.name}`}
                          onClick={() => {
                            setEditingCharacterId(characterId)
                            setEditingCharacterName(character.name)
                            setError(null)
                          }}
                          className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--accent)]"
                        >
                          <span className="material-icons-round text-base">edit</span>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Eliminar personaje ${character.name}`}
                        onClick={() => deleteCharacter(character)}
                        className="rounded-lg p-2 text-[var(--danger)] hover:bg-[var(--bg-card)]"
                      >
                        <span className="material-icons-round text-base">delete</span>
                      </button>
                    </div>
                  )
                })}
                <div aria-hidden="true" style={{ height: bottomSpacerHeight }} />
                {filteredCharacters.length === 0 && <p className="p-4 text-center text-xs text-[var(--text-muted)]">No hay coincidencias.</p>}
              </div>
          </section>

          <form onSubmit={event => { event.preventDefault(); addCharacter() }} className="flex gap-2 border-t border-[var(--border-color)] pt-4">
            <input
              value={newCharacterName}
              onChange={event => setNewCharacterName(event.currentTarget.value)}
              placeholder="Añadir personaje no detectado"
              className="min-w-0 flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
            />
            <button type="submit" disabled={!newCharacterName.trim()} className="rounded-xl border border-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent)] disabled:opacity-40">
              Añadir
            </button>
          </form>

          {error && <p role="alert" className="rounded-xl border border-[var(--danger)] bg-[var(--danger)]/10 p-3 text-xs text-[var(--danger)]">No se pudo guardar la configuración: {error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--border-color)] p-4 sm:px-6">
          <button type="button" disabled={saving} onClick={onCancel} className="rounded-xl px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-input)]">Cancelar</button>
          <button type="button" disabled={saving || voices.length === 0} onClick={() => void confirm()} className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar y abrir lectura'}
          </button>
        </footer>
      </section>
    </div>
  )
}
