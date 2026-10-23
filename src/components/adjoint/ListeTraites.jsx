import { useCallback, useEffect, useState } from 'react'
import { CANAUX, DECISIONS } from '../../../supabase/functions/_shared/adjoint.js'
import { appelAdjoint } from '../../lib/adjoint/api'
import { LigneDossier } from './File'
import { Chargement, Erreur, Vide } from './ui'

const selectCls = 'rounded-lg border border-[#e6e8ec] bg-white px-2 py-1.5 text-xs font-semibold text-[#3d434f] outline-none focus:border-[#00bbb1]'

// Déjà traité, ou Fait seul par Léo (Aujourd'hui / Historique) : liste paginée et filtrable
export default function ListeTraites({ section, sousSection, selection, onChoisir, onCharge, version }) {
  const autonome = section === 'autonome'
  const [filtres, setFiltres] = useState({ canal: '', decision: '', periode: autonome ? '' : '30j' })
  const [etat, setEtat] = useState({ dossiers: [], suivant: null, chargement: true, erreur: null })

  const charger = useCallback(async (curseur = 0) => {
    setEtat(e => ({ ...e, chargement: true, erreur: null }))
    try {
      const r = await appelAdjoint('liste', { section, sousSection, filtres, curseur })
      setEtat(e => ({ dossiers: curseur ? [...e.dossiers, ...r.dossiers] : r.dossiers, suivant: r.suivant, chargement: false, erreur: null }))
      if (!curseur) onCharge?.(r.dossiers)
    } catch (err) {
      setEtat(e => ({ ...e, chargement: false, erreur: err.message }))
    }
  }, [section, sousSection, filtres]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { charger(0) }, [charger, version])

  const maj = (k) => (e) => setFiltres(f => ({ ...f, [k]: e.target.value }))
  return (
    <>
      <div className="px-3.5 py-3 border-b border-[#eef0f3] flex flex-wrap gap-1.5 items-center">
        {section === 'tout' || autonome ? (
          <select aria-label="Canal" value={filtres.canal} onChange={maj('canal')} className={selectCls}>
            <option value="">Tous les canaux</option>
            {['courriel', 'commande', 'agenda'].map(c => <option key={c} value={c}>{CANAUX[c].pluriel}</option>)}
          </select>
        ) : null}
        {!autonome && (
          <select aria-label="Décision" value={filtres.decision} onChange={maj('decision')} className={selectCls}>
            <option value="">Toutes les décisions</option>
            {['envoye', 'envoye_modifie', 'recu_cree', 'rejete', 'traite_main', 'fait_seul'].map(k => <option key={k} value={k}>{DECISIONS[k].label}</option>)}
          </select>
        )}
        {sousSection !== 'aujourdhui' && (
          <select aria-label="Période" value={filtres.periode} onChange={maj('periode')} className={selectCls}>
            <option value="7j">7 derniers jours</option>
            <option value="30j">30 derniers jours</option>
            <option value="90j">90 derniers jours</option>
            <option value="">Depuis le début</option>
          </select>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {autonome && (
          <p className="m-0 px-3.5 py-2.5 text-xs text-[#5b616e] border-b border-[#f1f2f5]">
            Ces actions ne demandent pas de clic : factures envoyées à Dext, reçus d’assurance, transferts, ménage. Tu les vois passer ici pour garder le contrôle.
          </p>
        )}
        {etat.erreur && <Erreur onReessayer={() => charger(0)}>{etat.erreur}</Erreur>}
        {!etat.erreur && !etat.chargement && etat.dossiers.length === 0 && <Vide>Aucun dossier pour ces filtres.</Vide>}
        {etat.dossiers.map(d => <LigneDossier key={d.id} d={d} actif={d.id === selection} onClick={() => onChoisir(d.id)} />)}
        {etat.chargement && <Chargement />}
        {etat.suivant != null && !etat.chargement && (
          <button type="button" onClick={() => charger(etat.suivant)} className="w-full py-3 text-[13px] font-bold text-[#00857e] hover:bg-[#f7f8fa]">
            Voir plus
          </button>
        )}
      </div>
    </>
  )
}
