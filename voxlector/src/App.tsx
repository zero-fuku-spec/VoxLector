import { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useLibraryStore } from '@/stores/libraryStore'
import LibraryPage from '@/pages/LibraryPage'
import ReaderPage from '@/pages/ReaderPage'
import SplashScreen from '@/components/SplashScreen'
import BrightnessOverlay from '@/components/BrightnessOverlay'

export default function App() {
  const { load: loadSettings, isLoaded: settingsLoaded } = useSettingsStore()
  const { load: loadVoices, isLoaded: voicesLoaded } = useVoiceStore()
  const { load: loadLibrary, isLoaded: libraryLoaded } = useLibraryStore()

  useEffect(() => {
    void loadSettings().catch((error: unknown) => {
      console.error('[VoxLector] No se pudieron cargar los ajustes guardados:', error)
      useSettingsStore.setState({ isLoaded: true })
    })
    void loadVoices().catch((error: unknown) => {
      console.error('[VoxLector] No se pudieron cargar los perfiles de voz:', error)
      useVoiceStore.setState({ isLoaded: true })
    })
    void loadLibrary().catch((error: unknown) => {
      console.error('[VoxLector] No se pudo cargar la biblioteca:', error)
      useLibraryStore.setState({ isLoaded: true })
    })
  }, [])

  useEffect(() => {
    try {
      sessionStorage.removeItem('voxlector_import_diagnostic')
    } catch (error) {
      console.warn('[VoxLector] No se pudo limpiar el diagnóstico antiguo de lectura:', error)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await document.fonts.load('16px "Material Icons Round"')
        await document.fonts.ready
        if (!cancelled && document.fonts.check('16px "Material Icons Round"')) {
          document.documentElement.classList.add('icons-ready')
        }
      } catch (error) {
        console.warn('[VoxLector] No se pudo cargar la fuente de iconos; se ocultarán sus ligaduras:', error)
      }
    })()
    return () => {
      cancelled = true
      document.documentElement.classList.remove('icons-ready')
    }
  }, [])

  if (!settingsLoaded || !voicesLoaded || !libraryLoaded) {
    return <SplashScreen />
  }

  return (
    <>
      <BrightnessOverlay />
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/reader/:bookId" element={<ReaderPage />} />
      </Routes>
    </>
  )
}
