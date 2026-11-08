import { getCharacterId, normalizeCharName } from '@/services/characterDetector'
import type { DetectedCharacter, ReadingMode } from '@/types'
import type { AudioScriptInstruction, BuiltAudioScript, DialogueSegment, VocalAction } from './audioScriptTypes'

export interface AudioScriptBuildContext {
  readingMode: ReadingMode
  narratorVoiceId: string
  characters: DetectedCharacter[]
  voiceAssignments: Record<string, string>
  announceCharacterDialogue?: boolean
  announceCharacterName?: boolean
  announceEmotion?: boolean
  narratorAnnouncement?: string
  voiceOverride?: string
  initialWordOffset?: number
}

// Repertorio TTS: short, nonverbal vocalizations avoid inventing extra dialogue.
const ACTION_VOCALIZATION: Record<VocalAction, string> = {
  laugh: '¡Ja, ja, ja!',
  nervous_laugh: 'Je... je... ja...',
  bitter_laugh: 'Ja... ja...',
  mocking_laugh: 'Ja, ja...',
  evil_laugh: '¡Ja, ja, ja...!',
  relief_laugh: '¡Ja!',
  chuckle: 'Je, je...',
  giggle: '¡Ji, ji, ji!',
  cry: 'Ah... ah...',
  joyful_cry: '¡Ah...!',
  sob: 'H... h... ah...',
  whimper: 'M... m...',
  sigh: 'Ahhh...',
  relief_sigh: 'Ahhh...',
  gasp: '¡Ah!',
  surprise_gasp: '¡Oh! ¡Ah!',
  fear_gasp: '¡Ah...!',
  pain_gasp: '¡Ah!',
  pant: 'Hah... ah... hah...',
  exertion_pant: 'Hah... hah... uf...',
  fear_pant: 'Hah... h... hah...',
  snort: '¡Pff!',
  groan: 'Mmm... ah...',
  pain_groan: '¡Ah...! Mmm...',
  effort_groan: 'Ugh... ¡ah!',
  cough: 'Cof, cof...',
  throat_clear: 'Ejem, ejem...',
  yawn: '¡Buaaaah...!',
  sneeze: '¡Achís!',
  scream: '¡Aaaah!',
  shout: '¡Ah!',
  hum: 'Mmm...',
  click_tongue: 'Tsk...',
  wail: '¡Ahhh...! ¡No...!',
  shriek: '¡¡Aaahh!!',
  growl: 'Grrr...',
  moan: 'Mmm... aah...',
  choke: 'Kh... kh...',
  gulp: 'Glp...',
  sniff: 'Snf... snf...',
  hiccup: '¡Hip!',
  hiss: 'Sss...',
  sputter: '¡P-p...! ¡Q-qué...!',
  stammer: 'E-e-eh...',
  yelp: '¡Ay!',
}

const EMOTION_ANNOUNCEMENT: Record<string, string> = {
  triste: 'con voz triste',
  alegre: 'con voz alegre',
  nervioso: 'con voz nerviosa',
  enojado: 'con voz enojada',
  miedo: 'con voz temblorosa',
  susurro: 'en un susurro',
  sollozando: 'llorando',
  riendo: 'riendo',
  suspiro: 'suspirando',
  jadeando: 'sin aliento',
  resoplando: 'resoplando',
  épico: 'con tono épico',
  misterioso: 'con tono misterioso',
  dolor: 'con dolor',
  sorpresa: 'con sorpresa',
  tartamudeando: 'con voz entrecortada',
}

function normalizeName(name: string): string {
  return normalizeCharName(name).toLocaleLowerCase('es')
}

export class AudioScriptBuilder {
  build(segments: DialogueSegment[], context: AudioScriptBuildContext): BuiltAudioScript {
    const instructions: AudioScriptInstruction[] = []
    const unassigned = new Set<string>()
    const announcedNames = new Set<string>()
    const announcedEmotions = new Map<string, string>()
    const narratorId = context.voiceOverride ?? context.narratorVoiceId
    const initialOffset = context.initialWordOffset ?? 0

    for (const segment of segments) {
      const text = segment.text.trim()
      if (!text) continue
      const wordOffset = initialOffset + segment.wordOffset

      if (segment.kind === 'narration' || context.readingMode === 'narrator') {
        const voiceId = segment.kind === 'dialogue' && context.voiceOverride
          ? context.voiceOverride
          : narratorId
        // Problema 1: the multivoice narrator must never perform a character's emotional action.
        if (segment.action && context.readingMode === 'narrator') {
          instructions.push(this.actionInstruction(segment.action, voiceId, segment.emotion, wordOffset))
        }
        instructions.push({
          type: 'NARRATOR_TEXT',
          text,
          voiceId,
          emotion: segment.emotion,
          trackWords: segment.trackWords !== false,
          wordOffset,
        })
        continue
      }

      const speakerName = segment.speakerName
      if (!speakerName) {
        instructions.push({
          type: 'NARRATOR_TEXT',
          text,
          voiceId: narratorId,
          emotion: segment.emotion,
          trackWords: segment.trackWords !== false,
          wordOffset,
        })
        continue
      }

      const character = context.characters.find(item => normalizeName(item.name) === normalizeName(speakerName))
      const characterId = character?.characterId ?? getCharacterId(character?.name ?? speakerName)
      const assignedVoiceId = context.voiceOverride
        ?? context.voiceAssignments[characterId]
        ?? context.voiceAssignments[speakerName]
        ?? Object.entries(context.voiceAssignments).find(
          ([name]) => normalizeName(name) === normalizeName(speakerName),
        )?.[1]

      if (!assignedVoiceId) {
        unassigned.add(character?.name ?? normalizeCharName(speakerName))
        continue
      }

      if (context.announceCharacterDialogue && !context.voiceOverride) {
        const announcement = (segment.announcement ?? context.narratorAnnouncement)?.trim()
        const separator = announcement?.indexOf(':') ?? -1
        const announcedName = separator > -1
          ? announcement?.slice(0, separator).trim()
          : undefined
        const announcedEmotion = separator > -1
          ? announcement?.slice(separator + 1).trim()
          : announcement
        if (
          context.announceCharacterName !== false &&
          !announcedNames.has(characterId)
        ) {
          instructions.push({
            type: 'CHARACTER_NAME',
            text: announcedName || character?.name || normalizeCharName(speakerName),
            voiceId: context.narratorVoiceId,
            trackWords: false,
            wordOffset,
          })
          announcedNames.add(characterId)
        }
        const emotionDescription = context.announceEmotion === false
          ? undefined
          : announcedEmotion || (segment.emotion
          ? EMOTION_ANNOUNCEMENT[segment.emotion] ?? `con emoción ${segment.emotion}`
          : undefined)
        const emotionKey = emotionDescription
        if (emotionDescription && emotionKey && announcedEmotions.get(characterId) !== emotionKey) {
          instructions.push({
            type: 'EMOTION_TAG',
            text: emotionDescription,
            voiceId: context.narratorVoiceId,
            emotion: undefined,
            trackWords: false,
            wordOffset,
          })
          announcedEmotions.set(characterId, emotionKey)
        }
      }

      if (segment.action) {
        instructions.push(this.actionInstruction(segment.action, assignedVoiceId, segment.emotion, wordOffset))
      }
      instructions.push({
        type: 'CHARACTER_DIALOG',
        text,
        voiceId: assignedVoiceId,
        emotion: segment.emotion,
        trackWords: true,
        wordOffset,
      })
    }

    return { instructions, unassignedCharacters: [...unassigned] }
  }

  private actionInstruction(
    action: VocalAction,
    voiceId: string,
    emotion: string | undefined,
    wordOffset: number,
  ): AudioScriptInstruction {
    return {
      type: 'SFX_INJECTION',
      soundId: action,
      fallbackText: ACTION_VOCALIZATION[action],
      voiceId,
      emotion,
      wordOffset,
    }
  }
}
