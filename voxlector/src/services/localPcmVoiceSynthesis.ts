import { PATH_MAP, type VoiceId } from '@mintplex-labs/piper-tts-web'

export const LOCAL_PCM_VOICE_OPTIONS = [
  { id: 'es_ES-davefx-medium', label: 'Español de España · DaveFX (medium)' },
  { id: 'es_ES-sharvard-medium', label: 'Español de España · Sharvard (medium)' },
  { id: 'es_MX-ald-medium', label: 'Español de México · Ald (medium)' },
  { id: 'es_MX-claude-high', label: 'Español de México · Claude (high)' },
] as const satisfies readonly { id: VoiceId; label: string }[]

export interface LocalPcmProgress {
  url: string
  loaded: number
  total: number
}

type WorkerResponse =
  | { type: 'progress'; requestId: number; progress: LocalPcmProgress }
  | { type: 'result'; requestId: number; audio: ArrayBuffer }
  | { type: 'error'; requestId: number; message: string }

interface PendingSynthesis {
  resolve: (audio: ArrayBuffer) => void
  reject: (error: Error) => void
  onProgress?: (progress: LocalPcmProgress) => void
}

let worker: Worker | null = null
let workerVoiceId: VoiceId | null = null
let requestId = 0
const pendingRequests = new Map<number, PendingSynthesis>()

function isLocalVoiceId(value: string): value is VoiceId {
  return value in PATH_MAP && LOCAL_PCM_VOICE_OPTIONS.some(voice => voice.id === value)
}

function resetWorker(reason: Error): void {
  worker?.terminate()
  worker = null
  workerVoiceId = null
  for (const pending of pendingRequests.values()) pending.reject(reason)
  pendingRequests.clear()
}

function getWorker(voiceId: VoiceId): Worker {
  if (worker && workerVoiceId !== voiceId) {
    resetWorker(new Error('Se cambió la voz local durante la síntesis.'))
  }
  if (!worker) {
    worker = new Worker(new URL('./localPcmVoiceSynthesisWorker.ts', import.meta.url), { type: 'module' })
    workerVoiceId = voiceId
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      const pending = pendingRequests.get(message.requestId)
      if (!pending) return
      if (message.type === 'progress') {
        pending.onProgress?.(message.progress)
      } else {
        pendingRequests.delete(message.requestId)
        if (message.type === 'result') pending.resolve(message.audio)
        else pending.reject(new Error(message.message))
      }
    }
    worker.onerror = event => {
      resetWorker(new Error(event.message || 'Falló el motor local de síntesis.'))
    }
    worker.onmessageerror = () => {
      resetWorker(new Error('No se pudo recibir el audio generado por el motor local.'))
    }
  }
  return worker
}

export function synthesizeLocalPcmVoice(
  text: string,
  voiceId: string,
  onProgress?: (progress: LocalPcmProgress) => void,
): Promise<ArrayBuffer> {
  if (!text.trim()) return Promise.reject(new Error('El texto de prueba está vacío.'))
  if (!isLocalVoiceId(voiceId)) return Promise.reject(new Error('La voz PCM local seleccionada no está disponible.'))

  const activeWorker = getWorker(voiceId)
  const activeRequestId = ++requestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(activeRequestId, { resolve, reject, onProgress })
    activeWorker.postMessage({ requestId: activeRequestId, text, voiceId })
  })
}

export function cancelLocalPcmVoiceSynthesis(): void {
  if (!worker) return
  resetWorker(new DOMException('Síntesis local cancelada.', 'AbortError'))
}
