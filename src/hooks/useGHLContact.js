import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Fetch a single GHL contact, always refresh from GHL API ─
// The batch sync only stores {id, value} in customFields (no fieldKey).
// The single-contact endpoint returns fieldKey, so we always refresh.
export function useGHLContactById(contactId) {
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!contactId) { setLoading(false); return }
    setLoading(true)

    // 1. Load cached version first (fast)
    const { data: cached } = await supabase
      .from('ghl_contacts')
      .select('*')
      .eq('ghl_id', contactId)
      .maybeSingle()

    if (cached) setContact(cached)

    // 2. Refresh from GHL API to get fieldKey in customFields
    const { data: refreshed } = await supabase.functions.invoke('ghl-get-contact', {
      body: { contactId },
    })

    if (refreshed?.ok) {
      // Re-fetch from cache — the edge function just upserted fresh data
      const { data: fresh } = await supabase
        .from('ghl_contacts')
        .select('*')
        .eq('ghl_id', contactId)
        .maybeSingle()
      if (fresh) setContact(fresh)
    }

    setLoading(false)
  }, [contactId])

  useEffect(() => { load() }, [load])

  return { contact, loading, refetch: load }
}

// ─── Extract a custom field value from contact raw JSON ───────
// GHL single-contact API returns:
//   { id, value, fieldKey: "contact.questionnaire_sexe" }
// GHL batch-contact API returns:
//   { id, value }  ← no fieldKey
//
// We search by all possible formats.
export function getContactCustomField(raw, fieldKey) {
  if (!raw) return null
  const fields = Array.isArray(raw.customFields) ? raw.customFields : []
  const searchKey = fieldKey.toLowerCase().replace(/^contact\./, '')

  const f = fields.find(f => {
    // fieldKey: "contact.questionnaire_sexe" or "questionnaire_sexe"
    const fk = (f.fieldKey ?? '').toLowerCase().replace(/^contact\./, '')
    // key: sometimes the short name
    const k  = (f.key ?? '').toLowerCase().replace(/^contact\./, '')

    return fk === searchKey || k === searchKey
  })

  if (!f) return null

  // Handle array values (multi-select)
  if (Array.isArray(f.fieldValue) && f.fieldValue.length > 0) {
    return f.fieldValue.join(', ')
  }
  if (Array.isArray(f.value) && f.value.length > 0) {
    return f.value.join(', ')
  }
  return (
    f.fieldValueString ??
    (f.fieldValueNumber != null ? String(f.fieldValueNumber) : null) ??
    (typeof f.value === 'string' ? f.value : null) ??
    null
  )
}

// ─── Quiz Métabolique field definitions ───────────────────────
// Keys match GHL fieldKey format: "contact.questionnaire_xxx"
export const QUIZ_FIELDS = [
  { key: 'questionnaire_sexe',       label: 'Quel est ton sexe biologique ?' },
  { key: 'questionnaire_age',        label: 'Quel est ton âge ?' },
  { key: 'questionnaire_energie',    label: "Comment décris-tu ton niveau d'énergie au quotidien ?" },
  { key: 'questionnaire_stockage',   label: 'Où ton corps a-t-il tendance à stocker davantage ?' },
  { key: 'questionnaire_ventre',     label: 'Comment ton ventre se comporte-t-il ?' },
  { key: 'questionnaire_symptomes',  label: 'As-tu remarqué ces signes silencieux ?' },
  { key: 'questionnaire_objectifs',  label: "Qu'est-ce qui changerait dans ta vie si ton métabolisme fonctionnait à 100% ?" },
  { key: 'questionnaire_motivation', label: 'Ta motivation profonde' },
  { key: 'questionnaire_engagement', label: "Ton niveau d'engagement (1 à 10)" },
]

// ─── Check if quiz is completed ───────────────────────────────
export function isQuizCompleted(contactRaw) {
  if (!contactRaw) return false
  return QUIZ_FIELDS.some(f => {
    const v = getContactCustomField(contactRaw, f.key)
    return v && String(v).trim().length > 0
  })
}

// ─── Update appointment status in GHL + local DB ─────────────
// uiStatus: 'show' | 'noshow' | 'annule'
export async function updateAppointmentStatus(ghlId, contactId, uiStatus) {
  const { data, error } = await supabase.functions.invoke('ghl-update-appointment', {
    body: {
      appointmentId: ghlId,
      contactId:     contactId ?? undefined,
      status:        uiStatus,
    },
  })
  return { data, error }
}

// ─── Add a note to a GHL contact ─────────────────────────────
export async function addContactNoteGHL(contactId, note) {
  const { data, error } = await supabase.functions.invoke('ghl-add-contact-note', {
    body: { contactId, note },
  })
  return { data, error }
}
