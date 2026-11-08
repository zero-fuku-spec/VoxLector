// ============================================================
// VoxLector AI — Settings Store (Zustand + persistence)
// Includes custom neon color customizer, library view modes,
// layout preferences, and language package manager
// ============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppSettings, Theme, CloudProvider, LibraryViewMode, ThemeColorPalette, LanguagePack } from '@/types';
import { storageService } from '@/services/storageService';

export const THEME_PALETTES: ThemeColorPalette[] = [
  {
    id: 'cyber_neon',
    name: 'Cyber Neon (Púrpura / Rosa)',
    accent: '#7c5cff',
    accentSecondary: '#ff6b9d',
    accentGlow: 'rgba(124, 92, 255, 0.4)',
    neonBorder: 'rgba(124, 92, 255, 0.8)',
  },
  {
    id: 'emerald',
    name: 'Esmeralda Vital (Verde / Turquesa)',
    accent: '#10b981',
    accentSecondary: '#06b6d4',
    accentGlow: 'rgba(16, 185, 129, 0.4)',
    neonBorder: 'rgba(16, 185, 129, 0.8)',
  },
  {
    id: 'electric_blue',
    name: 'Azul Eléctrico (Cian / Azul)',
    accent: '#0284c7',
    accentSecondary: '#6366f1',
    accentGlow: 'rgba(2, 132, 199, 0.4)',
    neonBorder: 'rgba(2, 132, 199, 0.8)',
  },
  {
    id: 'amber_gold',
    name: 'Ámbar Imperial (Oro / Naranja)',
    accent: '#f59e0b',
    accentSecondary: '#ea580c',
    accentGlow: 'rgba(245, 158, 11, 0.4)',
    neonBorder: 'rgba(245, 158, 11, 0.8)',
  },
  {
    id: 'crimson',
    name: 'Carmesí Samurai (Rojo / Rubí)',
    accent: '#ef4444',
    accentSecondary: '#ec4899',
    accentGlow: 'rgba(239, 68, 68, 0.4)',
    neonBorder: 'rgba(239, 68, 68, 0.8)',
  },
];

export const AVAILABLE_LANGUAGES: LanguagePack[] = [
  { code: 'es', name: 'Español', flag: '🇪🇸', sizeMB: 0, isDownloaded: true },
  { code: 'en', name: 'English (US/UK)', flag: '🇺🇸', sizeMB: 35, isDownloaded: false },
  { code: 'fr', name: 'Français', flag: '🇫🇷', sizeMB: 40, isDownloaded: false },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', sizeMB: 42, isDownloaded: false },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', sizeMB: 38, isDownloaded: false },
  { code: 'pt', name: 'Português', flag: '🇧🇷', sizeMB: 36, isDownloaded: false },
  { code: 'ja', name: '日本語 (Japonés)', flag: '🇯🇵', sizeMB: 55, isDownloaded: false },
];

const DEFAULTS: AppSettings = {
  theme: 'dark',
  colorPalette: THEME_PALETTES[0],
  fontSize: 18,
  fontFamily: 'Inter',
  lineHeight: 1.85,
  textAlign: 'left',
  readerPadding: 'normal',
  brightness: 1.0,
  backgroundImage: null,
  backgroundOpacity: 0.15,
  cloudProvider: 'none',
  apiKeys: { none: '', openai: '', elevenlabs: '', google: '', huggingface: '' },
  language: 'es',
  sleepTimerMinutes: 0,
  libraryViewMode: 'grid_large',
  keepScreenAwake: true,
  announceCharacterDialogue: false,
  useOnlineHDVoice: true,
};

interface SettingsStore extends AppSettings {
  isLoaded: boolean;
  languagePacks: LanguagePack[];
  load: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setColorPalette: (palette: ThemeColorPalette) => void;
  setCustomColors: (accent: string, secondary: string) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setLineHeight: (lh: number) => void;
  setTextAlign: (align: 'left' | 'justify') => void;
  setReaderPadding: (pad: 'compact' | 'normal' | 'spacious') => void;
  setBrightness: (value: number) => void;
  setBackgroundImage: (img: string | null) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setCloudProvider: (provider: CloudProvider) => void;
  setApiKey: (provider: CloudProvider, key: string) => void;
  setLanguage: (lang: string) => void;
  downloadLanguagePack: (code: string) => Promise<void>;
  setSleepTimer: (minutes: number) => void;
  setLibraryViewMode: (mode: LibraryViewMode) => void;
  setKeepScreenAwake: (val: boolean) => void;
  setAnnounceCharacterDialogue: (enabled: boolean) => void;
  setUseOnlineHDVoice: (enabled: boolean) => void;
  reset: () => void;
}

function applyPaletteToCSS(palette: ThemeColorPalette) {
  const root = document.documentElement;
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-secondary', palette.accentSecondary);
  root.style.setProperty('--accent-glow', palette.accentGlow);
  root.style.setProperty('--neon-border', palette.neonBorder);
}

// Problema 3: factor de escala de la interfaz general derivado del tamaño de fuente
// elegido por el usuario. Se acota (0.85 – 1.35) para que el layout siga siendo usable.
export function computeUiFontScale(fontSize: number): number {
  const scale = 1 + (fontSize - DEFAULTS.fontSize) * 0.03;
  return Math.min(1.35, Math.max(0.85, scale));
}

// Problema 3: publica el tamaño base y el factor de escala en el elemento raíz para que
// las clases Tailwind basadas en rem escalen toda la interfaz en tiempo real.
function applyFontScaleToCSS(fontSize: number) {
  const root = document.documentElement;
  root.style.setProperty('--app-base-font-size', `${fontSize}px`);
  root.style.setProperty('--app-ui-scale', String(computeUiFontScale(fontSize)));
}

async function persist(partial: Partial<AppSettings>): Promise<void> {
  for (const [key, value] of Object.entries(partial)) {
    await storageService.set(`settings_${key}`, value);
  }
}

export const useSettingsStore = create<SettingsStore>()(
  subscribeWithSelector((set, get) => ({
    ...DEFAULTS,
    isLoaded: false,
    languagePacks: AVAILABLE_LANGUAGES,

    load: async () => {
      const theme = await storageService.get<Theme>('settings_theme', DEFAULTS.theme);
      const palette = await storageService.get<ThemeColorPalette>('settings_colorPalette', DEFAULTS.colorPalette);
      const fontSize = await storageService.get<number>('settings_fontSize', DEFAULTS.fontSize);
      const fontFamily = await storageService.get<string>('settings_fontFamily', DEFAULTS.fontFamily);
      const lineHeight = await storageService.get<number>('settings_lineHeight', DEFAULTS.lineHeight);
      const textAlign = await storageService.get<'left' | 'justify'>('settings_textAlign', DEFAULTS.textAlign);
      const readerPadding = await storageService.get<'compact' | 'normal' | 'spacious'>('settings_readerPadding', DEFAULTS.readerPadding);
      const brightness = await storageService.get<number>('settings_brightness', DEFAULTS.brightness);
      const backgroundImage = await storageService.get<string | null>('settings_backgroundImage', null);
      const backgroundOpacity = await storageService.get<number>('settings_backgroundOpacity', DEFAULTS.backgroundOpacity);
      const cloudProvider = await storageService.get<CloudProvider>('settings_cloudProvider', DEFAULTS.cloudProvider);
      const language = await storageService.get<string>('settings_language', DEFAULTS.language);
      const libraryViewMode = await storageService.get<LibraryViewMode>('settings_libraryViewMode', DEFAULTS.libraryViewMode);
      const keepScreenAwake = await storageService.get<boolean>('settings_keepScreenAwake', DEFAULTS.keepScreenAwake);
      const announceCharacterDialogue = await storageService.get<boolean>(
        'settings_announceCharacterDialogue',
        DEFAULTS.announceCharacterDialogue,
      );
      const useOnlineHDVoice = await storageService.get<boolean>(
        'settings_useOnlineHDVoice',
        DEFAULTS.useOnlineHDVoice,
      );

      const openai = await storageService.getApiKey('openai');
      const elevenlabs = await storageService.getApiKey('elevenlabs');
      const google = await storageService.getApiKey('google');
      const huggingface = await storageService.getApiKey('huggingface');

      set({
        theme,
        colorPalette: palette,
        fontSize,
        fontFamily,
        lineHeight,
        textAlign,
        readerPadding,
        brightness,
        backgroundImage,
        backgroundOpacity,
        cloudProvider,
        language,
        libraryViewMode,
        keepScreenAwake,
        announceCharacterDialogue,
        useOnlineHDVoice,
        apiKeys: { none: '', openai, elevenlabs, google, huggingface },
        isLoaded: true,
      });

      document.documentElement.setAttribute('data-theme', theme);
      // Problema 3: al restaurar los ajustes se reaplica la escala global de fuente.
      applyFontScaleToCSS(fontSize);
      applyPaletteToCSS(palette);
    },

    setTheme: (theme) => {
      set({ theme });
      document.documentElement.setAttribute('data-theme', theme);
      void persist({ theme });
    },

    setColorPalette: (colorPalette) => {
      set({ colorPalette });
      applyPaletteToCSS(colorPalette);
      void persist({ colorPalette });
    },

    setCustomColors: (accent, accentSecondary) => {
      const custom: ThemeColorPalette = {
        id: 'custom',
        name: 'Personalizado',
        accent,
        accentSecondary,
        accentGlow: `${accent}66`,
        neonBorder: accent,
      };
      set({ colorPalette: custom });
      applyPaletteToCSS(custom);
      void persist({ colorPalette: custom });
    },

    setFontSize: (fontSize) => {
      set({ fontSize });
      // Problema 3: el tamaño de fuente se aplica en tiempo real a toda la interfaz
      // (variable CSS raíz) y al visor PDF (factor de escala), no solo al modo texto.
      applyFontScaleToCSS(fontSize);
      void persist({ fontSize });
    },

    setFontFamily: (fontFamily) => {
      set({ fontFamily });
      void persist({ fontFamily });
    },

    setLineHeight: (lineHeight) => {
      set({ lineHeight });
      void persist({ lineHeight });
    },

    setTextAlign: (textAlign) => {
      set({ textAlign });
      void persist({ textAlign });
    },

    setReaderPadding: (readerPadding) => {
      set({ readerPadding });
      void persist({ readerPadding });
    },

    setBrightness: (brightness) => {
      set({ brightness });
      void persist({ brightness });
      // Problema 2: se elimina la importación nativa '@capacitor-community/screen-brightness',
      // que no está instalada y provocaba el error TS2307 además de ocultar el fallo en un catch.
      // El efecto Night Screen se aplica íntegramente mediante el overlay CSS global.
    },

    setBackgroundImage: (backgroundImage) => {
      set({ backgroundImage });
      void persist({ backgroundImage });
    },

    setBackgroundOpacity: (backgroundOpacity) => {
      set({ backgroundOpacity });
      void persist({ backgroundOpacity });
    },

    setCloudProvider: (cloudProvider) => {
      set({ cloudProvider });
      void persist({ cloudProvider });
    },

    setApiKey: async (provider, key) => {
      await storageService.setApiKey(provider, key);
      set(state => ({
        apiKeys: { ...state.apiKeys, [provider]: key },
      }));
    },

    setLanguage: (language) => {
      set({ language });
      void persist({ language });
    },

    downloadLanguagePack: async (code: string) => {
      // Set downloading status
      set(state => ({
        languagePacks: state.languagePacks.map(p =>
          p.code === code ? { ...p, isDownloading: true } : p
        ),
      }));

      // Simulate asynchronous download of language data
      await new Promise(r => setTimeout(r, 1800));

      set(state => ({
        languagePacks: state.languagePacks.map(p =>
          p.code === code ? { ...p, isDownloaded: true, isDownloading: false } : p
        ),
        language: code,
      }));
      void persist({ language: code });
    },

    setSleepTimer: (sleepTimerMinutes) => {
      set({ sleepTimerMinutes });
      void persist({ sleepTimerMinutes });
    },

    setLibraryViewMode: (libraryViewMode) => {
      set({ libraryViewMode });
      void persist({ libraryViewMode });
    },

    setKeepScreenAwake: (keepScreenAwake) => {
      set({ keepScreenAwake });
      void persist({ keepScreenAwake });
    },

    setAnnounceCharacterDialogue: (announceCharacterDialogue) => {
      set({ announceCharacterDialogue });
      void persist({ announceCharacterDialogue });
    },

    setUseOnlineHDVoice: (useOnlineHDVoice) => {
      set({ useOnlineHDVoice });
      void persist({ useOnlineHDVoice });
    },

    reset: () => {
      set({ ...DEFAULTS, languagePacks: AVAILABLE_LANGUAGES });
      // Problema 3: al restablecer los ajustes se reinicia también la escala global
      // de fuente, para que la interfaz vuelva al tamaño base.
      applyFontScaleToCSS(DEFAULTS.fontSize);
      void storageService.clear();
    },
  }))
);
