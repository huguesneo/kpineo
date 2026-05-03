import { useState, useRef } from 'react'
import Card from '../shared/Card'
import { useObjectives, setObjectiveForPeriod } from '../../hooks/useObjectives'
import { useQuarterlyBonusRecords, upsertQuarterlyBonusRecord } from '../../hooks/useCareerPlan'
import { useQBMemberRevenueForQuarter } from '../../hooks/useQuickBooks'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const QUARTERS = [
  { q: 1, label: 'Q1', months: 'Jan → Mars', monthNums: [1, 2, 3],   start: y => `${y}-01-01`, end: y => `${y}-03-31` },
  { q: 2, label: 'Q2', months: 'Avr → Juin', monthNums: [4, 5, 6],   start: y => `${y}-04-01`, end: y => `${y}-06-30` },
  { q: 3, label: 'Q3', months: 'Juil → Sep', monthNums: [7, 8, 9],   start: y => `${y}-07-01`, end: y => `${y}-09-30` },
  { q: 4, label: 'Q4', months: 'Oct → Déc',  monthNums: [10, 11, 12], start: y => `${y}-10-01`, end: y => `${y}-12-31` },
]

const LEVELS = [
  { min: 0,   max: 49,       emoji: '🌱', label: 'Démarrage',        color: '#9ca3af' },
  { min: 50,  max: 79,       emoji: '📈', label: 'En progression',    color: '#f59e0b' },
  { min: 80,  max: 99,       emoji: '🔥', label: 'En feu !',          color: '#f97316' },
  { min: 100, max: 109,      emoji: '🏆', label: 'Objectif atteint',  color: '#10b981' },
  { min: 110, max: Infinity, emoji: '🎉', label: 'WINNER WINNER !',   color: '#00bbb1' },
]

function getLevel(pct) {
  return LEVELS.find(l => pct >= l.min && pct <= l.max) || LEVELS[0]
}

function fmtCAD(n) {
  return Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
}

// ─── Inline target input ──────────────────────────────────────

function TargetInput({ value, onSave, saving }) {
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
        <span className="text-sm text-[#6b7280]">$</span>
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
          <span className="text-xl font-bold text-[#1a1a1a] group-hover:text-[#00bbb1] transition-colors">
            {fmtCAD(value)}
          </span>
          <svg className="w-3.5 h-3.5 text-[#9ca3af] group-hover:text-[#00bbb1] opacity-0 group-hover:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </>
      ) : (
        <span className="text-sm font-semibold text-[#9ca3af] group-hover:text-[#00bbb1] border border-dashed border-[#d1d5db] group-hover:border-[#00bbb1] rounded-lg px-3 py-1.5 transition-all">
          + Définir l'objectif
        </span>
      )}
    </button>
  )
}

// ─── Bonus edit form ──────────────────────────────────────────

function BonusEditForm({ q, year, quarterLabel, form, onChange, onSave, onCancel, saving }) {
  const MONTHS_FR = ['', 'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
  const qInfo = QUARTERS[q - 1]

  return (
    <div className="border border-[#00bbb1]/30 bg-[#00bbb1]/5 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm text-[#1a1a1a]">
          Enregistrer le boni — {quarterLabel} {year}
        </h4>
        <button onClick={onCancel} className="text-[#9ca3af] hover:text-[#6b7280] transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[#6b7280]">Atteint (%)</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="200"
              value={form.achievement}
              onChange={e => onChange({ ...form, achievement: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
              placeholder="Ex: 87"
            />
            <span className="text-sm text-[#6b7280]">%</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[#6b7280]">Boni payé ($)</label>
          <input
            type="number"
            min="0"
            value={form.bonus_paid}
            onChange={e => onChange({ ...form, bonus_paid: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            placeholder="Ex: 1500"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-[#6b7280]">Notes (optionnel)</label>
        <input
          type="text"
          value={form.notes}
          onChange={e => onChange({ ...form, notes: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
          placeholder="Ex: Bonus versé avec la paie de janvier"
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => onChange({ ...form, is_paid: !form.is_paid })}
            className={`w-10 h-5 rounded-full transition-colors relative ${form.is_paid ? 'bg-[#00bbb1]' : 'bg-gray-200'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_paid ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm font-semibold text-[#1a1a1a]">Marquer comme payé</span>
        </label>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm font-semibold text-[#6b7280] bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-semibold text-white bg-[#00bbb1] hover:bg-[#009e95] disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Past quarter card — fetches 3 months from QB ─────────────

function PastQuarterCard({ q, year, label, months, monthNums, obj, rec, isAdmin, quarterlyBase, role, firstName, onEditBonus, savingQ, onTargetSave }) {
  const roleField = { naturopathe: 'naturopathe', closer: 'closer', setter: 'setter' }[role]

  // Single QB call returns the full quarter sum atomically — no cross-call inconsistency
  const { data: qData, loading: qbLoading } = useQBMemberRevenueForQuarter(firstName, q, year)

  const qbTotal = !qbLoading && qData
    ? (roleField ? (qData[roleField]?.monthly ?? 0) : 0)
    : null

  // achievement: saved record > QB computed > null
  const achievedPct = rec?.achievement_pct != null
    ? rec.achievement_pct
    : (qbTotal !== null && obj?.target_value && obj.target_value > 0)
      ? Math.round((qbTotal / obj.target_value) * 1000) / 10
      : null

  const level = achievedPct !== null ? getLevel(achievedPct) : null
  const hasRecord = !!rec
  const isPaid = rec?.is_paid

  // bonus calc: use rounded % so displayed % and bonus are consistent
  const pctRounded = achievedPct !== null ? Math.round(achievedPct) : null
  const bonusCalc = !hasRecord && quarterlyBase && pctRounded !== null && pctRounded >= 80
    ? Math.round(quarterlyBase * (pctRounded / 100))
    : null

  return (
    <Card
      className={`p-5 flex flex-col gap-3 ${
        isPaid ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white'
        : hasRecord ? 'border-gray-200 bg-gray-50/40'
        : 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-100 text-[#6b7280]">{label}</span>
          <span className="text-sm font-semibold text-[#6b7280]">{months}</span>
        </div>
        {isPaid
          ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Payé</span>
          : hasRecord
            ? <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Non payé</span>
            : null
        }
      </div>

      {/* Achievement — prominent */}
      {qbLoading ? (
        <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      ) : achievedPct !== null ? (
        <div className="flex items-center gap-3">
          <span className="text-4xl">{level?.emoji}</span>
          <div>
            <p className="text-3xl font-bold leading-none" style={{ color: level?.color }}>
              {Math.round(achievedPct)}%
            </p>
            <p className="text-xs font-semibold mt-0.5" style={{ color: level?.color }}>{level?.label}</p>
          </div>
          <div className="flex-1 ml-2">
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, achievedPct)}%`, backgroundColor: level?.color }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              {obj?.target_value && (
                <p className="text-[10px] text-[#9ca3af]">Objectif : {fmtCAD(obj.target_value)}</p>
              )}
              {qbTotal !== null && !hasRecord && (
                <p className="text-[10px] text-[#9ca3af] ml-auto">QB : {fmtCAD(qbTotal)}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <p className="text-sm text-[#9ca3af]">
              {obj?.target_value ? `Objectif : ${fmtCAD(obj.target_value)} · aucun revenu QB trouvé` : 'Aucun objectif défini'}
            </p>
          ) : (
            <p className="text-xs font-semibold text-[#9ca3af] italic">Résultats en attente…</p>
          )}
        </div>
      )}

      {/* Bonus */}
      {(quarterlyBase || rec?.bonus_paid != null || bonusCalc !== null) && (
        <div className={`rounded-xl px-4 py-3 ${isPaid ? 'bg-emerald-100/70' : hasRecord ? 'bg-gray-100' : bonusCalc ? 'bg-emerald-50/60' : achievedPct !== null && achievedPct < 80 ? 'bg-red-50' : 'bg-gray-50'}`}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5 text-[#9ca3af]">
            {isPaid ? 'Boni versé' : hasRecord ? 'Boni enregistré' : achievedPct !== null ? 'Boni calculé' : 'Boni cible (100%)'}
          </p>
          {rec?.bonus_paid != null ? (
            <p className={`text-2xl font-bold ${isPaid ? 'text-emerald-600' : 'text-[#6b7280]'}`}>{fmtCAD(rec.bonus_paid)}</p>
          ) : bonusCalc !== null ? (
            <p className="text-xl font-bold text-emerald-600">{fmtCAD(bonusCalc)}</p>
          ) : achievedPct !== null && achievedPct < 80 ? (
            <p className="text-sm font-bold text-red-500">0$ · seuil 80% non atteint</p>
          ) : quarterlyBase ? (
            <p className="text-base font-bold text-[#9ca3af]">{fmtCAD(quarterlyBase)}</p>
          ) : null}
          {rec?.notes && <p className="text-xs text-[#6b7280] mt-1">{rec.notes}</p>}
        </div>
      )}

      {/* Admin: target + edit */}
      {isAdmin && (
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <div>
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-0.5">Objectif</p>
            <TargetInput value={obj?.target_value ?? ''} saving={savingQ === q} onSave={v => onTargetSave(q, v)} />
          </div>
          <button
            onClick={() => onEditBonus(q)}
            className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors"
          >
            {rec ? '✏️ Modifier' : '+ Enregistrer le boni'}
          </button>
        </div>
      )}
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────

export default function QuarterlyPanel({ userId, annualBonus, role, qbRevenue, isAdmin = false, firstName = '' }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentQ = Math.floor(now.getMonth() / 3) + 1

  const [year, setYear] = useState(currentYear)
  const [savingQ, setSavingQ] = useState(null)
  const [editingBonus, setEditingBonus] = useState(null)
  const [savingBonus, setSavingBonus] = useState(false)

  const { objectives, loading: objLoading, refetch: refetchObj } = useObjectives(userId)
  const { records, loading: recLoading, refetch: refetchRec } = useQuarterlyBonusRecords(userId)

  const quarterlyBase = annualBonus ? Number(annualBonus) / 4 : null
  const roleField = { naturopathe: 'naturopathe', closer: 'closer', setter: 'setter' }[role]
  const roleData = qbRevenue && roleField ? qbRevenue[roleField] : null

  function getObjForQ(q) {
    const { start, end } = QUARTERS[q - 1]
    return objectives.find(o =>
      o.type === 'quarterly_revenue' &&
      o.period_start === start(year) &&
      o.period_end === end(year)
    ) ?? null
  }

  function getRecForQ(q) {
    return records.find(r => r.year === year && r.quarter === q) ?? null
  }

  function getLiveAch(q) {
    if (q !== currentQ || year !== currentYear) return null
    const quarterly = roleData?.quarterly
    if (!quarterly) return null
    const obj = getObjForQ(q)
    if (!obj?.target_value) return null
    return Math.round((quarterly / obj.target_value) * 1000) / 10
  }

  async function handleTargetSave(q, rawValue) {
    setSavingQ(q)
    const { start, end } = QUARTERS[q - 1]
    await setObjectiveForPeriod({
      user_id: userId,
      type: 'quarterly_revenue',
      target_value: rawValue,
      period_start: start(year),
      period_end: end(year),
    })
    await refetchObj()
    setSavingQ(null)
  }

  function openBonusEdit(q) {
    const rec = getRecForQ(q)
    const liveAch = getLiveAch(q)
    const ach = rec?.achievement_pct ?? liveAch ?? ''
    const autoBonus = quarterlyBase && Number(ach) >= 80
      ? Math.round(quarterlyBase * (Number(ach) / 100))
      : ''
    setEditingBonus({
      q,
      form: {
        achievement: ach,
        bonus_paid: rec?.bonus_paid ?? autoBonus,
        is_paid: rec?.is_paid ?? false,
        notes: rec?.notes ?? '',
      },
    })
  }

  async function handleBonusSave() {
    if (!editingBonus) return
    setSavingBonus(true)
    await upsertQuarterlyBonusRecord({
      user_id: userId,
      year,
      quarter: editingBonus.q,
      achievement_pct: editingBonus.form.achievement !== '' ? Number(editingBonus.form.achievement) : null,
      bonus_paid: editingBonus.form.bonus_paid !== '' ? Number(editingBonus.form.bonus_paid) : null,
      is_paid: editingBonus.form.is_paid,
      notes: editingBonus.form.notes || null,
    })
    await refetchRec()
    setSavingBonus(false)
    setEditingBonus(null)
  }

  const paidRecords = records.filter(r => r.is_paid).sort((a, b) => a.year !== b.year ? b.year - a.year : a.quarter - b.quarter)

  return (
    <div className="space-y-5">
      {/* Header + year nav */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[#1a1a1a]">Objectifs trimestriels</h3>
          {annualBonus && (
            <p className="text-xs text-[#6b7280] mt-0.5">
              Boni annuel : {fmtCAD(annualBonus)} · Cible par trimestre : {fmtCAD(quarterlyBase)} (à 100%)
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setYear(y => y - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-bold text-[#1a1a1a] min-w-[50px] text-center">{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          {year !== currentYear && (
            <button
              onClick={() => setYear(currentYear)}
              className="ml-1 text-[10px] font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors"
            >
              Aujourd'hui
            </button>
          )}
        </div>
      </div>

      {/* Q1–Q4 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {QUARTERS.map(({ q, label, months, monthNums, start, end }) => {
          const obj = getObjForQ(q)
          const rec = getRecForQ(q)
          const isCurrentQ = q === currentQ && year === currentYear
          const isPast = year < currentYear || (year === currentYear && q < currentQ)
          const liveAch = getLiveAch(q)
          const achievedPct = liveAch ?? rec?.achievement_pct ?? null
          const level = achievedPct !== null ? getLevel(achievedPct) : null
          const achRounded = achievedPct !== null ? Math.round(achievedPct) : null
          const bonusCalc = quarterlyBase && achRounded !== null && achRounded >= 80
            ? Math.round(quarterlyBase * (achRounded / 100))
            : null

          // ── Past quarters — delegate to PastQuarterCard (fetches QB) ──
          if (isPast) {
            return (
              <PastQuarterCard
                key={q}
                q={q}
                year={year}
                label={label}
                months={months}
                monthNums={monthNums}
                obj={obj}
                rec={rec}
                isAdmin={isAdmin}
                quarterlyBase={quarterlyBase}
                role={role}
                firstName={firstName}
                onEditBonus={openBonusEdit}
                savingQ={savingQ}
                onTargetSave={handleTargetSave}
              />
            )
          }

          // ── Future quarter ──
          if (!isCurrentQ) {
            return (
              <Card key={q} className="p-5 flex flex-col gap-3 border-gray-100 opacity-60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-400">{label}</span>
                  <span className="text-sm font-semibold text-[#9ca3af]">{months}</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-1">Objectif</p>
                  {isAdmin ? (
                    <TargetInput value={obj?.target_value ?? ''} saving={savingQ === q} onSave={v => handleTargetSave(q, v)} />
                  ) : (
                    <p className="text-xl font-bold text-[#9ca3af]">
                      {obj?.target_value ? fmtCAD(obj.target_value) : <span className="text-base font-semibold">—</span>}
                    </p>
                  )}
                </div>
                {quarterlyBase && (
                  <div className="rounded-xl px-3 py-2.5 bg-gray-50">
                    <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-0.5">Boni cible (100%)</p>
                    <p className="text-base font-bold text-[#9ca3af]">{fmtCAD(quarterlyBase)}</p>
                  </div>
                )}
              </Card>
            )
          }

          // ── Current quarter ──
          return (
            <Card
              key={q}
              className="p-5 flex flex-col gap-3.5 border-[#00bbb1]/40 shadow-sm"
            >
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#00bbb1]/10 text-[#00bbb1]">{label}</span>
                  <span className="text-sm font-semibold text-[#1a1a1a]">{months}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">En cours</span>
                  {rec?.is_paid && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Payé</span>
                  )}
                </div>
              </div>

              {/* Target */}
              <div>
                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-1">Objectif</p>
                {isAdmin ? (
                  <TargetInput value={obj?.target_value ?? ''} saving={savingQ === q} onSave={v => handleTargetSave(q, v)} />
                ) : (
                  <p className="text-xl font-bold text-[#1a1a1a]">
                    {obj?.target_value ? fmtCAD(obj.target_value) : <span className="text-[#9ca3af] text-base font-semibold">—</span>}
                  </p>
                )}
              </div>

              {/* Achievement bar */}
              {achievedPct !== null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">
                      {liveAch !== null ? 'QB live' : 'Finalisé'}
                    </span>
                    <span className="text-sm font-bold" style={{ color: level?.color }}>
                      {level?.emoji} {Math.round(achievedPct)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, achievedPct)}%`, backgroundColor: level?.color }}
                    />
                  </div>
                </div>
              )}

              {/* Bonus display */}
              {(quarterlyBase || rec?.bonus_paid != null) && (
                <div className={`rounded-xl px-3 py-2.5 ${
                  rec?.bonus_paid != null ? 'bg-emerald-50'
                  : bonusCalc ? 'bg-emerald-50/60'
                  : achievedPct !== null && achievedPct < 80 ? 'bg-red-50'
                  : 'bg-gray-50'
                }`}>
                  <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-0.5">
                    {rec?.bonus_paid != null ? 'Boni payé' : achievedPct !== null ? 'Boni projeté' : 'Boni cible (100%)'}
                  </p>
                  {rec?.bonus_paid != null ? (
                    <p className="text-base font-bold text-emerald-600">{fmtCAD(rec.bonus_paid)}</p>
                  ) : bonusCalc ? (
                    <p className="text-base font-bold text-emerald-600">{fmtCAD(bonusCalc)}</p>
                  ) : achievedPct !== null && achievedPct < 80 ? (
                    <p className="text-sm font-bold text-red-500">0$ · seuil 80% non atteint</p>
                  ) : quarterlyBase ? (
                    <p className="text-base font-bold text-[#6b7280]">{fmtCAD(quarterlyBase)}</p>
                  ) : null}
                </div>
              )}

              {/* Admin: enregistrer boni */}
              {isAdmin && (
                <button
                  onClick={() => openBonusEdit(q)}
                  className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors text-left"
                >
                  {rec ? '✏️ Modifier le boni' : '+ Enregistrer le boni'}
                </button>
              )}
            </Card>
          )
        })}
      </div>

      {/* Bonus edit form */}
      {editingBonus && (
        <BonusEditForm
          q={editingBonus.q}
          year={year}
          quarterLabel={QUARTERS[editingBonus.q - 1].label}
          form={editingBonus.form}
          onChange={form => setEditingBonus(b => ({ ...b, form }))}
          onSave={handleBonusSave}
          onCancel={() => setEditingBonus(null)}
          saving={savingBonus}
        />
      )}

      {/* Bonus payment history */}
      {paidRecords.length > 0 && (
        <div>
          <h4 className="font-bold text-sm text-[#6b7280] uppercase tracking-wide mb-3">Historique des boni payés</h4>
          <div className="space-y-2">
            {paidRecords.map(r => {
              const qInfo = QUARTERS[r.quarter - 1]
              return (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-[#e5e7eb]">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">
                      {qInfo.label} {r.year}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#1a1a1a]">{qInfo.months}</p>
                      {r.achievement_pct != null && (
                        <p className="text-xs text-[#6b7280]">Atteint : {r.achievement_pct}%</p>
                      )}
                      {r.notes && <p className="text-xs text-[#9ca3af]">{r.notes}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-emerald-600">{fmtCAD(r.bonus_paid)}</p>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Payé</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
