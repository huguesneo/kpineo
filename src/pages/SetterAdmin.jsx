import { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import { SkeletonCard } from '../components/shared/Skeleton'
import SetterDashboardView from '../components/closer/SetterDashboardView'
import { useMembers } from '../hooks/useMembers'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../hooks/usePayPeriod'
import { supabase } from '../lib/supabase'

const PIPELINE_SETTING_ID = '3C5ggTxPoWBmiFAPlCKn'
const FIELD_SETTER_NOM    = 'II5NrZGZrIScYItkxCi8'
const FIELD_TYPE_BOOKING  = 'YbAB98KAINZM7vzebAKh'
const FIELD_DATE_CLOSE    = 'UPqvJX8MkZ4thsPX2tjV'
const FLAT_MANUEL  = 40
const FLAT_CONFIRM = 20
const FLAT_REBOOK  = 20

function getFieldById(rawObj, fieldId) {
  if (!rawObj?.customFields || fieldId === 'ID_A_REMPLIR') return null
  const field = rawObj.customFields.find(f => f.id === fieldId)
  if (!field) return null
  return field.fieldValueNumber ?? field.fieldValueString ?? field.fieldValueDate ?? null
}

function fmtCAD(n) {
  return Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
}

function initials(name) {
  return (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Stats de tous les setters ────────────────────────────────

function useAllSetterStats(setters, startDate, endDate) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!setters.length || !startDate || !endDate) return
    setLoading(true)

    const start = new Date(startDate + 'T00:00:00')
    const end   = new Date(endDate   + 'T23:59:59')

    const [{ data: pipelineData }, { data: oppsData }] = await Promise.all([
      supabase.from('ghl_pipelines').select('stages').eq('ghl_id', PIPELINE_SETTING_ID).single(),
      supabase.from('ghl_opportunities').select('*').eq('pipeline_id', PIPELINE_SETTING_ID),
    ])

    const stagesMap = {}
    ;(pipelineData?.stages ?? []).forEach(s => { if (s.id) stagesMap[s.id] = s.name })
    const opps = oppsData ?? []

    const statsRows = setters.map(setter => {
      const nameLower = (setter.full_name ?? '').toLowerCase()
      let bookedCount = 0, showupCount = 0
      let manuelCount = 0, autoCount = 0, rebookingCount = 0, wonCount = 0
      let totalShowups = 0

      opps.forEach(opp => {
        const raw = opp.raw
        const setterName = getFieldById(raw, FIELD_SETTER_NOM)
        if (!setterName || String(setterName).toLowerCase() !== nameLower) return

        const stageName     = (stagesMap[opp.pipeline_stage_id] || opp.stage_name || '').toLowerCase()
        const isShowupStage = stageName.includes('show-up confirm') || stageName.includes('bonus vente')
        const isWonStage    = stageName.includes('bonus vente')
        const typeDeBooking = String(getFieldById(raw, FIELD_TYPE_BOOKING) || '').toLowerCase()

        if (opp.created_at_ghl) {
          const createdDate = new Date(opp.created_at_ghl)
          if (createdDate >= start && createdDate <= end) {
            bookedCount++
            if (isShowupStage) {
              showupCount++
              if (typeDeBooking === 'manuel') {
                manuelCount++
                totalShowups += FLAT_MANUEL
              } else if (typeDeBooking === 'automatique') {
                autoCount++
                totalShowups += FLAT_CONFIRM
              } else if (typeDeBooking === 'rebooking') {
                rebookingCount++
                totalShowups += FLAT_REBOOK
              }
            }
          }
        }

        if (isWonStage) {
          const closeDateRaw = getFieldById(raw, FIELD_DATE_CLOSE)
          if (closeDateRaw) {
            const closeDate = new Date(Number(closeDateRaw))
            if (!isNaN(closeDate.getTime()) && closeDate >= start && closeDate <= end) {
              wonCount++
            }
          }
        }
      })

      const showupRate = bookedCount > 0 ? Math.round((showupCount / bookedCount) * 100) : null

      return {
        id: setter.id,
        name: setter.full_name,
        bookedCount,
        showupCount,
        showupRate,
        manuelCount,
        autoCount,
        rebookingCount,
        wonCount,
        totalPay: totalShowups,
      }
    })

    setRows(statsRows)
    setLoading(false)
  }, [setters, startDate, endDate])

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

function ComparisonTable({ setters, startDate, endDate }) {
  const { rows, loading } = useAllSetterStats(setters, startDate, endDate)
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

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
    { key: 'name',          label: 'Setter' },
    { key: 'bookedCount',   label: 'Bookés' },
    { key: 'showupCount',   label: 'Show-ups' },
    { key: 'showupRate',    label: 'Show-up %' },
    { key: 'manuelCount',   label: 'Manuels' },
    { key: 'autoCount',     label: 'Auto' },
    { key: 'rebookingCount',label: 'Rebookings' },
    { key: 'wonCount',      label: 'Ventes' },
    { key: 'totalPay',      label: 'Commission' },
  ]

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
                  <div className="w-7 h-7 rounded-full bg-[#6366f1]/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-black text-[#6366f1]">{initials(row.name)}</span>
                  </div>
                  <span className="font-semibold text-[#1a1a1a]">{row.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{row.bookedCount}</td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{row.showupCount}</td>
              <td className="px-4 py-3">
                {row.showupRate !== null ? (
                  <span className={`font-bold ${row.showupRate >= 50 ? 'text-[#10b981]' : 'text-[#1a1a1a]'}`}>
                    {row.showupRate}%
                  </span>
                ) : '—'}
              </td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{row.manuelCount}</td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{row.autoCount}</td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{row.rebookingCount}</td>
              <td className="px-4 py-3 font-bold text-[#1a1a1a]">{row.wonCount}</td>
              <td className="px-4 py-3">
                <span className="font-bold text-[#6366f1]">{fmtCAD(row.totalPay)}</span>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-sm text-[#9ca3af]">
                Aucun setter actif trouvé.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────

const ADMIN_TABS = ['Tableau de bord', 'Comparaison']

export default function SetterAdmin() {
  const { config: payConfig } = usePayPeriodConfig()
  const now        = new Date()
  const todayStr   = format(now, 'yyyy-MM-dd')
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
  const payPeriod  = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null

  const [activeTab,    setActiveTab]    = useState(0)
  const [periodType,   setPeriodType]   = useState('month')
  const [customStart,  setCustomStart]  = useState(monthStart)
  const [customEnd,    setCustomEnd]    = useState(todayStr)
  const [selectedId,   setSelectedId]   = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const { members, loading: membersLoading } = useMembers({ isActive: true })
  const setters = members.filter(m =>
    m.role === 'setter' || (m.secondary_roles ?? []).includes('setter')
  )
  const selectedSetter = setters.find(s => s.id === selectedId) ?? setters[0] ?? null

  useEffect(() => {
    if (!selectedId && setters.length > 0) setSelectedId(setters[0].id)
  }, [setters, selectedId])

  const startDate = periodType === 'paie'  ? (payPeriod?.start || monthStart)
                  : periodType === 'month' ? monthStart
                  : (customStart || monthStart)
  const endDate   = periodType === 'paie'  ? (payPeriod?.end   || todayStr)
                  : periodType === 'month' ? todayStr
                  : (customEnd   || todayStr)

  const payPeriodLabel = periodType === 'paie' && payPeriod
    ? `Période de paie : ${format(parseISO(payPeriod.start), 'd MMM', { locale: fr })} → ${format(parseISO(payPeriod.end), 'd MMM yyyy', { locale: fr })}`
    : null

  return (
    <Layout>
      <Header title="Dashboard Setters" />

      {/* ── Onglets ── */}
      <div className="flex gap-1 border-b border-[#e5e7eb] mb-6">
        {ADMIN_TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === i ? 'border-[#6366f1] text-[#6366f1]' : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Sélecteur de setter ── */}
      {membersLoading ? (
        <div className="h-12 bg-gray-100 rounded-xl animate-pulse mb-6" />
      ) : setters.length > 0 && (
        <div className="mb-6 relative">
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className="w-full sm:w-auto flex items-center gap-3 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-xl hover:border-[#6366f1]/40 transition-colors text-left"
          >
            {selectedSetter && (
              <div className="w-8 h-8 rounded-full bg-[#6366f1]/15 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-black text-[#6366f1]">{initials(selectedSetter.full_name)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#1a1a1a]">{selectedSetter?.full_name ?? 'Choisir un setter'}</p>
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
                {setters.map(setter => (
                  <button
                    key={setter.id}
                    onClick={() => { setSelectedId(setter.id); setDropdownOpen(false) }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${selectedId === setter.id ? 'bg-[#6366f1]/5' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#6366f1]/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-black text-[#6366f1]">{initials(setter.full_name)}</span>
                    </div>
                    <p className={`text-sm font-semibold ${selectedId === setter.id ? 'text-[#6366f1]' : 'text-[#1a1a1a]'}`}>
                      {setter.full_name}
                    </p>
                    {selectedId === setter.id && (
                      <svg className="w-4 h-4 text-[#6366f1] ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
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
          {!selectedSetter ? (
            <Card className="p-8 text-center">
              <p className="text-[#9ca3af]">Aucun setter actif trouvé.</p>
            </Card>
          ) : (
            <SetterDashboardView
              key={selectedSetter.id}
              setterProfile={selectedSetter}
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
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Période :</p>
            {[
              { key: 'month', label: 'Mois en cours' },
              { key: 'paie',  label: 'Période de paie' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setPeriodType(opt.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${periodType === opt.key ? 'bg-[#6366f1] border-[#6366f1] text-white' : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#6366f1]/40'}`}
              >
                {opt.label}
              </button>
            ))}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${periodType === 'custom' ? 'border-[#6366f1] bg-[#6366f1]/5' : 'border-[#e5e7eb] bg-white'}`}>
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
              <h2 className="font-bold text-[#1a1a1a]">Comparaison des setters</h2>
              <p className="text-xs text-[#9ca3af] mt-0.5">
                {format(new Date(startDate + 'T12:00:00'), 'd MMM', { locale: fr })} → {format(new Date(endDate + 'T12:00:00'), 'd MMM yyyy', { locale: fr })} · {setters.length} setter{setters.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-5">
              <ComparisonTable setters={setters} startDate={startDate} endDate={endDate} />
            </div>
          </Card>
        </div>
      )}
    </Layout>
  )
}
