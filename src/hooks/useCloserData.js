import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  GHL_PIPELINE_CLOSER,
  GHL_CALENDAR_DECISION,
  GHL_STAGE_GAGNE,
  GHL_FIELD_CLOSER,
  GHL_FIELD_DATE_CLOSE,
  COMMISSION_RATE,
  fetchAllRows,
  getGHLField,
  parseGHLDate,
  closeDateForDisplay,
  isCloseInPeriod,
  isWonStage,
  closerFieldMatches,
  getCloserField,
} from '../lib/ghlHelpers'

// Ré-exports pour compatibilité avec les imports existants
export {
  GHL_PIPELINE_CLOSER,
  GHL_CALENDAR_DECISION,
  GHL_STAGE_GAGNE,
  GHL_FIELD_CLOSER,
  GHL_FIELD_DATE_CLOSE,
  COMMISSION_RATE,
  parseGHLDate,
}

// ─── Status GHL → label FR ────────────────────────────────────
export const APPT_STATUS_LABELS = {
  confirmed: 'Confirmé',
  cancelled:  'Annulé',
  noshow:     'No Show',
  showed:     'Show',
  attended:   'Show',
  new:        'Nouveau',
  pending:    'En attente',
}

export const APPT_STATUS_COLORS = {
  confirmed: { bg: '#00bbb118', text: '#00bbb1' },
  cancelled:  { bg: '#ef444418', text: '#ef4444' },
  noshow:     { bg: '#f59e0b18', text: '#f59e0b' },
  showed:     { bg: '#10b98118', text: '#10b981' },
  attended:   { bg: '#10b98118', text: '#10b981' },
  new:        { bg: '#6b728018', text: '#6b7280' },
  pending:    { bg: '#6b728018', text: '#6b7280' },
}

// ─── Chargement paginé des opportunités du pipeline closer ────
// Une seule source pour toutes les requêtes → jamais de cap à 1000.
async function loadCloserOpps(columns = 'contact_id, contact_name, stage_name, raw, closed_at, monetary_value, ghl_id') {
  return fetchAllRows((from, to) =>
    supabase
      .from('ghl_opportunities')
      .select(columns)
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)
      .range(from, to)
  )
}

// ─── useCloserAppointments ────────────────────────────────────
// Rendez-vous depuis ghl_appointments.
// Si ghlUserId fourni : filtre direct par assigned_user_id (fiable).
// Sinon : passe par les contact_ids des opportunités (fallback).
export function useCloserAppointments(closerName, startDate, endDate, ghlUserId = null) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!startDate || !endDate) { setLoading(false); return }
    setLoading(true)

    if (ghlUserId) {
      // Chemin direct : assigned_user_id = ghlUserId
      const appts = await fetchAllRows((from, to) => supabase
        .from('ghl_appointments')
        .select('*')
        .eq('assigned_user_id', ghlUserId)
        .gte('start_time', startDate + 'T00:00:00')
        .lte('start_time', endDate   + 'T23:59:59')
        .order('start_time', { ascending: false })
        .range(from, to))
      setAppointments(appts)
      setLoading(false)
      return
    }

    if (!closerName) { setLoading(false); return }

    // Fallback : passer par les opportunités (champ closer)
    const opps = await loadCloserOpps('contact_id, raw')
    const contactIds = opps
      .filter(o => closerFieldMatches(getCloserField(o), closerName))
      .map(o => o.contact_id)
      .filter(Boolean)

    if (contactIds.length === 0) { setAppointments([]); setLoading(false); return }

    const appts = await fetchAllRows((from, to) => supabase
      .from('ghl_appointments')
      .select('*')
      .in('contact_id', contactIds)
      .gte('start_time', startDate + 'T00:00:00')
      .lte('start_time', endDate   + 'T23:59:59')
      .order('start_time', { ascending: false })
      .range(from, to))

    setAppointments(appts)
    setLoading(false)
  }, [closerName, startDate, endDate, ghlUserId])

  useEffect(() => { load() }, [load])

  const byStatus = (appointments ?? []).reduce((acc, a) => {
    const s = a.status || 'new'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  // hotCount = shows de Consultation Découverte uniquement (exclut Rencontre de Décision)
  const cdAppointments = (appointments ?? []).filter(a => a.calendar_id !== GHL_CALENDAR_DECISION)
  const cdShows = cdAppointments.filter(a => a.status === 'showed' || a.status === 'attended').length
  const hotCount = cdShows

  return { appointments, loading, byStatus, hotCount, refetch: load }
}

// ─── useCloserSales ───────────────────────────────────────────
// Ventes : opportunités au stage "🏆 Gagné", date de close dans la période.
export function useCloserSales(closerName, startDate, endDate, ghlUserId = null) {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!startDate || !endDate) { setLoading(false); return }
    setLoading(true)

    const opps = await loadCloserOpps()

    const won = opps.filter(o => {
      if (!closerFieldMatches(getCloserField(o), closerName)) return false
      if (!isWonStage(o)) return false
      return isCloseInPeriod(o, startDate, endDate)
    }).map(o => ({
      contactId:      o.contact_id ?? null,
      contactName:    o.contact_name ?? '',
      closeDate:      closeDateForDisplay(o),
      monetaryValue:  Number(o.monetary_value ?? 0),
    }))

    setSales(won)
    setLoading(false)
  }, [closerName, startDate, endDate, ghlUserId])

  useEffect(() => { load() }, [load])

  return { sales, loading, refetch: load }
}

// ─── useCloserCashCollected ───────────────────────────────────
// Cash collected : appelle la fonction Edge closer-cash-collected
export function useCloserCashCollected(closerName, startDate, endDate) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    if (!closerName || !startDate || !endDate) { setLoading(false); return }
    setLoading(true)
    setError(null)

    const { data: res, error: fnErr } = await supabase.functions.invoke('closer-cash-collected', {
      body: { closerName, startDate, endDate },
    })

    setLoading(false)
    if (fnErr) { setError(fnErr.message); return }
    if (res?.error === 'not_connected') { setData(null); return }
    if (res?.error) { setError(res.error); return }
    setData(res)
  }, [closerName, startDate, endDate])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refetch: load }
}

// ─── useCloserMonthStats (pour le dashboard admin) ────────────
// Stats agrégées pour la ligne d'un closer dans le dashboard.
// Utilise EXACTEMENT la même logique que le dashboard individuel :
// RDV par assigned_user_id si dispo, sinon par contacts.
export function useCloserMonthStats(closerName, startDate, endDate, ghlUserId = null) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!closerName || !startDate || !endDate) { setLoading(false); return }
    setLoading(true)

    const opps = await loadCloserOpps('contact_id, stage_name, raw, closed_at')
    const myOpps = opps.filter(o => closerFieldMatches(getCloserField(o), closerName))
    const contactIds = [...new Set(myOpps.map(o => o.contact_id).filter(Boolean))]

    // Rendez-vous : chemin direct par assigned_user_id si disponible (fiable),
    // sinon fallback par les contacts des opportunités.
    let appts = []
    if (ghlUserId) {
      appts = await fetchAllRows((from, to) => supabase
        .from('ghl_appointments')
        .select('status, calendar_id')
        .eq('assigned_user_id', ghlUserId)
        .gte('start_time', startDate + 'T00:00:00')
        .lte('start_time', endDate   + 'T23:59:59')
        .range(from, to))
    } else if (contactIds.length > 0) {
      appts = await fetchAllRows((from, to) => supabase
        .from('ghl_appointments')
        .select('status, calendar_id')
        .in('contact_id', contactIds)
        .gte('start_time', startDate + 'T00:00:00')
        .lte('start_time', endDate   + 'T23:59:59')
        .range(from, to))
    }

    // hotCount = shows de Consultation Découverte uniquement (exclut Rencontre de Décision)
    const hotCount = appts.filter(a =>
      (a.status === 'showed' || a.status === 'attended') && a.calendar_id !== GHL_CALENDAR_DECISION
    ).length

    // Ventes (stage Gagné + date de close dans la période)
    const salesCount = myOpps.filter(o => isWonStage(o) && isCloseInPeriod(o, startDate, endDate)).length

    const closeRate = hotCount > 0 ? Math.round((salesCount / hotCount) * 100) : null

    setStats({ rdvCount: appts.length, hotCount, salesCount, closeRate })
    setLoading(false)
  }, [closerName, startDate, endDate, ghlUserId])

  useEffect(() => { load() }, [load])

  return { stats, loading }
}

// ─── useUnassignedSales ───────────────────────────────────────
// Ventes "Gagné" sans closer assigné dans la période.
// Utile pour alerter les admins d'opportunités non tracées.
export function useUnassignedSales(startDate, endDate) {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!startDate || !endDate) { setLoading(false); return }
    setLoading(true)

    const opps = await loadCloserOpps('ghl_id, contact_name, stage_name, raw, closed_at')

    const unassigned = opps.filter(o => {
      if (getCloserField(o)) return false          // a déjà un closer
      if (!isWonStage(o)) return false
      return isCloseInPeriod(o, startDate, endDate)
    }).map(o => ({
      ghlId:       o.ghl_id,
      contactName: String(o.contact_name ?? '').trim() || '—',
      closeDate:   closeDateForDisplay(o),
    }))

    setSales(unassigned)
    setLoading(false)
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  return { sales, loading, refetch: load }
}

// ─── useDecisionContactIds ────────────────────────────────────
// Retourne le Set des contact_id qui ont eu une Rencontre de Décision
// avec ce closer, SANS filtre de date (toute l'histoire).
export function useDecisionContactIds(closerName, ghlUserId) {
  const [ids, setIds] = useState(new Set())

  const load = useCallback(async () => {
    if (!ghlUserId && !closerName) return

    if (ghlUserId) {
      const data = await fetchAllRows((from, to) => supabase
        .from('ghl_appointments')
        .select('contact_id')
        .eq('calendar_id', GHL_CALENDAR_DECISION)
        .eq('assigned_user_id', ghlUserId)
        .range(from, to))
      setIds(new Set(data.map(a => a.contact_id).filter(Boolean)))
      return
    }

    // Fallback : passer par les opportunités du closer
    const opps = await loadCloserOpps('contact_id, raw')
    const contactIds = opps
      .filter(o => closerFieldMatches(getCloserField(o), closerName))
      .map(o => o.contact_id)
      .filter(Boolean)

    if (contactIds.length === 0) return

    const appts = await fetchAllRows((from, to) => supabase
      .from('ghl_appointments')
      .select('contact_id')
      .eq('calendar_id', GHL_CALENDAR_DECISION)
      .in('contact_id', contactIds)
      .range(from, to))

    setIds(new Set(appts.map(a => a.contact_id).filter(Boolean)))
  }, [closerName, ghlUserId])

  useEffect(() => { load() }, [load])

  return ids
}
