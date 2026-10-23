import { useEffect, useMemo, useState } from 'react'
import { elementsLeo, fusionnerLigneDuTemps } from '../../../supabase/functions/_shared/historique.js'
import { appelAdjoint } from '../../lib/adjoint/api'
import { EnteteFiche } from './FichePersonne'
import { EtatSources, FiltresSources, LigneHistorique, SOURCES_EXTERNES } from './Historique'
import { Carte, Chargement, Erreur, Icone } from './ui'

// Page Personne : la fiche complète et tout l'historique (fils Gmail de info@, SMS et
// courriels GHL, App NEO, dossiers Léo), du plus récent au plus ancien
export default function PagePersonne({ cible, onRetour, onOuvrirDossier }) {
  const [etat, setEtat] = useState({ chargement: true, erreur: null, fiche: null, dossiers: [] })
  const [essai, setEssai] = useState(0)

  useEffect(() => {
    let actif = true
    setEtat(e => ({ ...e, chargement: true, erreur: null }))
    appelAdjoint('personne', cible)
      .then(r => actif && setEtat({ chargement: false, erreur: null, ...r }))
      .catch(err => actif && setEtat({ chargement: false, erreur: err.message, fiche: null, dossiers: [] }))
    return () => { actif = false }
  }, [cible.email, cible.client_id, essai]) // eslint-disable-line react-hooks/exhaustive-deps

  // Chaque source externe se charge à part, une fois la fiche connue
  const [sources, setSources] = useState({})
  const [filtre, setFiltre] = useState(null)
  useEffect(() => {
    if (etat.chargement || etat.erreur) return undefined
    let actif = true
    const args = { email: etat.fiche?.courriel ?? cible.email, telephone: etat.fiche?.telephone, client_id: etat.fiche?.clientId ?? cible.client_id }
    setSources(Object.fromEntries(SOURCES_EXTERNES.map(s => [s, { chargement: true }])))
    for (const source of SOURCES_EXTERNES) {
      appelAdjoint('historique', { source, ...args })
        .then(r => actif && setSources(x => ({ ...x, [source]: { elements: r.elements ?? [], raison: r.indisponible ? r.raison : null, note: r.note ?? null } })))
        .catch(e => actif && setSources(x => ({ ...x, [source]: { elements: [], raison: e.message } })))
    }
    return () => { actif = false }
  }, [etat]) // eslint-disable-line react-hooks/exhaustive-deps

  const ligne = useMemo(
    () => fusionnerLigneDuTemps(elementsLeo(etat.dossiers), ...SOURCES_EXTERNES.map(s => sources[s]?.elements ?? [])),
    [etat.dossiers, sources],
  )

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onRetour} className="self-start inline-flex items-center gap-2 text-[13px] font-bold text-[#00857e] hover:text-[#00665f]">
        <Icone nom="retour" taille={16} />Retour
      </button>
      {etat.chargement && <Chargement />}
      {etat.erreur && <Erreur onReessayer={() => setEssai(n => n + 1)}>{etat.erreur}</Erreur>}
      {!etat.chargement && !etat.erreur && (
        <div className="flex flex-wrap gap-4 items-start">
          <Carte className="flex-[1_1_280px] max-w-full lg:max-w-[320px] p-5">
            <EnteteFiche fiche={etat.fiche} nomSecours={etat.dossiers[0]?.resume?.nom} />
          </Carte>
          <div className="flex-[999_1_480px] min-w-0 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="m-0 text-xs font-extrabold tracking-wider uppercase text-[#5b616e]">Historique, tous canaux</p>
              <EtatSources etats={sources} />
            </div>
            <FiltresSources elements={ligne} filtre={filtre} onFiltre={setFiltre} />
            {Object.values(sources).map(e => e.note).filter(Boolean).map(n => <p key={n} className="m-0 text-xs text-[#5b616e]">{n}</p>)}
            <LigneHistorique elements={ligne} filtre={filtre} onOuvrirDossier={onOuvrirDossier} />
          </div>
        </div>
      )}
    </div>
  )
}
