import { useState } from 'react'
import { fmtRdvRelatif, prenom } from '../../lib/v2/format'
import { STYLES_CONFIRMATION } from '../../lib/v2/confirmation'

// Couleur du nom d'une rencontre à venir selon son état de confirmation
export const COULEURS_NOM = {
  confirme: '#047857', nonConfirme: '#b45309', confirmationEnCours: '#4b5563', annulationEnCours: '#4b5563',
}

// Pastille « Confirmé » / « Non confirmé » / « … en cours » (état de la carte Vente)
export function PastilleConfirmation({ etat, className = '' }) {
  const s = STYLES_CONFIRMATION[etat]
  if (!s) return null
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${className}`}
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

// Bouton « Confirmer la rencontre » (ou « Annuler la confirmation » si elle a été
// faite depuis le hub), avec une demande de confirmation avant d'agir.
// etat : 'confirme' | 'nonConfirme' | 'confirmationEnCours' | 'annulationEnCours' | null
// manuelle : ligne v2_confirmations active (null : confirmée par le lead, ou pas confirmée)
export default function ConfirmerRencontre({
  nom, debut, now = Date.now(), etat, manuelle = null, enCours = null, erreur = null,
  onConfirmer, onAnnuler, libelle = 'Confirmer la rencontre', mobile = false, ouvertInitial = null,
  gauche = false, // aligné à gauche (panneau sous une ligne) plutôt qu'à droite (colonne Actions)
}) {
  const [ouvert, setOuvert] = useState(ouvertInitial)
  const qui = nom || 'ce lead'
  const quand = debut ? fmtRdvRelatif(debut, now) : ''
  const occupe = !!enCours || etat === 'confirmationEnCours' || etat === 'annulationEnCours'

  async function valider() {
    const action = ouvert
    setOuvert(null)
    if (action === 'confirmer') await onConfirmer?.()
    else if (action === 'annuler') await onAnnuler?.()
  }

  let bouton = null
  if (enCours) {
    bouton = <PastilleConfirmation etat={enCours === 'confirmer' ? 'confirmationEnCours' : 'annulationEnCours'} />
  } else if (etat === 'nonConfirme') {
    bouton = (
      <button onClick={() => setOuvert(o => (o ? null : 'confirmer'))} disabled={occupe}
        className={`text-[13px] font-semibold px-3 ${mobile ? 'h-11 flex-1' : 'py-1.5'} rounded-lg bg-[#00bbb1] text-white border border-[#00bbb1] whitespace-nowrap hover:bg-[#009e95] disabled:opacity-50`}>
        {libelle}
      </button>
    )
  } else if (etat === 'confirme') {
    bouton = manuelle ? (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#047857] font-semibold whitespace-nowrap">
          Confirmé par {prenom(manuelle.confirme_par_nom) || 'le hub'}
        </span>
        <button onClick={() => setOuvert(o => (o ? null : 'annuler'))}
          className={`text-xs font-semibold text-[#6b7280] underline underline-offset-2 hover:text-[#1a1a1a] ${mobile ? 'min-h-[44px]' : ''}`}>
          Annuler la confirmation
        </button>
      </span>
    ) : <span className="text-xs text-[#047857] font-semibold whitespace-nowrap">Confirmé par le lead</span>
  } else if (etat) {
    bouton = <PastilleConfirmation etat={etat} />
  }

  return (
    <div className={`relative flex flex-col ${mobile ? 'items-stretch' : gauche ? 'items-start' : 'items-end'} gap-1`}>
      <div className={`flex items-center ${mobile || gauche ? '' : 'justify-end'} gap-2`}>{bouton}</div>
      {ouvert && (
        <div role="alertdialog" aria-label={ouvert === 'confirmer' ? 'Confirmer la rencontre' : 'Annuler la confirmation'}
          className={`${mobile ? 'w-full' : `absolute ${gauche ? 'left-0' : 'right-0'} top-full mt-1.5 w-80 max-w-[calc(100vw-32px)]`} z-30 bg-white border border-[#e5e7eb] rounded-xl shadow-lg p-3.5 flex flex-col gap-3 text-left`}>
          {ouvert === 'confirmer' ? (
            <>
              <p className="text-sm font-bold text-[#1a1a1a]">Confirmer la rencontre de {qui}{quand ? ` (${quand})` : ''} ?</p>
              <p className="text-[13px] text-[#4b5563]">
                Le tag statut-confirme est posé dans GHL, avec une note à ton nom.
                {' '}{prenom(nom) || 'Le lead'} reçoit « Ta rencontre est confirmée. »
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-[#1a1a1a]">Annuler la confirmation de {qui} ?</p>
              <p className="text-[13px] text-[#4b5563]">
                Le tag statut-confirme est retiré et la carte Vente revient en « RDV booké ».
                Le message de confirmation déjà envoyé au lead ne peut pas être repris.
              </p>
            </>
          )}
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setOuvert(null)}
              className="text-[13px] font-semibold text-[#6b7280] px-3 py-1.5 rounded-lg hover:bg-[#f3f4f6]">
              Retour
            </button>
            <button onClick={valider}
              className={`text-[13px] font-semibold px-3 py-1.5 rounded-lg text-white ${ouvert === 'confirmer' ? 'bg-[#00bbb1] hover:bg-[#009e95]' : 'bg-[#ef4444] hover:bg-[#dc2626]'}`}>
              {ouvert === 'confirmer' ? 'Confirmer' : 'Annuler la confirmation'}
            </button>
          </div>
        </div>
      )}
      {erreur && <p role="alert" className="text-xs text-[#b91c1c] max-w-[300px]">{erreur}</p>}
    </div>
  )
}
