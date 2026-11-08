// ============================================================
// VoxLector AI — BookCard Component
// ============================================================

import { useState } from 'react'
import type { Book } from '@/types'

interface Props {
  book: Book
  animDelay: number
  onOpen: () => void
  onDelete: () => void
}

export default function BookCard({ book, animDelay, onOpen, onDelete }: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const progress = book.sentences.length > 0
    ? Math.round((book.lastSentenceIndex / Math.max(1, book.sentences.length)) * 100)
    : 0

  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer animate-fade-in-up group"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        animationDelay: `${animDelay}ms`,
        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}
      onMouseLeave={() => setShowMenu(false)}
    >
      {/* Cover */}
      <div
        className="relative flex items-center justify-center aspect-[3/4] text-5xl"
        style={{ background: `linear-gradient(135deg, ${book.colorGradient[0]}, ${book.colorGradient[1]})` }}
        onClick={onOpen}
      >
        {book.coverImage ? (
          <img
            src={book.coverImage}
            alt={`Portada de ${book.title}`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span style={{ fontSize: '3rem', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }}>
            {book.emoji}
          </span>
        )}
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        {/* Format badge */}
        <span className="absolute top-2 right-2 text-[0.6rem] font-bold uppercase px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', backdropFilter: 'blur(8px)' }}>
          {book.format}
        </span>
        {/* Progress */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
            <div className="h-full progress-gradient rounded-r"
              style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3" onClick={onOpen}>
        <h3 className="text-[0.82rem] font-bold leading-tight mb-1 line-clamp-2">
          {book.title}
        </h3>
        <p className="text-[0.72rem]" style={{ color: 'var(--text-secondary)' }}>
          {book.author}
        </p>
        {progress > 0 && (
          <p className="text-[0.68rem] mt-1.5 font-semibold" style={{ color: 'var(--accent)' }}>
            {progress}% leído
          </p>
        )}
      </div>

      {/* Context menu button */}
      <button
        className="absolute top-2 left-2 w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
        onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v) }}
      >
        <span className="material-icons-round text-base">more_vert</span>
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <div
          className="absolute top-10 left-2 z-20 rounded-xl overflow-hidden shadow-2xl animate-fade-in-up"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', minWidth: 140 }}
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-[var(--highlight-bg)] transition-colors text-left"
            onClick={() => { setShowMenu(false); onOpen() }}
          >
            <span className="material-icons-round text-base">menu_book</span>
            Leer
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm transition-colors text-left"
            style={{ color: 'var(--danger)' }}
            onClick={() => {
              if (confirm(`¿Eliminar "${book.title}"?`)) {
                setShowMenu(false)
                onDelete()
              }
            }}
          >
            <span className="material-icons-round text-base">delete</span>
            Eliminar
          </button>
        </div>
      )}
    </div>
  )
}
