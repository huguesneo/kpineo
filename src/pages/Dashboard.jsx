import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import BonusTracker from '../components/career/BonusTracker'
import QuarterlyPanel from '../components/career/QuarterlyPanel'
import { SkeletonCard, SkeletonTable } from '../components/shared/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useClinicObjectives, useObjectives, OBJECTIVE_TYPE_LABELS } from '../hooks/useObjectives'
import { useSetterCommissions } from '../hooks/useSetterCommissions'
import { useClinicKPIEntries } from '../hooks/useKPIs'
import { useQuarterlyBonus } from '../hooks/useCareerPlan'
import { useQBRevenue, useQBMemberRevenue, useQBMemberRevenueForMonth, useQBRevenueForMonth } from '../hooks/useQuickBooks'
import MonthNavigator from '../components/shared/MonthNavigator'
import { supabase } from '../lib/supabase'
import {
  format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, parseISO,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../hooks/usePayPeriod'


const ROLE_LABELS = {
  naturopathe:    'Naturopathe',
  closer:         'Closer',
  setter:         'Setter',
  service_client: 'Service clients & gestion',
  resp_vente:     'Resp. équipe de vente',
  admin:          'Admin',
}

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
function ClinicAnnualCard({ objectives, revenue = 0, monthlyRevenue = 0, annualDeposited = null, lastSynced, fromCache }) {
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

  const ytd = Number(revenue ?? 0)
  const currentMonthRev = Number(monthlyRevenue ?? 0)

  const pct = Math.min(100, Math.round((ytd / activeObj.target_value) * 100))
  const remaining = Math.max(0, activeObj.target_value - ytd)
  const monthsElapsed = new Date().getMonth() + 1
  const monthsRemaining = Math.max(1, 12 - new Date().getMonth())
  const neededPerMonth = remaining / monthsRemaining

  // Exclude current (partial) month from the average
  const completedMonths = monthsElapsed - 1
  const avgMonthly = completedMonths > 0 ? (ytd - currentMonthRev) / completedMonths : null

  const barColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#00bbb1'

  return (
    <Card className="p-6 w-full flex flex-col">
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
            {avgMonthly !== null
              ? avgMonthly.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }) + '/mois'
              : '—'}
          </p>
        </div>
      </div>
      {/* Détail QB : 3 colonnes */}
      {annualDeposited != null && (
        <div className="mt-4 pt-4 border-t border-[#f5f5f7] grid grid-cols-3 gap-3">
          {[
            { label: 'Revenus totaux', value: ytd, color: 'text-[#1a1a1a]' },
            { label: 'Factures impayées', value: ytd - Number(annualDeposited), color: 'text-amber-600' },
            { label: 'Revenus déposés', value: annualDeposited, color: 'text-emerald-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl px-3 py-3 text-center">
              <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-base font-bold ${color}`}>{fmtCAD(value)}</p>
            </div>
          ))}
        </div>
      )}

      {lastSynced && (
        <p className="text-xs text-[#9ca3af] mt-3 text-right">
          QB · sync {format(new Date(lastSynced), 'd MMM à HH:mm', { locale: fr })}{fromCache ? ' · cache' : ''}
        </p>
      )}
    </Card>
  )
}

function ClinicMonthlyCard({ objectives, revenue = null, prevRevenue = null, annualRevenue = null, deposited = null, entries = [], lastSynced, fromCache, isCurrentMonth = true, histLoading = false, selectedMonth, selectedYear }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const year = new Date().getFullYear()
  const activeObj = objectives.find(o =>
    o.type === 'clinic_revenue' &&
    o.period_start <= today && o.period_end >= today
  ) || objectives.find(o => o.type === 'clinic_revenue')

  // Auto-target from annual objective when no manual monthly objective is set
  const annualObj = objectives.find(o =>
    o.type === 'clinic_revenue_annual' &&
    new Date(o.period_start).getFullYear() <= year &&
    new Date(o.period_end).getFullYear() >= year
  )
  const monthsRemaining = Math.max(1, 12 - new Date().getMonth())
  const autoTarget = (!activeObj && annualObj && annualRevenue !== null)
    ? Math.round(Math.max(0, annualObj.target_value - Number(annualRevenue)) / monthsRemaining)
    : null
  const effectiveTarget = activeObj?.target_value ?? autoTarget

  if (!isCurrentMonth) {
    const histTotal = revenue !== null ? Number(revenue) : null
    return (
      <Card className="p-5 w-full flex flex-col">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
          Revenu clinique — {MONTHS_FR_DASH[selectedMonth - 1]} {selectedYear}
        </p>
        {histLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-1/3" />
            <div className="h-8 bg-gray-100 rounded w-1/2" />
          </div>
        ) : (
          <p className="text-2xl font-bold text-[#1a1a1a]">
            {histTotal !== null
              ? histTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
              : '—'}
          </p>
        )}
      </Card>
    )
  }

  if (!effectiveTarget) {
    return (
      <Card className="p-5 flex items-center justify-center min-h-[140px]">
        <div className="text-center">
          <p className="text-sm font-semibold text-[#6b7280]">Aucun objectif mensuel</p>
          <p className="text-xs text-[#9ca3af] mt-1">Ajoutez-en un dans KPIs</p>
        </div>
      </Card>
    )
  }

  const total = revenue !== null
    ? Number(revenue)
    : entries.filter(e => e.kpi_type === 'clinic_revenue').reduce((sum, e) => sum + Number(e.value), 0)

  const pct = Math.min(100, Math.round((total / effectiveTarget) * 100))
  const barColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#00bbb1'

  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dayOfMonth = new Date().getDate()
  const daysLeft = daysInMonth - dayOfMonth

  const vsLastMonth = prevRevenue != null && prevRevenue > 0
    ? Math.round(((total - prevRevenue) / prevRevenue) * 100)
    : null

  return (
    <Card className="p-5 w-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
          Revenu clinique — {format(new Date(), 'MMMM yyyy', { locale: fr })}
        </p>
        {autoTarget !== null && (
          <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">Objectif auto</span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-bold text-[#1a1a1a]">
          {total.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
        </span>
        <span className="text-sm text-[#6b7280]">
          / {Number(effectiveTarget).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
        </span>
        <span className="ml-auto text-2xl font-bold" style={{ color: barColor }}>{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5 mb-3">
        <div
          className="h-2.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}aa, ${barColor})` }}
        />
      </div>
      <div className="flex items-center justify-between">
        {activeObj ? (
          <p className="text-xs text-[#6b7280]">
            {format(parseISO(activeObj.period_start), 'd MMM', { locale: fr })} → {format(parseISO(activeObj.period_end), 'd MMM', { locale: fr })}
            {daysLeft > 0 && <span className="ml-2 font-semibold">· {daysLeft} jour{daysLeft > 1 ? 's' : ''} restant{daysLeft > 1 ? 's' : ''}</span>}
          </p>
        ) : (
          <p className="text-xs text-[#9ca3af]">
            Calculé depuis l'objectif annuel · {daysLeft > 0 ? `${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}` : ''}
          </p>
        )}
        {vsLastMonth !== null && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${vsLastMonth >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            {vsLastMonth >= 0 ? '↑' : '↓'} {Math.abs(vsLastMonth)}% vs mois préc.
          </span>
        )}
      </div>
      {/* Détail QB mensuel : 3 colonnes */}
      {deposited != null && (
        <div className="mt-3 pt-3 border-t border-[#f5f5f7] grid grid-cols-3 gap-2">
          {[
            { label: 'Revenus totaux', value: total, color: 'text-[#1a1a1a]' },
            { label: 'Fact. impayées', value: total - Number(deposited), color: 'text-amber-600' },
            { label: 'Déposés', value: deposited, color: 'text-emerald-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl px-2 py-2 text-center">
              <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-0.5">{label}</p>
              <p className={`text-sm font-bold ${color}`}>{fmtCAD(value)}</p>
            </div>
          ))}
        </div>
      )}

      {lastSynced && (
        <p className="text-xs text-[#9ca3af] mt-auto pt-3 text-right">
          QB · sync {format(new Date(lastSynced), 'd MMM à HH:mm', { locale: fr })}{fromCache ? ' · cache' : ''}
        </p>
      )}
    </Card>
  )
}

// ─── Member QB Revenue (dashboard membre) ────────────────────
const QB_ROLE_LABELS = { naturopathe: 'Thérapeute', closer: 'Closer', setter: 'Setter' }

function fmtCAD(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
}

const MONTHS_FR_DASH = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function MemberQBRoleCard({ label, data, loading, isCurrentMonth = true, histData, histLoading, selectedMonth, selectedYear }) {
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
                {MONTHS_FR_DASH[selectedMonth - 1]} {selectedYear}
              </p>
              <p className="text-3xl font-bold text-[#1a1a1a]">{fmtCAD(histData?.monthly ?? 0)}</p>
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
  const vs = prevMonthly > 0 ? Math.round(((monthly - prevMonthly) / prevMonthly) * 100) : null

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
                <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-1">Revenus {new Date().getFullYear()}</p>
                <p className="text-3xl font-bold text-[#1a1a1a] mb-1">{fmtCAD(annual)}</p>
                <p className="text-xs text-[#6b7280] mb-4">Janvier → {format(new Date(), 'MMMM yyyy', { locale: fr })}</p>
                <div className="flex items-center gap-4 pt-3 border-t border-[#f5f5f7] mt-auto">
                  <div>
                    <p className="text-xs text-[#6b7280] font-semibold">Mois actuel</p>
                    <p className="text-sm font-bold text-[#1a1a1a]">{fmtCAD(monthly)}</p>
                  </div>
                  <div className="w-px h-8 bg-[#e5e7eb]" />
                  <div>
                    <p className="text-xs text-[#6b7280] font-semibold">Mois précédent</p>
                    <p className="text-sm font-bold text-[#1a1a1a]">{fmtCAD(prevMonthly)}</p>
                  </div>
                  {vs !== null && (
                    <>
                      <div className="w-px h-8 bg-[#e5e7eb]" />
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${vs >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                        {vs >= 0 ? '↑' : '↓'} {Math.abs(vs)}% vs mois préc.
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
                        <p className={`text-sm font-bold ${color}`}>{fmtCAD(value)}</p>
                      </div>
                    ))}
                  </div>
                )}
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
                <p className="text-2xl font-bold text-[#1a1a1a] mb-2">{fmtCAD(monthly)}</p>
                {vs !== null && (
                  <span className={`self-start text-xs font-bold px-2 py-0.5 rounded-full ${vs >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {vs >= 0 ? '↑' : '↓'} {Math.abs(vs)}% vs mois préc.
                  </span>
                )}
                <div className="mt-auto">
                  <p className="text-xs text-[#6b7280] font-semibold mt-3">Mois précédent</p>
                  <p className="text-sm font-bold text-[#1a1a1a]">{fmtCAD(prevMonthly)}</p>
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
                        <p className={`text-sm font-bold ${color}`}>{fmtCAD(value)}</p>
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

function MemberQBRevenueSection({ revenue, loading, refreshing, onRefetch, isCurrentMonth, histData, histLoading, selectedMonth, selectedYear, onMonthChange }) {
  const hasAny = revenue && Object.keys(QB_ROLE_LABELS).some(
    k => (revenue[k]?.annual ?? 0) > 0 || (revenue[k]?.monthly ?? 0) > 0
  )
  if (!loading && !hasAny) return null

  const syncLabel = revenue?.last_synced_at
    ? `QB · sync ${format(new Date(revenue.last_synced_at), 'd MMM à HH:mm', { locale: fr })}${revenue.from_cache ? ' · cache' : ''}`
    : null

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">Mes revenus QuickBooks</h2>
          <MonthNavigator month={selectedMonth} year={selectedYear} onChange={onMonthChange} />
        </div>
        <div className="flex items-center gap-3">
          {isCurrentMonth && syncLabel && <span className="text-xs text-[#9ca3af]">{syncLabel}</span>}
          {isCurrentMonth && (
            <button
              onClick={onRefetch}
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
      </div>
      {Object.entries(QB_ROLE_LABELS).map(([roleKey, label]) => (
        <MemberQBRoleCard
          key={roleKey}
          label={label}
          data={revenue?.[roleKey]}
          loading={loading}
          isCurrentMonth={isCurrentMonth}
          histData={histData?.[roleKey]}
          histLoading={histLoading}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
        />
      ))}
    </div>
  )
}

// ─── GHL Setter helpers (partagés AdminDashboard + MemberDashboard) ───────────
const GHL_PIPELINE_SETTING = '3C5ggTxPoWBmiFAPlCKn'
const GHL_STAGE_BOOKED  = 'Lead rencontre book'
const GHL_STAGE_SHOWUP  = 'Show-up Confirmé.'
const GHL_STAGE_BONUS   = 'bonus vente'
const GHL_ALL_STAGES    = [GHL_STAGE_BOOKED, GHL_STAGE_SHOWUP, GHL_STAGE_BONUS]
const GHL_SHOWUP_STAGES = [GHL_STAGE_SHOWUP, GHL_STAGE_BONUS]

function ghlField(rawObj, key) {
  return (rawObj?.customFields ?? []).find(f => f.key === key)?.value ?? null
}
function parseGHLDate(v) {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) { const d = new Date(n > 9_999_999_999 ? n : n * 1000); return isNaN(d.getTime()) ? null : d }
  const d = new Date(v); return isNaN(d.getTime()) ? null : d
}
function inGHLMonth(v, month, year) {
  const d = parseGHLDate(v)
  return d ? d.getMonth() + 1 === month && d.getFullYear() === year : false
}
function computeSetterMonthStats(ghlOpps, memberFullName, month, year) {
  const nl = memberFullName.trim().toLowerCase()
  const opps = ghlOpps.filter(o =>
    GHL_ALL_STAGES.includes(o.stage_name) &&
    (ghlField(o.raw ?? {}, 'setter__nom') ?? '').trim().toLowerCase() === nl
  )
  const booked  = opps.filter(o => inGHLMonth(o.created_at_ghl, month, year))
  const showups = opps.filter(o => GHL_SHOWUP_STAGES.includes(o.stage_name) && inGHLMonth(o.created_at_ghl, month, year))
  const won     = opps.filter(o => o.stage_name === GHL_STAGE_BONUS && inGHLMonth(ghlField(o.raw ?? {}, 'date_de_close'), month, year))
  const totalShowups = showups.reduce((s, o) => s + (Number(ghlField(o.raw ?? {}, 'setter__commission_showup')) || 0), 0)
  const totalBonus   = won.reduce((s, o) => s + (Number(ghlField(o.raw ?? {}, 'setter__bonus_vente')) || 0), 0)
  return { bookedCount: booked.length, showupCount: showups.length, wonCount: won.length, totalShowups, totalBonus, totalPay: totalShowups + totalBonus }
}

// ─── Admin Dashboard ──────────────────────────────────────────
// AJOUTE LE COMPOSANT ICI
function SetterDashboardRow({ member, idx, accent }) {
  const navigate = useNavigate()
  const now = new Date()
  const startDate = format(startOfMonth(now), 'yyyy-MM-dd')
  const endDate = format(endOfMonth(now), 'yyyy-MM-dd')
  
  // On utilise startDate et endDate
  const { data, loading } = useSetterCommissions(member.full_name, startDate, endDate)
  
  const target = member.monthlyTarget
  const totalPay = data?.totalPay ?? 0
  const displayPct = target > 0 ? Math.min(100, Math.round((totalPay / target) * 100)) : null
  const color = displayPct >= 80 ? '#10b981' : displayPct >= 50 ? '#f59e0b' : '#ef4444'

  // Le reste du return <div... est strictement identique
  return (
    <div className="flex items-center gap-3">
      {/* Rang */}
      <span className="text-sm font-bold w-5 text-center" style={{ color: idx === 0 ? accent : '#d1d5db' }}>
        {idx + 1}
      </span>
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 text-white" style={{ backgroundColor: accent }}>
        {member.full_name.charAt(0).toUpperCase()}
      </div>
      {/* Nom & Stats GHL */}
      <div className="w-28 flex-shrink-0 truncate">
        <p className="font-semibold text-sm text-[#1a1a1a]">
          {member.full_name.split(' ')[0]}
        </p>
        <p className="text-[10px] text-[#9ca3af] font-normal leading-tight mt-0.5">
          {loading ? '...' : `${data.bookedCount} bookés · ${data.showupCount} shows`}
        </p>
      </div>
      {/* Barre + montants */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs text-[#6b7280]">
            {loading ? '...' : `${totalPay} $`}
            {target ? <span className="text-[#d1d5db]"> / {target} $</span> : ''}
          </span>
          <span className="text-xs font-bold ml-2 flex-shrink-0" style={{ color }}>
            {displayPct !== null ? `${displayPct} %` : 'Aucun objectif'}
          </span>
        </div>
        {displayPct !== null ? (
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${displayPct}%`, backgroundColor: color }}
            />
          </div>
        ) : (
          <div className="w-full bg-gray-100 rounded-full h-2" />
        )}
      </div>
      {/* Lien */}
      <button
        onClick={() => navigate(`/membres/${member.id}`)}
        className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors flex-shrink-0"
      >
        Voir →
      </button>
    </div>
  )
}

// ─── Admin Dashboard ──────────────────────────────────────────
function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, naturopathes: 0, closers: 0, eodToday: 0 })
  const [members, setMembers] = useState([])
  const [roleFilter, setRoleFilter] = useState('tous')

  const nowAD = new Date()
  const [clinicMonth, setClinicMonth] = useState(nowAD.getMonth() + 1)
  const [clinicYear, setClinicYear] = useState(nowAD.getFullYear())
  const isClinicCurrentMonth = clinicMonth === nowAD.getMonth() + 1 && clinicYear === nowAD.getFullYear()

  const { objectives: clinicObjectives } = useClinicObjectives()
  const { revenue: qbRevenue, loading: qbLoading, refreshing: qbRefreshing, error: qbError, refetch: qbRefetch } = useQBRevenue()
  const { revenue: clinicHistRevenue, loading: clinicHistLoading } = useQBRevenueForMonth(
    isClinicCurrentMonth ? null : clinicMonth,
    isClinicCurrentMonth ? null : clinicYear
  )

  const monthDates = {
    from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    to: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  }

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const { from: monthStart, to: monthEnd } = monthDates
    const quarterStart = format(startOfQuarter(new Date()), 'yyyy-MM-dd')
    const quarterEnd   = format(endOfQuarter(new Date()),   'yyyy-MM-dd')

    const [profilesRes, eodRes, kpiRes, objRes, qbCacheRes, qObjRes, ghlOppsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true).neq('role', 'admin'),
      supabase.from('end_of_day_reports').select('id', { count: 'exact', head: true }).eq('report_date', today),
      supabase.from('kpi_entries').select('user_id, kpi_type, value').eq('scope', 'individual').gte('entry_date', monthStart).lte('entry_date', monthEnd),
      supabase.from('objectives').select('*').eq('scope', 'individual').lte('period_start', monthEnd).gte('period_end', monthStart),
      supabase.from('member_revenue_cache').select('first_name, therapist_monthly, therapist_quarterly, closer_monthly, setter_monthly'),
      // Objectifs trimestriels revenus pour les naturopathes
      supabase.from('objectives').select('*').eq('scope', 'individual').eq('type', 'quarterly_revenue')
        .lte('period_start', quarterEnd).gte('period_end', quarterStart),
      // Opportunités GHL pipeline Setting (pour les setters)
      supabase.from('ghl_opportunities').select('stage_name, created_at_ghl, raw').eq('pipeline_id', GHL_PIPELINE_SETTING),
    ])

    const profiles = profilesRes.data || []
    const kpiEntries = kpiRes.data || []
    const objectives = objRes.data || []
    const qbCache = qbCacheRes.data || []
    const quarterlyObjectives = qObjRes.data || []
    const ghlOpps = ghlOppsRes.data || []
    const nowForGHL = new Date()
    const ghlMonth = nowForGHL.getMonth() + 1
    const ghlYear = nowForGHL.getFullYear()

    const QB_MONTHLY = { naturopathe: 'therapist_monthly', closer: 'closer_monthly', setter: 'setter_monthly' }

    setStats({
      total: profiles.length,
      naturopathes: profiles.filter(p => p.role === 'naturopathe').length,
      closers: profiles.filter(p => p.role === 'closer').length,
      eodToday: eodRes.count || 0,
    })

    const membersWithProgress = profiles.map(profile => {
      const firstName = profile.full_name?.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
      const qbRow = qbCache.find(c => c.first_name.toLowerCase() === firstName)
      const qbMonthly    = qbRow ? Number(qbRow[QB_MONTHLY[profile.role]] ?? 0) : null
      const qbQuarterly  = (profile.role === 'naturopathe' && qbRow)
        ? Number(qbRow.therapist_quarterly ?? 0)
        : null

      const userObjectives = objectives.filter(o => o.user_id === profile.id)
      const userKpis = kpiEntries.filter(k => k.user_id === profile.id)

      // Objectif mensuel de revenus (pour l'affichage des autres rôles)
      const revenueObj = userObjectives.find(o => o.type === 'monthly_revenue')
      const monthlyTarget = revenueObj?.target_value ?? null

      // Objectif trimestriel revenus (naturopathes)
      const qObj = quarterlyObjectives.find(o => o.user_id === profile.id)
      const quarterlyTarget = qObj?.target_value ?? null

      let totalPct = 0, count = 0
      userObjectives.forEach(obj => {
        let current
        if (['monthly_revenue', 'quarterly_revenue', 'annual_revenue'].includes(obj.type) && qbMonthly !== null) {
          current = obj.type === 'monthly_revenue' ? qbMonthly : userKpis.filter(k => k.kpi_type === obj.type).reduce((a, k) => a + Number(k.value), 0)
        } else {
          current = userKpis.filter(k => k.kpi_type === obj.type).reduce((a, k) => a + Number(k.value), 0)
        }
        if (obj.target_value > 0) { totalPct += Math.min(100, (current / obj.target_value) * 100); count++ }
      })

      const setterStats = profile.role === 'setter'
        ? computeSetterMonthStats(ghlOpps, profile.full_name, ghlMonth, ghlYear)
        : null
      const setterCommTarget = profile.role === 'setter'
        ? (userObjectives.find(o => o.type === 'setter_commission_target')?.target_value ?? null)
        : null

      return {
        ...profile,
        progress: count > 0 ? Math.round(totalPct / count) : null,
        qbMonthly,
        qbQuarterly,
        monthlyTarget,
        quarterlyTarget,
        setterStats,
        setterCommTarget,
      }
    })

    setMembers(membersWithProgress)
    setLoading(false)
  }

  const filteredMembers = roleFilter === 'tous' ? members : members.filter(m => m.role === roleFilter)
  const roles = ['tous', 'naturopathe', 'closer', 'setter', 'service_client', 'resp_vente']

  const ROLE_GROUPS = [
    { role: 'naturopathe',    label: 'Naturopathes',              accent: '#00bbb1' },
    { role: 'closer',         label: 'Closers',                   accent: '#8b5cf6' },
    { role: 'setter',         label: 'Setters',                   accent: '#f59e0b' },
    { role: 'service_client', label: 'Service clients & gestion', accent: '#ec4899' },
    { role: 'resp_vente',     label: 'Resp. équipe de vente',     accent: '#6366f1' },
  ]

  function progressColor(pct) {
    if (pct === null) return '#d1d5db'
    if (pct >= 80) return '#10b981'
    if (pct >= 50) return '#f59e0b'
    return '#ef4444'
  }

  function fmtCAD(n) {
    return Number(n).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
  }

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
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">Revenu clinique</h2>
            <MonthNavigator
              month={clinicMonth}
              year={clinicYear}
              onChange={(m, y) => { setClinicMonth(m); setClinicYear(y) }}
            />
          </div>
          <div className="flex items-center gap-3">
            {qbError && (
              <span className="text-xs text-amber-600 font-semibold">QB non disponible · cache</span>
            )}
            {qbRevenue?.warning && (
              <span className="text-xs text-amber-600 font-semibold">Token QB expiré</span>
            )}
            {!qbRevenue && !qbLoading && !qbError && (
              <span className="text-xs text-[#9ca3af]">QuickBooks non connecté</span>
            )}
            {isClinicCurrentMonth && (
              <button
                onClick={qbRefetch}
                disabled={qbRefreshing || qbLoading}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] disabled:opacity-50 transition-colors"
              >
                <svg className={`w-3.5 h-3.5 ${qbRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {qbRefreshing ? 'Actualisation…' : 'Actualiser QB'}
              </button>
            )}
          </div>
        </div>
        {(qbLoading && isClinicCurrentMonth) ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2"><SkeletonCard /></div>
            <SkeletonCard />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            {isClinicCurrentMonth && (
              <div className="lg:col-span-2 flex">
                <ClinicAnnualCard
                  objectives={clinicObjectives}
                  revenue={qbRevenue?.annual_revenue ?? 0}
                  monthlyRevenue={qbRevenue?.monthly_revenue ?? 0}
                  annualDeposited={qbRevenue?.annual_deposited ?? null}
                  lastSynced={qbRevenue?.last_synced_at}
                  fromCache={qbRevenue?.from_cache}
                />
              </div>
            )}
            <div className={`flex ${isClinicCurrentMonth ? '' : 'lg:col-span-3'}`}>
              <ClinicMonthlyCard
                objectives={clinicObjectives}
                revenue={isClinicCurrentMonth ? (qbRevenue?.monthly_revenue ?? 0) : (clinicHistRevenue ?? null)}
                prevRevenue={isClinicCurrentMonth ? (qbRevenue?.prev_monthly_revenue ?? null) : null}
                annualRevenue={qbRevenue?.annual_revenue ?? null}
                deposited={isClinicCurrentMonth ? (qbRevenue?.monthly_deposited ?? null) : null}
                lastSynced={isClinicCurrentMonth ? qbRevenue?.last_synced_at : null}
                fromCache={isClinicCurrentMonth ? qbRevenue?.from_cache : false}
                isCurrentMonth={isClinicCurrentMonth}
                histLoading={clinicHistLoading}
                selectedMonth={clinicMonth}
                selectedYear={clinicYear}
              />
            </div>
          </div>
        )}
      </div>

      {/* Team performance — groupé par rôle */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#1a1a1a]">Performance de l'équipe</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">{format(new Date(), 'MMMM yyyy', { locale: fr })} — revenus mensuels vs objectif</p>
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

        {loading ? <SkeletonTable rows={5} /> : (
          <div className="space-y-4">
            {ROLE_GROUPS.map(group => {
              const isNaturo = group.role === 'naturopathe'
              const groupMembers = filteredMembers
                .filter(m => m.role === group.role)
                .sort((a, b) => {
                  if (isNaturo) return (b.qbQuarterly ?? -1) - (a.qbQuarterly ?? -1)
                  return (b.qbMonthly ?? -1) - (a.qbMonthly ?? -1)
                })
              if (groupMembers.length === 0) return null

              // Quarter label for naturopathes header
              const qNum = Math.ceil((new Date().getMonth() + 1) / 3)
              const qYear = new Date().getFullYear()

              return (
                <Card key={group.role} className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-5 rounded-full" style={{ backgroundColor: group.accent }} />
                    <h3 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">{group.label}</h3>
                    <span className="text-xs text-[#9ca3af] ml-1">{groupMembers.length} membre{groupMembers.length > 1 ? 's' : ''}</span>
                  </div>
                  {isNaturo && (
                    <p className="text-xs text-[#9ca3af] mb-3 pl-4">
                      Revenus trimestriels vs objectif · T{qNum} {qYear}
                    </p>
                  )}
                  {!isNaturo && <div className="mb-3" />}
                  <div className="space-y-4">
                    {groupMembers.map((m, idx) => {
                      // NOUVEAU : Si c'est un setter, on utilise la ligne spéciale GHL
                      if (group.role === 'setter') {
                        return <SetterDashboardRow key={m.id} member={m} idx={idx} accent={group.accent} />
                      }

                      // LOGIQUE EXISTANTE pour Naturopathes et Closers
                      const isMemberSetter = false; // <-- Évite le crash "isMemberSetter is not defined"
                      const revenue = isNaturo ? m.qbQuarterly : m.qbMonthly
                      const target  = isNaturo ? m.quarterlyTarget : m.monthlyTarget
                      const qPct = (revenue !== null && target != null && target > 0)
                        ? Math.min(100, Math.round((revenue / target) * 100))
                        : null
                      const displayPct = isNaturo ? qPct : m.progress
                      const color = progressColor(displayPct)
                      const hasRevenue = revenue !== null

                      return (
                        <div key={m.id} className="flex items-center gap-3">
                          {/* Rang */}
                          <span className="text-sm font-bold w-5 text-center" style={{ color: idx === 0 ? group.accent : '#d1d5db' }}>
                            {idx + 1}
                          </span>
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 text-white" style={{ backgroundColor: group.accent }}>
                            {m.full_name.charAt(0).toUpperCase()}
                          </div>
                          {/* Nom */}
                          <div className="w-28 flex-shrink-0 min-w-0">
                            <p className="font-semibold text-sm text-[#1a1a1a] truncate">
                              {m.full_name.split(' ')[0]}
                            </p>
                            {isMemberSetter && m.setterStats && (
                              <p className="text-[10px] text-[#9ca3af] truncate">
                                {m.setterStats.bookedCount} bookés · {m.setterStats.showupCount} shows · {m.setterStats.wonCount} ventes
                              </p>
                            )}
                          </div>
                          {/* Barre + montants */}
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                              <span className="text-xs text-[#6b7280]">
                                {hasRevenue ? fmtCAD(revenue) : '—'}
                                {target ? <span className="text-[#d1d5db]"> / {fmtCAD(target)}</span> : ''}
                              </span>
                              <span className="text-xs font-bold ml-2 flex-shrink-0" style={{ color }}>
                                {displayPct !== null ? `${displayPct} %` : 'Aucun objectif'}
                              </span>
                            </div>
                            {displayPct !== null ? (
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full transition-all duration-500"
                                  style={{ width: `${displayPct}%`, backgroundColor: color }}
                                />
                              </div>
                            ) : (
                              <div className="w-full bg-gray-100 rounded-full h-2" />
                            )}
                          </div>
                          {/* Lien */}
                          <button
                            onClick={() => navigate(`/membres/${m.id}`)}
                            className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors flex-shrink-0"
                          >
                            Voir →
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
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

  const isSetter = profile?.role === 'setter'
  const nowMD = new Date()
  const todayStr = format(nowMD, 'yyyy-MM-dd')
  
  const [qbMonth, setQbMonth] = useState(nowMD.getMonth() + 1)
  const [qbYear, setQbYear] = useState(nowMD.getFullYear())
  const isQbCurrentMonth = qbMonth === nowMD.getMonth() + 1 && qbYear === nowMD.getFullYear()
  
  const { config: payConfig } = usePayPeriodConfig()
  const payPeriod = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null

  // Filtre Setter : Paie (GHL)
  const [setterPeriodType, setSetterPeriodType] = useState('paie')
  const [setterCustomStart, setSetterCustomStart] = useState(todayStr)
  const [setterCustomEnd, setSetterCustomEnd] = useState(todayStr)

  let setterStartDate, setterEndDate;
  if (setterPeriodType === 'paie') {
    setterStartDate = payPeriod?.start || todayStr
    setterEndDate = payPeriod?.end || todayStr
  } else {
    setterStartDate = setterCustomStart || todayStr
    setterEndDate = setterCustomEnd || todayStr
  }

  // Filtre Setter : Objectifs mensuels (Garde ces deux lignes pour ne pas faire crasher les objectifs en bas)
  const [setterMonth, setSetterMonth] = useState(nowMD.getMonth() + 1)
  const [setterYear, setSetterYear] = useState(nowMD.getFullYear())

  const { objectives: clinicObjectives } = useClinicObjectives()
  const monthDates = {
    from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    to: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  }
  const { entries: clinicEntriesMonth } = useClinicKPIEntries(monthDates)
  const memberFirstName = profile?.full_name?.trim().split(/\s+/)[0] ?? ''
  const { revenue: memberQBRevenue, loading: memberQBLoading, refreshing: memberQBRefreshing, refetch: memberQBRefetch } = useQBMemberRevenue(memberFirstName)
  const { data: memberQBHistData, loading: memberQBHistLoading } = useQBMemberRevenueForMonth(
    memberFirstName,
    isQbCurrentMonth ? null : qbMonth,
    isQbCurrentMonth ? null : qbYear
  )
  const { revenue: qbClinicRevenue } = useQBRevenue()
  const { bonus, achievement, loading: bonusLoading, quarterStart, quarterEnd } = useQuarterlyBonus(profile?.id, profile?.annual_bonus, memberQBRevenue, profile?.role)

  // ── Setter KPIs ──
  const { data: setterCommData, loading: setterCommLoading } = useSetterCommissions(
    isSetter ? profile?.full_name : null,
    setterStartDate, // <-- NOUVEAU
    setterEndDate    // <-- NOUVEAU
  )
  const { objectives: setterObjAll } = useObjectives(isSetter ? profile?.id : null)
  const setterPStart = `${setterYear}-${String(setterMonth).padStart(2, '0')}-01`
  const setterPEnd = (() => {
    const last = new Date(setterYear, setterMonth, 0).getDate()
    return `${setterYear}-${String(setterMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  })()
  const setterMonthObjs = (setterObjAll ?? []).filter(o =>
    ['setter_showup_target', 'setter_confirm_target', 'setter_rebook_target', 'setter_sales_target', 'setter_commission_target'].includes(o.type) &&
    o.period_start === setterPStart && o.period_end === setterPEnd
  )

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

  const ROLE_TO_QB = { naturopathe: 'naturopathe', closer: 'closer', setter: 'setter' }
  const REVENUE_OBJ_TYPES = ['monthly_revenue', 'quarterly_revenue', 'annual_revenue']

  const memberRoleField = ROLE_TO_QB[profile?.role]
  const quarterlyRevenue = memberQBRevenue?.[memberRoleField]?.quarterly ?? null
  const quarterlyUnpaid = memberQBRevenue?.[memberRoleField]?.quarterlyUnpaid ?? null

  function calcProgress(obj) {
    if (memberQBRevenue && REVENUE_OBJ_TYPES.includes(obj.type)) {
      const qbField = ROLE_TO_QB[profile?.role]
      const roleData = memberQBRevenue?.[qbField]
      if (roleData) {
        const now = new Date()
        const objStart = new Date(obj.period_start)
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        let current = 0
        if (obj.type === 'quarterly_revenue') current = roleData.quarterly ?? 0
        else if (obj.type === 'annual_revenue') current = roleData.annual ?? 0
        else if (obj.type === 'monthly_revenue') {
          if (objStart.getFullYear() === now.getFullYear() && objStart.getMonth() === now.getMonth())
            current = roleData.monthly ?? 0
          else if (objStart.getFullYear() === prevMonthDate.getFullYear() && objStart.getMonth() === prevMonthDate.getMonth())
            current = roleData.prevMonthly ?? 0
        }
        return obj.target_value > 0 ? Math.min(100, Math.round((current / obj.target_value) * 100)) : 0
      }
    }
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

      {/* ── Setter : Ma Paie ── */}
      {isSetter && (
        <div className="mb-6">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-2">
            <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">Ma Paie</h2>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setSetterPeriodType('paie')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  setterPeriodType === 'paie'
                    ? 'bg-[#00bbb1] border-[#00bbb1] text-white shadow-sm'
                    : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
                }`}
              >
                Période de paie
              </button>

              <span className="text-xs text-[#9ca3af] font-semibold">ou période libre :</span>

              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                setterPeriodType === 'custom' ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-white'
              }`}>
                <input
                  type="date"
                  value={setterCustomStart}
                  onChange={(e) => { setSetterCustomStart(e.target.value); setSetterPeriodType('custom') }}
                  className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer"
                />
                <span className="text-[#9ca3af] text-xs">→</span>
                <input
                  type="date"
                  value={setterCustomEnd}
                  min={setterCustomStart}
                  onChange={(e) => { setSetterCustomEnd(e.target.value); setSetterPeriodType('custom') }}
                  className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>
          
          <p className="text-xs text-[#9ca3af] mb-4 font-semibold">
            {setterPeriodType === 'paie' && payPeriod ? `Résultats de la paie en cours (${format(parseISO(payPeriod.start), 'd MMM', { locale: fr })} au ${format(parseISO(payPeriod.end), 'd MMM yyyy', { locale: fr })}).` : ''}
            {setterPeriodType === 'custom' ? `Résultats du ${format(parseISO(setterCustomStart), 'd MMM', { locale: fr })} au ${format(parseISO(setterCustomEnd), 'd MMM yyyy', { locale: fr })}.` : ''}
          </p>

          {setterCommLoading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{[0, 1, 2].map(i => <SkeletonCard key={i} />)}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[0, 1].map(i => <SkeletonCard key={i} />)}</div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Ligne 1 : détail des commissions show-up */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatCard
                  label="Commission Manuelle"
                  value={Number(setterCommData?.commissionManuel ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                  sub={`${setterCommData?.manuelCount ?? 0} show-up${(setterCommData?.manuelCount ?? 0) !== 1 ? 's' : ''} manuel${(setterCommData?.manuelCount ?? 0) !== 1 ? 's' : ''} × 40 $`}
                  color="#00bbb1"
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                />
                <StatCard
                  label="Commission Confirmation"
                  value={Number(setterCommData?.commissionAuto ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                  sub={`${setterCommData?.autoCount ?? 0} confirmation${(setterCommData?.autoCount ?? 0) !== 1 ? 's' : ''} auto × 20 $`}
                  color="#f59e0b"
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <StatCard
                  label="Commission Rebooking"
                  value={Number(setterCommData?.commissionRebook ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                  sub={`${setterCommData?.rebookingCount ?? 0} rebooking${(setterCommData?.rebookingCount ?? 0) !== 1 ? 's' : ''} × 20 $`}
                  color="#8b5cf6"
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                />
              </div>
              {/* Ligne 2 : bonus vente + total */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StatCard
                  label="Bonus de Vente"
                  value={Number(setterCommData?.totalBonus ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                  sub={`${setterCommData?.wonCount ?? 0} vente${(setterCommData?.wonCount ?? 0) !== 1 ? 's' : ''}`}
                  color="#6366f1"
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <StatCard
                  label="Total à payer"
                  value={Number(setterCommData?.totalPay ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                  sub={`${setterCommData?.showupCount ?? 0} show-up${(setterCommData?.showupCount ?? 0) !== 1 ? 's' : ''} · ${setterCommData?.bookedCount ?? 0} booké${(setterCommData?.bookedCount ?? 0) !== 1 ? 's' : ''}`}
                  color="#10b981"
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Setter : Mes Objectifs du mois ── */}
      {isSetter && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Mes Objectifs du mois</h2>
          {setterCommLoading ? <SkeletonTable rows={3} /> : (
            <div className="space-y-4">
              {[
                { type: 'setter_showup_target',    label: 'Show-ups',               current: setterCommData?.showupCount    ?? 0, isCurrency: false },
                { type: 'setter_confirm_target',   label: 'Confirmations auto',      current: setterCommData?.autoCount      ?? 0, isCurrency: false },
                { type: 'setter_rebook_target',    label: 'Rebookings',              current: setterCommData?.rebookingCount ?? 0, isCurrency: false },
                { type: 'setter_sales_target',     label: 'Ventes',                  current: setterCommData?.wonCount       ?? 0, isCurrency: false },
                { type: 'setter_commission_target',label: 'Commissions totales ($)',  current: setterCommData?.totalPay       ?? 0, isCurrency: true  },
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
      )}

      {/* Boni trimestriel */}
      {!isSetter && profile?.annual_bonus && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Mon boni trimestriel</h2>
          <BonusTracker
            bonus={bonus}
            achievement={achievement}
            loading={bonusLoading}
            quarterStart={quarterStart}
            quarterEnd={quarterEnd}
            annualBonus={profile?.annual_bonus}
            quarterlyRevenue={quarterlyRevenue}
            quarterlyUnpaid={quarterlyUnpaid}
          />
        </div>
      )}

      {/* Objectifs trimestriels */}
      {!isSetter && profile?.annual_bonus && (
        <div className="mb-6">
          <QuarterlyPanel
            userId={profile?.id}
            annualBonus={profile?.annual_bonus}
            role={profile?.role}
            qbRevenue={memberQBRevenue}
            isAdmin={false}
            firstName={memberFirstName}
          />
        </div>
      )}

      {/* Mes revenus QuickBooks */}
      {!isSetter && (memberQBRevenue || memberQBLoading) && (
        <MemberQBRevenueSection
          revenue={memberQBRevenue}
          loading={memberQBLoading}
          refreshing={memberQBRefreshing}
          onRefetch={memberQBRefetch}
          isCurrentMonth={isQbCurrentMonth}
          histData={memberQBHistData}
          histLoading={memberQBHistLoading}
          selectedMonth={qbMonth}
          selectedYear={qbYear}
          onMonthChange={(m, y) => { setQbMonth(m); setQbYear(y) }}
        />
      )}

      {/* Revenu clinique mensuel */}
      {!isSetter && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide mb-3">Revenu clinique</h2>
          <ClinicMonthlyCard
            objectives={clinicObjectives}
            revenue={qbClinicRevenue?.monthly_revenue ?? null}
            prevRevenue={qbClinicRevenue?.prev_monthly_revenue ?? null}
            lastSynced={qbClinicRevenue?.last_synced_at}
            fromCache={qbClinicRevenue?.from_cache}
            entries={clinicEntriesMonth}
          />
        </div>
      )}

      {/* Mes objectifs (non-setters) */}
      {!isSetter && <Card className="p-6">
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
                    <p className="text-sm font-semibold text-[#1a1a1a]">{OBJECTIVE_TYPE_LABELS[obj.type] || obj.type.replace(/_/g, ' ')}</p>
                    <p className="text-sm font-bold text-[#6b7280]">{obj.target_value.toLocaleString('fr-CA')}</p>
                  </div>
                  <ProgressBar pct={pct} color={color} />
                </div>
              )
            })}
          </div>
        )}
      </Card>}
    </Layout>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  if (!profile) return null
  return profile.role === 'admin' ? <AdminDashboard /> : <MemberDashboard />
}
