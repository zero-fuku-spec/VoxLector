import React from 'react'

export type PrivacyConsentPurpose = 'document' | 'photo'

interface Props {
  purpose: PrivacyConsentPurpose
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

const CONSENT_COPY: Record<PrivacyConsentPurpose, {
  title: string
  description: string
  details: string
  action: string
  icon: string
}> = {
  document: {
    title: 'Elegir un documento',
    description: 'VoxLector necesita que selecciones un documento para preparar su lectura.',
    details: 'Se abrirá el selector del sistema. El archivo seleccionado se procesa en el dispositivo y su contenido se guarda localmente para que puedas leerlo. No se enviará a VoxLector ni a terceros como parte de la importación.',
    action: 'Continuar al selector',
    icon: 'description',
  },
  photo: {
    title: 'Elegir una foto',
    description: 'Selecciona una imagen de tu dispositivo para usarla como fondo de lectura.',
    details: 'Se abrirá el selector del sistema. Solo se usará la imagen que elijas y se guardará en los ajustes locales de esta aplicación. No se enviará a VoxLector ni a terceros.',
    action: 'Elegir imagen',
    icon: 'wallpaper',
  },
}

export default function PrivacyConsentModal({ purpose, error, onConfirm, onCancel }: Props) {
  const copy = CONSENT_COPY[purpose]

  return (
    <div
      className="modal-overlay animate-fade-in-up"
      onClick={onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-consent-title"
        aria-describedby="privacy-consent-description privacy-consent-details"
        className="modal-container glass-card p-6 shadow-2xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
        onClick={event => event.stopPropagation()}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-glow)] text-[var(--accent)]">
          <span aria-hidden="true" className="material-icons-round text-2xl">{copy.icon}</span>
        </div>
        <h2 id="privacy-consent-title" className="text-lg font-black text-[var(--text-primary)]">
          {copy.title}
        </h2>
        <p id="privacy-consent-description" className="mt-2 text-sm leading-relaxed text-[var(--text-primary)]">
          {copy.description}
        </p>
        <p id="privacy-consent-details" className="mt-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
          {copy.details}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-input)]"
          >
            Ahora no
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-transform active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))' }}
          >
            {copy.action}
          </button>
        </div>
      </section>
    </div>
  )
}
