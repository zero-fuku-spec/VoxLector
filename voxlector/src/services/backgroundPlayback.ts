import { Capacitor, registerPlugin } from '@capacitor/core'

interface BackgroundPlaybackPlugin {
  requestPermissions(): Promise<void>
  start(options: { title: string }): Promise<void>
  stop(): Promise<void>
}

const BackgroundPlayback = registerPlugin<BackgroundPlaybackPlugin>('BackgroundPlayback')
let notificationPermissionRequested = false

export async function startBackgroundPlayback(title: string): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    if (!notificationPermissionRequested) {
      notificationPermissionRequested = true
      try {
        await BackgroundPlayback.requestPermissions()
      } catch (error) {
        console.warn('[VoxLector] Playback notifications permission was not granted:', error)
      }
    }
    await BackgroundPlayback.start({ title })
  }
}

export async function stopBackgroundPlayback(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    await BackgroundPlayback.stop()
  }
}
