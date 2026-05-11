import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import { SkeletonCard } from '../components/shared/Skeleton'
import CloserObjectivesPanel from '../components/career/CloserObjectivesPanel'
import { useAuth } from '../context/AuthContext'
import { useObjectives } from '../hooks/useObjectives'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../hooks/usePayPeriod'
import {
  useCloserAppointments,
  useCloserSales,
  useCloserCashCollected,
  APPT_STATUS_LABELS,
  APPT_STATUS_COLORS,
  COMMISSION_RATE,
} from '../hooks/useCloserData'

function fmtCAD(n) {
  return Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
}

function fmtDate(d) {
  if (!d) return '—'
  // Les dates QB arrivent en "YYYY-MM-DD" — sans le T12:00 elles seraient
  // interprétées en UTC minuit et décaleraient d'un jour en fuseau canadien.
  const s = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d
  return format(new Date(s), 'd MMM yyyy', { locale: fr })
}

function fmtDateTime(d) {
  if (!d) return '—'
  return format(new Date(d), "d MMM yyyy 'à' HH:mm", { locale: fr })
}

// ─── Sélecteur de période (partagé setter/closer) ─────────────
function PeriodSelector({ periodType, onSetPeriod, customStart, onCustomStart, customEnd, onCustomEnd, payPeriod, label = 'Ma Paie' }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-2">
      <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">{label}</h2>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => onSetPeriod('paie')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${periodType === 'paie' ? 'bg-[#00bbb1] border-[#00bbb1] text-white shadow-sm' : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'}`}
        >
          Période de paie
        </button>
        <span className="text-xs text-[#9ca3af] font-semibold">ou période libre :</span>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${periodType === 'custom' ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-white'}`}>
          <input type="date" value={customStart} onChange={e => { onCustomStart(e.target.value); onSetPeriod('custom') }} className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer" />
          <span className="text-[#9ca3af] text-xs">→</span>
          <input type="date" value={customEnd} min={customStart} onChange={e => { onCustomEnd(e.target.value); onSetPeriod('custom') }} className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer" />
        </div>
      </div>
    </div>
  )
}

// ─── StatCard cliquable ───────────────────────────────────────
function StatCard({ label, value, sub, color = '#00bbb1', icon, onClick }) {
  const inner = (
    <Card className={`p-5 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">{label}</p>
          <p className="text-2xl font-bold text-[#1a1a1a]">{value}</p>
          {sub && <p className="text-xs text-[#6b7280] mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '18' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      {onClick && <p className="text-xs text-[#00bbb1] font-semibold mt-3">Cliquer pour voir le détail →</p>}
    </Card>
  )
  if (onClick) return <button className="text-left w-full" onClick={onClick}>{inner}</button>
  return inner
}

// ─── Badge statut rendez-vous ─────────────────────────────────
function ApptStatusBadge({ status }) {
  const label = APPT_STATUS_LABELS[status] ?? status
  const colors = APPT_STATUS_COLORS[status] ?? { bg: '#6b728018', text: '#6b7280' }
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bg, color: colors.text }}>
      {label}
    </span>
  )
}

// ─── Modal générique ─────────────────────────────────────────
function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1a1a1a]">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-[#9ca3af]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

// ─── Ligne rendez-vous dans modal ────────────────────────────
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

// ─── Ligne vente dans modal ───────────────────────────────────
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

// ─── Ligne paiement QB dans modal ────────────────────────────
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
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color }}>{pct}%</span>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────
export default function Closer() {
  const { profile } = useAuth()
  const { config: payConfig } = usePayPeriodConfig()
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const payPeriod = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null

  // Période sélectionnée
  const [periodType, setPeriodType] = useState('paie')
  const [customStart, setCustomStart] = useState(todayStr)
  const [customEnd, setCustomEnd]     = useState(todayStr)

  const startDate = periodType === 'paie' ? (payPeriod?.start || todayStr) : (customStart || todayStr)
  const endDate   = periodType === 'paie' ? (payPeriod?.end   || todayStr) : (customEnd   || todayStr)

  // Objectifs mois courant
  const [objMonth, setObjMonth] = useState(now.getMonth() + 1)
  const [objYear,  setObjYear]  = useState(now.getFullYear())

  // Modales
  const [apptModalOpen,    setApptModalOpen]    = useState(false)
  const [salesModalOpen,   setSalesModalOpen]   = useState(false)
  const [cashModalOpen,    setCashModalOpen]    = useState(false)
  const [cashFilter,       setCashFilter]       = useState('all')
  const [apptStatusFilter, setApptStatusFilter] = useState('all')

  // Données
  const closerName = profile?.full_name ?? ''
  const ghlUserId  = profile?.ghl_user_id ?? null
  const { appointments, loading: apptLoading, byStatus, hotCount } = useCloserAppointments(closerName, startDate, endDate, ghlUserId)
  const { sales, loading: salesLoading } = useCloserSales(closerName, startDate, endDate, ghlUserId)
  const { data: cashData, loading: cashLoading, error: cashError } = useCloserCashCollected(closerName, startDate, endDate)

  // Objectifs du mois
  const objPStart = `${objYear}-${String(objMonth).padStart(2, '0')}-01`
  const objPEnd   = (() => { const last = new Date(objYear, objMonth, 0).getDate(); return `${objYear}-${String(objMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}` })()
  const { objectives: allObjs } = useObjectives(profile?.id)
  const closerObjs = (allObjs ?? []).filter(o =>
    ['closer_rdv_target', 'closer_sales_target', 'closer_close_rate_target', 'closer_cash_target', 'closer_commission_target'].includes(o.type) &&
    o.period_start === objPStart && o.period_end === objPEnd
  )

  if (!profile) return null

  const closeRate  = hotCount > 0 ? Math.round((sales.length / hotCount) * 100) : null
  const totalCash  = cashData?.total ?? 0
  const newTotal   = cashData?.newTotal ?? 0
  const recurTotal = cashData?.recurringTotal ?? 0
  const commission = cashData?.commission ?? Math.round(totalCash * COMMISSION_RATE * 100) / 100

  const periodLabel = periodType === 'paie' && payPeriod
    ? `Période de paie en cours (${format(parseISO(payPeriod.start), 'd MMM', { locale: fr })} au ${format(parseISO(payPeriod.end), 'd MMM yyyy', { locale: fr })})`
    : `Du ${format(parseISO(startDate), 'd MMM', { locale: fr })} au ${format(parseISO(endDate), 'd MMM yyyy', { locale: fr })}`

  const filteredAppts = apptStatusFilter === 'all'
    ? appointments
    : appointments.filter(a => a.status === apptStatusFilter || (apptStatusFilter === 'showed' && a.status === 'attended'))

  const allPayments = [...(cashData?.newSales ?? []), ...(cashData?.recurring ?? [])]
    .sort((a, b) => new Date(b.txnDate) - new Date(a.txnDate))

  const cashFilteredPayments = cashFilter === 'new'
    ? (cashData?.newSales ?? [])
    : cashFilter === 'recurring'
    ? (cashData?.recurring ?? [])
    : allPayments
  const cashModalTitle = cashFilter === 'new'
    ? `Nouvelles ventes — ${fmtCAD(newTotal)}`
    : cashFilter === 'recurring'
    ? `Paiements récurrents — ${fmtCAD(recurTotal)}`
    : `Cash Collected — ${fmtCAD(totalCash)}`

  const STATUS_TABS = [
    { key: 'all',       label: 'Tous',      count: appointments.length },
    { key: 'confirmed', label: 'Confirmés', count: byStatus['confirmed'] ?? 0 },
    { key: 'showed',    label: 'Show',      count: (byStatus['showed'] ?? 0) + (byStatus['attended'] ?? 0) },
    { key: 'noshow',    label: 'No Show',   count: byStatus['noshow'] ?? 0 },
    { key: 'cancelled', label: 'Annulés',   count: byStatus['cancelled'] ?? 0 },
  ]

  return (
    <Layout>
      <Header title="Mon activité Closer" />

      {/* ── Sélecteur de période ── */}
      <div className="mb-6">
        <PeriodSelector
          periodType={periodType}
          onSetPeriod={setPeriodType}
          customStart={customStart}
          onCustomStart={setCustomStart}
          customEnd={customEnd}
          onCustomEnd={setCustomEnd}
          payPeriod={payPeriod}
          label="Résultats"
        />
        <p className="text-xs text-[#9ca3af] font-semibold">{periodLabel}.</p>
      </div>

      {/* ── Rendez-vous ── */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Rendez-vous</h2>
        {apptLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <StatCard
                label="Total RDV"
                value={appointments.length}
                sub="Cliquer pour voir la liste"
                color="#00bbb1"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                onClick={() => setApptModalOpen(true)}
              />
              <StatCard
                label="Show"
                value={(byStatus['showed'] ?? 0) + (byStatus['attended'] ?? 0)}
                sub="Rendez-vous chauds"
                color="#10b981"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard
                label="No Show"
                value={byStatus['noshow'] ?? 0}
                color="#f59e0b"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard
                label="Annulés"
                value={byStatus['cancelled'] ?? 0}
                color="#ef4444"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
              />
            </div>
            {appointments.length === 0 && (
              <p className="text-sm text-[#9ca3af] text-center py-2">
                Aucun rendez-vous sur cette période.{' '}
                <span className="text-xs">(La synchronisation GHL s'effectue toutes les 30 min.)</span>
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Ventes ── */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Ventes</h2>

        {salesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><SkeletonCard /><SkeletonCard /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <StatCard
              label="Ventes closées"
              value={sales.length}
              sub="Cliquer pour voir le détail"
              color="#00bbb1"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              onClick={sales.length > 0 ? () => setSalesModalOpen(true) : undefined}
            />
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">Taux de close</p>
                  <p className="text-2xl font-bold text-[#1a1a1a]">
                    {closeRate !== null ? `${closeRate} %` : '—'}
                  </p>
                  <p className="text-xs text-[#6b7280] mt-1">
                    {sales.length} vente{sales.length !== 1 ? 's' : ''} / {hotCount} show{hotCount !== 1 ? 's' : ''} chaud{hotCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#6366f1]/10">
                  <svg className="w-5 h-5 text-[#6366f1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* ── Commission / Cash Collected ── */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Ma Commission</h2>

        {/* Bandeau commission */}
        {!cashLoading && totalCash > 0 && (
          <div className="mb-3 px-5 py-4 rounded-2xl border border-[#00bbb1]/30" style={{ background: 'linear-gradient(135deg, #00bbb110 0%, #6366f110 100%)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-1">Commission période de paie</p>
                <p className="text-3xl font-black text-[#00bbb1]">{fmtCAD(commission)}</p>
                <p className="text-xs text-[#9ca3af] mt-0.5">8,6 % × {fmtCAD(totalCash)} cash collected</p>
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-[10px] font-bold text-[#9ca3af] uppercase">Nouvelles ventes</p>
                  <p className="text-lg font-bold text-[#00bbb1]">{fmtCAD(newTotal)}</p>
                </div>
                <div className="w-px bg-[#e5e7eb]" />
                <div className="text-center">
                  <p className="text-[10px] font-bold text-[#9ca3af] uppercase">Récurrents</p>
                  <p className="text-lg font-bold text-[#10b981]">{fmtCAD(recurTotal)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {cashLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
        ) : cashError ? (
          <Card className="p-5"><p className="text-sm text-[#ef4444]">Erreur QuickBooks : {cashError}</p></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard
              label="Nouvelles ventes"
              value={fmtCAD(newTotal)}
              sub={`${(cashData?.newSales ?? []).length} reçu${(cashData?.newSales ?? []).length !== 1 ? 's' : ''}`}
              color="#00bbb1"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
              onClick={() => { setCashFilter('new'); setCashModalOpen(true) }}
            />
            <StatCard
              label="Paiements récurrents"
              value={fmtCAD(recurTotal)}
              sub={`${(cashData?.recurring ?? []).length} reçu${(cashData?.recurring ?? []).length !== 1 ? 's' : ''}`}
              color="#6366f1"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
              onClick={() => { setCashFilter('recurring'); setCashModalOpen(true) }}
            />
            <StatCard
              label="Cash Collected Total"
              value={fmtCAD(totalCash)}
              sub={`${allPayments.length} reçu${allPayments.length !== 1 ? 's' : ''}`}
              color="#10b981"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              onClick={() => { setCashFilter('all'); setCashModalOpen(true) }}
            />
          </div>
        )}

        {!cashLoading && !cashError && totalCash === 0 && (
          <p className="text-sm text-[#9ca3af] text-center py-2 mt-2">
            Aucun paiement QuickBooks trouvé pour cette période.{' '}
            {!cashData && <span className="text-xs">(QuickBooks non connecté ou aucun client à croiser.)</span>}
          </p>
        )}
      </div>

      {/* ── Objectifs du mois ── */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#1a1a1a]">Mes Objectifs du mois</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => { if (objMonth === 1) { setObjMonth(12); setObjYear(y => y - 1) } else setObjMonth(m => m - 1) }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-xs font-bold text-[#1a1a1a] min-w-[100px] text-center capitalize">
              {format(new Date(objYear, objMonth - 1, 1), 'MMM yyyy', { locale: fr })}
            </span>
            <button onClick={() => { if (objMonth === 12) { setObjMonth(1); setObjYear(y => y + 1) } else setObjMonth(m => m + 1) }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {[
            { type: 'closer_rdv_target',        label: 'Rendez-vous',       current: appointments.length,                  isCurrency: false, unit: '' },
            { type: 'closer_sales_target',       label: 'Ventes closées',    current: sales.length,                         isCurrency: false, unit: '' },
            { type: 'closer_close_rate_target',  label: 'Taux de close',     current: closeRate ?? 0,                       isCurrency: false, unit: '%' },
            { type: 'closer_cash_target',        label: 'Cash collected',    current: totalCash,                            isCurrency: true,  unit: '$' },
            { type: 'closer_commission_target',  label: 'Commission',        current: commission,                           isCurrency: true,  unit: '$' },
          ].map(({ type, label, current, isCurrency, unit }) => {
            const obj = closerObjs.find(o => o.type === type)
            const target = obj?.target_value ?? 0
            const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
            const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
            const fmt = v => isCurrency ? fmtCAD(v) : unit === '%' ? `${v} %` : Number(v).toLocaleString('fr-CA')
            return (
              <div key={type}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-[#1a1a1a]">{label}</p>
                  <p className="text-sm font-bold text-[#1a1a1a]">
                    {fmt(current)}
                    {target > 0 && <span className="text-[#9ca3af] font-normal"> / {fmt(target)}</span>}
                  </p>
                </div>
                {target > 0 ? <ProgressBar pct={pct} color={color} /> : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5" />
                    <span className="text-xs text-[#9ca3af] w-20 text-right">Pas d'objectif</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Modal : Rendez-vous ── */}
      <Modal isOpen={apptModalOpen} onClose={() => setApptModalOpen(false)} title={`Rendez-vous — ${appointments.length}`}>
        {/* Filtres par statut */}
        <div className="flex gap-1.5 flex-wrap mb-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setApptStatusFilter(tab.key)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${apptStatusFilter === tab.key ? 'bg-[#00bbb1] border-[#00bbb1] text-white' : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'}`}
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
      <Modal isOpen={salesModalOpen} onClose={() => setSalesModalOpen(false)} title={`Ventes closées — ${sales.length}`}>
        {sales.length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucune vente sur cette période.</p>
        ) : (
          sales.map((s, i) => <SaleRow key={i} sale={s} />)
        )}
      </Modal>

      {/* ── Modal : Cash Collected ── */}
      <Modal isOpen={cashModalOpen} onClose={() => setCashModalOpen(false)} title={cashModalTitle}>
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
        {cashFilteredPayments.length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-6">Aucun paiement sur cette période.</p>
        ) : (
          cashFilteredPayments.map((p, i) => <PaymentRow key={i} payment={p} />)
        )}
      </Modal>
    </Layout>
  )
}
