import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Modal from '../components/shared/Modal'
import { SkeletonCard } from '../components/shared/Skeleton'
import SetterEODForm from '../components/eod/SetterEODForm'
import SetterObjectivesPanel from '../components/career/SetterObjectivesPanel'
import { useAuth } from '../context/AuthContext'
import { useSetterCommissions } from '../hooks/useSetterCommissions'
import { useObjectives } from '../hooks/useObjectives'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../hooks/usePayPeriod'
import { useCloserCashCollected } from '../hooks/useCloserData'

function fmtCAD(n) {
  return Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
}

function fmtDate(d) {
  if (!d) return '—'
  const s = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d
  return format(new Date(s), 'd MMM yyyy', { locale: fr })
}

function StatCard({ label, value, sub, color = '#00bbb1', icon, onClick }) {
  const inner = (
    <Card className={`p-5 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">{label}</p>
          <p className="text-2xl font-bold text-[#1a1a1a]">{value}</p>
          {sub && <p className="text-xs text-[#6b7280] mt-1">{sub}</p>}
          {onClick && <p className="text-xs text-[#00bbb1] font-semibold mt-2">Voir le détail →</p>}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '18' }}>
            <span style={{ color }}>{icon}</span>
          </div>
        )}
      </div>
    </Card>
  )
  if (onClick) return <button className="text-left w-full" onClick={onClick}>{inner}</button>
  return inner
}

function ClosingPaymentRow({ payment }) {
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

export default function Setter() {
  const { profile, hasCloserRole } = useAuth()
  const { config: payConfig } = usePayPeriodConfig()
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const payPeriod = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null

  const [periodType, setPeriodType] = useState('paie')
  const [customStart, setCustomStart] = useState(todayStr)
  const [customEnd, setCustomEnd]   = useState(todayStr)

  const [setterMonth, setSetterMonth] = useState(now.getMonth() + 1)
  const [setterYear, setSetterYear]   = useState(now.getFullYear())

  const [cashFilter, setCashFilter]     = useState('all')
  const [cashModalOpen, setCashModalOpen] = useState(false)

  let startDate = periodType === 'paie' ? (payPeriod?.start || todayStr) : (customStart || todayStr)
  let endDate   = periodType === 'paie' ? (payPeriod?.end   || todayStr) : (customEnd   || todayStr)

  const { data: commData, loading: commLoading } = useSetterCommissions(profile?.full_name, startDate, endDate)
  // Ne pas appeler si l'utilisateur a aussi le rôle closer (la section Closer gère déjà ça)
  const { data: cashData, loading: cashLoading, error: cashError } = useCloserCashCollected(
    hasCloserRole ? null : profile?.full_name,
    startDate,
    endDate
  )

  const commission  = cashData?.commission ?? 0
  const totalCash   = cashData?.total ?? 0
  const newTotal    = cashData?.newTotal ?? 0
  const recurTotal  = cashData?.recurringTotal ?? 0
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

  const setterPStart = `${setterYear}-${String(setterMonth).padStart(2, '0')}-01`
  const setterPEnd   = (() => {
    const last = new Date(setterYear, setterMonth, 0).getDate()
    return `${setterYear}-${String(setterMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  })()
  const { objectives: setterObjAll } = useObjectives(profile?.id)
  const setterMonthObjs = (setterObjAll ?? []).filter(o =>
    ['setter_showup_target', 'setter_confirm_target', 'setter_rebook_target', 'setter_sales_target', 'setter_commission_target'].includes(o.type) &&
    o.period_start === setterPStart && o.period_end === setterPEnd
  )

  if (!profile) return null

  return (
    <Layout>
      <Header title="Mon activité Setter" />

      {/* EOD journalier */}
      <SetterEODForm userId={profile.id} />

      {/* Sélecteur de période — partagé entre Commission Closing et Commission Setting */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-end gap-3 mb-1">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setPeriodType('paie')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              periodType === 'paie'
                ? 'bg-[#00bbb1] border-[#00bbb1] text-white shadow-sm'
                : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
            }`}
          >
            Période de paie
          </button>
          <span className="text-xs text-[#9ca3af] font-semibold">ou période libre :</span>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
            periodType === 'custom' ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-white'
          }`}>
            <input
              type="date"
              value={customStart}
              onChange={e => { setCustomStart(e.target.value); setPeriodType('custom') }}
              className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer"
            />
            <span className="text-[#9ca3af] text-xs">→</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              onChange={e => { setCustomEnd(e.target.value); setPeriodType('custom') }}
              className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-[#9ca3af] mb-5 font-semibold">
        {periodType === 'paie' && payPeriod
          ? `Période de paie en cours (${format(parseISO(payPeriod.start), 'd MMM', { locale: fr })} au ${format(parseISO(payPeriod.end), 'd MMM yyyy', { locale: fr })}).`
          : `Du ${format(parseISO(customStart), 'd MMM', { locale: fr })} au ${format(parseISO(customEnd), 'd MMM yyyy', { locale: fr })}.`}
      </p>

      {/* Commission Closing — masqué si l'utilisateur a le rôle closer (disponible dans /closer) */}
      {!hasCloserRole && <div className="mb-6">
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Commission Closing</h2>
        {cashLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
          </div>
        ) : cashError ? (
          <Card className="p-4"><p className="text-sm text-[#ef4444]">Erreur QuickBooks : {cashError}</p></Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Commission période de paie"
              value={fmtCAD(commission)}
              sub={`sur ${fmtCAD(totalCash)}`}
              color="#00bbb1"
              onClick={() => { setCashFilter('all'); setCashModalOpen(true) }}
            />
            <StatCard
              label="Cash Collected Total"
              value={fmtCAD(totalCash)}
              sub={`${allPayments.length} reçu${allPayments.length !== 1 ? 's' : ''}`}
              color="#10b981"
              onClick={() => { setCashFilter('all'); setCashModalOpen(true) }}
            />
            <StatCard
              label="Nouvelles ventes"
              value={fmtCAD(newTotal)}
              sub={`${(cashData?.newSales ?? []).length} reçu${(cashData?.newSales ?? []).length !== 1 ? 's' : ''}`}
              color="#00bbb1"
              onClick={() => { setCashFilter('new'); setCashModalOpen(true) }}
            />
            <StatCard
              label="Paiements récurrents"
              value={fmtCAD(recurTotal)}
              sub={`${(cashData?.recurring ?? []).length} reçu${(cashData?.recurring ?? []).length !== 1 ? 's' : ''}`}
              color="#6366f1"
              onClick={() => { setCashFilter('recurring'); setCashModalOpen(true) }}
            />
          </div>
        )}
      </div>}

      {/* Commission Setting */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Commission Setting</h2>
        {commLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{[0, 1, 2].map(i => <SkeletonCard key={i} />)}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[0, 1].map(i => <SkeletonCard key={i} />)}</div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard
                label="Commission Manuelle"
                value={fmtCAD(commData?.commissionManuel ?? 0)}
                sub={`${commData?.manuelCount ?? 0} show-up${(commData?.manuelCount ?? 0) !== 1 ? 's' : ''} manuel${(commData?.manuelCount ?? 0) !== 1 ? 's' : ''} × 40 $`}
                color="#00bbb1"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
              />
              <StatCard
                label="Commission Confirmation"
                value={fmtCAD(commData?.commissionAuto ?? 0)}
                sub={`${commData?.autoCount ?? 0} confirmation${(commData?.autoCount ?? 0) !== 1 ? 's' : ''} auto × 20 $`}
                color="#f59e0b"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard
                label="Commission Rebooking"
                value={fmtCAD(commData?.commissionRebook ?? 0)}
                sub={`${commData?.rebookingCount ?? 0} rebooking${(commData?.rebookingCount ?? 0) !== 1 ? 's' : ''} × 20 $`}
                color="#6366f1"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StatCard
                label="Bonus de Vente"
                value={fmtCAD(commData?.totalBonus ?? 0)}
                sub={`${commData?.wonCount ?? 0} vente${(commData?.wonCount ?? 0) !== 1 ? 's' : ''}`}
                color="#6366f1"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard
                label="Total à payer"
                value={fmtCAD(commData?.totalPay ?? 0)}
                sub={`${commData?.showupCount ?? 0} show-up${(commData?.showupCount ?? 0) !== 1 ? 's' : ''} · ${commData?.bookedCount ?? 0} booké${(commData?.bookedCount ?? 0) !== 1 ? 's' : ''}`}
                color="#10b981"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal Cash Collected — uniquement si pas de rôle closer */}
      {!hasCloserRole && (
        <Modal isOpen={cashModalOpen} onClose={() => setCashModalOpen(false)} title={cashModalTitle} size="md">
          {cashFilter === 'all' && (
            <div className="grid grid-cols-2 gap-2 mb-4">
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
          <div className="space-y-2">
            {cashFilteredPayments.length === 0 ? (
              <p className="text-sm text-[#9ca3af] text-center py-6">Aucun paiement sur cette période.</p>
            ) : (
              cashFilteredPayments.map((p, i) => <ClosingPaymentRow key={i} payment={p} />)
            )}
          </div>
        </Modal>
      )}

      {/* Mes Objectifs Setter */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-bold text-[#1a1a1a] mb-5">Mes Objectifs Setter</h2>
        {commLoading ? <SkeletonCard /> : (
          <div className="space-y-4">
            {[
              { type: 'setter_showup_target',    label: 'Show-ups',              current: commData?.showupCount    ?? 0, isCurrency: false },
              { type: 'setter_confirm_target',   label: 'Confirmations auto',    current: commData?.autoCount      ?? 0, isCurrency: false },
              { type: 'setter_rebook_target',    label: 'Rebookings',            current: commData?.rebookingCount ?? 0, isCurrency: false },
              { type: 'setter_sales_target',     label: 'Ventes',                current: commData?.wonCount       ?? 0, isCurrency: false },
              { type: 'setter_commission_target',label: 'Commissions totales ($)',current: commData?.totalPay       ?? 0, isCurrency: true  },
            ].map(({ type, label, current, isCurrency }) => {
              const obj = setterMonthObjs.find(o => o.type === type)
              const target = obj?.target_value ?? 0
              const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
              const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
              const fmt = v => isCurrency ? fmtCAD(v) : Number(v).toLocaleString('fr-CA')
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-semibold text-[#1a1a1a]">{label}</p>
                    <p className="text-sm font-bold text-[#1a1a1a]">
                      {fmt(current)}
                      {target > 0 && <span className="text-[#9ca3af] font-normal"> / {fmt(target)}</span>}
                    </p>
                  </div>
                  {target > 0 ? (
                    <ProgressBar pct={pct} color={color} />
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5" />
                      <span className="text-xs text-[#9ca3af] w-20 text-right">Pas d'objectif</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

    </Layout>
  )
}
