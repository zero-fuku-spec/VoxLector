// ============================================================
// VoxLector AI — Player Store (Zustand)
// ============================================================

import { create } from 'zustand';
import { stopSpeaking, pauseSpeaking, resumeSpeaking } from '@/services/ttsService';

interface PlayerStore {
  bookId: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  currentSentenceIndex: number;
  currentPageIndex: number;
  speed: number;
  sleepTimerEndAt: number | null;
  play: (bookId: string, sentenceIndex: number, pageIndex: number) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => void;
  nextSentence: () => void;
  prevSentence: () => void;
  seekToSentence: (index: number) => void;
  setSpeed: (speed: number) => void;
  setSleepTimer: (endAt: number | null) => void;
  setCurrentPage: (pageIndex: number) => void;
}

export const usePlayerStore = create<PlayerStore>()((set, get) => {
  let pendingPause: Promise<void> | null = null
  return {
  bookId: null,
  isPlaying: false,
  isPaused: false,
  currentSentenceIndex: 0,
  currentPageIndex: 0,
  speed: 0.9,
  sleepTimerEndAt: null,

  play: (bookId, sentenceIndex, pageIndex) => {
    set({ bookId, isPlaying: true, isPaused: false, currentSentenceIndex: sentenceIndex, currentPageIndex: pageIndex });
  },

  pause: async () => {
    set({ isPlaying: false, isPaused: true });
    pendingPause = pauseSpeaking()
    await pendingPause
  },

  resume: async () => {
    if (pendingPause) {
      await pendingPause
      pendingPause = null
    }
    resumeSpeaking();
    set({ isPlaying: true, isPaused: false });
  },

  stop: () => {
    stopSpeaking();
    set({ isPlaying: false, isPaused: false });
  },

  nextSentence: () => {
    set(state => ({ currentSentenceIndex: state.currentSentenceIndex + 1 }));
  },

  prevSentence: () => {
    set(state => ({
      currentSentenceIndex: Math.max(0, state.currentSentenceIndex - 1),
    }));
  },

  seekToSentence: (index) => {
    set({ currentSentenceIndex: index });
  },

  setSpeed: (speed) => {
    const clamped = Math.max(0.3, Math.min(3.0, speed));
    set({ speed: parseFloat(clamped.toFixed(1)) });
  },

  setSleepTimer: (endAt) => set({ sleepTimerEndAt: endAt }),

  setCurrentPage: (pageIndex) => set({ currentPageIndex: pageIndex }),
  };
});
