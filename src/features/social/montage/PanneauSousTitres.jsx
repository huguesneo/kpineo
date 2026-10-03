import { useMemo, useState } from 'react'
import Button from '../../../components/shared/Button'
import { messageErreurEnvoi } from '../../../lib/montageEditeur'
import {
  lignesDe, formatDebut, avertissementsLigne, estModifiee, correctionsAEnvoyer, nbSuppressions,
} from '../../../lib/montageSousTitres'

// Sous-titres de la version affichée : une ligne par sous-titre, avec son
// début. Cliquer l'heure (ou entrer dans le champ) fait sauter le lecteur à
// ce moment. Seul le texte se modifie. « Appliquer les corrections » envoie
// les mots modifiés ou retirés à l'agent (tâche correction_sous_titres) ; le
// résultat arrive comme une nouvelle version, avec des numéros de mots
// nouveaux si un mot a été retiré (les brouillons de l'ancienne sont oubliés).
// etat vient de etatCorrection ; brouillons = { [cle de ligne]: texte }.
export default function PanneauSousTitres({ version, etat, brouillons, onModifier, onAnnuler, onAppliquer, onSauter }) {
  const lignes = useMemo(() => lignesDe(version?.sous_titres), [version?.sous_titres])
  const [envoi, setEnvoi] = useState({ enCours: false, erreur: null })
  const { corrections, erreurs, erreur: erreurGlobale, modifiees } = correctionsAEnvoyer(version?.sous_titres, brouillons)
  const retires = nbSuppressions(corrections)
  const champsDesactives = etat.lectureSeule || etat.envoiDesactive || envoi.enCours
  const peutAppliquer = !champsDesactives && corrections.length > 0 && !Object.keys(erreurs).length && !erreurGlobale

  async function appliquer() {
    if (!peutAppliquer) return
    setEnvoi({ enCours: true, erreur: null })
    try {
      await onAppliquer(corrections, {
        numeroBase: version.numero,
        totalMots: Array.isArray(version.sous_titres?.mots) ? version.sous_titres.mots.length : 0,
      })
      setEnvoi({ enCours: false, erreur: null })
    } catch (err) {
      setEnvoi({ enCours: false, erreur: messageErreurEnvoi(err) })
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-sm font-bold text-[#1a1a1a]">Sous-titres{version ? ` de la v${version.numero}` : ''}</h2>
        {modifiees > 0 && <span className="text-xs text-[#6b7280]" data-modifiees={modifiees}>{modifiees} ligne{modifiees > 1 ? 's' : ''} modifiée{modifiees > 1 ? 's' : ''}</span>}
      </div>
      {etat.raison && <p className="text-xs text-[#6b7280] mb-2" role="status">{etat.raison}</p>}
      {!etat.lectureSeule && etat.raisonEnvoi && <p className="text-xs text-[#6b7280] mb-2" role="status">{etat.raisonEnvoi}</p>}

      {lignes.length > 0 && (
        <ol className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1" aria-label="Lignes de sous-titres">
          {lignes.map(l => {
            const brouillon = brouillons?.[l.cle]
            const texte = brouillon ?? l.texte
            const modifiee = estModifiee(l, brouillon)
            const avertissements = avertissementsLigne(texte)
            const erreur = erreurs[l.cle]
            return (
              <li key={l.cle} className="flex items-start gap-2" data-ligne={l.cle} data-modifiee={modifiee ? 'oui' : 'non'}>
                <button
                  type="button"
                  onClick={() => onSauter(l.debutMs / 1000)}
                  title="Aller à ce moment dans le lecteur"
                  className="mt-1.5 w-14 flex-shrink-0 text-right text-xs tabular-nums text-[#00bbb1] font-semibold hover:underline"
                >
                  {formatDebut(l.debutMs)}
                </button>
                <div className="min-w-0 flex-1">
                  <label htmlFor={`sous-titre-${l.cle}`} className="sr-only">Sous-titre à {formatDebut(l.debutMs)}</label>
                  <input
                    id={`sous-titre-${l.cle}`}
                    type="text"
                    value={texte}
                    onChange={e => onModifier(l.cle, e.target.value)}
                    onFocus={() => onSauter(l.debutMs / 1000)}
                    disabled={champsDesactives}
                    className={`w-full rounded-lg border px-2.5 py-1.5 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#00bbb1] disabled:bg-gray-50 disabled:text-[#6b7280] ${
                      erreur ? 'border-red-300' : modifiee ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-gray-200 bg-white'
                    }`}
                  />
                  {avertissements.map(a => <p key={a} className="text-xs text-amber-700 mt-0.5" data-avertissement="">{a}</p>)}
                  {erreur && <p className="text-xs text-red-600 mt-0.5">{erreur}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {!etat.lectureSeule && (
        <div className="mt-3 space-y-2">
          {retires > 0 && !erreurGlobale && (
            <p className="text-xs text-[#6b7280]" data-retires={retires}>
              {retires} mot{retires > 1 ? 's' : ''} retiré{retires > 1 ? 's' : ''} : les autres mots gardent leur minutage.
            </p>
          )}
          {erreurGlobale && <p className="text-xs text-red-600" data-erreur-globale="">{erreurGlobale}</p>}
          {envoi.erreur && <p className="text-xs text-red-600">{envoi.erreur}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onAnnuler} disabled={!modifiees || envoi.enCours}>
              Annuler mes changements
            </Button>
            <Button type="button" size="sm" onClick={appliquer} disabled={!peutAppliquer} loading={envoi.enCours}>
              Appliquer les corrections
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
