// Commutateur « Je sette / Je close » : indigo pour setter, teal pour closeur.
// Le compteur de l'onglet inactif signale un travail en attente de l'autre côté.
const MODES = [
  { value: 'sette', label: 'Je sette', actif: '#6366f1', badgeInactif: { bg: 'rgba(99,102,241,0.1)', color: '#4f46e5' } },
  { value: 'close', label: 'Je close', actif: '#00bbb1', badgeInactif: { bg: '#fef2f2', color: '#b91c1c' } },
]

export default function SegmentMode({ mode, onChange, compteurs = {} }) {
  return (
    <div role="tablist" aria-label="Mode de travail"
      className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-white border border-[#e5e7eb] rounded-xl">
      {MODES.map(m => {
        const actif = mode === m.value
        const n = compteurs[m.value]
        return (
          <button
            key={m.value}
            role="tab"
            aria-selected={actif}
            onClick={() => onChange(m.value)}
            className="flex items-center justify-center gap-2 h-10 sm:h-auto px-4 py-2 rounded-lg whitespace-nowrap text-sm font-bold transition-colors"
            style={actif ? { background: m.actif, color: '#ffffff' } : { color: '#6b7280' }}
          >
            {m.label}
            {n != null && n > 0 && (
              <span className="text-[11px] font-bold px-[7px] py-px rounded-full"
                style={actif ? { background: 'rgba(255,255,255,0.22)' } : { background: m.badgeInactif.bg, color: m.badgeInactif.color }}>
                {n}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
