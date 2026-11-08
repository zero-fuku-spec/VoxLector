// ============================================================
// VoxLector AI — Brightness Overlay
// Extended brightness control with Night Screen effect
// ============================================================

import { useSettingsStore } from '@/stores/settingsStore'

export default function BrightnessOverlay() {
  const brightness = useSettingsStore(s => s.brightness)

  // Problema 1: reduce la luminancia con negro neutro, sin teñir la pantalla de amarillo.
  const strength = brightness >= 1.0 ? 0 : (1 - brightness) * 0.95

  if (strength <= 0) return null

  return (
    <div
      // Problema 1: el control atenúa más allá del mínimo del brillo del dispositivo.
      className="fixed inset-0 z-[10000] pointer-events-none select-none"
      style={{
        background: `rgba(0, 0, 0, ${strength})`,
      }}
      aria-hidden="true"
    />
  )
}
