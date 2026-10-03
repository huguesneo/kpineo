import { useEffect, useRef } from 'react'
import { dateFr } from './PastilleMac'

function Entete({ qui, date, version }) {
  return (
    <p className="text-xs text-[#6b7280] mb-1">
      <span className="font-semibold text-[#374151]">{qui}</span>
      {date && <> · {dateFr(date)}</>}
      {version && <> · v{version}</>}
    </p>
  )
}

function EtatDemande({ statut, job }) {
  if (statut === 'en_cours') {
    const progression = job?.progression ?? 0
    return (
      <div className="mt-2">
        <p className="text-xs text-[#00bbb1] font-semibold">{job?.etape || "L'agent travaille sur ta demande"} · {progression} %</p>
        <div className="mt-1 h-1.5 rounded-full bg-white overflow-hidden">
          <div className="h-full bg-[#00bbb1] transition-all" style={{ width: `${progression}%` }} />
        </div>
      </div>
    )
  }
  return <p className="text-xs text-[#6b7280] mt-2">En attente de l'agent</p>
}

// Fil de conversation : demande de l'utilisateur, puis réponse de l'agent,
// version par version (messages préparés par filConversation).
export default function FilConversation({ messages, noms = {}, job }) {
  const fin = useRef(null)
  useEffect(() => {
    fin.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length])

  if (!messages.length) {
    return (
      <p className="text-sm text-[#6b7280] text-center py-10 px-4">
        Les demandes et les réponses de l'agent apparaîtront ici.
      </p>
    )
  }
  return (
    <ol className="space-y-4" aria-label="Fil de conversation">
      {messages.map(m => {
        if (m.role === 'demande') {
          return (
            <li key={m.cle} className="flex flex-col items-end" data-role="demande">
              <Entete qui={noms[m.auteur] || m.auteur || 'Toi'} date={m.date} />
              <div className={`max-w-[90%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                m.enAttente ? 'bg-[#00bbb1]/5 border border-dashed border-[#00bbb1]/40 text-[#1a1a1a]' : 'bg-[#00bbb1] text-white'
              }`}>
                {m.texte}
                {m.enAttente && <EtatDemande statut={m.enAttente} job={job} />}
              </div>
            </li>
          )
        }
        if (m.role === 'erreur') {
          return (
            <li key={m.cle} className="flex flex-col items-start" data-role="erreur">
              <Entete qui="Agent de montage" date={m.date} />
              <div className="max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700 whitespace-pre-wrap break-words">
                {m.texte}
                <p className="text-xs mt-2 text-red-600">Tu peux renvoyer une demande ci-dessous.</p>
              </div>
            </li>
          )
        }
        return (
          <li key={m.cle} className="flex flex-col items-start" data-role="agent">
            <Entete qui="Agent de montage" date={m.date} version={m.version} />
            <div className="max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-white border border-[#e5e7eb] text-[#1a1a1a] whitespace-pre-wrap break-words">
              {m.texte}
            </div>
          </li>
        )
      })}
      <li ref={fin} aria-hidden="true" />
    </ol>
  )
}
