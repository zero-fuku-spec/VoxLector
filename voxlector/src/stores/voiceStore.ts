// ============================================================
// VoxLector AI — Voice Store (Zustand + persistence)
// ============================================================

import { create } from 'zustand';
import type { Book, DetectedCharacter, VoicePreset, SavedVoiceProfile, SpectralMesh, EQNode } from '@/types';
import { DEFAULT_EQ_NODES, VOICE_PRESETS } from '@/services/audioEngine';
import { storageService } from '@/services/storageService';
import { dbService } from '@/services/dbService';
import { applyProfileImmediately, type VoicePreviewSnapshot } from '@/services/ttsService';

function createDefaultVoice(id: string, name: string): VoicePreset {
  return {
    id,
    name,
    assignedCharacter: null,
    baseVoiceURI: '',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    eqNodes: DEFAULT_EQ_NODES.map(n => ({ ...n })),
    formant: 0,
    resonance: 1.0,
    breathiness: 0,
    warmth: 0.5,
    harmonics: 0.5,
    modulation: 0.05,
    modulationRate: 4.5,
    tremolo: 0,
    chorus: 0.1,
    reverb: 0.1,
    clarity: 0.6,
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeVoicePreset(
  value: Partial<VoicePreset> & Pick<VoicePreset, 'id' | 'name'> & { spectralMesh?: SpectralMesh },
): VoicePreset {
  const defaults = createDefaultVoice(value.id, value.name)
  const sourceNodes = Array.isArray(value.eqNodes)
    ? value.eqNodes
    : Array.isArray(value.spectralMesh)
      ? DEFAULT_EQ_NODES.map((node, index) => ({ ...node, gain: finiteOr(value.spectralMesh?.[index], node.gain) }))
      : []
  const nodesById = new Map(
    sourceNodes
      .filter((node): node is EQNode =>
        !!node && typeof node === 'object' && Number.isInteger(node.id),
      )
      .map(node => [node.id, node]),
  )
  const eqNodes = DEFAULT_EQ_NODES.map(defaultNode => {
    const node = nodesById.get(defaultNode.id)
    if (!node) return { ...defaultNode }
    return {
      ...defaultNode,
      ...node,
      id: defaultNode.id,
      freq: finiteOr(node.freq, defaultNode.freq),
      gain: finiteOr(node.gain, defaultNode.gain),
      q: finiteOr(node.q, defaultNode.q),
      x: finiteOr(node.x, defaultNode.x),
      y: finiteOr(node.y, defaultNode.y),
      type: ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'].includes(node.type)
        ? node.type
        : defaultNode.type,
      label: typeof node.label === 'string' ? node.label : defaultNode.label,
    }
  })
  const normalized: VoicePreset = {
    ...defaults,
    ...value,
    id: value.id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : defaults.name,
    assignedCharacter: typeof value.assignedCharacter === 'string' ? value.assignedCharacter : null,
    baseVoiceURI: typeof value.baseVoiceURI === 'string'
      ? value.baseVoiceURI
      : typeof value.voiceURI === 'string' ? value.voiceURI : '',
    voiceURI: typeof value.voiceURI === 'string'
      ? value.voiceURI
      : typeof value.baseVoiceURI === 'string' ? value.baseVoiceURI : '',
    localPcmVoiceId: typeof value.localPcmVoiceId === 'string'
      ? value.localPcmVoiceId
      : 'es_ES-davefx-medium',
    lang: typeof value.lang === 'string' ? value.lang : '',
    isCustom: typeof value.isCustom === 'boolean' ? value.isCustom : value.id !== 'narrator_default',
    updatedAt: finiteOr(value.updatedAt, 0),
    pitch: finiteOr(value.pitch, defaults.pitch),
    rate: finiteOr(value.rate, defaults.rate),
    volume: finiteOr(value.volume, defaults.volume),
    eqNodes,
    formant: finiteOr(value.formant, defaults.formant),
    resonance: finiteOr(value.resonance, defaults.resonance),
    breathiness: finiteOr(value.breathiness, defaults.breathiness),
    warmth: finiteOr(value.warmth, defaults.warmth),
    harmonics: finiteOr(value.harmonics, defaults.harmonics),
    modulation: finiteOr(value.modulation, defaults.modulation),
    modulationRate: finiteOr(value.modulationRate, defaults.modulationRate),
    tremolo: finiteOr(value.tremolo, defaults.tremolo),
    chorus: finiteOr(value.chorus, defaults.chorus),
    reverb: finiteOr(value.reverb, defaults.reverb),
    clarity: finiteOr(value.clarity, defaults.clarity),
  }

  for (const key of ['bassBoost', 'midPresence', 'roughness', 'vibrato'] as const) {
    const optional = value[key]
    if (typeof optional === 'number' && Number.isFinite(optional)) normalized[key] = optional
    else delete normalized[key]
  }
  return normalized
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createVoiceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
    const random = Math.floor(Math.random() * 16)
    return (token === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function toSavedVoiceProfile(voice: VoicePreset): SavedVoiceProfile {
  const gains = DEFAULT_EQ_NODES.map(defaultNode => {
    const node = voice.eqNodes.find(candidate => candidate.id === defaultNode.id)
    return finiteOr(node?.gain, defaultNode.gain)
  })
  if (gains.length !== 17) {
    throw new Error(`El perfil "${voice.name}" no contiene exactamente 17 nodos espectrales.`)
  }
  const spectralMesh = gains as SpectralMesh
  const voiceURI = voice.voiceURI ?? voice.baseVoiceURI
  if (voiceURI !== voice.baseVoiceURI) {
    throw new Error(`La URI del perfil "${voice.name}" no coincide con la URI base seleccionada.`)
  }
  return deepClone({
    ...normalizeVoicePreset(voice),
    baseVoiceURI: voiceURI,
    voiceURI,
    lang: voice.lang ?? '',
    spectralMesh,
    isCustom: voice.id !== 'narrator_default',
    updatedAt: Date.now(),
  })
}

const DEFAULT_NARRATOR = createDefaultVoice('narrator_default', 'Narrador');
Object.assign(DEFAULT_NARRATOR, VOICE_PRESETS.narrator);

interface VoiceStore {
  voices: VoicePreset[];
  activeStudioVoiceId: string | null;
  isLoaded: boolean;
  load: () => Promise<void>;
  flush: () => Promise<void>;
  saveCharacters: (
    bookId: string,
    characters: DetectedCharacter[],
    voiceAssignments: Record<string, string>,
  ) => Promise<void>;
  createVoice: (name: string) => VoicePreset;
  duplicateVoice: (id: string, name?: string) => VoicePreset | undefined;
  updateVoice: (id: string, updates: Partial<VoicePreset>) => Promise<void>;
  saveVoiceProfile: (
    id: string,
    updates: Partial<VoicePreset>,
    previewSnapshot: VoicePreviewSnapshot,
  ) => Promise<void>;
  saveProfile: (
    id: string,
    updates: Partial<VoicePreset>,
    previewSnapshot: VoicePreviewSnapshot,
  ) => Promise<void>;
  updateEQNode: (voiceId: string, nodeId: number, gain: number) => void;
  restoreDefaultVoice: () => void;
  deleteVoice: (id: string) => void;
  applyPreset: (voiceId: string, presetKey: string) => void;
  setActiveStudioVoice: (id: string | null) => void;
  getVoiceById: (id: string) => VoicePreset | undefined;
  getVoiceByCharacter: (charName: string) => VoicePreset | undefined;
}

async function saveVoices(voices: VoicePreset[], profileId?: string, previewSnapshot?: VoicePreviewSnapshot): Promise<void> {
  const snapshot = voices.map(toSavedVoiceProfile)
  try {
    await dbService.saveVoiceProfiles(snapshot)
  } catch (databaseError) {
    console.error('[VoxLector] No se pudo guardar en IndexedDB; se intentará la persistencia de respaldo:', databaseError)
    try {
      await storageService.set('voices', snapshot)
    } catch (fallbackError) {
      console.error('[VoxLector] Tampoco se pudo guardar el respaldo local de voces:', fallbackError)
    }
    // Playback reads the canonical profile from IndexedDB; a local backup
    // alone must never be reported as a successful profile save.
    throw new Error(`No se pudo guardar el perfil de voz en IndexedDB: ${String(databaseError)}`)
  }
  if (profileId) {
    const savedProfile = snapshot.find(profile => profile.id === profileId)
    if (savedProfile) applyProfileImmediately(savedProfile, previewSnapshot)
  }
}

let pendingSave: Promise<void> = Promise.resolve()

function enqueueSave(
  voices: VoicePreset[],
  profileId?: string,
  previewSnapshot?: VoicePreviewSnapshot,
  propagateError = false,
): Promise<void> {
  const snapshot = deepClone(voices.map(normalizeVoicePreset))
  const saving = pendingSave
    .catch(error => console.error('[VoxLector] Falló una escritura previa de perfiles de voz:', error))
    .then(() => saveVoices(snapshot, profileId, previewSnapshot))
  pendingSave = saving.catch(error => {
    console.error('[VoxLector] No se pudieron guardar los perfiles de voz:', error)
  })
  return propagateError ? saving : pendingSave
}

export const useVoiceStore = create<VoiceStore>()((set, get) => ({
  voices: [DEFAULT_NARRATOR],
  activeStudioVoiceId: null,
  isLoaded: false,

  flush: async () => {
    await pendingSave
  },

  saveCharacters: async (bookId, characters, voiceAssignments) => {
    const metadata = await dbService.loadBookMetadata()
    const book = metadata.find(entry => entry.id === bookId)
    if (!book) throw new Error(`No se encontró el libro "${bookId}" para guardar sus personajes.`)
    const updatedBook: Book = {
      ...book,
      sentences: [],
      characters: deepClone(characters),
      voiceAssignments: deepClone(voiceAssignments),
    }
    await dbService.saveBookMetadata(updatedBook)
  },

  load: async () => {
    let saved: Array<Partial<SavedVoiceProfile> & Pick<VoicePreset, 'id' | 'name'>> = []
    try {
      saved = await dbService.loadVoiceProfiles()
    } catch (error) {
      console.error('[VoxLector] No se pudieron cargar perfiles de IndexedDB; se leerá el respaldo:', error)
      saved = await storageService.get('voices', [])
    }
    if (saved.length === 0) {
      const legacy = await storageService.get<VoicePreset[]>('voices', [])
      if (Array.isArray(legacy) && legacy.length > 0) {
        saved = legacy
          .filter((voice): voice is VoicePreset => !!voice && typeof voice.id === 'string' && typeof voice.name === 'string')
          .map(voice => toSavedVoiceProfile(normalizeVoicePreset(voice)))
        try {
          await dbService.saveVoiceProfiles(saved as SavedVoiceProfile[])
        } catch (error) {
          console.error('[VoxLector] No se pudo migrar el respaldo de voces a IndexedDB:', error)
        }
      }
    }
    const validSaved = Array.isArray(saved)
      ? saved.filter((voice): voice is VoicePreset =>
          !!voice && typeof voice.id === 'string' && typeof voice.name === 'string',
        ).map(voice => normalizeVoicePreset(voice))
      : []
    const narrator = validSaved.find(voice => voice.id === DEFAULT_NARRATOR.id) ?? DEFAULT_NARRATOR;
    const otherVoices = validSaved.filter(voice => voice.id !== DEFAULT_NARRATOR.id);
    if (!validSaved.some(voice => voice.id === DEFAULT_NARRATOR.id)) {
      try {
        await dbService.saveVoiceProfiles([toSavedVoiceProfile(narrator)])
      } catch (error) {
        console.error('[VoxLector] No se pudo inicializar el perfil del narrador en IndexedDB:', error)
      }
    }
    set({ voices: [narrator, ...otherVoices], isLoaded: true });
    for (const voice of [narrator, ...otherVoices]) {
      try {
        applyProfileImmediately(toSavedVoiceProfile(voice))
      } catch (error) {
        console.error(`[VoxLector] No se pudo activar el perfil "${voice.name}" cargado:`, error)
      }
    }
  },

  createVoice: (name: string) => {
    const id = createVoiceId();
    const newVoice = createDefaultVoice(id, name);
    // New profiles remain drafts until VoiceStudio saves the complete profile.
    set(state => ({ voices: [...state.voices, newVoice] }));
    return newVoice;
  },

  duplicateVoice: (id, name) => {
    const source = get().voices.find(voice => voice.id === id);
    if (!source) return undefined;
    const duplicate: VoicePreset = normalizeVoicePreset({
      ...source,
      id: createVoiceId(),
      name: name?.trim() || `Copia de ${source.name}`,
      assignedCharacter: null,
      eqNodes: source.eqNodes.map(node => ({ ...node })),
    });
    set(state => {
      const voices = [...state.voices, duplicate];
      void enqueueSave(voices, duplicate.id);
      return { voices };
    });
    return duplicate;
  },

  updateVoice: (id, updates) => {
    let saveTask: Promise<void> = Promise.resolve()
    set(state => {
      const voices = state.voices.map(v =>
        v.id === id
          ? normalizeVoicePreset({
              ...v,
              ...Object.fromEntries(
                Object.entries(updates).filter(([, value]) => value !== undefined && value !== null),
              ),
              eqNodes: updates.eqNodes?.map(node => ({ ...node })) ?? v.eqNodes,
            })
          : v
      );
      saveTask = enqueueSave(voices, id, undefined, true)
      return { voices };
    });
    return saveTask
  },

  saveVoiceProfile: (id, updates, previewSnapshot) => {
    let saveTask: Promise<void> = Promise.resolve()
    set(state => {
      const voices = state.voices.map(voice => voice.id === id
        ? normalizeVoicePreset({
            ...voice,
            ...Object.fromEntries(
              Object.entries(updates).filter(([, value]) => value !== undefined && value !== null),
            ),
            eqNodes: updates.eqNodes?.map(node => ({ ...node })) ?? voice.eqNodes,
          })
        : voice)
      saveTask = enqueueSave(voices, id, previewSnapshot, true)
      return { voices }
    })
    return saveTask
  },
  saveProfile: (id, updates, previewSnapshot) =>
    get().saveVoiceProfile(id, updates, previewSnapshot),

  updateEQNode: (voiceId, nodeId, gain) => {
    set(state => {
      const voices = state.voices.map(v => {
        if (v.id !== voiceId) return v;
        const eqNodes = v.eqNodes.map((n: EQNode) =>
          n.id === nodeId ? { ...n, gain } : n
        );
        return normalizeVoicePreset({ ...v, eqNodes });
      });
      void enqueueSave(voices, voiceId);
      return { voices };
    });
  },

  restoreDefaultVoice: () => {
    const narrator = {
      ...createDefaultVoice(DEFAULT_NARRATOR.id, DEFAULT_NARRATOR.name),
      ...DEFAULT_NARRATOR,
      eqNodes: DEFAULT_NARRATOR.eqNodes.map(node => ({ ...node })),
    };
    set(state => {
      const voices = state.voices.map(voice =>
        voice.id === narrator.id ? narrator : voice,
      );
      void enqueueSave(voices, narrator.id);
      return { voices };
    });
  },

  deleteVoice: (id) => {
    if (id === 'narrator_default') return; // Cannot delete default narrator
    set(state => {
      const voices = state.voices.filter(v => v.id !== id);
      void enqueueSave(voices);
      return {
        voices,
        activeStudioVoiceId: state.activeStudioVoiceId === id ? null : state.activeStudioVoiceId,
      };
    });
  },

  applyPreset: (voiceId, presetKey) => {
    const preset = VOICE_PRESETS[presetKey];
    if (!preset) return;
    set(state => {
      const voices = state.voices.map(v =>
        v.id === voiceId
          ? normalizeVoicePreset({
              ...v,
              ...preset,
              eqNodes: preset.eqNodes?.map(node => ({ ...node })) ?? v.eqNodes,
            })
          : v
      );
      void enqueueSave(voices, voiceId);
      return { voices };
    });
  },

  setActiveStudioVoice: (id) => set({ activeStudioVoiceId: id }),

  getVoiceById: (id) => get().voices.find(v => v.id === id),

  getVoiceByCharacter: (charName) =>
    get().voices.find(v => v.assignedCharacter === charName),
}));
