import { useEffect, useRef, useState } from 'react'
import { formatDateHeure } from '../../../supabase/functions/_shared/adjoint.js'
import { documentIframe, tailleLisible } from '../../../supabase/functions/_shared/gmailFil.js'
import { appelAdjoint } from '../../lib/adjoint/api'
import { Icone } from './ui'

// Le vrai fil Gmail de info@ dans un dossier : messages de la personne à gauche,
// ceux de info@ à droite, citations repliées. Le corps (déjà nettoyé par leo-adjoint)
// est affiché dans un iframe sandbox sans scripts. Si Gmail ne répond pas, le résumé
// de Léo reste et le dossier n'est pas bloqué.

export function ResumeLeo({ texte }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-[#5b616e]">Résumé de Léo</p>
      <p className="m-0 text-[13px] leading-relaxed text-[#5b616e] whitespace-pre-line break-words">
        {texte?.trim() || 'Non renseigné'}
      </p>
    </div>
  )
}

// iframe à la hauteur de son contenu (même origine, sans scripts). onLoad est posé à
// la création : un srcDoc peut finir de charger avant un useEffect.
function CorpsCourriel({ html }) {
  const obs = useRef(null)
  const [hauteur, setHauteur] = useState(40)
  useEffect(() => () => obs.current?.disconnect(), [])
  function charge(e) {
    const doc = e.currentTarget.contentDocument
    if (!doc?.documentElement) return
    const mesurer = () => setHauteur(Math.max(24, doc.documentElement.scrollHeight))
    mesurer()
    obs.current?.disconnect()
    if (typeof ResizeObserver !== 'undefined' && doc.body) {
      obs.current = new ResizeObserver(mesurer)
      obs.current.observe(doc.body)
    }
  }
  return (
    <iframe
      title="Courriel"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={documentIframe(html)}
      onLoad={charge}
      style={{ height: hauteur }}
      className="w-full border-0 block"
    />
  )
}

function Bulle({ m }) {
  const [citation, setCitation] = useState(false)
  const envoye = m.sens === 'envoye'
  const qui = envoye ? `info@ ${m.de?.nom ? `(${m.de.nom})` : ''}`.trim() : (m.de?.nom || m.de?.courriel || 'Expéditeur inconnu')
  return (
    <div className={`flex ${envoye ? 'justify-end' : 'justify-start'}`}>
      <div className={`w-[88%] rounded-[12px] px-4 py-3 flex flex-col gap-2 ${envoye ? 'bg-[#e3f6f4] rounded-br-[4px]' : 'bg-[#f7f8fa] rounded-bl-[4px]'}`}>
        <p className="m-0 text-xs text-[#5b616e] flex flex-wrap gap-x-1.5">
          <strong className="text-[#16181d]">{qui}</strong>
          {!envoye && m.de?.nom && <span>{m.de.courriel}</span>}
          <span>· {formatDateHeure(m.date)}</span>
        </p>
        <CorpsCourriel html={citation && m.citation ? m.html + m.citation : m.html} />
        {m.citation && (
          <button type="button" onClick={() => setCitation(c => !c)} className="self-start text-xs font-semibold text-[#00665f] hover:underline">
            {citation ? 'Masquer la citation' : 'Afficher la citation (« … a écrit : »)'}
          </button>
        )}
        {m.piecesJointes?.length > 0 && (
          <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
            {m.piecesJointes.map((pj, i) => (
              <li key={`${pj.nom}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-[#e6e8ec] bg-white px-2 py-1 text-xs text-[#3d434f]">
                <Icone nom="trombone" taille={13} />
                <span className="break-all">{pj.nom}</span>
                {tailleLisible(pj.taille) && <span className="text-[#8a909c]">{tailleLisible(pj.taille)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function FilConversation({ messages }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map(m => <Bulle key={m.id} m={m} />)}
    </div>
  )
}

export default function FilGmail({ dossier }) {
  const [etat, setEtat] = useState({ chargement: true, messages: [], raison: null })
  useEffect(() => {
    let actif = true
    setEtat({ chargement: true, messages: [], raison: null })
    appelAdjoint('fil', { id: dossier.id })
      .then(r => actif && setEtat({ chargement: false, messages: r.messages ?? [], raison: r.indisponible ? r.raison : null }))
      .catch(e => actif && setEtat({ chargement: false, messages: [], raison: e.message }))
    return () => { actif = false }
  }, [dossier.id])

  const indisponible = !etat.chargement && (etat.raison || !etat.messages.length)
  return (
    <div className="flex flex-col gap-4">
      <ResumeLeo texte={dossier.incoming_message} />
      {etat.chargement && <p className="m-0 text-sm text-[#5b616e]">Chargement du courriel…</p>}
      {indisponible && (
        <div className="rounded-[10px] border border-[#e6e8ec] bg-[#fafbfc] px-4 py-3 text-sm text-[#3d434f]">
          <strong>Courriel original indisponible</strong>
          {etat.raison && <span className="block text-xs text-[#5b616e] mt-0.5">{etat.raison}</span>}
        </div>
      )}
      {!etat.chargement && etat.messages.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[13px] font-bold">
            Conversation dans Gmail <span className="font-normal text-[#5b616e]">· {etat.messages.length} message{etat.messages.length > 1 ? 's' : ''}</span>
          </p>
          <FilConversation messages={etat.messages} />
        </div>
      )}
    </div>
  )
}
