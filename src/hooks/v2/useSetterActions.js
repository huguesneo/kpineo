import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { LIEN_BOOKING_CLOSEURS, TAG_TENTATIVE_FAITE, lienFicheGHL } from '../../lib/v2/salesConfig'
import { prenom } from '../../lib/v2/format'

// Délai pendant lequel « Pas de réponse » peut être annulé avant l'envoi à GHL
export const DELAI_ANNULATION_MS = 8000

// Actions du setter sur un lead. L'app ne déplace aucune carte :
// « Pas de réponse » écrit une note et pose le tag app-tentative-faite,
// un workflow GHL avance la carte puis retire le tag.
// etats : { [lead.key]: 'nr-attente' | 'nr' | 'booke' | 'erreur' }
export function useSetterActions({ profile, lock, unlock, onCallLogged, onDone }) {
  const [etats, setEtats] = useState({})
  const [erreurs, setErreurs] = useState({})
  const timers = useRef({})

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  const setEtat = (key, v) => setEtats(prev => {
    const n = { ...prev }
    if (v) n[key] = v; else delete n[key]
    return n
  })

  const envoyerTentative = useCallback(async (lead, note) => {
    const n = lead.tentative ?? 1
    const texte = `Tentative ${n} faite depuis l'app par ${prenom(profile?.full_name) || 'un setter'}`
      + (note?.trim() ? `\nNote : ${note.trim()}` : '')
    const [noteRes, tagRes, logRes] = await Promise.allSettled([
      supabase.functions.invoke('ghl-add-contact-note', { body: { contactId: lead.contactId, note: texte } }),
      supabase.functions.invoke('ghl-add-contact-tag', { body: { contactId: lead.contactId, tags: [TAG_TENTATIVE_FAITE] } }),
      supabase.from('v2_call_attempts').insert({
        user_id: profile?.id, contact_id: lead.contactId, opportunity_id: lead.opportunityId,
        attempt: n, note: note?.trim() || null,
      }),
    ])
    const echec = [noteRes, tagRes].find(r => r.status === 'rejected' || r.value?.error || r.value?.data?.error)
    if (logRes.status === 'rejected' || logRes.value?.error) console.error('[v2_call_attempts]', logRes.reason ?? logRes.value?.error)
    if (echec) {
      const msg = echec.reason?.message ?? echec.value?.data?.error ?? echec.value?.error?.message ?? 'Erreur GHL'
      setErreurs(prev => ({ ...prev, [lead.key]: msg }))
      setEtat(lead.key, 'erreur')
      return
    }
    setEtat(lead.key, 'nr')
    unlock?.(lead.contactId)
    onDone?.()
  }, [profile, unlock, onDone])

  // Mise à jour optimiste du compteur, envoi après le délai d'annulation
  const pasDeReponse = useCallback(async (lead, note) => {
    const pris = await lock?.(lead.contactId)
    if (pris && pris.ok === false && pris.heldBy) {
      setErreurs(prev => ({ ...prev, [lead.key]: `Pris par ${pris.heldBy}` }))
      return
    }
    setErreurs(prev => { const n = { ...prev }; delete n[lead.key]; return n })
    setEtat(lead.key, 'nr-attente')
    onCallLogged?.(+1)
    timers.current[lead.key] = setTimeout(() => {
      delete timers.current[lead.key]
      envoyerTentative(lead, note)
    }, DELAI_ANNULATION_MS)
  }, [lock, onCallLogged, envoyerTentative])

  const annuler = useCallback((lead) => {
    const etat = etats[lead.key]
    if (timers.current[lead.key]) {
      clearTimeout(timers.current[lead.key])
      delete timers.current[lead.key]
    }
    if (etat === 'nr-attente') onCallLogged?.(-1)
    setEtat(lead.key, null)
    setErreurs(prev => { const n = { ...prev }; delete n[lead.key]; return n })
    unlock?.(lead.contactId)
  }, [etats, onCallLogged, unlock])

  // « Booké » : prend le lead et ouvre le calendrier closeurs (réservation dans GHL)
  const booke = useCallback(async (lead) => {
    // Ouvrir avant tout await : sinon le navigateur bloque la fenêtre
    window.open(LIEN_BOOKING_CLOSEURS, '_blank', 'noopener')
    setEtat(lead.key, 'booke')
    await lock?.(lead.contactId)
  }, [lock])

  // Ouvrir la fiche prend aussi le lead (15 min)
  const ouvrirFiche = useCallback(async (lead) => {
    window.open(lienFicheGHL(lead.contactId), '_blank', 'noopener')
    await lock?.(lead.contactId)
  }, [lock])

  return { etats, erreurs, pasDeReponse, annuler, booke, ouvrirFiche }
}
