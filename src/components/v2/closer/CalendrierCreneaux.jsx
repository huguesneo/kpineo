import { grilleMois } from '../../../lib/v2/creneaux'
import { fmtHeure } from '../../../lib/v2/format'

const JOURS_SEMAINE = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function titreMois(mois) {
  const s = new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${mois}-15T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Calendrier mensuel des disponibilités : ‹ › pour changer de mois, point NEO
// sous les jours qui ont des plages, puis les heures du jour choisi.
//   jours : [{ jour: 'AAAA-MM-JJ', creneaux: [iso…] }] du mois affiché
export default function CalendrierCreneaux({
  mois, onMois, jours, chargement, erreur, peutReculer, peutAvancer,
  jourChoisi, onJour, creneau, onCreneau,
}) {
  const dispo = new Map((jours ?? []).map(j => [j.jour, j.creneaux]))
  const heures = dispo.get(jourChoisi) ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button onClick={() => onMois(-1)} disabled={!peutReculer} aria-label="Mois précédent"
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        <p className="text-sm font-bold text-[#1a1a1a]">{titreMois(mois)}</p>
        <button onClick={() => onMois(1)} disabled={!peutAvancer} aria-label="Mois suivant"
          className="w-11 h-11 flex items-center justify-center rounded-full bg-[#00bbb1]/10 text-[#00897f] hover:bg-[#00bbb1]/20 disabled:opacity-30">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>

      <div className={`grid grid-cols-7 gap-1 text-center ${chargement ? 'opacity-40 pointer-events-none' : ''}`}>
        {JOURS_SEMAINE.map(j => <span key={j} className="text-[11px] font-bold text-[#9ca3af] py-1">{j}</span>)}
        {grilleMois(mois).flat().map((jour, i) => {
          if (!jour) return <span key={`v${i}`} />
          const libre = dispo.has(jour)
          const choisi = jour === jourChoisi
          return (
            <button key={jour} disabled={!libre} onClick={() => onJour(jour)}
              aria-label={`${jour}${libre ? ', disponibilités' : ', complet'}`} aria-pressed={choisi}
              className={`relative h-11 rounded-full text-sm font-semibold flex flex-col items-center justify-center ${
                choisi ? 'bg-[#00bbb1] text-white'
                  : libre ? 'text-[#1a1a1a] hover:bg-[#00bbb1]/10'
                    : 'text-[#d1d5db] cursor-default'}`}>
              {Number(jour.slice(8))}
              {libre && (
                <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${choisi ? 'bg-white' : 'bg-[#00bbb1]'}`} />
              )}
            </button>
          )
        })}
      </div>

      {chargement && <p className="text-xs text-[#9ca3af] text-center">Chargement des disponibilités…</p>}
      {!chargement && erreur && <p className="text-xs font-semibold text-[#b91c1c] text-center">{erreur}</p>}
      {!chargement && !erreur && dispo.size === 0 && (
        <p className="text-xs text-[#6b7280] text-center">Aucune disponibilité ce mois-ci : essaie le mois suivant.</p>
      )}

      {jourChoisi && heures.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1 border-t border-[#f3f4f6]">
          {heures.map(c => (
            <button key={c} onClick={() => onCreneau(c)}
              className={`min-h-[44px] mt-2 rounded-lg border text-sm font-semibold ${creneau === c ? 'bg-[#00bbb1] border-[#00bbb1] text-white' : 'bg-white border-[#00bbb1]/40 text-[#00897f] hover:bg-[#00bbb1]/5'}`}>
              {fmtHeure(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
