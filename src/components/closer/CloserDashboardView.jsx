import { useState, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Card from '../shared/Card'
import { SkeletonCard } from '../shared/Skeleton'
import {
  useCloserAppointments,
  useCloserSales,
  useCloserCashCollected,
  APPT_STATUS_LABELS,
  APPT_STATUS_COLORS,
  COMMISSION_RATE,
} from '../../hooks/useCloserData'
import { useObjectives, setObjectiveForPeriod } from '../../hooks/useObjectives'

// ─── Formatters ───────────────────────────────────────────────

function fmtCAD(n) {
  return Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
}

function fmtDate(d) {
  if (!d) return '—'
  const s = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d
  return format(new Date(s), 'd MMM yyyy', { locale: fr })
}

function fmtDateTime(d) {
  if (!d) return '—'
  return format(new Date(d), "d MMM yyyy 'à' HH:mm", { locale: fr })
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

// ─── Badges & rows ────────────────────────────────────────────

function ApptStatusBadge({ status }) {
  const label = APPT_STATUS_LABELS[status] ?? status
  const colors = APPT_STATUS_COLORS[status] ?? { bg: '#6b728018', text: '#6b7280' }
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bg, color: colors.text }}>
      {label}
    </span>
  )
}

function ApptRow({ appt }) {
  const hasMeetLink = appt.meeting_url && appt.meeting_url.startsWith('http')
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 bg-[#f9fafb] rounded-xl border border-[#f0f0f0]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1a1a1a] truncate">{appt.contact_name || '—'}</p>
        <p className="text-xs text-[#6b7280] mt-0.5">{fmtDateTime(appt.start_time)}</p>
        {hasMeetLink && (
          <a href={appt.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#00bbb1] font-semibold hover:underline mt-0.5 inline-block">
            Google Meet →
          </a>
        )}
        {!hasMeetLink && appt.meeting_url && (
          <p className="text-xs text-[#6b7280] mt-0.5">{appt.meeting_url}</p>
        )}
      </div>
      <ApptStatusBadge status={appt.status} />
    </div>
  )
}

function SaleRow({ sale }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#f9fafb] rounded-xl border border-[#f0f0f0]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1a1a1a] truncate">{sale.contactName || '—'}</p>
        <p className="text-xs text-[#6b7280] mt-0.5">Closé le {fmtDate(sale.closeDate)}</p>
      </div>
      {sale.monetaryValue > 0 && (
        <p className="text-sm font-bold text-[#10b981] flex-shrink-0">{fmtCAD(sale.monetaryValue)}</p>
      )}
    </div>
  )
}

function PaymentRow({ payment }) {
  const isNew = payment.type === 'new'
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 bg-[#f9fafb] rounded-xl border border-[#f0f0f0]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1a1a1a] truncate">{payment.clientName || '—'}</p>
        <p className="text-xs text-[#6b7280] mt-0.5">{payment.productName}</p>
        <p className="text-xs text-[#9ca3af]">{fmtDate(payment.txnDate)}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-[#1a1a1a]">{fmtCAD(payment.amount)}</p>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isNew ? 'bg-[#00bbb1]/10 text-[#00bbb1]' : 'bg-[#10b981]/10 text-[#10b981]'}`}>
          {isNew ? 'Nouvelle vente' : 'Récurrent'}
        </span>
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
          Cible : {isCurrency ? fmtCAD(value) : unit === '%' ? `${value}%` : value}
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

function ObjectifCard({ label, current, target, isCurrency, unit, isAdmin, onSave, saving }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  const color = pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
  const fmt = v => isCurrency ? fmtCAD(v) : unit === '%' ? `${v}%` : Number(v).toLocaleString('fr-CA')
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
        <InlineObjectifInput
          value={target || ''}
          onSave={onSave}
          saving={saving}
          isCurrency={isCurrency}
          unit={unit}
        />
      ) : target > 0 ? (
        <p className="text-xs text-[#9ca3af]">Cible : {fmt(target)}</p>
      ) : (
        <p className="text-xs text-[#9ca3af]">Pas d'objectif défini</p>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────

function KPICard({ label, value, sub, alert, highlight, highlightColor = '#10b981', onClick }) {
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
      {sub && <p className={`text-xs font-semibold ${alert ? 'text-[#f59e0b]' : 'text-[#6b7280]'}`}>{sub}</p>}
      {alert && (
        <p className="text-[10px] text-[#f59e0b] font-bold">⚠ à surveiller</p>
      )}
    </div>
  )
}

// ─── Sélecteur de période ─────────────────────────────────────

export function PeriodSelector({ periodType, onSetPeriod, customStart, onCustomStart, customEnd, onCustomEnd }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={() => onSetPeriod('month')}
        className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${periodType === 'month' ? 'bg-[#00bbb1] border-[#00bbb1] text-white shadow-sm' : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'}`}
      >
        Mois en cours
      </button>
      <button
        onClick={() => onSetPeriod('paie')}
        className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${periodType === 'paie' ? 'bg-[#00bbb1] border-[#00bbb1] text-white shadow-sm' : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'}`}
      >
        Période de paie
      </button>
      <span className="text-xs text-[#9ca3af] font-semibold">ou :</span>
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${periodType === 'custom' ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-white'}`}>
        <input
          type="date"
          value={customStart}
          onChange={e => { onCustomStart(e.target.value); onSetPeriod('custom') }}
          className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer"
        />
        <span className="text-[#9ca3af] text-xs">→</span>
        <input
          type="date"
          value={customEnd}
          onChange={e => { onCustomEnd(e.target.value); onSetPeriod('custom') }}
          className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer"
        />
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────

export default function CloserDashboardView({
  closerProfile,          // { id, full_name, ghl_user_id, annual_bonus }
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
  const closerName = closerProfile?.full_name ?? ''
  const ghlUserId  = closerProfile?.ghl_user_id ?? null
  const userId     = closerProfile?.id ?? null

  // Données live
  const { appointments, loading: apptLoading, byStatus, hotCount } = useCloserAppointments(closerName, startDate, endDate, ghlUserId)
  const { sales, loading: salesLoading }                           = useCloserSales(closerName, startDate, endDate, ghlUserId)
  const { data: cashData, loading: cashLoading, error: cashError } = useCloserCashCollected(closerName, startDate, endDate)

  // Objectifs du mois courant (basé sur startDate)
  const [objSaving, setObjSaving] = useState(null)
  const objYear  = startDate ? Number(startDate.slice(0, 4)) : new Date().getFullYear()
  const objMonth = startDate ? Number(startDate.slice(5, 7)) : new Date().getMonth() + 1
  const objPStart = `${objYear}-${String(objMonth).padStart(2, '0')}-01`
  const objPEnd   = (() => { const last = new Date(objYear, objMonth, 0).getDate(); return `${objYear}-${String(objMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}` })()
  const { objectives, loading: objLoading, refetch: refetchObjs } = useObjectives(userId)
  const closerObjs = (objectives ?? []).filter(o =>
    ['closer_rdv_target', 'closer_sales_target', 'closer_close_rate_target', 'closer_cash_target', 'closer_commission_target'].includes(o.type) &&
    o.period_start === objPStart && o.period_end === objPEnd
  )
  function getObj(type) { return closerObjs.find(o => o.type === type) ?? null }
  async function saveObj(type, rawValue, isCurrency) {
    setObjSaving(type)
    await setObjectiveForPeriod({ user_id: userId, type, target_value: rawValue, period_start: objPStart, period_end: objPEnd })
    await refetchObjs()
    setObjSaving(null)
  }

  // Modales
  const [apptModal,    setApptModal]    = useState(false)
  const [salesModal,   setSalesModal]   = useState(false)
  const [cashModal,    setCashModal]    = useState(false)
  const [cashFilter,   setCashFilter]   = useState('all')
  const [apptFilter,   setApptFilter]   = useState('all')

  // Métriques calculées
  const totalRDV     = appointments.length
  const shows        = hotCount
  const noShows      = byStatus['noshow'] ?? 0
  const cancelled    = byStatus['cancelled'] ?? 0
  const ventesCount  = sales.length
  const closeRate    = shows > 0 ? Math.round((ventesCount / shows) * 100) : null
  const showRate     = totalRDV > 0 ? Math.round((shows / totalRDV) * 100) : null
  const noShowRate   = totalRDV > 0 ? Math.round((noShows / totalRDV) * 100) : null
  const totalCash    = cashData?.total ?? 0
  const newTotal     = cashData?.newTotal ?? 0
  const recurTotal   = cashData?.recurringTotal ?? 0
  const commission   = cashData?.commission ?? Math.round(totalCash * COMMISSION_RATE * 100) / 100
  const newSalesCount  = (cashData?.newSales ?? []).length
  const recurCount     = (cashData?.recurring ?? []).length
  const avgTicket      = newSalesCount > 0 ? Math.round(newTotal / newSalesCount) : null
  const allPayments    = [...(cashData?.newSales ?? []), ...(cashData?.recurring ?? [])].sort((a, b) => new Date(b.txnDate) - new Date(a.txnDate))
  const cashFiltered   = cashFilter === 'new' ? (cashData?.newSales ?? []) : cashFilter === 'recurring' ? (cashData?.recurring ?? []) : allPayments

  // Objectifs cibles
  const rdvTarget        = getObj('closer_rdv_target')?.target_value ?? 0
  const salesTarget      = getObj('closer_sales_target')?.target_value ?? 0
  const closeRateTarget  = getObj('closer_close_rate_target')?.target_value ?? 0
  const cashTarget       = getObj('closer_cash_target')?.target_value ?? 0
  const commissionTarget = getObj('closer_commission_target')?.target_value ?? 0

  // Taux de close: highlight si ≥ objectif (ou ≥ 50% si pas d'objectif)
  const closeRateHighlight = closeRate !== null && (closeRateTarget > 0 ? closeRate >= closeRateTarget : closeRate >= 50)

  // Message bonus
  const annualBonus   = closerProfile?.annual_bonus ?? null
  const monthlyBonus  = annualBonus ? Math.round(annualBonus / 12) : null
  const ventesMissing = salesTarget > 0 && ventesCount < salesTarget ? salesTarget - ventesCount : null

  const STATUS_TABS = [
    { key: 'all',       label: 'Tous',       count: totalRDV },
    { key: 'confirmed', label: 'Confirmés',  count: byStatus['confirmed'] ?? 0 },
    { key: 'showed',    label: 'Show',        count: shows },
    { key: 'noshow',    label: 'No Show',     count: noShows },
    { key: 'cancelled', label: 'Annulés',     count: cancelled },
  ]
  const filteredAppts = apptFilter === 'all'
    ? appointments
    : appointments.filter(a => a.status === apptFilter || (apptFilter === 'showed' && a.status === 'attended'))

  const loading = apptLoading || salesLoading || cashLoading

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

      {/* ── Hero : Commission ── */}
      {cashLoading ? (
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
      ) : (
        <div className="rounded-2xl px-6 py-5 text-white" style={{ background: 'linear-gradient(135deg, #00bbb1 0%, #009e94 100%)' }}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm font-semibold text-white/80 mb-1">
                Commission totale ({(COMMISSION_RATE * 100).toFixed(1)}%)
              </p>
              <p className="text-4xl font-black">{fmtCAD(commission)}</p>
              {totalCash > 0 && (
                <p className="text-sm text-white/70 mt-1">
                  sur {fmtCAD(totalCash)} collectés
                </p>
              )}
              {cashError && (
                <p className="text-xs text-white/60 mt-1">— données QB indisponibles</p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">Nouvelles ventes</p>
                <p className="text-lg font-black">{fmtCAD(newTotal)}</p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">Récurrents</p>
                <p className="text-lg font-black">{fmtCAD(recurTotal)}</p>
              </div>
              {avgTicket !== null && (
                <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[90px]">
                  <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">Panier moyen</p>
                  <p className="text-lg font-black">{fmtCAD(avgTicket)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 6 KPI Cards ── */}
      <div>
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">KPIs Activité</h2>
        {apptLoading || salesLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KPICard
              label="Total RDV"
              value={totalRDV}
              sub={`bookés${rdvTarget > 0 ? ` · cible ${rdvTarget}` : ''}`}
              onClick={() => setApptModal(true)}
            />
            <KPICard
              label="Shows"
              value={shows}
              sub={showRate !== null ? `show rate : ${showRate}%${closeRateTarget > 0 ? ` · cible ${Math.round(closeRateTarget * 0.6)}%` : ''}` : 'aucun RDV'}
            />
            <KPICard
              label="No-shows"
              value={noShows}
              sub={noShowRate !== null ? `${noShowRate}% des RDV` : 'aucun RDV'}
              alert={noShowRate !== null && noShowRate > 25}
            />
            <KPICard
              label="Annulés"
              value={cancelled}
              sub={totalRDV > 0 ? `${Math.round((cancelled / totalRDV) * 100)}% des RDV` : 'aucun RDV'}
            />
            <KPICard
              label="Ventes fermées"
              value={ventesCount}
              sub={shows > 0 ? `sur ${shows} show${shows !== 1 ? 's' : ''}` : 'aucun show'}
              onClick={ventesCount > 0 ? () => setSalesModal(true) : undefined}
            />
            <KPICard
              label="Taux de close"
              value={closeRate !== null ? `${closeRate}%` : '—'}
              sub={`ventes / shows${closeRateTarget > 0 ? ` · cible ${closeRateTarget}%` : ''}`}
              highlight={closeRateHighlight}
              highlightColor="#10b981"
            />
          </div>
        )}
      </div>

      {/* ── Funnel de conversion ── */}
      {!apptLoading && !salesLoading && totalRDV > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[#1a1a1a] mb-4">Funnel de conversion</h2>
          <div className="space-y-3">
            {[
              { label: 'RDV bookés',  value: totalRDV, barPct: 100,                                     suffix: '100%',                                      color: '#00bbb1' },
              { label: 'Shows',        value: shows,   barPct: showRate ?? 0,                           suffix: showRate !== null ? `${showRate}% show` : '—', color: '#6366f1' },
              { label: 'Ventes',       value: ventesCount, barPct: totalRDV > 0 ? Math.round((ventesCount / totalRDV) * 100) : 0, suffix: closeRate !== null ? `${closeRate}% close` : '—', color: '#10b981' },
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
        {cashLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
        ) : cashError ? (
          <Card className="p-5">
            <p className="text-sm text-[#6b7280]">— données QuickBooks indisponibles</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                label: 'Nouvelles ventes',
                amount: newTotal,
                sub: newSalesCount > 0 ? `${newSalesCount} reçu${newSalesCount !== 1 ? 's' : ''} · moy. ${fmtCAD(avgTicket ?? 0)}` : '0 reçu',
                filter: 'new',
                color: '#00bbb1',
              },
              {
                label: 'Paiements récurrents',
                amount: recurTotal,
                sub: `${recurCount} reçu${recurCount !== 1 ? 's' : ''}`,
                filter: 'recurring',
                color: '#6366f1',
              },
              {
                label: 'Cash collected total',
                amount: totalCash,
                sub: `${allPayments.length} reçu${allPayments.length !== 1 ? 's' : ''} · voir le détail →`,
                filter: 'all',
                color: '#10b981',
              },
            ].map(({ label, amount, sub, filter, color }) => (
              <button
                key={filter}
                className="text-left"
                onClick={() => { setCashFilter(filter); setCashModal(true) }}
              >
                <Card className="p-5 hover:shadow-sm transition-shadow cursor-pointer h-full">
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
              </button>
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
                label="Rendez-vous"
                current={totalRDV}
                target={rdvTarget}
                isCurrency={false} unit=""
                isAdmin={isAdmin}
                onSave={v => saveObj('closer_rdv_target', v)}
                saving={objSaving === 'closer_rdv_target'}
              />
              <ObjectifCard
                label="Ventes fermées"
                current={ventesCount}
                target={salesTarget}
                isCurrency={false} unit=""
                isAdmin={isAdmin}
                onSave={v => saveObj('closer_sales_target', v)}
                saving={objSaving === 'closer_sales_target'}
              />
              <ObjectifCard
                label="Taux de close"
                current={closeRate ?? 0}
                target={closeRateTarget}
                isCurrency={false} unit="%"
                isAdmin={isAdmin}
                onSave={v => saveObj('closer_close_rate_target', v)}
                saving={objSaving === 'closer_close_rate_target'}
              />
              <ObjectifCard
                label="Cash collected"
                current={totalCash}
                target={cashTarget}
                isCurrency unit="$"
                isAdmin={isAdmin}
                onSave={v => saveObj('closer_cash_target', v)}
                saving={objSaving === 'closer_cash_target'}
              />
              <ObjectifCard
                label="Commission"
                current={commission}
                target={commissionTarget}
                isCurrency unit="$"
                isAdmin={isAdmin}
                onSave={v => saveObj('closer_commission_target', v)}
                saving={objSaving === 'closer_commission_target'}
              />
            </div>

            {/* Message bonus */}
            {ventesMissing !== null && monthlyBonus !== null && (
              <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-lg">🏆</span>
                <p className="text-sm text-amber-800 font-semibold">
                  Plus que <strong>{ventesMissing} vente{ventesMissing !== 1 ? 's' : ''}</strong> pour débloquer ton bonus de {fmtCAD(monthlyBonus)} ce mois-ci.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal : Rendez-vous ── */}
      <Modal isOpen={apptModal} onClose={() => setApptModal(false)} title={`Rendez-vous — ${totalRDV}`}>
        <div className="flex gap-1.5 flex-wrap mb-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setApptFilter(tab.key)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${apptFilter === tab.key ? 'bg-[#00bbb1] border-[#00bbb1] text-white' : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'}`}
            >
              {tab.label} {tab.count > 0 && `(${tab.count})`}
            </button>
          ))}
        </div>
        {filteredAppts.length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucun rendez-vous dans ce filtre.</p>
        ) : (
          filteredAppts.map(a => <ApptRow key={a.id} appt={a} />)
        )}
      </Modal>

      {/* ── Modal : Ventes ── */}
      <Modal isOpen={salesModal} onClose={() => setSalesModal(false)} title={`Ventes closées — ${ventesCount}`}>
        {sales.length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucune vente sur cette période.</p>
        ) : (
          sales.map((s, i) => <SaleRow key={i} sale={s} />)
        )}
      </Modal>

      {/* ── Modal : Cash Collected ── */}
      <Modal
        isOpen={cashModal}
        onClose={() => setCashModal(false)}
        title={cashFilter === 'new' ? `Nouvelles ventes — ${fmtCAD(newTotal)}` : cashFilter === 'recurring' ? `Récurrents — ${fmtCAD(recurTotal)}` : `Cash Collected — ${fmtCAD(totalCash)}`}
      >
        {cashFilter === 'all' && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-[#00bbb1]/5 rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] font-bold text-[#9ca3af] uppercase">Nouvelles ventes</p>
              <p className="text-base font-bold text-[#00bbb1]">{fmtCAD(newTotal)}</p>
            </div>
            <div className="bg-[#10b981]/5 rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] font-bold text-[#9ca3af] uppercase">Récurrents</p>
              <p className="text-base font-bold text-[#10b981]">{fmtCAD(recurTotal)}</p>
            </div>
          </div>
        )}
        {cashFiltered.length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucun paiement sur cette période.</p>
        ) : (
          cashFiltered.map((p, i) => <PaymentRow key={i} payment={p} />)
        )}
      </Modal>

    </div>
  )
}
