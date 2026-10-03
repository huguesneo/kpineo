import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { MONTAGE_VIDEO_ENABLED, lireAccesMontage } from '../lib/montageVideoAccess'

// Une seule lecture de has_montage_access() par compte connecté, partagée
// entre le menu et les routes. Un échec n'est pas gardé : on réessaie au
// prochain affichage.
const reponses = new Map()
const enCours = new Map()

function demanderAcces(cle) {
  if (!enCours.has(cle)) {
    enCours.set(cle, lireAccesMontage(supabase).then(acces => {
      enCours.delete(cle)
      if (acces !== null) reponses.set(cle, acces)
      return acces === true
    }))
  }
  return enCours.get(cle)
}

// { acces, loading } : accès au module Montage vidéo pour le compte connecté.
// Toujours faux, sans appel à la base, quand VITE_MONTAGE_VIDEO est éteint.
export function useMontageVideoAccess() {
  const { user } = useAuth()
  const cle = MONTAGE_VIDEO_ENABLED && user ? user.id : null
  const [etat, setEtat] = useState(() => (cle && reponses.has(cle) ? { cle, acces: reponses.get(cle) } : null))

  useEffect(() => {
    if (!cle) return
    if (reponses.has(cle)) { setEtat({ cle, acces: reponses.get(cle) }); return }
    let actif = true
    demanderAcces(cle).then(acces => { if (actif) setEtat({ cle, acces }) })
    return () => { actif = false }
  }, [cle])

  if (!cle) return { acces: false, loading: false }
  if (etat?.cle !== cle) return { acces: false, loading: true }
  return { acces: etat.acces, loading: false }
}
