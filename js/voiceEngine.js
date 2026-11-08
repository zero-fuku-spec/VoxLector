/* ==========================================================================
   VoxLector AI - Advanced Voice Sculptor & Voice Morphing DSP Engine
   ========================================================================== */

class VoxVoiceEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.customPresets = JSON.parse(localStorage.getItem('vox_custom_presets') || '[]');
    this.activeUtterance = null;
    this.audioCtx = null;
    this.eqNodes = {};
    this.isUnlocked = false;
    
    // Cloud API Configuration
    this.cloudConfig = JSON.parse(localStorage.getItem('vox_cloud_config') || '{"provider":"none","apiKey":"","model":"alloy","endpoint":""}');
    
    // 7-Node Parametric Voice Sculpting Mesh (Normalized X: freq, Y: pitch/resonance)
    this.meshNodes = [
      { id: 'sub', x: 0.1, y: 0.5, label: 'Sub (40Hz)' },
      { id: 'bass', x: 0.25, y: 0.5, label: 'Grave (120Hz)' },
      { id: 'timbre', x: 0.4, y: 0.5, label: 'Timbre (400Hz)' },
      { id: 'mid', x: 0.55, y: 0.5, label: 'Cuerpo (1.2kHz)' },
      { id: 'clarity', x: 0.7, y: 0.5, label: 'Claridad (3.5kHz)' },
      { id: 'treble', x: 0.83, y: 0.5, label: 'Brillo (8kHz)' },
      { id: 'air', x: 0.95, y: 0.5, label: 'Aire (14kHz)' }
    ];

    this.initWebAudio();
    this.loadVoices();
    
    if (this.synth) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  initWebAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
        
        // Build 7-band Parametric EQ
        this.eqNodes.sub = this.createFilter(40, 'lowshelf');
        this.eqNodes.bass = this.createFilter(120, 'peaking');
        this.eqNodes.timbre = this.createFilter(400, 'peaking');
        this.eqNodes.mid = this.createFilter(1200, 'peaking');
        this.eqNodes.clarity = this.createFilter(3500, 'peaking');
        this.eqNodes.treble = this.createFilter(8000, 'peaking');
        this.eqNodes.air = this.createFilter(14000, 'highshelf');

        // Chain 7 filters
        this.eqNodes.sub.connect(this.eqNodes.bass);
        this.eqNodes.bass.connect(this.eqNodes.timbre);
        this.eqNodes.timbre.connect(this.eqNodes.mid);
        this.eqNodes.mid.connect(this.eqNodes.clarity);
        this.eqNodes.clarity.connect(this.eqNodes.treble);
        this.eqNodes.treble.connect(this.eqNodes.air);
        this.eqNodes.air.connect(this.audioCtx.destination);
      }
    } catch (e) {
      console.warn("Web Audio API not supported:", e);
    }
  }

  createFilter(freq, type) {
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.gain.value = 0;
    return filter;
  }

  // Mandatory Audio Unlock for browser autoplay policies
  async unlockAudio() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (this.synth) {
      this.synth.resume();
    }
    this.isUnlocked = true;
  }

  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
  }

  getVoices() {
    if ((!this.voices || this.voices.length === 0) && this.synth) {
      this.voices = this.synth.getVoices();
    }
    return this.voices || [];
  }

  getVoiceByName(name) {
    const list = this.getVoices();
    if (!list || list.length === 0) return null;
    return list.find(v => v.name === name) || list[0];
  }

  // Calculate parameters from the 7-Node 2D Mesh
  calculateMeshParameters() {
    const subNode = this.meshNodes.find(n => n.id === 'sub');
    const bassNode = this.meshNodes.find(n => n.id === 'bass');
    const timbreNode = this.meshNodes.find(n => n.id === 'timbre');
    const midNode = this.meshNodes.find(n => n.id === 'mid');
    const clarityNode = this.meshNodes.find(n => n.id === 'clarity');
    const trebleNode = this.meshNodes.find(n => n.id === 'treble');
    const airNode = this.meshNodes.find(n => n.id === 'air');

    // Y values (0 top = high pitch & boost, 1 bottom = deep pitch & cut)
    return {
      subGain: (0.5 - subNode.y) * 24,
      bassGain: (0.5 - bassNode.y) * 24,
      timbreGain: (0.5 - timbreNode.y) * 24,
      midGain: (0.5 - midNode.y) * 24,
      clarityGain: (0.5 - clarityNode.y) * 24,
      trebleGain: (0.5 - trebleNode.y) * 24,
      airGain: (0.5 - airNode.y) * 24,
      pitchOffset: (0.5 - midNode.y) * 0.9
    };
  }

  // Main Speech Execution Engine
  async speakLine(text, voiceParams = {}, onBoundary = null, onEnd = null) {
    this.stop();
    await this.unlockAudio();

    const {
      voiceName = '',
      pitch = 1.0,
      rate = 1.0,
      volume = 1.0,
      emotion = 'normal',
      eqGains = [0, 0, 0, 0, 0, 0, 0]
    } = voiceParams;

    // Emotional Pitch & Rate Modifier
    let finalPitch = pitch;
    let finalRate = rate;

    if (emotion === 'sad' || emotion === 'triste') {
      finalPitch *= 0.75;
      finalRate *= 0.85;
    } else if (emotion === 'excited' || emotion === 'alegre' || emotion === 'feliz') {
      finalPitch *= 1.25;
      finalRate *= 1.15;
    } else if (emotion === 'whisper' || emotion === 'susurro') {
      finalPitch *= 0.9;
      finalRate *= 0.9;
    } else if (emotion === 'angry' || emotion === 'enojado' || emotion === 'furia') {
      finalPitch *= 1.15;
      finalRate *= 1.25;
    } else if (emotion === 'hero' || emotion === 'épico') {
      finalPitch *= 0.8;
      finalRate *= 0.95;
    } else if (emotion === 'villain' || emotion === 'villano') {
      finalPitch *= 0.65;
      finalRate *= 0.9;
    }

    // Apply 7-band EQ gains to Web Audio Context
    if (this.audioCtx && this.eqNodes.sub) {
      this.eqNodes.sub.gain.value = eqGains[0] || 0;
      this.eqNodes.bass.gain.value = eqGains[1] || 0;
      this.eqNodes.timbre.gain.value = eqGains[2] || 0;
      this.eqNodes.mid.gain.value = eqGains[3] || 0;
      this.eqNodes.clarity.gain.value = eqGains[4] || 0;
      this.eqNodes.treble.gain.value = eqGains[5] || 0;
      this.eqNodes.air.gain.value = eqGains[6] || 0;
    }

    // Check Cloud API TTS provider first if configured
    if (this.cloudConfig && this.cloudConfig.provider !== 'none' && this.cloudConfig.apiKey) {
      try {
        const audioBuffer = await this.fetchCloudTTSAudio(text, this.cloudConfig);
        if (audioBuffer) {
          this.playAudioBuffer(audioBuffer, finalRate, onEnd);
          return;
        }
      } catch (err) {
        console.warn("Cloud API TTS failed, falling back to Web Speech API:", err);
      }
    }

    // Web Speech API
    if (!this.synth) {
      if (onEnd) onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const targetVoice = this.getVoiceByName(voiceName);
    
    if (targetVoice) {
      utterance.voice = targetVoice;
    }

    utterance.pitch = Math.max(0.3, Math.min(2.5, finalPitch));
    utterance.rate = Math.max(0.4, Math.min(2.5, finalRate));
    utterance.volume = Math.max(0, Math.min(1.0, volume));

    if (onBoundary) {
      utterance.onboundary = (e) => onBoundary(e);
    }

    utterance.onend = () => {
      this.activeUtterance = null;
      if (onEnd) onEnd();
    };

    utterance.onerror = (err) => {
      console.warn("SpeechSynthesis utterance error:", err);
      this.activeUtterance = null;
      if (onEnd) onEnd();
    };

    this.activeUtterance = utterance;
    this.synth.speak(utterance);
  }

  async fetchCloudTTSAudio(text, config) {
    const { provider, apiKey, model, endpoint } = config;
    let url = '';
    let headers = { 'Content-Type': 'application/json' };
    let body = {};

    if (provider === 'openai') {
      url = 'https://api.openai.com/v1/audio/speech';
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = { model: model || 'tts-1', input: text, voice: 'alloy' };
    } else if (provider === 'elevenlabs') {
      const voiceId = model || '21m00Tcm4TlvDq8ikWAM';
      url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
      headers['xi-api-key'] = apiKey;
      body = { text: text, model_id: 'eleven_monolingual_v1' };
    } else if (provider === 'custom') {
      url = endpoint;
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = { text: text, model: model };
    }

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Cloud TTS HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return this.audioCtx ? await this.audioCtx.decodeAudioData(arrayBuffer) : null;
  }

  playAudioBuffer(buffer, rate, onEnd) {
    if (!this.audioCtx) return;
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(this.eqNodes.sub);
    source.onended = () => { if (onEnd) onEnd(); };
    source.start(0);
  }

  stop() {
    if (this.synth) this.synth.cancel();
    this.activeUtterance = null;
  }

  pause() {
    if (this.synth) this.synth.pause();
  }

  resume() {
    if (this.synth) this.synth.resume();
  }

  saveCustomPreset(preset) {
    this.customPresets.push(preset);
    localStorage.setItem('vox_custom_presets', JSON.stringify(this.customPresets));
  }

  getPresets() {
    return [
      { name: 'Héroe Grave', pitch: 0.65, rate: 0.95, eq: [10, 12, 4, -2, 4, 6, 4] },
      { name: 'Voz Triste', pitch: 0.75, rate: 0.85, eq: [-4, 2, -4, -6, -8, -10, -12] },
      { name: 'Susurro Épico', pitch: 0.9, rate: 0.9, eq: [-10, -6, 0, 4, 8, 12, 16] },
      { name: 'Sintético AI', pitch: 1.4, rate: 1.15, eq: [0, -6, 10, 12, 10, 4, 0] },
      { name: 'Narrador Cálido', pitch: 0.95, rate: 1.0, eq: [4, 6, 4, 2, 0, -2, -4] },
      { name: 'Villano Oscuro', pitch: 0.55, rate: 0.85, eq: [14, 16, 8, 0, -4, 2, -6] },
      { name: 'Hada Aguda', pitch: 1.6, rate: 1.1, eq: [-12, -8, -4, 4, 10, 14, 12] },
      ...this.customPresets
    ];
  }
}

window.voxVoiceEngine = new VoxVoiceEngine();
