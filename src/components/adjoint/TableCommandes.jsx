import { useCallback, useEffect, useState } from 'react'
import { STATUTS_RECU, formatArgent, formatDate } from '../../../supabase/functions/_shared/adjoint.js'
import { appelAdjoint } from '../../lib/adjoint/api'
import { Carte, Chargement, Erreur, Pastille, Puce, Vide } from './ui'

function StatutRecu({ c }) {
  const s = STATUTS_RECU[c.statutRecu] ?? STATUTS_RECU.non_cree
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Pastille ton={s.ton}>{s.label}</Pastille>
      {c.statutRecu === 'cree' && c.recuQuickbooks && <span className="text-[11px] text-[#5b616e]">QBO #{c.recuQuickbooks}</span>}
      {c.statutRecu === 'bloque' && c.blocage && <span className="text-[11px] text-[#b42318] max-w-[220px]">{c.blocage}</span>}
    </span>
  )
}

// Historique de toutes les commandes (channel = commande)
export default function TableCommandes({ onOuvrir, version }) {
  const [q, setQ] = useState('')
  const [recherche, setRecherche] = useState('')
  const [statutRecu, setStatutRecu] = useState('tous')
  const [etat, setEtat] = useState({ commandes: [], total: 0, suivant: null, chargement: true, erreur: null })

  useEffect(() => {
    const t = setTimeout(() => setRecherche(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const charger = useCallback(async (curseur = 0) => {
    setEtat(e => ({ ...e, chargement: true, erreur: null }))
    try {
      const r = await appelAdjoint('commandes', { q: recherche, statutRecu, curseur })
      setEtat(e => ({ commandes: curseur ? [...e.commandes, ...r.commandes] : r.commandes, total: r.total, suivant: r.suivant, chargement: false, erreur: null }))
    } catch (err) {
      setEtat(e => ({ ...e, chargement: false, erreur: err.message }))
    }
  }, [recherche, statutRecu])

  useEffect(() => { charger(0) }, [charger, version])

  return (
    <Carte className="overflow-hidden">
      <div className="px-5 py-4 border-b border-[#eef0f3] flex flex-wrap gap-3 items-center">
        <div className="flex flex-wrap gap-1.5">
          <Puce actif={statutRecu === 'tous'} onClick={() => setStatutRecu('tous')}>Tous</Puce>
          <Puce actif={statutRecu === 'non_cree'} onClick={() => setStatutRecu('non_cree')}>Reçu non créé</Puce>
          <Puce actif={statutRecu === 'cree'} onClick={() => setStatutRecu('cree')}>Reçu créé</Puce>
        </div>
        <span className="flex-1" />
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Nom du client ou numéro de commande"
          aria-label="Rechercher une commande"
          className="w-full sm:w-72 rounded-[9px] border border-[#d5d9e0] px-3 py-2 text-sm outline-none focus:border-[#00bbb1]"
        />
      </div>
      {etat.erreur && <Erreur onReessayer={() => charger(0)}>{etat.erreur}</Erreur>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[#5b616e] border-b border-[#eef0f3]">
              <th className="px-5 py-2.5 font-semibold"># commande</th>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Client</th>
              <th className="px-3 py-2.5 font-semibold text-right">Total</th>
              <th className="px-5 py-2.5 font-semibold">Reçu QuickBooks</th>
            </tr>
          </thead>
          <tbody>
            {etat.commandes.map(c => (
              <tr key={c.id} onClick={() => onOuvrir(c.id)} className="border-b border-[#f1f2f5] cursor-pointer hover:bg-[#fafbfc]">
                <td className="px-5 py-3 font-bold">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOuvrir(c.id) }} className="font-bold text-[#00857e] hover:text-[#00665f]">
                    #{c.numeroCommande ?? '?'}
                  </button>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{formatDate(c.dateCommande || c.created_at)}</td>
                <td className="px-3 py-3">{c.nom}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">{formatArgent(c.total)}</td>
                <td className="px-5 py-3"><StatutRecu c={c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!etat.chargement && !etat.erreur && etat.commandes.length === 0 && <Vide>Aucune commande ne correspond.</Vide>}
      {etat.chargement && <Chargement />}
      <div className="px-5 py-3 flex items-center justify-between text-xs text-[#5b616e]">
        <span>{etat.total} commande{etat.total > 1 ? 's' : ''}</span>
        {etat.suivant != null && !etat.chargement && (
          <button type="button" onClick={() => charger(etat.suivant)} className="font-bold text-[#00857e]">Voir plus</button>
        )}
      </div>
    </Carte>
  )
}
