// ============================================================
// VoxLector AI — Native & Offline TTS Service
// Uses @capacitor-community/text-to-speech for 100% offline device TTS on Android
// Supports online/offline voice filtering, language & country selection,
// acoustic EQ modulation, and word-by-word karaoke tracking
// ============================================================

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { TextToSpeech, type SpeechSynthesisVoice as CapVoice } from '@capacitor-community/text-to-speech';
import { Network } from '@capacitor/network';
import type { VoicePreset, SavedVoiceProfile, SpectralMesh, CloudProvider } from '@/types';
import { audioEngine, calculateAcousticModulation } from './audioEngine';
import { startBackgroundPlayback, stopBackgroundPlayback } from './backgroundPlayback';
import { stopNativeAudioSynthesis, synthesizeNativeAudio } from './nativeAudioSynthesis';
import { useSettingsStore } from '@/stores/settingsStore';
import { buildPunctuationSsml } from './ssmlBuilder';
import { ProsodyEngine } from './ProsodyEngine'
import { dbService } from './dbService'

interface NativeTtsSettingsPlugin {
  openSettings(): Promise<void>;
}

const NativeTtsSettings = registerPlugin<NativeTtsSettingsPlugin>('NativeTtsSettings');

export interface AppVoice extends CapVoice {
  engine: 'native' | 'web';
  index: number;
  countryName: string;
  countryCode: string;
  flag: string;
  langName: string;
  isOnlineOnly: boolean;
}

let isCancelled = false;
let currentNativeListener: PluginListenerHandle | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentCloudSource: AudioBufferSourceNode | null = null;
let currentNativeAudioSource: AudioBufferSourceNode | null = null;
let nativePreloadRequest: { text: string; preset: VoicePreset } | null = null;
let preparedNativeAudio: { key: string; promise: Promise<AudioBuffer> } | null = null;
let cachedVoices: AppVoice[] | null = null;
const systemVoiceListeners = new Set<(voices: AppVoice[]) => void>();
let webVoicesChangedHandler: (() => void) | null = null;
let pendingStopPromise: Promise<void> | null = null;
let stopGeneration = 0;
let deviceOnline = !Capacitor.isNativePlatform() && typeof navigator !== 'undefined' && navigator.onLine;
const networkStatusListeners = new Set<(online: boolean) => void>();
const appliedVoiceProfiles = new Map<string, VoicePreset>()
const speechCancelListeners = new Set<() => void>()

function notifySpeechCancelled(): void {
  for (const listener of [...speechCancelListeners]) {
    try { listener() } catch (error) {
      console.warn('[VoxLector TTS] Falló la limpieza de una instrucción cancelada:', error)
    }
  }
}
let networkMonitoringStarted = false;

export interface VoicePreviewSnapshot {
  voiceURI: string
  spectralMesh: SpectralMesh
  pitch: number
  rate: number
  volume: number
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function applyProfileImmediately(
  profile: SavedVoiceProfile,
  previewSnapshot?: VoicePreviewSnapshot,
): void {
  const verification = previewSnapshot ?? {
    voiceURI: profile.voiceURI,
    spectralMesh: profile.spectralMesh,
    pitch: profile.pitch,
    rate: profile.rate,
    volume: profile.volume,
  }
  const meshEqual = JSON.stringify(verification.spectralMesh) === JSON.stringify(profile.spectralMesh)
  console.log('[TTS MATCH VERIFY]', {
    testingURI: verification.voiceURI,
    savedURI: profile.voiceURI,
    meshEqual,
  })
  if (
    verification.voiceURI !== profile.voiceURI ||
    !meshEqual ||
    verification.pitch !== profile.pitch ||
    verification.rate !== profile.rate ||
    verification.volume !== profile.volume
  ) {
    const error = new Error(`El perfil "${profile.name}" no coincide con los parámetros de la vista previa.`)
    console.error('[VoxLector] [TTS MATCH VERIFY] Error de integridad del perfil:', error)
    throw error
  }

  const voicePreset = deepClone(profile)
  voicePreset.baseVoiceURI = profile.voiceURI
  appliedVoiceProfiles.set(profile.id, voicePreset)
  audioEngine.buildEQChain(voicePreset.eqNodes, voicePreset.formant)
  audioEngine.setVoiceEffects(voicePreset)
  audioEngine.setOutputGain(voicePreset.volume)
}

export function updateActiveSpeechPreview(
  preset: VoicePreset,
  pitchModifier: number,
  rateModifier: number,
  basePitch: number,
  baseRate: number,
): void {
  const acoustic = calculateAcousticModulation(preset)
  if (currentUtterance) {
    currentUtterance.pitch = Math.max(0.1, Math.min(2, pitchModifier))
    currentUtterance.rate = Math.max(0.1, Math.min(3, rateModifier))
    currentUtterance.volume = Math.max(0, Math.min(1, acoustic.volumeModifier))
  }
  audioEngine.updateEQNodes(preset.eqNodes, preset.formant)
  audioEngine.setVoiceEffects(preset)
  audioEngine.setOutputGain(acoustic.volumeModifier)
  audioEngine.updateActivePlaybackRate(pitchModifier, rateModifier, basePitch, baseRate)
}

function getProfileMesh(preset: VoicePreset): SpectralMesh {
  const gains = Array.from({ length: 17 }, (_, id) =>
    preset.eqNodes.find(node => node.id === id)?.gain ?? 0,
  )
  if (gains.some(gain => !Number.isFinite(gain))) {
    throw new Error(`La malla espectral del perfil "${preset.name}" contiene valores no válidos.`)
  }
  return gains as SpectralMesh
}

function verifyAppliedProfile(preset: VoicePreset): VoicePreset {
  const savedProfile = appliedVoiceProfiles.get(preset.id)
  if (!savedProfile) {
    if (preset.id === 'preview_temp') return preset
    const error = new Error(`El perfil TTS "${preset.name}" no se cargó desde el almacenamiento persistente.`)
    console.error('[VoxLector] [TTS MATCH VERIFY] No se permite usar valores predeterminados:', error)
    throw error
  }
  const testingURI = preset.voiceURI ?? preset.baseVoiceURI
  const savedURI = savedProfile.voiceURI ?? savedProfile.baseVoiceURI
  const meshEqual = JSON.stringify(getProfileMesh(preset)) === JSON.stringify(getProfileMesh(savedProfile))
  console.log('[TTS MATCH VERIFY]', { testingURI, savedURI, meshEqual })
  if (
    testingURI !== savedURI ||
    !meshEqual ||
    preset.pitch !== savedProfile.pitch ||
    preset.volume !== savedProfile.volume
  ) {
    const error = new Error(`El perfil TTS "${preset.name}" no coincide con su configuración guardada.`)
    console.error('[VoxLector] [TTS MATCH VERIFY] Error explícito de integridad:', error)
    throw error
  }
  return {
    ...preset,
    voiceURI: savedURI,
    baseVoiceURI: savedURI,
    eqNodes: savedProfile.eqNodes.map(node => ({ ...node })),
    lang: savedProfile.lang,
  }
}

async function loadPersistedVoiceProfile(preset: VoicePreset): Promise<VoicePreset> {
  if (preset.id === 'preview_temp') return preset
  const saved = await dbService.loadVoiceProfile(preset.id)
  if (!saved) {
    throw new Error(`El perfil "${preset.name}" no existe en IndexedDB; se cancela la síntesis.`)
  }
  // A caller may supply a transient playback speed. Voice parameters and EQ
  // always come from IndexedDB, so editor-local state cannot override them.
  const playbackRateMultiplier = Number.isFinite(preset.rate / saved.rate)
    ? preset.rate / saved.rate
    : 1
  const playbackPitchMultiplier = Number.isFinite(preset.pitch / saved.pitch)
    ? preset.pitch / saved.pitch
    : 1
  // TTS prosody: retain transient action pitch/rate without allowing a voice preview to replace saved EQ.
  const loadedProfile: VoicePreset = {
    ...saved,
    voiceURI: saved.voiceURI ?? saved.baseVoiceURI,
    baseVoiceURI: saved.voiceURI ?? saved.baseVoiceURI,
    eqNodes: saved.eqNodes.map(node => ({ ...node })),
    rate: saved.rate * playbackRateMultiplier,
    pitch: saved.pitch * playbackPitchMultiplier,
  }
  appliedVoiceProfiles.set(saved.id, deepClone(loadedProfile))
  audioEngine.buildEQChain(loadedProfile.eqNodes, loadedProfile.formant)
  audioEngine.setVoiceEffects(loadedProfile)
  audioEngine.setOutputGain(loadedProfile.volume)
  return loadedProfile
}

// ── Country & Language Detection Utility ───────────────────────
const COUNTRY_FLAGS: Record<string, { flag: string; name: string }> = {
  ES: { flag: '🇪🇸', name: 'España' },
  MX: { flag: '🇲🇽', name: 'México' },
  AR: { flag: '🇦🇷', name: 'Argentina' },
  CO: { flag: '🇨🇴', name: 'Colombia' },
  CL: { flag: '🇨🇱', name: 'Chile' },
  PE: { flag: '🇵🇪', name: 'Perú' },
  VE: { flag: '🇻🇪', name: 'Venezuela' },
  EC: { flag: '🇪🇨', name: 'Ecuador' },
  GT: { flag: '🇬🇹', name: 'Guatemala' },
  CU: { flag: '🇨🇺', name: 'Cuba' },
  BO: { flag: '🇧🇴', name: 'Bolivia' },
  DO: { flag: '🇩🇴', name: 'Rep. Dominicana' },
  HN: { flag: '🇭🇳', name: 'Honduras' },
  PY: { flag: '🇵🇾', name: 'Paraguay' },
  SV: { flag: '🇸🇻', name: 'El Salvador' },
  NI: { flag: '🇳🇮', name: 'Nicaragua' },
  CR: { flag: '🇨🇷', name: 'Costa Rica' },
  PA: { flag: '🇵🇦', name: 'Panamá' },
  UY: { flag: '🇺🇾', name: 'Uruguay' },
  PR: { flag: '🇵🇷', name: 'Puerto Rico' },
  US: { flag: '🇺🇸', name: 'Estados Unidos' },
  GB: { flag: '🇬🇧', name: 'Reino Unido' },
  FR: { flag: '🇫🇷', name: 'Francia' },
  DE: { flag: '🇩🇪', name: 'Alemania' },
  IT: { flag: '🇮🇹', name: 'Italia' },
  BR: { flag: '🇧🇷', name: 'Brasil' },
  PT: { flag: '🇵🇹', name: 'Portugal' },
  RU: { flag: '🇷🇺', name: 'Rusia' },
  CN: { flag: '🇨🇳', name: 'China' },
  JP: { flag: '🇯🇵', name: 'Japón' },
  KR: { flag: '🇰🇷', name: 'Corea del Sur' },
  IN: { flag: '🇮🇳', name: 'India' },
  CA: { flag: '🇨🇦', name: 'Canadá' },
  AU: { flag: '🇦🇺', name: 'Australia' },
};

const LANG_NAMES: Record<string, string> = {
  es: 'Español',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ru: 'Русский',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
  hi: 'हिन्दी',
};

export function parseVoiceLocale(langTag: string): {
  langCode: string;
  countryCode: string;
  flag: string;
  langName: string;
  countryName: string;
} {
  const parts = langTag.replace('_', '-').split('-');
  const langCode = (parts[0] || 'es').toLowerCase();
  const countryCode = (parts[1] || '').toUpperCase();

  const countryInfo = COUNTRY_FLAGS[countryCode];
  let countryName = countryInfo?.name || '';
  const flag = countryInfo?.flag || '🌐';

  if (!countryName && countryCode) {
    try {
      const regionNames = new Intl.DisplayNames(['es'], { type: 'region' });
      countryName = regionNames.of(countryCode) || countryCode;
    } catch {
      countryName = countryCode;
    }
  }

  let langName = LANG_NAMES[langCode];
  if (!langName) {
    try {
      const languageNames = new Intl.DisplayNames(['es'], { type: 'language' });
      langName = languageNames.of(langCode) || langCode.toUpperCase();
    } catch {
      langName = langCode.toUpperCase();
    }
  }

  return {
    langCode,
    countryCode,
    flag,
    langName,
    countryName: countryName || 'Internacional',
  };
}

function updateNetworkStatus(online: boolean): void {
  if (deviceOnline === online) return;
  deviceOnline = online;
  for (const listener of networkStatusListeners) listener(online);
}

function startNetworkMonitoring(): void {
  if (networkMonitoringStarted) return;
  networkMonitoringStarted = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => updateNetworkStatus(true));
    window.addEventListener('offline', () => updateNetworkStatus(false));
  }
  void Network.getStatus()
    .then(status => updateNetworkStatus(status.connected))
    .catch(error => console.warn('[VoxLector TTS] No se pudo consultar el estado de red:', error));
  void Network.addListener('networkStatusChange', status => {
    updateNetworkStatus(status.connected);
  }).catch(error => console.warn('[VoxLector TTS] No se pudo observar el estado de red:', error));
}

startNetworkMonitoring();

export function isDeviceOnline(): boolean {
  return deviceOnline;
}

export function subscribeNetworkStatus(listener: (online: boolean) => void): () => void {
  networkStatusListeners.add(listener);
  listener(deviceOnline);
  return () => networkStatusListeners.delete(listener);
}

// ── Native Voice Discovery with Offline Detection ────────────
export async function getSystemVoices(forceRefresh = false): Promise<AppVoice[]> {
  if (cachedVoices && !forceRefresh) {
    return cachedVoices;
  }

  observeWebVoiceChanges();
  const nativeVoicesPromise = Capacitor.isNativePlatform()
    ? loadNativeSystemVoices()
    : Promise.resolve<AppVoice[]>([]);
  const webVoicesPromise = loadWebSystemVoices();
  const [nativeVoices, webVoices] = await Promise.all([nativeVoicesPromise, webVoicesPromise]);
  cachedVoices = mergeSystemVoices(cachedVoices ?? [], nativeVoices, webVoices);
  notifySystemVoiceListeners();
  return cachedVoices;
}

// Problema Microsoft: algunos navegadores publican sus voces online después del primer catálogo.
function mergeSystemVoices(...groups: AppVoice[][]): AppVoice[] {
  const uniqueVoices = new Map<string, AppVoice>();
  for (const voice of groups.flat()) {
    uniqueVoices.set(`${voice.engine}\u0000${voice.voiceURI}`, voice);
  }
  return Array.from(uniqueVoices.values());
}

function mapWebVoice(voice: SpeechSynthesisVoice, index: number): AppVoice {
  const meta = parseVoiceLocale(voice.lang);
  return {
    default: voice.default,
    lang: voice.lang,
    localService: voice.localService ?? true,
    name: voice.name,
    voiceURI: voice.voiceURI,
    engine: 'web',
    index,
    countryName: meta.countryName,
    countryCode: meta.countryCode,
    flag: meta.flag,
    langName: meta.langName,
    isOnlineOnly: voice.localService === false,
  };
}

function notifySystemVoiceListeners(): void {
  if (!cachedVoices) return;
  for (const listener of systemVoiceListeners) listener(cachedVoices);
}

function observeWebVoiceChanges(): void {
  if (typeof speechSynthesis === 'undefined' || webVoicesChangedHandler) return;
  webVoicesChangedHandler = () => {
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) return;
    const webVoices = voices.map(mapWebVoice);
    cachedVoices = mergeSystemVoices(cachedVoices ?? [], webVoices);
    notifySystemVoiceListeners();
  };
  speechSynthesis.addEventListener('voiceschanged', webVoicesChangedHandler);
  webVoicesChangedHandler();
}

export function subscribeSystemVoices(listener: (voices: AppVoice[]) => void): () => void {
  systemVoiceListeners.add(listener);
  if (cachedVoices) listener(cachedVoices);
  observeWebVoiceChanges();
  return () => systemVoiceListeners.delete(listener);
}

async function loadNativeSystemVoices(): Promise<AppVoice[]> {
  let rawVoices: CapVoice[] = [];
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const result = await TextToSpeech.getSupportedVoices();
      if (result?.voices?.length) {
        rawVoices = result.voices;
        break;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (rawVoices.length === 0 && lastError) {
    console.warn('[VoxLector TTS] No se pudieron cargar voces del motor nativo:', lastError);
  }

  return rawVoices.map((voice, index) => {
    const meta = parseVoiceLocale(voice.lang);
    return {
      ...voice,
      engine: 'native',
      index,
      countryName: meta.countryName,
      countryCode: meta.countryCode,
      flag: meta.flag,
      langName: meta.langName,
      isOnlineOnly: voice.localService === false,
    };
  });
}

async function loadWebSystemVoices(): Promise<AppVoice[]> {
  if (typeof speechSynthesis === 'undefined') return [];

  return new Promise(resolve => {
    let settled = false;
    const loadStartedAt = Date.now();
    let firstVoicesAt = 0;
    let stableSince = 0;
    let lastVoiceSignature = '';
    const interval = setInterval(checkVoices, 200);
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      speechSynthesis.removeEventListener('voiceschanged', checkVoices);
      resolve(voices.map(mapWebVoice));
    };
    function checkVoices(): void {
      const voices = speechSynthesis.getVoices();
      const now = Date.now();
      if (voices.length > 0) {
        firstVoicesAt ||= now;
        const signature = voices.map(voice => `${voice.voiceURI}\u0000${voice.lang}\u0000${voice.name}`).join('\u0001');
        if (signature !== lastVoiceSignature) {
          lastVoiceSignature = signature;
          stableSince = now;
        }
        if (now - stableSince >= 500 || now - firstVoicesAt >= 2500) {
          finish(voices);
        }
      } else if (now - (firstVoicesAt || loadStartedAt) >= 3000) {
        finish([]);
      }
    }

    timeout = setTimeout(() => finish(speechSynthesis.getVoices()), 3000);
    speechSynthesis.addEventListener('voiceschanged', checkVoices);
    checkVoices();
  });
}

// ── Android System TTS Settings Launcher ───────────────────────
export async function openTtsInstall(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    try {
      await NativeTtsSettings.openSettings();
      return;
    } catch (error) {
      console.warn('[VoxLector TTS] Could not open Android TTS settings:', error);
      try {
        await TextToSpeech.openInstall();
        return;
      } catch (fallbackError) {
        console.warn('[VoxLector TTS] Could not open Android TTS installation:', fallbackError);
      }
    }
  }
  if (typeof window !== 'undefined') {
    window.alert('Los ajustes de voz del sistema solo están disponibles en Android.');
  }
}

// ── Emotion Modulation Rules ─────────────────────────────────
// Problema de volumen: las emociones solo modulan tono y ritmo, no el nivel de salida.
function getEmotionAdjustment(emotion?: string): { pitchMult: number; rateMult: number } {
  if (!emotion) return { pitchMult: 1.0, rateMult: 1.0 };
  switch (emotion.toLowerCase()) {
    case 'riendo':
      return { pitchMult: 1.28, rateMult: 1.12 };
    case 'sollozando':
      return { pitchMult: 0.78, rateMult: 0.86 };
    case 'tartamudeando':
      return { pitchMult: 1.02, rateMult: 0.88 };
    case 'nervioso':
      return { pitchMult: 1.08, rateMult: 1.14 };
    case 'sorpresa':
      return { pitchMult: 1.16, rateMult: 1.1 };
    case 'miedo':
      return { pitchMult: 1.16, rateMult: 1.08 };
    case 'jadeando':
      return { pitchMult: 1.08, rateMult: 0.88 };
    case 'resoplando':
      return { pitchMult: 0.96, rateMult: 0.9 };
    case 'suspiro':
      return { pitchMult: 0.9, rateMult: 0.78 };
    case 'triste':
      return { pitchMult: 0.82, rateMult: 0.85 };
    case 'alegre':
      return { pitchMult: 1.25, rateMult: 1.15 };
    case 'enojado':
      return { pitchMult: 1.30, rateMult: 1.20 };
    case 'susurro':
      return { pitchMult: 0.88, rateMult: 0.80 };
    case 'épico':
      return { pitchMult: 0.80, rateMult: 0.90 };
    case 'misterioso':
      return { pitchMult: 0.75, rateMult: 0.85 };
    case 'dolor':
      return { pitchMult: 0.78, rateMult: 0.82 };
    default:
      return { pitchMult: 1.0, rateMult: 1.0 };
  }
}

// ── Main Speak Function ──────────────────────────────────────
export async function speakText(
  text: string,
  preset: VoicePreset,
  cloudProvider: CloudProvider,
  apiKey: string,
  emotion?: string,
  onWordBoundary?: (wordIndex: number, charIndex: number) => void,
  onEnd?: () => void,
  onError?: (err: string) => void,
  keepBackgroundSession = false,
  onCancel?: () => void,
): Promise<void> {
  const prosody = new ProsodyEngine().analyze(text, emotion)
  const suppressFinalPeriod = /(?<!\.)\.(?=[”»"')\]]*\s*$)/u.test(prosody.text)
  const clean = suppressFinalPeriod
    ? prosody.text.replace(/(?<!\.)\.(?=[”»"')\]]*\s*$)/u, '')
    : prosody.text
  emotion = prosody.emotion
  if (!clean || !/[\p{L}\p{N}]/u.test(clean)) {
    onEnd?.();
    return;
  }

  const requestGeneration = stopGeneration;
  if (pendingStopPromise) {
    await pendingStopPromise;
    pendingStopPromise = null;
  }
  if (requestGeneration !== stopGeneration) {
    onCancel?.()
    return
  }
  isCancelled = false;
  const speechGeneration = stopGeneration;
  let settled = false
  let removeCancelListener: () => void = () => {}
  const complete = (callback?: () => void) => {
    if (settled) return
    settled = true
    removeCancelListener()
    callback?.()
  }
  const handleEnd = () => {
    if (suppressFinalPeriod) {
      void waitForSpeechPause(280).then(() => complete(onEnd))
      return
    }
    complete(onEnd)
  }
  const handleError = (error: string) => complete(() => onError?.(error))
  const handleCancel = () => complete(onCancel)
  const cancelListener = () => handleCancel()
  speechCancelListeners.add(cancelListener)
  removeCancelListener = () => { speechCancelListeners.delete(cancelListener) }

  let voiceProfile: VoicePreset
  try {
    voiceProfile = await loadPersistedVoiceProfile(preset)
  } catch (error) {
    handleError(error instanceof Error ? error.message : String(error))
    return
  }
  if (isSpeechCancelled(speechGeneration)) {
    handleCancel()
    return
  }
  const onlineHDEnabled = useSettingsStore.getState().useOnlineHDVoice
  const canUseCloudTts = onlineHDEnabled &&
    ['openai', 'elevenlabs', 'google'].includes(cloudProvider) &&
    Boolean(apiKey) &&
    isDeviceOnline()
  const selectedVoiceUsesSystemOnline = canUseCloudTts &&
    (await getSystemVoices()).some(
      voice =>
        voice.voiceURI === (voiceProfile.voiceURI ?? voiceProfile.baseVoiceURI) &&
        (!voiceProfile.voiceEngine || voice.engine === voiceProfile.voiceEngine) &&
        voice.isOnlineOnly,
    )
  if (isSpeechCancelled(speechGeneration)) {
    handleCancel()
    return
  }
  const useCloudTts = canUseCloudTts && !selectedVoiceUsesSystemOnline
  if (Capacitor.getPlatform() === 'android') {
    try {
      await startBackgroundPlayback(voiceProfile.name || 'VoxLector')
    } catch (error) {
      console.warn('[VoxLector] Background notification/service unavailable; continuing TTS:', error)
    }
  }
  if (isSpeechCancelled(speechGeneration)) {
    handleCancel()
    return
  }
  if (!Capacitor.isNativePlatform() || useCloudTts || Capacitor.getPlatform() === 'android') {
    try {
      await audioEngine.unlock()
    } catch (error) {
      handleError(error instanceof Error ? error.message : String(error))
      return
    }
  }
  if (isSpeechCancelled(speechGeneration)) {
    handleCancel()
    return
  }

  const modulatedPreset = modulateVoicePreset(voiceProfile, emotion)
  // Problema de volumen: la prosodia no altera el volumen configurado del narrador.
  const prosodyPreset = /[¡!]/u.test(clean)
    ? {
        ...modulatedPreset,
        pitch: Math.min(2.5, modulatedPreset.pitch * 1.04),
        rate: Math.min(3, modulatedPreset.rate * 1.05),
      }
    : modulatedPreset

  try {
    const selectedSystemVoice = await resolveSystemVoice(prosodyPreset)
    const routedPreset = {
      ...prosodyPreset,
      voiceEngine: selectedSystemVoice?.engine ?? (Capacitor.isNativePlatform() ? 'native' : 'web'),
    }
    if (useCloudTts) {
      await speakCloud(clean, routedPreset, cloudProvider, apiKey, emotion, onWordBoundary, handleEnd, handleError, keepBackgroundSession, speechGeneration);
    } else if (routedPreset.voiceEngine === 'web') {
      await speakWebSpeech(clean, routedPreset, onWordBoundary, handleEnd, handleError, speechGeneration);
    } else {
      await speakNativeTTS(clean, routedPreset, onWordBoundary, handleEnd, handleError, keepBackgroundSession, speechGeneration);
    }
  } catch (error) {
    if (isSpeechCancelled(speechGeneration)) handleCancel()
    else handleError(error instanceof Error ? error.message : String(error))
  }
}

function modulateVoicePreset(preset: VoicePreset, emotion?: string): VoicePreset {
  // The Voice Studio displays these effective values. Apply the same
  // deterministic transform to every preview and persisted-profile playback.
  const acoustic = calculateAcousticModulation(preset)
  const acousticallyModulated: VoicePreset = {
    ...preset,
    pitch: acoustic.pitchModifier,
    rate: acoustic.rateModifier,
    volume: acoustic.volumeModifier,
  }
  if (!emotion) return acousticallyModulated
  const emo = getEmotionAdjustment(emotion);
  // Problema de consistencia: la emoción cambia ritmo y tono, nunca el volumen del perfil.
  return {
    ...acousticallyModulated,
    pitch: Math.max(0.3, Math.min(2.5, acousticallyModulated.pitch * emo.pitchMult)),
    rate: Math.max(0.3, Math.min(3.0, acousticallyModulated.rate * emo.rateMult)),
    volume: acousticallyModulated.volume,
  };
}

function isLikelySpanishText(text: string): boolean {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es')) return true
  if (/[áéíóúñ¿¡]/iu.test(text)) return true
  const spanishWords = new Set([
    'al', 'así', 'además', 'arriba', 'como', 'con', 'de', 'del', 'el', 'en',
    'es', 'está', 'hay', 'la', 'las', 'lo', 'los', 'más', 'me', 'mi', 'no',
    'para', 'pero', 'por', 'que', 'se', 'si', 'su', 'te', 'un', 'una', 'y',
  ])
  const words = text.toLocaleLowerCase('es').match(/\p{L}+/gu) ?? []
  return words.filter(word => spanishWords.has(word)).length >= 2
}

function chooseWebSpeechVoice(
  voices: AppVoice[],
  selectedVoice: AppVoice | undefined,
  text: string,
): AppVoice | undefined {
  if (!selectedVoice || selectedVoice.lang.toLowerCase().startsWith('es') || !isLikelySpanishText(text)) {
    return selectedVoice
  }
  // Problema de pronunciación: usa una voz española local solo cuando texto y perfil no coinciden.
  return voices
    .filter(voice =>
      voice.engine === 'web' &&
      !voice.isOnlineOnly &&
      voice.lang.toLowerCase().startsWith('es'),
    )
    .sort((left, right) => Number(right.default) - Number(left.default))[0] ?? selectedVoice
}

export async function preloadNativeSpeech(text: string, preset: VoicePreset, emotion?: string): Promise<void> {
  if (Capacitor.getPlatform() !== 'android' || !text.trim()) return;
  try {
    const persistedPreset = await loadPersistedVoiceProfile(preset)
    nativePreloadRequest = {
      text: text.trim(),
      preset: modulateVoicePreset(persistedPreset, emotion),
    }
    startNativePrefetchIfReady()
  } catch (error) {
    console.warn('[VoxLector TTS] Se omite la anticipación porque no se pudo cargar el perfil guardado:', error)
  }
}

function nativeAudioKey(text: string, preset: VoicePreset): string {
  return JSON.stringify([
    text,
    preset.voiceURI ?? preset.baseVoiceURI,
    preset.lang,
    preset.pitch,
    preset.rate,
    preset.volume,
    preset.formant,
    preset.eqNodes,
    preset.resonance,
    preset.breathiness,
    preset.warmth,
    preset.harmonics,
    preset.modulation,
    preset.modulationRate,
    preset.tremolo,
    preset.chorus,
    preset.reverb,
    preset.clarity,
    useSettingsStore.getState().useOnlineHDVoice,
    isDeviceOnline(),
  ]);
}

async function resolveSystemVoice(
  preset: VoicePreset,
  forceOffline = false,
): Promise<AppVoice | undefined> {
  const voices = await getSystemVoices()
  const requestedURI = preset.voiceURI ?? preset.baseVoiceURI
  const selected = requestedURI
    ? voices.find(voice =>
        voice.voiceURI === requestedURI &&
        (!preset.voiceEngine || voice.engine === preset.voiceEngine),
      )
    : undefined
  if (requestedURI && !selected) {
    throw new Error(`La voz guardada "${preset.name}" ya no está disponible: URI exacta "${requestedURI}".`)
  }
  const preferOnline = !forceOffline &&
    useSettingsStore.getState().useOnlineHDVoice &&
    isDeviceOnline()
  const language = selected?.lang.split('-')[0].toLocaleLowerCase()
    ?? (typeof navigator !== 'undefined' ? navigator.language.split('-')[0].toLocaleLowerCase() : 'es')

  if (selected && (!forceOffline || !selected.isOnlineOnly)) return selected

  if (preferOnline) {
    const onlineForLanguage = voices
      .filter(voice => voice.isOnlineOnly && voice.lang.split('-')[0].toLocaleLowerCase() === language)
      .sort((left, right) => Number(right.default) - Number(left.default))
    if (onlineForLanguage.length > 0) return onlineForLanguage[0]
  }

  const preferredService = voices.filter(voice => !voice.isOnlineOnly)
  const matchingLanguage = preferredService.filter(
    voice => voice.lang.split('-')[0].toLocaleLowerCase() === language,
  )
  if (matchingLanguage.length > 0) {
    return matchingLanguage.find(voice => voice.default) ?? matchingLanguage[0]
  }
  if (requestedURI && selected?.isOnlineOnly && forceOffline) {
    return preferredService.find(voice => voice.lang.split('-')[0].toLocaleLowerCase() === language)
      ?? preferredService.find(voice => voice.default)
      ?? preferredService[0]
  }
  return preferredService.find(voice => voice.default)
    ?? preferredService[0]
    ?? (forceOffline ? undefined : selected)
    ?? (forceOffline ? undefined : voices[0])
}

async function findOfflineFallbackVoice(
  language: string,
  engine?: AppVoice['engine'],
): Promise<AppVoice | undefined> {
  const voices = await getSystemVoices()
  const languageCode = language.split('-')[0].toLocaleLowerCase()
  const offlineVoices = voices.filter(voice =>
    !voice.isOnlineOnly,
  )
  const preferredVoices = engine
    ? offlineVoices.filter(voice => voice.engine === engine)
    : offlineVoices
  return preferredVoices.find(voice => voice.lang.split('-')[0].toLocaleLowerCase() === languageCode)
    ?? preferredVoices.find(voice => voice.default)
    ?? preferredVoices[0]
    ?? offlineVoices.find(voice => voice.lang.split('-')[0].toLocaleLowerCase() === languageCode)
    ?? offlineVoices.find(voice => voice.default)
    ?? offlineVoices[0]
}

async function synthesizeNativeBuffer(text: string, preset: VoicePreset): Promise<AudioBuffer> {
  const voice = await resolveSystemVoice(preset);
  const result = await synthesizeNativeAudio({
    text,
    lang: voice?.lang ?? 'es-ES',
    rate: preset.rate,
    pitch: preset.pitch,
    voiceName: voice?.voiceURI,
  });
  return audioEngine.getContext().decodeAudioData(result.audio.slice(0));
}

function startNativePrefetchIfReady(): void {
  if (!currentNativeAudioSource || !nativePreloadRequest || preparedNativeAudio) return;
  const request = nativePreloadRequest;
  nativePreloadRequest = null;
  const promise = synthesizeNativeBuffer(request.text, request.preset);
  preparedNativeAudio = {
    key: nativeAudioKey(request.text, request.preset),
    promise,
  };
  void promise.catch(error => {
    console.warn('[VoxLector TTS] No se pudo anticipar la siguiente oración:', error);
  });
}

async function takeNativeBuffer(text: string, preset: VoicePreset): Promise<AudioBuffer> {
  const key = nativeAudioKey(text, preset);
  const prepared = preparedNativeAudio;
  if (prepared?.key === key) {
    preparedNativeAudio = null;
    return prepared.promise;
  }
  if (prepared) {
    preparedNativeAudio = null;
    await prepared.promise.catch(() => undefined);
  }
  return synthesizeNativeBuffer(text, preset);
}

function isSpeechCancelled(generation: number): boolean {
  return isCancelled || generation !== stopGeneration;
}

export function stopSpeaking(): void {
  stopGeneration++;
  notifySpeechCancelled()
  const currentStop = stopCurrentSpeech().catch(err => {
    console.warn('[VoxLector TTS] Could not stop speech cleanly:', err);
  });
  pendingStopPromise = pendingStopPromise
    ? Promise.all([pendingStopPromise, currentStop]).then(() => undefined)
    : currentStop;
}

async function stopCurrentSpeech(): Promise<void> {
  isCancelled = true;

  const listener = currentNativeListener;
  currentNativeListener = null;
  const listenerRemoval = listener ? listener.remove() : Promise.resolve();
  const nativeStop = Capacitor.isNativePlatform() ? TextToSpeech.stop() : Promise.resolve();
  const nativeSynthesisStop = Capacitor.getPlatform() === 'android'
    ? stopNativeAudioSynthesis().catch(error => {
      console.warn('[VoxLector TTS] No se pudo cancelar la síntesis nativa:', error);
    })
    : Promise.resolve();
  nativePreloadRequest = null;
  preparedNativeAudio = null;
  const backgroundStop = Capacitor.getPlatform() === 'android'
    ? stopBackgroundPlayback()
    : Promise.resolve();
  const cloudSource = currentCloudSource;
  currentCloudSource = null;
  const nativeAudioSource = currentNativeAudioSource;
  currentNativeAudioSource = null;
  for (const source of [cloudSource, nativeAudioSource]) {
    if (!source) continue;
    try {
      source.stop();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'InvalidStateError')) throw error;
    }
    source.disconnect();
    audioEngine.clearActiveSource(source)
  }

  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
  currentUtterance = null;
  await Promise.all([listenerRemoval, nativeStop, nativeSynthesisStop, backgroundStop]);
}

export async function pauseSpeaking(): Promise<void> {
  stopGeneration++;
  notifySpeechCancelled()
  if (pendingStopPromise) await pendingStopPromise;
  await stopCurrentSpeech();
  pendingStopPromise = null;
}

export function resumeSpeaking(): void {
  // Resumed by calling speakText with current position
}

export function updateSpeakingRate(previousRate: number, nextRate: number): boolean {
  if (!Number.isFinite(previousRate) || !Number.isFinite(nextRate) || previousRate <= 0 || nextRate <= 0) {
    return false
  }
  const ratio = nextRate / previousRate
  let updated = false

  for (const source of [currentNativeAudioSource, currentCloudSource]) {
    if (!source) continue
    const currentTime = source.context.currentTime
    const playbackRate = source.playbackRate
    const newPlaybackRate = Math.max(0.1, Math.min(4, playbackRate.value * ratio))
    playbackRate.cancelScheduledValues(currentTime)
    playbackRate.setValueAtTime(newPlaybackRate, currentTime)
    updated = true
  }

  if (currentUtterance) {
    currentUtterance.rate = Math.max(0.1, Math.min(3, currentUtterance.rate * ratio))
    updated = true
  }

  return updated
}

// ── Native 100% Offline Android TextToSpeech Engine ───────────
async function speakNativeTTS(
  text: string,
  preset: VoicePreset,
  onWordBoundary?: (wordIndex: number, charIndex: number) => void,
  onEnd?: () => void,
  onError?: (err: string) => void,
  keepBackgroundSession = false,
  speechGeneration = stopGeneration,
  forceOffline = false,
): Promise<void> {
  const targetVoice = await resolveSystemVoice(preset, forceOffline)

  // Keep word and character positions relative to the original sentence,
  // even though native TTS receives smaller clauses for punctuation pauses.
  const words = text.split(/\s+/).filter(Boolean);
  const wordOffsets: number[] = [];
  let currentOffset = 0;
  for (const w of words) {
    const idx = text.indexOf(w, currentOffset);
    wordOffsets.push(idx);
    currentOffset = idx + w.length;
  }

  const voiceIndex = targetVoice ? targetVoice.index : -1;
  const lang = targetVoice?.lang || 'es-ES';

  if (Capacitor.getPlatform() === 'android') {
    try {
      const audioBuffer = await takeNativeBuffer(text, preset);
      if (isSpeechCancelled(speechGeneration)) return;
      await playProcessedNativeAudio(
        audioBuffer,
        text,
        preset,
        onWordBoundary,
        onEnd,
        keepBackgroundSession,
        speechGeneration,
      );
      return;
    } catch (error) {
      if (isSpeechCancelled(speechGeneration)) return;
      console.warn('[VoxLector TTS] Síntesis procesada no disponible; se usará TTS directo:', error);
    }
  }

  try {
    const clauses = splitAtPunctuation(text);
    let searchFrom = 0;
    for (const clause of clauses) {
      if (isSpeechCancelled(speechGeneration)) return;
      const clauseOffset = text.indexOf(clause.text, searchFrom);
      searchFrom = clauseOffset + clause.text.length;

      if (currentNativeListener) {
        await currentNativeListener.remove();
        currentNativeListener = null;
      }
      if (onWordBoundary) {
        try {
          currentNativeListener = await TextToSpeech.addListener('onRangeStart', (info: { start: number }) => {
            if (isSpeechCancelled(speechGeneration)) return;
            const absoluteCharIndex = clauseOffset + info.start;
            let wordIdx = 0;
            for (let i = 0; i < wordOffsets.length; i++) {
              if (absoluteCharIndex >= wordOffsets[i]) wordIdx = i;
              else break;
            }
            onWordBoundary(wordIdx, absoluteCharIndex);
          });
        } catch {
          // Range callbacks are unavailable on some platform versions.
        }
      }

      const clauseHasQuestion = clause.text.includes('?')
      const clauseHasExclamation = clause.text.includes('!')
      // Problema de entonación: aplicar énfasis audible a exclamaciones además de preguntas.
      await TextToSpeech.speak({
        text: clause.text,
        lang,
        rate: clauseHasQuestion
          ? Math.max(0.3, preset.rate * 0.94)
          : clauseHasExclamation
            ? Math.min(3, preset.rate * 1.06)
            : preset.rate,
        pitch: clauseHasQuestion
          ? Math.min(2.5, preset.pitch * 1.18)
          : clauseHasExclamation
            ? Math.min(2.5, preset.pitch * 1.12)
            : preset.pitch,
        volume: preset.volume,
        voice: voiceIndex >= 0 ? voiceIndex : undefined,
        queueStrategy: 0,
      });
      if (isSpeechCancelled(speechGeneration)) return;
      if (currentNativeListener) {
        await currentNativeListener.remove();
        currentNativeListener = null;
      }
      if (clause.pauseMs > 0) await waitForSpeechPause(clause.pauseMs);
    }

    if (!isSpeechCancelled(speechGeneration)) {
      onEnd?.();
    }
    if (!keepBackgroundSession) await stopBackgroundPlayback()
  } catch (err) {
    if (currentNativeListener) {
      await currentNativeListener.remove().catch(() => {});
      currentNativeListener = null;
    }
    if (!keepBackgroundSession) await stopBackgroundPlayback()
    if (!isSpeechCancelled(speechGeneration)) {
      if (targetVoice?.isOnlineOnly && !forceOffline) {
        const offlineVoice = await findOfflineFallbackVoice(targetVoice.lang, 'native')
        if (offlineVoice) {
          const fallbackPreset = {
            ...preset,
            baseVoiceURI: offlineVoice.voiceURI,
            voiceURI: offlineVoice.voiceURI,
            voiceEngine: offlineVoice.engine,
            lang: offlineVoice.lang,
          }
          if (offlineVoice.engine === 'web') {
            await speakWebSpeech(text, fallbackPreset, onWordBoundary, onEnd, onError, speechGeneration, true)
          } else {
            await speakNativeTTS(
              text,
              fallbackPreset,
              onWordBoundary,
              onEnd,
              onError,
              keepBackgroundSession,
              speechGeneration,
              true,
            )
          }
          return
        }
      }
      onError?.(String(err));
    }
  }
}

interface SpeechWordTimeline {
  wordOffsets: number[]
  wordWeights: number[]
  voicedFramePrefix: Uint32Array
  frameDuration: number
  totalVoicedDuration: number
  totalWordWeight: number
}

function estimateWordWeight(word: string): number {
  const syllables = word.match(/[aeiouáéíóúü]+/giu)?.length ?? 0
  return Math.max(1, syllables) + (/[.!?…,:;]$/u.test(word) ? 0.6 : 0)
}

function buildSpeechWordTimeline(audioBuffer: AudioBuffer, text: string): SpeechWordTimeline {
  const words = [...text.matchAll(/\S+/gu)]
  const wordOffsets = words.map(word => word.index ?? 0)
  const wordWeights = words.map(word => estimateWordWeight(word[0]))
  const totalWordWeight = wordWeights.reduce((sum, weight) => sum + weight, 0)
  const samplesPerFrame = Math.max(1, Math.round(audioBuffer.sampleRate * 0.01))
  const frameCount = Math.ceil(audioBuffer.length / samplesPerFrame)
  const rmsByFrame = new Float32Array(frameCount)
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index),
  )
  let maximumRms = 0

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * samplesPerFrame
    const end = Math.min(audioBuffer.length, start + samplesPerFrame)
    let sumSquares = 0
    let sampleCount = 0
    for (const channel of channels) {
      for (let sample = start; sample < end; sample++) {
        const value = channel[sample]
        sumSquares += value * value
        sampleCount++
      }
    }
    const rms = sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0
    rmsByFrame[frame] = rms
    maximumRms = Math.max(maximumRms, rms)
  }

  const threshold = maximumRms * 0.1
  const activeFrames = new Uint8Array(frameCount)
  for (let frame = 0; frame < frameCount; frame++) {
    activeFrames[frame] = maximumRms > 0 && rmsByFrame[frame] >= threshold ? 1 : 0
  }

  // Bridge brief gaps inside syllables, but leave sentence and phrase pauses intact.
  const maximumInternalGapFrames = 10
  let lastActiveFrame = -1
  for (let frame = 0; frame < frameCount; frame++) {
    if (!activeFrames[frame]) continue
    if (lastActiveFrame >= 0 && frame - lastActiveFrame <= maximumInternalGapFrames + 1) {
      activeFrames.fill(1, lastActiveFrame + 1, frame)
    }
    lastActiveFrame = frame
  }

  const voicedFramePrefix = new Uint32Array(frameCount + 1)
  for (let frame = 0; frame < frameCount; frame++) {
    voicedFramePrefix[frame + 1] = voicedFramePrefix[frame] + activeFrames[frame]
  }
  const frameDuration = samplesPerFrame / audioBuffer.sampleRate
  return {
    wordOffsets,
    wordWeights,
    voicedFramePrefix,
    frameDuration,
    totalVoicedDuration: voicedFramePrefix[frameCount] * frameDuration,
    totalWordWeight,
  }
}

function scheduleQuestionIntonation(
  source: AudioBufferSourceNode,
  text: string,
  startTime: number,
  duration: number,
  baseRate: number,
): void {
  // Problema de entonación: curva el cierre de preguntas y exclamaciones sintetizadas.
  const question = /\?\s*(?:[»”"')\]]\s*)?$/u.test(text)
  const exclamation = /!\s*(?:[»”"')\]]\s*)?$/u.test(text)
  if (!question && !exclamation) return
  const start = startTime + duration * 0.72
  const peak = startTime + duration * 0.9
  const release = startTime + duration * 0.98
  const pitchContour = source.playbackRate
  pitchContour.setValueAtTime(baseRate, startTime)
  pitchContour.setValueAtTime(baseRate, start)
  pitchContour.linearRampToValueAtTime(baseRate * (question ? 1.08 : 1.12), peak)
  pitchContour.linearRampToValueAtTime(baseRate, release)
}

function getSpeechWordIndex(timeline: SpeechWordTimeline, elapsedSeconds: number): number {
  if (timeline.wordWeights.length < 2 || timeline.totalVoicedDuration <= 0) return 0
  const frame = Math.min(
    timeline.voicedFramePrefix.length - 1,
    Math.max(0, Math.floor(elapsedSeconds / timeline.frameDuration)),
  )
  const voicedDuration = timeline.voicedFramePrefix[frame] * timeline.frameDuration
  const progressedWeight = Math.min(
    timeline.totalWordWeight,
    voicedDuration / timeline.totalVoicedDuration * timeline.totalWordWeight,
  )
  let accumulatedWeight = 0
  for (let index = 0; index < timeline.wordWeights.length - 1; index++) {
    accumulatedWeight += timeline.wordWeights[index]
    if (accumulatedWeight > progressedWeight) return index
  }
  return timeline.wordWeights.length - 1
}


async function playProcessedNativeAudio(
  audioBuffer: AudioBuffer,
  text: string,
  preset: VoicePreset,
  onWordBoundary?: (wordIndex: number, charIndex: number) => void,
  onEnd?: () => void,
  keepBackgroundSession = false,
  speechGeneration = stopGeneration,
): Promise<void> {
  const context = audioEngine.getContext();
  if (context.state === 'suspended') await context.resume();
  if (isSpeechCancelled(speechGeneration)) return;

  if (isSpeechCancelled(speechGeneration)) return;

  audioEngine.buildEQChain(preset.eqNodes, preset.formant);
  audioEngine.setVoiceEffects(preset)
  audioEngine.setOutputGain(preset.volume);
  const input = audioEngine.getInputNode();
  if (!input) throw new Error('La cadena de filtros espectrales no está disponible.');

  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  scheduleQuestionIntonation(source, text, context.currentTime, audioBuffer.duration, 1)
  source.connect(input);
  currentNativeAudioSource = source;
  // The native synthesizer already baked the preset rate into this buffer.
  audioEngine.setActiveSourcePlayback(source, 1);

  const timeline = buildSpeechWordTimeline(audioBuffer, text)
  let lastWordIndex = -1;
  const pendingBoundaryTimers = new Set<ReturnType<typeof setTimeout>>()
  const karaokeTimer = onWordBoundary && timeline.wordWeights.length > 0
    ? setInterval(() => {
      if (isSpeechCancelled(speechGeneration) || currentNativeAudioSource !== source) return;
      const elapsed = (source.context.currentTime - sourceStartedAt) * source.playbackRate.value
      const wordIndex = getSpeechWordIndex(timeline, elapsed)
      if (wordIndex !== lastWordIndex) {
        lastWordIndex = wordIndex
        const rate = Math.max(0.1, source.playbackRate.value)
        const delayMs = Math.max(0, context.baseLatency ?? 0) * 1000 / rate
        const timer = setTimeout(() => {
          pendingBoundaryTimers.delete(timer)
          if (!isSpeechCancelled(speechGeneration) && currentNativeAudioSource === source) {
            onWordBoundary(wordIndex, timeline.wordOffsets[wordIndex] ?? 0)
          }
        }, delayMs)
        pendingBoundaryTimers.add(timer)
      }
    }, 40)
    : null;
  const sourceStartedAt = context.currentTime;

  await new Promise<void>((resolve, reject) => {
    source.onended = () => {
      if (karaokeTimer) clearInterval(karaokeTimer);
      for (const timer of pendingBoundaryTimers) clearTimeout(timer)
      pendingBoundaryTimers.clear()
      source.disconnect();
      audioEngine.clearActiveSource(source);
      if (currentNativeAudioSource === source) currentNativeAudioSource = null;
      if (!isSpeechCancelled(speechGeneration)) {
        onEnd?.();
        if (!keepBackgroundSession) void stopBackgroundPlayback();
      }
      resolve();
    };
    try {
      source.start();
      startNativePrefetchIfReady();
    } catch (error) {
      if (karaokeTimer) clearInterval(karaokeTimer);
      for (const timer of pendingBoundaryTimers) clearTimeout(timer)
      pendingBoundaryTimers.clear()
      if (currentNativeAudioSource === source) currentNativeAudioSource = null;
      audioEngine.clearActiveSource(source);
      source.disconnect();
      reject(error);
    }
  });
}

// ── Web Speech API Fallback (for browser development) ─────────
async function speakWebSpeech(
  text: string,
  preset: VoicePreset,
  onWordBoundary?: (wordIndex: number, charIndex: number) => void,
  onEnd?: () => void,
  onError?: (err: string) => void,
  speechGeneration = stopGeneration,
  forceOffline = false,
): Promise<void> {
  if (typeof speechSynthesis === 'undefined') {
    onEnd?.();
    return;
  }

  const voices = await getSystemVoices();
  if (isSpeechCancelled(speechGeneration)) return;
  const voice = chooseWebSpeechVoice(
    voices,
    await resolveSystemVoice(preset, forceOffline),
    text,
  )
  if (isSpeechCancelled(speechGeneration)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;
  const question = text.includes('?')
  const exclamation = text.includes('!')

  if (voice) {
    // Find matching native SpeechSynthesisVoice
    const nativeVoices = speechSynthesis.getVoices();
    const matchedNative = nativeVoices.find(v => v.voiceURI === voice?.voiceURI);
    if (matchedNative) utterance.voice = matchedNative;
  }

  // Problema de entonación: Web Speech no expone curvas, así que ajusta pitch/ritmo según el cierre.
  utterance.pitch = Math.max(0.1, Math.min(2.0, preset.pitch * (question ? 1.18 : exclamation ? 1.12 : 1)));
  utterance.rate = Math.max(0.1, Math.min(3.0, preset.rate * (question ? 0.94 : exclamation ? 1.06 : 1)));
  utterance.volume = Math.max(0.1, Math.min(1.0, preset.volume));
  utterance.lang = voice?.lang ?? 'es-ES';

  const words = text.split(/\s+/).filter(Boolean);
  const wordOffsets: number[] = [];
  let currentOffset = 0;
  for (const w of words) {
    const idx = text.indexOf(w, currentOffset);
    wordOffsets.push(idx);
    currentOffset = idx + w.length;
  }

  utterance.onboundary = (e) => {
    if (isSpeechCancelled(speechGeneration)) return;
    if (e.name === 'word') {
      const charIdx = e.charIndex;
      let wordIdx = 0;
      for (let i = 0; i < wordOffsets.length; i++) {
        if (charIdx >= wordOffsets[i]) {
          wordIdx = i;
        } else {
          break;
        }
      }
      onWordBoundary?.(wordIdx, charIdx);
    }
  };

  utterance.onend = () => {
    if (!isSpeechCancelled(speechGeneration)) onEnd?.();
    currentUtterance = null;
  };

  utterance.onerror = (e) => {
    if (!isSpeechCancelled(speechGeneration)) {
      if (e.error === 'interrupted') {
        onError?.(e.error)
      } else if (voice?.isOnlineOnly && !forceOffline) {
        void (async () => {
          const offlineVoice = await findOfflineFallbackVoice(voice.lang, 'web')
          if (!offlineVoice || isSpeechCancelled(speechGeneration)) {
            onError?.(e.error)
            return
          }
          const fallbackPreset = {
            ...preset,
            baseVoiceURI: offlineVoice.voiceURI,
            voiceURI: offlineVoice.voiceURI,
            voiceEngine: offlineVoice.engine,
            lang: offlineVoice.lang,
          }
          if (offlineVoice.engine === 'native') {
            await speakNativeTTS(
              text,
              fallbackPreset,
              onWordBoundary,
              onEnd,
              onError,
              false,
              speechGeneration,
              true,
            )
          } else {
            await speakWebSpeech(text, fallbackPreset, onWordBoundary, onEnd, onError, speechGeneration, true)
          }
        })()
        return
      }
      onError?.(e.error);
    }
    currentUtterance = null;
  };

  speechSynthesis.cancel();
  await new Promise(r => setTimeout(r, 40));

  if (!isSpeechCancelled(speechGeneration)) {
    speechSynthesis.speak(utterance);
  }
}

// ── Cloud TTS Provider Integration ───────────────────────────
async function speakCloud(
  text: string,
  preset: VoicePreset,
  provider: CloudProvider,
  apiKey: string,
  emotion?: string,
  onWordBoundary?: (wordIndex: number, charIndex: number) => void,
  onEnd?: () => void,
  onError?: (err: string) => void,
  keepBackgroundSession = false,
  speechGeneration = stopGeneration,
): Promise<void> {
  let boundaryTimer: ReturnType<typeof setInterval> | null = null
  const pendingBoundaryTimers = new Set<ReturnType<typeof setTimeout>>()
  try {
    let audioData: ArrayBuffer;

    switch (provider) {
      case 'openai':
        audioData = await fetchOpenAITTS(text, apiKey, preset);
        break;
      case 'elevenlabs':
        audioData = await fetchElevenLabsTTS(text, apiKey, preset, emotion);
        break;
      case 'google':
        audioData = await fetchGoogleTTS(text, apiKey, preset, emotion);
        break;
      default:
        onError?.('Proveedor no soportado');
        return;
    }

    if (isSpeechCancelled(speechGeneration)) return;
    const ctx = audioEngine.getContext();
    const audioBuffer = await ctx.decodeAudioData(audioData);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    const apiHasPitchControl = provider === 'google'
    source.playbackRate.value = apiHasPitchControl
      ? 1
      : Math.max(0.5, Math.min(2, preset.pitch))
    if (!apiHasPitchControl) {
      scheduleQuestionIntonation(
        source,
        text,
        ctx.currentTime,
        audioBuffer.duration / source.playbackRate.value,
        source.playbackRate.value,
      )
    }
    currentCloudSource = source;
    audioEngine.setActiveSourcePlayback(source, source.playbackRate.value)

    audioEngine.buildEQChain(preset.eqNodes, preset.formant);
    audioEngine.setVoiceEffects(preset)
    audioEngine.setOutputGain(preset.volume);
    const input = audioEngine.getInputNode();
    if (input) {
      source.connect(input);
    } else {
      source.connect(ctx.destination);
    }

    const timeline = buildSpeechWordTimeline(audioBuffer, text)
    let lastWordIndex = -1
    const sourceStartedAt = ctx.currentTime
    boundaryTimer = onWordBoundary && timeline.wordWeights.length > 0
      ? setInterval(() => {
        if (isSpeechCancelled(speechGeneration) || currentCloudSource !== source) return
        const elapsed = (ctx.currentTime - sourceStartedAt) * source.playbackRate.value
        const wordIndex = getSpeechWordIndex(timeline, elapsed)
        if (wordIndex !== lastWordIndex) {
          lastWordIndex = wordIndex
          const rate = Math.max(0.1, source.playbackRate.value)
          const delayMs = Math.max(0, ctx.baseLatency ?? 0) * 1000 / rate
          const timer = setTimeout(() => {
            pendingBoundaryTimers.delete(timer)
            if (!isSpeechCancelled(speechGeneration) && currentCloudSource === source) {
              onWordBoundary?.(wordIndex, timeline.wordOffsets[wordIndex] ?? 0)
            }
          }, delayMs)
          pendingBoundaryTimers.add(timer)
        }
      }, 40)
      : null

    source.onended = () => {
      if (boundaryTimer) clearInterval(boundaryTimer)
      for (const timer of pendingBoundaryTimers) clearTimeout(timer)
      pendingBoundaryTimers.clear()
      if (currentCloudSource === source) currentCloudSource = null;
      audioEngine.clearActiveSource(source)
      if (!isSpeechCancelled(speechGeneration)) {
        onEnd?.();
        if (!keepBackgroundSession) void stopBackgroundPlayback()
      }
    };

    if (!isSpeechCancelled(speechGeneration)) source.start();
  } catch (err) {
    if (boundaryTimer) clearInterval(boundaryTimer)
    for (const timer of pendingBoundaryTimers) clearTimeout(timer)
    if (isSpeechCancelled(speechGeneration)) return;
    console.warn('Cloud TTS fallback to local Native/Web Speech:', err);
    if (preset.voiceEngine === 'web') {
      await speakWebSpeech(text, preset, onWordBoundary, onEnd, onError, speechGeneration);
    } else if (Capacitor.isNativePlatform()) {
      await speakNativeTTS(text, preset, onWordBoundary, onEnd, onError, keepBackgroundSession, speechGeneration);
    } else {
      await speakWebSpeech(text, preset, onWordBoundary, onEnd, onError, speechGeneration);
    }
  }
}

async function fetchOpenAITTS(text: string, apiKey: string, preset: VoicePreset): Promise<ArrayBuffer> {
  const stableIdentity = preset.voiceURI || preset.baseVoiceURI || preset.id
  let voiceHash = 2166136261
  for (let index = 0; index < stableIdentity.length; index++) {
    voiceHash = Math.imul(voiceHash ^ stableIdentity.charCodeAt(index), 16777619)
  }
  const providerVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const
  const providerVoice = providerVoices[(voiceHash >>> 0) % providerVoices.length]
  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      input: text.slice(0, 4096),
      // The provider voice is tied to the saved base Voice_ID, never to
      // pitch/emotion sliders, so prosody changes cannot switch identities.
      voice: providerVoice,
      speed: Math.max(0.25, Math.min(4.0, preset.rate)),
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status}`);
  return resp.arrayBuffer();
}

async function fetchElevenLabsTTS(
  text: string,
  apiKey: string,
  preset: VoicePreset,
  emotion?: string,
): Promise<ArrayBuffer> {
  const voiceId = 'EXAVITQu4vr4xnSDxMaL';
  const stability = emotion === 'alegre' || emotion === 'enojado' || emotion === 'miedo'
    ? 0.32
    : emotion === 'triste' || emotion === 'sollozando' || emotion === 'susurro'
      ? 0.68
      : 0.5
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text.slice(0, 2500),
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability,
        similarity_boost: 0.75,
        speed: Math.max(0.7, Math.min(1.2, preset.rate)),
        style: emotion ? 0.35 : 0,
        use_speaker_boost: true,
      },
    }),
  });
  if (!resp.ok) throw new Error(`ElevenLabs error: ${resp.status}`);
  return resp.arrayBuffer();
}

async function fetchGoogleTTS(
  text: string,
  apiKey: string,
  preset: VoicePreset,
  emotion?: string,
): Promise<ArrayBuffer> {
  const inputText = text.slice(0, 5000);
  const prosody = new ProsodyEngine().analyze(inputText, emotion)
  const ssml = buildPunctuationSsml(prosody.text, prosody.emotion ?? emotion, prosody.isQuestion)
  const requestedVoiceURI = preset.voiceURI ?? preset.baseVoiceURI
  const selectedVoice = (await getSystemVoices()).find(voice => voice.voiceURI === requestedVoiceURI)
  if (requestedVoiceURI && !selectedVoice) {
    throw new Error(`La voz guardada "${preset.name}" ya no está disponible: URI exacta "${requestedVoiceURI}".`)
  }
  const resp = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { ssml },
      voice: { languageCode: selectedVoice?.lang || 'es-ES', ssmlGender: 'NEUTRAL' },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: preset.rate,
        pitch: (preset.pitch - 1.0) * 20,
      },
    }),
  });
  if (!resp.ok) throw new Error(`Google TTS error: ${resp.status}`);
  const json = await resp.json() as { audioContent: string };
  const binary = atob(json.audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function splitAtPunctuation(text: string): Array<{ text: string; pauseMs: number }> {
  const clauses: Array<{ text: string; pauseMs: number }> = [];
  // Match commas, semicolons, colons, ellipsis and sentence-ending punctuation.
  // Commas are now included so the TTS engine inserts a natural breath pause (~175ms).
  const punctuation = /,|[;:!?…]+|\.+/gu;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = punctuation.exec(text))) {
    // Skip decimal separators (e.g. 3.14 or 1,000)
    if (
      (match[0] === '.' || match[0] === ',') &&
      /\d/.test(text[match.index - 1] ?? '') &&
      /\d/.test(text[punctuation.lastIndex] ?? '')
    ) continue;

    const end = punctuation.lastIndex;
    const clauseText = text.slice(start, end).trim();
    if (clauseText) clauses.push({ text: clauseText, pauseMs: punctuationPause(match[0]) });
    start = end;
  }

  const remainder = text.slice(start).trim();
  if (remainder) clauses.push({ text: remainder, pauseMs: 0 });
  return clauses.length > 0 ? clauses : [{ text, pauseMs: 0 }];
}

function punctuationPause(mark: string): number {
  // Tuned for natural reading rhythm. Values below are in milliseconds.
  if (mark === ',') return 175;           // Comma: brief breath, keeps flow natural
  if (mark.includes('…') || (/^\.+$/u.test(mark) && mark.length >= 3)) return 420; // Ellipsis
  if (/[!?]/.test(mark)) return 320;     // Exclamation/question: emphatic end
  if (mark.startsWith('.')) return 280;  // Period: standard sentence end
  if (mark.includes(';') || mark.includes(':')) return 200; // Semi/colon: longer than comma
  return 175;                            // Default fallback (should not be reached)
}

function waitForSpeechPause(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export function buildPreviewText(voiceName: string): string {
  const name = voiceName || 'Voz Personalizada';
  return `¡Saludos cordiales! Mi nombre es ${name}. He sido esculpida mediante la malla espectral de frecuencias para dar vida a los personajes de tus historias. Mi timbre, mi tono y mi expresión están calibrados exactamente a tu medida. ¡Comencemos la lectura cuando estés listo!`;
}
