import { useEffect } from 'react'
import EvaluationReservation from './EvaluationReservation'

// Fenêtre « Rencontre d'évaluation » du script de vente : le contenu partagé
// avec le Centre de vente, dans une fenêtre (plein écran sur téléphone).
export default function ModalEvaluation({ client, contactId, onClose, onSecours }) {
  // Échap ferme, défilement de la page bloqué
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const touche = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', touche)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', touche) }
  }, [onClose])

  const nom = `${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim() || 'Client'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Rencontre d'évaluation">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white sm:rounded-2xl shadow-2xl w-full max-w-5xl h-[100dvh] sm:h-auto sm:max-h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[#e5e7eb] flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-[#00bbb1] uppercase tracking-widest">Rencontre d'évaluation</p>
            <h2 className="text-lg font-black text-[#1a1a1a] truncate">{nom}</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <EvaluationReservation client={client} contactId={contactId} onSecours={onSecours} onTermine={onClose} />
      </div>
    </div>
  )
}
