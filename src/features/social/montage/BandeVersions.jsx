import { trierVersions } from '../../../lib/montageEditeur'

// Bande des versions : cliquer une version l'affiche dans le lecteur, sans rien
// modifier. « Actuelle » marque la version courante du montage.
export default function BandeVersions({ versions, numeroAffiche, versionCourante, onChoisir }) {
  const triees = trierVersions(versions)
  if (!triees.length) return null
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Versions du montage">
      {triees.map(v => {
        const affichee = v.numero === numeroAffiche
        const courante = v.numero === versionCourante
        const sansApercu = !v.chemin_apercu
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChoisir(v.numero)}
            disabled={sansApercu}
            aria-pressed={affichee}
            title={sansApercu ? "Cette version n'a pas d'aperçu" : `Afficher la version ${v.numero}`}
            className={`flex-shrink-0 w-16 h-20 rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              affichee ? 'border-[#00bbb1] bg-[#00bbb1]/10' : 'border-[#e5e7eb] bg-white hover:border-[#00bbb1]/50'
            }`}
          >
            <span className={`text-base font-bold ${affichee ? 'text-[#00bbb1]' : 'text-[#1a1a1a]'}`}>v{v.numero}</span>
            {courante && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Actuelle</span>}
          </button>
        )
      })}
    </div>
  )
}
