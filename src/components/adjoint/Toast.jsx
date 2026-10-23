import { DELAI_ANNULATION_MS } from '../../lib/adjoint/envoiDiffere'

// Toasts en bas de l'écran, un par action. Avec onAnnuler : barre de 6 secondes et
// bouton « Annuler » propre à cette action. Les erreurs sont en rouge.
export default function Toast({ toasts, onFermer }) {
  if (!toasts?.length) return null
  return (
    <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(560px,calc(100vw-32px))] flex flex-col gap-2">
      {toasts.map(toast => {
        const erreur = toast.ton === 'erreur'
        return (
          <div key={toast.cle} className={`relative overflow-hidden rounded-xl shadow-lg px-4 py-3 flex items-center gap-4 text-sm ${erreur ? 'bg-[#b42318] text-white' : 'bg-[#16181d] text-white'}`}>
            <span className="flex-1">{toast.texte}</span>
            {toast.onAnnuler && (
              <button type="button" onClick={toast.onAnnuler} className="font-extrabold text-[#5ee0d8] hover:text-white">Annuler</button>
            )}
            {!toast.onAnnuler && !toast.envoi && (
              <button type="button" onClick={() => onFermer(toast.cle)} aria-label="Fermer" className="font-bold opacity-70 hover:opacity-100">×</button>
            )}
            {toast.onAnnuler && (
              <span
                className="absolute left-0 bottom-0 h-[3px] bg-[#00bbb1] origin-left"
                style={{ width: '100%', animation: `adjoint-decompte ${DELAI_ANNULATION_MS}ms linear forwards` }}
              />
            )}
          </div>
        )
      })}
      <style>{'@keyframes adjoint-decompte { from { transform: scaleX(1) } to { transform: scaleX(0) } }'}</style>
    </div>
  )
}
