// ============================================================
// VoxLector AI — SleepTimerModal Component
// Flexible sleep timer with free numeric hours and minutes selector,
// quick presets, and clear disable button
// ============================================================

import React, { useState, useEffect } from 'react'
import { usePlayerStore } from '@/stores/playerStore'

const SLEEP_TIMER_START_KEY = 'voxlector.sleepTimerStartedAt'

interface Props {
  onClose: () => void
}

export default function SleepTimerModal({ onClose }: Props) {
  const { sleepTimerEndAt, setSleepTimer } = usePlayerStore()

  const [hours, setHours] = useState<number>(0)
  const [minutes, setMinutes] = useState<number>(30)
  const [timeLeftStr, setTimeLeftStr] = useState<string>('')

  // Calculate remaining time countdown
  useEffect(() => {
    if (!sleepTimerEndAt) {
      setTimeLeftStr('')
      return
    }

    const updateCountdown = () => {
      const remainingMs = sleepTimerEndAt - Date.now()
      if (remainingMs <= 0) {
        setTimeLeftStr('Finalizado')
        try {
          localStorage.removeItem(SLEEP_TIMER_START_KEY)
        } catch (error) {
          console.warn('[VoxLector] No se pudo limpiar el inicio del temporizador:', error)
        }
        setSleepTimer(null)
        return
      }

      const totalSec = Math.floor(remainingMs / 1000)
      const h = Math.floor(totalSec / 3600)
      const m = Math.floor((totalSec % 3600) / 60)
      const s = totalSec % 60

      if (h > 0) {
        setTimeLeftStr(`${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`)
      } else {
        setTimeLeftStr(`${m}m ${s.toString().padStart(2, '0')}s`)
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [sleepTimerEndAt, setSleepTimer])

  const handleStartTimer = () => {
    const totalMinutes = hours * 60 + minutes
    if (totalMinutes <= 0) {
      alert('Por favor selecciona al menos 1 minuto.')
      return
    }
    const endAt = Date.now() + totalMinutes * 60 * 1000
    try {
      localStorage.setItem(SLEEP_TIMER_START_KEY, String(Date.now()))
    } catch (error) {
      console.warn('[VoxLector] No se pudo guardar el inicio del temporizador:', error)
    }
    setSleepTimer(endAt)
    onClose()
  }

  const handleDisableTimer = () => {
    try {
      localStorage.removeItem(SLEEP_TIMER_START_KEY)
    } catch (error) {
      console.warn('[VoxLector] No se pudo limpiar el inicio del temporizador:', error)
    }
    setSleepTimer(null)
  }

  const handleQuickPreset = (h: number, m: number) => {
    setHours(h)
    setMinutes(m)
  }

  return (
    <div
      className="modal-overlay animate-fade-in-up"
      onClick={onClose}
    >
      <div
        className="modal-container glass-card p-5 sm:p-6 rounded-3xl border shadow-2xl flex flex-col gap-5"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-2xl text-[var(--accent)]">
              bedtime
            </span>
            <h2 className="text-lg font-bold">Temporizador de Sueño</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--bg-input)] hover:bg-[var(--danger)] hover:text-white transition-colors"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>

        {/* Active Countdown Status */}
        {sleepTimerEndAt && (
          <div className="p-3.5 rounded-2xl bg-[var(--accent-glow)] border border-[var(--accent)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-xl text-[var(--accent)] animate-pulse">
                timer
              </span>
              <div>
                <span className="text-xs font-semibold text-[var(--text-secondary)] block">
                  Temporizador Activo:
                </span>
                <span className="text-sm font-mono font-black text-[var(--accent)]">
                  {timeLeftStr}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDisableTimer}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-[var(--danger)] hover:opacity-90 shadow-md"
            >
              Desactivar
            </button>
          </div>
        )}

        {/* Quick Presets */}
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] block mb-2">
            Accesos Rápidos
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: '15 min', h: 0, m: 15 },
              { label: '30 min', h: 0, m: 30 },
              { label: '45 min', h: 0, m: 45 },
              { label: '1 hora', h: 1, m: 0 },
            ].map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => handleQuickPreset(p.h, p.m)}
                className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                  hours === p.h && minutes === p.m
                    ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] hover:border-[var(--accent)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Free Numeric Input: Hours and Minutes */}
        <div className="p-4 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-col gap-3">
          <span className="text-xs font-bold text-[var(--text-primary)]">
            Ajuste Libre y Personalizado:
          </span>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[0.7rem] text-[var(--text-secondary)] font-semibold block mb-1">
                Horas:
              </label>
              <input
                type="number"
                min="0"
                max="12"
                value={hours}
                onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full p-2.5 rounded-xl text-center font-mono font-bold text-base bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
              />
            </div>

            <div>
              <label className="text-[0.7rem] text-[var(--text-secondary)] font-semibold block mb-1">
                Minutos:
              </label>
              <input
                type="number"
                min="0"
                max="59"
                value={minutes}
                onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                className="w-full p-2.5 rounded-xl text-center font-mono font-bold text-base bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
          {sleepTimerEndAt ? (
            <button
              type="button"
              onClick={handleDisableTimer}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-[var(--danger)] bg-[var(--bg-input)] border border-[var(--danger)]"
            >
              Desactivar Temporizador
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-[var(--bg-input)]"
            >
              Cancelar
            </button>
          )}

          <button
            type="button"
            onClick={handleStartTimer}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg flex items-center justify-center gap-1.5"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
            }}
          >
            <span className="material-icons-round text-base">play_arrow</span>
            Iniciar
          </button>
        </div>
      </div>
    </div>
  )
}
