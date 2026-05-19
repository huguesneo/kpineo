import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format, subDays } from 'date-fns'

const GHL_PIPELINE_CLOSER = 'YPTruORTl0LOSdS2vWJS'
const GHL_FIELD_CLOSER    = 'JSltN3nE7nm4cUjuGxTs'

function ghlToEodStatus(ghlStatus) {
  if (ghlStatus === 'showed' || ghlStatus === 'attended') return 'show'
  if (ghlStatus === 'noshow') return 'noshow'
  if (ghlStatus === 'cancelled') return 'annule'
  return ''
}

function getGHLField(raw, fieldId) {
  const fields = raw?.customFields ?? []
  const f = fields.find(f => f.id === fieldId || f.key === fieldId || f.fieldKey === fieldId)
  if (!f) return null
  return f.fieldValueNumber ?? f.fieldValueString ?? f.fieldValueDate ?? f.value ?? null
}

// ─── Constantes exportées ────────────────────────────────────────────────────
export const EOD_STATUSES = [
  { value: 'show',   label: 'Show' },
  { value: 'noshow', label: 'No Show' },
  { value: 'annule', label: 'Annulé' },
]

export const EOD_FEEDBACK_OPTIONS = [
  { value: 'A+', label: 'A+ — Très bien préparé' },
  { value: 'A',  label: 'A — Bien préparé' },
  { value: 'B',  label: 'B' },
  { value: 'C',  label: 'C' },
  { value: 'D',  label: 'D' },
]

// ─── Helper: construire une ligne EOD depuis un rendez-vous GHL ──────────────
export function rowFromAppointment(appt) {
  return {
    ghl_appointment_id: appt.ghl_id,
    contact_name:       appt.contact_name || '',
    contact_id:         appt.contact_id   || '',
    start_time:         appt.start_time   || '',
    status:             '',     // '' | 'show' | 'noshow' | 'annule'
    is_closed:          null,   // null | true | false
    feedback:           '',     // '' | 'A+' | 'A' | 'B' | 'C' | 'D'
    action_plan:        '',
    objection_reason:   '',
  }
}

// ─── Sauvegarder un statut dans le rapport EOD (upsert) ─────────────────────
export async function saveStatusToEOD(userId, appt, status) {
  if (!userId) return
  const apptDate = appt.start_time
    ? format(new Date(appt.start_time), 'yyyy-MM-dd')
    : format(new Date(), 'yyyy-MM-dd')

  const { data: existing } = await supabase
    .from('end_of_day_reports')
    .select('*')
    .eq('user_id', userId)
    .eq('role', 'closer')
    .eq('report_date', apptDate)
    .maybeSingle()

  const eodDoc  = existing?.data ?? null
  const rows    = eodDoc?.rows ?? []
  const idx     = rows.findIndex(r => r.ghl_appointment_id === appt.ghl_id)
  const newRows = idx >= 0
    ? rows.map((r, i) => i === idx ? { ...r, status } : r)
    : [...rows, { ...rowFromAppointment(appt), status }]
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  const data = { ...(eodDoc ?? {}), rows: newRows }
  const now  = new Date().toISOString()

  if (existing) {
    await supabase
      .from('end_of_day_reports')
      .update({ data, submitted_at: now })
      .eq('id', existing.id)
  } else {
    await supabase.from('end_of_day_reports').insert({
      user_id:      userId,
      report_date:  apptDate,
      role:         'closer',
      data,
      submitted_at: now,
    })
  }
}

// ─── Charger les rendez-vous GHL pour une date ───────────────────────────────
async function fetchAppointmentsForDate(date, ghlUserId, closerName) {
  if (ghlUserId) {
    const { data } = await supabase
      .from('ghl_appointments')
      .select('*')
      .eq('assigned_user_id', ghlUserId)
      .gte('start_time', date + 'T00:00:00')
      .lte('start_time', date + 'T23:59:59')
      .order('start_time', { ascending: true })
    return data ?? []
  }

  if (closerName) {
    const { data: opps } = await supabase
      .from('ghl_opportunities')
      .select('contact_id, raw')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)

    const nl        = closerName.trim().toLowerCase()
    const firstName = nl.split(' ')[0]
    const contactIds = (opps ?? [])
      .filter(o => {
        const cf = getGHLField(o.raw ?? {}, GHL_FIELD_CLOSER)?.trim().toLowerCase() ?? ''
        return cf && (cf === nl || cf === firstName || nl.startsWith(cf) || cf.startsWith(firstName))
      })
      .map(o => o.contact_id)
      .filter(Boolean)

    if (contactIds.length === 0) return []

    const { data } = await supabase
      .from('ghl_appointments')
      .select('*')
      .in('contact_id', contactIds)
      .gte('start_time', date + 'T00:00:00')
      .lte('start_time', date + 'T23:59:59')
      .order('start_time', { ascending: true })
    return data ?? []
  }

  return []
}

// ─── useCloserEOD ────────────────────────────────────────────────────────────
// Charge et sauvegarde le rapport EOD d'un closer pour une date donnée.
// Fusionne avec les rendez-vous GHL pour pré-remplir les lignes.
export function useCloserEOD(userId, date = null, ghlUserId = null, closerName = null) {
  const todayStr   = format(new Date(), 'yyyy-MM-dd')
  const targetDate = date || todayStr

  const [report,     setReport]     = useState(null)
  const [rows,       setRows]       = useState([])
  const [notes,      setNotes]      = useState('')
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)

    const [{ data: existing }, appts] = await Promise.all([
      supabase
        .from('end_of_day_reports')
        .select('*')
        .eq('user_id', userId)
        .eq('role', 'closer')
        .eq('report_date', targetDate)
        .maybeSingle(),
      fetchAppointmentsForDate(targetDate, ghlUserId, closerName),
    ])

    // Pré-remplir is_closed depuis les opportunités gagnées
    const contactIds = appts.map(a => a.contact_id).filter(Boolean)
    let wonContactIds = new Set()
    if (contactIds.length > 0) {
      const { data: wonOpps } = await supabase
        .from('ghl_opportunities')
        .select('contact_id')
        .in('contact_id', contactIds)
        .ilike('stage_name', '%agn%')
      wonContactIds = new Set((wonOpps ?? []).map(o => o.contact_id))
    }

    function makeNewRow(appt) {
      return {
        ...rowFromAppointment(appt),
        status:    ghlToEodStatus(appt.status),
        is_closed: wonContactIds.has(appt.contact_id) ? true : null,
      }
    }

    if (existing) {
      setReport(existing)
      const data        = existing.data || {}
      const savedRows   = data.rows || []
      const knownIds    = new Set(savedRows.map(r => r.ghl_appointment_id))
      const newRows     = appts.filter(a => !knownIds.has(a.ghl_id)).map(makeNewRow)
      // Enrichir les lignes existantes dont is_closed est encore null
      const enrichedSaved = savedRows.map(r => {
        if (r.is_closed !== null) return r
        const appt = appts.find(a => a.ghl_id === r.ghl_appointment_id)
        if (!appt) return r
        return { ...r, is_closed: wonContactIds.has(appt.contact_id) ? true : null }
      })
      const merged      = [...enrichedSaved, ...newRows].sort((a, b) =>
        new Date(a.start_time) - new Date(b.start_time)
      )
      setRows(merged)
      setNotes(data.notes || '')
    } else {
      setReport(null)
      setRows(appts.map(makeNewRow))
      setNotes('')
    }

    setLoading(false)
  }, [userId, targetDate, ghlUserId, closerName])

  useEffect(() => { load() }, [load])

  // Mise à jour d'une ligne sans sauvegarder en DB (état local)
  function updateRow(index, changes) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...changes } : r))
  }

  // Sauvegarde en DB
  async function save(newRows, newNotes) {
    if (!userId) return { error: 'Non connecté' }
    setSubmitting(true)
    setError(null)

    const payload = {
      user_id:      userId,
      report_date:  targetDate,
      role:         'closer',
      data:         { rows: newRows, notes: newNotes },
      submitted_at: new Date().toISOString(),
    }

    const result = report
      ? await supabase
          .from('end_of_day_reports')
          .update({ data: payload.data, submitted_at: payload.submitted_at })
          .eq('id', report.id)
      : await supabase
          .from('end_of_day_reports')
          .insert(payload)

    setSubmitting(false)
    if (result.error) {
      setError(result.error.message)
      return { error: result.error.message }
    }
    await load()
    return { error: null }
  }

  // Sauvegarde une ligne individuelle en DB (pour le popup)
  async function saveRow(index, changes) {
    const newRows = rows.map((r, i) => i === index ? { ...r, ...changes } : r)
    return save(newRows, notes)
  }

  return {
    report, rows, notes, setNotes, loading, submitting, error,
    save, updateRow, saveRow, refetch: load, targetDate,
  }
}

// ─── useCloserEODMissedBadge ─────────────────────────────────────────────────
// Retourne 1 si le rapport EOD d'hier est manquant ET qu'il y avait des RDV hier.
export function useCloserEODMissedBadge(userId, ghlUserId, closerName) {
  const [missed, setMissed] = useState(0)

  useEffect(() => {
    if (!userId) return

    async function check() {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

      const { data: eod } = await supabase
        .from('end_of_day_reports')
        .select('id')
        .eq('user_id', userId)
        .eq('role', 'closer')
        .eq('report_date', yesterday)
        .maybeSingle()

      if (eod) { setMissed(0); return }

      let apptCount = 0
      if (ghlUserId) {
        const { count } = await supabase
          .from('ghl_appointments')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_user_id', ghlUserId)
          .gte('start_time', yesterday + 'T00:00:00')
          .lte('start_time', yesterday + 'T23:59:59')
        apptCount = count ?? 0
      }

      setMissed(apptCount > 0 ? 1 : 0)
    }

    check()
  }, [userId, ghlUserId, closerName])

  return missed
}
