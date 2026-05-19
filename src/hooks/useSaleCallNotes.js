import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Load + save sale call notes from Supabase ────────────────
// Table: sale_call_notes (create with the SQL in SUPABASE_SETUP.md)
export function useSaleCallNote(appointmentGhlId) {
  const [note, setNote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!appointmentGhlId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('sale_call_notes')
      .select('*')
      .eq('appointment_ghl_id', appointmentGhlId)
      .maybeSingle()
    setNote(data ?? null)
    setLoading(false)
  }, [appointmentGhlId])

  useEffect(() => { load() }, [load])

  async function save({ userId, contactId, contactName, qualification }) {
    if (!appointmentGhlId) return { error: 'No appointment ID' }
    setSaving(true)

    const payload = {
      appointment_ghl_id: appointmentGhlId,
      user_id:            userId,
      contact_id:         contactId,
      contact_name:       contactName,
      qualification,
      updated_at:         new Date().toISOString(),
    }

    let error = null
    if (note?.id) {
      const res = await supabase
        .from('sale_call_notes')
        .update(payload)
        .eq('id', note.id)
      error = res.error
    } else {
      const res = await supabase
        .from('sale_call_notes')
        .insert({ ...payload, created_at: new Date().toISOString() })
      error = res.error
    }

    setSaving(false)
    if (!error) await load()
    return { error }
  }

  return { note, loading, saving, save, refetch: load }
}
