import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { DELAIS } from '../../lib/v2/salesConfig'

// Journal d'appels GHL des contacts de la file « À confirmer » (fonction
// ghl-appels-recents : une lecture pour tous les contacts). Relu toutes les
// 5 minutes et quand la liste des contacts change.
// appels : { contactId: [{ date, statut, duree, sortant }] } ; null tant que rien n'est chargé.
export function useAppelsRecents({ contactIds = [], depuis = null, enabled = true } = {}) {
  const cle = [...new Set(contactIds.filter(Boolean))].sort().join(',')
  const [appels, setAppels] = useState(null)
  const [erreur, setErreur] = useState(null)

  const load = useCallback(async () => {
    if (!enabled || !cle) { setAppels({}); return }
    const { data, error } = await supabase.functions.invoke('ghl-appels-recents', {
      body: { contactIds: cle.split(','), depuis },
    }).catch(e => ({ data: null, error: e }))
    let message = data?.error ?? null
    if (error && !message) {
      message = error.message || 'Erreur inconnue'
      try { const j = await error.context.json(); message = j.error ?? message } catch { /* réponse non JSON */ }
    }
    if (message) { setErreur(message); return }
    setErreur(null)
    setAppels(data?.appels ?? {})
  }, [enabled, cle, depuis])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!enabled) return undefined
    const iv = setInterval(load, DELAIS.refetchSecoursMs)
    return () => clearInterval(iv)
  }, [enabled, load])

  return { appels, erreur, refetch: load }
}
