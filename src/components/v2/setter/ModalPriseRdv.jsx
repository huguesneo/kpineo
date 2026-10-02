import { useEffect, useState } from 'react'
import { BASE_BOOKING_URL, SETTERS, BookingIframe } from '../../../pages/CentreVente'
import { lienPrendreRdv } from '../../../lib/v2/booking'

// Fenêtre « Prendre un rendez-vous » : la rencontre découverte du Centre de
// vente, dans l'app, avec le setter (booking_source) et le lead préremplis.
// Si le setter connecté n'est pas dans la liste du Centre de vente, il choisit
// son prénom comme à l'étape 1 du Centre de vente.
export default function ModalPriseRdv({ lead, cleSetter, onClose }) {
  const [cleChoisie, setCleChoisie] = useState(cleSetter)
  useEffect(() => { setCleChoisie(cleSetter) }, [cleSetter, lead?.key])

  // Bloque le défilement de la page derrière, Échap ferme
  useEffect(() => {
    if (!lead) return undefined
    document.body.style.overflow = 'hidden'
    const surTouche = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', surTouche)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', surTouche) }
  }, [lead, onClose])

  if (!lead) return null
  const setter = SETTERS.find(s => s.key === cleChoisie)
  const src = cleChoisie ? lienPrendreRdv({ base: BASE_BOOKING_URL, cleSetter: cleChoisie, lead }) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6" role="dialog" aria-modal="true" aria-label={`Prendre un rendez-vous pour ${lead.nom}`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#e5e7eb]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-[#00bbb1] uppercase tracking-widest">Rencontre découverte</p>
            <h2 className="text-lg font-black text-[#1a1a1a] truncate">
              {lead.chaud && '🔥 '}{lead.nom}
            </h2>
            <p className="text-xs text-[#6b7280] truncate">
              {[lead.email, lead.telephone].filter(Boolean).join(' · ') || 'Coordonnées absentes de la carte GHL'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-4 sm:px-6 py-4">
          {src ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-amber-800">N'oublie pas de choisir avec qui tu veux mettre la rencontre dans le calendrier !</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Bookée par <span className="font-bold">{setter?.label ?? cleChoisie}</span> · booking source : <span className="font-bold">{cleChoisie}</span>
                  </p>
                </div>
                {!cleSetter && (
                  <button onClick={() => setCleChoisie(null)}
                    className="text-xs font-bold text-[#6b7280] hover:text-[#1a1a1a] bg-white border border-[#e5e7eb] px-3 py-2 rounded-lg flex-shrink-0">
                    ← Changer de prénom
                  </button>
                )}
              </div>
              <BookingIframe src={src} />
            </>
          ) : (
            <div className="max-w-md mx-auto py-8 text-center">
              <p className="text-xs font-black uppercase tracking-widest text-[#00bbb1] mb-2">Qui envoie cette rencontre ?</p>
              <p className="text-sm text-[#b45309] mb-6">Ton prénom n'est pas dans la liste du Centre de vente : choisis le setter à qui attribuer le rendez-vous.</p>
              <div className="grid grid-cols-3 gap-3">
                {SETTERS.map(s => (
                  <button key={s.key} onClick={() => setCleChoisie(s.key)}
                    className="px-4 py-3 rounded-xl border-2 border-[#e5e7eb] text-sm font-bold text-[#4b5563] hover:border-[#00bbb1] hover:text-[#00bbb1] hover:bg-[#00bbb1]/5">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
