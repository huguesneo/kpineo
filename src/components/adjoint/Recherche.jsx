import { useEffect, useRef, useState } from 'react'
import { formatDate } from '../../../supabase/functions/_shared/adjoint.js'
import { appelAdjoint } from '../../lib/adjoint/api'
import { Icone, Pastille } from './ui'

const TON_STATUT = { client_actif: 'succes', prospect: 'info', ancien_client: 'neutre' }

// Recherche globale : nom, courriel, téléphone ou numéro de commande
export default function Recherche({ onPersonne, onDossier }) {
  const [q, setQ] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [etat, setEtat] = useState({ personnes: [], commandes: [], chargement: false, erreur: null })
  const boite = useRef(null)

  useEffect(() => {
    const terme = q.trim()
    if (terme.length < 2) { setEtat({ personnes: [], commandes: [], chargement: false, erreur: null }); return undefined }
    let actif = true
    setEtat(e => ({ ...e, chargement: true, erreur: null }))
    const t = setTimeout(() => {
      appelAdjoint('recherche', { q: terme })
        .then(r => actif && setEtat({ ...r, chargement: false, erreur: null }))
        .catch(err => actif && setEtat({ personnes: [], commandes: [], chargement: false, erreur: err.message }))
    }, 300)
    return () => { actif = false; clearTimeout(t) }
  }, [q])

  useEffect(() => {
    const fermer = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false) }
    document.addEventListener('mousedown', fermer)
    return () => document.removeEventListener('mousedown', fermer)
  }, [])

  const choisir = (fn) => { setOuvert(false); fn() }
  const rien = !etat.chargement && !etat.erreur && q.trim().length >= 2 && !etat.personnes.length && !etat.commandes.length

  return (
    <div ref={boite} className="relative w-full lg:w-[420px]">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5b616e]"><Icone nom="recherche" taille={16} /></span>
      <input
        type="search"
        value={q}
        onChange={e => { setQ(e.target.value); setOuvert(true) }}
        onFocus={() => setOuvert(true)}
        onKeyDown={e => { if (e.key === 'Escape') setOuvert(false) }}
        placeholder="Nom, courriel, téléphone ou numéro de commande"
        aria-label="Recherche globale"
        className="w-full rounded-[10px] border border-[#d5d9e0] bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#00bbb1] focus:ring-[3px] focus:ring-[#00bbb1]/20"
      />
      {ouvert && q.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full max-h-[480px] overflow-y-auto rounded-xl border border-[#e6e8ec] bg-white shadow-lg">
          {etat.chargement && <p className="m-0 px-4 py-3 text-sm text-[#5b616e]">Recherche...</p>}
          {etat.erreur && <p className="m-0 px-4 py-3 text-sm text-[#b42318]">{etat.erreur}</p>}
          {rien && <p className="m-0 px-4 py-3 text-sm text-[#5b616e]">Personne ni commande trouvée.</p>}
          {etat.personnes.length > 0 && (
            <>
              <p className="m-0 px-4 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-[#5b616e]">Personnes</p>
              {etat.personnes.map(p => (
                <button
                  key={p.cle}
                  type="button"
                  onClick={() => choisir(() => onPersonne({ email: p.courriel, client_id: p.clientId }))}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#f7f8fa] flex items-center gap-3"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold truncate">{p.nom}</span>
                    <span className="block text-xs text-[#5b616e] truncate">{[p.courriel, p.telephone].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <Pastille ton={TON_STATUT[p.statut] ?? 'info'}>{p.statutLabel}</Pastille>
                    {p.nbDossiers > 0 && <span className="text-[11px] text-[#5b616e]">{p.nbDossiers} dossier{p.nbDossiers > 1 ? 's' : ''}</span>}
                  </span>
                </button>
              ))}
            </>
          )}
          {etat.commandes.length > 0 && (
            <>
              <p className="m-0 px-4 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-[#5b616e]">Commandes</p>
              {etat.commandes.map(c => (
                <button key={c.id} type="button" onClick={() => choisir(() => onDossier(c.id))} className="w-full text-left px-4 py-2.5 hover:bg-[#f7f8fa] flex items-center gap-3">
                  <span className="flex-1 min-w-0 text-sm"><strong>#{c.numeroCommande}</strong> · {c.nom}</span>
                  <span className="text-xs text-[#5b616e]">{formatDate(c.created_at)}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
