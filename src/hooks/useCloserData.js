import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export const GHL_PIPELINE_CLOSER    = 'YPTruORTl0LOSdS2vWJS'
export const GHL_CALENDAR_DECISION  = 'BQK4NoyrVNuJA3e1VHDH'
export const GHL_STAGE_GAGNE      = '🏆 Gagné'
export const GHL_FIELD_CLOSER     = 'JSltN3nE7nm4cUjuGxTs'
export const GHL_FIELD_DATE_CLOSE = 'UPqvJX8MkZ4thsPX2tjV'
export const COMMISSION_RATE      = 0.086

// ─── Helper : extraire un champ custom GHL ────────────────────
// GHL stocke les champs par "id" (pas key/fieldKey) et la valeur
// dans fieldValueString / fieldValueDate / fieldValueNumber.
function getGHLField(raw, fieldId) {
  const fields = raw?.customFields ?? []
  const f = fields.find(f => f.id === fieldId || f.key === fieldId || f.fieldKey === fieldId)
  if (!f) return null
  return f.fieldValueNumber ?? f.fieldValueString ?? f.fieldValueDate ?? f.value ?? null
}

// ─── Helper : parser une date GHL (Unix ts ou ISO) ────────────
export function parseGHLDate(v) {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) {
    const d = new Date(n > 9_999_999_999 ? n : n * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
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
      const { data: appts } = await supabase
        .from('ghl_appointments')
        .select('*')
        .eq('assigned_user_id', ghlUserId)
        .gte('start_time', startDate + 'T00:00:00')
        .lte('start_time', endDate   + 'T23:59:59')
        .order('start_time', { ascending: false })
      setAppointments(appts ?? [])
      setLoading(false)
      return
    }

    if (!closerName) { setLoading(false); return }

    // Fallback : passer par les opportunités (champ closer)
    const { data: opps } = await supabase
      .from('ghl_opportunities')
      .select('contact_id, raw')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)

    const nl = closerName.trim().toLowerCase()
    const firstName = nl.split(' ')[0]
    const contactIds = (opps ?? [])
      .filter(o => {
        const cf = getGHLField(o.raw ?? {}, GHL_FIELD_CLOSER)?.trim().toLowerCase() ?? ''
        if (!cf) return false
        return cf === nl || cf === firstName || nl.startsWith(cf) || cf.startsWith(firstName)
      })
      .map(o => o.contact_id)
      .filter(Boolean)

    if (contactIds.length === 0) { setAppointments([]); setLoading(false); return }

    const { data: appts } = await supabase
      .from('ghl_appointments')
      .select('*')
      .in('contact_id', contactIds)
      .gte('start_time', startDate + 'T00:00:00')
      .lte('start_time', endDate   + 'T23:59:59')
      .order('start_time', { ascending: false })

    setAppointments(appts ?? [])
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

    const { data: opps } = await supabase
      .from('ghl_opportunities')
      .select('contact_id, contact_name, stage_name, raw, closed_at, monetary_value')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)

    const nl        = closerName?.trim().toLowerCase() ?? ''
    const firstName = nl.split(' ')[0]
    const startMs   = new Date(startDate + 'T00:00:00').getTime()
    const endMs     = new Date(endDate   + 'T23:59:59').getTime()

    const won = (opps ?? []).filter(o => {
      const raw = o.raw ?? {}
      // Toujours matcher par le champ custom "closer" (assigned_to peut être vide en DB)
      const closerField = getGHLField(raw, GHL_FIELD_CLOSER)
      const cf = closerField?.trim().toLowerCase() ?? ''
      if (!cf) return false
      if (cf !== nl && cf !== firstName && !nl.startsWith(cf) && !cf.startsWith(firstName)) return false

      // Stage Gagné via stage_name (colonne DB) OU raw
      const stageName = String(o.stage_name ?? o.raw?.pipelineStage?.name ?? '')
      if (!stageName.includes('Gagné') && !stageName.includes('gagne')) return false

      // Date de close dans la période
      const closeDateRaw = getGHLField(raw, GHL_FIELD_DATE_CLOSE)
      const closeDate = parseGHLDate(closeDateRaw) ?? (o.closed_at ? new Date(o.closed_at) : null)
      if (!closeDate) return false
      const ms = closeDate.getTime()
      return ms >= startMs && ms <= endMs
    }).map(o => {
      const raw = o.raw ?? {}
      const closeDateRaw = getGHLField(raw, GHL_FIELD_DATE_CLOSE)
      const closeDate = parseGHLDate(closeDateRaw) ?? (o.closed_at ? new Date(o.closed_at) : null)
      return {
        contactId:      o.contact_id ?? null,
        contactName:    o.contact_name ?? '',
        closeDate,
        monetaryValue:  Number(o.monetary_value ?? 0),
      }
    })

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
// Stats agrégées du mois courant pour la ligne d'un closer dans le dashboard.
export function useCloserMonthStats(closerName, startDate, endDate) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!closerName || !startDate || !endDate) { setLoading(false); return }
    setLoading(true)

    const { data: opps } = await supabase
      .from('ghl_opportunities')
      .select('contact_id, stage_name, raw, closed_at')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)

    const nl        = closerName.trim().toLowerCase()
    const firstName = nl.split(' ')[0]
    const startMs   = new Date(startDate + 'T00:00:00').getTime()
    const endMs     = new Date(endDate   + 'T23:59:59').getTime()

    const myOpps = (opps ?? []).filter(o => {
      const cf = getGHLField(o.raw ?? {}, GHL_FIELD_CLOSER)?.trim().toLowerCase() ?? ''
      if (!cf) return false
      return cf === nl || cf === firstName || nl.startsWith(cf) || cf.startsWith(firstName)
    })
    const contactIds = [...new Set(myOpps.map(o => o.contact_id).filter(Boolean))]

    // Rendez-vous
    let appts = []
    if (contactIds.length > 0) {
      const { data } = await supabase
        .from('ghl_appointments')
        .select('status, calendar_id')
        .in('contact_id', contactIds)
        .gte('start_time', startDate + 'T00:00:00')
        .lte('start_time', endDate   + 'T23:59:59')
      appts = data ?? []
    }

    // hotCount = shows de Consultation Découverte uniquement (exclut Rencontre de Décision)
    const hotCount = appts.filter(a =>
      (a.status === 'showed' || a.status === 'attended') && a.calendar_id !== GHL_CALENDAR_DECISION
    ).length

    // Ventes (stage Gagné + date de close dans la période)
    const salesCount = myOpps.filter(o => {
      const stageName = String(o.stage_name ?? o.raw?.pipelineStage?.name ?? '')
      if (!stageName.includes('Gagné')) return false
      const closeDateRaw = getGHLField(o.raw ?? {}, GHL_FIELD_DATE_CLOSE)
      const cd = parseGHLDate(closeDateRaw) ?? (o.closed_at ? new Date(o.closed_at) : null)
      if (!cd) return false
      return cd.getTime() >= startMs && cd.getTime() <= endMs
    }).length

    const closeRate = hotCount > 0 ? Math.round((salesCount / hotCount) * 100) : null

    setStats({ rdvCount: appts.length, hotCount, salesCount, closeRate })
    setLoading(false)
  }, [closerName, startDate, endDate])

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

    const { data: opps } = await supabase
      .from('ghl_opportunities')
      .select('ghl_id, contact_name, stage_name, raw, closed_at')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)

    const startMs = new Date(startDate + 'T00:00:00').getTime()
    const endMs   = new Date(endDate   + 'T23:59:59').getTime()

    const unassigned = (opps ?? []).filter(o => {
      const cf = getGHLField(o.raw ?? {}, GHL_FIELD_CLOSER)?.trim() ?? ''
      if (cf) return false

      const stageName = String(o.stage_name ?? (o.raw?.pipelineStage)?.name ?? '')
      if (!stageName.includes('Gagné')) return false

      const closeDateRaw = getGHLField(o.raw ?? {}, GHL_FIELD_DATE_CLOSE)
      const closeDate = parseGHLDate(closeDateRaw) ?? (o.closed_at ? new Date(o.closed_at) : null)
      if (!closeDate) return false
      return closeDate.getTime() >= startMs && closeDate.getTime() <= endMs
    }).map(o => ({
      ghlId:       o.ghl_id,
      contactName: String(o.contact_name ?? '').trim() || '—',
      closeDate:   parseGHLDate(getGHLField(o.raw ?? {}, GHL_FIELD_DATE_CLOSE)) ?? (o.closed_at ? new Date(o.closed_at) : null),
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
      const { data } = await supabase
        .from('ghl_appointments')
        .select('contact_id')
        .eq('calendar_id', GHL_CALENDAR_DECISION)
        .eq('assigned_user_id', ghlUserId)
      setIds(new Set((data ?? []).map(a => a.contact_id).filter(Boolean)))
      return
    }

    // Fallback : passer par les opportunités du closer
    const { data: opps } = await supabase
      .from('ghl_opportunities')
      .select('contact_id, raw')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)

    const nl        = closerName.trim().toLowerCase()
    const firstName = nl.split(' ')[0]
    const contactIds = (opps ?? [])
      .filter(o => {
        const cf = getGHLField(o.raw ?? {}, GHL_FIELD_CLOSER)?.trim().toLowerCase() ?? ''
        return cf === nl || cf === firstName || nl.startsWith(cf) || cf.startsWith(firstName)
      })
      .map(o => o.contact_id)
      .filter(Boolean)

    if (contactIds.length === 0) return

    const { data: appts } = await supabase
      .from('ghl_appointments')
      .select('contact_id')
      .eq('calendar_id', GHL_CALENDAR_DECISION)
      .in('contact_id', contactIds)

    setIds(new Set((appts ?? []).map(a => a.contact_id).filter(Boolean)))
  }, [closerName, ghlUserId])

  useEffect(() => { load() }, [load])

  return ids
}
