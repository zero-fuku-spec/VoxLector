// ============================================================
// VoxLector AI — VoiceStudioModal Component
// 17-node multidimensional frequency mesh with audible test pulses,
// real acoustic voice transformation, custom naming, and preset sculpting
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import type { VoicePreset, EQNode, SpectralMesh } from '@/types'
import { useVoiceStore } from '@/stores/voiceStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { DEFAULT_EQ_NODES, VOICE_PRESETS, audioEngine, calculateAcousticModulation } from '@/services/audioEngine'
import {
  getSystemVoices,
  subscribeSystemVoices,
  subscribeNetworkStatus,
  pauseSpeaking,
  speakText,
  stopSpeaking,
  updateActiveSpeechPreview,
  buildPreviewText,
  openTtsInstall,
  isDeviceOnline,
  type AppVoice,
} from '@/services/ttsService'
import {
  cancelLocalPcmVoiceSynthesis,
  LOCAL_PCM_VOICE_OPTIONS,
  synthesizeLocalPcmVoice,
  type LocalPcmProgress,
} from '@/services/localPcmVoiceSynthesis'

interface Props {
  initialCharacter?: string
  voiceToEditId?: string
  onClose: () => void
  onVoiceSaved?: (voiceId: string) => void | Promise<void>
}

function getVoiceGenderMarker(name: string): 'H' | 'F' | '?' {
  // Speech synthesis APIs expose no gender metadata; infer only from recognizable provider labels or voice names.
  const normalizedName = name.toLocaleLowerCase()
  if (/\b(female|woman|mujer|femenina)\b/u.test(normalizedName)) return 'F'
  if (/\b(male|man|hombre|masculina)\b/u.test(normalizedName)) return 'H'

  const feminineNames = /\b(helena|sabina|dalia|elvira|abril|ximena|renata|samantha|victoria|karen|moira|tessa|fiona|ava|allison|susan|zira|jenny|aria|eva|hazel|lucia|laura|monica|paulina|sofia|camila|valentina|andrea)\b/u
  if (feminineNames.test(normalizedName)) return 'F'

  const masculineNames = /\b(alvaro|álvaro|pablo|raul|raúl|jorge|carlos|diego|david|enrique|alex|daniel|fred|tom|ralph|mark|james|george|guy|ryan|eric|brian|thomas|john|oliver|miguel|antonio|juan|luis|mateo|andres|andrés|sergio|hugo|bruno)\b/u
  if (masculineNames.test(normalizedName)) return 'H'
  return '?'
}

function normalizeVoiceSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

export default function VoiceStudioModal({
  initialCharacter,
  voiceToEditId,
  onClose,
  onVoiceSaved,
}: Props) {
  const { voices, createVoice, saveProfile } = useVoiceStore()
  const {
    cloudProvider,
    apiKeys,
    useOnlineHDVoice,
    setUseOnlineHDVoice,
  } = useSettingsStore()

  const existingVoice = voiceToEditId ? voices.find(v => v.id === voiceToEditId) : null

  const [deviceVoices, setDeviceVoices] = useState<AppVoice[]>([])
  const studioVoices = useMemo(
    () => Capacitor.isNativePlatform()
      ? deviceVoices.filter(voice => voice.engine === 'native')
      : deviceVoices,
    [deviceVoices],
  )
  const [isOnline, setIsOnline] = useState<boolean>(isDeviceOnline())
  const [voiceTypeFilter, setVoiceTypeFilter] = useState<'all' | 'offline' | 'online'>('all')
  const [languageFilter, setLanguageFilter] = useState<string>('es')
  const [countrySearch, setCountrySearch] = useState<string>('')

  const [voiceName, setVoiceName] = useState(
    existingVoice?.name ||
    (initialCharacter ? `Voz de ${initialCharacter}` : 'nueva voz esculpida')
  )
  const [selectedBaseVoiceURI, setSelectedBaseVoiceURI] = useState<string>(
    existingVoice?.baseVoiceURI || ''
  )
  const [selectedVoiceEngine, setSelectedVoiceEngine] = useState<'native' | 'web'>(
    existingVoice?.voiceEngine ?? (Capacitor.isNativePlatform() ? 'native' : 'web')
  )

  // 17-Node EQ Mesh State
  const [eqNodes, setEqNodes] = useState<EQNode[]>(
    existingVoice?.eqNodes?.map(n => ({ ...n })) ||
    DEFAULT_EQ_NODES.map(n => ({ ...n }))
  )
  const [activeNodeIndex, setActiveNodeIndex] = useState<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDraggingRef = useRef(false)
  const isPreviewActiveRef = useRef(false)
  const isLocalPcmPreviewRef = useRef(false)
  const localPreviewSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const previewRunIdRef = useRef(0)
  const previewTextRef = useRef('')
  // Sculpting Sliders
  const [pitch, setPitch] = useState<number>(existingVoice?.pitch ?? 1.0)
  const [rate, setRate] = useState<number>(existingVoice?.rate ?? 1.0)
  const previewBasePlaybackRef = useRef({ pitch, rate })
  const [volume, setVolume] = useState<number>(existingVoice?.volume ?? 1.0)
  const [formant, setFormant] = useState<number>(existingVoice?.formant ?? 0)
  const [resonance, setResonance] = useState<number>(existingVoice?.resonance ?? 1.0)
  const [breathiness, setBreathiness] = useState<number>(existingVoice?.breathiness ?? 0.0)
  const [warmth, setWarmth] = useState<number>(existingVoice?.warmth ?? 0.5)
  const [harmonics, setHarmonics] = useState<number>(existingVoice?.harmonics ?? 0.5)
  const [modulation, setModulation] = useState<number>(existingVoice?.modulation ?? 0.05)
  const [modulationRate, setModulationRate] = useState<number>(existingVoice?.modulationRate ?? 4.5)
  const [tremolo, setTremolo] = useState<number>(existingVoice?.tremolo ?? 0.0)
  const [chorus, setChorus] = useState<number>(existingVoice?.chorus ?? 0.1)
  const [reverb, setReverb] = useState<number>(existingVoice?.reverb ?? 0.1)
  const [clarity, setClarity] = useState<number>(existingVoice?.clarity ?? 0.6)
  const [roughness, setRoughness] = useState<number>(existingVoice?.roughness ?? 0)
  const [localPcmVoiceId, setLocalPcmVoiceId] = useState<string>(
    existingVoice?.localPcmVoiceId ?? 'es_ES-davefx-medium',
  )

  const currentVoiceDraft = useMemo<VoicePreset>(() => ({
    id: 'preview_temp',
    name: voiceName,
    assignedCharacter: initialCharacter || existingVoice?.assignedCharacter || null,
    baseVoiceURI: selectedBaseVoiceURI,
    voiceURI: selectedBaseVoiceURI,
    voiceEngine: selectedVoiceEngine,
    localPcmVoiceId,
    pitch,
    rate,
    volume,
    eqNodes: eqNodes.map(node => ({ ...node })),
    formant,
    resonance,
    breathiness,
    warmth,
    harmonics,
    modulation,
    modulationRate,
    tremolo,
    chorus,
    reverb,
    clarity,
    roughness,
  }), [
    voiceName, initialCharacter, existingVoice?.assignedCharacter,
    selectedBaseVoiceURI, selectedVoiceEngine, localPcmVoiceId, pitch, rate, volume, eqNodes, formant,
    resonance, breathiness, warmth, harmonics, modulation,
    modulationRate, tremolo, chorus, reverb, clarity, roughness,
  ])
  const latestVoiceDraftRef = useRef(currentVoiceDraft)
  latestVoiceDraftRef.current = currentVoiceDraft
  const liveAcoustic = useMemo(
    () => calculateAcousticModulation(currentVoiceDraft),
    [currentVoiceDraft],
  )
  const liveAcousticRef = useRef(liveAcoustic)
  liveAcousticRef.current = liveAcoustic

  const applyLivePreviewDraft = (updates: Partial<VoicePreset>) => {
    const nextDraft = { ...latestVoiceDraftRef.current, ...updates }
    latestVoiceDraftRef.current = nextDraft
    if (!isPreviewActiveRef.current) return
    const nextAcoustic = calculateAcousticModulation(nextDraft)
    updateActiveSpeechPreview(
      nextDraft,
      nextAcoustic.pitchModifier,
      nextAcoustic.rateModifier,
      previewBasePlaybackRef.current.pitch,
      previewBasePlaybackRef.current.rate,
    )
  }

  const [isPlayingPreview, setIsPlayingPreview] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewProgress, setPreviewProgress] = useState<LocalPcmProgress | null>(null)
  const [showVoiceControls, setShowVoiceControls] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)

  // Network status detection
  useEffect(() => {
    return subscribeNetworkStatus(setIsOnline)
  }, [])

  // Load device voices
  useEffect(() => {
    let mounted = true
    // Problema Microsoft: mantiene visible el catálogo cuando el navegador termina de cargar voces online.
    const unsubscribe = subscribeSystemVoices(vs => {
      if (mounted) setDeviceVoices(vs)
    })
    getSystemVoices(true).then(vs => {
      if (!mounted) return
      setDeviceVoices(vs)
      const editableVoices = Capacitor.isNativePlatform()
        ? vs.filter(voice => voice.engine === 'native')
        : vs
      const selectedVoice = editableVoices.find(voice =>
        voice.voiceURI === selectedBaseVoiceURI && voice.engine === selectedVoiceEngine,
      )
      if (editableVoices.length > 0 && !selectedVoice) {
        const es = editableVoices.find(v => v.lang.startsWith('es') || v.lang.startsWith('ES'))
        const selected = es ?? editableVoices[0]
        setSelectedBaseVoiceURI(selected.voiceURI)
        setSelectedVoiceEngine(selected.engine)
      }
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isPreviewActiveRef.current) return
    updateActiveSpeechPreview(
      currentVoiceDraft,
      liveAcoustic.pitchModifier,
      liveAcoustic.rateModifier,
      previewBasePlaybackRef.current.pitch,
      previewBasePlaybackRef.current.rate,
    )
  }, [eqNodes, formant, liveAcoustic, currentVoiceDraft])

  useEffect(() => () => {
    previewRunIdRef.current++
    cancelLocalPcmVoiceSynthesis()
    const source = localPreviewSourceRef.current
    if (source) {
      source.onended = null
      source.stop()
      source.disconnect()
      audioEngine.clearActiveSource(source)
      localPreviewSourceRef.current = null
    }
    if (isPreviewActiveRef.current) stopSpeaking()
  }, [])

  // ── Canvas 17-Node Drawing ───────────────────────────────────
  const drawMesh = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height

    // Background
    ctx.fillStyle = '#0a0a14'
    ctx.fillRect(0, 0, w, h)

    // dB grid lines (+18dB to -18dB)
    ctx.lineWidth = 1
    const dBLabels = ['+18dB', '+12dB', '+6dB', '0dB', '-6dB', '-12dB', '-18dB']
    for (let i = 0; i <= 6; i++) {
      const y = (h / 6) * i
      ctx.strokeStyle = i === 3 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)'
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()

      ctx.fillStyle = i === 3 ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.25)'
      ctx.font = '9px monospace'
      ctx.fillText(dBLabels[i], 8, y - 3)
    }

    if (eqNodes.length > 0) {
      // Draw smooth Bezier curve across 17 nodes
      ctx.beginPath()
      const firstX = eqNodes[0].x * w
      const firstY = (1 - (eqNodes[0].gain + 18) / 36) * h
      ctx.moveTo(firstX, firstY)

      for (let i = 0; i < eqNodes.length - 1; i++) {
        const curr = eqNodes[i]
        const next = eqNodes[i + 1]

        const cx1 = curr.x * w
        const cy1 = (1 - (curr.gain + 18) / 36) * h
        const cx2 = next.x * w
        const cy2 = (1 - (next.gain + 18) / 36) * h

        const midX = (cx1 + cx2) / 2
        ctx.bezierCurveTo(midX, cy1, midX, cy2, cx2, cy2)
      }

      ctx.strokeStyle = '#7c5cff'
      ctx.lineWidth = 3
      ctx.shadowColor = 'rgba(124, 92, 255, 0.9)'
      ctx.shadowBlur = 15
      ctx.stroke()
      ctx.shadowBlur = 0

      // Gradient fill under curve
      ctx.lineTo(w, h / 2)
      ctx.lineTo(0, h / 2)
      ctx.closePath()
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(124, 92, 255, 0.35)')
      grad.addColorStop(1, 'rgba(255, 107, 157, 0.05)')
      ctx.fillStyle = grad
      ctx.fill()

      // Interactive nodes
      eqNodes.forEach((node, i) => {
        const nx = node.x * w
        const ny = (1 - (node.gain + 18) / 36) * h
        const isSelected = activeNodeIndex === i

        ctx.beginPath()
        ctx.arc(nx, ny, isSelected ? 7.5 : 4.5, 0, Math.PI * 2)
        ctx.fillStyle = isSelected ? '#ff6b9d' : '#7c5cff'
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()

        if (i % 2 === 0 || isSelected) {
          ctx.fillStyle = isSelected ? '#ff6b9d' : 'rgba(255, 255, 255, 0.6)'
          ctx.font = isSelected ? 'bold 10px sans-serif' : '9px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(node.label, nx, h - 6)
          if (isSelected) {
            ctx.fillText(`${node.gain > 0 ? '+' : ''}${node.gain.toFixed(1)}dB`, nx, ny - 10)
          }
        }
      })
    }
  }, [eqNodes, activeNodeIndex])

  useEffect(() => {
    drawMesh()
  }, [drawMesh])

  // Pointer drag on canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height

    let closestIdx = 0
    let minDistance = Infinity
    eqNodes.forEach((node, idx) => {
      const ny = 1 - (node.gain + 18) / 36
      const dist = Math.hypot(node.x - px, ny - py)
      if (dist < minDistance) {
        minDistance = dist
        closestIdx = idx
      }
    })

    setActiveNodeIndex(closestIdx)
    isDraggingRef.current = true
    canvas.setPointerCapture(e.pointerId)

    // Auditory pulse when clicking a node
    audioEngine.playAuditoryTestPulse(eqNodes[closestIdx].freq, eqNodes[closestIdx].gain)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || activeNodeIndex === null) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height

    const normalizedY = Math.max(0, Math.min(1, py))
    const gain = Math.round(((1 - normalizedY) * 36 - 18) * 10) / 10
    const previousNodes = eqNodes
    const minX = activeNodeIndex > 0 ? previousNodes[activeNodeIndex - 1].x + 0.005 : 0
    const maxX = activeNodeIndex < previousNodes.length - 1
      ? previousNodes[activeNodeIndex + 1].x - 0.005
      : 1
    const normalizedX = Math.max(minX, Math.min(maxX, px))
    const maxFrequency = Math.max(20, Math.min(20000, audioEngine.getContext().sampleRate / 2))
    const minFrequency = Math.min(20, maxFrequency)
    const frequency = Math.round(minFrequency * Math.pow(maxFrequency / minFrequency, normalizedX))

    const next = eqNodes.map((node, index) => index === activeNodeIndex
      ? { ...node, x: normalizedX, freq: frequency, gain }
      : node)
    setEqNodes(next)
    applyLivePreviewDraft({ eqNodes: next })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {}
  }

  // Presets
  const handleApplyPreset = (key: string) => {
    setSelectedPreset(key)
    const p = VOICE_PRESETS[key]
    if (!p) return

    if (p.pitch !== undefined) setPitch(p.pitch)
    if (p.rate !== undefined) setRate(p.rate)
    if (p.volume !== undefined) setVolume(p.volume)
    if (p.formant !== undefined) setFormant(p.formant)
    if (p.resonance !== undefined) setResonance(p.resonance)
    if (p.breathiness !== undefined) setBreathiness(p.breathiness)
    if (p.warmth !== undefined) setWarmth(p.warmth)
    if (p.harmonics !== undefined) setHarmonics(p.harmonics)
    if (p.modulation !== undefined) setModulation(p.modulation)
    if (p.modulationRate !== undefined) setModulationRate(p.modulationRate)
    if (p.tremolo !== undefined) setTremolo(p.tremolo)
    if (p.chorus !== undefined) setChorus(p.chorus)
    if (p.reverb !== undefined) setReverb(p.reverb)
    if (p.clarity !== undefined) setClarity(p.clarity)
    if (p.roughness !== undefined) setRoughness(p.roughness)
    if (p.eqNodes) {
      const presetNodes = p.eqNodes.map(node => ({ ...node }))
      setEqNodes(presetNodes)
      audioEngine.updateEQNodes(presetNodes, p.formant ?? formant)
    }

    // Audio test pulse for the preset
    audioEngine.playAuditoryTestPulse(key === 'villain' ? 80 : key === 'fairy' ? 1200 : 440, 6)
  }

  // Distinct languages detected from voices
  const availableLanguages = useMemo(() => {
    const map = new Map<string, { code: string; label: string; count: number }>()
    studioVoices.forEach(v => {
      const code = v.lang.split('-')[0].toLowerCase()
      const existing = map.get(code)
      if (existing) {
        existing.count++
      } else {
        map.set(code, {
          code,
          label: `${v.flag} ${v.langName}`,
          count: 1,
        })
      }
    })
    return Array.from(map.values())
  }, [studioVoices])

  // Filter voices by type (offline/online), language, and country search
  const filteredVoices = useMemo(() => {
    return studioVoices.filter(v => {
      // Voice Type Filter
      if (voiceTypeFilter === 'offline' && v.isOnlineOnly) return false
      if (voiceTypeFilter === 'online' && !v.isOnlineOnly) return false

      // Language Filter
      if (languageFilter !== 'all') {
        const vCode = v.lang.split('-')[0].toLowerCase()
        if (vCode !== languageFilter.toLowerCase()) return false
      }

      // Country & Name Search
      if (countrySearch.trim()) {
        const q = normalizeVoiceSearch(countrySearch)
        const matchCountry = normalizeVoiceSearch(v.countryName).includes(q)
        const matchCode = normalizeVoiceSearch(v.countryCode).includes(q)
        const matchName = normalizeVoiceSearch(v.name).includes(q)
        const matchLang = normalizeVoiceSearch(v.lang).includes(q)
        if (!matchCountry && !matchCode && !matchName && !matchLang) return false
      }

      return true
    })
  }, [studioVoices, voiceTypeFilter, languageFilter, countrySearch])
  const quickCountries = [
    { label: '🇪🇸 España', q: 'España' },
    { label: '🇲🇽 México', q: 'México' },
    { label: '🇦🇷 Argentina', q: 'Argentina' },
    { label: '🇨🇴 Colombia', q: 'Colombia' },
    { label: '🇨🇱 Chile', q: 'Chile' },
    { label: '🇺🇸 EE.UU.', q: 'Estados Unidos' },
  ].filter(country => studioVoices.some(voice =>
    voice.countryName.toLocaleLowerCase().includes(country.q.toLocaleLowerCase()),
  ))

  // Quick preview of a specific voice directly from list
  const handlePreviewSpecificVoice = async (voice: AppVoice, voiceNameOverride?: string) => {
    if (!isOnline && voice.isOnlineOnly) return
    if (isPreviewActiveRef.current) stopVoicePreview()
    const activeRunId = ++previewRunIdRef.current
    setSelectedBaseVoiceURI(voice.voiceURI)
    setSelectedVoiceEngine(voice.engine)
    previewTextRef.current = buildPreviewText(voiceNameOverride || voiceName)
    previewBasePlaybackRef.current = {
      pitch: liveAcoustic.pitchModifier,
      rate: liveAcoustic.rateModifier,
    }
    isPreviewActiveRef.current = true
    setIsPlayingPreview(true)

    const presetObj: VoicePreset = {
      ...currentVoiceDraft,
      name: voiceNameOverride || voiceName,
      baseVoiceURI: voice.voiceURI,
      voiceURI: voice.voiceURI,
      voiceEngine: voice.engine,
    }

    audioEngine.buildEQChain(eqNodes, formant)
    audioEngine.setVoiceEffects(presetObj)
    const speechText = buildPreviewText(voiceNameOverride || voiceName)
    isPreviewActiveRef.current = true
    isLocalPcmPreviewRef.current = false
    setIsPlayingPreview(true)
    setPreviewError(null)
    setPreviewProgress(null)

    await speakText(
      speechText,
      presetObj,
      cloudProvider,
      apiKeys[cloudProvider] ?? '',
      undefined,
      undefined,
      () => {
        if (activeRunId !== previewRunIdRef.current) return
        isPreviewActiveRef.current = false
        setIsPlayingPreview(false)
      },
      (err) => {
        if (activeRunId !== previewRunIdRef.current) return
        console.warn('Voice preview error:', err)
        isPreviewActiveRef.current = false
        setIsPlayingPreview(false)
      }
    )
  }

  const handleSelectVoice = (voice: AppVoice) => {
    if (!isOnline && voice.isOnlineOnly) return
    setSelectedBaseVoiceURI(voice.voiceURI)
    setSelectedVoiceEngine(voice.engine)
  }

  const stopVoicePreview = () => {
    if (!isPreviewActiveRef.current) return
    previewRunIdRef.current++
    const source = localPreviewSourceRef.current
    if (source) {
      source.onended = null
      source.stop()
      source.disconnect()
      audioEngine.clearActiveSource(source)
      localPreviewSourceRef.current = null
    }
    if (isLocalPcmPreviewRef.current) cancelLocalPcmVoiceSynthesis()
    else stopSpeaking()
    isLocalPcmPreviewRef.current = false
    isPreviewActiveRef.current = false
    setIsPlayingPreview(false)
    setPreviewProgress(null)
  }

  // Preview Voice with Intelligent Introduction
  const handlePreviewVoice = async () => {
    if (isPlayingPreview) {
      stopVoicePreview()
      return
    }

    previewTextRef.current = buildPreviewText(voiceName)
    const activeRunId = ++previewRunIdRef.current
    previewBasePlaybackRef.current = {
      pitch: liveAcoustic.pitchModifier,
      rate: liveAcoustic.rateModifier,
    }
    isPreviewActiveRef.current = true
    setIsPlayingPreview(true)
    setPreviewError(null)
    setPreviewProgress(null)

    const presetObj = currentVoiceDraft

    audioEngine.buildEQChain(eqNodes, formant)
    audioEngine.setVoiceEffects(presetObj)
    const speechText = buildPreviewText(voiceName)

    if (!Capacitor.isNativePlatform()) {
      isLocalPcmPreviewRef.current = true
      setPreviewProgress({ url: 'tts://loading', loaded: 0, total: 0 })
      try {
        await pauseSpeaking()
        if (activeRunId !== previewRunIdRef.current) return
        const wav = await synthesizeLocalPcmVoice(
          speechText,
          localPcmVoiceId,
          progress => setPreviewProgress(progress),
        )
        if (activeRunId !== previewRunIdRef.current) return
        const context = audioEngine.getContext()
        if (context.state === 'suspended') await context.resume()
        if (activeRunId !== previewRunIdRef.current) return
        const audioBuffer = await context.decodeAudioData(wav.slice(0))
        if (activeRunId !== previewRunIdRef.current) return
        const input = audioEngine.getInputNode()
        if (!input) throw new Error('La cadena de filtros de voz no está disponible.')
        const source = context.createBufferSource()
        source.buffer = audioBuffer
        source.connect(input)
        const startAcoustic = liveAcousticRef.current
        const sourceRate = Math.max(0.5, Math.min(2, startAcoustic.pitchModifier * startAcoustic.rateModifier))
        source.playbackRate.setValueAtTime(sourceRate, context.currentTime)
        source.onended = () => {
          source.disconnect()
          audioEngine.clearActiveSource(source)
          if (localPreviewSourceRef.current === source) localPreviewSourceRef.current = null
          if (activeRunId === previewRunIdRef.current) {
            isLocalPcmPreviewRef.current = false
            isPreviewActiveRef.current = false
            setIsPlayingPreview(false)
            setPreviewProgress(null)
          }
        }
        localPreviewSourceRef.current = source
        audioEngine.setActiveSourcePlayback(source, sourceRate)
        previewBasePlaybackRef.current = {
          pitch: startAcoustic.pitchModifier,
          rate: startAcoustic.rateModifier,
        }
        source.start()
        setPreviewProgress(null)
      } catch (error) {
        if (activeRunId !== previewRunIdRef.current) return
        isLocalPcmPreviewRef.current = false
        isPreviewActiveRef.current = false
        setIsPlayingPreview(false)
        setPreviewProgress(null)
        const message = error instanceof Error ? error.message : String(error)
        console.error('[VoxLector] Falló la síntesis local de la voz de prueba:', error)
        setPreviewError(`No se pudo generar la muestra PCM local: ${message}`)
      }
      return
    }

    isLocalPcmPreviewRef.current = false
    await speakText(
      speechText,
      presetObj,
      cloudProvider,
      apiKeys[cloudProvider] ?? '',
      undefined,
      undefined,
      () => {
        if (activeRunId !== previewRunIdRef.current) return
        isPreviewActiveRef.current = false
        setIsPlayingPreview(false)
      },
      (err) => {
        if (activeRunId !== previewRunIdRef.current) return
        console.warn('Preview error:', err)
        isPreviewActiveRef.current = false
        setIsPlayingPreview(false)
      }
    )
  }

  const handleClose = async () => {
    stopVoicePreview()
    if (existingVoice) {
      const selectedSystemVoice = deviceVoices.find(voice =>
        voice.voiceURI === selectedBaseVoiceURI && voice.engine === selectedVoiceEngine,
      )
      const spectralMesh = Array.from({ length: 17 }, (_, index) =>
        eqNodes.find(node => node.id === index)?.gain ?? 0,
      ) as SpectralMesh
      try {
        await saveProfile(existingVoice.id, {
          name: voiceName.trim() || existingVoice.name,
          baseVoiceURI: selectedBaseVoiceURI,
          voiceURI: selectedBaseVoiceURI,
          voiceEngine: selectedVoiceEngine,
          lang: selectedSystemVoice?.lang ?? existingVoice.lang,
          eqNodes: eqNodes.map(node => ({ ...node })),
          pitch, rate, volume, formant, resonance, breathiness, warmth,
          harmonics, modulation, modulationRate, tremolo, chorus, reverb, clarity,
          roughness, localPcmVoiceId,
        }, { voiceURI: selectedBaseVoiceURI, spectralMesh, pitch, rate, volume })
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'No se pudo guardar el perfil de voz.')
        return
      }
    }
    onClose()
  }

  // Save Voice with custom naming
  const handleSaveVoice = async () => {
    const finalName = voiceName.trim() || (existingVoice ? existingVoice.name : 'nueva voz esculpida')
    const selectedSystemVoice = deviceVoices.find(voice =>
      voice.voiceURI === selectedBaseVoiceURI && voice.engine === selectedVoiceEngine,
    )
    if (!selectedBaseVoiceURI || !selectedSystemVoice) {
      setSaveError('Selecciona una voz instalada para guardar su URI exacta.')
      return
    }
    const meshValues = Array.from({ length: 17 }, (_, index) =>
      eqNodes.find(node => node.id === index)?.gain ?? Number.NaN,
    )
    if (meshValues.some(value => !Number.isFinite(value))) {
      setSaveError('No se puede guardar: la malla debe tener exactamente 17 valores válidos.')
      return
    }
    const previewSnapshot = {
      voiceURI: selectedBaseVoiceURI,
      spectralMesh: meshValues as SpectralMesh,
      pitch,
      rate,
      volume,
    }
    setSaveError(null)

    let targetVoiceId = voiceToEditId
    try {
      if (!targetVoiceId) targetVoiceId = createVoice(finalName).id
      await saveProfile(targetVoiceId, {
        name: finalName,
        baseVoiceURI: selectedBaseVoiceURI,
        voiceURI: selectedBaseVoiceURI,
        voiceEngine: selectedVoiceEngine,
        lang: selectedSystemVoice.lang,
        pitch,
        rate,
        volume,
        eqNodes,
        formant,
        resonance,
        breathiness,
        warmth,
        harmonics,
        modulation,
        modulationRate,
        tremolo,
        chorus,
        reverb,
        clarity,
        roughness,
        localPcmVoiceId,
        assignedCharacter: initialCharacter || existingVoice?.assignedCharacter || null,
        isCustom: targetVoiceId !== 'narrator_default',
      }, previewSnapshot)
      stopVoicePreview()
      if (onVoiceSaved) await onVoiceSaved(targetVoiceId)
      onClose()
    } catch (error) {
      console.error('[VoxLector] No se pudo persistir el perfil de voz:', error)
      setSaveError(error instanceof Error ? error.message : 'No se pudo guardar el perfil de voz.')
    }
  }

  return (
    <div
      className="modal-overlay animate-fade-in-up"
      onClick={handleClose}
    >
      <div
        className="modal-container glass-card p-4 sm:p-6 rounded-3xl border shadow-2xl flex flex-col gap-5"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2.5">
            <span className="material-icons-round text-2xl text-[var(--accent)]">
              graphic_eq
            </span>
            <div>
              <h2 className="text-lg font-bold">
                {existingVoice ? `Editar Voz: ${existingVoice.name}` : 'Estudio de Escultura de Voz'}
              </h2>
              <span className="text-[0.68rem] text-[var(--text-secondary)]">
                Malla Espectral de 17 Nodos · Transformación acústica real y síntesis de voz
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--bg-input)] hover:bg-[var(--danger)] hover:text-white transition-colors"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>

        {/* Name & Base Device Voice Selection with Country & Language Search */}
        <div className="flex flex-col gap-3">
          <label className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3">
            <span className="min-w-0">
              <span className="block text-xs font-bold text-[var(--text-primary)]">Usar Voces HD en Línea</span>
              <span className="mt-1 block text-[0.68rem] text-[var(--text-secondary)]">
                {useOnlineHDVoice && isOnline && ['openai', 'elevenlabs', 'google'].includes(cloudProvider) && apiKeys[cloudProvider]
                  ? `Se prioriza la voz online del sistema seleccionada; si el perfil no tiene una, se usa ${cloudProvider}. La malla espectral del perfil sigue activa.`
                  : 'Prioriza una voz online compatible del sistema, sin API. Si no hay conexión o una voz compatible, usa TTS local.'}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={useOnlineHDVoice}
              onChange={event => setUseOnlineHDVoice(event.target.checked)}
              aria-label="Usar Voces HD en Línea"
              className="h-5 w-9 shrink-0 cursor-pointer accent-[var(--accent)]"
            />
          </label>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
              Nombre Personalizado de la Voz:
            </label>
            <input
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="Ej: Narrador Solemne, Rey Oscuro..."
              className="w-full p-2.5 rounded-xl text-xs font-bold bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
            />
          </div>

          {/* Voice Selector Header with Online Status */}
          <div className="p-3.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-base text-[var(--accent)]">record_voice_over</span>
                <span className="text-xs font-bold text-white">
                  Motor TTS procesable ({studioVoices.length} voces disponibles)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    isOnline
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {isOnline ? '🟢 En línea (Voces Online activas)' : '⚡ Modo 100% Offline'}
                </span>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setDeviceVoices(await getSystemVoices(true))
                    } catch (error) {
                      console.error('[VoxLector TTS] No se pudo actualizar el catálogo de voces:', error)
                    }
                  }}
                  className="text-[0.65rem] font-semibold text-[var(--text-secondary)] hover:text-white flex items-center gap-1 bg-[var(--bg-card)] px-2 py-1 rounded-lg border border-[var(--border-color)]"
                  title="Volver a consultar las voces disponibles en el navegador y el sistema"
                >
                  <span className="material-icons-round text-xs">refresh</span>
                  Actualizar voces
                </button>

                <button
                  type="button"
                  onClick={openTtsInstall}
                  className="text-[0.65rem] font-semibold text-[var(--accent)] hover:underline flex items-center gap-1 bg-[var(--bg-card)] px-2 py-1 rounded-lg border border-[var(--border-color)]"
                  title="Abrir ajustes de síntesis de voz en Android para descargar paquetes de voz sin conexión"
                >
                  <span className="material-icons-round text-xs">settings_applications</span>
                  Ajustes TTS Android
                </button>
              </div>
            </div>

            <p className="text-[0.68rem] text-[var(--text-secondary)]">
              “Probar” comprueba la voz instalada sin efectos. “Probar presentación” aplica los controles en vivo mediante PCM. En Android solo se muestran voces del motor nativo, porque las voces exclusivas del navegador no permiten procesar el audio.
            </p>

            {/* Filter Tabs & Search Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              {/* Type Filter Tabs (Offline vs Online) */}
              <div className="sm:col-span-5 flex rounded-xl bg-[var(--bg-card)] p-0.5 border border-[var(--border-color)]">
                {[
                  { id: 'all', label: `Todas (${studioVoices.length})` },
                  { id: 'offline', label: `⚡ Offline (${studioVoices.filter(v => !v.isOnlineOnly).length})` },
                  { id: 'online', label: `🌐 Online (${studioVoices.filter(v => v.isOnlineOnly).length})` },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setVoiceTypeFilter(t.id as any)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-[0.68rem] font-bold transition-all text-center ${
                      voiceTypeFilter === t.id
                        ? 'bg-[var(--accent)] text-white shadow'
                        : 'text-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Language Selector */}
              <div className="sm:col-span-3">
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className="w-full p-1.5 rounded-xl text-xs font-semibold bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
                >
                  <option value="all">🌍 Todos los idiomas</option>
                  {availableLanguages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} ({l.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Country & Name Search Input */}
              <div className="sm:col-span-4 relative">
                <input
                  type="text"
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  placeholder="🔍 Buscar país (ej. México, España, Colombia...)"
                  className="w-full p-1.5 pl-7 rounded-xl text-xs bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
                />
                <span className="material-icons-round text-xs absolute left-2 top-2 text-[var(--text-muted)] pointer-events-none">
                  search
                </span>
                {countrySearch && (
                  <button
                    type="button"
                    onClick={() => setCountrySearch('')}
                    className="absolute right-2 top-1.5 text-xs text-[var(--text-muted)] hover:text-white"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Quick Country Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem]">
              <span className="text-[var(--text-muted)] font-medium">Países rápidos:</span>
              {quickCountries.map(c => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setCountrySearch(countrySearch === c.q ? '' : c.q)}
                  className={`px-2 py-0.5 rounded-md font-semibold border transition-all ${
                    countrySearch === c.q
                      ? 'bg-[var(--accent)] text-white border-transparent'
                      : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Scrollable Voices List */}
            <div className="max-h-44 overflow-y-auto pr-1 flex flex-col gap-1.5 border-t pt-2 border-[var(--border-color)]">
              {filteredVoices.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--text-secondary)] flex flex-col items-center gap-1">
                  <span className="material-icons-round text-xl text-[var(--text-muted)]">filter_alt_off</span>
                  <span>No se encontraron voces con los filtros seleccionados.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setVoiceTypeFilter('all')
                      setLanguageFilter('all')
                      setCountrySearch('')
                    }}
                    className="mt-1 text-xs text-[var(--accent)] hover:underline font-bold"
                  >
                    Restablecer filtros
                  </button>
                </div>
              ) : (
                filteredVoices.map(v => {
                  const isSelected = selectedBaseVoiceURI === v.voiceURI && selectedVoiceEngine === v.engine
                  const cannotUseOnline = !isOnline && v.isOnlineOnly

                  return (
                    <div
                      key={`${v.engine}:${v.voiceURI}`}
                      onClick={() => handleSelectVoice(v)}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs transition-all border cursor-pointer ${
                        isSelected
                          ? 'border-[var(--accent)] bg-[var(--accent)]/15 shadow-sm ring-1 ring-[var(--accent)]'
                          : cannotUseOnline
                          ? 'opacity-50 border-transparent bg-[var(--bg-card)] cursor-not-allowed'
                          : 'border-transparent bg-[var(--bg-card)] hover:border-[var(--border-color)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-base select-none">{v.flag}</span>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white truncate text-xs">
                              {v.countryName} · {v.lang}
                            </span>
                            <span
                              className={`text-[0.6rem] font-bold px-1.5 py-0.2 rounded ${
                                v.isOnlineOnly
                                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}
                            >
                              {v.isOnlineOnly ? '🌐 Online' : '⚡ Offline'}
                            </span>
                                    {/microsoft/iu.test(`${v.name} ${v.voiceURI}`) && (
                                      <span className="text-[0.6rem] font-bold px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                        Microsoft
                                      </span>
                                    )}
                                    <span className="text-[0.6rem] text-[var(--text-muted)]">
                                      {v.engine === 'web' ? 'Navegador' : 'Nativo'}
                                    </span>
                            <span
                              className="rounded bg-[var(--bg-input)] px-1 text-[0.6rem] font-bold text-[var(--text-secondary)]"
                              title={getVoiceGenderMarker(v.name) === '?'
                                ? 'Género no identificable a partir del nombre de esta voz'
                                : 'Género inferido a partir del nombre de esta voz'}
                            >
                              {getVoiceGenderMarker(v.name)}
                            </span>
                          </div>
                          <span className="text-[0.65rem] text-[var(--text-secondary)] truncate font-mono">
                            {v.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {cannotUseOnline ? (
                          <span className="text-[0.6rem] text-amber-400 font-semibold">
                            Requiere internet
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handlePreviewSpecificVoice(v, `${voiceName} (${v.countryName})`)
                            }}
                            className="px-2 py-1 rounded-lg text-[0.65rem] font-bold bg-[var(--bg-input)] hover:bg-[var(--accent)] text-white transition-colors flex items-center gap-1 border border-[var(--border-color)]"
                            title="Probar esta voz"
                          >
                            <span className="material-icons-round text-xs">play_arrow</span>
                            Probar
                          </button>
                        )}

                        {isSelected && (
                          <span className="material-icons-round text-base text-[var(--accent)]">
                            check_circle
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {!Capacitor.isNativePlatform() && (
          <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3">
            <label htmlFor="local-pcm-preview-voice" className="text-xs font-bold text-[var(--text-primary)]">
              Voz base de la muestra transformada (motor local PCM)
            </label>
            <select
              id="local-pcm-preview-voice"
              value={localPcmVoiceId}
              disabled={isPlayingPreview}
              onChange={event => setLocalPcmVoiceId(event.currentTarget.value)}
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2 text-xs text-[var(--text-primary)] outline-none disabled:opacity-60"
            >
              {LOCAL_PCM_VOICE_OPTIONS.map(voice => (
                <option key={voice.id} value={voice.id}>{voice.label}</option>
              ))}
            </select>
            <span className="text-[0.68rem] text-[var(--text-secondary)]">
              En navegador la muestra usa esta voz española local, no captura la salida de la voz del sistema. El modelo se descarga una vez y queda en caché; después, la malla y los efectos DSP se aplican en vivo sin reiniciar la presentación.
            </span>
            {previewProgress && (
              <div role="status" aria-live="polite" className="flex flex-col gap-1">
                <span className="text-[0.68rem] text-[var(--accent)]">
                  {previewProgress.url === 'tts://loading'
                    ? 'Preparando el motor local…'
                    : previewProgress.url === 'tts://inference-progress'
                      ? 'Generando audio PCM…'
                      : previewProgress.total > 0
                        ? `Descargando modelo local… ${Math.min(100, Math.round(previewProgress.loaded / previewProgress.total * 100))}%`
                        : 'Descargando el modelo local…'}
                </span>
                {previewProgress.url !== 'tts://inference-progress' && previewProgress.total > 0 && (
                  <progress
                    className="w-full accent-[var(--accent)]"
                    max={previewProgress.total}
                    value={Math.min(previewProgress.loaded, previewProgress.total)}
                    aria-label="Descarga del modelo de voz local"
                  />
                )}
              </div>
            )}
            {previewError && (
              <p role="alert" className="text-[0.68rem] font-semibold text-[var(--danger)]">
                {previewError}
              </p>
            )}
          </div>
        )}

        {/* ─── 17-Node Interactive Mesh Canvas ─── */}
        <div className="flex flex-col gap-1.5 p-3 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5 text-[var(--accent)]">
              <span className="material-icons-round text-base">blur_on</span>
              Malla Espectral Multimodal (17 Nodos Paramétricos)
            </span>
            <div className="flex items-center gap-3 text-[0.68rem] font-mono text-[var(--text-muted)]">
              <span>Tono Efectivo: <b className="text-[var(--accent)]">{liveAcoustic.pitchModifier.toFixed(2)}×</b></span>
              <span>Cadencia: <b className="text-[var(--accent)]">{liveAcoustic.rateModifier.toFixed(2)}×</b></span>
            </div>
          </div>

          <div className="w-full relative rounded-xl overflow-hidden border border-[var(--border-color)]">
            <canvas
              ref={canvasRef}
              width={800}
              height={220}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="eq-canvas w-full h-44 sm:h-52 touch-none cursor-pointer"
            />
          </div>
          <span className="text-[0.68rem] text-[var(--text-secondary)] text-center">
            Arrastra los nodos para cambiar frecuencia y ganancia. La malla modifica el audio PCM activo sin reiniciar la presentación.
          </span>
          {activeNodeIndex !== null && eqNodes[activeNodeIndex] && (
            <label className="flex flex-col gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <span className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
                <span>{eqNodes[activeNodeIndex].label} · Factor Q</span>
                <span className="font-mono text-[var(--accent)]">{eqNodes[activeNodeIndex].q.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={eqNodes[activeNodeIndex].q}
                onChange={event => {
                  const q = Number(event.currentTarget.value)
                  const next = eqNodes.map((node, index) =>
                    index === activeNodeIndex ? { ...node, q } : node)
                  setEqNodes(next)
                  applyLivePreviewDraft({ eqNodes: next })
                }}
                className="styled-range w-full"
                aria-label="Factor Q del nodo seleccionado"
              />
            </label>
          )}
        </div>

        {/* Preset Chips */}
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] block mb-1.5">
            Presets Profesionales
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'hero', name: '🦸 Héroe Grave' },
              { id: 'villain', name: '🧛 Villano Oscuro' },
              { id: 'fairy', name: '🧚 Hada Aguda' },
              { id: 'elder', name: '👴 Anciano Sabio' },
              { id: 'child', name: '👶 Niño' },
              { id: 'robot', name: '🤖 Robot Sintético' },
              { id: 'whisper', name: '🤫 Susurro Íntimo' },
              { id: 'narrator', name: '📖 Narrador Neutro' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyPreset(p.id)}
                className={`chip-btn ${selectedPreset === p.id ? 'active' : ''}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Spacious voice controls popover */}
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)]">
          <button
            type="button"
            aria-expanded={showVoiceControls}
            onClick={() => setShowVoiceControls(value => !value)}
            className="flex w-full min-h-14 items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
                <span className="material-icons-round">tune</span>
              </span>
              <span>
                <span className="block text-sm font-bold text-[var(--text-primary)]">Ajustes detallados de voz</span>
                <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                  Tono {pitch.toFixed(2)}× · Velocidad {rate.toFixed(2)}× · Timbre {formant > 0 ? '+' : ''}{formant} st
                </span>
              </span>
            </span>
            <span className={`material-icons-round text-[var(--accent)] transition-transform ${showVoiceControls ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>

          {showVoiceControls && (
            <div className="grid max-h-[52vh] grid-cols-1 gap-4 overflow-y-auto border-t border-[var(--border-color)] p-4 sm:grid-cols-2">
              {[
                { label: 'Tono base', key: 'pitch', value: pitch, min: 0.3, max: 2.5, step: 0.05, display: `${pitch.toFixed(2)}×`, set: setPitch },
                { label: 'Velocidad', key: 'rate', value: rate, min: 0.3, max: 3, step: 0.1, display: `${rate.toFixed(2)}×`, set: setRate },
                { label: 'Volumen', key: 'volume', value: volume, min: 0, max: 1, step: 0.02, display: `${Math.round(volume * 100)}%`, set: setVolume },
                { label: 'Formante / Timbre', key: 'formant', value: formant, min: -12, max: 12, step: 1, display: `${formant > 0 ? '+' : ''}${formant} st`, set: setFormant },
                { label: 'Resonancia', key: 'resonance', value: resonance, min: 0.1, max: 5, step: 0.05, display: resonance.toFixed(2), set: setResonance },
                { label: 'Aire / Susurro', key: 'breathiness', value: breathiness, min: 0, max: 1, step: 0.05, display: breathiness.toFixed(2), set: setBreathiness },
                { label: 'Calidez', key: 'warmth', value: warmth, min: 0, max: 1, step: 0.05, display: warmth.toFixed(2), set: setWarmth },
                { label: 'Armónicos', key: 'harmonics', value: harmonics, min: 0, max: 1, step: 0.05, display: harmonics.toFixed(2), set: setHarmonics },
                { label: 'Profundidad de modulación', key: 'modulation', value: modulation, min: 0, max: 1, step: 0.02, display: modulation.toFixed(2), set: setModulation },
                { label: 'Frecuencia de modulación', key: 'modulationRate', value: modulationRate, min: 0.1, max: 10, step: 0.1, display: `${modulationRate.toFixed(1)} Hz`, set: setModulationRate },
                { label: 'Trémolo', key: 'tremolo', value: tremolo, min: 0, max: 1, step: 0.02, display: tremolo.toFixed(2), set: setTremolo },
                { label: 'Coro', key: 'chorus', value: chorus, min: 0, max: 1, step: 0.02, display: chorus.toFixed(2), set: setChorus },
                { label: 'Reverberación', key: 'reverb', value: reverb, min: 0, max: 1, step: 0.02, display: reverb.toFixed(2), set: setReverb },
                { label: 'Claridad', key: 'clarity', value: clarity, min: 0, max: 1, step: 0.02, display: clarity.toFixed(2), set: setClarity },
                { label: 'Rugosidad armónica', key: 'roughness', value: roughness, min: 0, max: 1, step: 0.02, display: roughness.toFixed(2), set: setRoughness },
              ].map(control => (
                <label key={control.label} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                  <span className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    {control.label}
                    <span className="rounded-lg bg-[var(--accent)]/10 px-2 py-1 font-mono text-xs text-[var(--accent)]">
                      {control.display}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={control.value}
                    onInput={event => {
                      const value = Number(event.currentTarget.value)
                      control.set(value)
                      applyLivePreviewDraft({ [control.key]: value })
                    }}
                    onChange={event => {
                      const value = Number(event.currentTarget.value)
                      control.set(value)
                      applyLivePreviewDraft({ [control.key]: value })
                    }}
                    className="styled-range w-full"
                    aria-label={control.label}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[var(--border-color)]">
          <button
            type="button"
            onClick={handlePreviewVoice}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all"
            style={{
              background: isPlayingPreview ? 'var(--danger)' : 'var(--bg-input)',
              borderColor: isPlayingPreview ? 'var(--danger)' : 'var(--accent)',
              color: isPlayingPreview ? '#fff' : 'var(--accent)',
            }}
          >
            <span className="material-icons-round text-base">
              {isPlayingPreview ? 'stop' : 'record_voice_over'}
            </span>
            {isPlayingPreview ? 'Detener Presentación' : 'Probar Presentación Elegante'}
          </button>

          {saveError && (
            <p role="alert" className="w-full text-right text-xs font-semibold text-[var(--danger)]">
              {saveError}
            </p>
          )}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => void handleClose()}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--bg-input)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSaveVoice()}
              disabled={!selectedBaseVoiceURI || !studioVoices.some(voice =>
                voice.voiceURI === selectedBaseVoiceURI && voice.engine === selectedVoiceEngine,
              )}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              }}
            >
              <span className="material-icons-round text-base">save</span>
              {existingVoice ? 'Guardar Cambios de Voz' : 'Guardar Nueva Voz'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
