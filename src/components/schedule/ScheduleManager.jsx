import { useState } from 'react'
import Card from '../shared/Card'
import Button from '../shared/Button'
import {
  useSchedules, useAbsences, useAbsenceAllowance, useOvertimeRecords, usePendingChanges,
  upsertSchedule, deleteSchedule, createAbsence, deleteAbsence, updateAbsence,
  upsertAbsenceAllowance, upsertOvertimeRecord, deleteOvertimeRecord, approveOvertimeRecord,
  requestChange, cancelChangeRequest, approveChange, rejectChange,
} from '../../hooks/useSchedule'
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
function ScheduleForm({ initial, onSave, onCancel, saving }) {
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
          <span className={`text-sm font-bold ${total === 40 ? 'text-emerald-600' : total > 40 ? 'text-amber-600' : 'text-[#6b7280]'}`}>
            {total}h / 40h cible
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
export default function ScheduleManager({ userId, isAdmin }) {
  const year = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]

  const { schedules, loading: schedLoading, refetch: refetchSched } = useSchedules(userId)
  const { absences, loading: absLoading, refetch: refetchAbs }       = useAbsences(userId, year)
  const { allowance, refetch: refetchAllow }                          = useAbsenceAllowance(userId, year)
  const { records: overtimeRecs, refetch: refetchOT }                 = useOvertimeRecords(userId, year)
  const { changes: pendingChanges, refetch: refetchPending }          = usePendingChanges(userId)

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
  const [reviewingChange, setReviewingChange] = useState(null) // id en cours d'approbation/refus
  const [cancellingChange, setCancellingChange] = useState(null)

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

      {/* ── Alerte heures à rattraper ── */}
      {remainingMakeup > 0 && (
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

      {/* ── Horaire ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Horaire hebdomadaire</h3>
            <p className="text-xs text-[#6b7280]">Cible naturopathe : 40h / semaine</p>
          </div>
          <Button size="sm" onClick={() => { setAddingSched(true); setEditingSchedId(null) }}>+ Ajouter</Button>
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
                  <ScheduleForm key={s.id} initial={s} saving={schedSaving}
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
                      <span className={`text-sm font-bold ${total === 40 ? 'text-emerald-600' : total > 40 ? 'text-amber-600' : 'text-[#6b7280]'}`}>
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
            <ScheduleForm saving={schedSaving}
              onSave={form => handleSaveSched({ ...form, user_id: userId })}
              onCancel={() => setAddingSched(false)} />
          </div>
        )}
      </Card>

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
    </div>
  )
}
