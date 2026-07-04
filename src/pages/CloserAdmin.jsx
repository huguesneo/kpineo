import { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import { SkeletonCard } from '../components/shared/Skeleton'
import CloserDashboardView from '../components/closer/CloserDashboardView'
import DataHygienePanel from '../components/closer/DataHygienePanel'
import { useMembers } from '../hooks/useMembers'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../hooks/usePayPeriod'
import {
  useCloserAppointments,
  useCloserSales,
  useCloserCashCollected,
  COMMISSION_RATE,
} from '../hooks/useCloserData'
import {
  GHL_PIPELINE_CLOSER,
  fetchAllRows,
  isWonStage,
  isCloseInPeriod,
  closerFieldMatches,
  getCloserField,
} from '../lib/ghlHelpers'
import { supabase } from '../lib/supabase'

function fmtCAD(n) {
  return Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
}

function initials(name) {
  return (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Comparaison : stats par closer ──────────────────────────

function useAllCloserStats(closers, startDate, endDate) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!closers.length || !startDate || !endDate) return
    setLoading(true)

    // Charger toutes les opportunités du pipeline (paginé → jamais capé à 1000)
    const opps = await fetchAllRows((from, to) => supabase
      .from('ghl_opportunities')
      .select('contact_id, stage_name, raw, closed_at, contact_name')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)
      .range(from, to))

    // Tous les RDV de la période, en une passe paginée
    const allAppts = await fetchAllRows((from, to) => supabase
      .from('ghl_appointments')
      .select('contact_id, assigned_user_id, status')
      .gte('start_time', startDate + 'T00:00:00')
      .lte('start_time', endDate   + 'T23:59:59')
      .range(from, to))

    // Si on a des ghl_user_id, on peut aussi matcher les RDV directs
    const apptsByUserId = {}
    for (const a of allAppts) {
      if (a.assigned_user_id) {
        if (!apptsByUserId[a.assigned_user_id]) apptsByUserId[a.assigned_user_id] = []
        apptsByUserId[a.assigned_user_id].push(a)
      }
    }
    const apptsByContactId = {}
    for (const a of allAppts) {
      if (!apptsByContactId[a.contact_id]) apptsByContactId[a.contact_id] = []
      apptsByContactId[a.contact_id].push(a)
    }

    // Calculer les stats par closer
    const statsRows = closers.map(closer => {
      // Filtrer les opps de ce closer (matching centralisé)
      const myOpps = opps.filter(o => closerFieldMatches(getCloserField(o), closer.full_name))

      const myContactIds = [...new Set(myOpps.map(o => o.contact_id).filter(Boolean))]

      // RDV : préférer assigned_user_id si disponible
      let myAppts = []
      if (closer.ghl_user_id && apptsByUserId[closer.ghl_user_id]) {
        myAppts = apptsByUserId[closer.ghl_user_id]
      } else {
        myAppts = myContactIds.flatMap(id => apptsByContactId[id] ?? [])
      }

      const rdvCount   = myAppts.length
      const shows      = myAppts.filter(a => a.status === 'showed' || a.status === 'attended').length
      const noShows    = myAppts.filter(a => a.status === 'noshow').length
      const showUpPct  = rdvCount > 0 ? Math.round((shows / rdvCount) * 100) : null
      const noShowPct  = rdvCount > 0 ? Math.round((noShows / rdvCount) * 100) : null

      const wonSales = myOpps.filter(o => isWonStage(o) && isCloseInPeriod(o, startDate, endDate))

      const ventesCount  = wonSales.length
      const closeRate    = shows > 0 ? Math.round((ventesCount / shows) * 100) : null

      return {
        id:         closer.id,
        name:       closer.full_name,
        ghlUserId:  closer.ghl_user_id,
        rdvCount,
        shows,
        noShows,
        showUpPct,
        noShowPct,
        ventesCount,
        closeRate,
        cash:       null, // chargé séparément
        commission: null,
        cashLoading: true,
      }
    })

    setRows(statsRows)

    // Charger le cash collected en parallèle pour chaque closer
    const cashResults = await Promise.all(
      closers.map(closer =>
        supabase.functions.invoke('closer-cash-collected', {
          body: { closerName: closer.full_name, startDate, endDate },
        }).then(({ data }) => ({ id: closer.id, data })).catch(() => ({ id: closer.id, data: null }))
      )
    )

    setRows(prev => prev.map(row => {
      const res = cashResults.find(r => r.id === row.id)
      const cashData = res?.data
      const cash = cashData?.total ?? null
      const commission = cash !== null ? Math.round(cash * COMMISSION_RATE) : null
      return { ...row, cash, commission, cashLoading: false }
    }))

    setLoading(false)
  }, [closers, startDate, endDate])

  useEffect(() => { load() }, [load])

  return { rows, loading }
}

// ─── Tableau de comparaison ────────────────────────────────────

function SortIcon({ dir }) {
  return (
    <svg className="w-3 h-3 inline ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {dir === 'asc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      }
    </svg>
  )
}

function ComparisonTable({ closers, startDate, endDate }) {
  const { rows, loading } = useAllCloserStats(closers, startDate, endDate)
  const [sortKey, setSortKey] = useState('ventesCount')
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? -1
    const bv = b[sortKey] ?? -1
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const cols = [
    { key: 'name',        label: 'Closer' },
    { key: 'rdvCount',    label: 'RDV' },
    { key: 'shows',       label: 'Shows' },
    { key: 'showUpPct',   label: '% Show up' },
    { key: 'noShowPct',   label: 'No-show %' },
    { key: 'ventesCount', label: 'Ventes' },
    { key: 'closeRate',   label: 'Taux close' },
    { key: 'cash',        label: 'Cash collecté' },
    { key: 'commission',  label: 'Commission' },
  ]

  const totals = rows.reduce((acc, r) => ({
    rdvCount:    acc.rdvCount    + (r.rdvCount ?? 0),
    shows:       acc.shows       + (r.shows ?? 0),
    noShows:     acc.noShows     + (r.noShows ?? 0),
    ventesCount: acc.ventesCount + (r.ventesCount ?? 0),
    cash:        acc.cash        + (r.cash ?? 0),
    commission:  acc.commission  + (r.commission ?? 0),
  }), { rdvCount: 0, shows: 0, noShows: 0, ventesCount: 0, cash: 0, commission: 0 })

  const totalShowUpPct = totals.rdvCount > 0 ? Math.round((totals.shows / totals.rdvCount) * 100) : null
  const totalNoShowPct = totals.rdvCount > 0 ? Math.round((totals.noShows / totals.rdvCount) * 100) : null
  const totalCloseRate = totals.shows > 0 ? Math.round((totals.ventesCount / totals.shows) * 100) : null

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#e5e7eb]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
            {cols.map(col => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-[10px] font-bold text-[#6b7280] uppercase tracking-wide cursor-pointer hover:text-[#1a1a1a] select-none whitespace-nowrap"
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && <SortIcon dir={sortDir} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr key={row.id} className={`border-b border-[#f0f0f0] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#00bbb1]/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-black text-[#00bbb1]">{initials(row.name)}</span>
                  </div>
                  <span className="font-semibold text-[#1a1a1a]">{row.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{row.rdvCount}</td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{row.shows}</td>
              <td className="px-4 py-3">
                {row.showUpPct !== null ? (
                  <span className={`font-bold ${row.showUpPct >= 75 ? 'text-[#10b981]' : 'text-[#1a1a1a]'}`}>
                    {row.showUpPct}%
                  </span>
                ) : '—'}
              </td>
              <td className="px-4 py-3">
                {row.noShowPct !== null ? (
                  <span className={`font-bold ${row.noShowPct > 25 ? 'text-[#f59e0b]' : 'text-[#1a1a1a]'}`}>
                    {row.noShowPct}%
                  </span>
                ) : '—'}
              </td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{row.ventesCount}</td>
              <td className="px-4 py-3">
                {row.closeRate !== null ? (
                  <span className={`font-bold ${row.closeRate >= 50 ? 'text-[#10b981]' : 'text-[#1a1a1a]'}`}>
                    {row.closeRate}%
                  </span>
                ) : '—'}
              </td>
              <td className="px-4 py-3">
                {row.cashLoading ? (
                  <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                ) : row.cash !== null ? (
                  <span className="font-bold text-[#1a1a1a]">{fmtCAD(row.cash)}</span>
                ) : '—'}
              </td>
              <td className="px-4 py-3">
                {row.cashLoading ? (
                  <div className="h-4 w-14 bg-gray-100 rounded animate-pulse" />
                ) : row.commission !== null ? (
                  <span className="font-bold text-[#00bbb1]">{fmtCAD(row.commission)}</span>
                ) : '—'}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-sm text-[#9ca3af]">
                Aucun closer actif trouvé.
              </td>
            </tr>
          )}
          {sorted.length > 0 && (
            <tr className="border-t-2 border-[#e5e7eb] bg-[#f9fafb]">
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">Total</td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{totals.rdvCount}</td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{totals.shows}</td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">
                {totalShowUpPct !== null ? `${totalShowUpPct}%` : '—'}
              </td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">
                {totalNoShowPct !== null ? `${totalNoShowPct}%` : '—'}
              </td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{totals.ventesCount}</td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">
                {totalCloseRate !== null ? `${totalCloseRate}%` : '—'}
              </td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{fmtCAD(totals.cash)}</td>
              <td className="px-4 py-3 font-bold text-[#00bbb1]">{fmtCAD(totals.commission)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────

const ADMIN_TABS = ['Tableau de bord', 'Comparaison', 'Hygiène des données']

export default function CloserAdmin() {
  const { config: payConfig } = usePayPeriodConfig()
  const now        = new Date()
  const todayStr   = format(now, 'yyyy-MM-dd')
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
  const payPeriod  = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null

  const [activeTab,   setActiveTab]   = useState(0)
  const [periodType,  setPeriodType]  = useState('month')
  const [customStart, setCustomStart] = useState(monthStart)
  const [customEnd,   setCustomEnd]   = useState(todayStr)
  const [selectedId,  setSelectedId]  = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const { members, loading: membersLoading } = useMembers({ isActive: true })
  const closers = members.filter(m =>
    m.role === 'closer' || (m.secondary_roles ?? []).includes('closer')
  )
  const selectedCloser = closers.find(c => c.id === selectedId) ?? closers[0] ?? null

  // Auto-select first closer
  useEffect(() => {
    if (!selectedId && closers.length > 0) setSelectedId(closers[0].id)
  }, [closers, selectedId])

  const startDate = periodType === 'paie' ? (payPeriod?.start || monthStart)
                  : periodType === 'month' ? monthStart
                  : (customStart || monthStart)
  const endDate   = periodType === 'paie' ? (payPeriod?.end   || todayStr)
                  : periodType === 'month' ? todayStr
                  : (customEnd   || todayStr)

  const payPeriodLabel = periodType === 'paie' && payPeriod
    ? `Période de paie : ${format(parseISO(payPeriod.start), 'd MMM', { locale: fr })} → ${format(parseISO(payPeriod.end), 'd MMM yyyy', { locale: fr })}`
    : null

  return (
    <Layout>
      <Header title="Dashboard Closers" />

      {/* ── Onglets ── */}
      <div className="flex gap-1 border-b border-[#e5e7eb] mb-6">
        {ADMIN_TABS.map((tab, i) => (
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

      {/* ── Sélecteur de closer (dans les deux onglets) ── */}
      {activeTab === 2 ? null : membersLoading ? (
        <div className="h-12 bg-gray-100 rounded-xl animate-pulse mb-6" />
      ) : closers.length > 0 && (
        <div className="mb-6 relative">
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className="w-full sm:w-auto flex items-center gap-3 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-xl hover:border-[#00bbb1]/40 transition-colors text-left"
          >
            {selectedCloser && (
              <div className="w-8 h-8 rounded-full bg-[#00bbb1]/15 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-black text-[#00bbb1]">{initials(selectedCloser.full_name)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#1a1a1a]">{selectedCloser?.full_name ?? 'Choisir un closer'}</p>
              <p className="text-xs text-[#9ca3af]">
                {activeTab === 0 ? 'Tableau de bord individuel' : 'Sélectionner pour le tableau de bord'}
              </p>
            </div>
            <svg className={`w-4 h-4 text-[#6b7280] transition-transform flex-shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-20 overflow-hidden">
                {closers.map(closer => (
                  <button
                    key={closer.id}
                    onClick={() => { setSelectedId(closer.id); setDropdownOpen(false) }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${selectedId === closer.id ? 'bg-[#00bbb1]/5' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#00bbb1]/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-black text-[#00bbb1]">{initials(closer.full_name)}</span>
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${selectedId === closer.id ? 'text-[#00bbb1]' : 'text-[#1a1a1a]'}`}>
                        {closer.full_name}
                      </p>
                      {!closer.ghl_user_id && (
                        <p className="text-[10px] text-[#f59e0b]">GHL non configuré</p>
                      )}
                    </div>
                    {selectedId === closer.id && (
                      <svg className="w-4 h-4 text-[#00bbb1] ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Onglet 0 : Tableau de bord ── */}
      {activeTab === 0 && (
        <>
          {!selectedCloser ? (
            <Card className="p-8 text-center">
              <p className="text-[#9ca3af]">Aucun closer actif trouvé.</p>
            </Card>
          ) : (
            <CloserDashboardView
              key={selectedCloser.id}
              closerProfile={selectedCloser}
              isAdmin={true}
              startDate={startDate}
              endDate={endDate}
              periodType={periodType}
              onSetPeriod={p => { setPeriodType(p); if (p === 'month') { setCustomStart(monthStart); setCustomEnd(todayStr) } }}
              customStart={customStart}
              onCustomStart={setCustomStart}
              customEnd={customEnd}
              onCustomEnd={setCustomEnd}
              payPeriodLabel={payPeriodLabel}
            />
          )}
        </>
      )}

      {/* ── Onglet 1 : Comparaison ── */}
      {activeTab === 1 && (
        <div className="space-y-5">
          {/* Sélecteur de période pour la comparaison */}
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Période :</p>
            {[
              { key: 'month', label: 'Mois en cours' },
              { key: 'paie',  label: 'Période de paie' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setPeriodType(opt.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${periodType === opt.key ? 'bg-[#00bbb1] border-[#00bbb1] text-white' : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'}`}
              >
                {opt.label}
              </button>
            ))}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${periodType === 'custom' ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-white'}`}>
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
                onChange={e => { setCustomEnd(e.target.value); setPeriodType('custom') }}
                className="bg-transparent text-xs font-semibold text-[#1a1a1a] focus:outline-none cursor-pointer"
              />
            </div>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e5e7eb]">
              <h2 className="font-bold text-[#1a1a1a]">Comparaison des closers</h2>
              <p className="text-xs text-[#9ca3af] mt-0.5">
                {format(new Date(startDate + 'T12:00:00'), 'd MMM', { locale: fr })} → {format(new Date(endDate + 'T12:00:00'), 'd MMM yyyy', { locale: fr })} · {closers.length} closer{closers.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-5">
              <ComparisonTable closers={closers} startDate={startDate} endDate={endDate} />
            </div>
          </Card>
        </div>
      )}

      {/* ── Onglet 2 : Hygiène des données ── */}
      {activeTab === 2 && <DataHygienePanel />}
    </Layout>
  )
}
