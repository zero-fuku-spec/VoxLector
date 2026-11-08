import type { DialogueSegment, VocalAction } from './tts/audioScriptTypes'

export interface ProsodyAnalysis {
  text: string
  emotion?: string
  action?: VocalAction
  speakerName?: string
  isQuestion: boolean
}

export interface ProsodySequenceOptions {
  streamId: string
  sentenceIndex: number
  reset?: boolean
}

const STAGE_CUE = /\((?<round>[^()\r\n]*)\)|\[(?<square>[^\[\]\r\n]*)\]|\*(?<asterisk>[^*\r\n]+)\*/gu
const SPEAKER_PREFIX = /^\s*(?<speaker>[\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+(?:(?:de|del|la|las|los|y)\s+)?[\p{Lu}][\p{L}\p{M}'’.-]*){0,3})\s*:\s*/u
const ATTRIBUTION_SUFFIX = /\s*[—–-]?\s*(?:dijo|preguntó|pregunto|respondió|respondio|contestó|contesto|exclamó|exclamo|gritó|grito|susurró|susurro|murmuró|murmuro|replicó|replico|said|asked|replied|answered|shouted|whispered)\s+(?<speaker>[\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+(?:(?:de|del|la|las|los|y)\s+)?[\p{Lu}][\p{L}\p{M}'’.-]*){0,3})(?:\s+(?<cue>[\p{L}\p{M}\s,'’-]+))?\s*[.!?…]*\s*$/iu
const TRAILING_CUE = /\s+(?<cue>(?:voz\s+)?(?:muy\s+)?(?:temblorosa|tembloroso|jadeando(?:\s+de\s+(?:cansancio|agotamiento))?|cansada|cansado|agotada|agotado|sollozando|llorando|suspirando|resoplando|gimiendo|enojada|enojado|triste|alegre|susurrando))\s*$/iu
const BREATH_WORD_INTERVAL = 22

function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('es')
}

function countWords(text: string): number {
  return text.match(/\S+/gu)?.length ?? 0
}

function emotionFromCue(value: string): { emotion?: string; action?: VocalAction } {
  const cue = fold(value)
  if (/\b(?:sollozando|sollozo|entre sollozos|voz entrecortada y llanto)\b/u.test(cue)) {
    return { emotion: 'sollozando', action: 'sob' }
  }
  if (/\b(?:llorando|llanto)\b/u.test(cue)) {
    return { emotion: 'sollozando', action: 'cry' }
  }
  if (/\b(?:jadeando|jadeaba|jadeo|jadear|boqueando|sin aliento|agotad[oa]s?|cansad[oa]s?|respirando con dificultad|panting)\b/u.test(cue)) {
    return { emotion: 'jadeando', action: 'pant' }
  }
  if (/\b(?:suspirando|suspiro|suspira|exhalando|exhala)\b/u.test(cue)) {
    return { emotion: 'suspiro', action: 'sigh' }
  }
  if (/\b(?:resoplando|resoplido|resopla|bufando|bufido|snorting)\b/u.test(cue)) {
    return { emotion: 'resoplando', action: 'snort' }
  }
  if (/\b(?:gemido|gimiendo|gime|quejido|quejandose|dolor|de dolor|dolorido)\b/u.test(cue)) {
    return { emotion: 'dolor', action: 'groan' }
  }
  if (/\b(?:jadeando de cansancio|sin aliento|agotad[oa]s?|cansad[oa]s?)\b/u.test(cue)) {
    return { emotion: 'jadeando', action: 'pant' }
  }
  if (/\b(?:riendo|reirse|risa|carcajad|ja,\s*ja)\b/u.test(cue)) {
    return { emotion: 'riendo', action: 'laugh' }
  }
  if (/\b(?:gemido|gimiendo|gime|quejido|quejandose)\b/u.test(cue)) {
    return { emotion: 'dolor', action: 'gasp' }
  }
  if (/\b(?:enojad[oa]|enfadad[oa]|furios[oa]|con rabia)\b/u.test(cue)) return { emotion: 'enojado' }
  if (/\b(?:triste|lloroso|melancolic[oa])\b/u.test(cue)) return { emotion: 'triste' }
  if (/\b(?:tembloros[oa]|voz temblorosa|nervios[oa]|ansios[oa])\b/u.test(cue)) return { emotion: 'nervioso' }
  if (/\b(?:susurrando|susurro|en voz baja|voz baja)\b/u.test(cue)) return { emotion: 'susurro' }
  if (/\b(?:alegre|alegria|feliz|felicidad|content[oa]s?|entusiasmado|entusiasmada|animad[oa]s?)\b/u.test(cue)) {
    return { emotion: 'alegre' }
  }
  if (/\b(?:miedo|asustad[oa]|aterrorizad[oa])\b/u.test(cue)) return { emotion: 'miedo' }
  if (/\b(?:epic[oa]|solemne|heroic[oa])\b/u.test(cue)) return { emotion: 'épico' }
  if (/\b(?:misterios[oa]|siniestr[oa])\b/u.test(cue)) return { emotion: 'misterioso' }
  return {}
}

function isQuestion(text: string): boolean {
  if (/[¿?]/u.test(text)) return true
  return /^\s*(?:qué|quién(?:es)?|cómo|dónde|cuándo|por qué|cuál(?:es)?|cuánto(?:s|as)?|puedes|podrías|sería|hay|está|estás|quieres|sabes|recuerdas|entiendes|conoces)\b/iu.test(text)
}

function cleanSpacing(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, ' ')
    .replace(/^\s*[—–-]+\s*/u, '')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\s+([,.;:!?…])/gu, '$1')
    .replace(/([,;:])(?=\S)/gu, '$1 ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function splitAtBreathIntervals(text: string, initialWordCount: number): string[] {
  const words = [...text.matchAll(/\S+/gu)]
  if (words.length <= 1) return [text]

  const chunks: string[] = []
  let chunkStart = 0
  let wordsUntilBreath = BREATH_WORD_INTERVAL - (initialWordCount % BREATH_WORD_INTERVAL)
  let wordsInChunk = 0

  for (const word of words) {
    wordsInChunk += countWords(word[0])
    if (wordsInChunk < wordsUntilBreath) continue
    const end = (word.index ?? 0) + word[0].length
    chunks.push(text.slice(chunkStart, end).trim())
    chunkStart = end
    wordsUntilBreath = BREATH_WORD_INTERVAL
    wordsInChunk = 0
  }

  const remainder = text.slice(chunkStart).trim()
  if (remainder) chunks.push(remainder)
  return chunks.length > 0 ? chunks : [text]
}

export class ProsodyEngine {
  private streamId: string | undefined
  private lastSentenceIndex: number | undefined
  private readonly breathWordCounts = new Map<string, number>()
  private readonly activeEmotions = new Map<string, string>()

  reset(): void {
    this.streamId = undefined
    this.lastSentenceIndex = undefined
    this.breathWordCounts.clear()
    this.activeEmotions.clear()
  }

  analyze(text: string, emotion?: string, stripSpeakerLabel = false): ProsodyAnalysis {
    let cleanText = text
    const emotionCue = emotion ? emotionFromCue(emotion) : undefined
    let detectedEmotion = emotionCue?.emotion ?? emotion
    let detectedAction: VocalAction | undefined = emotionCue?.action
    let speakerName: string | undefined

    if (stripSpeakerLabel) {
      const speaker = cleanText.match(SPEAKER_PREFIX)
      if (speaker?.groups?.speaker) {
        speakerName = speaker.groups.speaker.trim()
        cleanText = cleanText.slice(speaker[0].length)
      }
    }

    const attribution = cleanText.match(ATTRIBUTION_SUFFIX)
    if (attribution?.groups?.speaker) {
      const speakerText = attribution.groups.speaker.replace(/[.!?…]+$/u, '')
      const speakerCue = speakerText.match(TRAILING_CUE)
      const rawSpeaker = speakerCue
        ? speakerText.slice(0, speakerCue.index).trim()
        : speakerText.trim()
      speakerName ??= rawSpeaker
      const cue = [attribution.groups.cue, speakerCue?.groups?.cue].filter(Boolean).join(' ')
      const mapped = emotionFromCue(cue)
      detectedEmotion = mapped.emotion ?? detectedEmotion
      detectedAction = mapped.action
      cleanText = cleanText.slice(0, attribution.index)
    }

    const cues: string[] = []
    STAGE_CUE.lastIndex = 0
    cleanText = cleanText.replace(STAGE_CUE, (_match, round: string | undefined, square: string | undefined, asterisk: string | undefined) => {
      const cue = round ?? square ?? asterisk ?? ''
      if (cue.trim()) cues.push(cue.trim())
      return ' '
    })

    const trailingCue = cleanText.match(/(?:^|[\s,;—–-])(?<cue>(?:con\s+)?(?:voz\s+)?(?:muy\s+)?(?:temblorosa|tembloroso|jadeando(?:\s+de\s+(?:cansancio|agotamiento))?|jadeaba(?:\s+de\s+(?:cansancio|agotamiento))?|sin\s+aliento|cansada|cansado|agotada|agotado|sollozando|llorando|suspirando|resoplando|gimiendo|quejándose|quejandose|enojada|enojado|triste|alegre|susurrando))\s*[,.;!?…]*\s*$/iu)
    if (trailingCue?.groups?.cue) {
      cues.push(trailingCue.groups.cue)
      cleanText = cleanText.slice(0, trailingCue.index)
    }

    for (const cue of cues) {
      const mapped = emotionFromCue(cue)
      if (mapped.emotion) detectedEmotion = mapped.emotion
      if (mapped.action) detectedAction = mapped.action
    }

    const cleaned = cleanSpacing(cleanText)
    return {
      text: cleaned,
      emotion: detectedEmotion,
      action: detectedAction,
      speakerName,
      isQuestion: isQuestion(cleaned),
    }
  }

  prepareSegments(
    segments: DialogueSegment[],
    options: ProsodySequenceOptions,
  ): DialogueSegment[] {
    const resetSequence =
      options.reset ||
      this.streamId !== options.streamId ||
      this.lastSentenceIndex === undefined ||
      options.sentenceIndex !== this.lastSentenceIndex + 1
    if (resetSequence) {
      this.breathWordCounts.clear()
      this.activeEmotions.clear()
    }
    this.streamId = options.streamId
    this.lastSentenceIndex = options.sentenceIndex

    const prepared: DialogueSegment[] = []
    for (const segment of segments) {
      const analysis = this.analyze(segment.text, segment.emotion)
      if (!analysis.text) continue

      const speakerName = segment.speakerName ?? analysis.speakerName
      const kind = analysis.speakerName ? 'dialogue' : segment.kind
      const emotion = analysis.emotion
      const speakerKey = speakerName?.toLocaleLowerCase('es') ?? 'narrator'
      const previousEmotion = this.activeEmotions.get(speakerKey)
      const emotionChanged = previousEmotion !== (emotion ?? '')
      const explicitAction = segment.action ?? this.analyze(segment.text).action
      const emotionAction = emotionChanged ? emotionFromCue(emotion ?? '')?.action : undefined
      const baseAction = explicitAction ?? emotionAction
      const action = emotion === 'jadeando' && baseAction ? 'pant' : baseAction
      const breathy = emotion === 'jadeando'
      const key = `${speakerKey}:${emotion ?? ''}`
      const previousWordCount = breathy ? this.breathWordCounts.get(key) ?? 0 : 0
      const chunks = breathy
        ? splitAtBreathIntervals(analysis.text, previousWordCount)
        : [analysis.text]
      let wordCount = previousWordCount
      let wordOffset = segment.wordOffset

      chunks.forEach((text, index) => {
        const startsBreathCycle = breathy &&
          wordCount > 0 &&
          wordCount % BREATH_WORD_INTERVAL === 0
        prepared.push({
          ...segment,
          kind,
          text,
          speakerName,
          emotion,
          action: index === 0 ? action ?? (startsBreathCycle ? 'pant' : undefined) :
            startsBreathCycle ? 'pant' : undefined,
          wordOffset,
        })
        const chunkWordCount = countWords(text)
        wordCount += chunkWordCount
        wordOffset += chunkWordCount
      })

      if (breathy) {
        this.breathWordCounts.set(key, wordCount)
      } else {
        const speakerKey = `${speakerName?.toLocaleLowerCase('es') ?? 'narrator'}:`
        for (const existingKey of this.breathWordCounts.keys()) {
          if (existingKey.startsWith(speakerKey)) this.breathWordCounts.delete(existingKey)
        }
      }
      this.activeEmotions.set(speakerKey, emotion ?? '')
    }
    return prepared
  }

  applyQuestionIntonationToSsml(ssml: string, question: boolean): string {
    if (!question) return ssml
    const closing = ssml.match(/^(?<prefix><speak>[\s\S]*?)(?<phrase>[^<>]+)(?<question>\?)(?<suffix><break time="\d+ms"\/><\/speak>)$/u)
    if (!closing?.groups) return ssml
    const phrase = closing.groups.phrase
    const words = [...phrase.matchAll(/\S+/gu)]
    const lastWord = words[Math.max(0, words.length - 3)]
    const start = lastWord?.index ?? 0
    return `${closing.groups.prefix}${phrase.slice(0, start)}<prosody pitch="+2st">${phrase.slice(start)}</prosody>${closing.groups.question}${closing.groups.suffix}`
  }
}
