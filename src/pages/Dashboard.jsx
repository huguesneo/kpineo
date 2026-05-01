import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import BonusTracker from '../components/career/BonusTracker'
import { SkeletonCard, SkeletonTable } from '../components/shared/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useClinicObjectives } from '../hooks/useObjectives'
import { useClinicKPIEntries } from '../hooks/useKPIs'
import { useQuarterlyBonus } from '../hooks/useCareerPlan'
import { supabase } from '../lib/supabase'
import {
  format, startOfMonth, endOfMonth, startOfYear, endOfYear,
  parseISO, differenceInCalendarMonths,
} from 'date-fns'
import { fr } from 'date-fns/locale'

const ROLE_LABELS = { naturopathe: 'Naturopathe', closer: 'Closer', setter: 'Setter', admin: 'Admin' }

// ─── Shared helpers ───────────────────────────────────────────
function StatCard({ label, value, sub, color = '#00bbb1', icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">{label}</p>
          <p className="text-3xl font-bold text-[#1a1a1a]">{value}</p>
          {sub && <p className="text-xs text-[#6b7280] mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '18' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
    </Card>
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

function statusBadge(pct) {
  if (pct >= 80) return <Badge variant="success">Excellent</Badge>
  if (pct >= 50) return <Badge variant="warning">En bonne voie</Badge>
  return <Badge variant="danger">Attention</Badge>
}

// ─── Clinic Progress Components ───────────────────────────────
function ClinicAnnualCard({ objectives, entries }) {
  const year = new Date().getFullYear()
  const activeObj = objectives.find(o =>
    o.type === 'clinic_revenue_annual' &&
    new Date(o.period_start).getFullYear() <= year &&
    new Date(o.period_end).getFullYear() >= year
  )

  if (!activeObj) {
    return (
      <Card className="p-6 flex items-center justify-center min-h-[160px]">
        <div className="text-center">
          <p className="text-sm font-semibold text-[#6b7280]">Aucun objectif annuel défini</p>
          <p className="text-xs text-[#9ca3af] mt-1">Ajoutez-en un dans la page KPIs</p>
        </div>
      </Card>
    )
  }

  const ytd = entries
    .filter(e => e.kpi_type === 'clinic_revenue')
    .reduce((sum, e) => sum + Number(e.value), 0)

  const pct = Math.min(100, Math.round((ytd / activeObj.target_value) * 100))
  const remaining = Math.max(0, activeObj.target_value - ytd)
  const monthsElapsed = new Date().getMonth() + 1
  const monthsRemaining = Math.max(1, 12 - new Date().getMonth())
  const neededPerMonth = remaining / monthsRemaining

  const barColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#00bbb1'

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-1">
            Revenu clinique — Objectif annuel {year}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#1a1a1a]">
              {ytd.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
            </span>
            <span className="text-sm text-[#6b7280]">
              / {Number(activeObj.target_value).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
            </span>
          </div>
          <p className="text-xs text-[#6b7280] mt-1.5">
            {monthsElapsed} mois écoulé{monthsElapsed > 1 ? 's' : ''} · encore {monthsRemaining} mois
          </p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold" style={{ color: barColor }}>{pct}%</p>
          <p className="text-xs text-[#6b7280] font-semibold mt-0.5">atteint</p>
        </div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
        <div
          className="h-3 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}aa, ${barColor})` }}
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#f5f5f7]">
        <div className="text-center">
          <p className="text-xs text-[#6b7280] font-semibold">Restant à générer</p>
          <p className="text-sm font-bold text-[#1a1a1a]">
            {remaining.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="w-px h-8 bg-[#e5e7eb]" />
        <div className="text-center">
          <p className="text-xs text-[#6b7280] font-semibold">Objectif mensuel requis</p>
          <p className="text-sm font-bold" style={{ color: barColor }}>
            {neededPerMonth.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}/mois
          </p>
        </div>
        <div className="w-px h-8 bg-[#e5e7eb]" />
        <div className="text-center">
          <p className="text-xs text-[#6b7280] font-semibold">Moy. mensuelle actuelle</p>
          <p className="text-sm font-bold text-[#1a1a1a]">
            {(ytd / monthsElapsed).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}/mois
          </p>
        </div>
      </div>
    </Card>
  )
}

function ClinicMonthlyCard({ objectives, entries }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const activeObj = objectives.find(o =>
    o.type === 'clinic_revenue' &&
    o.period_start <= today && o.period_end >= today
  ) || objectives.find(o => o.type === 'clinic_revenue')

  if (!activeObj) {
    return (
      <Card className="p-5 flex items-center justify-center min-h-[140px]">
        <div className="text-center">
          <p className="text-sm font-semibold text-[#6b7280]">Aucun objectif mensuel</p>
          <p className="text-xs text-[#9ca3af] mt-1">Ajoutez-en un dans KPIs</p>
        </div>
      </Card>
    )
  }

  const total = entries
    .filter(e => e.kpi_type === 'clinic_revenue')
    .reduce((sum, e) => sum + Number(e.value), 0)

  const pct = Math.min(100, Math.round((total / activeObj.target_value) * 100))
  const barColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#00bbb1'

  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dayOfMonth = new Date().getDate()
  const daysLeft = daysInMonth - dayOfMonth

  return (
    <Card className="p-5">
      <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
        Revenu clinique — {format(new Date(), 'MMMM yyyy', { locale: fr })}
      </p>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-bold text-[#1a1a1a]">
          {total.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
        </span>
        <span className="text-sm text-[#6b7280]">
          / {Number(activeObj.target_value).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
        </span>
        <span className="ml-auto text-2xl font-bold" style={{ color: barColor }}>{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5 mb-3">
        <div
          className="h-2.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}aa, ${barColor})` }}
        />
      </div>
      <p className="text-xs text-[#6b7280]">
        {format(parseISO(activeObj.period_start), 'd MMM', { locale: fr })} → {format(parseISO(activeObj.period_end), 'd MMM', { locale: fr })}
        {daysLeft > 0 && <span className="ml-2 font-semibold">· {daysLeft} jour{daysLeft > 1 ? 's' : ''} restant{daysLeft > 1 ? 's' : ''}</span>}
      </p>
    </Card>
  )
}

// ─── Admin Dashboard ──────────────────────────────────────────
function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, naturopathes: 0, closers: 0, eodToday: 0 })
  const [members, setMembers] = useState([])
  const [roleFilter, setRoleFilter] = useState('tous')

  const { objectives: clinicObjectives } = useClinicObjectives()

  const monthDates = {
    from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    to: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  }
  const yearDates = {
    from: format(startOfYear(new Date()), 'yyyy-MM-dd'),
    to: format(endOfYear(new Date()), 'yyyy-MM-dd'),
  }
  const { entries: clinicEntriesMonth } = useClinicKPIEntries(monthDates)
  const { entries: clinicEntriesYear } = useClinicKPIEntries(yearDates)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const { from: monthStart, to: monthEnd } = monthDates

    const [profilesRes, eodRes, kpiRes, objRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true).neq('role', 'admin'),
      supabase.from('end_of_day_reports').select('id', { count: 'exact', head: true }).eq('report_date', today),
      supabase.from('kpi_entries').select('user_id, kpi_type, value').eq('scope', 'individual').gte('entry_date', monthStart).lte('entry_date', monthEnd),
      supabase.from('objectives').select('*').eq('scope', 'individual').lte('period_start', monthEnd).gte('period_end', monthStart),
    ])

    const profiles = profilesRes.data || []
    const kpiEntries = kpiRes.data || []
    const objectives = objRes.data || []

    setStats({
      total: profiles.length,
      naturopathes: profiles.filter(p => p.role === 'naturopathe').length,
      closers: profiles.filter(p => p.role === 'closer').length,
      eodToday: eodRes.count || 0,
    })

    const membersWithProgress = profiles.map(profile => {
      const userObjectives = objectives.filter(o => o.user_id === profile.id)
      const userKpis = kpiEntries.filter(k => k.user_id === profile.id)
      let totalPct = 0, count = 0
      userObjectives.forEach(obj => {
        const sum = userKpis.filter(k => k.kpi_type === obj.type).reduce((a, k) => a + Number(k.value), 0)
        if (obj.target_value > 0) { totalPct += Math.min(100, Math.round((sum / obj.target_value) * 100)); count++ }
      })
      return { ...profile, progress: count > 0 ? Math.round(totalPct / count) : null }
    })

    setMembers(membersWithProgress)
    setLoading(false)
  }

  const filteredMembers = roleFilter === 'tous' ? members : members.filter(m => m.role === roleFilter)
  const roles = ['tous', 'naturopathe', 'closer', 'setter']

  return (
    <Layout>
      <Header title="Dashboard" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? [...Array(4)].map((_, i) => <SkeletonCard key={i} />) : <>
          <StatCard
            label="Membres actifs"
            value={stats.total}
            color="#00bbb1"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          />
          <StatCard
            label="Naturopathes"
            value={stats.naturopathes}
            color="#8b5cf6"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>}
          />
          <StatCard
            label="Closers actifs"
            value={stats.closers}
            color="#3b82f6"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            label="Rapports EOD aujourd'hui"
            value={stats.eodToday}
            color="#10b981"
            sub={`/ ${stats.total} attendus`}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          />
        </>}
      </div>

      {/* Clinic Revenue */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Revenu clinique</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ClinicAnnualCard objectives={clinicObjectives} entries={clinicEntriesYear} />
          </div>
          <div>
            <ClinicMonthlyCard objectives={clinicObjectives} entries={clinicEntriesMonth} />
          </div>
        </div>
      </div>

      {/* Team table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-[#1a1a1a]">Performance de l'équipe</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">{format(new Date(), 'MMMM yyyy', { locale: fr })} — objectifs individuels</p>
          </div>
          <div className="flex gap-1.5">
            {roles.map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  roleFilter === r ? 'bg-[#00bbb1] text-white' : 'bg-gray-100 text-[#6b7280] hover:bg-gray-200'
                }`}
              >
                {r === 'tous' ? 'Tous' : ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {loading ? <SkeletonTable rows={5} /> : filteredMembers.length === 0 ? (
          <p className="text-sm text-[#6b7280] py-4">Aucun membre trouvé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e5e7eb]">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Membre</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Rôle</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Progression</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Statut</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Dossier</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map(m => (
                  <tr key={m.id} className="border-b border-[#f5f5f7] hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-sm flex-shrink-0">
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-[#1a1a1a]">{m.full_name}</p>
                          <p className="text-xs text-[#9ca3af]">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <Badge variant={m.role}>{ROLE_LABELS[m.role]}</Badge>
                    </td>
                    <td className="py-3.5 px-3 min-w-[160px]">
                      {m.progress !== null
                        ? <ProgressBar pct={m.progress} color={m.progress >= 80 ? '#10b981' : m.progress >= 50 ? '#f59e0b' : '#ef4444'} />
                        : <span className="text-xs text-[#9ca3af]">Aucun objectif</span>
                      }
                    </td>
                    <td className="py-3.5 px-3">
                      {m.progress !== null ? statusBadge(m.progress) : <span className="text-[#9ca3af]">—</span>}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <button
                        onClick={() => navigate(`/membres/${m.id}`)}
                        className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors"
                      >
                        Voir →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Layout>
  )
}

// ─── Member Dashboard ─────────────────────────────────────────
function MemberDashboard() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pendingTasks: 0, completedToday: 0, kpiThisMonth: 0 })
  const [myObjectives, setMyObjectives] = useState([])
  const [myKpiEntries, setMyKpiEntries] = useState([])

  const { objectives: clinicObjectives } = useClinicObjectives()
  const monthDates = {
    from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    to: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  }
  const { entries: clinicEntriesMonth } = useClinicKPIEntries(monthDates)
  const { bonus, achievement, loading: bonusLoading, quarterStart, quarterEnd } = useQuarterlyBonus(profile?.id, profile?.base_salary)

  useEffect(() => {
    if (!profile?.id) return
    loadMemberData()
  }, [profile?.id])

  async function loadMemberData() {
    setLoading(true)
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')

    const [tasksRes, kpiRes, objRes] = await Promise.all([
      supabase.from('tasks').select('id, is_completed, completed_at').eq('user_id', profile.id),
      supabase.from('kpi_entries').select('user_id, kpi_type, value').eq('user_id', profile.id).eq('scope', 'individual').gte('entry_date', monthStart).lte('entry_date', monthEnd),
      supabase.from('objectives').select('*').eq('user_id', profile.id).eq('scope', 'individual').lte('period_start', monthEnd).gte('period_end', monthStart),
    ])

    const tasks = tasksRes.data || []
    const kpis = kpiRes.data || []
    const objs = objRes.data || []

    const completedToday = tasks.filter(t =>
      t.is_completed && t.completed_at && new Date(t.completed_at).toDateString() === new Date().toDateString()
    ).length

    setStats({
      pendingTasks: tasks.filter(t => !t.is_completed).length,
      completedToday,
      kpiThisMonth: kpis.length,
    })
    setMyObjectives(objs)
    setMyKpiEntries(kpis)
    setLoading(false)
  }

  function calcProgress(obj) {
    const sum = myKpiEntries.filter(k => k.kpi_type === obj.type).reduce((a, k) => a + Number(k.value), 0)
    return obj.target_value > 0 ? Math.min(100, Math.round((sum / obj.target_value) * 100)) : 0
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const activeObjectives = myObjectives.filter(o => o.period_end >= today)

  return (
    <Layout>
      <Header title="Mon tableau de bord" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {loading ? [...Array(3)].map((_, i) => <SkeletonCard key={i} />) : <>
          <StatCard label="Tâches en attente" value={stats.pendingTasks} color="#00bbb1"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
          />
          <StatCard label="Complétées aujourd'hui" value={stats.completedToday} color="#10b981"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard label="KPIs soumis ce mois" value={stats.kpiThisMonth} color="#8b5cf6"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" /></svg>}
          />
        </>}
      </div>

      {/* Boni trimestriel */}
      {profile?.base_salary && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Mon boni trimestriel</h2>
          <BonusTracker
            bonus={bonus}
            achievement={achievement}
            loading={bonusLoading}
            quarterStart={quarterStart}
            quarterEnd={quarterEnd}
            baseSalary={profile?.base_salary}
          />
        </div>
      )}

      {/* Revenu clinique mensuel */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Revenu clinique</h2>
        <ClinicMonthlyCard objectives={clinicObjectives} entries={clinicEntriesMonth} />
      </div>

      {/* Mes objectifs */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Mes objectifs du mois</h2>
        {loading ? <SkeletonTable rows={3} /> : activeObjectives.length === 0 ? (
          <p className="text-sm text-[#6b7280]">Aucun objectif actif ce mois-ci.</p>
        ) : (
          <div className="space-y-4">
            {activeObjectives.map(obj => {
              const pct = calcProgress(obj)
              const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
              return (
                <div key={obj.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-semibold text-[#1a1a1a]">{obj.type.replace(/_/g, ' ')}</p>
                    <p className="text-sm font-bold text-[#6b7280]">{obj.target_value.toLocaleString('fr-CA')}</p>
                  </div>
                  <ProgressBar pct={pct} color={color} />
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </Layout>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  if (!profile) return null
  return profile.role === 'admin' ? <AdminDashboard /> : <MemberDashboard />
}
