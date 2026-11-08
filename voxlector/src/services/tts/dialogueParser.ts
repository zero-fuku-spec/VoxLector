import { isValidCharacterName, normalizeCharName } from '@/services/characterDetector'
import type { DialogueSegment, VocalAction } from './audioScriptTypes'

export interface DialogueParseOptions {
  knownCharacters?: string[]
  fallbackSpeaker?: string
  emotion?: string
  announcement?: string
  isNarration?: boolean
  resetState?: boolean
  emitAction?: boolean
}

interface EmotionCue {
  emotion?: string
  action?: VocalAction
}

// Problema 1: interpret stage directions as contextual, voice-local actions rather than generic sounds.
const SPEAKER_PREFIX = /^\s*(?<speaker>[\p{L}\p{M}][\p{L}\p{M}\p{N}'’.-]*(?:\s+(?:(?:de|del|la|las|los|y)\s+)?[\p{L}\p{M}][\p{L}\p{M}\p{N}'’.-]*){0,4})\s*:\s*(?<body>[\s\S]*)$/iu
const EDITORIAL_NOTE_LINE = /^\s*(?:(?:Nota|Comentario|Apunte|Reflexión|Reflexion)\s+de(?:l|\s+la)?\s+([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*(?:\s+[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*){0,2})|([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*(?:\s+[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*){0,2})\s+(?:dice|comenta|anota|explica))\s*:\s*(?<body>[\s\S]*)$/u
const INTERLOCUTOR_LINE = /^\s*(?:(?<codeOption>[A-ZÁÉÍÓÚÑÜ]{1,2}|Dr|Dra|Sr|Sra|Prof|Pregunta|Respuesta|Entrevistador|Entrevistada|Entrevistado|Question|Answer)(?:\.|\.-|:)\s+|(?<colonOption>[A-ZÁÉÍÓÚÑÜ]{1,2}|Dr\.|Dra\.|Sr\.|Sra\.|Prof\.|Pregunta|Respuesta|Entrevistador|Entrevistada|Entrevistado|Question|Answer):\s*)(?<body>[\s\S]*)$/u
const LEADING_DASH = /^\s*[—–-―]\s+(?<body>[\s\S]+)$/u
const QUOTED_TEXT = /[“„«"‘'](?<text>[\s\S]+?)[”»"’']/gu
const STAGE_CUE = /\((?<round>[^()\r\n]*)\)|\[(?<square>[^\[\]\r\n]*)\]|\{(?<brace>[^{}\r\n]*)\}|\*(?<asterisk>[^*\r\n]+)\*/gu
const ATTRIBUTION_SUFFIX = /(?:[,;—–-―]?\s*)(?:dijo|preguntó|pregunto|respondió|respondio|contestó|contesto|exclamó|exclamo|gritó|grito|susurró|susurro|murmuró|murmuro|replicó|replico|añadió|anadio|sollozó|sollozo|balbuceó|balbuceo|said|asked|replied|answered|shouted|whispered)\s+(?<speaker>[\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+(?:(?:de|del|la|las|los|y)\s+)?[\p{Lu}][\p{L}\p{M}'’.-]*){0,4})\s*[.!?…]*\s*$/iu

function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('es')
}

function hasLaughCue(cue: string): boolean {
  return /\b(?:riendo|reir(?:se)?|risita|risa(?:s)?|carcajad\w*|ja[,\s]+ja)\b/u.test(cue)
}

function getEmotionCue(value: string): EmotionCue | undefined {
  const cue = fold(value)
  if (hasLaughCue(cue) &&
      /\b(?:malvad|macabr|siniestr|villan)\w*/u.test(cue)) {
    return { emotion: 'misterioso', action: 'evil_laugh' }
  }
  if (hasLaughCue(cue) &&
      /\b(?:burl|mof|ridicul|despreci)\w*/u.test(cue)) {
    return { emotion: 'enojado', action: 'mocking_laugh' }
  }
  if (hasLaughCue(cue) &&
      /\b(?:triste|amarg|sarcas|iron|cinic)\w*/u.test(cue)) {
    return { emotion: 'triste', action: 'bitter_laugh' }
  }
  if (hasLaughCue(cue) &&
      /\b(?:alivio|tranquilidad|descanso|salvado|salvada)\b/u.test(cue)) {
    return { emotion: 'alegre', action: 'relief_laugh' }
  }
  if (hasLaughCue(cue) &&
      /\b(?:nervios|incomod|verg[uü]enz|timid)\w*/u.test(cue)) {
    return { emotion: 'nervioso', action: /\b(?:risita|riendo timidamente|riendo con verg[uü]enza)\b/u.test(cue) ? 'giggle' : 'nervous_laugh' }
  }
  if (/\b(?:risita|riendo suavemente|riendo entre dientes|riendo por lo bajo|sonriendo con picardia|risa contenida)\b/u.test(cue)) {
    return { emotion: 'alegre', action: 'chuckle' }
  }
  if (/\b(?:llorando|llanto|sollozando|sollozo)\b/u.test(cue) &&
      /\b(?:felicidad|alegria|emocion|alivio|alegre|feliz)\b/u.test(cue)) {
    return { emotion: 'alegre', action: 'joyful_cry' }
  }
  if (hasLaughCue(cue)) {
    return { emotion: 'riendo', action: 'laugh' }
  }
  if (/\b(?:sollozando|sollozo\w*|entre sollozos|voz entrecortada y llanto)\b/u.test(cue)) {
    return { emotion: 'sollozando', action: 'sob' }
  }
  if (/\b(?:llorando|llanto)\b/u.test(cue)) {
    return { emotion: /\b(?:rabia|enojo|frustracion)\b/u.test(cue) ? 'enojado' : 'sollozando', action: 'cry' }
  }
  if (/\b(?:suspirando|suspiro|suspira|exhalando|exhala)\b/u.test(cue)) {
    return /\b(?:alivio|tranquilidad|descanso)\b/u.test(cue)
      ? { emotion: 'suspiro', action: 'relief_sigh' }
      : { emotion: 'suspiro', action: 'sigh' }
  }
  if (/\b(?:jadeo|boqueando|inhalando|ahogo)\b/u.test(cue) &&
      /\b(?:sorpresa|asombro|sorprendid[oa]|sobresaltad[oa])\b/u.test(cue)) {
    return { emotion: 'sorpresa', action: 'surprise_gasp' }
  }
  if (/\b(?:jadeo|boqueando|inhalando|ahogo|gasping)\b/u.test(cue) &&
      /\b(?:miedo|temor|terror|panico|asustad[oa])\b/u.test(cue)) {
    return { emotion: 'miedo', action: 'fear_gasp' }
  }
  if (/\b(?:jadeo|boqueando|inhalando|ahogo)\b/u.test(cue) &&
      /\b(?:dolor|herid[oa]|golpe)\b/u.test(cue)) {
    return { emotion: 'dolor', action: 'pain_gasp' }
  }
  if (/\b(?:jadeo|boqueando|inhalando|ahogo)\b/u.test(cue) &&
      /\b(?:cansancio|agotamiento|esfuerzo|correr|corriendo|ejercicio)\b/u.test(cue)) {
    return { emotion: 'jadeando', action: 'exertion_pant' }
  }
  if (/\b(?:inhalando|ahogo|gasping|jadeo)\b/u.test(cue)) return { action: 'gasp' }
  if (/\b(?:jadeando|jadeaba|jadeo|jadear|boqueando|gasping|sin aliento|agotad[oa]s?|cansad[oa]s?|respirando con dificultad)\b/u.test(cue)) {
    if (/\b(?:miedo|temor|terror|panico|asustad[oa])\b/u.test(cue)) {
      return { emotion: 'miedo', action: 'fear_pant' }
    }
    if (/\b(?:cansancio|agotamiento|esfuerzo|correr|corriendo|ejercicio)\b/u.test(cue)) {
      return { emotion: 'jadeando', action: 'exertion_pant' }
    }
    return { emotion: 'jadeando', action: 'pant' }
  }
  if (/\b(?:gemido|gimiendo|gime|quejido|quejandose)\b/u.test(cue) &&
      /\b(?:esfuerzo|levantando|empujando|cargando|agotamiento)\b/u.test(cue)) {
    return { emotion: 'jadeando', action: 'effort_groan' }
  }
  if (/\b(?:gemido|gimiendo|gime|quejido|quejandose|dolor|adolorid[oa]s?)\b/u.test(cue)) {
    if (/\b(?:sorpresa|asombro|sorprendid[oa]|sobresaltad[oa])\b/u.test(cue)) {
      return { emotion: 'sorpresa', action: 'surprise_gasp' }
    }
    if (/\b(?:dolor|herid[oa]|lastimad[oa]|golpe)\b/u.test(cue)) {
      return { emotion: 'dolor', action: 'pain_groan' }
    }
    return { action: 'groan' }
  }
  if (/\b(?:resoplando|resoplido|resopla|bufando|snorting)\b/u.test(cue)) {
    return { emotion: 'resoplando', action: 'snort' }
  }
  if (/\b(?:sorprendid[oa]|sorpresa|asombrad[oa]|estupefact[oa]|sobresaltad[oa]|incredul[oa])\b/u.test(cue)) {
    return { emotion: 'sorpresa', action: 'surprise_gasp' }
  }
  if (/\b(?:grito|gritando|chillando|chillido|alarido|aullando|screaming)\b/u.test(cue) &&
      /\b(?:sorpresa|asombro|sorprendid[oa]|miedo|temor|terror|panico|asustad[oa])\b/u.test(cue)) {
    return { emotion: /\b(?:sorpresa|asombro|sorprendid[oa])\b/u.test(cue) ? 'sorpresa' : 'miedo', action: 'scream' }
  }
  if (/\b(?:gri(?:ta|tando)|grit[oó])\b/u.test(cue)) {
    return { emotion: 'enojado', action: 'shout' }
  }
  if (/\b(?:grito|chillando|chillido|alarido|aullando|screaming)\b/u.test(cue)) {
    return { emotion: 'miedo', action: 'scream' }
  }
  if (/\b(?:tosiendo|tos|tosio|tosi[oó])\b/u.test(cue)) return { action: 'cough' }
  if (/\b(?:aclarandose la garganta|aclarando la garganta|carraspeando|carraspeo|ejem)\b/u.test(cue)) {
    return { action: 'throat_clear' }
  }
  if (/\b(?:bostezando|bostezo|bosteza)\b/u.test(cue)) return { action: 'yawn' }
  if (/\b(?:estornudando|estornudo|estornuda|achis)\b/u.test(cue)) return { action: 'sneeze' }
  if (/\b(?:tarareando|tarareo|tararea|canturreando)\b/u.test(cue)) return { action: 'hum' }
  if (/\b(?:chasqueando la lengua|chasquido de lengua|tsk)\b/u.test(cue)) return { action: 'click_tongue' }
  if (/\b(?:lloriqueando|gimoteando|gimoteo|sollozando bajito)\b/u.test(cue)) {
    return { emotion: 'triste', action: 'whimper' }
  }
  // — New extended repertoire actions —
  if (/\b(?:aullando|aullar|lamento largo|grito desgarrador|lament[oa])\b/u.test(cue) &&
      /\b(?:llanto|dolor|desesperacion|desesperado|desesperada|pena|tristeza|angustia)\b/u.test(cue)) {
    return { emotion: 'sollozando', action: 'wail' }
  }
  if (/\b(?:aullando|grito desgarrador|lamento|lament[oa])\b/u.test(cue)) {
    return { emotion: 'sollozando', action: 'wail' }
  }
  if (/\b(?:chillando|chillido|alarido agudo|grito agudo)\b/u.test(cue) &&
      /\b(?:miedo|terror|panico|horror)\b/u.test(cue)) {
    return { emotion: 'miedo', action: 'shriek' }
  }
  if (/\b(?:grunendo|grunido|grunir|rugiendo|rugido|amenazante|amenazando)\b/u.test(cue)) {
    return { emotion: 'enojado', action: 'growl' }
  }
  if (/\b(?:atragantandose|atragantarse|ahogandose|ahogarse|sin poder hablar|voz ahogada)\b/u.test(cue)) {
    return { emotion: 'sollozando', action: 'choke' }
  }
  if (/\b(?:tragando saliva|tragando en seco|trago(?:s)? nervios[oa]?)\b/u.test(cue)) {
    return { emotion: 'nervioso', action: 'gulp' }
  }
  if (/\b(?:sorbiendo la nariz|sorbiendo|sorbiendose las lagrimas|moqueando)\b/u.test(cue)) {
    return { emotion: 'triste', action: 'sniff' }
  }
  if (/\b(?:hipando|hipo|con hipo)\b/u.test(cue)) {
    return { action: 'hiccup' }
  }
  if (/\b(?:siseando|siseo|con voz sibilante|entre dientes con rabia)\b/u.test(cue)) {
    return { emotion: 'enojado', action: 'hiss' }
  }
  if (/\b(?:farfullando|farfullar|balbuceando indignado|tartamudeando de rabia|escupiendo las palabras)\b/u.test(cue)) {
    return { emotion: 'enojado', action: 'sputter' }
  }
  if (/\b(?:rugiendo|rugido|bramido|bramando|vociferando|voz atronadora)\b/u.test(cue) &&
      /\b(?:furia|rabia|enojado|furioso)\b/u.test(cue)) {
    return { emotion: 'enojado', action: 'roar' }
  }
  if (/\b(?:gritito|grito corto|quejido agudo|ay)\b/u.test(cue) &&
      /\b(?:dolor|sorpresa)\b/u.test(cue)) {
    return { emotion: 'dolor', action: 'yelp' }
  }
  if (/\b(?:titubeando|titubeo|vacilando|vacilacion|con voz vacilante|dudando al hablar)\b/u.test(cue)) {
    return { emotion: 'nervioso', action: 'stammer' }
  }
  if (/\b(?:gemido|gimiendo|gime)\b/u.test(cue) &&
      !/\b(?:dolor|esfuerzo|herid[oa]|golpe|quejido|quejandose)\b/u.test(cue)) {
    return { emotion: 'dolor', action: 'moan' }
  }
  if (/\b(?:tartamudeando|tartamudeo|balbuceando|balbuceo|trabandose al hablar)\b/u.test(cue)) {
    return { emotion: 'tartamudeando' }
  }
  if (/\b(?:pensando|reflexionando|con incertidumbre|dudando|indecis[oa])\b/u.test(cue)) {
    return { emotion: 'nervioso' }
  }
  if (/\b(?:tartamudeando|tartamudeo|entrecortada|entrecortado|nervioso|nerviosa|ansioso|ansiosa)\b/u.test(cue)) {
    return { emotion: 'nervioso' }
  }
  if (/\b(?:triste|tristeza|melancolico|melancolica|desolado|desolada|deprimido|deprimida)\b/u.test(cue)) {
    return { emotion: 'triste' }
  }
  if (/\b(?:alegre|alegria|feliz|felicidad|content[oa]s?|satisfecho|satisfecha|entusiasmado|entusiasmada|animad[oa]s?|sonriendo)\b/u.test(cue)) {
    return { emotion: 'alegre' }
  }
  if (/\b(?:enojado|enojada|enfadado|enfadada|furioso|furiosa|furia|rabia|gritando)\b/u.test(cue)) {
    return { emotion: 'enojado' }
  }
  if (/\b(?:susurrando|susurro|en voz baja|en un susurro|quedo|queda)\b/u.test(cue)) {
    return { emotion: 'susurro' }
  }
  if (/\b(?:llorando|llanto)\b/u.test(cue)) {
    return { emotion: 'sollozando', action: 'cry' }
  }
  if (/\b(?:miedo|asustado|asustada|tembloroso|temblorosa|aterrorizado|aterrorizada)\b/u.test(cue)) {
    return { emotion: 'miedo' }
  }
  if (/\b(?:sorpresa|sorprendido|sorprendida|asombrado|asombrada|estupefacto|estupefacta)\b/u.test(cue)) {
    return { emotion: 'sorpresa' }
  }
  if (/\b(?:epico|epica|solemne|heroico|heroica|majestuoso|majestuosa)\b/u.test(cue)) {
    return { emotion: 'épico' }
  }
  if (/\b(?:misterioso|misteriosa|siniestro|siniestra|oscuro|oscura)\b/u.test(cue)) {
    return { emotion: 'misterioso' }
  }
  return undefined
}

function countWords(text: string): number {
  return text.match(/\S+/gu)?.length ?? 0
}

function stripWrappingQuotes(text: string): string {
  return text.trim().replace(/^[“„«"]([\s\S]*)[”»"]$/u, '$1').trim()
}

export class DialogueParser {
  private activeSpeaker: string | undefined
  private activeEmotion: string | undefined
  private pendingAction: VocalAction | undefined

  reset(): void {
    this.activeSpeaker = undefined
    this.activeEmotion = undefined
    this.pendingAction = undefined
  }

  parse(text: string, options: DialogueParseOptions = {}): DialogueSegment[] {
    const segments: DialogueSegment[] = []
    let wordOffset = 0
    let pendingAnnouncement = options.announcement?.trim() || undefined
    let pendingStutter = false
    const knownCharacters = options.knownCharacters ?? []

    if (options.resetState) this.reset()
    if (options.fallbackSpeaker) this.setSpeaker(options.fallbackSpeaker, knownCharacters)
    if (options.emotion || pendingAnnouncement) {
      const announcementCue = pendingAnnouncement?.replace(/^[^:]+:\s*/u, '')
      const cue = (announcementCue ? getEmotionCue(announcementCue) : undefined)
        ?? (options.emotion ? getEmotionCue(options.emotion) : undefined)
      const nextEmotion = cue?.emotion ?? options.emotion
      const changed = this.activeEmotion !== nextEmotion
      this.activeEmotion = nextEmotion
      pendingStutter = nextEmotion === 'tartamudeando'
      if (options.emitAction === false) this.pendingAction = undefined
      else if (pendingAnnouncement && cue?.action) this.pendingAction = cue.action
      else if (changed) this.pendingAction = cue?.action
    }

    const append = (
      kind: DialogueSegment['kind'],
      rawText: string,
      speakerName?: string,
      emotion?: string,
      action?: VocalAction,
      announcement?: string,
    ) => {
      const cleanText = rawText.replace(/\s+/gu, ' ').trim()
      if (!cleanText) return
      segments.push({ kind, text: cleanText, speakerName, emotion, action, announcement, wordOffset })
      wordOffset += countWords(cleanText)
    }

    const appendDialogue = (rawText: string, speakerName?: string) => {
      const speaker = speakerName ?? this.activeSpeaker
      if (!speaker) {
        append('narration', rawText, undefined, options.emotion)
        return
      }

      let cursor = 0
      let match: RegExpExecArray | null
      STAGE_CUE.lastIndex = 0
      const appendCurrentTone = (part: string) => {
        const pendingAction = this.pendingAction
        const segmentCount = segments.length
        const speechText = pendingStutter ? this.stutterFirstWord(part) : part
        append(
          'dialogue',
          stripWrappingQuotes(speechText),
          speaker,
          this.activeEmotion,
          pendingAction,
          pendingAnnouncement,
        )
        if (segments.length > segmentCount) {
          this.pendingAction = undefined
          pendingAnnouncement = undefined
          pendingStutter = false
        }
      }
      while ((match = STAGE_CUE.exec(rawText)) !== null) {
        appendCurrentTone(rawText.slice(cursor, match.index))
        const cueText = match.groups?.round ?? match.groups?.square ?? match.groups?.brace ?? match.groups?.asterisk ?? ''
        const cue = getEmotionCue(cueText)
        if (cue) {
          this.activeEmotion = cue.emotion
          pendingStutter = cue.emotion === 'tartamudeando'
          const trailingCue = !rawText.slice(STAGE_CUE.lastIndex).trim()
          const previousSegment = segments[segments.length - 1]
          if (trailingCue && previousSegment?.kind === 'dialogue' && previousSegment.speakerName === speaker) {
            previousSegment.emotion = cue.emotion
            if (options.emitAction !== false && cue.action) previousSegment.action = cue.action
            this.pendingAction = undefined
          } else {
            this.pendingAction = options.emitAction === false ? undefined : cue.action
          }
        }
        cursor = STAGE_CUE.lastIndex
      }
      appendCurrentTone(rawText.slice(cursor))
      this.activeSpeaker = speaker
    }

    const lines = text.replace(/\r\n?/gu, '\n').split('\n')
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) {
        this.reset()
        continue
      }

      // 1. Editorial notes (Nota de Sharon:, Sharon dice:)
      const editorialMatch = line.match(EDITORIAL_NOTE_LINE)
      if (editorialMatch) {
        const candidateSpeaker = (editorialMatch[1] || editorialMatch[2] || '').trim()
        const resolved = this.resolveSpeaker(candidateSpeaker, knownCharacters)
        if (resolved) {
          this.setSpeaker(resolved, knownCharacters)
          if (options.emotion) {
            const cue = getEmotionCue(options.emotion)
            this.activeEmotion = cue?.emotion ?? options.emotion
            this.pendingAction = options.emitAction === false ? undefined : cue?.action
          }
          appendDialogue(editorialMatch.groups?.body ?? '', resolved)
          continue
        }
      }

      // 2. Interlocutor prefixes (P:, R:, Q:, A:, Dr:, etc.)
      const interlocutorMatch = line.match(INTERLOCUTOR_LINE)
      if (interlocutorMatch) {
        const rawCode = (interlocutorMatch.groups?.codeOption || interlocutorMatch.groups?.colonOption || '').replace(/[.:-]/g, '').trim()
        const resolved = this.resolveSpeaker(rawCode, knownCharacters)
        if (resolved) {
          this.setSpeaker(resolved, knownCharacters)
          if (options.emotion) {
            const cue = getEmotionCue(options.emotion)
            this.activeEmotion = cue?.emotion ?? options.emotion
            this.pendingAction = options.emitAction === false ? undefined : cue?.action
          }
          appendDialogue(interlocutorMatch.groups?.body ?? '', resolved)
          continue
        }
      }

      // 3. Screenplay speaker prefix (CHARACTER: ...)
      const named = line.match(SPEAKER_PREFIX)
      const namedSpeaker = named?.groups?.speaker
        ? this.resolveSpeaker(named.groups.speaker, knownCharacters)
        : undefined
      if (named && namedSpeaker) {
        this.setSpeaker(namedSpeaker, knownCharacters)
        if (options.emotion) {
          const cue = getEmotionCue(options.emotion)
          this.activeEmotion = cue?.emotion ?? options.emotion
          this.pendingAction = options.emitAction === false ? undefined : cue?.action
        }
        appendDialogue(named.groups?.body ?? '', namedSpeaker)
        continue
      }

      const quotedAttribution = line.match(/^[\s]*[“„«"](?<text>[\s\S]+?)[”»"]\s*(?:[,;—–-]?\s*)(?:dijo|preguntó|pregunto|respondió|respondio|contestó|contesto|exclamó|exclamo|gritó|grito|susurró|susurro|murmuró|murmuro|replicó|replico|said|asked|replied|answered|shouted|whispered)\s+(?<speaker>[\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+(?:(?:de|del|la|las|los|y)\s+)?[\p{Lu}][\p{L}\p{M}'’.-]*){0,4})\s*[.!?…]*\s*$/iu)
      const attributedSpeaker = quotedAttribution?.groups?.speaker
        ? this.resolveSpeaker(quotedAttribution.groups.speaker, knownCharacters)
        : undefined
      if (quotedAttribution && attributedSpeaker) {
        this.setSpeaker(attributedSpeaker, knownCharacters)
        if (options.emotion) {
          const cue = getEmotionCue(options.emotion)
          this.activeEmotion = cue?.emotion ?? options.emotion
          this.pendingAction = options.emitAction === false ? undefined : cue?.action
        }
        appendDialogue(quotedAttribution.groups?.text ?? '', attributedSpeaker)
        continue
      }

      const attribution = line.match(ATTRIBUTION_SUFFIX)
      const attributedName = attribution?.groups?.speaker
        ? this.resolveSpeaker(attribution.groups.speaker, knownCharacters)
        : undefined
      if (attribution && attribution.index !== undefined && attributedName) {
        this.setSpeaker(attributedName, knownCharacters)
        if (options.emotion) {
          const cue = getEmotionCue(options.emotion)
          this.activeEmotion = cue?.emotion ?? options.emotion
          this.pendingAction = options.emitAction === false ? undefined : cue?.action
        }
        const attributedText = line.slice(0, attribution.index).replace(/[\s,;—–-]+$/gu, '').trim()
        appendDialogue(attributedText, attributedName)
        continue
      }

      const dash = line.match(LEADING_DASH)
      if (dash) {
        const speaker = this.activeSpeaker ?? this.resolveSpeaker(options.fallbackSpeaker ?? '', knownCharacters)
        if (speaker) appendDialogue(dash.groups?.body ?? '', speaker)
        else append('narration', dash.groups?.body ?? '')
        continue
      }

      const wholeQuote = stripWrappingQuotes(line)
      const isQuoted = wholeQuote !== line
      if (isQuoted && this.activeSpeaker) {
        appendDialogue(wholeQuote, this.activeSpeaker)
      } else if (this.activeSpeaker && !options.isNarration) {
        appendDialogue(line, this.activeSpeaker)
      } else {
        append('narration', line, undefined, options.emotion)
        if (options.isNarration) {
          this.activeSpeaker = undefined
          this.activeEmotion = undefined
          this.pendingAction = undefined
        }
      }
    }

    return segments
  }

  private stutterFirstWord(text: string): string {
    const leading = text.match(/^(\s*[\p{P}\p{S}]*)(?<word>[\p{L}][\p{L}'’]*(?:[-–][\p{L}][\p{L}'’]*)?)/u)
    const word = leading?.groups?.word
    if (!leading || !word || /^([\p{L}]+)[-–]\1/iu.test(word)) return text
    const onset = word.match(/^(?:ch|ll|rr|qu|gu|[bcdfghjklmnñpqrstvwxyz])/iu)?.[0]
      ?? word.slice(0, 1)
    const repeated = `${onset}-${word}`
    return `${leading[1]}${repeated}${text.slice(leading[0].length)}`
  }

  private setSpeaker(name: string, knownCharacters: string[]): void {
    const normalized = this.resolveSpeaker(name, knownCharacters) ?? normalizeCharName(name)
    if (this.activeSpeaker?.toLocaleLowerCase('es') !== normalized.toLocaleLowerCase('es')) {
      this.activeEmotion = undefined
      this.pendingAction = undefined
    }
    this.activeSpeaker = normalized
  }

  private resolveSpeaker(candidate: string, knownCharacters: string[]): string | undefined {
    // Check if candidate matches Editorial note pattern: "Nota de Sharon" -> "Sharon"
    const editorialMatch = candidate.match(/^(?:(?:Nota|Comentario|Apunte|Reflexión|Reflexion)\s+de(?:l|\s+la)?\s+([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*(?:\s+[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*){0,2})|([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*(?:\s+[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*){0,2})\s+(?:dice|comenta|anota|explica))\b/iu)
    const effectiveName = editorialMatch ? (editorialMatch[1] || editorialMatch[2]) : candidate

    const normalizedCandidate = normalizeCharName(effectiveName).toLocaleLowerCase('es')
    const known = knownCharacters.find(name => normalizeCharName(name).toLocaleLowerCase('es') === normalizedCandidate)
    if (known) return normalizeCharName(known)
    if (isValidCharacterName(effectiveName, true)) return normalizeCharName(effectiveName)
    return undefined
  }
}
