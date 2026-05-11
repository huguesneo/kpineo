import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { EOD_STATUSES, rowFromAppointment } from '../../hooks/useCloserEOD'
import { useCloserAppointments } from '../../hooks/useCloserData'

const POPUP_DELAY_MIN = 45  // minutes après le début du RDV
const LOOKBACK_HOURS  = 8   // heures de lookback max

function fmtTime(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'HH:mm') } catch { return '—' }
}

// ─── Charger le rapport EOD d'aujourd'hui ────────────────────────────────────
async function fetchTodayEOD(userId) {
  if (!userId) return null
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data } = await supabase
    .from('end_of_day_reports')
    .select('data')
    .eq('user_id', userId)
    .eq('role', 'closer')
    .eq('report_date', today)
    .maybeSingle()
  return data?.data ?? null
}

// ─── Upsert du statut dans l'EOD ─────────────────────────────────────────────
async function saveStatusToEOD(userId, appt, status) {
  const today  = format(new Date(), 'yyyy-MM-dd')
  const eodDoc = await fetchTodayEOD(userId)
  const rows   = eodDoc?.rows ?? []

  const idx = rows.findIndex(r => r.ghl_appointment_id === appt.ghl_id)
  const newRows = idx >= 0
    ? rows.map((r, i) => i === idx ? { ...r, status } : r)
    : [...rows, { ...rowFromAppointment(appt), status }]
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  const payload = {
    user_id:      userId,
    report_date:  today,
    role:         'closer',
    data:         { ...(eodDoc ?? {}), rows: newRows },
    submitted_at: new Date().toISOString(),
  }

  // Vérifier si le rapport existe déjà (upsert par user_id + report_date)
  const { data: existing } = await supabase
    .from('end_of_day_reports')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'closer')
    .eq('report_date', today)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('end_of_day_reports')
      .update({ data: payload.data, submitted_at: payload.submitted_at })
      .eq('id', existing.id)
  } else {
    await supabase.from('end_of_day_reports').insert(payload)
  }
}

// ─── Mettre à jour le statut dans GHL ────────────────────────────────────────
async function updateGHLStatus(appt, status) {
  if (!appt.ghl_id) return
  await supabase.functions.invoke('ghl-update-appointment', {
    body: {
      appointmentId: appt.ghl_id,
      contactId:     appt.contact_id || undefined,
      status,
    },
  })
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function AppointmentStatusPopup({ userId, ghlUserId, closerName }) {
  const today = format(new Date(), 'yyyy-MM-dd')

  // Utilise le même hook que le dashboard et l'EOD form — logique prouvée
  const { appointments, loading: apptLoading } = useCloserAppointments(
    closerName, today, today, ghlUserId
  )

  // Lignes EOD déjà sauvegardées (pour savoir quels RDVs ont déjà un statut)
  const [eodRows,  setEodRows]  = useState([])
  // Set des IDs déjà traités via le popup (dans cette session)
  const [doneIds,  setDoneIds]  = useState(new Set())
  // Ticker toutes les minutes pour recalculer l'éligibilité
  const [tick,     setTick]     = useState(0)

  const [status,   setStatus]   = useState('')
  const [saving,   setSaving]   = useState(false)

  // Charger les lignes EOD au montage
  useEffect(() => {
    if (!userId) return
    fetchTodayEOD(userId).then(doc => setEodRows(doc?.rows ?? []))
  }, [userId])

  // Tick toutes les 60 secondes
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(iv)
  }, [])

  // File d'attente : RDVs éligibles (heure + statut non défini)
  const queue = useMemo(() => {
    if (apptLoading) return []
    const now         = Date.now()
    const cutoff      = now - POPUP_DELAY_MIN * 60_000
    const maxLookback = now - LOOKBACK_HOURS  * 3_600_000

    return appointments.filter(appt => {
      const start = new Date(appt.start_time).getTime()
      // Doit avoir démarré depuis au moins 45 min, mais pas plus de 8h
      if (start > cutoff || start < maxLookback) return false
      // Déjà traité dans cette session
      if (doneIds.has(appt.ghl_id)) return false
      // Statut déjà défini dans l'EOD en DB
      const eodRow = eodRows.find(r => r.ghl_appointment_id === appt.ghl_id)
      return !eodRow?.status
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, eodRows, doneIds, tick, apptLoading])

  const current = queue[0] ?? null

  // Réinitialiser le statut à chaque nouveau RDV
  useEffect(() => { setStatus('') }, [current?.ghl_id])

  async function handleSubmit() {
    if (!current || !status) return
    setSaving(true)

    await Promise.allSettled([
      saveStatusToEOD(userId, current, status),
      updateGHLStatus(current, status),
    ])

    // Marquer comme traité localement (sans attendre un refetch)
    setDoneIds(prev => new Set([...prev, current.ghl_id]))
    // Mettre à jour les rows locales pour la vérification suivante
    setEodRows(prev => {
      const idx = prev.findIndex(r => r.ghl_appointment_id === current.ghl_id)
      if (idx >= 0) return prev.map((r, i) => i === idx ? { ...r, status } : r)
      return [...prev, { ...rowFromAppointment(current), status }]
    })

    setSaving(false)
  }

  function handleDismiss() {
    if (!current) return
    setDoneIds(prev => new Set([...prev, current.ghl_id]))
  }

  if (!current) return null

  const remaining = queue.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="px-6 py-4 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#00bbb1]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#00bbb1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#1a1a1a]">Statut du rendez-vous</h2>
                {remaining > 1 && (
                  <p className="text-[11px] text-[#9ca3af]">{remaining} rendez-vous en attente</p>
                )}
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#9ca3af] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Contenu */}
        <div className="px-6 py-5">
          <div className="bg-[#f9fafb] rounded-xl px-4 py-3 mb-5 border border-[#f0f0f0]">
            <p className="text-base font-bold text-[#1a1a1a]">{current.contact_name || '—'}</p>
            <p className="text-sm text-[#6b7280] mt-0.5">RDV à {fmtTime(current.start_time)}</p>
          </div>

          <p className="text-xs font-semibold text-[#6b7280] mb-2">Statut du rendez-vous</p>
          <div className="grid grid-cols-3 gap-2">
            {EOD_STATUSES.map(s => {
              const colors = {
                show:   { active: 'bg-[#10b981] border-[#10b981] text-white', inactive: 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#10b981]/40' },
                noshow: { active: 'bg-[#f59e0b] border-[#f59e0b] text-white', inactive: 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#f59e0b]/40' },
                annule: { active: 'bg-[#ef4444] border-[#ef4444] text-white', inactive: 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#ef4444]/40' },
              }
              const c = colors[s.value]
              return (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                    status === s.value ? c.active : c.inactive
                  }`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>

          {remaining > 1 && (
            <div className="flex gap-1 justify-center mt-4">
              {queue.map(a => (
                <div
                  key={a.ghl_id}
                  className={`h-1.5 rounded-full transition-all ${
                    a.ghl_id === current.ghl_id ? 'w-4 bg-[#00bbb1]' : 'w-1.5 bg-[#e5e7eb]'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#e5e7eb] text-[#6b7280] hover:bg-gray-50 transition-colors"
          >
            Plus tard
          </button>
          <button
            onClick={handleSubmit}
            disabled={!status || saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#00bbb1] text-white hover:bg-[#009e95] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {saving
              ? 'Sauvegarde…'
              : remaining > 1
              ? `Confirmer (${remaining - 1} suivant${remaining - 1 > 1 ? 's' : ''})`
              : 'Confirmer'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
