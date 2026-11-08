// ============================================================
// VoxLector AI — Library Store (Zustand + persistence)
// ============================================================

import { create } from 'zustand';
import type { Book, ReadingMode } from '@/types';
import { storageService } from '@/services/storageService';
import { dbService } from '@/services/dbService';
import { getCharacterId } from '@/services/characterDetector';

const BOOK_EMOJIS = ['📚', '📖', '🔮', '🗺️', '⚔️', '🌟', '🎭', '🔬', '🏰', '🌊'];
const BOOK_COLORS: [string, string][] = [
  ['#7c5cff', '#9579ff'],
  ['#ff6b9d', '#ff8fbf'],
  ['#4ade80', '#22c55e'],
  ['#fbbf24', '#f59e0b'],
  ['#60a5fa', '#3b82f6'],
  ['#f87171', '#ef4444'],
  ['#a78bfa', '#8b5cf6'],
  ['#fb923c', '#f97316'],
];

interface LibraryStore {
  books: Book[];
  activeBookId: string | null;
  isLoaded: boolean;
  load: () => Promise<void>;
  addBook: (book: Omit<Book, 'addedAt'>, sourceData?: ArrayBuffer) => Promise<void>;
  updateBook: (id: string, updates: Partial<Book>) => void;
  saveBookChanges: (id: string, updates: Partial<Book>) => Promise<void>;
  removeBook: (id: string) => void;
  setActiveBook: (id: string | null) => void;
  savePosition: (bookId: string, sentenceIndex: number, pageIndex: number) => void;
  setReadingMode: (bookId: string, mode: ReadingMode) => void;
  assignVoice: (bookId: string, charName: string, voiceId: string) => Promise<void>;
  setNarratorVoice: (bookId: string, voiceId: string) => Promise<void>;
  getActiveBook: () => Book | undefined;
  pickEmoji: (index: number) => string;
  pickColor: (index: number) => [string, string];
}

// Strip sentences before saving metadata — only keep lightweight book info
async function saveBooksMetadata(books: Book[]): Promise<void> {
  const metaOnly = books.map(({ sentences: _s, ...rest }) => ({
    ...rest,
    sentences: [] as Book['sentences'],
  }));
  let indexedDbSaved = false
  try {
    await Promise.all(metaOnly.map(book => dbService.saveBookMetadata(book)))
    indexedDbSaved = true
  } catch (error) {
    console.error('[VoxLector] No se pudieron guardar los metadatos en IndexedDB:', error)
  }
  try {
    await storageService.set('library', metaOnly)
  } catch (error) {
    if (!indexedDbSaved) throw error
    console.warn('[VoxLector] Los metadatos están en IndexedDB, pero falló el respaldo local:', error)
  }
}

// Serialize metadata snapshots so an older async write cannot overwrite a
// newer character-to-voice assignment when UI actions happen back to back.
let pendingLibrarySave: Promise<void> = Promise.resolve()
function persistBooks(books: Book[]): Promise<void> {
  const snapshot = books.map(book => ({ ...book, voiceAssignments: { ...book.voiceAssignments } }))
  const saving = pendingLibrarySave.catch(() => undefined).then(() => saveBooksMetadata(snapshot))
  pendingLibrarySave = saving
  return saving
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  books: [],
  activeBookId: null,
  isLoaded: false,

  load: async () => {
    const saved = await storageService.get<Book[]>('library', []);
    try {
      const indexedMetadata = await dbService.loadBookMetadata()
      const byId = new Map(saved.map(book => [book.id, book]))
      for (const book of indexedMetadata) byId.set(book.id, { ...byId.get(book.id), ...book })
      const books = Array.from(byId.values())
      set({ books, isLoaded: true })
      return
    } catch (error) {
      console.error('[VoxLector] No se pudieron cargar metadatos de biblioteca desde IndexedDB:', error)
    }
    set({ books: saved, isLoaded: true });
  },

  addBook: async (book, sourceData) => {
    let storedCoverImage: string | undefined
    try {
      storedCoverImage = (await dbService.loadBookMetadata()).find(item => item.id === book.id)?.coverImage
    } catch (error) {
      console.warn('[VoxLector] No se pudo recuperar la portada guardada del libro:', error)
    }
    const full: Book = {
      ...book,
      coverImage: book.coverImage ?? storedCoverImage,
      addedAt: Date.now(),
    };
    if (full.sentences && full.sentences.length > 0) {
      await dbService.saveBookContent(full.id, full.sentences, full.pages, sourceData);
    }
    const metadata: Book = { ...full, sentences: [] };
    const nextBooks = [metadata, ...get().books.filter(b => b.id !== metadata.id)];
    await persistBooks(nextBooks)
    set({ books: nextBooks });
  },

  updateBook: (id, updates) => {
    set(state => {
      const books = state.books.map(b => {
        if (b.id !== id) return b;
        const updated = { ...b, ...updates };
        if (updates.sentences || updates.pages) {
          void dbService.saveBookContent(id, updated.sentences, updated.pages);
        }
        return updated;
      });
      void persistBooks(books).catch(error => console.error('[VoxLector] No se pudo guardar la biblioteca:', error));
      return { books };
    });
  },

  saveBookChanges: async (id, updates) => {
    const previousBooks = get().books
    if (!previousBooks.some(book => book.id === id)) {
      throw new Error(`No se encontró el libro "${id}" para guardar sus cambios.`)
    }
    const books = previousBooks.map(book => book.id === id ? { ...book, ...updates } : book)
    const updatedBook = books.find(book => book.id === id)!
    // Publish synchronously so quick edits build on the latest immutable mapping.
    set({ books })
    if (updates.sentences || updates.pages) {
      await dbService.saveBookContent(id, updatedBook.sentences, updatedBook.pages)
    }
    await persistBooks(books)
  },

  removeBook: (id) => {
    void dbService.removeBookContent(id);
    set(state => {
      const books = state.books.filter(b => b.id !== id);
      void persistBooks(books).catch(error => console.error('[VoxLector] No se pudo guardar la biblioteca:', error));
      return { books, activeBookId: state.activeBookId === id ? null : state.activeBookId };
    });
  },

  setActiveBook: (id) => set({ activeBookId: id }),

  savePosition: (bookId, sentenceIndex, pageIndex) => {
    set(state => {
      const books = state.books.map(b =>
        b.id === bookId
          ? { ...b, lastSentenceIndex: sentenceIndex, lastPageIndex: pageIndex }
          : b
      );
      void persistBooks(books).catch(error => console.error('[VoxLector] No se pudo guardar la biblioteca:', error));
      return { books };
    });
  },

  setReadingMode: (bookId, mode) => {
    set(state => {
      const books = state.books.map(b =>
        b.id === bookId ? { ...b, readingMode: mode } : b
      );
      void persistBooks(books).catch(error => console.error('[VoxLector] No se pudo guardar la biblioteca:', error));
      return { books };
    });
  },

  assignVoice: async (bookId, charName, voiceId) => {
    const current = get().books
    const books = current.map(book => {
      if (book.id !== bookId) return book
      const characterId = book.characters.find(character =>
        character.name.trim().toLocaleLowerCase() === charName.trim().toLocaleLowerCase(),
      )?.characterId ?? getCharacterId(charName)
      return {
        ...book,
        voiceAssignments: { ...(book.voiceAssignments ?? {}), [characterId]: voiceId },
      }
    })
    set({ books })
    await persistBooks(books)
  },

  setNarratorVoice: async (bookId, voiceId) => {
    const books = get().books.map(book =>
      book.id === bookId ? { ...book, narratorVoiceId: voiceId } : book,
    )
    set({ books })
    await persistBooks(books)
  },

  getActiveBook: () => {
    const { books, activeBookId } = get();
    return books.find(b => b.id === activeBookId);
  },

  pickEmoji: (index) => BOOK_EMOJIS[index % BOOK_EMOJIS.length],
  pickColor: (index) => BOOK_COLORS[index % BOOK_COLORS.length],
}));
