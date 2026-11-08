// ============================================================
// VoxLector AI — Global Types
// ============================================================

// Problema 1: se añade 'matrix' como quinto tema base, claramente distinto de 'dark' y 'oled'.
export type Theme = 'dark' | 'light' | 'sepia' | 'oled' | 'matrix';
export type ReadingMode = 'narrator' | 'multivoice';
export type CloudProvider = 'none' | 'openai' | 'elevenlabs' | 'google' | 'huggingface';
export type LibraryViewMode = 'grid_large' | 'list_compact' | 'list_pure';

// ── Voice ────────────────────────────────────────────────────
export interface VoicePreset {
  id: string;
  name: string;
  assignedCharacter: string | null;
  baseVoiceURI: string;
  pitch: number;       // 0.3 – 2.5
  rate: number;        // 0.3 – 3.0
  volume: number;      // 0 – 1
  eqNodes: EQNode[];
  formant: number;     // -12 – 12 semitones
  resonance: number;   // 0.1 – 5
  breathiness: number; // 0 – 1
  warmth: number;      // 0 – 1
  harmonics: number;   // 0 – 1
  modulation: number;  // 0 – 1 (vibrato depth)
  modulationRate: number; // 0 – 10 Hz
  tremolo: number;     // 0 – 1
  chorus: number;      // 0 – 1
  reverb: number;      // 0 – 1
  clarity: number;     // 0 – 1
  bassBoost?: number;  // -12 to +12 dB
  midPresence?: number;// -12 to +12 dB
  roughness?: number;  // 0 – 1 (texture/distortion)
  vibrato?: number;    // 0 – 1 (vocal modulation)
  voiceURI?: string;
  voiceEngine?: 'native' | 'web';
  localPcmVoiceId?: string;
  lang?: string;
  isCustom?: boolean;
  updatedAt?: number;
}

export interface EQNode {
  id: number;
  freq: number;    // Hz
  gain: number;    // -18 to +18 dB
  q: number;       // 0.1 – 10
  type: BiquadFilterType;
  label: string;
  x: number;       // normalized 0–1 canvas position
  y: number;       // normalized 0–1 canvas position
}

export type SpectralMesh = [
  number, number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number,
]

export interface SavedVoiceProfile extends VoicePreset {
  readonly voiceURI: string;
  readonly lang: string;
  readonly spectralMesh: SpectralMesh;
  readonly isCustom: boolean;
  readonly updatedAt: number;
}

// ── Annotations & Notes ──────────────────────────────────────
export interface Annotation {
  id: string;
  bookId: string;
  sentenceIndex: number;
  wordIndex?: number;
  selectedText: string;
  noteText?: string;
  color: string; // e.g. '#facc15', '#4ade80', '#ff6b9d', '#60a5fa'
  createdAt: number;
}

// ── Book / Library ───────────────────────────────────────────
export type BookFormat = 'pdf' | 'epub' | 'txt' | 'md' | 'fb2' | 'docx' | 'rtf';

export interface Book {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  emoji: string;
  colorGradient: [string, string];
  sentences: ParsedSentence[];
  characters: DetectedCharacter[];
  pages: number[][]; // array of page indices mapping directly to actual book pages
  totalPages: number;
  lastSentenceIndex: number;
  lastPageIndex: number;
  readingMode: ReadingMode;
  voiceAssignments: Record<string, string>; // stable CharacterID → VoiceID
  narratorVoiceId: string;
  addedAt: number;
  coverImage?: string;
  sourceMetadata?: {
    name: string;
    path: string;
    size: number;
    type: string;
  };
  importStatus?: 'pending' | 'ready' | 'error';
}

export interface ParsedSentence {
  index: number;
  pageNumber: number; // 1-based exact page number
  text: string;
  displayText?: string;
  spokenText?: string;
  rawOriginalText?: string;
  // Problema de imágenes: conserva recursos incrustados hasta su renderizado en el lector.
  embeddedImages?: Array<{ src: string; alt: string }>;
  character?: string;  // name of speaker if dialogue
  characterId?: string;
  emotion?: string;    // emotional tag e.g. 'triste', 'alegre', 'susurro', 'enojado'
  narratorAnnouncement?: string;
  isNarration: boolean;
  words?: string[];    // pre-split words for fine-grained highlighting
  paragraphIndex?: number;
  isParagraphStart?: boolean;
  // Problema 3: metadatos tipográficos para representar el PDF como texto escalable.
  pdfFontFamily?: string;
  pdfFontScale?: number;
  pdfFontWeight?: number;
  pdfFontStyle?: 'normal' | 'italic';
  pdfTextIndentEm?: number;
  pdfPageMarginLeft?: number;
  pdfPageMarginRight?: number;
}

export interface DetectedCharacter {
  characterId?: string;
  name: string;
  emoji: string;
  color: string;
  lineCount: number;
}

// ── Player ───────────────────────────────────────────────────
export interface PlayerState {
  bookId: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  currentSentenceIndex: number;
  currentWordIndex: number; // index of word currently being spoken
  currentPageIndex: number;
  speed: number;
}

// ── Color Theme & Neon Palettes ──────────────────────────────
export interface ThemeColorPalette {
  id: string;
  name: string;
  accent: string;           // primary button / highlight
  accentSecondary: string;  // gradients
  accentGlow: string;       // neon blur
  neonBorder: string;       // modal borders
}

// ── Language Pack ────────────────────────────────────────────
export interface LanguagePack {
  code: string;
  name: string;
  flag: string;
  sizeMB: number;
  isDownloaded: boolean;
  isDownloading?: boolean;
}

// ── Settings ─────────────────────────────────────────────────
export interface AppSettings {
  theme: Theme;
  colorPalette: ThemeColorPalette;
  fontSize: number;           // px 14–36
  fontFamily: string;
  lineHeight: number;
  textAlign: 'left' | 'justify';
  readerPadding: 'compact' | 'normal' | 'spacious';
  brightness: number;         // 0–1 (Night Screen overlay)
  backgroundImage: string | null;
  backgroundOpacity: number;  // 0–1
  cloudProvider: CloudProvider;
  apiKeys: Record<CloudProvider, string>;
  language: string;           // 'es' | 'en' | 'fr' | 'de' | 'it' | 'pt'
  sleepTimerMinutes: number;
  libraryViewMode: LibraryViewMode;
  keepScreenAwake: boolean;
  announceCharacterDialogue: boolean;
  useOnlineHDVoice: boolean;
}
