import { useCallback, useEffect, useState } from 'react'
import { appelAdjoint, EVENEMENT_MAJ } from '../lib/adjoint/api'

// Les 4 compteurs de la page Adjoint et le badge du menu. Relus après chaque
// décision (événement adjoint:maj) et toutes les 2 minutes.
export function useAdjointCompteurs(actif) {
  const [compteurs, setCompteurs] = useState(null)

  const charger = useCallback(() => {
    if (!actif) return
    appelAdjoint('compteurs').then(setCompteurs).catch(() => { /* badge seulement : on garde le dernier */ })
  }, [actif])

  useEffect(() => {
    if (!actif) return undefined
    charger()
    const minuteur = setInterval(charger, 120000)
    window.addEventListener(EVENEMENT_MAJ, charger)
    return () => {
      clearInterval(minuteur)
      window.removeEventListener(EVENEMENT_MAJ, charger)
    }
  }, [actif, charger])

  return { compteurs, recharger: charger }
}
