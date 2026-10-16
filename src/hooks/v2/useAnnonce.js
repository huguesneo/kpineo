import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const cleSession = (annonce, userId) => `neo.annonce.plustard.${annonce}.${userId}`

// Démo d'une mise à jour : à proposer tant que la personne ne l'a pas vue
// (app_annonces_vues). « Plus tard » la cache jusqu'à la prochaine connexion
// (sessionStorage : nouvel onglet ou nouvelle session = reproposée).
export function useAnnonce(annonce, userId, { enabled = true } = {}) {
  const [aProposer, setAProposer] = useState(false)

  useEffect(() => {
    // Changement de compte sans recharger : repartir de zéro
    setAProposer(false)
    if (!enabled || !userId) return undefined
    let annule = false
    let plusTard = false
    try { plusTard = sessionStorage.getItem(cleSession(annonce, userId)) === '1' } catch { /* navigation privée */ }
    if (plusTard) return undefined
    supabase.from('app_annonces_vues').select('annonce').eq('user_id', userId).eq('annonce', annonce).maybeSingle()
      .then(({ data, error }) => { if (!annule && !error && !data) setAProposer(true) })
    return () => { annule = true }
  }, [annonce, userId, enabled])

  const plusTard = useCallback(() => {
    setAProposer(false)
    try { sessionStorage.setItem(cleSession(annonce, userId), '1') } catch { /* */ }
  }, [annonce, userId])

  const marquerVue = useCallback(async (terminee = false) => {
    setAProposer(false)
    if (!userId) return
    await supabase.from('app_annonces_vues').upsert({ user_id: userId, annonce, vu_le: new Date().toISOString(), terminee })
  }, [annonce, userId])

  return { aProposer, plusTard, marquerVue }
}
