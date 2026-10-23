import { useEffect, useState } from 'react'
import { CANAUX, DECISIONS, formatDateHeure } from '../../../supabase/functions/_shared/adjoint.js'
import { SOURCES, NOM_INDISPONIBLE } from '../../../supabase/functions/_shared/historique.js'
import { appelAdjoint } from '../../lib/adjoint/api'
import { FilConversation } from './FilGmail'
import { Carte, Icone, Pastille, Vide } from './ui'

// Historique complet de la fiche Personne : une seule ligne du temps, du plus récent au
// plus ancien, chaque élément avec son canal. Les sources se chargent séparément ;
// celle qui échoue est signalée (« Gmail indisponible ») sans cacher les autres.

const TON_DECISION = { succes: 'succes', danger: 'danger', info: 'info', neutre: 'neutre' }
export const SOURCES_EXTERNES = ['gmail', 'ghl', 'app']

export function EtatSources({ etats }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SOURCES_EXTERNES.map(s => {
        const e = etats[s] ?? {}
        if (e.chargement) return <Pastille key={s}>{NOM_INDISPONIBLE[s]} : chargement…</Pastille>
        if (e.raison) return <Pastille key={s} ton="danger" title={e.raison}>{NOM_INDISPONIBLE[s]} indisponible</Pastille>
        return <Pastille key={s} ton="succes">{NOM_INDISPONIBLE[s]} : {e.elements?.length ?? 0}</Pastille>
      })}
    </div>
  )
}

function FilDepuisHistorique({ threadId }) {
  const [etat, setEtat] = useState({ chargement: true, messages: [], raison: null })
  useEffect(() => {
    let actif = true
    appelAdjoint('filGmail', { threadId })
      .then(r => actif && setEtat({ chargement: false, messages: r.messages ?? [], raison: r.indisponible ? r.raison : null }))
      .catch(e => actif && setEtat({ chargement: false, messages: [], raison: e.message }))
    return () => { actif = false }
  }, [threadId])
  if (etat.chargement) return <p className="m-0 text-sm text-[#5b616e]">Chargement du fil…</p>
  if (etat.raison || !etat.messages.length) return <p className="m-0 text-sm text-[#5b616e]">Courriel original indisponible{etat.raison ? ` (${etat.raison})` : ''}</p>
  return <FilConversation messages={etat.messages} />
}

function Element({ e, onOuvrirDossier }) {
  const [ouvert, setOuvert] = useState(false)
  const src = SOURCES[e.source]
  const dec = e.decision ? DECISIONS[e.decision] : null
  const cliquable = e.source === 'leo' || e.source === 'gmail'
  const ouvrir = () => (e.source === 'leo' ? onOuvrirDossier(e.ref.id) : setOuvert(o => !o))
  return (
    <Carte className="p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 w-8 h-8 rounded-lg grid place-items-center ${e.source === 'leo' ? 'bg-[#e3f6f4] text-[#00665f]' : 'bg-[#f1f3f5] text-[#3d434f]'}`}>
          <Icone nom={e.source === 'leo' ? (e.canal ?? 'leo') : src.icone} taille={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="m-0 text-xs text-[#5b616e]">
            {src.label}{e.source === 'leo' && CANAUX[e.canal] ? ` · ${CANAUX[e.canal].label}` : ''} · {formatDateHeure(e.date)}
            {e.nombre > 1 && e.source === 'gmail' ? ` · ${e.nombre} messages` : ''}
          </p>
          {cliquable
            ? <button type="button" onClick={ouvrir} className="text-left text-[14px] font-extrabold hover:text-[#00857e] break-words">{e.titre}</button>
            : <p className="m-0 text-[14px] font-extrabold break-words">{e.titre}</p>}
          {e.extrait && (
            <p className="m-0 mt-0.5 text-[13px] text-[#3d434f] break-words">
              {e.sens === 'envoye' && e.source !== 'leo' ? <span className="text-[#00665f] font-semibold">Nous : </span> : null}{e.extrait}
            </p>
          )}
        </div>
        {dec && <Pastille ton={TON_DECISION[dec.ton]}>{dec.label}</Pastille>}
      </div>
      {ouvert && e.source === 'gmail' && <FilDepuisHistorique threadId={e.ref.threadId} />}
    </Carte>
  )
}

export function LigneHistorique({ elements, filtre, onOuvrirDossier }) {
  const liste = filtre ? elements.filter(e => e.source === filtre) : elements
  if (!liste.length) return <Carte><Vide>Aucun échange trouvé.</Vide></Carte>
  return (
    <div className="flex flex-col gap-2.5">
      {liste.map(e => <Element key={e.cle} e={e} onOuvrirDossier={onOuvrirDossier} />)}
    </div>
  )
}

export function FiltresSources({ elements, filtre, onFiltre }) {
  const presentes = Object.keys(SOURCES).filter(s => elements.some(e => e.source === s))
  const bouton = (cle, label, n) => (
    <button
      key={cle ?? 'tout'}
      type="button"
      onClick={() => onFiltre(cle)}
      className={`text-xs font-bold px-2.5 py-1 rounded-full border ${filtre === cle ? 'bg-[#00857e] text-white border-[#00857e]' : 'bg-white text-[#3d434f] border-[#e6e8ec] hover:border-[#00bbb1]'}`}
    >
      {label} <span className="opacity-70">{n}</span>
    </button>
  )
  return (
    <div className="flex flex-wrap gap-1.5">
      {bouton(null, 'Tout', elements.length)}
      {presentes.map(s => bouton(s, SOURCES[s].label, elements.filter(e => e.source === s).length))}
    </div>
  )
}
