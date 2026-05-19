import { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import WeekView from '../components/calendar/WeekView'
import AppointmentDrawer from '../components/calendar/AppointmentDrawer'
import BlockSlotModal, { generateOccurrences } from '../components/calendar/BlockSlotModal'
import { SkeletonCard } from '../components/shared/Skeleton'
// ─── Fetch appointments for a date range ─────────────────────
async function fetchAppts({ ghlUserId, closerName, weekStart, weekEnd }) {
  if (!weekStart || !weekEnd) return []

  const start = format(weekStart, "yyyy-MM-dd'T'00:00:00")
  const end   = format(weekEnd,   "yyyy-MM-dd'T'23:59:59")

  if (ghlUserId) {
    const { data } = await supabase
      .from('ghl_appointments')
      .select('*')
      .eq('assigned_user_id', ghlUserId)
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time')
    return data ?? []
  }

  if (closerName) {
    const { data: opps } = await supabase
      .from('ghl_opportunities')
      .select('contact_id, raw')
      .eq('pipeline_id', 'YPTruORTl0LOSdS2vWJS')

    const nl        = closerName.trim().toLowerCase()
    const firstName = nl.split(' ')[0]
    const CLOSER_FIELD = 'JSltN3nE7nm4cUjuGxTs'

    const contactIds = (opps ?? [])
      .filter(o => {
        const fields = o.raw?.customFields ?? []
        const f = fields.find(cf =>
          cf.id === CLOSER_FIELD || cf.key === CLOSER_FIELD || cf.fieldKey === CLOSER_FIELD
        )
        const cf = (f?.fieldValueString ?? f?.value ?? '').trim().toLowerCase()
        if (!cf) return false
        return cf === nl || cf === firstName || nl.startsWith(cf) || cf.startsWith(firstName)
      })
      .map(o => o.contact_id)
      .filter(Boolean)

    if (contactIds.length === 0) return []

    const { data } = await supabase
      .from('ghl_appointments')
      .select('*')
      .in('contact_id', contactIds)
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time')
    return data ?? []
  }

  return []
}

// ─── Legend ───────────────────────────────────────────────────
const LEGEND = [
  { color: '#00bbb1', label: 'Confirmé / Planifié' },
  { color: '#10b981', label: 'Show' },
  { color: '#f59e0b', label: 'No-Show' },
  { color: '#9ca3af', label: 'Annulé' },
  { color: '#e5e7eb', label: 'Bloqué', striped: true },
]

// ─── Recurrence action dialog ─────────────────────────────────
function RecurrenceDialog({ action, onThisOne, onAllSeries, onCancel }) {
  const verb = action === 'delete' ? 'supprimer' : 'modifier'
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto p-6">
          <h3 className="font-bold text-[#1a1a1a] text-sm mb-1">Créneau récurrent</h3>
          <p className="text-xs text-[#6b7280] mb-5">Voulez-vous {verb} seulement ce créneau ou toute la série ?</p>
          <div className="space-y-2">
            <button
              onClick={onThisOne}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border border-[#e5e7eb] text-[#1a1a1a] hover:border-[#00bbb1] hover:text-[#00bbb1] transition-colors"
            >
              Ce créneau uniquement
            </button>
            <button
              onClick={onAllSeries}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #00bbb1 0%, #009e94 100%)' }}
            >
              Toute la série
            </button>
            <button
              onClick={onCancel}
              className="w-full py-2 rounded-xl text-xs font-semibold text-[#9ca3af] hover:text-[#6b7280] transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Blocked slot detail popup ────────────────────────────────
function BlockedSlotPopup({ slot, onEdit, onDelete, onClose }) {
  if (!slot) return null
  const start = new Date(slot.start_time)
  const end   = new Date(slot.end_time)
  return (
    <>
      <div className="fixed inset-0 z-[55] bg-black/20" onClick={onClose} />
      <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs pointer-events-auto">
          <div className="px-5 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#9ca3af]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              <span className="font-bold text-sm text-[#1a1a1a]">{slot.title}</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-[#9ca3af]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-5 py-3">
            <p className="text-xs text-[#6b7280] font-semibold">
              {format(start, "EEEE d MMMM", { locale: fr })}
            </p>
            <p className="text-sm font-bold text-[#1a1a1a] mt-0.5">
              {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
            </p>
            {slot.recurrence_type && slot.recurrence_type !== 'none' && (
              <p className="text-[10px] text-[#00bbb1] font-semibold mt-1">
                Récurrent · {slot.recurrence_type === 'daily' ? 'Quotidien' : 'Hebdomadaire'}
              </p>
            )}
          </div>
          <div className="px-5 pb-4 flex gap-2">
            <button
              onClick={onEdit}
              className="flex-1 py-2 rounded-xl text-xs font-bold border-2 border-[#00bbb1] text-[#00bbb1] hover:bg-[#00bbb1]/5 transition-colors"
            >
              Modifier
            </button>
            <button
              onClick={onDelete}
              className="flex-1 py-2 rounded-xl text-xs font-bold border-2 border-[#ef4444] text-[#ef4444] hover:bg-[#ef4444]/5 transition-colors"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function CloserCalendar() {
  const { profile } = useAuth()
  const ghlUserId   = profile?.ghl_user_id ?? null
  const closerName  = profile?.full_name ?? null

  const [currentDate,  setCurrentDate]  = useState(new Date())
  const [viewMode,     setViewMode]     = useState('week')
  const [dayViewDate,  setDayViewDate]  = useState(new Date())
  const [appointments, setAppointments] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [selectedAppt, setSelectedAppt] = useState(null)

  // Blocked slots state
  const [blockedSlots,    setBlockedSlots]    = useState([])
  const [blockModal,      setBlockModal]      = useState(null) // null | { slot: null|obj }
  const [blockPopup,      setBlockPopup]      = useState(null) // clicked slot
  const [recurrenceDialog, setRecurrenceDialog] = useState(null) // { action, slot, resolve }
  const [ghlSyncError,    setGhlSyncError]    = useState(null)

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(currentDate,   { weekStartsOn: 1 })
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const dayViewDays  = [dayViewDate]
  const displayedDays = viewMode === 'day' ? dayViewDays : weekDays

  // ── Load appointments ──
  const load = useCallback(async () => {
    if (!ghlUserId && !closerName) { setLoading(false); return }
    setLoading(true)
    const data = await fetchAppts({
      ghlUserId,
      closerName,
      weekStart: viewMode === 'day' ? dayViewDate : weekStart,
      weekEnd:   viewMode === 'day' ? dayViewDate : weekEnd,
    })
    setAppointments(data)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghlUserId, closerName, currentDate, viewMode, dayViewDate])

  // ── Load blocked slots ──
  const loadBlocked = useCallback(async () => {
    if (!profile?.id) return
    const rangeStart = viewMode === 'day' ? dayViewDate : weekStart
    const rangeEnd   = viewMode === 'day' ? dayViewDate : weekEnd
    // Load ±4 weeks for week view to cover navigation
    const from = format(addDays(rangeStart, -1), "yyyy-MM-dd'T'00:00:00")
    const to   = format(addDays(rangeEnd, 1),   "yyyy-MM-dd'T'23:59:59")
    const { data } = await supabase
      .from('blocked_slots')
      .select('*')
      .eq('user_id', profile.id)
      .gte('start_time', from)
      .lte('start_time', to)
    setBlockedSlots(data ?? [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, currentDate, viewMode, dayViewDate])

  useEffect(() => { load() },        [load])
  useEffect(() => { loadBlocked() }, [loadBlocked])

  function handlePrev() {
    if (viewMode === 'day') setDayViewDate(d => addDays(d, -1))
    else setCurrentDate(d => subWeeks(d, 1))
  }
  function handleNext() {
    if (viewMode === 'day') setDayViewDate(d => addDays(d, 1))
    else setCurrentDate(d => addWeeks(d, 1))
  }
  function handleToday() { setCurrentDate(new Date()); setDayViewDate(new Date()) }

  function handleStatusUpdate(ghlId, newStatus) {
    setAppointments(prev => prev.map(a => a.ghl_id === ghlId ? { ...a, status: newStatus } : a))
    if (selectedAppt?.ghl_id === ghlId) setSelectedAppt(prev => ({ ...prev, status: newStatus }))
  }

  // ── Block slot: create in GHL + Supabase ──
  async function handleBlockSave({ title, recType, until, occurrences, originalSlot }) {
    if (!profile?.id) return
    setGhlSyncError(null)

    // If editing, decide scope first
    if (originalSlot) {
      const isRecurring = originalSlot.recurrence_group_id && originalSlot.recurrence_type !== 'none'
      if (isRecurring) {
        const scope = await askRecurrenceScope('edit')
        if (!scope) return
        if (scope === 'all') {
          // Delete all in series, then recreate
          await deleteBlockedSeries(originalSlot.recurrence_group_id)
        } else {
          await deleteBlockedOne(originalSlot)
        }
      } else {
        await deleteBlockedOne(originalSlot)
      }
    }

    // Create new occurrences
    const groupId = recType !== 'none' ? crypto.randomUUID() : null
    let ghlFailed = 0

    for (const occ of occurrences) {
      // 1. Create in Supabase first
      const { data: row, error: dbErr } = await supabase
        .from('blocked_slots')
        .insert({
          user_id:             profile.id,
          title,
          start_time:          occ.start_time,
          end_time:            occ.end_time,
          recurrence_type:     recType,
          recurrence_group_id: groupId,
          recurrence_until:    until ?? null,
        })
        .select()
        .single()

      if (dbErr) { console.error('blocked_slots insert error:', dbErr); continue }

      // 2. Sync to GHL
      const { data: ghlRes } = await supabase.functions.invoke('ghl-block-slot', {
        body: { userId: profile.id, startTime: occ.start_time, endTime: occ.end_time, title },
      })

      if (ghlRes?.ghlEventId) {
        await supabase.from('blocked_slots').update({ ghl_event_id: ghlRes.ghlEventId }).eq('id', row.id)
      } else if (ghlRes?.error === 'not_event_calendar') {
        // Calendar type doesn't support block-slots API — flag once, don't count as failure
        if (ghlFailed === 0) ghlFailed = -1 // sentinel for "not supported"
      } else {
        if (ghlFailed >= 0) ghlFailed++
      }
    }

    if (ghlFailed === -1) {
      setGhlSyncError('info:Le créneau est bloqué dans l\'app. La synchro GHL automatique n\'est pas disponible pour ce type de calendrier — bloquez manuellement dans GHL si nécessaire.')
    } else if (ghlFailed > 0) {
      setGhlSyncError(`${ghlFailed} créneau${ghlFailed > 1 ? 'x' : ''} n'ont pas pu être synchronisé${ghlFailed > 1 ? 's' : ''} dans GHL`)
    }

    setBlockModal(null)
    loadBlocked()
  }

  // ── Delete: single ──
  async function deleteBlockedOne(slot) {
    if (slot.ghl_event_id) {
      await supabase.functions.invoke('ghl-unblock-slot', { body: { ghlEventId: slot.ghl_event_id } })
    }
    await supabase.from('blocked_slots').delete().eq('id', slot.id)
  }

  // ── Delete: entire series ──
  async function deleteBlockedSeries(groupId) {
    const { data: all } = await supabase
      .from('blocked_slots')
      .select('id, ghl_event_id')
      .eq('recurrence_group_id', groupId)

    await Promise.all((all ?? []).map(s =>
      s.ghl_event_id
        ? supabase.functions.invoke('ghl-unblock-slot', { body: { ghlEventId: s.ghl_event_id } })
        : Promise.resolve()
    ))
    await supabase.from('blocked_slots').delete().eq('recurrence_group_id', groupId)
  }

  // ── Recurrence scope dialog (returns 'one' | 'all' | null) ──
  function askRecurrenceScope(action) {
    return new Promise(resolve => {
      setRecurrenceDialog({ action, resolve })
    })
  }

  // ── Click on a blocked slot ──
  function handleBlockedSlotClick(slot) {
    setBlockPopup(slot)
  }

  async function handleBlockedDelete(slot) {
    setBlockPopup(null)
    const isRecurring = slot.recurrence_group_id && slot.recurrence_type !== 'none'
    if (isRecurring) {
      const scope = await askRecurrenceScope('delete')
      if (!scope) return
      if (scope === 'all') {
        await deleteBlockedSeries(slot.recurrence_group_id)
      } else {
        await deleteBlockedOne(slot)
      }
    } else {
      await deleteBlockedOne(slot)
    }
    loadBlocked()
  }

  function handleBlockedEdit(slot) {
    setBlockPopup(null)
    setBlockModal({ slot })
  }

  const stats = appointments.reduce((acc, a) => {
    acc.total++
    if (a.status === 'showed' || a.status === 'attended') acc.shows++
    else if (a.status === 'noshow') acc.noShows++
    else if (a.status === 'cancelled') acc.cancelled++
    else acc.confirmed++
    return acc
  }, { total: 0, shows: 0, noShows: 0, cancelled: 0, confirmed: 0 })

  if (!ghlUserId && !closerName) {
    return (
      <Layout>
        <Header title="Calendrier" />
        <div className="flex items-center justify-center h-64 rounded-xl border border-[#e5e7eb] bg-[#f9fafb]">
          <div className="text-center">
            <p className="text-sm font-semibold text-[#6b7280]">GHL User ID non configuré</p>
            <p className="text-xs text-[#9ca3af] mt-1">Contactez votre administrateur pour lier votre compte GHL</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <Header title="Calendrier" />
      <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 200px)', minHeight: 500 }}>

        {/* ── Calendar header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#e5e7eb] bg-white text-[#1a1a1a] hover:border-[#00bbb1]/40 transition-colors"
            >
              Aujourd'hui
            </button>
            <div className="flex items-center">
              <button onClick={handlePrev} className="p-1.5 rounded-lg hover:bg-gray-100 text-[#6b7280]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={handleNext} className="p-1.5 rounded-lg hover:bg-gray-100 text-[#6b7280]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <h2 className="text-sm font-bold text-[#1a1a1a]">
              {viewMode === 'day'
                ? format(dayViewDate, 'EEEE d MMMM yyyy', { locale: fr })
                : `${format(weekStart, 'd MMM', { locale: fr })} – ${format(weekEnd, 'd MMM yyyy', { locale: fr })}`
              }
            </h2>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mini stats */}
            {!loading && appointments.length > 0 && (
              <div className="flex items-center gap-2">
                {[
                  { label: `${stats.total} RDV`,       color: '#6b7280' },
                  { label: `${stats.shows} show`,      color: '#10b981' },
                  { label: `${stats.noShows} no-show`, color: '#f59e0b' },
                ].map(s => (
                  <span key={s.label} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${s.color}18`, color: s.color }}>
                    {s.label}
                  </span>
                ))}
              </div>
            )}

            {/* Block button */}
            <button
              onClick={() => setBlockModal({ slot: null })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-[#9ca3af] text-[#6b7280] hover:border-[#6b7280] hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              Bloquer
            </button>

            {/* View switcher */}
            <div className="flex rounded-lg border border-[#e5e7eb] overflow-hidden">
              {[{ key: 'week', label: 'Semaine' }, { key: 'day', label: 'Jour' }].map(v => (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    viewMode === v.key ? 'bg-[#00bbb1] text-white' : 'bg-white text-[#6b7280] hover:bg-gray-50'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={() => { load(); loadBlocked() }}
              disabled={loading}
              className="p-1.5 rounded-lg border border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#00bbb1]/40 transition-colors disabled:opacity-40"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── GHL sync notice ── */}
        {ghlSyncError && (() => {
          const isInfo = ghlSyncError.startsWith('info:')
          const msg    = isInfo ? ghlSyncError.slice(5) : ghlSyncError
          const color  = isInfo ? '#6b7280' : '#f59e0b'
          return (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border"
              style={{ backgroundColor: `${color}12`, borderColor: `${color}40` }}>
              <svg className="w-4 h-4 flex-shrink-0" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isInfo
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                }
              </svg>
              <p className="text-xs font-semibold flex-1" style={{ color }}>{msg}</p>
              <button onClick={() => setGhlSyncError(null)} className="hover:opacity-70 text-xs font-bold" style={{ color }}>✕</button>
            </div>
          )
        })()}

        {/* ── Legend ── */}
        <div className="flex items-center gap-4 flex-wrap">
          {LEGEND.map(l => (
            <div key={l.color} className="flex items-center gap-1.5">
              {l.striped ? (
                <div className="w-2.5 h-2.5 rounded-full border border-[#9ca3af]"
                  style={{ background: 'repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 2px, #f3f4f6 2px, #f3f4f6 5px)' }} />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
              )}
              <span className="text-[10px] font-semibold text-[#9ca3af]">{l.label}</span>
            </div>
          ))}
        </div>

        {/* ── Calendar body ── */}
        <div className="flex-1 rounded-xl border border-[#e5e7eb] bg-white overflow-hidden min-h-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <WeekView
              days={displayedDays}
              appointments={appointments}
              blockedSlots={blockedSlots}
              onApptClick={setSelectedAppt}
              onBlockedSlotClick={handleBlockedSlotClick}
              selectedApptId={selectedAppt?.ghl_id}
            />
          )}
        </div>

        {/* ── Appointment drawer ── */}
        {selectedAppt && (
          <AppointmentDrawer
            appt={selectedAppt}
            onClose={() => setSelectedAppt(null)}
            onStatusUpdate={handleStatusUpdate}
            userId={profile?.id ?? null}
          />
        )}

        {/* ── Blocked slot popup ── */}
        {blockPopup && (
          <BlockedSlotPopup
            slot={blockPopup}
            onEdit={() => handleBlockedEdit(blockPopup)}
            onDelete={() => handleBlockedDelete(blockPopup)}
            onClose={() => setBlockPopup(null)}
          />
        )}

        {/* ── Block slot modal (create / edit) ── */}
        {blockModal && (
          <BlockSlotModal
            initialSlot={blockModal.slot}
            onSave={handleBlockSave}
            onClose={() => setBlockModal(null)}
          />
        )}

        {/* ── Recurrence scope dialog ── */}
        {recurrenceDialog && (
          <RecurrenceDialog
            action={recurrenceDialog.action}
            onThisOne={() => {
              const resolve = recurrenceDialog.resolve
              setRecurrenceDialog(null)
              resolve('one')
            }}
            onAllSeries={() => {
              const resolve = recurrenceDialog.resolve
              setRecurrenceDialog(null)
              resolve('all')
            }}
            onCancel={() => {
              const resolve = recurrenceDialog.resolve
              setRecurrenceDialog(null)
              resolve(null)
            }}
          />
        )}
      </div>
    </Layout>
  )
}
