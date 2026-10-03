import { Fragment } from 'react'
import { analyserMarkdown } from '../../../lib/markdownSimple'

// Réponse de l'agent en markdown, rendue en éléments React (le texte est
// toujours échappé : aucun HTML venant de l'agent n'est interprété).

function EnLigne({ morceaux }) {
  return morceaux.map((m, i) => {
    if (m.type === 'gras') return <strong key={i} className="font-semibold"><EnLigne morceaux={m.enfants} /></strong>
    if (m.type === 'italique') return <em key={i}><EnLigne morceaux={m.enfants} /></em>
    if (m.type === 'code') return <code key={i} className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em]">{m.texte}</code>
    return <Fragment key={i}>{m.texte}</Fragment>
  })
}

const TAILLES_TITRE = { 1: 'text-base', 2: 'text-[15px]', 3: 'text-sm' }

function Bloc({ bloc }) {
  switch (bloc.type) {
    case 'titre': {
      const Balise = `h${Math.min(6, bloc.niveau + 2)}`
      return <Balise className={`${TAILLES_TITRE[bloc.niveau] || 'text-sm'} font-bold text-[#1a1a1a]`}><EnLigne morceaux={bloc.contenu} /></Balise>
    }
    case 'liste': {
      const Balise = bloc.ordonnee ? 'ol' : 'ul'
      return (
        <Balise className={`${bloc.ordonnee ? 'list-decimal' : 'list-disc'} pl-5 space-y-0.5`}>
          {bloc.elements.map((e, i) => <li key={i}><EnLigne morceaux={e} /></li>)}
        </Balise>
      )
    }
    case 'tableau':
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                {bloc.entetes.map((c, i) => (
                  <th key={i} className="border border-[#e5e7eb] bg-gray-50 px-2 py-1 text-left font-semibold"><EnLigne morceaux={c} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloc.lignes.map((ligne, i) => (
                <tr key={i}>
                  {ligne.map((c, j) => <td key={j} className="border border-[#e5e7eb] px-2 py-1 align-top"><EnLigne morceaux={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'code':
      return <pre className="overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 text-xs whitespace-pre"><code>{bloc.texte}</code></pre>
    case 'separateur':
      return <hr className="border-[#e5e7eb]" />
    default:
      return (
        <p>
          {bloc.lignes.map((l, i) => (
            <Fragment key={i}>{i > 0 && <br />}<EnLigne morceaux={l} /></Fragment>
          ))}
        </p>
      )
  }
}

export default function TexteMarkdown({ texte }) {
  return (
    <div className="space-y-2" data-markdown="">
      {analyserMarkdown(texte).map((b, i) => <Bloc key={i} bloc={b} />)}
    </div>
  )
}
