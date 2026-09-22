import { fmtCAD } from '../../../lib/v2/format'

function Tuile({ titre, children, accent = false }) {
  return (
    <div className={`rounded-xl p-3 sm:p-4 flex flex-col gap-1 border ${accent ? 'bg-[#6366f1]/[0.08] border-[#6366f1]/25' : 'bg-white border-[#e5e7eb]'}`}>
      <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide">{titre}</p>
      {children}
    </div>
  )
}

// Bandeau du jour : appels faits, RDV bookés, show-ups du mois, commission du mois
export default function BandeauJour({ stats, rdvBookes, aConfirmer }) {
  const { calls, objectifs, showupCount, commission, commissionLoading, showupsMissing, monthlyBonus } = stats
  const pct = objectifs.calls > 0 ? Math.min(100, Math.round((calls / objectifs.calls) * 100)) : null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-7">
      <Tuile titre="Appels faits">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl sm:text-2xl font-black">{calls}</span>
          {objectifs.calls > 0 && <span className="text-sm text-[#9ca3af]">/ {objectifs.calls}</span>}
        </div>
        {pct != null ? (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 bg-[#f3f4f6] rounded-full h-2">
              <div className="h-2 rounded-full bg-[#6366f1] transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold text-[#6366f1] w-9 text-right">{pct}%</span>
          </div>
        ) : (
          <p className="text-xs font-semibold text-[#6b7280]">Depuis l'app, aujourd'hui</p>
        )}
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
