import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

export const SETTER_EOD_FIELDS = {
  objectif_atteint:        { label: 'Objectif de la journée', type: 'bool' },
  appels_totaux:           { label: 'Appels totaux faits', type: 'number' },
  conversations:           { label: 'Conversations eues', type: 'number' },
  rdv_manuels:             { label: 'Rendez-vous settés (manuels)', type: 'number' },
  rdv_automatiques:        { label: 'Rendez-vous automatiques (confirmés/qualifiés)', type: 'number' },
  noshows_rebooks:         { label: 'No-Shows récupérés (re-bookés)', type: 'number' },
  annulations_rebookees:   { label: 'Annulations traitées & rebookées', type: 'number' },
  objections_majeures:     { label: 'Objections majeures', type: 'text' },
  qualite_leads_note:      { label: 'Qualité des leads (/ 10)', type: 'number' },
  qualite_leads_analyse:   { label: 'Analyse de la qualité', type: 'text' },
}

export const DEFAULT_SETTER_EOD = {
  objectif_atteint: null,
  appels_totaux: '',
  conversations: '',
  rdv_manuels: '',
  rdv_automatiques: '',
  noshows_rebooks: '',
  annulations_rebookees: '',
  objections_majeures: '',
  qualite_leads_note: '',
  qualite_leads_analyse: '',
}

export function useSetterEOD(userId) {
  const [todayReport, setTodayReport] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const today = format(new Date(), 'yyyy-MM-dd')

  const fetch = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('end_of_day_reports')
      .select('*')
      .eq('user_id', userId)
      .eq('role', 'setter')
      .order('report_date', { ascending: false })

    if (err) { setError(err.message); setLoading(false); return }

    const reports = data || []
    setTodayReport(reports.find(r => r.report_date === today) ?? null)
    setHistory(reports)
    setLoading(false)
  }, [userId, today])

  useEffect(() => { fetch() }, [fetch])

  async function upsert(formData) {
    if (!userId) return { error: 'Utilisateur non connecté' }
    setSubmitting(true)
    setError(null)

    const payload = {
      user_id: userId,
      report_date: today,
      role: 'setter',
      data: formData,
      submitted_at: new Date().toISOString(),
    }

    let result
    if (todayReport) {
      result = await supabase
        .from('end_of_day_reports')
        .update({ data: formData, submitted_at: payload.submitted_at })
        .eq('id', todayReport.id)
    } else {
      result = await supabase
        .from('end_of_day_reports')
        .insert(payload)
    }

    setSubmitting(false)
    if (result.error) { setError(result.error.message); return { error: result.error.message } }
    await fetch()
    return { error: null }
  }

  return { todayReport, history, loading, submitting, error, upsert, refetch: fetch }
}

export function useSetterEODForUser(userId) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase
      .from('end_of_day_reports')
      .select('*')
      .eq('user_id', userId)
      .eq('role', 'setter')
      .order('report_date', { ascending: false })

    setReports(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  return { reports, loading, refetch: fetch }
}
