// ============================================================
// VoxLector AI — IndexedDB Storage Service (dbService.ts)
// Robust storage for book contents, sentences, and pages (unlimited size)
// Prevents quota overflows and data loss on reload
// ============================================================

import type { Book, ParsedSentence, SavedVoiceProfile } from '@/types';

const DB_NAME = 'voxlector_db';
const DB_VERSION = 4;
const STORE_BOOK_CONTENT = 'book_content';
const STORE_BOOK_METADATA = 'book_metadata';
const STORE_PDF_SOURCE = 'pdf_source';
const STORE_VOICE_PROFILES = 'voice_profiles';
const MAX_LOCAL_FALLBACK_BYTES = 2 * 1024 * 1024;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // IndexedDB is available in both the window and dedicated Web Workers.
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const openRequest = event.target as IDBOpenDBRequest
      const db = openRequest.result;
      if (!db.objectStoreNames.contains(STORE_BOOK_CONTENT)) {
        db.createObjectStore(STORE_BOOK_CONTENT, { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains(STORE_BOOK_METADATA)) {
        db.createObjectStore(STORE_BOOK_METADATA, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_VOICE_PROFILES)) {
        db.createObjectStore(STORE_VOICE_PROFILES, { keyPath: 'id' });
      }
      const pdfSourceStore = db.objectStoreNames.contains(STORE_PDF_SOURCE)
        ? openRequest.transaction?.objectStore(STORE_PDF_SOURCE)
        : db.createObjectStore(STORE_PDF_SOURCE, { keyPath: 'bookId' })
      const transaction = openRequest.transaction
      if (event.oldVersion < 2 && pdfSourceStore && transaction) {
        const cursorRequest = transaction.objectStore(STORE_BOOK_CONTENT).openCursor()
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) return
          const record = cursor.value as BookContentData
          if (record.sourceData) {
            pdfSourceStore.put({ bookId: record.bookId, sourceData: record.sourceData })
            delete record.sourceData
            cursor.update(record)
          }
          cursor.continue()
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface BookContentData {
  bookId: string;
  sentences: ParsedSentence[];
  pages: number[][];
  sourceData?: ArrayBuffer;
  updatedAt: number;
}

export type BookMetadataRecord = Book

export const dbService = {
  async saveBookMetadata(book: BookMetadataRecord): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOK_METADATA, 'readwrite')
      tx.objectStore(STORE_BOOK_METADATA).put(book)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error ?? new Error('No se pudieron guardar los metadatos del documento.'))
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error ?? new Error('Se canceló el guardado de metadatos del documento.'))
      }
    })
  },

  async loadBookMetadata(): Promise<BookMetadataRecord[]> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOK_METADATA, 'readonly')
      const request = tx.objectStore(STORE_BOOK_METADATA).getAll()
      request.onsuccess = () => {
        db.close()
        resolve(request.result as BookMetadataRecord[])
      }
      request.onerror = () => {
        db.close()
        reject(request.error ?? new Error('No se pudieron cargar los metadatos de la biblioteca.'))
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error ?? new Error('Se canceló la carga de metadatos de la biblioteca.'))
      }
    })
  },

  async loadVoiceProfiles(): Promise<SavedVoiceProfile[]> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_VOICE_PROFILES, 'readonly')
      const request = tx.objectStore(STORE_VOICE_PROFILES).getAll()
      request.onsuccess = () => {
        db.close()
        resolve(request.result as SavedVoiceProfile[])
      }
      request.onerror = () => {
        db.close()
        reject(request.error ?? new Error('No se pudieron cargar los perfiles de voz.'))
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error ?? new Error('Se canceló la carga de perfiles de voz.'))
      }
    })
  },

  async loadVoiceProfile(profileId: string): Promise<SavedVoiceProfile | null> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_VOICE_PROFILES, 'readonly')
      const request = tx.objectStore(STORE_VOICE_PROFILES).get(profileId)
      request.onsuccess = () => {
        db.close()
        resolve((request.result as SavedVoiceProfile | undefined) ?? null)
      }
      request.onerror = () => {
        db.close()
        reject(request.error ?? new Error(`No se pudo cargar el perfil de voz "${profileId}".`))
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error ?? new Error(`Se canceló la carga del perfil de voz "${profileId}".`))
      }
    })
  },

  async saveVoiceProfiles(profiles: SavedVoiceProfile[]): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_VOICE_PROFILES, 'readwrite')
      const store = tx.objectStore(STORE_VOICE_PROFILES)
      store.clear()
      for (const profile of profiles) store.put(profile)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error ?? new Error('No se pudieron guardar los perfiles de voz.'))
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error ?? new Error('Se canceló el guardado de perfiles de voz.'))
      }
    })
  },

  async saveBookContent(
    bookId: string,
    sentences: ParsedSentence[],
    pages: number[][],
    sourceData?: ArrayBuffer,
  ): Promise<void> {
    let safeSourceData: ArrayBuffer | undefined
    try {
      safeSourceData = sourceData?.slice(0)
    } catch (error) {
      console.error('[VoxLector] El buffer original del documento ya no está disponible:', error)
      throw new Error(`No se pudo preparar el buffer original del documento: ${String(error)}`)
    }

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_BOOK_CONTENT, STORE_PDF_SOURCE], 'readwrite');
        const store = tx.objectStore(STORE_BOOK_CONTENT);
        const data: BookContentData = {
          bookId,
          sentences,
          pages,
          updatedAt: Date.now(),
        };
        const req = store.put(data);
        if (safeSourceData) {
          tx.objectStore(STORE_PDF_SOURCE).put({ bookId, sourceData: safeSourceData })
        } else {
          tx.objectStore(STORE_PDF_SOURCE).delete(bookId)
        }
        req.onerror = () => reject(req.error ?? new Error('IndexedDB rechazó el contenido del libro.'));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('No se pudo completar el guardado del libro.'));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('Se canceló el guardado del libro.'));
        };
      });
    } catch (storageError) {
      try {
        if (typeof localStorage === 'undefined') throw new Error('No hay almacenamiento de respaldo disponible.');
        const payload = JSON.stringify({ sentences, pages });
        if (sourceData || payload.length * 2 > MAX_LOCAL_FALLBACK_BYTES) {
          throw new Error('El documento es demasiado grande para el almacenamiento de respaldo.');
        }
        localStorage.setItem(`vox_content_${bookId}`, payload);
      } catch (fallbackError) {
        console.error('[VoxLector] No se pudo guardar el contenido del libro:', storageError, fallbackError);
        throw new Error(
          `No se pudo guardar el documento en el almacenamiento local: ${String(fallbackError)}`,
        );
      }
    }
  },

  async loadBookContent(bookId: string): Promise<{
    sentences: ParsedSentence[];
    pages: number[][];
    sourceData?: ArrayBuffer;
  } | null> {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_BOOK_CONTENT, 'readonly');
        const store = tx.objectStore(STORE_BOOK_CONTENT);
        const req = store.get(bookId);
        req.onsuccess = () => {
          db.close()
          if (req.result) {
            resolve({
              sentences: req.result.sentences,
              pages: req.result.pages,
            });
          } else {
            // Check fallback in localStorage
            const raw = localStorage.getItem(`vox_content_${bookId}`);
            if (raw) {
              try {
                resolve(JSON.parse(raw));
                return;
              } catch {}
            }
            resolve(null);
          }
        };
        req.onerror = () => {
          db.close()
          const raw = localStorage.getItem(`vox_content_${bookId}`);
          if (raw) {
            try {
              resolve(JSON.parse(raw));
              return;
            } catch {}
          }
          resolve(null);
        };
      });
    } catch {
      const raw = localStorage.getItem(`vox_content_${bookId}`);
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch {}
      }
      return null;
    }
  },

  async loadPdfSourceData(bookId: string): Promise<ArrayBuffer | null> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PDF_SOURCE, 'readonly')
      const request = tx.objectStore(STORE_PDF_SOURCE).get(bookId)
      request.onsuccess = () => {
        const result = request.result as { sourceData?: ArrayBuffer } | undefined
        db.close()
        resolve(result?.sourceData ?? null)
      }
      request.onerror = () => {
        db.close()
        reject(request.error ?? new Error('No se pudo cargar el buffer del PDF.'))
      }
    })
  },

  async removeBookContent(bookId: string): Promise<void> {
    try {
      localStorage.removeItem(`vox_content_${bookId}`);
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction([STORE_BOOK_CONTENT, STORE_PDF_SOURCE, STORE_BOOK_METADATA], 'readwrite');
        const store = tx.objectStore(STORE_BOOK_CONTENT);
        const req = store.delete(bookId);
        tx.objectStore(STORE_PDF_SOURCE).delete(bookId)
        tx.objectStore(STORE_BOOK_METADATA).delete(bookId)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          resolve()
        }
      });
    } catch {
      // Ignore cleanup error
    }
  },
};
