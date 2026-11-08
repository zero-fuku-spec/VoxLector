// Repertorio TTS: actions are synthesized by the assigned character voice, with per-action prosody.
export type VocalAction =
  | 'laugh' | 'nervous_laugh' | 'bitter_laugh' | 'mocking_laugh' | 'evil_laugh' | 'relief_laugh' | 'chuckle' | 'giggle'
  | 'cry' | 'joyful_cry' | 'sob' | 'whimper'
  | 'sigh' | 'relief_sigh'
  | 'gasp' | 'surprise_gasp' | 'fear_gasp' | 'pain_gasp'
  | 'pant' | 'exertion_pant' | 'fear_pant'
  | 'snort' | 'groan' | 'pain_groan' | 'effort_groan'
  | 'cough' | 'throat_clear' | 'yawn' | 'sneeze' | 'scream' | 'shout'
  | 'hum' | 'click_tongue'
  | 'wail' | 'shriek' | 'growl' | 'moan' | 'choke' | 'gulp'
  | 'sniff' | 'hiccup' | 'hiss' | 'sputter' | 'stammer' | 'yelp'

export const ACTION_PROSODY: Record<VocalAction, { rate: number; pitch: number }> = {
  laugh: { rate: 1.42, pitch: 1.14 },
  nervous_laugh: { rate: 1.12, pitch: 1.08 },
  bitter_laugh: { rate: 0.92, pitch: 0.92 },
  mocking_laugh: { rate: 1.22, pitch: 1.08 },
  evil_laugh: { rate: 1.12, pitch: 0.9 },
  relief_laugh: { rate: 1.18, pitch: 1.08 },
  chuckle: { rate: 1.18, pitch: 1.04 },
  giggle: { rate: 1.48, pitch: 1.22 },
  cry: { rate: 0.78, pitch: 0.94 },
  joyful_cry: { rate: 0.94, pitch: 1.12 },
  sob: { rate: 0.82, pitch: 0.98 },
  whimper: { rate: 0.72, pitch: 1.08 },
  sigh: { rate: 0.78, pitch: 0.92 },
  relief_sigh: { rate: 0.72, pitch: 0.96 },
  gasp: { rate: 1.18, pitch: 1.1 },
  surprise_gasp: { rate: 1.26, pitch: 1.2 },
  fear_gasp: { rate: 1.12, pitch: 1.16 },
  pain_gasp: { rate: 0.9, pitch: 0.88 },
  pant: { rate: 1.24, pitch: 1.04 },
  exertion_pant: { rate: 1.28, pitch: 1.02 },
  fear_pant: { rate: 1.16, pitch: 1.12 },
  snort: { rate: 1.3, pitch: 0.98 },
  groan: { rate: 0.76, pitch: 0.88 },
  pain_groan: { rate: 0.7, pitch: 0.84 },
  effort_groan: { rate: 0.82, pitch: 0.92 },
  cough: { rate: 1.1, pitch: 0.96 },
  throat_clear: { rate: 0.9, pitch: 0.94 },
  yawn: { rate: 0.62, pitch: 0.88 },
  sneeze: { rate: 1.45, pitch: 1.16 },
  scream: { rate: 1.2, pitch: 1.24 },
  shout: { rate: 1.16, pitch: 1.12 },
  hum: { rate: 0.8, pitch: 1.04 },
  click_tongue: { rate: 1.05, pitch: 0.94 },
  wail: { rate: 0.68, pitch: 1.02 },
  shriek: { rate: 1.32, pitch: 1.32 },
  growl: { rate: 0.82, pitch: 0.78 },
  moan: { rate: 0.74, pitch: 0.96 },
  choke: { rate: 0.68, pitch: 1.06 },
  gulp: { rate: 1.2, pitch: 0.98 },
  sniff: { rate: 0.88, pitch: 1.02 },
  hiccup: { rate: 1.3, pitch: 1.14 },
  hiss: { rate: 0.86, pitch: 0.82 },
  sputter: { rate: 1.14, pitch: 1.06 },
  stammer: { rate: 0.82, pitch: 1.04 },
  yelp: { rate: 1.28, pitch: 1.22 },
}

export type ScriptTextInstruction = {
  type: 'NARRATOR_TEXT' | 'CHARACTER_NAME' | 'EMOTION_TAG' | 'CHARACTER_DIALOG'
  text: string
  voiceId: string
  emotion?: string
  trackWords: boolean
  wordOffset: number
}

export type ScriptSfxInstruction = {
  type: 'SFX_INJECTION'
  soundId: VocalAction
  fallbackText: string
  voiceId: string
  emotion?: string
  wordOffset: number
}

export type AudioScriptInstruction = ScriptTextInstruction | ScriptSfxInstruction

export interface DialogueSegment {
  kind: 'narration' | 'dialogue'
  text: string
  speakerName?: string
  emotion?: string
  announcement?: string
  action?: VocalAction
  wordOffset: number
  trackWords?: boolean
}

export interface BuiltAudioScript {
  instructions: AudioScriptInstruction[]
  unassignedCharacters: string[]
}
