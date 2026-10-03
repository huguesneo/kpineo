import { fmtCAD } from '../../../lib/v2/format'

function Tuile({ titre, children, accent = false }) {
  return (
    <div className={`rounded-xl p-3 sm:p-4 flex flex-col gap-1 border ${accent ? 'bg-[#6366f1]/[0.08] border-[#6366f1]/25' : 'bg-white border-[#e5e7eb]'}`}>
      <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide">{titre}</p>
      {children}
    </div>
  )
}

// Bandeau du jour : nouveaux leads, RDV bookés, show-ups du mois, commission du mois.
// (« Appels faits » retiré : GHL enregistre lui-même les appels sans réponse.)
export default function BandeauJour({ stats, rdvBookes, aConfirmer, nouveaux = [] }) {
  const { objectifs, showupCount, commission, commissionLoading, showupsMissing, monthlyBonus } = stats
  const chauds = nouveaux.filter(l => l.chaud).length

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-7">
      <Tuile titre="Nouveaux leads">
        <p className="text-xl sm:text-2xl font-black">{nouveaux.length}</p>
        <p className="text-xs font-semibold text-[#6b7280]">
          {chauds > 0 ? `dont ${chauds} 🔥 chaud${chauds > 1 ? 's' : ''}` : 'Aucun chaud à relancer'}
        </p>
      </Tuile>

      <Tuile titre="RDV bookés aujourd'hui">
        <p className="text-xl sm:text-2xl font-black">{rdvBookes}</p>
        <p className="text-xs font-semibold text-[#6b7280] hidden sm:block">
          {objectifs.bookings > 0 ? `Objectif du jour : ${objectifs.bookings}` : 'Objectif à définir'}
        </p>
      </Tuile>

      <Tuile titre="Show-ups du mois">
        <p className="text-xl sm:text-2xl font-black">{commissionLoading ? '…' : showupCount}</p>
        <p className="text-xs font-semibold text-[#6b7280] hidden sm:block">
          {aConfirmer > 0 ? `${aConfirmer} RDV encore à confirmer` : 'Aucun RDV à confirmer'}
        </p>
      </Tuile>

      <Tuile titre="Commission du mois" accent>
        <p className="text-xl sm:text-2xl font-black text-[#6366f1]">{commissionLoading ? '…' : fmtCAD(commission)}</p>
        {showupsMissing != null && monthlyBonus != null && (
          <p className="text-xs font-semibold text-[#6b7280] hidden sm:block">
            {showupsMissing} show-up{showupsMissing > 1 ? 's' : ''} du boni de {fmtCAD(monthlyBonus)}
          </p>
        )}
      </Tuile>
    </div>
  )
}
