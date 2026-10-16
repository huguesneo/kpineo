import { RENCONTRE_FICTIVE as R } from './demoFictif'

// Écran d'appel closeur fictif, affiché seulement pendant la démo (sous la bulle).
// Reprend la présentation de l'écran réel (SaleCallScript) : notes du setter et
// fiche de qualification préremplie d'une rencontre de décision.
export default function DemoEcranCloseur({ ouvert }) {
  if (!ouvert) return null
  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-[#f5f5f7] p-4 sm:p-8" aria-hidden="true">
      <div className="w-full max-w-3xl flex flex-col gap-4">
        <div className="bg-white border border-[#e5e7eb] rounded-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#00bbb1]">{R.type} · exemple de démo</p>
            <h2 className="text-lg font-black text-[#1a1a1a]">{R.nom}</h2>
            <p className="text-xs text-[#6b7280]">{R.quand}</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-[#f3f4f6] text-xs font-bold text-[#6b7280]">Écran d’appel</span>
        </div>

        <section data-tour="demo-closeur-notes" className="bg-[#fafafa] border border-[#e5e7eb] rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">🗒️ Notes du setter</h3>
          <ul className="flex flex-col gap-2">
            {R.notesSetter.map(n => (
              <li key={n.quand} className="text-sm bg-[#fffbeb] rounded-lg px-3 py-2">
                <p className="text-[11px] text-[#92400e]">{n.quand} · {n.par}</p>
                <p className="text-[#1a1a1a]">{n.texte}</p>
              </li>
            ))}
          </ul>
        </section>

        <section data-tour="demo-closeur-qualif" className="bg-white border border-[#e5e7eb] rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">📋 Qualification</h3>
          <div className="mb-4 px-3 py-2 rounded-lg bg-[#f0f9ff] border border-[#bae6fd] text-xs text-[#0369a1]">
            Prérempli avec la fiche de la rencontre du {R.decouverte} : modifie ou complète au besoin.
          </div>
          <div className="flex flex-col gap-3">
            {R.qualification.map(([libelle, valeur]) => (
              <div key={libelle}>
                <p className="text-xs font-semibold text-[#6b7280] mb-1">{libelle}</p>
                <div className="px-3 py-2 text-sm border border-[#00bbb130] rounded-lg bg-white">{valeur}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
