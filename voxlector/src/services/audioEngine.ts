// ============================================================
// VoxLector AI — Web Audio Engine
// 17-band parametric EQ, real-time audio synthesis,
// acoustic envelope extraction, and spectral modulation
// ============================================================

import type { EQNode, VoicePreset } from '@/types';

export const DEFAULT_EQ_NODES: EQNode[] = [
  { id: 0,  freq: 25,    gain: 0, q: 0.7, type: 'lowshelf',   label: 'Sub',       x: 0.02,  y: 0.5 },
  { id: 1,  freq: 63,    gain: 0, q: 1.0, type: 'peaking',    label: 'Grave',     x: 0.08,  y: 0.5 },
  { id: 2,  freq: 100,   gain: 0, q: 1.0, type: 'peaking',    label: '100Hz',     x: 0.13,  y: 0.5 },
  { id: 3,  freq: 160,   gain: 0, q: 1.0, type: 'peaking',    label: '160Hz',     x: 0.18,  y: 0.5 },
  { id: 4,  freq: 250,   gain: 0, q: 1.2, type: 'peaking',    label: '250Hz',     x: 0.24,  y: 0.5 },
  { id: 5,  freq: 400,   gain: 0, q: 1.2, type: 'peaking',    label: 'Timbre',    x: 0.31,  y: 0.5 },
  { id: 6,  freq: 630,   gain: 0, q: 1.2, type: 'peaking',    label: '630Hz',     x: 0.38,  y: 0.5 },
  { id: 7,  freq: 1000,  gain: 0, q: 1.4, type: 'peaking',    label: '1kHz',      x: 0.45,  y: 0.5 },
  { id: 8,  freq: 1600,  gain: 0, q: 1.4, type: 'peaking',    label: 'Cuerpo',    x: 0.52,  y: 0.5 },
  { id: 9,  freq: 2500,  gain: 0, q: 1.5, type: 'peaking',    label: '2.5kHz',    x: 0.58,  y: 0.5 },
  { id: 10, freq: 4000,  gain: 0, q: 1.5, type: 'peaking',    label: 'Claridad',  x: 0.65,  y: 0.5 },
  { id: 11, freq: 5000,  gain: 0, q: 1.5, type: 'peaking',    label: '5kHz',      x: 0.70,  y: 0.5 },
  { id: 12, freq: 6300,  gain: 0, q: 1.5, type: 'peaking',    label: '6.3kHz',    x: 0.75,  y: 0.5 },
  { id: 13, freq: 8000,  gain: 0, q: 1.5, type: 'peaking',    label: 'Brillo',    x: 0.80,  y: 0.5 },
  { id: 14, freq: 10000, gain: 0, q: 1.5, type: 'peaking',    label: '10kHz',     x: 0.85,  y: 0.5 },
  { id: 15, freq: 14000, gain: 0, q: 1.2, type: 'peaking',    label: 'Aire',      x: 0.91,  y: 0.5 },
  { id: 16, freq: 20000, gain: 0, q: 0.7, type: 'highshelf',  label: 'Ultra',     x: 0.97,  y: 0.5 },
];

export const VOICE_PRESETS: Record<string, Partial<VoicePreset>> = {
  narrator: {
    pitch: 1.0, rate: 0.95, volume: 1.0,
    formant: 0, resonance: 1.2, breathiness: 0.05,
    warmth: 0.5, harmonics: 0.5, modulation: 0.05,
    modulationRate: 4.5, tremolo: 0, chorus: 0.1, reverb: 0.1,
    clarity: 0.6, eqNodes: cloneNodes(DEFAULT_EQ_NODES),
  },
  hero: {
    pitch: 0.75, rate: 0.92, volume: 1.0,
    formant: -4, resonance: 2.2, breathiness: 0.1,
    warmth: 0.8, harmonics: 0.6, modulation: 0.08,
    modulationRate: 4.8, tremolo: 0, chorus: 0.15, reverb: 0.25,
    clarity: 0.5,
    eqNodes: cloneNodes(DEFAULT_EQ_NODES).map(n =>
      n.id === 0 ? { ...n, gain: 5 } :
      n.id === 1 ? { ...n, gain: 6 } :
      n.id === 2 ? { ...n, gain: 4 } :
      n.id === 8 ? { ...n, gain: 3 } :
      n.id >= 14 ? { ...n, gain: -2 } : n
    ),
  },
  villain: {
    pitch: 0.55, rate: 0.82, volume: 1.0,
    formant: -7, resonance: 3.5, breathiness: 0.25,
    warmth: 0.3, harmonics: 0.85, modulation: 0.14,
    modulationRate: 3.2, tremolo: 0.06, chorus: 0.3, reverb: 0.4,
    clarity: 0.35,
    eqNodes: cloneNodes(DEFAULT_EQ_NODES).map(n =>
      n.id === 0 ? { ...n, gain: 9 } :
      n.id === 1 ? { ...n, gain: 8 } :
      n.id === 2 ? { ...n, gain: 6 } :
      n.id >= 12 ? { ...n, gain: -5 } : n
    ),
  },
  fairy: {
    pitch: 1.7, rate: 1.15, volume: 0.9,
    formant: 7, resonance: 0.8, breathiness: 0.35,
    warmth: 0.5, harmonics: 0.4, modulation: 0.18,
    modulationRate: 6.2, tremolo: 0.1, chorus: 0.35, reverb: 0.3,
    clarity: 0.85,
    eqNodes: cloneNodes(DEFAULT_EQ_NODES).map(n =>
      n.id <= 3 ? { ...n, gain: -8 } :
      n.id >= 12 ? { ...n, gain: 7 } : n
    ),
  },
  elder: {
    pitch: 0.82, rate: 0.78, volume: 0.85,
    formant: -3, resonance: 1.6, breathiness: 0.4,
    warmth: 0.75, harmonics: 0.7, modulation: 0.12,
    modulationRate: 5.2, tremolo: 0.08, chorus: 0.05, reverb: 0.2,
    clarity: 0.4,
    eqNodes: cloneNodes(DEFAULT_EQ_NODES).map(n =>
      n.id <= 2 ? { ...n, gain: 2 } :
      n.id === 5 ? { ...n, gain: 4 } :
      n.id >= 14 ? { ...n, gain: -4 } : n
    ),
  },
  child: {
    pitch: 1.9, rate: 1.25, volume: 0.95,
    formant: 9, resonance: 0.6, breathiness: 0.15,
    warmth: 0.4, harmonics: 0.3, modulation: 0.08,
    modulationRate: 5.0, tremolo: 0, chorus: 0.1, reverb: 0.1,
    clarity: 0.9,
    eqNodes: cloneNodes(DEFAULT_EQ_NODES).map(n =>
      n.id <= 3 ? { ...n, gain: -7 } :
      n.id >= 10 ? { ...n, gain: 6 } : n
    ),
  },
  robot: {
    pitch: 0.95, rate: 1.0, volume: 1.0,
    formant: 0, resonance: 4.5, breathiness: 0,
    warmth: 0, harmonics: 1.0, modulation: 0.35,
    modulationRate: 2.0, tremolo: 0.25, chorus: 0.6, reverb: 0.2,
    clarity: 1.0,
    eqNodes: cloneNodes(DEFAULT_EQ_NODES).map(n =>
      n.id === 0 ? { ...n, gain: -12 } :
      n.id === 7 ? { ...n, gain: 9 } :
      n.id === 8 ? { ...n, gain: 8 } : n
    ),
  },
  whisper: {
    pitch: 1.1, rate: 0.75, volume: 0.6,
    formant: 2, resonance: 0.5, breathiness: 0.85,
    warmth: 0.4, harmonics: 0.2, modulation: 0.03,
    modulationRate: 3.0, tremolo: 0, chorus: 0.05, reverb: 0.35,
    clarity: 0.5,
    eqNodes: cloneNodes(DEFAULT_EQ_NODES).map(n =>
      n.id <= 4 ? { ...n, gain: -9 } :
      n.id >= 13 ? { ...n, gain: 3 } : n
    ),
  },
};

function cloneNodes(nodes: EQNode[]): EQNode[] {
  return nodes.map(n => ({ ...n }));
}

/**
 * Calculates real acoustic modulation (pitch and rate shifts) based on the 17-node EQ gains.
 * Moving bass nodes alters fundamental frequency; treble alters brightness and pace.
 */
export function calculateAcousticModulation(preset: VoicePreset): {
  pitchModifier: number;
  rateModifier: number;
  volumeModifier: number;
} {
  const nodes = preset.eqNodes || DEFAULT_EQ_NODES;

  // Bass energy: nodes 0 to 3 (25Hz, 63Hz, 100Hz, 160Hz)
  const bassSum = (nodes[0]?.gain ?? 0) + (nodes[1]?.gain ?? 0) + (nodes[2]?.gain ?? 0) + (nodes[3]?.gain ?? 0);
  const avgBass = bassSum / 4; // -18 to +18 dB

  // Treble energy: nodes 12 to 16 (6.3kHz, 8kHz, 10kHz, 14kHz, 20kHz)
  const trebleSum = (nodes[12]?.gain ?? 0) + (nodes[13]?.gain ?? 0) + (nodes[14]?.gain ?? 0) + (nodes[15]?.gain ?? 0) + (nodes[16]?.gain ?? 0);
  const avgTreble = trebleSum / 5;

  // Mid/Timbre energy: nodes 5 to 8 (400Hz to 1.6kHz)
  const midSum = (nodes[5]?.gain ?? 0) + (nodes[6]?.gain ?? 0) + (nodes[7]?.gain ?? 0) + (nodes[8]?.gain ?? 0);
  const avgMid = midSum / 4;

  // High bass pulls fundamental pitch down; high treble pulls pitch up
  // E.g. +12dB bass drops pitch by ~25%; +12dB treble raises pitch by ~25%
  const eqPitchFactor = Math.pow(2, (avgTreble - avgBass) / 36);

  // Formant shift: -12 to +12 semitones
  const formantFactor = Math.pow(2, (preset.formant ?? 0) / 24);

  // Approximate additional timbre controls for system TTS engines without audio effects.
  const warmthFactor = 1 - (((preset.warmth ?? 0.5) - 0.5) * 0.08);
  const harmonicsFactor = 0.98 + ((preset.harmonics ?? 0.5) * 0.04);
  const resonanceFactor = 1 + (((preset.resonance ?? 1) - 1) * 0.015);
  const modulationFactor = 1 + ((preset.modulation ?? 0) * 0.025);
  const rateFactor = 1.0 + (avgTreble / 90)
    - ((preset.breathiness ?? 0) * 0.15)
    + ((preset.clarity ?? 0.5) * 0.1)
    + (((preset.modulationRate ?? 4.5) - 4.5) * 0.004)
    + ((preset.modulation ?? 0) * 0.02)

  const finalPitch = Math.max(
    0.3,
    Math.min(2.5, preset.pitch * eqPitchFactor * formantFactor * warmthFactor * harmonicsFactor * resonanceFactor * modulationFactor),
  );
  const finalRate = Math.max(0.3, Math.min(3.0, preset.rate * rateFactor));
  const finalVolume = Math.max(0.1, Math.min(1.0, preset.volume * (1.0 + (avgMid / 72)) * (1 - ((preset.tremolo ?? 0) * 0.12))));

  return {
    pitchModifier: finalPitch,
    rateModifier: finalRate,
    volumeModifier: finalVolume,
  };
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private eqNodeIds: number[] = [];
  private formantFilters: BiquadFilterNode[] = [];
  private formantShift = 0;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private effectsInput: GainNode | null = null;
  private roughnessDrive: GainNode | null = null;
  private roughnessShaper: WaveShaperNode | null = null;
  private tremoloGain: GainNode | null = null;
  private tremoloLfo: OscillatorNode | null = null;
  private tremoloDepth: GainNode | null = null;
  private chorusDelay: DelayNode | null = null;
  private chorusWet: GainNode | null = null;
  private chorusLfo: OscillatorNode | null = null;
  private chorusDepth: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;
  private previewSynthNode: AudioNode | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeBasePlaybackRate = 1;

  getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  async unlock(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  buildEQChain(nodes: EQNode[], formantShift = this.formantShift): void {
    const ctx = this.getContext();
    this.formantShift = Math.max(-12, Math.min(12, formantShift));

    const nodeIds = nodes.map(node => node.id);
    const chainMatches = this.eqNodeIds.length === nodeIds.length
      && this.eqNodeIds.every((id, index) => id === nodeIds[index])
      && this.roughnessDrive !== null
      && this.roughnessShaper !== null
      && this.tremoloGain !== null
      && this.tremoloLfo !== null
      && this.tremoloDepth !== null;
    if (!chainMatches) {
      this.eqFilters.forEach(filter => filter.disconnect());
      this.formantFilters.forEach(filter => filter.disconnect());
      this.masterGain?.disconnect();
      this.limiter?.disconnect();
      this.analyser?.disconnect();
      this.effectsInput?.disconnect();
      this.roughnessDrive?.disconnect();
      this.roughnessShaper?.disconnect();
      this.tremoloGain?.disconnect();
      this.tremoloDepth?.disconnect();
      this.tremoloLfo?.disconnect();
      this.tremoloLfo?.stop();
      this.chorusDelay?.disconnect();
      this.chorusWet?.disconnect();
      this.chorusDepth?.disconnect();
      this.reverb?.disconnect();
      this.reverbWet?.disconnect();
      this.chorusLfo?.stop();

      this.eqFilters = nodes.map(() => ctx.createBiquadFilter());
      this.formantFilters = [500, 1500, 2800, 4000, 5500].map(() => ctx.createBiquadFilter());
      this.formantFilters.forEach(filter => {
        filter.type = 'peaking';
        filter.Q.value = 2;
        filter.gain.value = 0;
      });
      this.eqNodeIds = nodeIds;
      this.masterGain = ctx.createGain();
      this.effectsInput = ctx.createGain();
      this.roughnessDrive = ctx.createGain();
      this.roughnessShaper = ctx.createWaveShaper();
      this.tremoloGain = ctx.createGain();
      this.tremoloLfo = ctx.createOscillator();
      this.tremoloDepth = ctx.createGain();
      this.chorusDelay = ctx.createDelay(0.05);
      this.chorusWet = ctx.createGain();
      this.chorusLfo = ctx.createOscillator();
      this.chorusDepth = ctx.createGain();
      this.reverb = ctx.createConvolver();
      this.reverbWet = ctx.createGain();
      this.reverb.buffer = createDeterministicImpulse(ctx, 1.25);
      this.chorusLfo.type = 'sine';
      this.chorusLfo.frequency.value = 0.25;
      this.tremoloLfo.type = 'sine';
      this.tremoloLfo.frequency.value = 4.5;
      this.tremoloGain.gain.value = 1;
      this.roughnessShaper.oversample = '2x';
      this.roughnessShaper.curve = null;
      this.tremoloLfo.connect(this.tremoloDepth);
      this.tremoloDepth.connect(this.tremoloGain.gain);
      this.chorusDelay.delayTime.value = 0.018;
      this.chorusLfo.connect(this.chorusDepth);
      this.chorusDepth.connect(this.chorusDelay.delayTime);
      this.chorusLfo.start();
      this.tremoloLfo.start();
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;

      for (let index = 0; index < this.eqFilters.length - 1; index++) {
        this.eqFilters[index].connect(this.eqFilters[index + 1]);
      }
      if (this.eqFilters.length > 0) {
        this.eqFilters[this.eqFilters.length - 1].connect(this.masterGain);
      }
      if (this.eqFilters.length > 0 && this.formantFilters.length > 0) {
        this.eqFilters[this.eqFilters.length - 1].disconnect();
        this.eqFilters[this.eqFilters.length - 1].connect(this.formantFilters[0]);
        for (let index = 0; index < this.formantFilters.length - 1; index++) {
          this.formantFilters[index].connect(this.formantFilters[index + 1]);
        }
        this.formantFilters[this.formantFilters.length - 1].connect(this.roughnessDrive);
      } else if (this.formantFilters.length > 0) {
        this.formantFilters[0].connect(this.roughnessDrive);
      }
      this.roughnessDrive.connect(this.roughnessShaper);
      this.roughnessShaper.connect(this.effectsInput);
      this.effectsInput.connect(this.tremoloGain);
      this.tremoloGain.connect(this.masterGain);
      this.effectsInput.connect(this.chorusDelay);
      this.chorusDelay.connect(this.chorusWet);
      this.chorusWet.connect(this.masterGain);
      this.effectsInput.connect(this.reverb);
      this.reverb.connect(this.reverbWet);
      this.reverbWet.connect(this.masterGain);
      this.masterGain.connect(this.limiter);
      this.limiter.connect(this.analyser);
      this.analyser.connect(ctx.destination);
    }

    this.updateEQNodes(nodes, this.formantShift);
  }

  updateEQNodes(nodes: EQNode[], formantShift = this.formantShift): void {
    this.formantShift = Math.max(-12, Math.min(12, formantShift));
    if (nodes.length !== this.eqFilters.length ||
        !nodes.every((node, index) => node.id === this.eqNodeIds[index])) {
      this.buildEQChain(nodes, this.formantShift);
      return;
    }
    const ctx = this.getContext();
    const maxFrequency = ctx.sampleRate / 2;
    nodes.forEach((node, index) => {
      const filter = this.eqFilters[index];
      if (!filter) return;
      const frequency = Math.max(10, Math.min(maxFrequency, node.freq));
      const q = Math.max(0.0001, Math.min(1000, node.q));
      filter.type = node.type;
      filter.frequency.setTargetAtTime(frequency, ctx.currentTime, 0.015);
      filter.gain.setTargetAtTime(Math.max(-24, Math.min(24, node.gain)), ctx.currentTime, 0.015);
      filter.Q.setTargetAtTime(q, ctx.currentTime, 0.015);
    });
    const formantRatio = Math.pow(2, this.formantShift / 12);
    [500, 1500, 2800, 4000, 5500].forEach((centerFrequency, index) => {
      const filter = this.formantFilters[index];
      if (!filter) return;
      filter.frequency.setTargetAtTime(
        Math.max(80, Math.min(ctx.sampleRate / 2, centerFrequency * formantRatio)),
        ctx.currentTime,
        0.03,
      );
    });
  }

  updateEQNode(index: number, gain: number): void {
    const filter = this.eqFilters[index];
    if (filter) {
      const ctx = this.getContext();
      filter.gain.setTargetAtTime(Math.max(-24, Math.min(24, gain)), ctx.currentTime, 0.015);
    }
  }

  setOutputGain(gain: number): void {
    if (!this.masterGain) return;
    const ctx = this.getContext();
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, gain)), ctx.currentTime, 0.015);
  }

  setVoiceEffects(preset: VoicePreset): void {
    if (!this.ctx || !this.chorusLfo || !this.chorusDepth || !this.chorusWet ||
        !this.chorusDelay || !this.reverbWet || !this.tremoloLfo || !this.tremoloDepth ||
        !this.roughnessDrive || !this.roughnessShaper) return;
    const now = this.ctx.currentTime;
    const chorus = Math.max(0, Math.min(1, preset.chorus ?? 0));
    const reverb = Math.max(0, Math.min(1, preset.reverb ?? 0));
    const resonance = Math.max(0.1, Math.min(5, preset.resonance ?? 1));
    const warmth = Math.max(0, Math.min(1, preset.warmth ?? 0.5));
    const breathiness = Math.max(0, Math.min(1, preset.breathiness ?? 0));
    const modulation = Math.max(0, Math.min(1, preset.modulation ?? 0));
    const tremolo = Math.max(0, Math.min(1, preset.tremolo ?? 0));
    const roughness = Math.max(0, Math.min(1, preset.roughness ?? 0));
    const harmonics = Math.max(0, Math.min(1, preset.harmonics ?? 0.5));
    const clarity = Math.max(0, Math.min(1, preset.clarity ?? 0.6));
    const formantGains = [
      (resonance - 1) * 1.25 + (warmth - 0.5) * 8 - breathiness * 1.5,
      1.5 + (resonance - 1) * 1.6 + (harmonics - 0.5) * 2,
      1.3 + (resonance - 1) * 1.8 + (clarity - 0.5) * 4,
      0.8 + (harmonics - 0.5) * 4 + breathiness * 2,
      0.5 + (clarity - 0.5) * 3 + breathiness * 3,
    ];
    this.formantFilters.forEach((filter, index) => {
      filter.gain.setTargetAtTime(
        Math.max(-8, Math.min(10, formantGains[index] ?? 0)),
        now,
        0.025,
      );
      filter.Q.setTargetAtTime(
        Math.max(0.7, Math.min(8, 1.2 + resonance * 0.8)),
        now,
        0.025,
      );
    });
    this.chorusLfo.frequency.setTargetAtTime(
      Math.max(0.05, Math.min(10, preset.modulationRate ?? 0.25)),
      now,
      0.02,
    );
    this.chorusDepth.gain.setTargetAtTime(chorus * 0.004 + modulation * 0.003, now, 0.02);
    this.chorusWet.gain.setTargetAtTime(chorus * 0.25 + modulation * 0.12, now, 0.02);
    this.tremoloLfo.frequency.setTargetAtTime(
      Math.max(0.1, Math.min(12, preset.modulationRate ?? 4.5)),
      now,
      0.02,
    );
    this.tremoloDepth.gain.setTargetAtTime(tremolo * 0.45, now, 0.02);
    this.reverbWet.gain.setTargetAtTime(reverb * 0.3, now, 0.02);
    this.roughnessDrive.gain.setTargetAtTime(1 + roughness * 3, now, 0.02);
    if (roughness === 0) {
      this.roughnessShaper.curve = null;
    } else {
      const curve = new Float32Array(2048);
      const amount = 1 + roughness * 10;
      const normalization = Math.tanh(amount);
      for (let index = 0; index < curve.length; index++) {
        const input = (index * 2) / (curve.length - 1) - 1;
        curve[index] = Math.tanh(input * amount) / normalization;
      }
      this.roughnessShaper.curve = curve;
    }
  }

  setActiveSourcePlayback(source: AudioBufferSourceNode, baseRate: number): void {
    this.activeSource = source;
    this.activeBasePlaybackRate = Math.max(0.5, Math.min(2, baseRate));
  }

  clearActiveSource(source: AudioBufferSourceNode): void {
    if (this.activeSource === source) this.activeSource = null;
  }

  updateActivePlaybackRate(pitch: number, rate: number, basePitch: number, baseRate: number): void {
    const source = this.activeSource;
    if (!source) return;
    const pitchRatio = pitch / Math.max(0.5, basePitch);
    const rateRatio = rate / Math.max(0.5, baseRate);
    const desiredRate = Math.max(0.5, Math.min(2, this.activeBasePlaybackRate * pitchRatio * rateRatio));
    const ctx = this.getContext();
    source.playbackRate.setTargetAtTime(desiredRate, ctx.currentTime, 0.04);
  }

  getInputNode(): AudioNode | null {
    return this.eqFilters[0] ?? null;
  }

  /**
   * Generates an auditory demonstration pulse through the 17 EQ filter chain
   * so the user audibly hears the physical frequencies shift as they drag nodes.
   */
  playAuditoryTestPulse(freq: number, gain: number): void {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();

      osc.type = freq < 200 ? 'sawtooth' : freq < 2000 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const amp = Math.min(0.2, Math.max(0.01, (gain + 18) / 100));
      oscGain.gain.setValueAtTime(0.001, ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(amp, ctx.currentTime + 0.05);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

      const input = this.getInputNode();
      if (input) {
        osc.connect(oscGain);
        oscGain.connect(input);
      } else {
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
      }

      osc.start();
      osc.stop(ctx.currentTime + 0.38);
    } catch (err) {
      console.warn('Audio pulse error:', err);
    }
  }
}

function createDeterministicImpulse(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const samples = impulse.getChannelData(channel);
    let seed = 0x12345678 + channel;
    for (let index = 0; index < samples.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 0x100000000) * 2 - 1;
      const decay = 1 - index / samples.length;
      samples[index] = noise * decay * decay * decay;
    }
  }
  return impulse;
}

export const audioEngine = new AudioEngine();
