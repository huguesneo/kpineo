import { useState, useRef } from 'react'
import Card from '../shared/Card'
import { useObjectives, setObjectiveForPeriod } from '../../hooks/useObjectives'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const SETTER_KPIS = [
  { type: 'setter_showup_target',    label: 'Show-ups',              unit: 'Nb', isCurrency: false, color: '#00bbb1' },
  { type: 'setter_confirm_target',   label: 'Confirmations auto',    unit: 'Nb', isCurrency: false, color: '#f59e0b' },
  { type: 'setter_rebook_target',    label: 'Rebookings',            unit: 'Nb', isCurrency: false, color: '#6366f1' },
  { type: 'setter_sales_target',     label: 'Ventes',                unit: 'Nb', isCurrency: false, color: '#6366f1' },
  { type: 'setter_commission_target',label: 'Commissions totales',   unit: '$',  isCurrency: true,  color: '#10b981' },
]

function fmtNum(n, isCurrency) {
  if (isCurrency) return Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
  return Number(n ?? 0).toLocaleString('fr-CA')
}

function InlineInput({ value, onSave, saving, isCurrency }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  function startEdit() {
    setDraft(value ? String(value) : '')
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 10)
  }

  function commit() {
    setEditing(false)
    onSave(draft)
  }

  function handleKey(e) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        {isCurrency && <span className="text-sm text-[#6b7280]">$</span>}
        <input
          ref={inputRef}
          type="number"
          min="0"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          className="w-32 px-2 py-1 text-base font-bold text-[#1a1a1a] border border-[#00bbb1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30"
          placeholder="0"
        />
      </div>
    )
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-1.5 text-left"
      title="Cliquer pour modifier"
    >
      {saving ? (
        <span className="text-sm text-[#9ca3af]">Sauvegarde…</span>
      ) : value ? (
        <>
          <span className="text-2xl font-bold text-[#1a1a1a] group-hover:text-[#00bbb1] transition-colors">
            {fmtNum(value, isCurrency)}
          </span>
          <svg className="w-3.5 h-3.5 text-[#9ca3af] group-hover:text-[#00bbb1] opacity-0 group-hover:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </>
      ) : (
        <span className="text-sm font-semibold text-[#9ca3af] group-hover:text-[#00bbb1] border border-dashed border-[#d1d5db] group-hover:border-[#00bbb1] rounded-lg px-3 py-1.5 transition-all">
          + Définir
        </span>
      )}
    </button>
  )
}

export default function SetterObjectivesPanel({ userId, isAdmin = false }) {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [saving, setSaving] = useState(null)

  const { objectives, loading, refetch } = useObjectives(userId)

  function periodStart(m, y) {
    return `${y}-${String(m).padStart(2, '0')}-01`
  }

  function periodEnd(m, y) {
    const last = new Date(y, m, 0).getDate()
    return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  }

  function getObj(type) {
    return objectives.find(o =>
      o.type === type &&
      o.period_start === periodStart(selectedMonth, selectedYear) &&
      o.period_end === periodEnd(selectedMonth, selectedYear)
    ) ?? null
  }

  async function handleSave(type, rawValue) {
    setSaving(type)
    await setObjectiveForPeriod({
      user_id: userId,
      type,
      target_value: rawValue,
      period_start: periodStart(selectedMonth, selectedYear),
      period_end: periodEnd(selectedMonth, selectedYear),
    })
    await refetch()
    setSaving(null)
  }

  function prevMonth() {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1) }
    else setSelectedMonth(m => m - 1)
  }

  function nextMonth() {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1) }
    else setSelectedMonth(m => m + 1)
  }

  const monthLabel = format(new Date(selectedYear, selectedMonth - 1, 1), 'MMMM yyyy', { locale: fr })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[#1a1a1a]">Objectifs Setter</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-bold text-[#1a1a1a] min-w-[140px] text-center capitalize">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SETTER_KPIS.map(({ type, label, unit, isCurrency, color }) => {
          const obj = getObj(type)
          return (
            <Card key={type} className="p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${color}18`, color }}
                >
                  {unit}
                </span>
                <span className="text-sm font-semibold text-[#1a1a1a]">{label}</span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-1">Objectif</p>
                {loading ? (
                  <div className="h-8 bg-gray-100 rounded animate-pulse" />
                ) : isAdmin ? (
                  <InlineInput
                    value={obj?.target_value ?? ''}
                    saving={saving === type}
                    isCurrency={isCurrency}
                    onSave={v => handleSave(type, v)}
                  />
                ) : (
                  <p className="text-2xl font-bold text-[#1a1a1a]">
                    {obj?.target_value
                      ? fmtNum(obj.target_value, isCurrency)
                      : <span className="text-[#9ca3af] text-base font-semibold">—</span>
                    }
                  </p>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
