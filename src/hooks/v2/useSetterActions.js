import { useState, useCallback } from 'react'
import { BASE_BOOKING_URL, SETTERS } from '../../pages/CentreVente'
import { lienFicheGHL } from '../../lib/v2/salesConfig'
import { cleBookingSetter, lienPrendreRdv } from '../../lib/v2/booking'

// Actions du setter sur un lead. L'app ne déplace aucune carte.
// « Pas de réponse » a été retiré : GHL enregistre lui-même les appels sans réponse.
// etats : { [lead.key]: 'reservation' }
export function useSetterActions({ profile, lock, unlock }) {
  const [etats, setEtats] = useState({})
  // Clé booking_source du setter connecté (null : absent de la liste du Centre de vente)
  const cleSetter = cleBookingSetter(profile?.full_name, SETTERS)

  const setEtat = (key, v) => setEtats(prev => {
    const n = { ...prev }
    if (v) n[key] = v; else delete n[key]
    return n
  })

  // « Prendre un rendez-vous » : rencontre découverte avec le setter (attribution)
  // et le lead préremplis, comme le Centre de vente. Prend le lead 15 min.
  const prendreRdv = useCallback(async (lead) => {
    // Ouvrir avant tout await : sinon le navigateur bloque la fenêtre
    window.open(lienPrendreRdv({ base: BASE_BOOKING_URL, cleSetter, lead }), '_blank', 'noopener')
    setEtat(lead.key, 'reservation')
    await lock?.(lead.contactId)
  }, [lock, cleSetter])

  const annuler = useCallback((lead) => {
    setEtat(lead.key, null)
    unlock?.(lead.contactId)
  }, [unlock])

  // Ouvrir la fiche prend aussi le lead (15 min)
  const ouvrirFiche = useCallback(async (lead) => {
    window.open(lienFicheGHL(lead.contactId), '_blank', 'noopener')
    await lock?.(lead.contactId)
  }, [lock])

  return { etats, erreurs: {}, cleSetter, prendreRdv, annuler, ouvrirFiche }
}
