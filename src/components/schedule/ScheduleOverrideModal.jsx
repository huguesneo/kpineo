import { useState, useMemo } from 'react'
import { format, parseISO, eachDayOfInterval } from 'date-fns'
import { fr } from 'date-fns/locale'
import Button from '../shared/Button'
import { createScheduleOverride } from '../../hooks/useScheduleOverrides'

const JS_DAY_TO_KEY = ['sunday_hours','monday_hours','tuesday_hours','wednesday_hours','thursday_hours','friday_hours','saturday_hours']

function getActiveSchedule(schedules, dateStr) {
  return schedules.find(s =>
    s.effective_from <= dateStr && (s.effective_to == null || s.effective_to >= dateStr)
  ) ?? null
}

function getScheduledHours(schedules, dateStr) {
  const s = getActiveSchedule(schedules, dateStr)
  if (!s) return 0
  const d = parseISO(dateStr)
  return Number(s[JS_DAY_TO_KEY[d.getDay()]] ?? 0)
}

function timeToHours(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return Math.max(0, diff / 60)
}

function fmtH(h) {
  const n = Number(h)
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`
}

export default function ScheduleOverrideModal({ schedules, userId, onClose, onSaved }) {
  const today = new Date().toISOString().split('T')[0]
  const [step, setStep] = useState(1)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [dayInputs, setDayInputs] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const daysInRange = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return []
    try {
      return eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
        .map(d => d.toISOString().split('T')[0])
    } catch { return [] }
  }, [startDate, endDate])

  const workingDays = useMemo(() =>
    daysInRange.filter(d => getScheduledHours(schedules, d) > 0),
    [daysInRange, schedules]
  )

  const expectedTotal = useMemo(() =>
    workingDays.reduce((sum, d) => sum + getScheduledHours(schedules, d), 0),
    [workingDays, schedules]
  )

  const actualTotal = useMemo(() =>
    workingDays.reduce((sum, d) => {
      const inp = dayInputs[d] ?? {}
      return sum + timeToHours(inp.start_time, inp.end_time)
    }, 0),
    [workingDays, dayInputs]
  )

  const allDaysFilled = workingDays.length > 0 && workingDays.every(d => {
    const inp = dayInputs[d] ?? {}
    return inp.start_time && inp.end_time && timeToHours(inp.start_time, inp.end_time) > 0
  })

  const totalMatch = Math.abs(actualTotal - expectedTotal) < 0.01

  function handleDayInput(date, field, value) {
    setDayInputs(prev => ({ ...prev, [date]: { ...(prev[date] ?? {}), [field]: value } }))
  }

  async function handleSubmit() {
    if (!allDaysFilled || !totalMatch) return
    setSaving(true)
    setError('')

    const days = workingDays.map(d => {
      const inp = dayInputs[d]
      return {
        date: d,
        start_time: inp.start_time,
        end_time: inp.end_time,
        hours: parseFloat(timeToHours(inp.start_time, inp.end_time).toFixed(2)),
      }
    })

    const { error: err } = await createScheduleOverride({
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
      days,
      notes,
    })

    setSaving(false)
    if (err) { setError('Erreur lors de la soumission. Veuillez réessayer.'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-[#1a1a1a]">Ajuster mon horaire</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">
              {step === 1 ? 'Étape 1 sur 2 — Plage de dates' : 'Étape 2 sur 2 — Horaires par journée'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicators */}
        <div className="px-6 pt-4 flex items-center gap-2 flex-shrink-0">
          <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 1 ? 'bg-[#00bbb1]' : 'bg-[#f3f4f6]'}`} />
          <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 2 ? 'bg-[#00bbb1]' : 'bg-[#f3f4f6]'}`} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── Step 1 ── */}
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Date de début *</label>
                  <input type="date" value={startDate}
                    onChange={e => {
                      setStartDate(e.target.value)
                      if (e.target.value > endDate) setEndDate(e.target.value)
                    }}
                    className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Date de fin *</label>
                  <input type="date" value={endDate} min={startDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                </div>
              </div>

              {workingDays.length > 0 ? (
                <div className="p-3 bg-[#00bbb1]/5 border border-[#00bbb1]/20 rounded-xl">
                  <p className="text-xs font-semibold text-[#00bbb1]">
                    {workingDays.length} jour{workingDays.length > 1 ? 's' : ''} de travail · {fmtH(expectedTotal)} à atteindre
                  </p>
                  <p className="text-xs text-[#6b7280] mt-0.5">
                    L'horaire ajusté devra totaliser exactement {fmtH(expectedTotal)}.
                  </p>
                </div>
              ) : daysInRange.length > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-700">Aucun jour travaillé dans cette plage selon votre horaire.</p>
                </div>
              ) : null}

              <div>
                <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Note (optionnel)</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Semaine de télétravail, horaires décalés…"
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
              </div>
            </>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <>
              {/* Total progress bar */}
              <div className={`p-3 rounded-xl border ${
                totalMatch ? 'bg-emerald-50 border-emerald-200' :
                actualTotal > expectedTotal ? 'bg-red-50 border-red-200' :
                'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-[#6b7280]">Total saisi</span>
                  <span className="text-xs font-semibold text-[#6b7280]">Cible : <span className="font-bold text-[#1a1a1a]">{fmtH(expectedTotal)}</span></span>
                </div>
                <div className="w-full bg-white/60 rounded-full h-2 mb-1.5">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      totalMatch ? 'bg-emerald-500' : actualTotal > expectedTotal ? 'bg-red-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.min(100, expectedTotal > 0 ? (actualTotal / expectedTotal) * 100 : 0)}%` }}
                  />
                </div>
                <p className={`text-xs font-bold ${
                  totalMatch ? 'text-emerald-700' : actualTotal > expectedTotal ? 'text-red-600' : 'text-amber-700'
                }`}>
                  {totalMatch
                    ? `${fmtH(actualTotal)} ✓ Prêt à soumettre`
                    : actualTotal > expectedTotal
                      ? `${fmtH(actualTotal)} — dépassement de ${fmtH(actualTotal - expectedTotal)}`
                      : `${fmtH(actualTotal)} — il manque ${fmtH(expectedTotal - actualTotal)}`}
                </p>
              </div>

              {/* Day rows */}
              {workingDays.map(dateStr => {
                const inp = dayInputs[dateStr] ?? {}
                const hours = timeToHours(inp.start_time, inp.end_time)
                const scheduled = getScheduledHours(schedules, dateStr)
                const d = parseISO(dateStr)
                const filled = inp.start_time && inp.end_time && hours > 0

                return (
                  <div key={dateStr} className={`p-4 rounded-xl border transition-colors ${
                    filled ? 'border-[#00bbb1]/30 bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a1a] capitalize">
                          {format(d, 'EEEE d MMMM', { locale: fr })}
                        </p>
                        <p className="text-xs text-[#9ca3af]">Prévu : {fmtH(scheduled)}</p>
                      </div>
                      {filled && (
                        <span className="text-sm font-bold text-[#00bbb1]">{fmtH(hours)}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Heure d'arrivée *</label>
                        <input type="time" value={inp.start_time ?? ''}
                          onChange={e => handleDayInput(dateStr, 'start_time', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Heure de départ *</label>
                        <input type="time" value={inp.end_time ?? ''}
                          onChange={e => handleDayInput(dateStr, 'end_time', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                      </div>
                    </div>
                    {inp.start_time && inp.end_time && hours === 0 && (
                      <p className="text-xs text-red-500 mt-1.5">L'heure de départ doit être après l'heure d'arrivée.</p>
                    )}
                  </div>
                )
              })}

              {error && (
                <p className="text-xs text-red-600 font-semibold">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e5e7eb] flex items-center justify-between flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? 'Annuler' : '← Retour'}
          </Button>
          {step === 1 ? (
            <Button size="sm" disabled={workingDays.length === 0} onClick={() => setStep(2)}>
              Continuer →
            </Button>
          ) : (
            <Button size="sm" loading={saving} disabled={!allDaysFilled || !totalMatch} onClick={handleSubmit}>
              Envoyer pour approbation
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
