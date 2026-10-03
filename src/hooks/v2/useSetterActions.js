import { useState, useCallback } from 'react'
import { SETTERS } from '../../pages/CentreVente'
import { lienFicheGHL } from '../../lib/v2/salesConfig'
import { cleBookingSetter } from '../../lib/v2/booking'

// Actions du setter sur un lead. L'app ne déplace aucune carte.
// « Pas de réponse » a été retiré : GHL enregistre lui-même les appels sans réponse.
// etats : { [lead.key]: 'reservation' }
export function useSetterActions({ profile, lock, unlock }) {
  const [etats, setEtats] = useState({})
  // Lead dont la fenêtre « Prendre un rendez-vous » est ouverte
  const [rdvEnCours, setRdvEnCours] = useState(null)
  // Clé booking_source du setter connecté (null : absent de la liste du Centre de vente)
  const cleSetter = cleBookingSetter(profile?.full_name, SETTERS)

  const setEtat = (key, v) => setEtats(prev => {
    const n = { ...prev }
    if (v) n[key] = v; else delete n[key]
    return n
  })

  // « Prendre un rendez-vous » : ouvre la fenêtre de réservation dans l'app
  // (rencontre découverte, setter et lead préremplis). Prend le lead 15 min.
  const prendreRdv = useCallback(async (lead) => {
    setRdvEnCours(lead)
    setEtat(lead.key, 'reservation')
    await lock?.(lead.contactId)
  }, [lock])

  const fermerRdv = useCallback(() => setRdvEnCours(null), [])

  const annuler = useCallback((lead) => {
    setEtat(lead.key, null)
    unlock?.(lead.contactId)
  }, [unlock])

  // Ouvrir la fiche prend aussi le lead (15 min)
  const ouvrirFiche = useCallback(async (lead) => {
    window.open(lienFicheGHL(lead.contactId), '_blank', 'noopener')
    await lock?.(lead.contactId)
  }, [lock])

  return { etats, erreurs: {}, cleSetter, prendreRdv, rdvEnCours, fermerRdv, annuler, ouvrirFiche }
}
