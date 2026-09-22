import { fmtDateLongue, prenom } from '../../lib/v2/format'

// En-tête commun des écrans v2 : « Bonjour, Prénom », titre, date, et à droite
// le commutateur de mode (ou rien pour un rôle unique).
export default function EnteteEspace({ profile, titre = 'Mon espace', droite = null }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <p className="text-sm text-[#6b7280] mb-1">
          Bonjour, <span className="font-semibold text-[#1a1a1a]">{prenom(profile?.full_name) || '—'}</span>
        </p>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">{titre}</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">{fmtDateLongue()}</p>
      </div>
      {droite}
    </header>
  )
}
