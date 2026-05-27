import { useState } from 'react'
import Card from '../shared/Card'
import Button from '../shared/Button'
import {
  useSchedules, useAbsences, useAbsenceAllowance, useOvertimeRecords, usePendingChanges,
  upsertSchedule, deleteSchedule, createAbsence, deleteAbsence, updateAbsence,
  upsertAbsenceAllowance, upsertOvertimeRecord, deleteOvertimeRecord, approveOvertimeRecord,
  requestChange, cancelChangeRequest, approveChange, rejectChange,
} from '../../hooks/useSchedule'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../../hooks/usePayPeriod'
import { useScheduleAdjustments, createAdjustment, approveAdjustment, rejectAdjustment, deleteAdjustment, questionAdjustment, replyToQuestion } from '../../hooks/useScheduleAdjustments'
import { useScheduleOverrides, approveScheduleOverride, rejectScheduleOverride, deleteScheduleOverride } from '../../hooks/useScheduleOverrides'
import ScheduleOverrideModal from './ScheduleOverrideModal'
import { useUpcomingHolidays } from '../../hooks/useHolidays'
import { usePunchEntries, upsertPunchEntry, deletePunchEntry } from '../../hooks/usePunchEntries'
import { format, parseISO, eachDayOfInterval } from 'date-fns'
import { fr } from 'date-fns/locale'

const DAYS = [
  { key: 'monday_hours',    label: 'Lun' },
  { key: 'tuesday_hours',   label: 'Mar' },
  { key: 'wednesday_hours', label: 'Mer' },
  { key: 'thursday_hours',  label: 'Jeu' },
  { key: 'friday_hours',    label: 'Ven' },
  { key: 'saturday_hours',  label: 'Sam' },
  { key: 'sunday_hours',    label: 'Dim' },
]

// JS getDay(): 0=Sun,1=Mon,...,6=Sat — maps to our column keys
const JS_DAY_TO_KEY = ['sunday_hours','monday_hours','tuesday_hours','wednesday_hours','thursday_hours','friday_hours','saturday_hours']

function weeklyTotal(s) {
  return DAYS.reduce((sum, d) => sum + Number(s[d.key] ?? 0), 0)
}

function getActiveSchedule(schedules, dateStr) {
  return schedules.find(s =>
    s.effective_from <= dateStr && (s.effective_to == null || s.effective_to >= dateStr)
  ) ?? null
}

function calcHoursForRange(schedules, startDate, endDate) {
  if (!startDate || !endDate || schedules.length === 0) return 0
  try {
    return eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
      .reduce((total, d) => {
        const ds = d.toISOString().split('T')[0]
        const s = getActiveSchedule(schedules, ds)
        return total + (s ? Number(s[JS_DAY_TO_KEY[d.getDay()]] ?? 0) : 0)
      }, 0)
  } catch { return 0 }
}

function fmtH(h) {
  const n = Number(h)
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`
}

function fmtDate(d) {
  try { return format(parseISO(d), 'd MMM yyyy', { locale: fr }) } catch { return d }
}

function fmtDayDate(d) {
  try { return format(parseISO(d), 'EEEE d MMMM', { locale: fr }) } catch { return d }
}

function getScheduledHoursForDate(schedules, dateStr) {
  if (!dateStr || schedules.length === 0) return 0
  try {
    const s = getActiveSchedule(schedules, dateStr)
    if (!s) return 0
    return Number(s[JS_DAY_TO_KEY[parseISO(dateStr).getDay()]] ?? 0)
  } catch { return 0 }
}

function calcPayPeriodHoursWithAdjustments(schedules, adjustments, overrides, periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return 0

  // Build override day map from approved overrides (most recent override wins for a date)
  const overrideDayMap = new Map()
  const sortedOverrides = [...(overrides ?? [])].sort((a, b) => a.created_at < b.created_at ? -1 : 1)
  for (const ov of sortedOverrides) {
    if (ov.status !== 'approved') continue
    for (const day of (ov.days ?? [])) {
      if (day.date >= periodStart && day.date <= periodEnd) {
        overrideDayMap.set(day.date, Number(day.hours))
      }
    }
  }

  const approvedAdj = new Map(
    (adjustments ?? [])
      .filter(a => a.status === 'approved' && a.date >= periodStart && a.date <= periodEnd)
      .map(a => [a.date, a])
  )
  try {
    return eachDayOfInterval({ start: parseISO(periodStart), end: parseISO(periodEnd) })
      .reduce((total, d) => {
        const ds = d.toISOString().split('T')[0]
        // Priority: daily adjustment > approved override > regular schedule
        const adj = approvedAdj.get(ds)
        if (adj) {
          const delta = Number(adj.adjusted_hours) - Number(adj.normal_hours)
          return total + (delta >= 0
            ? Number(adj.normal_hours)
            : Number(adj.adjusted_hours) + Number(adj.bank_hours_applied ?? 0))
        }
        if (overrideDayMap.has(ds)) return total + overrideDayMap.get(ds)
        const s = getActiveSchedule(schedules, ds)
        return total + (s ? Number(s[JS_DAY_TO_KEY[d.getDay()]] ?? 0) : 0)
      }, 0)
  } catch { return 0 }
}

// ─── Adjustment form ───────────────────────────────────────────
function AdjustmentForm({ schedules, bankBalance, existingForDate, onSave, onCancel, saving, isAdmin = false }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [adjHoursStr, setAdjHoursStr] = useState('')
  const [useBank, setUseBank] = useState(false)
  const [bankApplyStr, setBankApplyStr] = useState('')
  const [notes, setNotes] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  const normalHours = getScheduledHoursForDate(schedules, date)
  const adjH = adjHoursStr !== '' ? Number(adjHoursStr) : null
  const delta = adjH !== null ? adjH - normalHours : null
  const isExtra = delta !== null && delta > 0
  const isEarly = delta !== null && delta < 0
  const wouldExceedBank = isExtra && (bankBalance + delta > 2)
  const maxBankApply = isEarly ? Math.min(bankBalance, Math.abs(delta)) : 0
  const bankApply = useBank ? Math.min(Number(bankApplyStr || maxBankApply), maxBankApply) : 0

  const existing = existingForDate(date)
  const blockedByExisting = existing && (existing.status === 'pending' || existing.status === 'approved')

  function handleChangeDate(d) {
    setDate(d)
    setAdjHoursStr('')
    setUseBank(false)
    setBankApplyStr('')
  }

  function handleSubmit() {
    if (adjH === null || delta === 0 || wouldExceedBank || normalHours === 0 || blockedByExisting) return
    if (!isAdmin && (!startTime || !endTime)) return
    onSave({ date, adjusted_hours: adjH, normal_hours: normalHours, bank_hours_applied: bankApply, notes: notes || null, start_time: startTime || null, end_time: endTime || null })
  }

  return (
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Date</label>
          <input type="date" value={date} max={today}
            onChange={e => handleChangeDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
          <p className="text-[11px] text-[#9ca3af] mt-1">
            {normalHours > 0 ? `Horaire prévu : ${normalHours}h` : 'Aucun horaire ce jour'}
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Heures travaillées</label>
          <input type="number" min="0" max="24" step="0.5" value={adjHoursStr}
            placeholder={normalHours > 0 ? String(normalHours) : '0'}
            onChange={e => { setAdjHoursStr(e.target.value); setUseBank(false); setBankApplyStr('') }}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
        </div>
      </div>

      {blockedByExisting && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 font-semibold">
          {existing.status === 'pending'
            ? 'Un ajustement est déjà en attente pour ce jour.'
            : 'Un ajustement a déjà été approuvé pour ce jour.'}
        </div>
      )}

      {!blockedByExisting && delta !== null && delta !== 0 && (
        <div className={`rounded-lg p-3 text-xs space-y-2 ${
          wouldExceedBank ? 'bg-red-50 border border-red-200' :
          isExtra ? 'bg-emerald-50 border border-emerald-100' :
          'bg-amber-50 border border-amber-200'
        }`}>
          {isExtra ? (
            <>
              <p className="font-semibold text-emerald-700">+{fmtH(delta)} → iront dans ta banque d'heures</p>
              {wouldExceedBank
                ? <p className="text-red-600 font-bold">⚠️ Dépasse la limite de 2h (banque actuelle : {fmtH(bankBalance)}). Demande impossible.</p>
                : <p className="text-emerald-600">Banque après approbation : {fmtH(bankBalance + delta)} / 2h</p>
              }
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-700">{fmtH(Math.abs(delta))} de moins que prévu — période de paie réduite</p>
              {bankBalance > 0 && maxBankApply > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={useBank} onChange={e => { setUseBank(e.target.checked); setBankApplyStr('') }}
                    className="rounded accent-[#00bbb1]" />
                  <span className="text-amber-800">Compenser avec des heures en banque ({fmtH(bankBalance)} disponible)</span>
                </label>
              )}
              {useBank && maxBankApply > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-[#6b7280] mb-1 block">Heures à compenser (max {fmtH(maxBankApply)})</label>
                  <input type="number" min="0.5" max={maxBankApply} step="0.5"
                    value={bankApplyStr !== '' ? bankApplyStr : maxBankApply}
                    onChange={e => setBankApplyStr(e.target.value)}
                    className="w-24 px-2 py-1 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!isAdmin && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Heure d'arrivée *</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Heure de départ *</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Note (optionnel)</label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Raison de l'ajustement..."
          className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button size="sm" loading={saving}
          disabled={adjH === null || delta === 0 || wouldExceedBank || normalHours === 0 || blockedByExisting || (!isAdmin && (!startTime || !endTime))}
          onClick={handleSubmit}>
          {isAdmin ? 'Enregistrer' : 'Envoyer pour approbation'}
        </Button>
      </div>
    </div>
  )
}

// ─── Delete confirm inline ─────────────────────────────────────
function DeleteConfirm({ id, confirmId, onConfirm, onCancel }) {
  if (confirmId !== id) return null
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onConfirm(id)} className="text-xs font-bold text-red-500 px-2 py-0.5 bg-red-50 rounded-lg">Oui</button>
      <button onClick={onCancel} className="text-xs text-[#6b7280] px-2 py-0.5 bg-gray-100 rounded-lg">Non</button>
    </div>
  )
}

// ─── Schedule form ─────────────────────────────────────────────
function ScheduleForm({ initial, onSave, onCancel, saving, weeklyTarget = 40 }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState(initial ?? {
    effective_from: today, effective_to: '',
    monday_hours: 8, tuesday_hours: 8, wednesday_hours: 8, thursday_hours: 8,
    friday_hours: 8, saturday_hours: 0, sunday_hours: 0, notes: '',
  })
  const total = weeklyTotal(form)

  return (
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Début</label>
          <input type="date" value={form.effective_from}
            onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Fin (optionnel)</label>
          <input type="date" value={form.effective_to ?? ''}
            onChange={e => setForm(f => ({ ...f, effective_to: e.target.value || null }))}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-[#6b7280]">Heures par jour</p>
          <span className={`text-sm font-bold ${total === weeklyTarget ? 'text-emerald-600' : total > weeklyTarget ? 'text-amber-600' : 'text-[#6b7280]'}`}>
            {total}h / {weeklyTarget}h cible
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-[#9ca3af] uppercase">{label}</span>
              <input type="number" min="0" max="24" step="0.5" value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) || 0 }))}
                className="w-full px-1 py-1.5 text-sm text-center font-bold border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Notes (optionnel)</label>
        <input type="text" value={form.notes ?? ''} placeholder="Ex: Retour congé parental"
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button size="sm" loading={saving} onClick={() => onSave(form)}>Enregistrer</Button>
      </div>
    </div>
  )
}

// ─── Absence form ──────────────────────────────────────────────
function AbsenceForm({ initial, defaultType, schedules, onSave, onCancel, saving }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState(initial ? {
    type: initial.type,
    start_date: initial.start_date,
    end_date: initial.end_date,
    notes: initial.notes ?? '',
  } : {
    type: defaultType ?? 'sick', start_date: today, end_date: today, notes: '',
  })
  const [hoursOverride, setHoursOverride] = useState(!!initial)
  const [manualHours, setManualHours] = useState(initial ? String(initial.hours) : '')

  const autoHours = calcHoursForRange(schedules, form.start_date, form.end_date)
  const hours = hoursOverride ? Number(manualHours) : autoHours

  return (
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
      <div className="flex gap-2">
        {['sick', 'vacation'].map(t => (
          <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
              form.type === t
                ? t === 'sick' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-white border-gray-200 text-[#6b7280] hover:bg-gray-50'
            }`}>
            {t === 'sick' ? '🤒 Maladie' : '🌴 Vacances'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Date début</label>
          <input type="date" value={form.start_date}
            onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: e.target.value > f.end_date ? e.target.value : f.end_date }))}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Date fin</label>
          <input type="date" value={form.end_date} min={form.start_date}
            onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[#6b7280] mb-0.5">Heures</p>
          {hoursOverride ? (
            <input type="number" min="0" step="0.5" value={manualHours}
              onChange={e => setManualHours(e.target.value)}
              placeholder="Ex: 4"
              className="w-24 px-3 py-1.5 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
          ) : (
            <p className="text-xl font-bold text-[#1a1a1a]">{fmtH(autoHours)}</p>
          )}
        </div>
        <button onClick={() => { setHoursOverride(h => !h); if (!hoursOverride) setManualHours(String(autoHours)) }}
          className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors">
          {hoursOverride ? '↩ Auto depuis horaire' : '✏️ Modifier les heures'}
        </button>
      </div>
      <div>
        <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Notes (optionnel)</label>
        <input type="text" value={form.notes} placeholder="Ex: Grippe, Voyage Cuba…"
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button size="sm" loading={saving} onClick={() => onSave({ ...form, hours })}>Enregistrer</Button>
      </div>
    </div>
  )
}

// ─── Pending change banner ────────────────────────────────────
function PendingChangeBanner({ change, isAdmin, onApprove, onReject, onCancel, reviewing, cancelling }) {
  const isModify  = change.action === 'modify'
  const isAbsence = change.entity_type === 'absence'

  if (!isAdmin) {
    return (
      <div className="mb-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 text-sm">⏳</span>
          <span className="text-xs font-semibold text-amber-800">
            {isModify ? 'Modification' : 'Suppression'} en attente d'approbation
          </span>
        </div>
        <button
          disabled={cancelling}
          onClick={onCancel}
          className="text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
          {cancelling ? '…' : 'Annuler la demande'}
        </button>
      </div>
    )
  }

  // Admin view
  const pd = change.proposed_data
  return (
    <div className="mb-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-blue-500 text-sm flex-shrink-0">🔔</span>
          <span className="text-xs font-bold text-blue-800 truncate">
            Demande de {isModify ? 'modification' : 'suppression'} · {isAbsence ? 'Absence' : 'Horaire'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button disabled={reviewing} onClick={onReject}
            className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
            {reviewing ? '…' : 'Refuser'}
          </button>
          <button disabled={reviewing} onClick={onApprove}
            className="text-xs font-bold text-white bg-[#00bbb1] hover:bg-[#009e95] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
            {reviewing ? '…' : 'Approuver'}
          </button>
        </div>
      </div>
      {isModify && pd && (
        <div className="mt-1.5 text-xs text-blue-700">
          {isAbsence ? (
            <span>
              {pd.type === 'sick' ? '🤒 Maladie' : '🌴 Vacances'} ·{' '}
              {fmtDate(pd.start_date)}{pd.start_date !== pd.end_date ? ` → ${fmtDate(pd.end_date)}` : ''}{' '}
              · {fmtH(pd.hours)}
              {pd.notes ? ` · ${pd.notes}` : ''}
            </span>
          ) : (
            <span>
              Depuis {fmtDate(pd.effective_from)}
              {pd.effective_to ? ` → ${fmtDate(pd.effective_to)}` : ''}{' '}
              · {weeklyTotal(pd)}h/sem
              {pd.notes ? ` · ${pd.notes}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function ScheduleManager({ userId, isAdmin, weeklyTarget = 40, punchMode = false }) {
  const year = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]
  const upcomingHolidays = useUpcomingHolidays(14)

  const { schedules, loading: schedLoading, refetch: refetchSched } = useSchedules(userId)
  const { absences, loading: absLoading, refetch: refetchAbs }       = useAbsences(userId, year)
  const { allowance, refetch: refetchAllow }                          = useAbsenceAllowance(userId, year)
  const { records: overtimeRecs, refetch: refetchOT }                 = useOvertimeRecords(userId, year)
  const { changes: pendingChanges, refetch: refetchPending }          = usePendingChanges(userId)
  const { config: payConfig }                                         = usePayPeriodConfig()
  const { adjustments, refetch: refetchAdj }                          = useScheduleAdjustments(userId)
  const { overrides, refetch: refetchOverrides }                       = useScheduleOverrides(userId)
  const { entries: punchEntries, loading: punchLoading, refetch: refetchPunch } = usePunchEntries(punchMode ? userId : null, year)

  const payPeriod = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null
  const payPeriodHours = payPeriod ? calcPayPeriodHoursWithAdjustments(schedules, adjustments, overrides, payPeriod.start, payPeriod.end) : 0
  const PAY_TARGET = weeklyTarget * (payConfig?.period_length_days ?? 14) / 7

  const punchPeriodHours = punchMode && payPeriod
    ? punchEntries.filter(e => e.date >= payPeriod.start && e.date <= payPeriod.end)
        .reduce((s, e) => s + Number(e.hours), 0)
    : 0

  // Bank balance: sum of approved positive deltas (all-time) minus bank hours applied, capped at 2h
  const bankEarned = adjustments
    .filter(a => a.status === 'approved' && Number(a.adjusted_hours) > Number(a.normal_hours))
    .reduce((sum, a) => sum + (Number(a.adjusted_hours) - Number(a.normal_hours)), 0)
  const bankUsedTotal = adjustments
    .filter(a => a.status === 'approved')
    .reduce((sum, a) => sum + Number(a.bank_hours_applied ?? 0), 0)
  const bankBalance = Math.max(0, Math.min(2, bankEarned) - bankUsedTotal)

  const [addingSched, setAddingSched] = useState(false)
  const [editingSchedId, setEditingSchedId] = useState(null)
  const [schedSaving, setSchedSaving] = useState(false)
  const [confirmDelSched, setConfirmDelSched] = useState(null)

  const [addingAbsence, setAddingAbsence] = useState(null)
  const [editingAbsenceId, setEditingAbsenceId] = useState(null)
  const [absSaving, setAbsSaving] = useState(false)
  const [confirmDelAbs, setConfirmDelAbs] = useState(null)

  const [allowForm, setAllowForm] = useState(null)
  const [allowSaving, setAllowSaving] = useState(false)

  const [showOTForm, setShowOTForm] = useState(false)
  const [otForm, setOtForm] = useState({ week_start: '', extra_hours: '', notes: '' })
  const [otSaving, setOtSaving] = useState(false)
  const [confirmDelOT, setConfirmDelOT] = useState(null)
  const [approvingOT, setApprovingOT] = useState(null)

  // Pending change actions
  const [reviewingChange, setReviewingChange] = useState(null)
  const [cancellingChange, setCancellingChange] = useState(null)

  // Adjustment state
  const [showAdjForm, setShowAdjForm] = useState(false)
  const [adjSaving, setAdjSaving] = useState(false)
  const [approvingAdj, setApprovingAdj] = useState(null)
  const [rejectingAdj, setRejectingAdj] = useState(null)
  const [confirmDelAdj, setConfirmDelAdj] = useState(null)
  const [questioningAdj, setQuestioningAdj] = useState(null)
  const [questionText, setQuestionText] = useState('')
  const [questionSaving, setQuestionSaving] = useState(false)
  const [replyingAdj, setReplyingAdj] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [replySaving, setReplySaving] = useState(false)

  // Override state
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [approvingOv, setApprovingOv] = useState(null)
  const [rejectingOv, setRejectingOv] = useState(null)
  const [confirmDelOv, setConfirmDelOv] = useState(null)

  // Punch state
  const [showPunchForm, setShowPunchForm] = useState(false)
  const [punchForm, setPunchForm] = useState({ date: today, hours: '', notes: '' })
  const [punchSaving, setPunchSaving] = useState(false)
  const [confirmDelPunch, setConfirmDelPunch] = useState(null)
  const [deletingPunch, setDeletingPunch] = useState(null)

  // ── Computed balances ──
  const sickUsed     = absences.filter(a => a.type === 'sick').reduce((s, a) => s + Number(a.hours), 0)
  const vacationUsed = absences.filter(a => a.type === 'vacation').reduce((s, a) => s + Number(a.hours), 0)
  const sickAllowed     = Number(allowance?.sick_hours ?? 0)
  const vacationAllowed = Number(allowance?.vacation_hours ?? 0)
  const sickExcess     = Math.max(0, sickUsed - sickAllowed)
  const vacationExcess = Math.max(0, vacationUsed - vacationAllowed)
  const totalExcess    = sickExcess + vacationExcess
  const totalRecovered = overtimeRecs.filter(r => r.is_approved).reduce((s, r) => s + Number(r.extra_hours), 0)
  const remainingMakeup = Math.max(0, totalExcess - totalRecovered)

  // ── Handlers ──
  async function handleSaveSched(form) {
    setSchedSaving(true)
    await upsertSchedule(editingSchedId
      ? { ...form, id: editingSchedId, user_id: userId }
      : { ...form, user_id: userId }
    )
    await refetchSched()
    setSchedSaving(false)
    setAddingSched(false)
    setEditingSchedId(null)
  }

  async function handleDeleteSched(id) {
    await deleteSchedule(id)
    setConfirmDelSched(null)
    refetchSched()
  }

  async function handleSaveAbsence(form) {
    setAbsSaving(true)
    await createAbsence({ ...form, user_id: userId })
    await refetchAbs()
    setAbsSaving(false)
    setAddingAbsence(null)
  }

  async function handleDeleteAbsence(id) {
    await deleteAbsence(id)
    setConfirmDelAbs(null)
    refetchAbs()
  }

  async function handleSaveAbsenceEdit(id, form) {
    setAbsSaving(true)
    await updateAbsence(id, { type: form.type, start_date: form.start_date, end_date: form.end_date, notes: form.notes, hours: form.hours })
    await refetchAbs()
    setAbsSaving(false)
    setEditingAbsenceId(null)
  }

  async function handleSaveAllowance() {
    if (!allowForm) return
    setAllowSaving(true)
    await upsertAbsenceAllowance({ user_id: userId, year, sick_hours: allowForm.sick, vacation_hours: allowForm.vacation })
    await refetchAllow()
    setAllowSaving(false)
    setAllowForm(null)
  }

  async function handleSaveOT() {
    if (!otForm.week_start || !otForm.extra_hours) return
    setOtSaving(true)
    await upsertOvertimeRecord({ user_id: userId, ...otForm })
    await refetchOT()
    setOtSaving(false)
    setShowOTForm(false)
    setOtForm({ week_start: '', extra_hours: '', notes: '' })
  }

  async function handleDeleteOT(id) {
    await deleteOvertimeRecord(id)
    setConfirmDelOT(null)
    refetchOT()
  }

  async function handleApproveOT(id) {
    setApprovingOT(id)
    await approveOvertimeRecord(id, userId)
    await refetchOT()
    setApprovingOT(null)
  }

  // ── Adjustment handlers ──

  function existingAdjForDate(dateStr) {
    return adjustments.find(a => a.date === dateStr) ?? null
  }

  async function handleCreateAdj(form) {
    setAdjSaving(true)
    // If there's a rejected adjustment for this date, delete it first (UNIQUE constraint)
    const existing = existingAdjForDate(form.date)
    if (existing && existing.status === 'rejected') {
      await deleteAdjustment(existing.id)
    }
    await createAdjustment({ ...form, user_id: userId })
    await refetchAdj()
    setAdjSaving(false)
    setShowAdjForm(false)
  }

  async function handleApproveAdj(id) {
    setApprovingAdj(id)
    await approveAdjustment(id, userId)
    await refetchAdj()
    setApprovingAdj(null)
  }

  async function handleRejectAdj(id) {
    setRejectingAdj(id)
    await rejectAdjustment(id, userId)
    await refetchAdj()
    setRejectingAdj(null)
  }

  async function handleDeleteAdj(id) {
    await deleteAdjustment(id)
    setConfirmDelAdj(null)
    refetchAdj()
  }

  async function handleQuestionAdj(id) {
    if (!questionText.trim()) return
    setQuestionSaving(true)
    const { error } = await questionAdjustment(id, userId, questionText.trim())
    setQuestionSaving(false)
    if (error) {
      console.error('[questionAdj] error:', error)
      alert(`Erreur: ${error.message}`)
      return
    }
    setQuestioningAdj(null)
    setQuestionText('')
    refetchAdj()
  }

  async function handleReplyAdj(id) {
    if (!replyText.trim()) return
    setReplySaving(true)
    await replyToQuestion(id, replyText.trim())
    setReplySaving(false)
    setReplyingAdj(null)
    setReplyText('')
    refetchAdj()
  }

  // ── Override handlers ──

  async function handleApproveOverride(id) {
    setApprovingOv(id)
    await approveScheduleOverride(id, userId)
    await refetchOverrides()
    setApprovingOv(null)
  }

  async function handleRejectOverride(id) {
    setRejectingOv(id)
    await rejectScheduleOverride(id, userId)
    await refetchOverrides()
    setRejectingOv(null)
  }

  async function handleDeleteOverride(id) {
    await deleteScheduleOverride(id)
    setConfirmDelOv(null)
    refetchOverrides()
  }

  // ── Punch handlers ──

  async function handleSavePunch() {
    if (!punchForm.hours || !punchForm.date) return
    setPunchSaving(true)
    await upsertPunchEntry({ user_id: userId, date: punchForm.date, hours: Number(punchForm.hours), notes: punchForm.notes })
    await refetchPunch()
    setPunchSaving(false)
    setShowPunchForm(false)
    setPunchForm({ date: today, hours: '', notes: '' })
  }

  async function handleDeletePunch(id) {
    setDeletingPunch(id)
    await deletePunchEntry(id)
    setConfirmDelPunch(null)
    setDeletingPunch(null)
    await refetchPunch()
  }

  // ── Pending changes handlers ──

  // Membre : demande de modification d'une absence
  async function requestAbsenceModify(absence, newForm) {
    await requestChange({
      user_id: userId, entity_type: 'absence', action: 'modify',
      record_id: absence.id, proposed_data: newForm,
    })
    await refetchPending()
    setEditingAbsenceId(null)
  }

  // Membre : demande de suppression d'une absence
  async function requestAbsenceDelete(id) {
    await requestChange({
      user_id: userId, entity_type: 'absence', action: 'delete', record_id: id,
    })
    setConfirmDelAbs(null)
    await refetchPending()
  }

  // Membre : demande de modification d'un horaire
  async function requestScheduleModify(sched, newForm) {
    await requestChange({
      user_id: userId, entity_type: 'schedule', action: 'modify',
      record_id: sched.id, proposed_data: newForm,
    })
    await refetchPending()
    setEditingSchedId(null)
  }

  // Membre : demande de suppression d'un horaire
  async function requestScheduleDelete(id) {
    await requestChange({
      user_id: userId, entity_type: 'schedule', action: 'delete', record_id: id,
    })
    setConfirmDelSched(null)
    await refetchPending()
  }

  // Membre : annuler sa propre demande
  async function handleCancelChange(id) {
    setCancellingChange(id)
    await cancelChangeRequest(id)
    await refetchPending()
    setCancellingChange(null)
  }

  // Admin : approuver un changement
  async function handleApproveChange(change) {
    setReviewingChange(change.id)
    await approveChange(change, userId)
    await Promise.all([refetchPending(), refetchAbs(), refetchSched()])
    setReviewingChange(null)
  }

  // Admin : refuser un changement
  async function handleRejectChange(id) {
    setReviewingChange(id)
    await rejectChange(id, userId)
    await refetchPending()
    setReviewingChange(null)
  }

  // Helper : pending change for a given record
  function pendingFor(recordId) {
    return pendingChanges.find(c => c.record_id === recordId) ?? null
  }

  function canEditSched(s) { return isAdmin || s.effective_from >= today }

  return (
    <div className="space-y-6">

      {/* ── Rappel congés fériés ── */}
      {upcomingHolidays.length > 0 && (
        <div className="px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl flex items-start gap-3">
          <span className="text-purple-500 mt-0.5 flex-shrink-0">🎉</span>
          <div>
            <p className="text-xs font-bold text-purple-800 mb-0.5">Congé{upcomingHolidays.length > 1 ? 's' : ''} férié{upcomingHolidays.length > 1 ? 's' : ''} à venir</p>
            {upcomingHolidays.map(h => (
              <p key={h.id} className="text-xs text-purple-700">
                <span className="font-semibold">{h.name}</span> — {format(parseISO(h.date), 'EEEE d MMMM', { locale: fr })}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Période de paie ── */}
      {payPeriod && (
        <Card className="p-5">
          <h3 className="font-bold text-sm text-[#1a1a1a] mb-3">Période de paie en cours</h3>
          <p className="text-xs text-[#6b7280] mb-4">
            {format(parseISO(payPeriod.start), 'd MMM', { locale: fr })} – {format(parseISO(payPeriod.end), 'd MMM yyyy', { locale: fr })}
          </p>
          {punchMode ? (
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-[#1a1a1a]">{fmtH(punchPeriodHours)}</span>
              <span className="text-sm text-[#9ca3af] mb-1">heures saisies</span>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between mb-2">
                <span className={`text-3xl font-bold ${
                  payPeriodHours >= PAY_TARGET ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {fmtH(payPeriodHours)}
                </span>
                <span className="text-sm text-[#9ca3af] font-semibold">/ {PAY_TARGET}h</span>
              </div>
              <div className="w-full bg-[#f3f4f6] rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-700 ${
                    payPeriodHours >= PAY_TARGET ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${Math.min(100, (payPeriodHours / PAY_TARGET) * 100)}%` }}
                />
              </div>
              {payPeriodHours < PAY_TARGET && (
                <p className="text-xs text-amber-700 mt-2 font-semibold">
                  {fmtH(PAY_TARGET - payPeriodHours)} manquant pour atteindre la cible
                </p>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── Saisie journalière (mode punch uniquement) ── */}
      {punchMode && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-[#1a1a1a]">Saisie journalière</h3>
              <p className="text-xs text-[#6b7280]">Entrez vos heures travaillées par journée</p>
            </div>
            <Button size="sm" onClick={() => { setShowPunchForm(v => !v); setPunchForm({ date: today, hours: '', notes: '' }) }}>
              {showPunchForm ? 'Annuler' : '+ Ajouter'}
            </Button>
          </div>

          {showPunchForm && (
            <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Date</label>
                  <input type="date" value={punchForm.date} max={today}
                    onChange={e => setPunchForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Heures travaillées</label>
                  <input type="number" min="0" max="24" step="0.5" value={punchForm.hours}
                    placeholder="Ex : 7.5"
                    onChange={e => setPunchForm(f => ({ ...f, hours: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Note (optionnel)</label>
                <input type="text" value={punchForm.notes}
                  onChange={e => setPunchForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Raison, projet…"
                  onKeyDown={e => { if (e.key === 'Enter') handleSavePunch() }}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setShowPunchForm(false)}>Annuler</Button>
                <Button size="sm" loading={punchSaving}
                  disabled={!punchForm.hours || !punchForm.date}
                  onClick={handleSavePunch}>
                  Enregistrer
                </Button>
              </div>
            </div>
          )}

          {punchLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
          ) : punchEntries.length === 0 ? (
            <p className="text-sm text-[#6b7280] py-2">Aucune entrée pour cette année.</p>
          ) : (
            <div className="space-y-2">
              {punchEntries.slice(0, 30).map(e => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#f3f4f6] bg-gray-50 text-xs gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#1a1a1a] capitalize">{fmtDayDate(e.date)}</p>
                    {e.notes && <p className="text-[#9ca3af] mt-0.5">{e.notes}</p>}
                  </div>
                  <span className="text-sm font-bold text-[#1a1a1a]">{fmtH(e.hours)}</span>
                  {confirmDelPunch === e.id ? (
                    <DeleteConfirm id={e.id} confirmId={confirmDelPunch}
                      onConfirm={handleDeletePunch}
                      onCancel={() => setConfirmDelPunch(null)} />
                  ) : (
                    <button onClick={() => setConfirmDelPunch(e.id)}
                      disabled={deletingPunch === e.id}
                      className="text-[#9ca3af] hover:text-red-500 transition-colors disabled:opacity-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Heures en banque (membre seulement, hors punch) ── */}
      {!punchMode && !isAdmin && bankEarned > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-[#1a1a1a]">Heures en banque</h3>
            <span className="text-xs text-[#9ca3af]">max 2h</span>
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className={`text-3xl font-bold ${bankBalance > 0 ? 'text-emerald-600' : 'text-[#9ca3af]'}`}>
              {fmtH(bankBalance)}
            </span>
            <span className="text-sm text-[#9ca3af] mb-1">disponible</span>
          </div>
          <div className="w-full bg-[#f3f4f6] rounded-full h-2">
            <div className="h-2 rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${Math.min(100, (bankBalance / 2) * 100)}%` }} />
          </div>
          {bankUsedTotal > 0 && (
            <p className="text-xs text-[#9ca3af] mt-2">{fmtH(bankUsedTotal)} utilisé pour compenser des absences</p>
          )}
        </Card>
      )}

      {/* ── Alerte heures à rattraper (hors punch) ── */}
      {!punchMode && remainingMakeup > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-2xl mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="font-bold text-amber-800">{fmtH(remainingMakeup)} à rattraper</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {sickExcess > 0 && `${fmtH(sickExcess)} maladie en dépassement`}
                {sickExcess > 0 && vacationExcess > 0 && ' · '}
                {vacationExcess > 0 && `${fmtH(vacationExcess)} vacances en dépassement`}
                {totalRecovered > 0 && ` · ${fmtH(totalRecovered)} déjà récupéré`}
              </p>
            </div>
            <Button size="sm" onClick={() => setShowOTForm(v => !v)}>
              {showOTForm ? 'Annuler' : '+ Inscrire heures supp.'}
            </Button>
          </div>

          {showOTForm && (
            <div className="grid grid-cols-3 gap-3 items-end mb-3 pl-9">
              <div>
                <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Date</label>
                <input type="date" value={otForm.week_start}
                  onChange={e => setOtForm(f => ({ ...f, week_start: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Heures supp.</label>
                <input type="number" min="0.5" step="0.5" value={otForm.extra_hours} placeholder="Ex: 1"
                  onChange={e => setOtForm(f => ({ ...f, extra_hours: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
              </div>
              <Button size="sm" loading={otSaving} onClick={handleSaveOT}>Sauvegarder</Button>
            </div>
          )}

          {overtimeRecs.length > 0 && (
            <div className="pl-9 space-y-1">
              {overtimeRecs.map(r => (
                <div key={r.id} className="flex items-center justify-between px-3 py-1.5 bg-white rounded-lg text-xs">
                  <span className="text-[#6b7280] font-semibold capitalize">
                    {fmtDayDate(r.week_start)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${r.is_approved ? 'text-emerald-600' : 'text-amber-600'}`}>+{fmtH(r.extra_hours)}</span>
                    {r.is_approved ? (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Approuvé</span>
                    ) : isAdmin ? (
                      <button
                        onClick={() => handleApproveOT(r.id)}
                        disabled={approvingOT === r.id}
                        className="text-[10px] font-bold text-white bg-[#00bbb1] hover:bg-[#009e95] px-2 py-0.5 rounded-full disabled:opacity-50 transition-colors">
                        {approvingOT === r.id ? '...' : 'Approuver'}
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">En attente</span>
                    )}
                    {confirmDelOT === r.id ? (
                      <DeleteConfirm id={r.id} confirmId={confirmDelOT} onConfirm={handleDeleteOT} onCancel={() => setConfirmDelOT(null)} />
                    ) : (
                      <button onClick={() => setConfirmDelOT(r.id)} className="text-[#9ca3af] hover:text-red-500 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Horaire (hors punch) ── */}
      {!punchMode && (<Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Horaire hebdomadaire</h3>
            <p className="text-xs text-[#6b7280]">Cible : {weeklyTarget}h / semaine</p>
          </div>
          {isAdmin
            ? <Button size="sm" onClick={() => { setAddingSched(true); setEditingSchedId(null) }}>+ Ajouter</Button>
            : <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setShowOverrideModal(true)}>
                  Ajuster horaire
                </Button>
                <Button size="sm" onClick={() => setShowAdjForm(v => !v)}>
                  {showAdjForm ? 'Annuler' : 'Ajuster une journée'}
                </Button>
              </div>
          }
        </div>

        {schedLoading ? (
          <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-[#6b7280] py-2">Aucun horaire défini.</p>
        ) : (
          <div className="space-y-3">
            {schedules.map(s => {
              const total = weeklyTotal(s)
              const isActive = s.effective_from <= today && (s.effective_to == null || s.effective_to >= today)
              const pc = pendingFor(s.id)

              if (editingSchedId === s.id) {
                return (
                  <ScheduleForm key={s.id} initial={s} saving={schedSaving} weeklyTarget={weeklyTarget}
                    onSave={form => isAdmin
                      ? handleSaveSched({ ...form, id: s.id })
                      : requestScheduleModify(s, form)}
                    onCancel={() => setEditingSchedId(null)} />
                )
              }
              return (
                <div key={s.id} className={`rounded-xl border p-4 ${isActive ? 'border-[#00bbb1]/30 bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-gray-50'}`}>
                  {/* Pending change banner */}
                  {pc && (
                    <PendingChangeBanner
                      change={pc} isAdmin={isAdmin}
                      onApprove={() => handleApproveChange(pc)}
                      onReject={() => handleRejectChange(pc.id)}
                      onCancel={() => handleCancelChange(pc.id)}
                      reviewing={reviewingChange === pc.id}
                      cancelling={cancellingChange === pc.id}
                    />
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {isActive && <span className="text-[10px] font-bold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">Actif</span>}
                      <p className="text-xs font-semibold text-[#6b7280]">
                        Depuis le {fmtDate(s.effective_from)}
                        {s.effective_to ? ` → ${fmtDate(s.effective_to)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${total === weeklyTarget ? 'text-emerald-600' : total > weeklyTarget ? 'text-amber-600' : 'text-[#6b7280]'}`}>
                        {total}h/sem
                      </span>
                      {canEditSched(s) && !pc && (
                        <>
                          <button onClick={() => setEditingSchedId(s.id)}
                            className="p-1.5 rounded-lg hover:bg-white text-[#9ca3af] hover:text-[#00bbb1] transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          {confirmDelSched === s.id ? (
                            <DeleteConfirm id={s.id} confirmId={confirmDelSched}
                              onConfirm={isAdmin ? handleDeleteSched : requestScheduleDelete}
                              onCancel={() => setConfirmDelSched(null)} />
                          ) : (
                            <button onClick={() => setConfirmDelSched(s.id)}
                              className="p-1.5 rounded-lg hover:bg-white text-[#9ca3af] hover:text-red-500 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {DAYS.map(({ key, label }) => (
                      <div key={key} className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-bold text-[#9ca3af] uppercase">{label}</span>
                        <span className={`text-sm font-bold ${Number(s[key]) > 0 ? 'text-[#1a1a1a]' : 'text-[#d1d5db]'}`}>
                          {Number(s[key]) > 0 ? `${Number(s[key])}h` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {s.notes && <p className="text-xs text-[#9ca3af] mt-2">{s.notes}</p>}
                </div>
              )
            })}
          </div>
        )}

        {addingSched && (
          <div className="mt-4">
            <ScheduleForm saving={schedSaving} weeklyTarget={weeklyTarget}
              onSave={form => handleSaveSched({ ...form, user_id: userId })}
              onCancel={() => setAddingSched(false)} />
          </div>
        )}

        {showAdjForm && !isAdmin && (
          <div className="mt-4">
            <AdjustmentForm
              schedules={schedules}
              bankBalance={bankBalance}
              existingForDate={existingAdjForDate}
              saving={adjSaving}
              onSave={handleCreateAdj}
              onCancel={() => setShowAdjForm(false)}
            />
          </div>
        )}
      </Card>)}

      {/* ── Allocations (admin seulement) ── */}
      {isAdmin && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-sm text-[#1a1a1a]">Allocations annuelles {year}</h3>
              <p className="text-xs text-[#6b7280]">Heures disponibles pour maladie et vacances</p>
            </div>
            {!allowForm && (
              <Button size="sm" variant="secondary"
                onClick={() => setAllowForm({ sick: allowance?.sick_hours ?? '', vacation: allowance?.vacation_hours ?? '' })}>
                Modifier
              </Button>
            )}
          </div>

          {allowForm ? (
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="text-xs font-semibold text-[#6b7280] mb-1 block">🤒 Maladie (heures)</label>
                <input type="number" min="0" step="0.5" value={allowForm.sick}
                  onChange={e => setAllowForm(f => ({ ...f, sick: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-[#6b7280] mb-1 block">🌴 Vacances (heures)</label>
                <input type="number" min="0" step="0.5" value={allowForm.vacation}
                  onChange={e => setAllowForm(f => ({ ...f, vacation: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
              </div>
              <div className="flex gap-2 pb-0.5">
                <Button size="sm" variant="secondary" onClick={() => setAllowForm(null)}>Annuler</Button>
                <Button size="sm" loading={allowSaving} onClick={handleSaveAllowance}>Enregistrer</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Maladie', emoji: '🤒', val: sickAllowed, color: 'text-red-600', bg: 'bg-red-50' },
                { label: 'Vacances', emoji: '🌴', val: vacationAllowed, color: 'text-blue-600', bg: 'bg-blue-50' },
              ].map(({ label, emoji, val, color, bg }) => (
                <div key={label} className={`rounded-xl px-4 py-3 ${bg}`}>
                  <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-1">{emoji} {label}</p>
                  {val > 0
                    ? <p className={`text-2xl font-bold ${color}`}>{fmtH(val)}</p>
                    : <p className="text-sm text-[#9ca3af]">Non défini</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Absences ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Absences {year}</h3>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAddingAbsence('sick')}>+ Maladie</Button>
            <Button size="sm" onClick={() => setAddingAbsence('vacation')}>+ Vacances</Button>
          </div>
        </div>

        {/* Balances */}
        {(sickAllowed > 0 || vacationAllowed > 0) && (
          <div className="grid grid-cols-2 gap-4 mb-5">
            {[
              { label: 'Maladie',  emoji: '🤒', used: sickUsed,     allowed: sickAllowed,     excess: sickExcess,     color: '#ef4444', bg: 'bg-red-50'  },
              { label: 'Vacances', emoji: '🌴', used: vacationUsed, allowed: vacationAllowed, excess: vacationExcess, color: '#3b82f6', bg: 'bg-blue-50' },
            ].map(({ label, emoji, used, allowed, excess, color, bg }) => {
              const remaining = Math.max(0, allowed - used)
              const pct = allowed > 0 ? Math.min(100, (used / allowed) * 100) : 0
              return (
                <div key={label} className={`rounded-xl p-4 ${excess > 0 ? 'bg-amber-50 border border-amber-200' : bg}`}>
                  <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-1">{emoji} {label}</p>
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <span className="text-2xl font-bold" style={{ color: excess > 0 ? '#d97706' : color }}>
                      {fmtH(remaining)}
                    </span>
                    <span className="text-xs text-[#9ca3af]">restant</span>
                  </div>
                  <p className="text-xs text-[#6b7280] mb-2">{fmtH(used)} utilisé / {fmtH(allowed)} alloué</p>
                  <div className="w-full bg-white/60 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: excess > 0 ? '#f59e0b' : color }} />
                  </div>
                  {excess > 0 && (
                    <p className="text-xs font-bold text-amber-700 mt-1.5">⚠️ {fmtH(excess)} en dépassement</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {addingAbsence && (
          <div className="mb-4">
            <AbsenceForm defaultType={addingAbsence} schedules={schedules} saving={absSaving}
              onSave={handleSaveAbsence} onCancel={() => setAddingAbsence(null)} />
          </div>
        )}

        {absLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : absences.length === 0 ? (
          <p className="text-sm text-[#6b7280] py-2">Aucune absence enregistrée.</p>
        ) : (
          <div className="space-y-2">
            {absences.map(a => {
              const pc = pendingFor(a.id)

              if (editingAbsenceId === a.id) {
                return (
                  <AbsenceForm key={a.id} initial={a} schedules={schedules} saving={absSaving}
                    onSave={form => isAdmin
                      ? handleSaveAbsenceEdit(a.id, form)
                      : requestAbsenceModify(a, form)}
                    onCancel={() => setEditingAbsenceId(null)} />
                )
              }

              return (
                <div key={a.id} className={`rounded-xl border ${
                  pc ? 'border-amber-200 bg-amber-50/20'
                    : a.type === 'sick' ? 'border-red-100 bg-red-50/30' : 'border-blue-100 bg-blue-50/30'
                }`}>
                  {pc && (
                    <div className="px-4 pt-3">
                      <PendingChangeBanner
                        change={pc} isAdmin={isAdmin}
                        onApprove={() => handleApproveChange(pc)}
                        onReject={() => handleRejectChange(pc.id)}
                        onCancel={() => handleCancelChange(pc.id)}
                        reviewing={reviewingChange === pc.id}
                        cancelling={cancellingChange === pc.id}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{a.type === 'sick' ? '🤒' : '🌴'}</span>
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a1a]">
                          {a.start_date === a.end_date
                            ? fmtDate(a.start_date)
                            : `${fmtDate(a.start_date)} → ${fmtDate(a.end_date)}`}
                        </p>
                        {a.notes && <p className="text-xs text-[#9ca3af]">{a.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${a.type === 'sick' ? 'text-red-600' : 'text-blue-600'}`}>
                        {fmtH(a.hours)}
                      </span>
                      {!pc && (
                        <>
                          <button onClick={() => setEditingAbsenceId(a.id)}
                            className="p-1.5 rounded-lg hover:bg-white text-[#9ca3af] hover:text-[#00bbb1] transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          {confirmDelAbs === a.id ? (
                            <DeleteConfirm id={a.id} confirmId={confirmDelAbs}
                              onConfirm={isAdmin ? handleDeleteAbsence : requestAbsenceDelete}
                              onCancel={() => setConfirmDelAbs(null)} />
                          ) : (
                            <button onClick={() => setConfirmDelAbs(a.id)}
                              className="p-1.5 rounded-lg hover:bg-white text-[#9ca3af] hover:text-red-500 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Ajustements journaliers ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Ajustements journaliers</h3>
            <p className="text-xs text-[#6b7280]">Finir tôt ou faire des heures en banque (max 2h)</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowAdjForm(v => !v)}>
            {showAdjForm ? 'Annuler' : isAdmin ? '+ Ajouter' : '+ Ajuster'}
          </Button>
        </div>

        {showAdjForm && (
          <div className="mb-4">
            <AdjustmentForm
              schedules={schedules}
              bankBalance={bankBalance}
              existingForDate={existingAdjForDate}
              saving={adjSaving}
              isAdmin={isAdmin}
              onSave={async form => {
                setAdjSaving(true)
                const existing = existingAdjForDate(form.date)
                if (existing && existing.status === 'rejected') await deleteAdjustment(existing.id)
                await createAdjustment({
                  ...form,
                  user_id: userId,
                  ...(isAdmin ? { status: 'approved', reviewed_by: userId, reviewed_at: new Date().toISOString() } : {}),
                })
                await refetchAdj()
                setAdjSaving(false)
                setShowAdjForm(false)
              }}
              onCancel={() => setShowAdjForm(false)}
            />
          </div>
        )}

        {adjustments.length === 0 ? (
          <p className="text-sm text-[#6b7280] py-2">Aucun ajustement enregistré.</p>
        ) : (
          <div className="space-y-2">
            {adjustments.slice(0, 15).map(a => {
              const delta = Number(a.adjusted_hours) - Number(a.normal_hours)
              const isExtra = delta > 0
              const statusColor = a.status === 'approved'   ? 'text-emerald-600 bg-emerald-50'
                : a.status === 'rejected'   ? 'text-red-500 bg-red-50'
                : a.status === 'questioned' ? 'text-indigo-600 bg-indigo-50'
                : 'text-amber-700 bg-amber-50'
              const statusLabel = a.status === 'approved'   ? 'Approuvé'
                : a.status === 'rejected'   ? 'Refusé'
                : a.status === 'questioned' ? 'Question'
                : 'En attente'

              const isQuestioning = questioningAdj === a.id
              const isReplying    = replyingAdj === a.id

              return (
                <div key={a.id} className="rounded-xl border border-[#f3f4f6] bg-gray-50 text-xs overflow-hidden">
                  {/* Ligne principale */}
                  <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1a1a1a] capitalize">{fmtDayDate(a.date)}</p>
                      <p className="text-[#9ca3af] mt-0.5">
                        {fmtH(a.normal_hours)} prévu → {fmtH(a.adjusted_hours)} travaillé
                        {Number(a.bank_hours_applied) > 0 && ` · ${fmtH(a.bank_hours_applied)} banque appliquée`}
                        {a.start_time && a.end_time && ` · ${a.start_time} → ${a.end_time}`}
                        {a.notes && ` · ${a.notes}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-bold ${isExtra ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {delta > 0 ? '+' : ''}{fmtH(delta)}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
                        {statusLabel}
                      </span>

                      {/* Admin : approuver / questions / refuser */}
                      {isAdmin && a.status === 'pending' && !isQuestioning && (
                        <div className="flex gap-1">
                          <button onClick={() => handleApproveAdj(a.id)} disabled={approvingAdj === a.id}
                            className="text-[10px] font-bold text-white bg-[#00bbb1] hover:bg-[#009e95] px-2 py-0.5 rounded-full disabled:opacity-50 transition-colors">
                            {approvingAdj === a.id ? '...' : 'Approuver'}
                          </button>
                          <button onClick={() => { setQuestioningAdj(a.id); setQuestionText('') }}
                            className="text-[10px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-2 py-0.5 rounded-full transition-colors">
                            Questions
                          </button>
                          <button onClick={() => handleRejectAdj(a.id)} disabled={rejectingAdj === a.id}
                            className="text-[10px] font-bold text-white bg-red-400 hover:bg-red-500 px-2 py-0.5 rounded-full disabled:opacity-50 transition-colors">
                            {rejectingAdj === a.id ? '...' : 'Refuser'}
                          </button>
                        </div>
                      )}

                      {/* Admin : réponse du membre reçue */}
                      {isAdmin && a.status === 'pending' && a.member_reply && !isQuestioning && (
                        <span className="text-[10px] text-indigo-500 font-semibold">↩ Réponse reçue</span>
                      )}

                      {/* Membre : supprimer pending/rejected */}
                      {!isAdmin && (a.status === 'pending' || a.status === 'rejected') && (
                        confirmDelAdj === a.id ? (
                          <DeleteConfirm id={a.id} confirmId={confirmDelAdj}
                            onConfirm={handleDeleteAdj}
                            onCancel={() => setConfirmDelAdj(null)} />
                        ) : (
                          <button onClick={() => setConfirmDelAdj(a.id)}
                            className="text-[#9ca3af] hover:text-red-500 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Admin : saisir une question */}
                  {isAdmin && isQuestioning && (
                    <div className="px-3 pb-3 pt-1 border-t border-[#e5e7eb] bg-indigo-50">
                      <p className="text-[10px] font-bold text-indigo-600 mb-1.5">Écrire une question au membre :</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={questionText}
                          onChange={e => setQuestionText(e.target.value)}
                          placeholder="Ex: Pourquoi ce départ anticipé ?"
                          className="flex-1 px-2.5 py-1.5 text-xs border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                          onKeyDown={e => e.key === 'Enter' && handleQuestionAdj(a.id)}
                          autoFocus
                        />
                        <button onClick={() => handleQuestionAdj(a.id)}
                          disabled={questionSaving || !questionText.trim()}
                          className="text-[10px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                          {questionSaving ? '...' : 'Envoyer'}
                        </button>
                        <button onClick={() => setQuestioningAdj(null)}
                          className="text-[10px] text-[#9ca3af] hover:text-[#6b7280] px-2">
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Admin : voir la réponse du membre */}
                  {isAdmin && a.member_reply && (
                    <div className="px-3 pb-2.5 pt-2 border-t border-[#e5e7eb] space-y-1">
                      {a.admin_question && (
                        <p className="text-[10px] text-indigo-600 font-semibold">Q : {a.admin_question}</p>
                      )}
                      <p className="text-[10px] text-emerald-700 font-semibold">R : {a.member_reply}</p>
                    </div>
                  )}

                  {/* Membre : voir la question et répondre */}
                  {!isAdmin && a.status === 'questioned' && a.admin_question && (
                    <div className="px-3 pb-3 pt-2 border-t border-indigo-100 bg-indigo-50">
                      <p className="text-[10px] font-bold text-indigo-700 mb-1">Question de l'admin :</p>
                      <p className="text-xs text-indigo-800 mb-2 italic">« {a.admin_question} »</p>
                      {a.member_reply ? (
                        <p className="text-[10px] text-emerald-700 font-semibold">Votre réponse : {a.member_reply}</p>
                      ) : isReplying ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder="Votre réponse..."
                            className="flex-1 px-2.5 py-1.5 text-xs border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                            onKeyDown={e => e.key === 'Enter' && handleReplyAdj(a.id)}
                            autoFocus
                          />
                          <button onClick={() => handleReplyAdj(a.id)}
                            disabled={replySaving || !replyText.trim()}
                            className="text-[10px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                            {replySaving ? '...' : 'Répondre'}
                          </button>
                          <button onClick={() => setReplyingAdj(null)}
                            className="text-[10px] text-[#9ca3af] px-2">Annuler</button>
                        </div>
                      ) : (
                        <button onClick={() => { setReplyingAdj(a.id); setReplyText('') }}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline">
                          Répondre →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Horaires ajustés (hors punch) ── */}
      {!punchMode && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-[#1a1a1a]">Horaires ajustés</h3>
              <p className="text-xs text-[#6b7280]">Ajustements sur une plage de dates — envoyés pour approbation</p>
            </div>
          </div>

          {overrides.length === 0 ? (
            <p className="text-sm text-[#6b7280] py-2">Aucune demande d'ajustement d'horaire.</p>
          ) : (
            <div className="space-y-3">
              {overrides.map(ov => {
                const todayStr = new Date().toISOString().split('T')[0]
                const isActive = ov.status === 'approved' && ov.start_date <= todayStr && ov.end_date >= todayStr
                const isPast   = ov.status === 'approved' && ov.end_date < todayStr
                const statusColor = ov.status === 'approved' ? 'text-emerald-600 bg-emerald-50'
                  : ov.status === 'rejected' ? 'text-red-500 bg-red-50'
                  : 'text-amber-700 bg-amber-50'
                const statusLabel = ov.status === 'approved' ? 'Approuvé'
                  : ov.status === 'rejected' ? 'Refusé'
                  : 'En attente'

                return (
                  <div key={ov.id} className={`rounded-xl border overflow-hidden ${
                    isActive ? 'border-[#00bbb1]/30' : 'border-[#f3f4f6]'
                  }`}>
                    {/* Header row */}
                    <div className={`flex items-center justify-between px-3 py-2.5 gap-2 ${
                      isActive ? 'bg-[#00bbb1]/5' : 'bg-gray-50'
                    }`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isActive && <span className="text-[10px] font-bold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">Actif</span>}
                          {isPast   && <span className="text-[10px] font-bold text-[#9ca3af] bg-gray-100 px-2 py-0.5 rounded-full">Expiré</span>}
                          <p className="text-xs font-semibold text-[#1a1a1a]">
                            {fmtDate(ov.start_date)} → {fmtDate(ov.end_date)}
                          </p>
                        </div>
                        {ov.notes && <p className="text-[11px] text-[#9ca3af] mt-0.5">{ov.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
                          {statusLabel}
                        </span>

                        {/* Admin : approuver / refuser les demandes en attente */}
                        {isAdmin && ov.status === 'pending' && (
                          <div className="flex gap-1">
                            <button onClick={() => handleApproveOverride(ov.id)} disabled={approvingOv === ov.id}
                              className="text-[10px] font-bold text-white bg-[#00bbb1] hover:bg-[#009e95] px-2 py-0.5 rounded-full disabled:opacity-50 transition-colors">
                              {approvingOv === ov.id ? '...' : 'Approuver'}
                            </button>
                            <button onClick={() => handleRejectOverride(ov.id)} disabled={rejectingOv === ov.id}
                              className="text-[10px] font-bold text-white bg-red-400 hover:bg-red-500 px-2 py-0.5 rounded-full disabled:opacity-50 transition-colors">
                              {rejectingOv === ov.id ? '...' : 'Refuser'}
                            </button>
                          </div>
                        )}

                        {/* Supprimer (membre: pending/rejected · admin: tous) */}
                        {(isAdmin ? true : ov.status !== 'approved') && (
                          confirmDelOv === ov.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDeleteOverride(ov.id)}
                                className="text-xs font-bold text-red-500 px-2 py-0.5 bg-red-50 rounded-lg">Oui</button>
                              <button onClick={() => setConfirmDelOv(null)}
                                className="text-xs text-[#6b7280] px-2 py-0.5 bg-gray-100 rounded-lg">Non</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelOv(ov.id)}
                              className="text-[#9ca3af] hover:text-red-500 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Détail des journées */}
                    {ov.days?.length > 0 && (
                      <div className="px-3 py-2 border-t border-[#f3f4f6] space-y-1">
                        {ov.days.map(day => (
                          <div key={day.date} className="flex items-center justify-between text-xs">
                            <span className="text-[#6b7280] capitalize">{fmtDayDate(day.date)}</span>
                            <span className="font-semibold text-[#1a1a1a]">
                              {day.start_time} → {day.end_time}
                              <span className="text-[#9ca3af] font-normal ml-1">· {fmtH(day.hours)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Raison de refus */}
                    {ov.status === 'rejected' && ov.rejection_reason && (
                      <div className="px-3 py-2 border-t border-red-100 bg-red-50/50">
                        <p className="text-xs text-red-600">Raison : {ov.rejection_reason}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Override modal */}
      {showOverrideModal && (
        <ScheduleOverrideModal
          schedules={schedules}
          userId={userId}
          onClose={() => setShowOverrideModal(false)}
          onSaved={() => { setShowOverrideModal(false); refetchOverrides() }}
        />
      )}
    </div>
  )
}
