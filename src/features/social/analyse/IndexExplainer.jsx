import Modal from '../../../components/shared/Modal'
import { PI_KEYS, piColor, num } from './scoring'
import { fmtPct } from '../../../lib/socialFormat'

// ============================================================================
// « Que veulent dire ces barres ? »
//
// Cinq barres sans libellé n'apprennent rien. Ce panneau s'ouvre au clic sur
// l'index, et affiche la même explication partout — depuis le tableau comme
// depuis le panneau de détail. Quand une publication est fournie, chaque ligne
// montre en plus sa propre valeur : l'explication et le cas concret ensemble.
// ============================================================================

function Legend({ swatch, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-8 h-2 rounded-full mt-1.5 shrink-0" style={{ background: swatch }} />
      <span className="text-[13px] text-[#4b5563] leading-relaxed">{children}</span>
    </div>
  )
}

export default function IndexExplainer({ isOpen, onClose, score = null }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comment lire l'index de performance" size="lg">
      <p className="text-[13px] text-[#4b5563] leading-relaxed">
        Chaque barre compare cette publication à <b>ta propre médiane</b> sur des publications
        comparables : même plateforme, même type de contenu, même fenêtre de mesure. Une barre à
        moitié pleine vaut <b>1,00×</b> — exactement ta normale. Ce n'est jamais une comparaison
        avec d'autres comptes.
      </p>

      <div className="flex flex-col gap-3 mt-5">
        {PI_KEYS.map(k => {
          const v = score ? num(score[k.key]) : null
          return (
            <div key={k.key} className="flex gap-3 items-start">
              <div className="w-28 shrink-0">
                <div className="text-[13px] font-semibold text-[#1a1a1a]">{k.label}</div>
                <div className="text-[11px] text-[#9ca3af]">
                  poids {fmtPct(k.weight * 100, 0)}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[12.5px] text-[#4b5563] leading-relaxed">{k.help}</p>
                {score && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="w-16 h-2 rounded-full bg-[#f0f0f2] overflow-hidden block">
                      {v != null && (
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.max(4, Math.min(100, (v / 2) * 100))}%`, background: piColor(v) }}
                        />
                      )}
                    </span>
                    <span className="text-[12px] font-semibold text-[#1a1a1a] tabular-nums">
                      {v == null
                        ? <span className="font-normal text-[#9ca3af]">non mesuré pour cette publication</span>
                        : `${v.toFixed(2).replace('.', ',')}× ta médiane`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 pt-5 border-t border-[#f0f0f2] flex flex-col gap-2.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#9ca3af]">Les couleurs</div>
        <Legend swatch="#10b981">Au-dessus de 1,20× — nettement mieux que ta normale.</Legend>
        <Legend swatch="#9ca3af">Entre 0,80× et 1,20× — dans ta normale.</Legend>
        <Legend swatch="#ef4444">Sous 0,80× — nettement moins bien.</Legend>
        <Legend swatch="#e5e7eb">
          Barre traversée d'un trait : <b>non mesuré</b>, ce qui n'est pas zéro. Un carrousel n'a
          pas de rétention vidéo, une publication trop récente n'a pas encore de relevé.
        </Legend>
      </div>

      <div className="mt-6 pt-5 border-t border-[#f0f0f2]">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#9ca3af] mb-2">
          Et le score, alors
        </div>
        <p className="text-[13px] text-[#4b5563] leading-relaxed">
          C'est ces cinq index combinés avec leurs poids, ramenés sur 100. <b>100 = ta médiane.</b>{' '}
          Au-dessus de 120 la publication surperforme, sous 80 elle sous-performe. Un score de 400
          veut dire quatre fois ta médiane pour ce format sur cette plateforme.
        </p>
        <p className="text-[13px] text-[#4b5563] leading-relaxed mt-2.5">
          Tant que la baseline compte moins de 8 publications comparables, le verdict reste{' '}
          <b>insuffisant</b> et aucun chiffre n'est affiché : il n'y a pas de quoi conclure. Ce
          n'est pas une erreur, c'est le garde-fou.
        </p>
        <p className="text-[13px] text-[#4b5563] leading-relaxed mt-2.5">
          L'étiquette <b>J+28</b> signale une publication mesurée sur la fenêtre de 28 jours faute
          de relevé à 7 jours. Les deux fenêtres ne se comparent jamais entre elles.
        </p>
      </div>
    </Modal>
  )
}
