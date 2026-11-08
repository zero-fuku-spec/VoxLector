export default function SplashScreen() {
  return (
    <div
      role="status"
      aria-label="Cargando VoxLector"
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0c1b 0%, #1f1836 100%)' }}
    >
      <div className="text-center animate-splash flex flex-col items-center gap-4">
        <span
          aria-hidden="true"
          className="animate-splash-logo flex h-20 w-20 items-center justify-center rounded-3xl text-4xl font-black text-white shadow-xl"
          style={{ background: 'linear-gradient(135deg, #7c5cff, #ff6b9d)' }}
        >
          V
        </span>
        <h1 className="text-4xl font-black text-white">
          VoxLector <span style={{ color: '#b6a5ff' }}>AI</span>
        </h1>
        <p className="text-sm" style={{ color: 'rgba(232, 232, 240, 0.72)' }}>
          Motor de lectura inteligente
        </p>
      </div>
    </div>
  )
}
