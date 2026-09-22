import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useCloserAppointments } from '../useCloserData'
import { saveRowChangesToEOD } from '../useCloserEOD'
import { PIPELINE_VENTE, PIPELINE_SETTING } from '../../lib/v2/salesConfig'
import { listeDuJour, prochainRdv, mesDecisions } from '../../lib/v2/closerAgenda'
import { jourMontreal } from '../../lib/v2/setterFiles'
import { useRealtimeRefetch } from './useRealtimeRefetch'

function plusJours(jour, n) {
  const d = new Date(jour + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Données de l'onglet « Aujourd'hui » du closeur : RDV du jour et des 7 prochains
// jours (prochain RDV), rapport EOD du jour, décisions, cartes setting liées.
export function useCloserAgenda(profile, { enabled = true } = {}) {
  const userId = profile?.id ?? null
  const closerName = enabled ? (profile?.full_name ?? null) : null
  const ghlUserId = enabled ? (profile?.ghl_user_id ?? null) : null

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(iv)
  }, [])

  const today = jourMontreal(new Date(now))
  const { appointments, loading: apptLoading, refetch: refetchAppts } =
    useCloserAppointments(closerName, today, plusJours(today, 7), ghlUserId)

  const [eodRows, setEodRows] = useState([])
  const [opps, setOpps] = useState([])
  const [oppsLoading, setOppsLoading] = useState(true)

  const loadEOD = useCallback(async () => {
    if (!enabled || !userId) return
    const { data } = await supabase
      .from('end_of_day_reports')
      .select('data')
      .eq('user_id', userId)
      .eq('role', 'closer')
      .eq('report_date', today)
      .maybeSingle()
    setEodRows(data?.data?.rows ?? [])
  }, [enabled, userId, today])

  const contactIds = useMemo(
    () => [...new Set((appointments ?? []).map(a => a.contact_id).filter(Boolean))].sort(),
    [appointments],
  )
  const cleContacts = contactIds.join(',')

  const loadOpps = useCallback(async () => {
    if (!enabled) { setOppsLoading(false); return }
    const S = PIPELINE_VENTE.stages
    const cols = 'ghl_id, contact_id, contact_name, pipeline_id, pipeline_stage_id, monetary_value, source, created_at_ghl, raw'
    const [vente, setting] = await Promise.all([
      supabase.from('ghl_opportunities').select(cols)
        .eq('pipeline_id', PIPELINE_VENTE.id)
        .in('pipeline_stage_id', [S.rdvDecisionBooke, S.enDecision]),
      cleContacts
        ? supabase.from('ghl_opportunities').select(cols)
          .eq('pipeline_id', PIPELINE_SETTING.id)
          .in('contact_id', cleContacts.split(','))
        : Promise.resolve({ data: [] }),
    ])
    setOpps([...(vente.data ?? []), ...(setting.data ?? [])])
    setOppsLoading(false)
  }, [enabled, cleContacts])

  useEffect(() => { loadEOD() }, [loadEOD])
  useEffect(() => { loadOpps() }, [loadOpps])

  const refetch = useCallback(() => { refetchAppts(); loadEOD(); loadOpps() }, [refetchAppts, loadEOD, loadOpps])
  useRealtimeRefetch(['ghl_appointments', 'ghl_opportunities'], refetch, { enabled })

  const duJour = useMemo(
    () => (appointments ?? []).filter(a => a.start_time && jourMontreal(new Date(a.start_time)) === today),
    [appointments, today],
  )
  const jour = useMemo(() => listeDuJour(duJour, eodRows, now), [duJour, eodRows, now])
  const prochain = useMemo(() => prochainRdv(appointments, now), [appointments, now])
  const decisions = useMemo(() => mesDecisions(opps, profile?.full_name, now), [opps, profile?.full_name, now])

  // Statuer un RDV : rapport EOD + GHL (même logique que AppointmentStatusPopup),
  // objection sur la carte Vente quand ce n'est pas une vente (CloserEODForm).
  const statuer = useCallback(async (appt, { status, isClosed = null, objection = '', precision = '' }) => {
    const changes = { status }
    if (status === 'show' && isClosed != null) {
      changes.is_closed = isClosed
      if (isClosed === false) {
        changes.objection_principale = objection
        changes.objection_reason = objection === 'Autre' ? precision : ''
      }
    }
    // Mise à jour optimiste de la ligne EOD
    setEodRows(prev => {
      const i = prev.findIndex(r => r.ghl_appointment_id === appt.ghl_id)
      if (i >= 0) return prev.map((r, j) => j === i ? { ...r, ...changes } : r)
      return [...prev, { ghl_appointment_id: appt.ghl_id, contact_id: appt.contact_id, ...changes }]
    })
    const taches = [
      saveRowChangesToEOD(userId, appt, changes),
      appt.ghl_id
        ? supabase.functions.invoke('ghl-update-appointment', {
          body: { appointmentId: appt.ghl_id, contactId: appt.contact_id || undefined, status },
        })
        : Promise.resolve({}),
    ]
    if (changes.is_closed === false && objection && appt.contact_id) {
      taches.push(supabase.functions.invoke('ghl-update-opportunity', {
        body: { contactId: appt.contact_id, objectionPrincipale: objection },
      }))
    }
    const res = await Promise.allSettled(taches)
    const echecs = res.filter(r => r.status === 'rejected' || r.value?.error || r.value?.data?.error)
    loadEOD()
    return echecs.length
      ? { error: `${echecs.length} mise(s) à jour échouée(s). Le statut est gardé dans ton rapport de fin de journée.` }
      : { error: null }
  }, [userId, loadEOD])

  return {
    today, now, appointments, jour, prochain, decisions, opps, eodRows,
    loading: apptLoading || oppsLoading,
    aStatuerCount: jour.epingles.length,
    statuer, refetch,
  }
}
