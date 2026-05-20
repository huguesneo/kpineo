import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Card from '../shared/Card'
import { SkeletonCard } from '../shared/Skeleton'
import { useSetterCommissions } from '../../hooks/useSetterCommissions'
import { useObjectives, setObjectiveForPeriod } from '../../hooks/useObjectives'
import { PeriodSelector } from './CloserDashboardView'

// ─── Formatters ───────────────────────────────────────────────

function fmtCAD(n) {
  return Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
}

function fmtDate(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'd MMM yyyy', { locale: fr }) } catch { return '—' }
}

// ─── Modal ────────────────────────────────────────────────────

function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1a1a1a]">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-[#9ca3af]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

// ─── Barre de progression ─────────────────────────────────────

function ProgressBar({ pct, color }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold w-9 text-right" style={{ color }}>{pct}%</span>
    </div>
  )
}

// ─── Objectif éditable (admin) ────────────────────────────────

function InlineObjectifInput({ value, onSave, saving, isCurrency, unit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  function startEdit() { setDraft(value ? String(value) : ''); setEditing(true); setTimeout(() => inputRef.current?.select(), 10) }
  function commit() { setEditing(false); onSave(draft) }
  function handleKey(e) { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }

  if (editing) {
    return (
      <div className="flex items-center gap-1 mt-1">
        {isCurrency && <span className="text-xs text-[#6b7280]">$</span>}
        <input
          ref={inputRef} type="number" min="0" value={draft}
          onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={handleKey}
          className="w-24 px-2 py-0.5 text-sm font-bold border border-[#00bbb1] rounded focus:outline-none focus:ring-1 focus:ring-[#00bbb1]/40"
          placeholder="0"
        />
        {unit === '%' && <span className="text-xs text-[#6b7280]">%</span>}
        <button onClick={commit} className="text-xs text-[#00bbb1] font-semibold">✓</button>
      </div>
    )
  }

  return (
    <button onClick={startEdit} className="group flex items-center gap-1 text-left" title="Modifier l'objectif">
      {saving ? (
        <span className="text-xs text-[#9ca3af]">…</span>
      ) : value ? (
        <span className="text-xs font-semibold text-[#6b7280] group-hover:text-[#00bbb1] transition-colors">
          Cible : {isCurrency ? fmtCAD(value) : value}
        </span>
      ) : (
        <span className="text-xs font-semibold text-[#9ca3af] group-hover:text-[#00bbb1] border border-dashed border-[#d1d5db] group-hover:border-[#00bbb1] rounded px-2 py-0.5 transition-all">
          + Définir
        </span>
      )}
      {value && !saving && (
        <svg className="w-3 h-3 text-[#9ca3af] group-hover:text-[#00bbb1] opacity-0 group-hover:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      )}
    </button>
  )
}

// ─── Carte objectif ───────────────────────────────────────────

function ObjectifCard({ label, current, target, isCurrency, isAdmin, onSave, saving }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  const color = pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
  const fmt = v => isCurrency ? fmtCAD(v) : Number(v).toLocaleString('fr-CA')
  const achieved = target > 0 && current >= target

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">{label}</p>
        {achieved && (
          <span className="text-[10px] font-bold text-[#10b981] bg-[#10b981]/10 px-1.5 py-0.5 rounded-full">✓ Atteint</span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black text-[#1a1a1a]">{fmt(current)}</span>
        {target > 0 && <span className="text-sm text-[#9ca3af]">/ {fmt(target)}</span>}
      </div>
      {target > 0 ? (
        <ProgressBar pct={pct} color={color} />
      ) : (
        <div className="h-2 bg-gray-100 rounded-full" />
      )}
      {isAdmin ? (
        <InlineObjectifInput value={target || ''} onSave={onSave} saving={saving} isCurrency={isCurrency} unit="" />
      ) : target > 0 ? (
        <p className="text-xs text-[#9ca3af]">Cible : {fmt(target)}</p>
      ) : (
        <p className="text-xs text-[#9ca3af]">Pas d'objectif défini</p>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────

function KPICard({ label, value, sub, highlight, highlightColor = '#10b981', onClick }) {
  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-1 ${onClick ? 'cursor-pointer hover:shadow-sm transition-shadow' : ''} ${highlight ? '' : 'bg-white border-[#e5e7eb]'}`}
      style={highlight ? { backgroundColor: `${highlightColor}15`, borderColor: `${highlightColor}40` } : {}}
      onClick={onClick}
    >
      <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black text-[#1a1a1a]" style={highlight ? { color: highlightColor } : {}}>
        {value ?? '—'}
      </p>
      {sub && <p className="text-xs font-semibold text-[#6b7280]">{sub}</p>}
    </div>
  )
}

// ─── Helpers champs GHL ───────────────────────────────────────

function getRawField(rawObj, key) {
  const f = (rawObj?.customFields ?? []).find(
    cf => cf.id === key || cf.key === key || cf.fieldKey === key
  )
  if (!f) return null
  return f.fieldValueNumber ?? f.fieldValueString ?? f.fieldValueDate ?? f.value ?? null
}

function fmtGHLDate(raw) {
  if (raw == null) return '—'
  const n = Number(raw)
  const d = !isNaN(n) && n > 0 ? new Date(n) : new Date(raw)
  if (isNaN(d.getTime())) return '—'
  try { return format(d, 'd MMM yyyy', { locale: fr }) } catch { return '—' }
}

// ─── Détail opportunité dans modal ────────────────────────────

function OppRow({ opp, typeLabel, date }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#f9fafb] rounded-xl border border-[#f0f0f0]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1a1a1a] truncate">{opp.contact_name || '—'}</p>
        <p className="text-xs text-[#6b7280] mt-0.5">{typeLabel}</p>
      </div>
      {date && <p className="text-xs font-semibold text-[#9ca3af] flex-shrink-0">{date}</p>}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────

export default function SetterDashboardView({
  setterProfile,         // { id, full_name, annual_bonus }
  isAdmin = false,
  startDate,
  endDate,
  periodType,
  onSetPeriod,
  customStart,
  onCustomStart,
  customEnd,
  onCustomEnd,
  payPeriodLabel,
}) {
  const setterName = setterProfile?.full_name ?? ''
  const userId     = setterProfile?.id ?? null

  // Données setter
  const { data: commData, loading: commLoading, error: commError, refresh } = useSetterCommissions(setterName, startDate, endDate)

  // Objectifs du mois courant (basé sur startDate)
  const [objSaving, setObjSaving] = useState(null)
  const objYear  = startDate ? Number(startDate.slice(0, 4)) : new Date().getFullYear()
  const objMonth = startDate ? Number(startDate.slice(5, 7)) : new Date().getMonth() + 1
  const objPStart = `${objYear}-${String(objMonth).padStart(2, '0')}-01`
  const objPEnd   = (() => { const last = new Date(objYear, objMonth, 0).getDate(); return `${objYear}-${String(objMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}` })()
  const { objectives, loading: objLoading, refetch: refetchObjs } = useObjectives(userId)
  const setterObjs = (objectives ?? []).filter(o =>
    ['setter_showup_target', 'setter_confirm_target', 'setter_rebook_target', 'setter_sales_target', 'setter_commission_target'].includes(o.type) &&
    o.period_start === objPStart && o.period_end === objPEnd
  )
  function getObj(type) { return setterObjs.find(o => o.type === type) ?? null }
  async function saveObj(type, rawValue) {
    setObjSaving(type)
    await setObjectiveForPeriod({ user_id: userId, type, target_value: rawValue, period_start: objPStart, period_end: objPEnd })
    await refetchObjs()
    setObjSaving(null)
  }

  // Modales
  const [calledModal,  setCalledModal]  = useState(false)
  const [bookedModal,  setBookedModal]  = useState(false)
  const [showupsModal, setShowupsModal] = useState(false)
  const [manuelModal,  setManuelModal]  = useState(false)
  const [autoModal,    setAutoModal]    = useState(false)
  const [rebookModal,  setRebookModal]  = useState(false)
  const [ventesModal,  setVentesModal]  = useState(false)

  // Métriques
  const calledCount     = commData?.calledCount        ?? 0
  const bookedCount     = commData?.bookedCount        ?? 0
  const showupCount     = commData?.showupCount        ?? 0
  const manuelCount     = commData?.manuelCount        ?? 0
  const autoCount       = commData?.autoCount          ?? 0
  const rebookingCount  = commData?.rebookingCount     ?? 0
  const wonCount        = commData?.wonCount           ?? 0
  const commManuel      = commData?.commissionManuel   ?? 0
  const commAuto        = commData?.commissionAuto     ?? 0
  const commRebook      = commData?.commissionRebook   ?? 0
  const totalBonus      = commData?.totalBonus         ?? 0
  const totalShowups    = commData?.totalShowups       ?? 0
  const totalPay        = commData?.totalPay           ?? 0

  const showupRate      = bookedCount > 0 ? Math.round((showupCount / bookedCount) * 100) : null
  const closeRate       = showupCount > 0 ? Math.round((wonCount / showupCount) * 100) : null

  // Objectifs cibles
  const showupTarget     = getObj('setter_showup_target')?.target_value    ?? 0
  const confirmTarget    = getObj('setter_confirm_target')?.target_value   ?? 0
  const rebookTarget     = getObj('setter_rebook_target')?.target_value    ?? 0
  const salesTarget      = getObj('setter_sales_target')?.target_value     ?? 0
  const commissionTarget = getObj('setter_commission_target')?.target_value ?? 0

  // Bonus message
  const annualBonus   = setterProfile?.annual_bonus ?? null
  const monthlyBonus  = annualBonus ? Math.round(annualBonus / 12) : null
  const showupsMissing = showupTarget > 0 && showupCount < showupTarget ? showupTarget - showupCount : null

  return (
    <div className="space-y-6">

      {/* ── Sélecteur de période ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">Période analysée</h2>
          <PeriodSelector
            periodType={periodType}
            onSetPeriod={onSetPeriod}
            customStart={customStart}
            onCustomStart={onCustomStart}
            customEnd={customEnd}
            onCustomEnd={onCustomEnd}
          />
        </div>
        {payPeriodLabel && (
          <p className="text-xs text-[#9ca3af] font-semibold">{payPeriodLabel}</p>
        )}
      </div>

      {/* ── Hero : Commission Setting ── */}
      {commLoading ? (
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
      ) : (
        <div className="rounded-2xl px-6 py-5 text-white" style={{ background: 'linear-gradient(135deg, #00bbb1 0%, #00bbb1 100%)' }}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm font-semibold text-white/80 mb-1">Commission Setting totale</p>
              <p className="text-4xl font-black">{fmtCAD(totalPay)}</p>
              {bookedCount > 0 && (
                <p className="text-sm text-white/70 mt-1">
                  sur {bookedCount} rendez-vous bookés
                </p>
              )}
              {commError && (
                <p className="text-xs text-white/60 mt-1">— données indisponibles</p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">Show-ups</p>
                <p className="text-lg font-black">{fmtCAD(totalShowups)}</p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">Bonus ventes</p>
                <p className="text-lg font-black">{fmtCAD(totalBonus)}</p>
              </div>
              {showupCount > 0 && (
                <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[90px]">
                  <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">Show-up rate</p>
                  <p className="text-lg font-black">{showupRate ?? 0}%</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 6 KPI Cards ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">KPIs Activité</h2>
          <button
            onClick={refresh}
            disabled={commLoading}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#00bbb1] hover:bg-[#00bbb1]/10 transition-all disabled:opacity-40"
            title="Actualiser"
          >
            <svg className={`w-4 h-4 ${commLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        {commLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KPICard
              label="Total Appelés"
              value={calledCount}
              sub="gens appelés (dernier appel)"
              onClick={calledCount > 0 ? () => setCalledModal(true) : undefined}
            />
            <KPICard
              label="Total Bookés"
              value={bookedCount}
              sub="lead book ou show-up confirmé"
              onClick={bookedCount > 0 ? () => setBookedModal(true) : undefined}
            />
            <KPICard
              label="Show-ups"
              value={showupCount}
              sub={showupRate !== null ? `show-up rate : ${showupRate}%` : 'aucun booked'}
              onClick={showupCount > 0 ? () => setShowupsModal(true) : undefined}
            />
            <KPICard
              label="Manuels"
              value={manuelCount}
              sub={`commission : ${fmtCAD(commManuel)}`}
              highlight={manuelCount > 0}
              highlightColor="#00bbb1"
              onClick={manuelCount > 0 ? () => setManuelModal(true) : undefined}
            />
            <KPICard
              label="Confirmations auto"
              value={autoCount}
              sub={`commission : ${fmtCAD(commAuto)}`}
              onClick={autoCount > 0 ? () => setAutoModal(true) : undefined}
            />
            <KPICard
              label="Rebookings"
              value={rebookingCount}
              sub={`commission : ${fmtCAD(commRebook)}`}
              onClick={rebookingCount > 0 ? () => setRebookModal(true) : undefined}
            />
            <KPICard
              label="Bonus ventes"
              value={wonCount}
              sub={totalBonus > 0 ? fmtCAD(totalBonus) : 'aucun bonus'}
              highlight={wonCount > 0}
              highlightColor="#10b981"
              onClick={wonCount > 0 ? () => setVentesModal(true) : undefined}
            />
          </div>
        )}
      </div>

      {/* ── Funnel de conversion ── */}
      {!commLoading && bookedCount > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[#1a1a1a] mb-4">Funnel de conversion</h2>
          <div className="space-y-3">
            {[
              { label: 'Bookés',    value: bookedCount,  barPct: 100,                                          suffix: '100%',                                          color: '#6366f1' },
              { label: 'Show-ups',  value: showupCount,  barPct: showupRate ?? 0,                              suffix: showupRate !== null ? `${showupRate}% show-up` : '—', color: '#00bbb1' },
              { label: 'Ventes',   value: wonCount,     barPct: bookedCount > 0 ? Math.round((wonCount / bookedCount) * 100) : 0, suffix: closeRate !== null ? `${closeRate}% close` : '—', color: '#10b981' },
            ].map(({ label, value, barPct, suffix, color }) => (
              <div key={label} className="flex items-center gap-3">
                <p className="text-xs font-semibold text-[#6b7280] w-24 flex-shrink-0">{label}</p>
                <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                  <div
                    className="h-6 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                    style={{ width: `${Math.max(barPct, 4)}%`, backgroundColor: color }}
                  >
                    <span className="text-[10px] font-bold text-white">{value}</span>
                  </div>
                </div>
                <p className="text-xs font-bold text-[#6b7280] w-20 text-right flex-shrink-0">{suffix}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── 3 Financial cards ── */}
      <div>
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Métriques financières</h2>
        {commLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                label:  'Commission show-ups',
                amount: totalShowups,
                sub:    `${showupCount} show-up${showupCount !== 1 ? 's' : ''} · Manuel, Auto, Rebook`,
                color:  '#00bbb1',
                onClick: showupCount > 0 ? () => setShowupsModal(true) : undefined,
              },
              {
                label:  'Bonus ventes',
                amount: totalBonus,
                sub:    `${wonCount} vente${wonCount !== 1 ? 's' : ''}`,
                color:  '#10b981',
                onClick: wonCount > 0 ? () => setVentesModal(true) : undefined,
              },
              {
                label:  'Total commission',
                amount: totalPay,
                sub:    'show-ups + bonus ventes',
                color:  '#6366f1',
              },
            ].map(({ label, amount, sub, color, onClick }) => (
              <div key={label} className={onClick ? 'cursor-pointer' : ''} onClick={onClick}>
                <Card className={`p-5 h-full ${onClick ? 'hover:shadow-sm transition-shadow' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-1">{label}</p>
                      <p className="text-2xl font-black text-[#1a1a1a]">{fmtCAD(amount)}</p>
                      <p className="text-xs text-[#9ca3af] mt-0.5">{sub}</p>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Objectifs du mois ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">
            Objectifs — {format(new Date(objYear, objMonth - 1, 1), 'MMMM yyyy', { locale: fr })}
          </h2>
        </div>
        {objLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ObjectifCard
                label="Show-ups"
                current={showupCount}
                target={showupTarget}
                isCurrency={false}
                isAdmin={isAdmin}
                onSave={v => saveObj('setter_showup_target', v)}
                saving={objSaving === 'setter_showup_target'}
              />
              <ObjectifCard
                label="Confirmations auto"
                current={autoCount}
                target={confirmTarget}
                isCurrency={false}
                isAdmin={isAdmin}
                onSave={v => saveObj('setter_confirm_target', v)}
                saving={objSaving === 'setter_confirm_target'}
              />
              <ObjectifCard
                label="Rebookings"
                current={rebookingCount}
                target={rebookTarget}
                isCurrency={false}
                isAdmin={isAdmin}
                onSave={v => saveObj('setter_rebook_target', v)}
                saving={objSaving === 'setter_rebook_target'}
              />
              <ObjectifCard
                label="Ventes"
                current={wonCount}
                target={salesTarget}
                isCurrency={false}
                isAdmin={isAdmin}
                onSave={v => saveObj('setter_sales_target', v)}
                saving={objSaving === 'setter_sales_target'}
              />
              <ObjectifCard
                label="Commission totale"
                current={totalPay}
                target={commissionTarget}
                isCurrency
                isAdmin={isAdmin}
                onSave={v => saveObj('setter_commission_target', v)}
                saving={objSaving === 'setter_commission_target'}
              />
            </div>

            {/* Message bonus */}
            {showupsMissing !== null && monthlyBonus !== null && (
              <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-lg">🏆</span>
                <p className="text-sm text-amber-800 font-semibold">
                  Plus que <strong>{showupsMissing} show-up{showupsMissing !== 1 ? 's' : ''}</strong> pour débloquer ton bonus de {fmtCAD(monthlyBonus)} ce mois-ci.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal : Total appelés ── */}
      <Modal isOpen={calledModal} onClose={() => setCalledModal(false)} title={`Total appelés — ${calledCount}`}>
        {(commData?.calledOpps ?? []).length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucun appel sur cette période.</p>
        ) : (
          (commData?.calledOpps ?? []).map((opp, i) => (
            <OppRow key={i} opp={opp} typeLabel="Dernier appel" date={fmtGHLDate(getRawField(opp.raw, 'mv0GU9HmvkCrkGVUSaqR'))} />
          ))
        )}
      </Modal>

      {/* ── Modal : Total bookés ── */}
      <Modal isOpen={bookedModal} onClose={() => setBookedModal(false)} title={`Total bookés — ${bookedCount}`}>
        {(commData?.bookedOpps ?? []).length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucun rendez-vous booké sur cette période.</p>
        ) : (
          (commData?.bookedOpps ?? []).map((opp, i) => (
            <OppRow key={i} opp={opp} typeLabel="Rendez-vous booké" date={fmtDate(opp.created_at_ghl)} />
          ))
        )}
      </Modal>

      {/* ── Modal : Show-ups ── */}
      <Modal isOpen={showupsModal} onClose={() => setShowupsModal(false)} title={`Show-ups — ${showupCount}`}>
        {[
          { opps: commData?.manuelOpps ?? [], typeLabel: 'Manuel · 40 $' },
          { opps: commData?.autoOpps   ?? [], typeLabel: 'Confirmation auto · 20 $' },
          { opps: commData?.rebookOpps ?? [], typeLabel: 'Rebooking · 20 $' },
        ].every(({ opps }) => opps.length === 0) ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucun show-up sur cette période.</p>
        ) : (
          [
            { opps: commData?.manuelOpps ?? [], typeLabel: 'Manuel · 40 $' },
            { opps: commData?.autoOpps   ?? [], typeLabel: 'Confirmation auto · 20 $' },
            { opps: commData?.rebookOpps ?? [], typeLabel: 'Rebooking · 20 $' },
          ].map(({ opps, typeLabel }) => opps.length > 0 && (
            <div key={typeLabel}>
              <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-2">{typeLabel}</p>
              {opps.map((opp, i) => (
                <OppRow key={i} opp={opp} typeLabel={typeLabel} date={fmtGHLDate(getRawField(opp.raw, 'mv0GU9HmvkCrkGVUSaqR'))} />
              ))}
            </div>
          ))
        )}
      </Modal>

      {/* ── Modal : Manuels ── */}
      <Modal isOpen={manuelModal} onClose={() => setManuelModal(false)} title={`Manuels — ${manuelCount}`}>
        {(commData?.manuelOpps ?? []).length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucun booking manuel sur cette période.</p>
        ) : (
          (commData?.manuelOpps ?? []).map((opp, i) => (
            <OppRow key={i} opp={opp} typeLabel="Manuel · 40 $" date={fmtGHLDate(getRawField(opp.raw, 'mv0GU9HmvkCrkGVUSaqR'))} />
          ))
        )}
      </Modal>

      {/* ── Modal : Confirmations auto ── */}
      <Modal isOpen={autoModal} onClose={() => setAutoModal(false)} title={`Confirmations auto — ${autoCount}`}>
        {(commData?.autoOpps ?? []).length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucune confirmation auto sur cette période.</p>
        ) : (
          (commData?.autoOpps ?? []).map((opp, i) => (
            <OppRow key={i} opp={opp} typeLabel="Confirmation auto · 20 $" date={fmtGHLDate(getRawField(opp.raw, 'mv0GU9HmvkCrkGVUSaqR'))} />
          ))
        )}
      </Modal>

      {/* ── Modal : Rebookings ── */}
      <Modal isOpen={rebookModal} onClose={() => setRebookModal(false)} title={`Rebookings — ${rebookingCount}`}>
        {(commData?.rebookOpps ?? []).length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucun rebooking sur cette période.</p>
        ) : (
          (commData?.rebookOpps ?? []).map((opp, i) => (
            <OppRow key={i} opp={opp} typeLabel="Rebooking · 20 $" date={fmtGHLDate(getRawField(opp.raw, 'mv0GU9HmvkCrkGVUSaqR'))} />
          ))
        )}
      </Modal>

      {/* ── Modal : Ventes ── */}
      <Modal isOpen={ventesModal} onClose={() => setVentesModal(false)} title={`Bonus ventes — ${wonCount}`}>
        {(commData?.wonOpps ?? []).length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucune vente sur cette période.</p>
        ) : (
          (commData?.wonOpps ?? []).map((opp, i) => (
            <OppRow key={i} opp={opp} typeLabel="Vente fermée" date={fmtGHLDate(getRawField(opp.raw, 'UPqvJX8MkZ4thsPX2tjV'))} />
          ))
        )}
      </Modal>

    </div>
  )
}
