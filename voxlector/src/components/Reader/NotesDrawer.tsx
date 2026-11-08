// ============================================================
// VoxLector AI — NotesDrawer Component
// Slide-out panel for viewing, searching, and jumping to
// book highlights and personal notes (ReadEra / Listen AI style)
// ============================================================

import React, { useState } from 'react'
import type { Annotation, Book } from '@/types'
import { useAnnotationStore } from '@/stores/annotationStore'

interface Props {
  book: Book
  onClose: () => void
  onJumpToSentence: (sentenceIndex: number) => void
}

export default function NotesDrawer({ book, onClose, onJumpToSentence }: Props) {
  const { getAnnotationsForBook, removeAnnotation, updateNote } = useAnnotationStore()
  const annotations = getAnnotationsForBook(book.id)

  const [filterColor, setFilterColor] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const filtered = filterColor
    ? annotations.filter(a => a.color === filterColor)
    : annotations

  const handleStartEdit = (a: Annotation) => {
    setEditingId(a.id)
    setEditText(a.noteText || '')
  }

  const handleSaveEdit = (id: string) => {
    updateNote(id, editText)
    setEditingId(null)
  }

  return (
    <div
      className="modal-overlay modal-overlay-end animate-fade-in-up"
      onClick={onClose}
    >
      <div
        className="modal-container modal-container-drawer glass-card p-5 flex flex-col gap-4 border-l shadow-2xl"
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
              format_color_highlight
            </span>
            <div>
              <h2 className="text-base font-bold">Notas y Subrayados</h2>
              <span className="text-[0.68rem] text-[var(--text-secondary)]">
                {annotations.length} fragmentos destacados
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

        {/* Color Filters */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Filtrar:</span>
          <button
            onClick={() => setFilterColor(null)}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
              filterColor === null
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)]'
            }`}
          >
            Todos
          </button>
          {['#facc15', '#4ade80', '#ff6b9d', '#60a5fa'].map(c => (
            <button
              key={c}
              onClick={() => setFilterColor(filterColor === c ? null : c)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${
                filterColor === c ? 'scale-125 ring-2 ring-[var(--accent)]' : 'opacity-80 hover:scale-110'
              }`}
              style={{ background: c, borderColor: '#ffffff' }}
            />
          ))}
        </div>

        {/* List of Annotations */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center opacity-60">
              <span className="material-icons-round text-5xl mb-2 text-[var(--text-muted)]">
                bookmark_border
              </span>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Sin notas ni subrayados
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1 max-w-[240px]">
                Mantén presionado cualquier texto en el lector para subrayar o agregar notas personales.
              </p>
            </div>
          ) : (
            filtered.map(a => {
              const sentenceObj = book.sentences[a.sentenceIndex]
              const pageNum = sentenceObj?.pageNumber || 1

              return (
                <div
                  key={a.id}
                  className="p-3.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-col gap-2 relative group"
                  style={{ borderLeftWidth: 4, borderLeftColor: a.color }}
                >
                  {/* Quote text */}
                  <p
                    className="text-xs italic leading-relaxed text-[var(--text-primary)] cursor-pointer hover:underline"
                    onClick={() => {
                      onJumpToSentence(a.sentenceIndex)
                      onClose()
                    }}
                  >
                    «{a.selectedText}»
                  </p>

                  {/* Note text if any */}
                  {editingId === a.id ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="Escribe tu nota personal..."
                        className="w-full p-2 rounded-xl text-xs bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none resize-none h-16"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-[var(--bg-card)]"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleSaveEdit(a.id)}
                          className="px-2.5 py-1 text-xs font-bold text-white rounded-lg bg-[var(--accent)]"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : a.noteText ? (
                    <p className="text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-card)] p-2 rounded-xl border border-[var(--border-color)]">
                      📝 {a.noteText}
                    </p>
                  ) : null}

                  {/* Meta row: Page, Date, and Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)] text-[0.68rem] text-[var(--text-muted)]">
                    <span className="font-mono font-semibold">
                      Pág. {pageNum}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(a)}
                        className="p-1 hover:text-[var(--accent)] transition-colors"
                        title="Editar o añadir nota"
                      >
                        <span className="material-icons-round text-sm">edit_note</span>
                      </button>
                      <button
                        onClick={() => removeAnnotation(a.id)}
                        className="p-1 hover:text-[var(--danger)] transition-colors"
                        title="Eliminar subrayado"
                      >
                        <span className="material-icons-round text-sm">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
