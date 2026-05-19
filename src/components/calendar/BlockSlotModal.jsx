import { useState, useEffect } from 'react'
import { format, addDays } from 'date-fns'

const RECURRENCE_OPTS = [
  { value: 'none',   label: 'Aucune' },
  { value: 'daily',  label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdomadaire' },
]

// Generate all occurrences for a recurring block
export function generateOccurrences(startIso, endIso, type, until) {
  if (type === 'none' || !type) return [{ start_time: startIso, end_time: endIso }]

  const occurrences = []
  const start     = new Date(startIso)
  const end       = new Date(endIso)
  const duration  = end - start
  const limitDate = until ? new Date(until + 'T23:59:59') : null
  let current     = new Date(start)
  let safety      = 0

  while (safety++ < 366) {
    if (limitDate && current > limitDate) break
    const slotEnd = new Date(current.getTime() + duration)
    occurrences.push({
      start_time: current.toISOString(),
      end_time:   slotEnd.toISOString(),
    })
    current = addDays(current, type === 'daily' ? 1 : 7)
  }

  return occurrences
}

export default function BlockSlotModal({ initialSlot = null, onSave, onClose }) {
  const isEdit = Boolean(initialSlot)

  // Default date = today, default times 09:00 – 10:00
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const [title,     setTitle]     = useState(initialSlot?.title ?? 'Bloqué')
  const [date,      setDate]      = useState(
    initialSlot ? format(new Date(initialSlot.start_time), 'yyyy-MM-dd') : todayStr
  )
  const [startTime, setStartTime] = useState(
    initialSlot ? format(new Date(initialSlot.start_time), 'HH:mm') : '09:00'
  )
  const [endTime,   setEndTime]   = useState(
    initialSlot ? format(new Date(initialSlot.end_time), 'HH:mm') : '10:00'
  )
  const [recType,   setRecType]   = useState(initialSlot?.recurrence_type ?? 'none')
  const [until,     setUntil]     = useState(
    initialSlot?.recurrence_until ?? format(addDays(new Date(), 28), 'yyyy-MM-dd')
  )
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)

  // When recurrence selected, make sure until > date
  useEffect(() => {
    if (recType !== 'none' && until <= date) {
      setUntil(format(addDays(new Date(date), 28), 'yyyy-MM-dd'))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recType])

  function buildOccurrences() {
    const startIso = new Date(`${date}T${startTime}`).toISOString()
    const endIso   = new Date(`${date}T${endTime}`).toISOString()
    if (new Date(endIso) <= new Date(startIso)) {
      setError('L\'heure de fin doit être après l\'heure de début')
      return null
    }
    return generateOccurrences(startIso, endIso, recType, recType !== 'none' ? until : null)
  }

  async function handleSave() {
    setError(null)
    const occurrences = buildOccurrences()
    if (!occurrences) return
    setSaving(true)
    await onSave({ title, recType, until: recType !== 'none' ? until : null, occurrences, originalSlot: initialSlot })
    setSaving(false)
  }

  const occurrenceCount = (() => {
    if (recType === 'none') return null
    try {
      const startIso = new Date(`${date}T${startTime}`).toISOString()
      const endIso   = new Date(`${date}T${endTime}`).toISOString()
      if (new Date(endIso) <= new Date(startIso)) return null
      return generateOccurrences(startIso, endIso, recType, until).length
    } catch { return null }
  })()

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
            <h2 className="font-bold text-[#1a1a1a] text-sm">
              {isEdit ? 'Modifier le créneau bloqué' : 'Bloquer une plage horaire'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-[#9ca3af]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">Titre</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:border-[#00bbb1]"
                placeholder="ex: Pause déjeuner"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:border-[#00bbb1]"
              />
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">Début</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:border-[#00bbb1]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">Fin</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:border-[#00bbb1]"
                />
              </div>
            </div>

            {/* Recurrence */}
            <div>
              <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">Récurrence</label>
              <div className="flex rounded-xl border border-[#e5e7eb] overflow-hidden">
                {RECURRENCE_OPTS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setRecType(o.value)}
                    className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                      recType === o.value
                        ? 'bg-[#00bbb1] text-white'
                        : 'bg-white text-[#6b7280] hover:bg-gray-50'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Until date (only for recurring) */}
            {recType !== 'none' && (
              <div>
                <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">Jusqu'au</label>
                <input
                  type="date"
                  value={until}
                  min={date}
                  onChange={e => setUntil(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:border-[#00bbb1]"
                />
                {occurrenceCount != null && (
                  <p className="text-[11px] text-[#9ca3af] mt-1.5">
                    {occurrenceCount} créneau{occurrenceCount > 1 ? 'x' : ''} seront bloqué{occurrenceCount > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-[#ef4444] font-semibold">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#e5e7eb] text-[#6b7280] hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-all"
              style={{ background: 'linear-gradient(135deg, #00bbb1 0%, #009e94 100%)' }}
            >
              {saving ? 'Enregistrement…' : isEdit ? 'Modifier' : 'Bloquer'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
