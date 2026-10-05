import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { PIPELINE_VENTE } from '../../lib/v2/salesConfig'
import { indexConfirmations, etatConfirmation, etatAffiche, rdvConfirmable } from '../../lib/v2/confirmation'
import { useConfirmation } from './useConfirmation'
import { useRealtimeRefetch } from './useRealtimeRefetch'

// État de confirmation des rencontres découverte à venir d'une liste de RDV
// (agenda closeur) : carte Vente de chaque contact, confirmations faites depuis
// le hub, actions confirmer / retirer.
// etatDe(appt) : 'confirme' | 'nonConfirme' | '…EnCours' ; null si le RDV ne se
// confirme pas (passé, décision, annulé) ou tant que les cartes ne sont pas lues.
export function useEtatsConfirmation(appointments, { now = Date.now(), enabled = true } = {}) {
  const confirmables = useMemo(
    () => (appointments ?? []).filter(a => rdvConfirmable(a, now)),
    [appointments, now],
  )
  const cleContacts = [...new Set(confirmables.map(a => a.contact_id))].sort().join(',')
  const [ventes, setVentes] = useState([])
  const [pret, setPret] = useState(false)

  const load = useCallback(async () => {
    if (!enabled || !cleContacts) { setVentes([]); setPret(true); return }
    const { data, error } = await supabase
      .from('ghl_opportunities')
      .select('ghl_id, contact_id, pipeline_id, pipeline_stage_id, created_at_ghl')
      .eq('pipeline_id', PIPELINE_VENTE.id)
      .in('contact_id', cleContacts.split(','))
    if (error) { console.error('[useEtatsConfirmation]', error); return }
    setVentes(data ?? [])
    setPret(true)
  }, [enabled, cleContacts])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(['ghl_opportunities'], load, { enabled })

  const confirmation = useConfirmation({ appointmentIds: confirmables.map(a => a.ghl_id), enabled })
  const index = useMemo(() => indexConfirmations(ventes), [ventes])
  const { locaux } = confirmation

  const etatDe = useCallback(appt => {
    if (!pret || !rdvConfirmable(appt, now)) return null
    return etatAffiche(etatConfirmation(appt.contact_id, index), locaux[appt.ghl_id], now)
  }, [pret, index, locaux, now])

  return { etatDe, confirmation }
}
