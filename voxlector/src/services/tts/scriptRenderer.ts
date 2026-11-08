import type { VoicePreset } from '@/types'
import { ACTION_PROSODY, type AudioScriptInstruction, type ScriptTextInstruction } from './audioScriptTypes'

export class MissingScriptVoiceError extends Error {
  constructor(voiceId: string) {
    super(`El guion solicita el perfil de voz "${voiceId}", pero ese perfil no está cargado.`)
    this.name = 'MissingScriptVoiceError'
  }
}

export class ScriptCancelledError extends Error {
  constructor() {
    super('La ejecución del guion fue cancelada.')
    this.name = 'ScriptCancelledError'
  }
}

export interface ScriptRendererCallbacks {
  resolveVoice: (voiceId: string) => VoicePreset | undefined
  speak: (
    instruction: ScriptTextInstruction,
    voice: VoicePreset,
    onWordBoundary?: (wordIndex: number, charIndex: number) => void,
  ) => Promise<void>
  onWordBoundary?: (
    instruction: ScriptTextInstruction,
    wordIndex: number,
    charIndex: number,
  ) => void
  playSfx?: (soundId: string) => Promise<boolean>
}

export class ScriptRenderer {
  constructor(private readonly instructionPauseMs = 85) {}

  async render(
    instructions: AudioScriptInstruction[],
    callbacks: ScriptRendererCallbacks,
  ): Promise<void> {
    for (let index = 0; index < instructions.length; index++) {
      const instruction = instructions[index]
      if (instruction.type === 'SFX_INJECTION') {
        if (callbacks.playSfx) {
          await callbacks.playSfx(instruction.soundId).catch(() => false)
        }
        // A sound asset may supplement the action, but the configured voice
        // always performs its own vocalization as well.
        if (instruction.fallbackText.trim()) {
          const voice = callbacks.resolveVoice(instruction.voiceId)
          if (!voice) throw new MissingScriptVoiceError(instruction.voiceId)
          const modifier = ACTION_PROSODY[instruction.soundId]
          await callbacks.speak({
            type: 'CHARACTER_DIALOG',
            text: instruction.fallbackText,
            voiceId: instruction.voiceId,
            emotion: instruction.emotion,
            trackWords: false,
            wordOffset: instruction.wordOffset,
          }, {
            ...voice,
            rate: Math.max(0.3, Math.min(3, voice.rate * modifier.rate)),
            pitch: Math.max(0.3, Math.min(2.5, voice.pitch * modifier.pitch)),
          })
        }
      } else {
        await this.renderTextInstruction(instruction, callbacks)
      }

      if (index < instructions.length - 1 && this.instructionPauseMs > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, this.instructionPauseMs))
      }
    }
  }

  private async renderTextInstruction(
    instruction: ScriptTextInstruction,
    callbacks: ScriptRendererCallbacks,
  ): Promise<void> {
    if (!instruction.text.trim()) return
    const voice = callbacks.resolveVoice(instruction.voiceId)
    if (!voice) throw new MissingScriptVoiceError(instruction.voiceId)
    const wordBoundary = instruction.trackWords && callbacks.onWordBoundary
      ? (wordIndex: number, charIndex: number) => callbacks.onWordBoundary?.(instruction, wordIndex, charIndex)
      : undefined
    await callbacks.speak(instruction, voice, wordBoundary)
  }
}
