import { texteBandeau, derniereAnnulable } from '../../lib/adjoint/actions'

// Un seul petit bandeau en bas à gauche (juste à droite de la barre latérale de 240 px), loin des boutons du dossier : « 3 actions en cours ·
// Annuler la dernière ». Il disparaît quand tout est parti. Les erreurs restent au-dessus,
// en rouge, jusqu'à ce qu'on les ferme.
export default function Bandeau({ actions, erreurs, onFermerErreur }) {
  const derniere = derniereAnnulable(actions)
  if (!actions.length && !erreurs.length) return null
  return (
    <div className="fixed bottom-4 left-64 z-50 flex flex-col items-start gap-2 max-w-[min(420px,calc(100vw-32px))]">
      {erreurs.map(e => (
        <div key={e.cle} role="alert" className="rounded-lg bg-[#b42318] text-white text-[13px] px-3.5 py-2.5 shadow-md flex items-start gap-3">
          <span className="flex-1">{e.texte}</span>
          <button type="button" onClick={() => onFermerErreur(e.cle)} aria-label="Fermer" className="font-bold opacity-80 hover:opacity-100 leading-none">×</button>
        </div>
      ))}
      {actions.length > 0 && (
        <div role="status" aria-live="polite" className="rounded-full bg-white border border-[#d5d9e0] shadow-sm text-[12px] text-[#3d434f] px-3 py-1.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00bbb1] animate-pulse" aria-hidden="true" />
          <span>{texteBandeau(actions.length)}</span>
          {derniere && (
            <>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={derniere.annuler} className="font-bold text-[#00857e] hover:underline">Annuler la dernière</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
