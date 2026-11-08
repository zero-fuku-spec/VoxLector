import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeAudioSynthesisPlugin {
  synthesize(options: {
    text: string
    lang: string
    rate: number
    pitch: number
    volume: number
    voiceName?: string
  }): Promise<{ audioBase64: string; mimeType: string }>
  stop(): Promise<void>
}

const NativeAudioSynthesis = registerPlugin<NativeAudioSynthesisPlugin>('NativeAudioSynthesis')

export interface SynthesizedNativeAudio {
  audio: ArrayBuffer
  mimeType: string
}

export async function synthesizeNativeAudio(options: {
  text: string
  lang: string
  rate: number
  pitch: number
  voiceName?: string
}): Promise<SynthesizedNativeAudio> {
  if (Capacitor.getPlatform() !== 'android') {
    throw new Error('La síntesis nativa a buffer solo está disponible en Android.')
  }
  const result = await NativeAudioSynthesis.synthesize({ ...options, volume: 1 })
  const binary = atob(result.audioBase64)
  const audio = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    audio[index] = binary.charCodeAt(index)
  }
  return { audio: audio.buffer, mimeType: result.mimeType }
}

export async function stopNativeAudioSynthesis(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    await NativeAudioSynthesis.stop()
  }
}
