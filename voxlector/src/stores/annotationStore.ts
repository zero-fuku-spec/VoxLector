// ============================================================
// VoxLector AI — Annotation & Notes Store
// ReadEra / Listen AI style text highlighting and note keeping
// ============================================================

import { create } from 'zustand';
import type { Annotation } from '@/types';
import { storageService } from '@/services/storageService';

interface AnnotationStore {
  annotations: Annotation[];
  isLoaded: boolean;
  load: () => Promise<void>;
  addHighlight: (
    bookId: string,
    sentenceIndex: number,
    selectedText: string,
    color?: string
  ) => Annotation;
  addNote: (
    bookId: string,
    sentenceIndex: number,
    selectedText: string,
    noteText: string,
    color?: string
  ) => Annotation;
  updateNote: (id: string, noteText: string) => void;
  removeAnnotation: (id: string) => void;
  getAnnotationsForBook: (bookId: string) => Annotation[];
  getAnnotationsForSentence: (bookId: string, sentenceIndex: number) => Annotation[];
}

async function persist(annotations: Annotation[]): Promise<void> {
  await storageService.set('annotations', annotations);
}

export const useAnnotationStore = create<AnnotationStore>()((set, get) => ({
  annotations: [],
  isLoaded: false,

  load: async () => {
    const saved = await storageService.get<Annotation[]>('annotations', []);
    set({ annotations: saved, isLoaded: true });
  },

  addHighlight: (bookId, sentenceIndex, selectedText, color = '#facc15') => {
    const id = `anno_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newAnno: Annotation = {
      id,
      bookId,
      sentenceIndex,
      selectedText,
      color,
      createdAt: Date.now(),
    };
    set(state => {
      const annotations = [newAnno, ...state.annotations];
      void persist(annotations);
      return { annotations };
    });
    return newAnno;
  },

  addNote: (bookId, sentenceIndex, selectedText, noteText, color = '#7c5cff') => {
    const id = `anno_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newAnno: Annotation = {
      id,
      bookId,
      sentenceIndex,
      selectedText,
      noteText,
      color,
      createdAt: Date.now(),
    };
    set(state => {
      const annotations = [newAnno, ...state.annotations];
      void persist(annotations);
      return { annotations };
    });
    return newAnno;
  },

  updateNote: (id, noteText) => {
    set(state => {
      const annotations = state.annotations.map(a =>
        a.id === id ? { ...a, noteText } : a
      );
      void persist(annotations);
      return { annotations };
    });
  },

  removeAnnotation: (id) => {
    set(state => {
      const annotations = state.annotations.filter(a => a.id !== id);
      void persist(annotations);
      return { annotations };
    });
  },

  getAnnotationsForBook: (bookId) => {
    return get().annotations.filter(a => a.bookId === bookId);
  },

  getAnnotationsForSentence: (bookId, sentenceIndex) => {
    return get().annotations.filter(
      a => a.bookId === bookId && a.sentenceIndex === sentenceIndex
    );
  },
}));
