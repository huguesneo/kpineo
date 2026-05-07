import { useState, useMemo, useEffect } from 'react'
import { format, parseISO, eachDayOfInterval } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useSchedules } from '../../hooks/useSchedule'
import { useScheduleAdjustments } from '../../hooks/useScheduleAdjustments'
import { useHolidays } from '../../hooks/useHolidays'
import {
  usePayPeriodOverrides, upsertPayPeriodOverride, deletePayPeriodOverride,
  getAllPayPeriods, calcPayPeriodHoursWithAdjustments,
} from '../../hooks/usePayPeriodHistory'
import { usePunchEntries } from '../../hooks/usePunchEntries'
import { useAuth } from '../../context/AuthContext'

function calcPunchPeriodHours(punchEntries, periodStart, periodEnd) {
  return (punchEntries ?? [])
    .filter(e => e.date >= periodStart && e.date <= periodEnd)
    .reduce((s, e) => s + Number(e.hours), 0)
}

const JS_DAY_TO_KEY = ['sunday_hours','monday_hours','tuesday_hours','wednesday_hours','thursday_hours','friday_hours','saturday_hours']

function getActiveSchedule(schedules, dateStr) {
  return schedules.find(s =>
    s.effective_from <= dateStr && (s.effective_to == null || s.effective_to >= dateStr)
  ) ?? null
}

function fmtH(h) {
  const n = Number(h)
  if (isNaN(n)) return '—'
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`
}

function fmtPeriod(start, end) {
  try {
    const s = parseISO(start), e = parseISO(end)
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
      return `${format(s, 'd', { locale: fr })}–${format(e, 'd MMM yyyy', { locale: fr })}`
    return `${format(s, 'd MMM', { locale: fr })} – ${format(e, 'd MMM yyyy', { locale: fr })}`
  } catch { return `${start} – ${end}` }
}

// ─── Detail view: daily breakdown ──────────────────────────────
function DailyView({ period, schedules, adjustments, absences, holidayMap, periodTarget, override, punchMode, punchEntries, onBack }) {
  const today = new Date().toISOString().split('T')[0]

  const days = useMemo(() => {
    try {
      const allDays = eachDayOfInterval({ start: parseISO(period.start), end: parseISO(period.end) })

      if (punchMode) {
        const punchMap = new Map((punchEntries ?? []).map(e => [e.date, e]))
        return allDays
          .map(d => {
            const ds = d.toISOString().split('T')[0]
            const punch = punchMap.get(ds) ?? null
            const absence = absences.find(a => a.start_date <= ds && a.end_date >= ds) ?? null
            const holiday = holidayMap[ds] ?? null
            return { ds, d, punch, absence, holiday }
          })
          .filter(({ punch, absence, holiday }) => punch || absence || holiday)
      }

      return allDays.map(d => {
        const ds = d.toISOString().split('T')[0]
        const sched = getActiveSchedule(schedules, ds)
        const scheduledH = sched ? Number(sched[JS_DAY_TO_KEY[d.getDay()]] ?? 0) : 0
        const adj = adjustments.find(a => a.status === 'approved' && a.date === ds) ?? null
        const absence = absences.find(a => a.start_date <= ds && a.end_date >= ds) ?? null
        const holiday = holidayMap[ds] ?? null
        let payrollH
        if (adj) {
          const delta = Number(adj.adjusted_hours) - Number(adj.normal_hours)
          payrollH = delta >= 0
            ? Number(adj.normal_hours)
            : Number(adj.adjusted_hours) + Number(adj.bank_hours_applied ?? 0)
        } else {
          payrollH = scheduledH
        }
        return { ds, d, scheduledH, adj, absence, holiday, payrollH }
      })
    } catch { return [] }
  }, [period, schedules, adjustments, absences, holidayMap, punchMode, punchEntries])

  const totalScheduled = punchMode ? 0 : days.reduce((s, d) => s + (d.scheduledH ?? 0), 0)
  const totalPayroll = punchMode
    ? days.reduce((s, d) => s + (d.punch ? Number(d.punch.hours) : 0), 0)
    : days.reduce((s, d) => s + (d.payrollH ?? 0), 0)
  const effectiveTotal = override ? Number(override.override_hours) : totalPayroll
  const isOnTarget = !punchMode && effectiveTotal >= periodTarget

  return (
    <div>
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
        <div className="flex-1">
          <p className="font-bold text-[#1a1a1a]">{fmtPeriod(period.start, period.end)}</p>
          <p className="text-xs text-[#6b7280] mt-0.5">
            {punchMode
              ? `${fmtH(totalPayroll)} saisies`
              : `Prévu : ${fmtH(totalScheduled)} · Comptabilisé : ${fmtH(totalPayroll)}`
            }
            {override && (
              <span className="ml-2 text-blue-600 font-semibold">· Override admin : {fmtH(override.override_hours)}</span>
            )}
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-xl text-sm font-bold ${
          period.isCurrent ? 'bg-[#00bbb1]/10 text-[#00bbb1]'
          : punchMode ? 'bg-[#f3f4f6] text-[#1a1a1a]'
          : isOnTarget ? 'bg-emerald-50 text-emerald-600'
          : 'bg-amber-50 text-amber-600'
        }`}>
          {punchMode ? fmtH(effectiveTotal) : `${fmtH(effectiveTotal)} / ${fmtH(periodTarget)}`}
        </div>
      </div>

      {/* Missing hours banner — normal mode only */}
      {!punchMode && !period.isCurrent && !isOnTarget && (
        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-800">
          ⚠️ {fmtH(periodTarget - effectiveTotal)} manquant pour atteindre la cible
          {override?.notes && <span className="ml-2 font-normal text-amber-700">· {override.notes}</span>}
        </div>
      )}

      {/* Day-by-day table */}
      <div className="rounded-xl border border-[#f3f4f6] overflow-hidden">
        {punchMode ? (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-0 bg-[#f9fafb] px-4 py-2 border-b border-[#f3f4f6]">
              <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">Journée</span>
              <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide text-right w-20">Heures saisies</span>
            </div>
            {days.length === 0 && (
              <p className="text-sm text-[#6b7280] px-4 py-3">Aucune entrée pour cette période.</p>
            )}
            {days.map(({ ds, d, punch, absence, holiday }) => {
              const isFuture = ds > today
              let dayStatus = null
              if (holiday) dayStatus = { emoji: '🎉', label: holiday.name, color: 'text-purple-700 bg-purple-50' }
              else if (absence) dayStatus = {
                emoji: absence.type === 'sick' ? '🤒' : '🌴',
                label: absence.type === 'sick' ? 'Maladie' : 'Vacances',
                color: absence.type === 'sick' ? 'text-red-700 bg-red-50' : 'text-blue-700 bg-blue-50',
              }
              return (
                <div key={ds}
                  className={`grid grid-cols-[1fr_auto] gap-0 px-4 py-2.5 border-b border-[#f9fafb] last:border-b-0 items-center ${isFuture ? 'opacity-50' : ''} hover:bg-[#fafafa]`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#1a1a1a] capitalize">
                      {format(d, 'EEEE d MMM', { locale: fr })}
                    </span>
                    {dayStatus && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${dayStatus.color}`}>
                        {dayStatus.emoji} {dayStatus.label}
                      </span>
                    )}
                    {punch?.notes && (
                      <span className="text-[10px] text-[#9ca3af]">{punch.notes}</span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-[#1a1a1a] text-right w-20">
                    {punch ? fmtH(punch.hours) : '—'}
                  </span>
                </div>
              )
            })}
          </>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 bg-[#f9fafb] px-4 py-2 border-b border-[#f3f4f6]">
              <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">Journée</span>
              <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide text-right w-16">Prévu</span>
              <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide text-right w-20">Ajustement</span>
              <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide text-right w-16">Payé</span>
            </div>
            {days.map(({ ds, d, scheduledH, adj, absence, holiday, payrollH }) => {
              const isWeekend = scheduledH === 0 && !adj && !absence && !holiday
              const isFuture = ds > today && !period.isCurrent
              if (isWeekend && !holiday) return null

              const delta = adj ? Number(adj.adjusted_hours) - Number(adj.normal_hours) : 0
              const isExtra = delta > 0

              let dayStatus = null
              if (holiday) dayStatus = { emoji: '🎉', label: holiday.name, color: 'text-purple-700 bg-purple-50' }
              else if (absence) dayStatus = {
                emoji: absence.type === 'sick' ? '🤒' : '🌴',
                label: absence.type === 'sick' ? 'Maladie' : 'Vacances',
                color: absence.type === 'sick' ? 'text-red-700 bg-red-50' : 'text-blue-700 bg-blue-50',
              }
              else if (adj) dayStatus = {
                emoji: isExtra ? '📦' : '⚡',
                label: isExtra
                  ? `+${fmtH(delta)} en banque${adj.notes ? ` · ${adj.notes}` : ''}`
                  : `Finit tôt${adj.notes ? ` · ${adj.notes}` : ''}`,
                color: isExtra ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50',
              }

              return (
                <div key={ds}
                  className={`grid grid-cols-[1fr_auto_auto_auto] gap-0 px-4 py-2.5 border-b border-[#f9fafb] last:border-b-0 items-center ${isFuture ? 'opacity-50' : ''} hover:bg-[#fafafa]`}
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#1a1a1a] capitalize">
                        {format(d, 'EEEE d MMM', { locale: fr })}
                      </span>
                      {dayStatus && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${dayStatus.color}`}>
                          {dayStatus.emoji} {dayStatus.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-[#6b7280] text-right w-16">
                    {scheduledH > 0 ? fmtH(scheduledH) : '—'}
                  </span>
                  <span className={`text-sm font-semibold text-right w-20 ${
                    delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-amber-600' : 'text-[#d1d5db]'
                  }`}>
                    {adj ? (delta > 0 ? `+${fmtH(delta)}` : fmtH(delta)) : '—'}
                  </span>
                  <span className={`text-sm font-bold text-right w-16 ${scheduledH === 0 ? 'text-[#d1d5db]' : 'text-[#1a1a1a]'}`}>
                    {scheduledH > 0 ? fmtH(payrollH) : '—'}
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Totals */}
      <div className="mt-3 flex items-center justify-between px-4 py-3 bg-[#f9fafb] rounded-xl">
        <span className="text-xs font-semibold text-[#6b7280]">Total période</span>
        <div className="flex items-center gap-6 text-sm">
          {punchMode ? (
            <span className="font-bold text-[#1a1a1a]">{fmtH(effectiveTotal)} saisies</span>
          ) : (
            <>
              <span className="text-[#6b7280]">Prévu : <strong className="text-[#1a1a1a]">{fmtH(totalScheduled)}</strong></span>
              <span className="text-[#6b7280]">Comptabilisé : <strong className="text-[#1a1a1a]">{fmtH(totalPayroll)}</strong></span>
              {override && (
                <span className="text-blue-600">Override : <strong>{fmtH(override.override_hours)}</strong></span>
              )}
              <span className={`font-bold ${isOnTarget ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isOnTarget ? '✓ Cible atteinte' : `${fmtH(Math.abs(effectiveTotal - periodTarget))} ${effectiveTotal < periodTarget ? 'manquant' : 'en surplus'}`}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main modal ────────────────────────────────────────────────
export default function PayPeriodHistoryModal({ member, payConfig, onClose, isAdmin = false }) {
  const { profile: adminProfile } = useAuth()
  const punchMode = member.punch_mode ?? false
  const { schedules, loading: schedLoading } = useSchedules(member.id)
  const { adjustments, loading: adjLoading } = useScheduleAdjustments(member.id)
  const { overrides, loading: ovLoading, refetch: refetchOverrides } = usePayPeriodOverrides(member.id)
  const { entries: punchEntries, loading: punchLoading } = usePunchEntries(punchMode ? member.id : null)
  const { holidays } = useHolidays()
  const [absences, setAbsences] = useState([])
  const [absLoading, setAbsLoading] = useState(true)

  useEffect(() => {
    if (!member.id) return
    setAbsLoading(true)
    supabase.from('absences').select('*').eq('user_id', member.id)
      .then(({ data }) => { setAbsences(data ?? []); setAbsLoading(false) })
  }, [member.id])

  const loading = schedLoading || adjLoading || ovLoading || absLoading || (punchMode && punchLoading)

  const [expandedPeriod, setExpandedPeriod] = useState(null)
  const [editingPeriodStart, setEditingPeriodStart] = useState(null)
  const [editHours, setEditHours] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(null)

  const weeklyTarget = Number(member.weekly_target_hours ?? 40)
  const periodTarget = weeklyTarget * (payConfig?.period_length_days ?? 14) / 7

  const periods = useMemo(() =>
    getAllPayPeriods(payConfig?.reference_pay_date, payConfig?.period_length_days, 25),
    [payConfig?.reference_pay_date, payConfig?.period_length_days]
  )

  const overrideMap = useMemo(() => {
    const m = {}
    for (const o of overrides) m[o.period_start] = o
    return m
  }, [overrides])

  const holidayMap = useMemo(() => {
    const m = {}
    for (const h of holidays) m[h.date] = h
    return m
  }, [holidays])

  function calcHours(period) {
    if (loading) return null
    if (punchMode) return calcPunchPeriodHours(punchEntries, period.start, period.end)
    return calcPayPeriodHoursWithAdjustments(schedules, adjustments, period.start, period.end)
  }

  function startEdit(period) {
    const ov = overrideMap[period.start]
    const calc = calcHours(period)
    setEditingPeriodStart(period.start)
    setEditHours(ov ? String(ov.override_hours) : calc !== null ? String(calc) : '')
    setEditNotes(ov?.notes ?? '')
  }

  async function handleSave(periodStart) {
    if (!editHours) return
    setSaving(true)
    await upsertPayPeriodOverride({
      user_id: member.id, period_start: periodStart,
      override_hours: editHours, notes: editNotes,
      updated_by: adminProfile?.id,
    })
    await refetchOverrides()
    setSaving(false)
    setEditingPeriodStart(null)
  }

  async function handleClear(overrideId) {
    setClearing(overrideId)
    await deletePayPeriodOverride(overrideId)
    await refetchOverrides()
    setClearing(null)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-4xl my-8 shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f3f4f6]">
          <div>
            <h2 className="font-bold text-[#1a1a1a] text-base">Historique des périodes de paie</h2>
            <p className="text-sm text-[#6b7280] mt-0.5">
              {member.full_name}{punchMode
                ? <span className="ml-2 text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">⏱ Mode punch</span>
                : ` · Cible ${fmtH(periodTarget)} / période`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-[#9ca3af] hover:text-[#1a1a1a] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : expandedPeriod ? (
            <DailyView
              period={expandedPeriod}
              schedules={schedules}
              adjustments={adjustments}
              absences={absences}
              holidayMap={holidayMap}
              periodTarget={periodTarget}
              override={overrideMap[expandedPeriod.start] ?? null}
              punchMode={punchMode}
              punchEntries={punchEntries}
              onBack={() => setExpandedPeriod(null)}
            />
          ) : (
            /* ── Period list ── */
            <div className="space-y-2">
              {periods.length === 0 && <p className="text-sm text-[#6b7280]">Aucune période trouvée.</p>}
              {periods.map(period => {
                const override = overrideMap[period.start]
                const calculated = calcHours(period)
                const effectiveHours = override ? Number(override.override_hours) : calculated
                const isOnTarget = !punchMode && effectiveHours !== null && effectiveHours >= periodTarget
                const isEditing = editingPeriodStart === period.start

                return (
                  <div key={period.start}
                    className={`rounded-xl border overflow-hidden ${
                      period.isCurrent ? 'border-[#00bbb1]/40 bg-[#00bbb1]/5' : 'border-[#f3f4f6] bg-white'
                    }`}
                  >
                    {/* Main row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Status icon */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${
                        period.isCurrent ? 'bg-[#00bbb1]/15 text-[#00bbb1]'
                        : isOnTarget ? 'bg-emerald-50 text-emerald-500'
                        : 'bg-amber-50 text-amber-500'
                      }`}>
                        {period.isCurrent ? '⏱' : isOnTarget ? '✓' : '⚠'}
                      </div>

                      {/* Period info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[#1a1a1a]">
                            {fmtPeriod(period.start, period.end)}
                          </span>
                          {period.isCurrent && (
                            <span className="text-[10px] font-bold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">En cours</span>
                          )}
                          {override && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">🔧 Modifié</span>
                          )}
                        </div>
                        {override?.notes && (
                          <p className="text-xs text-[#9ca3af] mt-0.5">{override.notes}</p>
                        )}
                      </div>

                      {/* Hours */}
                      <div className="text-right flex-shrink-0">
                        <span className={`text-base font-bold ${
                          period.isCurrent ? 'text-[#1a1a1a]'
                          : punchMode ? 'text-[#1a1a1a]'
                          : isOnTarget ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          {effectiveHours !== null ? fmtH(effectiveHours) : '—'}
                        </span>
                        {!punchMode && <span className="text-xs text-[#9ca3af] ml-1">/ {fmtH(periodTarget)}</span>}
                        {!punchMode && override && calculated !== null && (
                          <p className="text-[11px] text-[#9ca3af]">calc. {fmtH(calculated)}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Detail button — always visible for past + current */}
                        {!period.isPast ? null : (
                          <button
                            onClick={() => setExpandedPeriod(period)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-[#9ca3af] hover:text-[#00bbb1] transition-colors"
                            title="Voir le détail journalier"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                        {/* Edit hours — admin only */}
                        {isAdmin && period.isPast && !isEditing && (
                          <button onClick={() => startEdit(period)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-[#9ca3af] hover:text-[#00bbb1] transition-colors"
                            title="Modifier les heures">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {/* Clear override — admin only */}
                        {isAdmin && override && !isEditing && (
                          <button onClick={() => handleClear(override.id)} disabled={clearing === override.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Réinitialiser au calcul automatique">
                            {clearing === override.id ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline edit form — admin only */}
                    {isEditing && (
                      <div className="px-4 pb-4 pt-1 border-t border-[#f3f4f6] bg-gray-50">
                        <p className="text-xs font-semibold text-[#6b7280] mt-2 mb-3">
                          Modifier les heures — {fmtPeriod(period.start, period.end)}
                          {calculated !== null && <span className="font-normal ml-1">(calculé : {fmtH(calculated)})</span>}
                        </p>
                        <div className="flex items-end gap-3">
                          <div>
                            <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Heures effectives</label>
                            <input type="number" min="0" step="0.5" value={editHours}
                              onChange={e => setEditHours(e.target.value)} autoFocus
                              className="w-28 px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Note (optionnel)</label>
                            <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                              placeholder="Raison de la modification…"
                              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                          </div>
                          <div className="flex gap-2 pb-0.5">
                            <button onClick={() => setEditingPeriodStart(null)}
                              className="px-3 py-2 text-sm font-semibold text-[#6b7280] bg-gray-100 hover:bg-gray-200 rounded-lg">
                              Annuler
                            </button>
                            <button onClick={() => handleSave(period.start)} disabled={saving || !editHours}
                              className="px-3 py-2 text-sm font-semibold text-white bg-[#00bbb1] hover:bg-[#009e95] rounded-lg disabled:opacity-50">
                              {saving ? '…' : 'Enregistrer'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
