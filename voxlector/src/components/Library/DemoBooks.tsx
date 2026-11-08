// ============================================================
// VoxLector AI — Demo Books Component
// 100% Free of copyright (Universal Public Domain: Lewis Carroll 1865)
// Preserves real original literary prose without synthetic "Narrador:" tags
// ============================================================

import React from 'react'
import { useLibraryStore } from '@/stores/libraryStore'
import type { Book } from '@/types'
import { detectCharactersAndParse, paginateSentences } from '@/services/characterDetector'

const DEMO_BOOK = {
  id: 'demo_alicia',
  title: 'Alicia en el País de las Maravillas',
  author: 'Lewis Carroll (1865 — Dominio Público Universal)',
  emoji: '🐇',
  colorGradient: ['#3b82f6', '#1d4ed8'] as [string, string],
  format: 'txt' as const,
  text: `Alicia empezaba a cansarse de estar sentada junto a su hermana a la orilla del río, sin tener nada que hacer. Había echado un par de miradas al libro que su hermana leía, pero no tenía ilustraciones ni diálogos.

«¿Y de qué sirve un libro sin dibujos ni conversaciones?», pensaba Alicia con fastidio.

Estaba deliberando, con el sopor del cálido día haciéndola sentir adormilada y torpe, si el deleite de tejer una guirnalda de margaritas justificaría la molestia de levantarse, cuando de súbito un Conejo Blanco de ojos rosados pasó a toda prisa rozando sus faldas.

No había en aquello nada excesivamente extraordinario, ni tampoco le pareció a Alicia insólito escuchar que el conejo murmuraba angustiado para sus adentros:

—¡Ay de mí! ¡Ay de mí! ¡Llegaré demasiado tarde!

Pero cuando el animal extrajo con suma naturalidad un reloj del bolsillo de su chaleco, contempló las manecillas con alarma y apretó el paso a toda velocidad, Alicia se incorporó de un salto. Una centella de asombro cruzó por su mente, pues jamás en su vida había visto a un conejo enfundado en un chaleco ni mucho menos portando un reloj de bolsillo.

Impulsada por una curiosidad ardiente, echó a correr tras él a través de la pradera, llegando justo a tiempo para atisbar cómo se deslizaba dentro de una espaciosa madriguera oculta bajo las raíces del seto.

Un instante después, la propia Alicia se precipitaba al interior del túnel tras el conejo, sin concederse un solo instante para meditar en cómo se las ingeniaría luego para volver a la superficie.

La madriguera avanzaba recta al principio, pero repentinamente se hundió en una sima vertical tan abrupta que Alicia cayó al vacío sin tiempo de sujetarse. Descendía por lo que parecía ser un pozo interminable.

O el pozo era inconcebiblemente profundo, o ella descendía con pasmosa lentitud, porque le sobró tiempo para observar los muros a su alrededor. Estaban repletos de alacenas de madera, anaqueles de libros, mapas geográficos y cuadros colgados con primor.

—¡Vaya! —exclamó Alicia para sus adentros con tono triunfal—. Después de precipitarme en este abismo, ¡rodar por las escaleras de casa me parecerá un juego de niños! ¡Todos en la familia jurarán que he sido muy valiente!`,
}

interface Props {
  onOpen: (book: Book) => void
}

export default function DemoBooks({ onOpen }: Props) {
  const { books, addBook } = useLibraryStore()

  const openDemo = async () => {
    const existing = books.find(b => b.id === DEMO_BOOK.id)
    if (existing && existing.sentences && existing.sentences.length > 0) {
      onOpen(existing)
      return
    }

    const { sentences, characters } = detectCharactersAndParse(DEMO_BOOK.text, 1)
    const pages = paginateSentences(sentences, 800)
    const book: Omit<Book, 'addedAt'> = {
      id: DEMO_BOOK.id,
      title: DEMO_BOOK.title,
      author: DEMO_BOOK.author,
      format: DEMO_BOOK.format,
      emoji: DEMO_BOOK.emoji,
      colorGradient: DEMO_BOOK.colorGradient,
      sentences,
      characters,
      pages,
      totalPages: pages.length,
      lastSentenceIndex: 0,
      lastPageIndex: 0,
      readingMode: 'multivoice',
      voiceAssignments: {},
      narratorVoiceId: 'narrator_default',
    }
    await addBook(book)
    onOpen({ ...book, addedAt: Date.now() })
  }

  return (
    <div className="mt-8 select-none">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <span aria-hidden="true" className="text-lg text-[var(--accent-secondary)]">📖</span>
          Lectura Clásica de Demostración (100% Dominio Público)
        </h2>
        <span className="text-[0.68rem] text-[var(--text-muted)] font-mono">
          Libre de derechos de autor
        </span>
      </div>

      <div className="max-w-md">
        <button
          className="w-full flex items-center gap-4 p-4 rounded-2xl cursor-pointer text-left animate-fade-in-up group transition-all border hover:border-[var(--accent)]"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border-color)',
          }}
          onClick={openDemo}
        >
          <div
            className="w-20 h-28 flex-shrink-0 rounded-xl flex items-center justify-center text-4xl relative overflow-hidden shadow-lg"
            style={{ background: `linear-gradient(135deg, ${DEMO_BOOK.colorGradient[0]}, ${DEMO_BOOK.colorGradient[1]})` }}
          >
            <span style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }}>
              {DEMO_BOOK.emoji}
            </span>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <span
              className="absolute top-1 right-1 text-[0.5rem] font-bold uppercase px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.7)', color: '#4ade80' }}
            >
              CC0 / LIBRE
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-[0.65rem] font-mono uppercase tracking-widest text-[var(--accent)] font-bold block mb-1">
              Obra Maestra Universal
            </span>
            <h3 className="text-sm font-black leading-snug mb-1 text-white group-hover:text-[var(--accent)] transition-colors">
              {DEMO_BOOK.title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] line-clamp-1 mb-2">
              {DEMO_BOOK.author}
            </p>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)]">
              <span>Comenzar lectura</span>
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
