import { useState } from 'react'

// Bloc replié (commissions, End of Day…) : bouton pleine largeur + contenu
export default function Replie({ icone, titre, extra = null, couleur = '#6366f1', defautOuvert = false, children }) {
  const [ouvert, setOuvert] = useState(defautOuvert)
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOuvert(o => !o)}
        aria-expanded={ouvert}
        className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] bg-white border border-[#e5e7eb] rounded-xl transition-colors hover:border-[#6366f1]/30"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${couleur}1a`, color: couleur }}>
            {icone}
          </span>
          <span className="text-sm font-bold text-[#1a1a1a]">{titre}</span>
          {extra}
        </span>
        <svg className={`w-4 h-4 text-[#6b7280] transition-transform flex-shrink-0 ${ouvert ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {ouvert && <div>{children}</div>}
    </div>
  )
}
