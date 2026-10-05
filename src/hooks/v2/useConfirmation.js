import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { indexManuelles } from '../../lib/v2/confirmation'
import { useRealtimeRefetch } from './useRealtimeRefetch'

const sans = (obj, cle) => { const n = { ...obj }; delete n[cle]; return n }

async function messageDe(error, data) {
  if (data?.error) return data.error
  if (!error) return null
  let msg = error.message || 'Erreur inconnue'
  try { const j = await error.context.json(); msg = j.error ?? j.message ?? msg } catch { /* réponse non JSON */ }
  return msg
}

// Confirmer / retirer la confirmation d'une rencontre découverte (fonction
// ghl-confirmer-rencontre), et confirmations faites depuis le hub (v2_confirmations)
// pour les RDV affichés.
// locaux : { [apptId]: { action, at } } juste après un clic réussi, le temps que la
// carte Vente bouge dans GHL (etatAffiche de lib/v2/confirmation.js).
export function useConfirmation({ appointmentIds = [], enabled = true } = {}) {
  const cle = [...new Set(appointmentIds.filter(Boolean))].sort().join(',')
  const [rows, setRows] = useState([])
  // Faux tant que la migration v2_confirmations n'est pas appliquée
  const [journalDispo, setJournalDispo] = useState(true)

  const load = useCallback(async () => {
    if (!enabled || !cle) { setRows([]); return }
    const { data, error } = await supabase
      .from('v2_confirmations')
      .select('appointment_id, contact_id, confirme_par_nom, confirme_le, annule_le')
      .in('appointment_id', cle.split(','))
      .is('annule_le', null)
    if (error) { setJournalDispo(false); setRows([]); return }
    setJournalDispo(true)
    setRows(data ?? [])
  }, [enabled, cle])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(['v2_confirmations'], load, { enabled: enabled && journalDispo })

  const [locaux, setLocaux] = useState({})
  const [enCours, setEnCours] = useState({})
  const [erreurs, setErreurs] = useState({})

  const agir = useCallback(async (action, apptId) => {
    if (!apptId) return { error: 'Rendez-vous inconnu' }
    setEnCours(p => ({ ...p, [apptId]: action }))
    setErreurs(p => sans(p, apptId))
    const { data, error } = await supabase.functions.invoke('ghl-confirmer-rencontre', {
      body: { action, appointmentId: apptId },
    }).catch(e => ({ data: null, error: e }))
    const message = await messageDe(error, data)
    setEnCours(p => sans(p, apptId))
    if (message) {
      setErreurs(p => ({ ...p, [apptId]: message }))
      return { error: message }
    }
    setLocaux(p => ({ ...p, [apptId]: { action, at: Date.now() } }))
    if (data?.noteOk === false) {
      setErreurs(p => ({ ...p, [apptId]: 'C’est fait, mais la note n’a pas pu être ajoutée dans GHL.' }))
    }
    load()
    return { error: null }
  }, [load])

  const confirmer = useCallback(apptId => agir('confirmer', apptId), [agir])
  const annuler = useCallback(apptId => agir('annuler', apptId), [agir])

  return { manuelles: indexManuelles(rows), journalDispo, locaux, enCours, erreurs, confirmer, annuler, refetch: load }
}
