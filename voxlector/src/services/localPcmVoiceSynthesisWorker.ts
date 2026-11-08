import { predict, type VoiceId, type Progress } from '@mintplex-labs/piper-tts-web'

interface SynthesisRequest {
  requestId: number
  text: string
  voiceId: VoiceId
}

type WorkerResponse =
  | { type: 'progress'; requestId: number; progress: Progress }
  | { type: 'result'; requestId: number; audio: ArrayBuffer }
  | { type: 'error'; requestId: number; message: string }

interface SynthesisWorkerScope {
  onmessage: ((event: MessageEvent<SynthesisRequest>) => void) | null
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
}

const workerScope = self as unknown as SynthesisWorkerScope

workerScope.onmessage = async event => {
  const { requestId, text, voiceId } = event.data
  if (!Number.isInteger(requestId) || !text.trim() || typeof voiceId !== 'string') {
    workerScope.postMessage({ type: 'error', requestId, message: 'La solicitud de síntesis local no es válida.' })
    return
  }

  try {
    const wav = await predict({ text, voiceId }, progress => {
      workerScope.postMessage({ type: 'progress', requestId, progress })
    })
    const audio = await wav.arrayBuffer()
    workerScope.postMessage({ type: 'result', requestId, audio }, [audio])
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
