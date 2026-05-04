import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import Button from '../components/shared/Button'
import Modal from '../components/shared/Modal'
import Input from '../components/shared/Input'
import TaskSection from '../components/tasks/TaskSection'
import KPIModal from '../components/kpis/KPIModal'
import CareerPlanEditor from '../components/career/CareerPlanEditor'
import BonusTracker from '../components/career/BonusTracker'
import QuarterlyPanel from '../components/career/QuarterlyPanel'
import { SkeletonCard } from '../components/shared/Skeleton'
import MonthNavigator from '../components/shared/MonthNavigator'
import { useMember } from '../hooks/useMembers'
import { useObjectives, createObjective, deleteObjective, OBJECTIVE_TYPES_BY_ROLE, OBJECTIVE_TYPE_LABELS } from '../hooks/useObjectives'
import { useTasks } from '../hooks/useTasks'
import { useKPIEntries, useEODReports, KPI_TYPE_LABELS } from '../hooks/useKPIs'
import { useQuarterlyBonus } from '../hooks/useCareerPlan'
import { useQBMemberRevenue, useQBMemberRevenueForMonth } from '../hooks/useQuickBooks'
import { useUserPoints, usePointsTransactions, usePointsHistory } from '../hooks/usePoints'
import { format, isAfter, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const ROLE_LABELS = { naturopathe: 'Naturopathe', closer: 'Closer', setter: 'Setter', admin: 'Admin' }
const TABS = ['Objectifs', 'Tâches', 'KPIs & Rapports', 'Plan de carrière', 'Points']

function fmt(n) {
  return Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const QB_ROLE_LABELS = {
  naturopathe: 'Thérapeute',
  closer: 'Closer',
  setter: 'Setter',
}

const ROLE_TO_QB = { naturopathe: 'naturopathe', closer: 'closer', setter: 'setter' }

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function QBRoleCard({ label, data, loading, syncLabel, isCurrentMonth = true, histData, histLoading, selectedMonth, selectedYear }) {
  if (!isCurrentMonth) {
    if (!histLoading && (!histData || histData.monthly === 0)) return null
    return (
      <div className="mb-4">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">Champ QB « {label} »</p>
        <Card className="p-5 w-full flex flex-col">
          {histLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-3 bg-gray-100 rounded w-1/3" />
              <div className="h-8 bg-gray-100 rounded w-1/2" />
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-1">
                {MONTHS_FR[selectedMonth - 1]} {selectedYear}
              </p>
              <p className="text-3xl font-bold text-[#1a1a1a]">{fmt(histData?.monthly ?? 0)}</p>
            </>
          )}
        </Card>
      </div>
    )
  }

  if (!loading && (!data || (data.annual === 0 && data.monthly === 0))) return null

  const monthly = Number(data?.monthly ?? 0)
  const prevMonthly = Number(data?.prevMonthly ?? 0)
  const annual = Number(data?.annual ?? 0)
  const vsLastMonth = prevMonthly > 0
    ? Math.round(((monthly - prevMonthly) / prevMonthly) * 100)
    : null

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">
        Champ QB « {label} »
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2 flex">
          <Card className="p-5 w-full flex flex-col">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-1/3" />
                <div className="h-8 bg-gray-100 rounded w-1/2" />
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-1">
                  Revenus {new Date().getFullYear()}
                </p>
                <p className="text-3xl font-bold text-[#1a1a1a] mb-1">{fmt(annual)}</p>
                <p className="text-xs text-[#6b7280] mb-4">
                  Janvier → {format(new Date(), 'MMMM yyyy', { locale: fr })}
                </p>
                <div className="flex items-center gap-4 pt-3 border-t border-[#f5f5f7] mt-auto">
                  <div>
                    <p className="text-xs text-[#6b7280] font-semibold">Mois actuel</p>
                    <p className="text-sm font-bold text-[#1a1a1a]">{fmt(monthly)}</p>
                  </div>
                  <div className="w-px h-8 bg-[#e5e7eb]" />
                  <div>
                    <p className="text-xs text-[#6b7280] font-semibold">Mois précédent</p>
                    <p className="text-sm font-bold text-[#1a1a1a]">{fmt(prevMonthly)}</p>
                  </div>
                  {vsLastMonth !== null && (
                    <>
                      <div className="w-px h-8 bg-[#e5e7eb]" />
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${vsLastMonth >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                        {vsLastMonth >= 0 ? '↑' : '↓'} {Math.abs(vsLastMonth)}% vs mois préc.
                      </span>
                    </>
                  )}
                </div>
                {/* Détail annuel : factures impayées */}
                {data?.annualUnpaid != null && (
                  <div className="mt-3 pt-3 border-t border-[#f5f5f7] grid grid-cols-3 gap-2">
                    {[
                      { label: 'Revenus facturés', value: annual, color: 'text-[#1a1a1a]' },
                      { label: 'Fact. impayées', value: data?.annualUnpaid, color: 'text-amber-600' },
                      { label: 'Déposés', value: data?.annualDeposited, color: 'text-emerald-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-gray-50 rounded-xl px-2 py-2 text-center">
                        <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-0.5">{label}</p>
                        <p className={`text-sm font-bold ${color}`}>{fmt(value)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {syncLabel && <p className="text-xs text-[#9ca3af] mt-3 text-right">{syncLabel}</p>}
              </>
            )}
          </Card>
        </div>
        <div className="flex">
          <Card className="p-5 w-full flex flex-col">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-2/3" />
                <div className="h-8 bg-gray-100 rounded w-1/2" />
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
                  {format(new Date(), 'MMMM yyyy', { locale: fr })}
                </p>
                <p className="text-2xl font-bold text-[#1a1a1a] mb-2">{fmt(monthly)}</p>
                {vsLastMonth !== null && (
                  <span className={`self-start text-xs font-bold px-2 py-0.5 rounded-full mb-3 ${vsLastMonth >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {vsLastMonth >= 0 ? '↑' : '↓'} {Math.abs(vsLastMonth)}% vs mois préc.
                  </span>
                )}
                <div className="mt-auto">
                  <p className="text-xs text-[#6b7280] font-semibold">Mois précédent</p>
                  <p className="text-sm font-bold text-[#1a1a1a]">{fmt(prevMonthly)}</p>
                </div>
                {/* Détail mensuel : factures impayées */}
                {data?.monthlyUnpaid != null && (
                  <div className="mt-3 pt-3 border-t border-[#f5f5f7] grid grid-cols-3 gap-2">
                    {[
                      { label: 'Facturé', value: monthly, color: 'text-[#1a1a1a]' },
                      { label: 'Impayé', value: data?.monthlyUnpaid, color: 'text-amber-600' },
                      { label: 'Déposé', value: data?.monthlyDeposited, color: 'text-emerald-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-gray-50 rounded-xl px-2 py-2 text-center">
                        <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-0.5">{label}</p>
                        <p className={`text-sm font-bold ${color}`}>{fmt(value)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function MemberQBRevenue({ member, revenue, loading, refreshing, error, refetch }) {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()

  const firstName = member?.full_name?.trim().split(/\s+/)[0] ?? ''
  const { data: histData, loading: histLoading } = useQBMemberRevenueForMonth(
    firstName,
    isCurrentMonth ? null : selectedMonth,
    isCurrentMonth ? null : selectedYear
  )

  if (!firstName || member?.role === 'admin') return null
  if (!loading && !revenue && !error) return null

  if (error) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">Revenus QuickBooks</h2>
          <button onClick={refetch} className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95]">Réessayer</button>
        </div>
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          Erreur QB : {error} — prénom envoyé : « {firstName} »
        </div>
      </div>
    )
  }

  const syncLabel = revenue?.last_synced_at
    ? `QB · sync ${format(new Date(revenue.last_synced_at), 'd MMM à HH:mm', { locale: fr })}${revenue.from_cache ? ' · cache' : ''}`
    : null

  const hasAnyRevenue = revenue && (
    revenue.naturopathe?.annual > 0 || revenue.closer?.annual > 0 || revenue.setter?.annual > 0 ||
    revenue.naturopathe?.monthly > 0 || revenue.closer?.monthly > 0 || revenue.setter?.monthly > 0
  )

  const QB_TRACKED_ROLES = ['naturopathe', 'closer', 'setter']
  const isQBRole = QB_TRACKED_ROLES.includes(member?.role)

  if (!loading && revenue && !hasAnyRevenue && !isQBRole) return null

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">Revenus QuickBooks</h2>
          <MonthNavigator
            month={selectedMonth}
            year={selectedYear}
            onChange={(m, y) => { setSelectedMonth(m); setSelectedYear(y) }}
          />
        </div>
        {isCurrentMonth && (
          <button
            onClick={refetch}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] disabled:opacity-50 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Actualisation…' : 'Actualiser QB'}
          </button>
        )}
      </div>

      {Object.entries(QB_ROLE_LABELS).map(([roleKey, label]) => (
        <QBRoleCard
          key={roleKey}
          label={label}
          data={revenue?.[roleKey]}
          loading={loading}
          syncLabel={isCurrentMonth ? syncLabel : null}
          isCurrentMonth={isCurrentMonth}
          histData={histData?.[roleKey]}
          histLoading={histLoading}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
        />
      ))}

      {isCurrentMonth && !loading && revenue && !hasAnyRevenue && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          Prénom « {firstName} » introuvable dans QuickBooks. Vérifiez l'orthographe dans les reçus QB.
        </div>
      )}
    </div>
  )
}

function ObjectiveModal({ isOpen, onClose, userId, role, onCreated }) {
  const types = OBJECTIVE_TYPES_BY_ROLE[role] || []
  const [form, setForm] = useState({ type: types[0]?.value || '', target_value: '', period_start: '', period_end: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.type || !form.target_value || !form.period_start || !form.period_end) {
      setError('Tous les champs sont obligatoires.'); return
    }
    setLoading(true)
    const { error: err } = await createObjective({
      user_id: userId,
      type: form.type,
      target_value: Number(form.target_value),
      period_start: form.period_start,
      period_end: form.period_end,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setForm({ type: types[0]?.value || '', target_value: '', period_start: '', period_end: '' })
    onCreated?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter un objectif">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Type d'objectif</label>
          <select name="type" value={form.type} onChange={handleChange} className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]">
            {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <Input label="Valeur cible" name="target_value" type="number" min="0" value={form.target_value} onChange={handleChange} placeholder="Ex: 10000" />
        <Input label="Début de période" name="period_start" type="date" value={form.period_start} onChange={handleChange} />
        <Input label="Fin de période" name="period_end" type="date" value={form.period_end} onChange={handleChange} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Créer l'objectif</Button>
        </div>
      </form>
    </Modal>
  )
}

function ObjectivesTab({ member, qbRevenue }) {
  const firstName = member?.full_name?.trim().split(/\s+/)[0] ?? ''
  return (
    <QuarterlyPanel
      userId={member?.id}
      annualBonus={member?.annual_bonus}
      role={member?.role}
      qbRevenue={qbRevenue}
      isAdmin={true}
      firstName={firstName}
    />
  )
}

function TasksTab({ member, tasks, loading, refetch }) {
  return (
    <div className="space-y-4">
      {loading ? (
        <SkeletonCard />
      ) : (
        <>
          <TaskSection tasks={tasks} priority="prioritaire" userId={member?.id} onUpdate={refetch} isAdmin={true} />
          <TaskSection tasks={tasks} priority="secondaire" userId={member?.id} onUpdate={refetch} isAdmin={true} />
        </>
      )}
    </div>
  )
}

function EODReportItem({ report }) {
  const [expanded, setExpanded] = useState(false)
  const dataKeys = Object.keys(report.data || {})

  return (
    <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div>
          <p className="text-sm font-semibold text-[#1a1a1a]">
            Rapport du {format(parseISO(report.report_date), 'd MMMM yyyy', { locale: fr })}
          </p>
          <p className="text-xs text-[#6b7280]">Soumis à {format(new Date(report.submitted_at), 'HH:mm', { locale: fr })}</p>
        </div>
        <svg className={`w-4 h-4 text-[#6b7280] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 py-3 bg-gray-50 border-t border-[#e5e7eb]">
          {dataKeys.length === 0 ? (
            <p className="text-sm text-[#6b7280]">Aucune donnée.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {dataKeys.map(k => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-[#6b7280] font-semibold">{k} :</span>
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

function KPIsTab({ userId, userRole }) {
  const [period, setPeriod] = useState('mois')
  const [kpiModalOpen, setKpiModalOpen] = useState(false)
  const { entries, loading: kpiLoading, refetch: refetchKPIs } = useKPIEntries({ userId })
  const { reports, loading: eodLoading } = useEODReports({ userId })

  const periods = [
    { value: 'semaine', label: 'Semaine' },
    { value: 'mois', label: 'Mois' },
    { value: 'trimestre', label: 'Trimestre' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {periods.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              period === p.value ? 'bg-[#00bbb1] text-white' : 'bg-white text-[#6b7280] border border-[#e5e7eb] hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[#1a1a1a]">Entrées KPI</h3>
          <Button size="sm" onClick={() => setKpiModalOpen(true)}>+ Ajouter un KPI</Button>
        </div>
        <KPIModal
          isOpen={kpiModalOpen}
          onClose={() => setKpiModalOpen(false)}
          userId={userId}
          userRole={userRole}
          onCreated={refetchKPIs}
        />
        {kpiLoading ? <SkeletonCard /> : entries.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucune entrée KPI.</p></Card>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-[#e5e7eb]">
                <div>
                  <p className="text-sm font-semibold text-[#1a1a1a]">{KPI_TYPE_LABELS[entry.kpi_type] || entry.kpi_type}</p>
                  <p className="text-xs text-[#6b7280]">{format(parseISO(entry.entry_date), 'd MMM yyyy', { locale: fr })}</p>
                  {entry.notes && <p className="text-xs text-[#6b7280] mt-0.5">{entry.notes}</p>}
                </div>
                <p className="text-lg font-bold text-[#1a1a1a]">{entry.value.toLocaleString('fr-CA')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold text-[#1a1a1a] mb-3">Rapports End of Day</h3>
        {eodLoading ? <SkeletonCard /> : reports.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucun rapport soumis.</p></Card>
        ) : (
          <div className="space-y-2">
            {reports.map(r => <EODReportItem key={r.id} report={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function CareerTab({ member, onMemberUpdated, qbRevenue }) {
  const [baseSalary, setBaseSalary] = useState(member?.base_salary ?? null)
  const [annualBonus, setAnnualBonus] = useState(member?.annual_bonus ?? null)
  const { bonus, achievement, loading: bonusLoading, quarterStart, quarterEnd } = useQuarterlyBonus(member?.id, annualBonus, qbRevenue, member?.role)

  const roleField = ROLE_TO_QB[member?.role]
  const quarterlyRevenue = qbRevenue?.[roleField]?.quarterly ?? null
  const quarterlyUnpaid = qbRevenue?.[roleField]?.quarterlyUnpaid ?? null

  return (
    <div className="space-y-6">
      <BonusTracker
        bonus={bonus}
        achievement={achievement}
        loading={bonusLoading}
        quarterStart={quarterStart}
        quarterEnd={quarterEnd}
        annualBonus={annualBonus}
        quarterlyRevenue={quarterlyRevenue}
        quarterlyUnpaid={quarterlyUnpaid}
      />
      <CareerPlanEditor
        userId={member?.id}
        baseSalary={baseSalary}
        annualBonus={annualBonus}
        onBaseSalaryUpdated={val => { setBaseSalary(val); onMemberUpdated?.() }}
        onAnnualBonusUpdated={val => { setAnnualBonus(val); onMemberUpdated?.() }}
      />
    </div>
  )
}

const TX_TYPE_LABELS = {
  task_completed:   { label: 'Tâche complétée',  color: 'text-emerald-600', sign: '+' },
  task_uncompleted: { label: 'Tâche décochée',   color: 'text-red-500',     sign: '−' },
  redemption:       { label: 'Échange boutique', color: 'text-amber-600',   sign: '−' },
  refund:           { label: 'Remboursement',    color: 'text-emerald-600', sign: '+' },
  monthly_reset:    { label: 'Reset mensuel',    color: 'text-[#9ca3af]',   sign: '·' },
}

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

function safeFmt(dateStr) {
  try {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return format(d, "d MMM yyyy 'à' HH:mm", { locale: fr })
  } catch {
    return '—'
  }
}

function PointsTab({ userId }) {
  const { points, loading: ptsLoading }             = useUserPoints(userId)
  const { transactions, loading: txLoading }         = usePointsTransactions(userId, { limit: 30 })
  const { history, loading: histLoading }            = usePointsHistory(userId)
  const [renderError, setRenderError]                = useState(null)

  if (ptsLoading) return <SkeletonCard />
  if (renderError) return (
    <Card className="p-6 text-center">
      <p className="text-sm text-red-500 font-semibold">Erreur de chargement</p>
      <p className="text-xs text-[#9ca3af] mt-1">{renderError}</p>
    </Card>
  )

  const streak = points?.current_streak_days ?? 0

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Points total',  value: points?.points_total ?? 0,          color: '#1a1a1a' },
          { label: 'Ce mois',       value: `+${points?.points_current_month ?? 0}`, color: '#00bbb1' },
          { label: 'Streak',        value: `${streak} j${streak !== 1 ? '' : ''}`,  color: streak > 0 ? '#f97316' : '#9ca3af' },
        ].map(s => (
          <Card key={s.label} className="p-4 text-center">
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-semibold text-[#9ca3af] mt-0.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Monthly history */}
      {!histLoading && history.length > 0 && (
        <div>
          <h3 className="font-bold text-[#1a1a1a] mb-3">Historique mensuel</h3>
          <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
            <div className="divide-y divide-[#f3f4f6]">
              {history.map(h => (
                <div key={`${h.year}-${h.month}`} className="flex items-center px-4 py-3 gap-4">
                  <p className="text-sm font-semibold text-[#6b7280] w-20">
                    {MONTHS_SHORT[h.month - 1]} {h.year}
                  </p>
                  <div className="flex-1 flex items-center gap-4">
                    <span className="text-xs text-emerald-600 font-semibold">+{h.points_earned ?? 0} gagnés</span>
                    {(h.points_spent ?? 0) > 0 && (
                      <span className="text-xs text-amber-600 font-semibold">−{h.points_spent} dépensés</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[#1a1a1a]">{h.balance_end_of_month ?? 0} pts</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <h3 className="font-bold text-[#1a1a1a] mb-3">Transactions récentes</h3>
        {txLoading ? (
          <SkeletonCard />
        ) : transactions.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucune transaction.</p></Card>
        ) : (
          <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
            <div className="divide-y divide-[#f3f4f6]">
              {transactions.map(tx => {
                const cfg = TX_TYPE_LABELS[tx.type] ?? { label: tx.type, color: 'text-[#6b7280]', sign: '·' }
                const isPos = tx.amount > 0
                return (
                  <div key={tx.id} className="flex items-center px-4 py-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1a1a1a]">{cfg.label}</p>
                      <p className="text-[10px] text-[#9ca3af]">
                        {safeFmt(tx.created_at)}
                      </p>
                    </div>
                    <p className={`text-sm font-bold ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isPos ? '+' : ''}{tx.amount}
                    </p>
                    <p className="text-xs text-[#9ca3af] w-16 text-right">{tx.balance_after ?? '—'} pts</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MemberPointsBadge ────────────────────────────────────────────────────────
// Petit composant Realtime affiché dans le header du dossier membre.
function MemberPointsBadge({ userId }) {
  const { points, loading } = useUserPoints(userId)
  if (loading || !points) return null

  const total   = points.points_total         ?? 0
  const monthly = points.points_current_month ?? 0
  const pending = points.points_pending       ?? 0
  const streak  = points.current_streak_days  ?? 0

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[#f0fdfc] border border-[#00bbb1]/20 rounded-xl">
      <div className="text-center">
        <p className="text-sm font-black text-[#1a1a1a] leading-none">{total}</p>
        <p className="text-[9px] font-semibold text-[#9ca3af] uppercase tracking-wide">pts total</p>
      </div>
      <div className="h-5 w-px bg-[#00bbb1]/20" />
      <div className="text-center">
        <p className="text-sm font-black text-[#00bbb1] leading-none">+{monthly}</p>
        <p className="text-[9px] font-semibold text-[#9ca3af] uppercase tracking-wide">ce mois</p>
      </div>
      {pending > 0 && (
        <>
          <div className="h-5 w-px bg-[#00bbb1]/20" />
          <div className="text-center">
            <p className="text-sm font-black text-amber-500 leading-none">⏳ {pending}</p>
            <p className="text-[9px] font-semibold text-[#9ca3af] uppercase tracking-wide">en attente</p>
          </div>
        </>
      )}
      {streak > 0 && (
        <>
          <div className="h-5 w-px bg-[#00bbb1]/20" />
          <div className="text-center">
            <p className="text-sm font-black text-orange-500 leading-none">🔥 {streak}</p>
            <p className="text-[9px] font-semibold text-[#9ca3af] uppercase tracking-wide">streak</p>
          </div>
        </>
      )}
    </div>
  )
}

export default function MembreDossier() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(0)
  const { member, loading: memberLoading, refetch: refetchMember } = useMember(id)
  const { objectives, loading: objLoading, refetch: refetchObj } = useObjectives(id)
  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useTasks({ userId: id })

  const memberFirstName = member?.full_name?.trim().split(/\s+/)[0] ?? ''
  const { revenue: qbRevenue, loading: qbLoading, refreshing: qbRefreshing, error: qbError, refetch: qbRefetch } = useQBMemberRevenue(memberFirstName)

  if (memberLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </Layout>
    )
  }

  if (!member) {
    return (
      <Layout>
        <Card className="p-8 text-center">
          <p className="text-[#6b7280]">Membre introuvable.</p>
          <Button className="mt-4" variant="secondary" onClick={() => navigate('/membres')}>Retour</Button>
        </Card>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* En-tête */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/membres')} className="p-2 rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-14 h-14 rounded-2xl bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-xl">
            {member.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-[#1a1a1a]">{member.full_name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={member.role}>{ROLE_LABELS[member.role] || member.role}</Badge>
              <Badge variant={member.is_active ? 'success' : 'default'}>{member.is_active ? 'Actif' : 'Inactif'}</Badge>
            </div>
          </div>
          {member.role !== 'admin' && <MemberPointsBadge userId={id} />}
        </div>
      </div>

      {/* Revenus QuickBooks */}
      <MemberQBRevenue member={member} revenue={qbRevenue} loading={qbLoading} refreshing={qbRefreshing} error={qbError} refetch={qbRefetch} />

      {/* Onglets */}
      <div className="flex gap-1 border-b border-[#e5e7eb] mb-6">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === i
                ? 'border-[#00bbb1] text-[#00bbb1]'
                : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Contenu des onglets */}
      {activeTab === 0 && (
        <ObjectivesTab member={member} qbRevenue={qbRevenue} />
      )}
      {activeTab === 1 && (
        <TasksTab member={member} tasks={tasks} loading={tasksLoading} refetch={refetchTasks} />
      )}
      {activeTab === 2 && (
        <KPIsTab userId={id} userRole={member.role} />
      )}
      {activeTab === 3 && (
        <CareerTab member={member} onMemberUpdated={refetchMember} qbRevenue={qbRevenue} />
      )}
      {activeTab === 4 && (
        <PointsTab userId={id} />
      )}
    </Layout>
  )
}
