import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Button from '../components/shared/Button'
import Modal from '../components/shared/Modal'
import { SkeletonCard } from '../components/shared/Skeleton'
import SetterEODForm, { SetterEODHistoryItem } from '../components/eod/SetterEODForm'
import SetterObjectivesPanel from '../components/career/SetterObjectivesPanel'
import KPIModal from '../components/kpis/KPIModal'
import { useAuth } from '../context/AuthContext'
import { useSetterCommissions } from '../hooks/useSetterCommissions'
import { useObjectives } from '../hooks/useObjectives'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../hooks/usePayPeriod'
import { useCloserCashCollected } from '../hooks/useCloserData'
import { useKPIEntries, useEODReports, KPI_TYPE_LABELS } from '../hooks/useKPIs'
import { useCareerPlan } from '../hooks/useCareerPlan'

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

// ─── Onglets Mon Espace ───────────────────────────────────────

function GenericEODItem({ report }) {
  const [expanded, setExpanded] = useState(false)
  const dataKeys = Object.keys(report.data || {})
  return (
    <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
        <div>
          <p className="text-sm font-semibold text-[#1a1a1a]">Rapport du {format(parseISO(report.report_date), 'd MMMM yyyy', { locale: fr })}</p>
          <p className="text-xs text-[#6b7280]">Soumis à {format(new Date(report.submitted_at), 'HH:mm')}</p>
        </div>
        <svg className={`w-4 h-4 text-[#6b7280] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 py-3 bg-gray-50 border-t border-[#e5e7eb]">
          {dataKeys.length === 0 ? <p className="text-sm text-[#6b7280]">Aucune donnée.</p> : (
            <div className="flex flex-wrap gap-4">
              {dataKeys.map(k => (
                <div key={k} className="text-sm">
                  <span className="text-[#6b7280] font-semibold">{k} : </span>
                  <span className="font-bold text-[#1a1a1a]">{String(report.data[k])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EODItem({ report }) {
  if (report.role === 'setter') return <SetterEODHistoryItem report={report} />
  return <GenericEODItem report={report} />
}

function KPIsTab({ userId, userRole }) {
  const [kpiModalOpen, setKpiModalOpen] = useState(false)
  const { entries, loading: kpiLoading, refetch: refetchKPIs } = useKPIEntries({ userId })
  const { reports, loading: eodLoading } = useEODReports({ userId })
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[#1a1a1a]">Mes entrées KPI</h3>
          <Button size="sm" onClick={() => setKpiModalOpen(true)}>+ Ajouter</Button>
        </div>
        <KPIModal isOpen={kpiModalOpen} onClose={() => setKpiModalOpen(false)} userId={userId} userRole={userRole} onCreated={refetchKPIs} />
        {kpiLoading ? <SkeletonCard /> : entries.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucune entrée KPI.</p></Card>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-[#e5e7eb]">
                <div>
                  <p className="text-sm font-semibold text-[#1a1a1a]">{KPI_TYPE_LABELS[entry.kpi_type] || entry.kpi_type}</p>
                  <p className="text-xs text-[#6b7280]">{format(parseISO(entry.entry_date), 'd MMM yyyy', { locale: fr })}</p>
                  {entry.notes && <p className="text-xs text-[#6b7280]">{entry.notes}</p>}
                </div>
                <p className="text-lg font-bold text-[#1a1a1a]">{Number(entry.value).toLocaleString('fr-CA')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="font-bold text-[#1a1a1a] mb-3">Mes rapports End of Day</h3>
        {eodLoading ? <SkeletonCard /> : reports.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucun rapport soumis.</p></Card>
        ) : (
          <div className="space-y-2">
            {reports.map(r => <EODItem key={r.id} report={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function CareerPlanTab({ profile }) {
  const { plans, loading } = useCareerPlan(profile.id)
  const currentYear = new Date().getFullYear()
  const baseSalary  = profile.base_salary  ?? null
  const annualBonus = profile.annual_bonus  ?? null
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🏆</span>
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Boni annuel cible</h3>
            <p className="text-xs text-[#9ca3af]">Divisé en 4 trimestres · paiement proportionnel à l'atteinte (min 80 %)</p>
          </div>
        </div>
        {annualBonus ? (
          <>
            <p className="text-3xl font-black text-[#1a1a1a] mt-3">{fmtCAD(annualBonus)}</p>
            <p className="text-xs text-[#6b7280] mt-1">
              Par trimestre (à 100 %) : {fmtCAD(Number(annualBonus) / 4)}
              {' · '}Ex. à 112 % : {fmtCAD(Math.round(Number(annualBonus) / 4 * 1.12))}
            </p>
          </>
        ) : (
          <p className="text-sm text-[#9ca3af] mt-2">Non défini pour le moment.</p>
        )}
      </Card>
      <Card className="p-5">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-[#00bbb1]/10 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">💼</span>
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Salaire de base annuel</h3>
            <p className="text-xs text-[#9ca3af]">Rémunération fixe annuelle</p>
          </div>
        </div>
        {baseSalary ? (
          <p className="text-3xl font-black text-[#1a1a1a] mt-3">{fmtCAD(baseSalary)}</p>
        ) : (
          <p className="text-sm text-[#9ca3af] mt-2">Non défini pour le moment.</p>
        )}
      </Card>
      <Card className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🚀</span>
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Progression salariale</h3>
            <p className="text-xs text-[#9ca3af]">Progression salariale prévue année par année</p>
          </div>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-[#9ca3af] py-2">Aucun plan défini pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`px-4 py-3 rounded-xl border transition-all ${
                  plan.year === currentYear ? 'border-[#00bbb1]/40 bg-[#00bbb1]/5'
                  : plan.year < currentYear ? 'border-[#e5e7eb] bg-gray-50 opacity-70'
                  : 'border-[#e5e7eb] bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-[#1a1a1a]">{plan.year}</p>
                      {plan.year === currentYear && (
                        <span className="text-[10px] font-semibold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">Année en cours</span>
                      )}
                      {plan.year > currentYear && (
                        <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">À venir</span>
                      )}
                    </div>
                    {plan.notes && (
                      <div className="mt-1.5 flex items-start gap-1.5">
                        <svg className="w-3 h-3 text-[#00bbb1] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        <p className="text-xs text-[#6b7280] leading-relaxed">{plan.notes}</p>
                      </div>
                    )}
                  </div>
                  <p className="font-black text-[#1a1a1a] text-sm flex-shrink-0">{fmtCAD(plan.planned_salary)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

const SETTER_TABS = ['Activité', 'Mes KPIs', 'Plan de carrière']

export default function Setter() {
  const { profile, hasCloserRole } = useAuth()
  const { config: payConfig } = usePayPeriodConfig()
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const payPeriod = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null

  const [activeTab, setActiveTab] = useState(0)
  const [periodType, setPeriodType] = useState('paie')
  const [customStart, setCustomStart] = useState(todayStr)
  const [customEnd, setCustomEnd]   = useState(todayStr)

  const [setterMonth, setSetterMonth] = useState(now.getMonth() + 1)
  const [setterYear, setSetterYear]   = useState(now.getFullYear())

  const [cashFilter, setCashFilter]     = useState('all')
  const [cashModalOpen, setCashModalOpen] = useState(false)

  let startDate = periodType === 'paie' ? (payPeriod?.start || todayStr) : (customStart || todayStr)
  let endDate   = periodType === 'paie' ? (payPeriod?.end   || todayStr) : (customEnd   || todayStr)

  const { data: commData, loading: commLoading, refresh: refreshComm } = useSetterCommissions(profile?.full_name, startDate, endDate)
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
      <Header title="Mon Espace" />

      {/* ── Onglets ── */}
      <div className="flex gap-1 border-b border-[#e5e7eb] mb-6">
        {SETTER_TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === i ? 'border-[#00bbb1] text-[#00bbb1]' : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && (<>
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
              onChange={e => {
                const v = e.target.value
                setCustomStart(v)
                if (v > customEnd) setCustomEnd(v)
                setPeriodType('custom')
              }}
              className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer"
            />
            <span className="text-[#9ca3af] text-xs">→</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => {
                const v = e.target.value
                setCustomEnd(v)
                if (v < customStart) setCustomStart(v)
                setPeriodType('custom')
              }}
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
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">Commission Setting</h2>
          <button
            onClick={refreshComm}
            disabled={commLoading}
            className="p-1 rounded-md text-[#9ca3af] hover:text-[#00bbb1] hover:bg-[#00bbb1]/10 transition-all disabled:opacity-40"
            title="Actualiser"
          >
            <svg className={`w-3.5 h-3.5 ${commLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
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

      </>)}
      {activeTab === 1 && <KPIsTab userId={profile.id} userRole={profile.role} />}
      {activeTab === 2 && <CareerPlanTab profile={profile} />}

    </Layout>
  )
}
