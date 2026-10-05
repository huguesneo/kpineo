// Filtres de la file « À confirmer » : confirmés / non confirmés, appelés / pas appelés
const GROUPES = [
  { cle: 'confirmation', libelle: 'Confirmation', options: [['tous', 'Tous'], ['nonConfirmes', 'Non confirmés'], ['confirmes', 'Confirmés']] },
  { cle: 'appel', libelle: 'Appel', options: [['tous', 'Tous'], ['nonAppeles', 'Pas appelés'], ['appeles', 'Appelés']] },
]

export default function FiltresAConfirmer({ filtres, onChange, appelsIndisponibles = null }) {
  return (
    <div className="flex items-center gap-x-5 gap-y-2 flex-wrap px-4 py-2.5 border-b border-[#f0f0f0]">
      {GROUPES.map(g => (
        <div key={g.cle} role="group" aria-label={g.libelle} className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wide mr-1">{g.libelle}</span>
          {g.options.map(([valeur, texte]) => {
            const actif = filtres[g.cle] === valeur
            const desactive = g.cle === 'appel' && valeur !== 'tous' && !!appelsIndisponibles
            return (
              <button key={valeur} aria-pressed={actif} disabled={desactive}
                title={desactive ? appelsIndisponibles : undefined}
                onClick={() => onChange({ ...filtres, [g.cle]: valeur })}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                  actif ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#b45309]' : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:text-[#1a1a1a]'}`}>
                {texte}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
