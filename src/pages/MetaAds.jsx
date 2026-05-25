import { useState, useEffect, useMemo } from 'react'
import { useMetaCampaigns, useMetaAds, useMetaSync, useMetaInsightsByDate, useMetaAttribution } from '../hooks/useMetaAds'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import { SkeletonCard } from '../components/shared/Skeleton'
import { generateMetaAdsReport } from '../lib/metaAdsPdf'

const STATUS_LABEL = { ACTIVE: 'Actif', PAUSED: 'Pausé', ARCHIVED: 'Archivé' }
const STATUS_DOT   = { ACTIVE: '#10b981', PAUSED: '#f59e0b', ARCHIVED: '#9ca3af' }

function fmt(n, decimals = 0) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('fr-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtCAD(n) {
  if (n == null || n === '') return '—'
  return `${fmt(n, 2)} $`
}
function fmtCADk(n) {
  const v = Number(n ?? 0)
  if (Math.abs(v) >= 10000) return `${fmt(v / 1000, 1)} k$`
  return fmtCAD(v)
}
function todayStr() { return new Date().toISOString().slice(0, 10) }
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

function roasColor(roas) {
  if (roas >= 3) return '#10b981'
  if (roas >= 1) return '#f59e0b'
  return '#ef4444'
}

// Couleur pour un taux % selon des seuils bon/moyen
function rateColor(pct, good, ok) {
  if (pct >= good) return '#10b981'
  if (pct >= ok) return '#f59e0b'
  return '#ef4444'
}

// Petite carte KPI (style dashboard de l'app)
function KpiCard({ label, value, sub, color = '#00bbb1', onClick }) {
  const inner = (
    <Card className={`p-5 h-full ${onClick ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-1 flex items-center gap-1">
            {label}{onClick && <span className="text-[#9ca3af] font-normal normal-case">→</span>}
          </p>
          <p className="text-2xl font-black text-[#1a1a1a]">{value}</p>
          {sub && <p className="text-xs text-[#9ca3af] mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  )
  return onClick ? <button onClick={onClick} className="text-left w-full">{inner}</button> : inner
}

export default function MetaAds() {
  const { campaigns, loading: loadingCamps, refetch: refetchCamps } = useMetaCampaigns()
  const { ads: allAds, loading: loadingAds, refetch: refetchAds } = useMetaAds(null)
  const { sync, syncing, lastSync, error: syncError } = useMetaSync()
  const { insights, loading: loadingInsights, fetchByDate } = useMetaInsightsByDate()

  const [statusFilter, setStatusFilter] = useState('ACTIVE') // ACTIVE | PAUSED | ALL
  const [level, setLevel] = useState('ad')                   // campaign | ad
  const [sortBy, setSortBy] = useState('revenue')
  const [revModel, setRevModel] = useState('ltv')            // ltv | period
  const [simOpen, setSimOpen] = useState(false)
  const [simSpend, setSimSpend] = useState({})               // meta_id → budget simulé
  const [simBeta, setSimBeta] = useState(0.8)                // élasticité de scaling (rendements décroissants)
  const [qualitySort, setQualitySort] = useState('reservations')

  // Période
  const [dateStart, setDateStart] = useState(daysAgoStr(29))
  const [dateEnd,   setDateEnd]   = useState(todayStr())
  const [appliedStart, setAppliedStart] = useState(daysAgoStr(29))
  const [appliedEnd,   setAppliedEnd]   = useState(todayStr())
  const [customApplied, setCustomApplied] = useState(false)

  // Attribution (GHL + QuickBooks) — chargée automatiquement
  const { data: attribution, loading: attLoadingCache, computing: attComputing, computedAt: attComputedAt, error: attError, loadCache, recompute: recomputeAttribution } = useMetaAttribution(appliedStart, appliedEnd)
  const loadingAtt = attLoadingCache || attComputing
  const [detailModal, setDetailModal] = useState(null)

  // Au montage / changement de période : lecture cache instantanée, recalcul seulement si absent
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const hit = await loadCache()
      if (!hit && !cancelled) recomputeAttribution()
    })()
    return () => { cancelled = true }
  }, [loadCache, recomputeAttribution])

  function applyDates() {
    setAppliedStart(dateStart)
    setAppliedEnd(dateEnd)
    setCustomApplied(true)
    fetchByDate(dateStart, dateEnd)
    // l'attribution se recharge (cache) via le changement de appliedStart/End
  }
  function resetDates() {
    const s = daysAgoStr(29), e = todayStr()
    setDateStart(s); setDateEnd(e)
    setAppliedStart(s); setAppliedEnd(e)
    setCustomApplied(false)
    refetchAds()
  }

  const periodLabel = customApplied ? `${appliedStart} → ${appliedEnd}` : '30 derniers jours'

  // ── Métriques d'engagement par ad (cache 30j OU insights custom) ──
  const adEngagement = useMemo(() => {
    if (customApplied && insights.length > 0) {
      return insights.map(ins => {
        const base = allAds.find(a => a.meta_id === ins.ad_id) ?? {}
        return {
          meta_id: ins.ad_id,
          name: ins.ad_name ?? base.name ?? '',
          status: base.status ?? 'ACTIVE',
          adset_name: base.adset_name,
          campaign_id: ins.campaign_id ?? base.campaign_id,
          impressions: Number(ins.impressions ?? 0),
          clicks: Number(ins.clicks ?? 0),
          spend: Number(ins.spend ?? 0),
          ctr: Number(ins.ctr ?? 0),
        }
      })
    }
    return allAds.map(a => ({
      meta_id: a.meta_id, name: a.name, status: a.status, adset_name: a.adset_name,
      campaign_id: a.campaign_id, impressions: a.impressions, clicks: a.clicks, spend: a.spend, ctr: a.ctr,
    }))
  }, [customApplied, insights, allAds])

  const engById = useMemo(() => {
    const m = new Map()
    for (const e of adEngagement) m.set(e.meta_id, e)
    return m
  }, [adEngagement])

  const attByMetaId = useMemo(() => {
    const m = new Map()
    const list = level === 'campaign' ? (attribution?.campaigns ?? []) : (attribution?.ads ?? [])
    for (const r of list) m.set(r.meta_id, r)
    return m
  }, [attribution, level])

  // Extrait clients/revenu selon le modèle sélectionné
  function modelVals(att, spend) {
    const leads = att?.leads ?? 0
    const reservations = att?.reservations ?? 0
    const attended = att?.attended ?? 0
    const clients = att ? (revModel === 'ltv' ? att.clientsLTV : att.clientsPeriod) : 0
    const revenue = att ? (revModel === 'ltv' ? att.revenueLTV : att.revenuePeriod) : 0
    return {
      leads, reservations, attended, clients, revenue,
      cpl: leads > 0 ? spend / leads : 0,
      cpr: reservations > 0 ? spend / reservations : 0,
      cpa: attended > 0 ? spend / attended : 0,
      cac: clients > 0 ? spend / clients : 0,
      showRate: reservations > 0 ? (attended / reservations) * 100 : 0,   // % de réservations présentées
      closeRate: attended > 0 ? (clients / attended) * 100 : 0,            // % de RDV tenus convertis
      bookRate: leads > 0 ? (reservations / leads) * 100 : 0,              // % de leads qui réservent
      ltvPerClient: clients > 0 ? revenue / clients : 0,
      ltvCacRatio: spend > 0 ? revenue / spend : 0, // = (rev/clients)/(spend/clients)
      roas: spend > 0 ? revenue / spend : 0,
      leadList: att?.leadList ?? [],
    }
  }

  // ── Lignes unifiées (Meta + attribution) ──
  const rows = useMemo(() => {
    if (level === 'campaign') {
      return (campaigns ?? []).map(camp => {
        const att = attByMetaId.get(camp.meta_id)
        let impressions = 0, clicks = 0, metaSpend = 0
        for (const e of adEngagement) {
          if (e.campaign_id === camp.meta_id) { impressions += e.impressions || 0; clicks += e.clicks || 0; metaSpend += e.spend || 0 }
        }
        const spend = att?.spend ?? metaSpend
        return {
          meta_id: camp.meta_id, name: camp.name, status: camp.status,
          subtitle: camp.objective ? camp.objective.replace(/_/g, ' ') : '',
          spend, impressions, clicks,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          ...modelVals(att, spend),
        }
      })
    }
    // niveau ad
    return adEngagement.map(e => {
      const att = attByMetaId.get(e.meta_id)
      const spend = att?.spend ?? e.spend ?? 0
      return {
        meta_id: e.meta_id, name: e.name, status: e.status,
        subtitle: e.adset_name ?? '',
        spend, impressions: e.impressions, clicks: e.clicks, ctr: e.ctr,
        ...modelVals(att, spend),
      }
    })
  }, [level, campaigns, adEngagement, attByMetaId, revModel])

  const filteredRows = useMemo(() => {
    let r = statusFilter === 'ALL' ? rows : rows.filter(x => x.status === statusFilter)
    return [...r].sort((a, b) => Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0))
  }, [rows, statusFilter, sortBy])

  // ── Totaux profitabilité (sur les lignes filtrées) ──
  const totals = useMemo(() => {
    const t = filteredRows.reduce((acc, r) => {
      acc.spend += r.spend || 0; acc.leads += r.leads || 0
      acc.reservations += r.reservations || 0; acc.attended += r.attended || 0
      acc.clients += r.clients || 0; acc.revenue += r.revenue || 0
      return acc
    }, { spend: 0, leads: 0, reservations: 0, attended: 0, clients: 0, revenue: 0 })
    t.profit = t.revenue - t.spend
    t.roas = t.spend > 0 ? t.revenue / t.spend : 0
    t.cac = t.clients > 0 ? t.spend / t.clients : 0
    t.cpl = t.leads > 0 ? t.spend / t.leads : 0
    t.cpr = t.reservations > 0 ? t.spend / t.reservations : 0
    t.cpa = t.attended > 0 ? t.spend / t.attended : 0
    t.ltvPerClient = t.clients > 0 ? t.revenue / t.clients : 0
    t.ltvCacRatio = t.spend > 0 ? t.revenue / t.spend : 0
    t.convRate = t.leads > 0 ? (t.clients / t.leads) * 100 : 0
    return t
  }, [filteredRows])

  // ── Où travailler : scaler vs optimiser ──
  const { winners, losers } = useMemo(() => {
    const withSpend = filteredRows.filter(r => r.spend > 50)
    const winners = withSpend.filter(r => r.roas >= 2).sort((a, b) => b.roas - a.roas).slice(0, 3)
    const losers = withSpend.filter(r => r.roas < 1).sort((a, b) => (b.spend - b.revenue) - (a.spend - a.revenue)).slice(0, 3)
    return { winners, losers }
  }, [filteredRows])

  async function handleSync() {
    const ok = await sync()
    if (ok) { refetchCamps(); refetchAds(); recomputeAttribution() }
  }

  function handleExport() {
    generateMetaAdsReport({
      periodStart: appliedStart,
      periodEnd: appliedEnd,
      level,
      revModel,
      totals,
      rows: filteredRows,
    })
  }

  // ── Simulateur : rows au niveau ad (économie unitaire historique) ──
  const adAttById = useMemo(() => {
    const m = new Map()
    for (const r of (attribution?.ads ?? [])) m.set(r.meta_id, r)
    return m
  }, [attribution])

  const simBaseRows = useMemo(() => {
    return adEngagement
      .map(e => {
        const att = adAttById.get(e.meta_id)
        const spend = att?.spend ?? e.spend ?? 0
        return { meta_id: e.meta_id, name: e.name, status: e.status, spend, ...modelVals(att, spend) }
      })
      .filter(r => statusFilter === 'ALL' ? true : r.status === statusFilter)
      .filter(r => r.spend > 0)
      .sort((a, b) => b.spend - a.spend)
  }, [adEngagement, adAttById, statusFilter, revModel]) // eslint-disable-line

  function openSimulator() {
    const init = {}
    for (const r of simBaseRows) init[r.meta_id] = Math.round(r.spend)
    setSimSpend(init)
    setSimOpen(true)
  }

  // Projection d'un ad : rendements décroissants (loi de puissance ^β autour du point actuel)
  function project(r, newSpend) {
    if (r.spend <= 0) return { spend: newSpend, leads: 0, reservations: 0, attended: 0, clients: 0, revenue: 0 }
    const factor = Math.pow(Math.max(newSpend, 0) / r.spend, simBeta)
    return {
      spend: newSpend,
      leads: r.leads * factor,
      reservations: r.reservations * factor,
      attended: r.attended * factor,
      clients: r.clients * factor,
      revenue: r.revenue * factor,
    }
  }

  // Optimiseur : allocation optimale sous rendements décroissants (∝ budget × ROAS^(1/(1-β))),
  // déficitaires (ROAS < 1) coupés, chaque ad plafonné à 3× son budget actuel. Réallocation des surplus.
  function optimizeBudget() {
    const total = simBaseRows.reduce((s, r) => s + r.spend, 0)
    const exp = simBeta < 1 ? 1 / (1 - simBeta) : 5
    const candidates = simBaseRows.filter(r => r.roas >= 1 && r.spend > 0)
    if (candidates.length === 0) { setSimSpend(Object.fromEntries(simBaseRows.map(r => [r.meta_id, 0]))) ; return }

    const next = {}
    for (const r of simBaseRows) if (r.roas < 1) next[r.meta_id] = 0  // couper les perdants

    let pool = candidates.map(r => ({ r, weight: r.spend * Math.pow(r.roas, exp), cap: Math.max(r.spend * 3, 100), alloc: 0 }))
    let budget = total
    // Passes successives : alloue au prorata du poids, plafonne, redistribue le reste
    for (let pass = 0; pass < 6 && budget > 1; pass++) {
      const active = pool.filter(p => p.alloc < p.cap)
      const wSum = active.reduce((s, p) => s + p.weight, 0)
      if (wSum <= 0) break
      let distributed = 0
      for (const p of active) {
        const want = budget * (p.weight / wSum)
        const give = Math.min(want, p.cap - p.alloc)
        p.alloc += give
        distributed += give
      }
      budget -= distributed
      if (distributed < 1) break
    }
    for (const p of pool) next[p.r.meta_id] = Math.round(p.alloc)
    setSimSpend(next)
  }

  function resetSimulator() {
    const init = {}
    for (const r of simBaseRows) init[r.meta_id] = Math.round(r.spend)
    setSimSpend(init)
  }

  // Totaux simulés vs actuels
  const simTotals = useMemo(() => {
    const cur = { spend: 0, leads: 0, reservations: 0, attended: 0, clients: 0, revenue: 0 }
    const proj = { spend: 0, leads: 0, reservations: 0, attended: 0, clients: 0, revenue: 0 }
    for (const r of simBaseRows) {
      cur.spend += r.spend; cur.leads += r.leads; cur.reservations += r.reservations; cur.attended += r.attended; cur.clients += r.clients; cur.revenue += r.revenue
      const p = project(r, Number(simSpend[r.meta_id] ?? r.spend))
      proj.spend += p.spend; proj.leads += p.leads; proj.reservations += p.reservations; proj.attended += p.attended; proj.clients += p.clients; proj.revenue += p.revenue
    }
    cur.roas = cur.spend > 0 ? cur.revenue / cur.spend : 0
    proj.roas = proj.spend > 0 ? proj.revenue / proj.spend : 0
    cur.profit = cur.revenue - cur.spend
    proj.profit = proj.revenue - proj.spend
    return { cur, proj }
  }, [simBaseRows, simSpend, simBeta])

  const dataLoading = loadingCamps || loadingAds || loadingInsights
  const activeCampaigns = (campaigns ?? []).filter(c => c.status === 'ACTIVE').length

  // Tous les leads des lignes affichées (pour les modales du haut)
  const allLeads = useMemo(() => filteredRows.flatMap(r => r.leadList ?? []), [filteredRows])

  // Lien vers Meta Ads Manager pour une campagne / un ad
  const actNum = (attribution?.adAccountId ?? '').replace('act_', '')
  function metaLink(row) {
    if (!actNum) return null
    return level === 'ad'
      ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${actNum}&selected_ad_ids=${row.meta_id}`
      : `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${actNum}&selected_campaign_ids=${row.meta_id}`
  }

  function openTopModal(mode) {
    const byDateDesc = (a, b) => String(b.reservationDate || '').localeCompare(String(a.reservationDate || ''))
    if (mode === 'reservations') {
      setDetailModal({ title: 'Toutes les réservations', mode: 'reservations', list: allLeads.filter(l => l.reservation).sort(byDateDesc) })
    } else if (mode === 'held') {
      setDetailModal({ title: 'Rendez-vous tenus', mode: 'reservations', list: allLeads.filter(l => l.held).sort(byDateDesc) })
    } else if (mode === 'clients') {
      setDetailModal({ title: 'Tous les clients payants', mode: 'clients', list: allLeads.filter(l => (revModel === 'ltv' ? l.revenueLTV : l.revenuePeriod) > 0) })
    } else {
      setDetailModal({ title: 'Tous les leads', mode: 'leads', list: allLeads })
    }
  }

  return (
    <Layout>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-black text-[#1a1a1a]">Publicités Meta</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {periodLabel}{lastSync ? ` · synced ${lastSync.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openSimulator}
            disabled={loadingAtt || simBaseRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-[#00bbb1] text-white text-sm font-bold rounded-xl hover:bg-[#009e94] disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Simulateur
          </button>
          <button
            onClick={handleExport}
            disabled={loadingAtt || filteredRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] text-[#1a1a1a] text-sm font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exporter PDF
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white text-sm font-bold rounded-xl hover:bg-black disabled:opacity-50 transition-colors"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'Sync...' : 'Synchroniser'}
          </button>
        </div>
      </div>

      {/* ── Barre période ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <input type="date" value={dateStart} max={dateEnd} onChange={e => setDateStart(e.target.value)}
          className="text-sm border border-[#e5e7eb] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30" />
        <span className="text-[#9ca3af]">→</span>
        <input type="date" value={dateEnd} min={dateStart} max={todayStr()} onChange={e => setDateEnd(e.target.value)}
          className="text-sm border border-[#e5e7eb] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30" />
        <button onClick={applyDates} disabled={loadingInsights}
          className="px-4 py-2 bg-[#00bbb1] text-white text-sm font-bold rounded-xl hover:bg-[#009e94] disabled:opacity-50 transition-colors">
          {loadingInsights ? '...' : 'Appliquer'}
        </button>
        {customApplied && (
          <button onClick={resetDates}
            className="px-3 py-2 text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a] transition-colors">
            30 jours
          </button>
        )}
        <div className="flex-1" />
        {[['ACTIVE', 'Actif'], ['PAUSED', 'Pausé'], ['ALL', 'Tous']].map(([k, lbl]) => (
          <button key={k} onClick={() => setStatusFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${statusFilter === k ? 'bg-[#1a1a1a] text-white' : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:text-[#1a1a1a]'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Toggle modèle de revenu ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex gap-1 bg-[#f3f4f6] rounded-lg p-1">
          <button onClick={() => setRevModel('ltv')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${revModel === 'ltv' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#6b7280]'}`}>
            Nouveaux clients
          </button>
          <button onClick={() => setRevModel('period')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${revModel === 'period' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#6b7280]'}`}>
            Tous les clients
          </button>
        </div>
        <p className="text-xs text-[#9ca3af]">
          {revModel === 'ltv'
            ? 'Revenu des leads acquis dans la période (nouveaux clients de ces pubs) — pour décider quoi scaler'
            : 'Tout le cash encaissé dans la période, incluant les versements récurrents d\'anciens clients — pour la trésorerie'}
        </p>
      </div>

      {syncError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">Erreur sync: {syncError}</div>}

      {/* ── HERO : Profitabilité ── */}
      <div className="rounded-2xl px-6 py-6 text-white mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #00bbb1 0%, #009e94 100%)' }}>
        <div className="flex items-start justify-between flex-wrap gap-6">
          <div>
            <p className="text-sm font-semibold text-white/80 mb-1">ROAS réel — retour sur dépenses publicitaires</p>
            <p className="text-5xl font-black leading-none">
              {loadingAtt ? '...' : totals.roas > 0 ? `${fmt(totals.roas, 2)}x` : '—'}
            </p>
            <p className="text-sm text-white/70 mt-2">
              {totals.profit >= 0 ? 'Profit net' : 'Perte nette'} :{' '}
              <span className="font-bold text-white">{fmtCAD(Math.abs(totals.profit))}</span>
              {' '}({periodLabel})
            </p>
          </div>
          <div className="flex gap-8">
            <div>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Revenu encaissé</p>
              <p className="text-2xl font-black mt-1">{loadingAtt ? '...' : fmtCADk(totals.revenue)}</p>
              <p className="text-xs text-white/60 mt-0.5">QuickBooks (net)</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Dépenses pub</p>
              <p className="text-2xl font-black mt-1">{fmtCADk(totals.spend)}</p>
              <p className="text-xs text-white/60 mt-0.5">Meta Ads</p>
            </div>
          </div>
        </div>
        {attribution && !attribution.qbConnected && (
          <div className="mt-4 text-xs bg-white/15 rounded-lg px-3 py-2 inline-block">
            ⚠ QuickBooks non connecté — le revenu est à 0. Connecte-le dans Paramètres.
          </div>
        )}
        {attError && (
          <div className="mt-4 text-xs bg-white/15 rounded-lg px-3 py-2 inline-block">Attribution indisponible: {attError}</div>
        )}
      </div>

      {/* ── KPIs secondaires ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Leads générés" value={loadingAtt ? '...' : fmt(totals.leads)} sub={`CPL ${totals.cpl > 0 ? fmtCAD(totals.cpl) : '—'}`} color="#00bbb1" onClick={() => openTopModal('leads')} />
        <KpiCard label="Réservations" value={loadingAtt ? '...' : fmt(totals.reservations)} sub={`CPR ${totals.cpr > 0 ? fmtCAD(totals.cpr) : '—'}`} color="#0ea5e9" onClick={() => openTopModal('reservations')} />
        <KpiCard label="RDV tenus" value={loadingAtt ? '...' : fmt(totals.attended)} sub={`CPA ${totals.cpa > 0 ? fmtCAD(totals.cpa) : '—'}`} color="#6366f1" onClick={() => openTopModal('held')} />
        <KpiCard label="Clients payants" value={loadingAtt ? '...' : fmt(totals.clients)} sub={`CAC ${totals.cac > 0 ? fmtCAD(totals.cac) : '—'}`} color="#10b981" onClick={() => openTopModal('clients')} />
      </div>

      {/* ── Unit economics : LTV par client vs CAC ── */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-8">
            <div>
              <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-1">LTV moyen / client</p>
              <p className="text-2xl font-black text-[#1a1a1a]">{loadingAtt ? '...' : fmtCAD(totals.ltvPerClient)}</p>
              <p className="text-xs text-[#9ca3af] mt-0.5">{revModel === 'ltv' ? 'valeur vie' : 'encaissé période'}</p>
            </div>
            <div className="text-[#d1d5db] text-2xl font-light">÷</div>
            <div>
              <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-1">CAC (coût/client)</p>
              <p className="text-2xl font-black text-[#1a1a1a]">{loadingAtt ? '...' : (totals.cac > 0 ? fmtCAD(totals.cac) : '—')}</p>
              <p className="text-xs text-[#9ca3af] mt-0.5">acquisition</p>
            </div>
            <div className="text-[#d1d5db] text-2xl font-light">=</div>
            <div>
              <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-1">Ratio LTV:CAC</p>
              <p className="text-3xl font-black" style={{ color: totals.ltvCacRatio >= 3 ? '#10b981' : totals.ltvCacRatio >= 1 ? '#f59e0b' : '#ef4444' }}>
                {loadingAtt ? '...' : totals.ltvCacRatio > 0 ? `${fmt(totals.ltvCacRatio, 1)} : 1` : '—'}
              </p>
            </div>
          </div>
          <div className="max-w-[260px] text-xs text-[#6b7280] bg-[#f9fafb] rounded-lg px-3 py-2">
            {totals.ltvCacRatio >= 3
              ? '🟢 Sain (≥ 3:1). Tu peux scaler tes dépenses pub en confiance.'
              : totals.ltvCacRatio >= 1
                ? '🟠 Rentable mais serré (1–3:1). Optimise le funnel ou le prix avant de scaler fort.'
                : '🔴 Déficitaire (< 1:1). Chaque client coûte plus cher qu\'il ne rapporte.'}
          </div>
        </div>
      </Card>

      {/* ── Où travailler ── */}
      {!loadingAtt && (winners.length > 0 || losers.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🚀</span>
              <h2 className="text-sm font-bold text-[#1a1a1a]">À scaler — meilleur rendement</h2>
            </div>
            {winners.length === 0 ? <p className="text-sm text-[#9ca3af]">Aucun {level === 'campaign' ? 'campagne' : 'ad'} avec ROAS ≥ 2x sur la période.</p> : (
              <div className="space-y-2.5">
                {winners.map(r => (
                  <div key={r.meta_id} className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#1a1a1a] truncate flex-1">{r.name}</p>
                    <span className="text-xs text-[#6b7280]">{fmtCAD(r.spend)} → {fmtCAD(r.revenue)}</span>
                    <span className="text-sm font-black flex-shrink-0" style={{ color: roasColor(r.roas) }}>{fmt(r.roas, 1)}x</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚠️</span>
              <h2 className="text-sm font-bold text-[#1a1a1a]">À optimiser — perd de l'argent</h2>
            </div>
            {losers.length === 0 ? <p className="text-sm text-[#9ca3af]">Aucun {level === 'campaign' ? 'campagne' : 'ad'} déficitaire. 🎉</p> : (
              <div className="space-y-2.5">
                {losers.map(r => (
                  <div key={r.meta_id} className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#1a1a1a] truncate flex-1">{r.name}</p>
                    <span className="text-xs text-red-500 font-semibold">−{fmtCAD(r.spend - r.revenue)}</span>
                    <span className="text-sm font-black flex-shrink-0" style={{ color: roasColor(r.roas) }}>{fmt(r.roas, 1)}x</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Tableau détaillé unifié ── */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e5e7eb] flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 bg-[#f3f4f6] rounded-lg p-1">
            {[['campaign', 'Par campagne'], ['ad', 'Par ad']].map(([k, lbl]) => (
              <button key={k} onClick={() => setLevel(k)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${level === k ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#6b7280]'}`}>
                {lbl}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {attComputing ? (
              <span className="text-xs text-[#9ca3af]">Calcul du ROAS...</span>
            ) : (
              <button onClick={recomputeAttribution} className="text-xs font-semibold text-[#00bbb1] hover:underline">
                Recalculer{attComputedAt ? ` · ${new Date(attComputedAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </button>
            )}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="text-xs border border-[#e5e7eb] rounded-lg px-2 py-1.5 text-[#6b7280] focus:outline-none">
              <option value="revenue">Trier : Revenu</option>
              <option value="roas">Trier : ROAS</option>
              <option value="spend">Trier : Dépenses</option>
              <option value="leads">Trier : Leads</option>
              <option value="reservations">Trier : Réservations</option>
              <option value="clients">Trier : Clients</option>
            </select>
          </div>
        </div>

        {dataLoading ? (
          <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6b7280]">Aucune donnée. Clique sur « Synchroniser ».</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f3f4f6] bg-[#f9fafb] text-[#6b7280]">
                  <th className="text-left px-5 py-2.5 text-xs font-bold uppercase tracking-wide">{level === 'campaign' ? 'Campagne' : 'Ad'}</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Dépenses</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Leads</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">CPL</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Résa</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">CPR</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Clients</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Revenu</th>
                  <th className="text-right px-5 py-2.5 text-xs font-bold uppercase tracking-wide">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {filteredRows.map(r => (
                  <tr key={r.meta_id} className="hover:bg-[#f9fafb] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_DOT[r.status] ?? '#9ca3af' }} title={STATUS_LABEL[r.status] ?? r.status} />
                        <div className="min-w-0">
                          {metaLink(r) ? (
                            <a href={metaLink(r)} target="_blank" rel="noopener noreferrer"
                              className="font-semibold text-[#1a1a1a] hover:text-[#00bbb1] hover:underline truncate max-w-[220px] inline-flex items-center gap-1">
                              <span className="truncate">{r.name}</span>
                              <svg className="w-3 h-3 flex-shrink-0 text-[#9ca3af]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </a>
                          ) : (
                            <p className="font-semibold text-[#1a1a1a] truncate max-w-[220px]">{r.name}</p>
                          )}
                          {r.subtitle && <p className="text-xs text-[#9ca3af] truncate max-w-[220px]">{r.subtitle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-[#1a1a1a]">{fmtCAD(r.spend)}</td>
                    <td className="px-3 py-3 text-right">
                      {r.leads > 0 ? (
                        <button onClick={() => setDetailModal({ title: r.name, mode: 'leads', list: r.leadList })}
                          className="font-semibold text-[#00bbb1] hover:underline">{fmt(r.leads)}</button>
                      ) : <span className="text-[#9ca3af]">0</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-[#6b7280]">{r.cpl > 0 ? fmtCAD(r.cpl) : '—'}</td>
                    <td className="px-3 py-3 text-right">
                      {r.reservations > 0 ? (
                        <button onClick={() => setDetailModal({ title: r.name, mode: 'reservations', list: r.leadList.filter(l => l.reservation).sort((a, b) => String(b.reservationDate || '').localeCompare(String(a.reservationDate || ''))) })}
                          className="font-semibold text-[#0ea5e9] hover:underline">{fmt(r.reservations)}</button>
                      ) : <span className="text-[#9ca3af]">0</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-[#6b7280]">{r.cpr > 0 ? fmtCAD(r.cpr) : '—'}</td>
                    <td className="px-3 py-3 text-right">
                      {r.clients > 0 ? (
                        <button onClick={() => setDetailModal({ title: r.name, mode: 'clients', list: r.leadList.filter(l => (revModel === 'ltv' ? l.revenueLTV : l.revenuePeriod) > 0) })}
                          className="font-semibold text-[#10b981] hover:underline">{fmt(r.clients)}</button>
                      ) : <span className="text-[#9ca3af]">0</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-[#10b981]">{r.revenue > 0 ? fmtCAD(r.revenue) : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-black" style={{ color: r.roas > 0 ? roasColor(r.roas) : '#9ca3af' }}>
                        {r.roas > 0 ? `${fmt(r.roas, 2)}x` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#e5e7eb] bg-[#f9fafb] font-black text-[#1a1a1a]">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-3 py-3 text-right">{fmtCAD(totals.spend)}</td>
                  <td className="px-3 py-3 text-right">{fmt(totals.leads)}</td>
                  <td className="px-3 py-3 text-right text-[#6b7280]">{totals.cpl > 0 ? fmtCAD(totals.cpl) : '—'}</td>
                  <td className="px-3 py-3 text-right">{fmt(totals.reservations)}</td>
                  <td className="px-3 py-3 text-right text-[#6b7280]">{totals.cpr > 0 ? fmtCAD(totals.cpr) : '—'}</td>
                  <td className="px-3 py-3 text-right">{fmt(totals.clients)}</td>
                  <td className="px-3 py-3 text-right text-[#10b981]">{fmtCAD(totals.revenue)}</td>
                  <td className="px-5 py-3 text-right" style={{ color: roasColor(totals.roas) }}>{totals.roas > 0 ? `${fmt(totals.roas, 2)}x` : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="px-5 py-2.5 text-xs text-[#9ca3af] border-t border-[#f3f4f6]">
          Leads = contacts GHL avec UTM · Résa = rencontres découvertes bookées · Revenu net QuickBooks (ventes − remboursements) par nom de client ·{' '}
          {revModel === 'ltv' ? 'Modèle LTV : valeur totale des leads de la période' : 'Modèle période : cash encaissé dans la période'}
          {attribution ? ` · ${attribution.contactsMatched} contacts cohorte` : ''}
        </p>
      </Card>

      {/* ── Volume vs Qualité (funnel de conversion par ad) ── */}
      {!loadingAtt && filteredRows.some(r => r.reservations > 0) && (
        <Card className="overflow-hidden mt-6">
          <div className="px-5 py-3.5 border-b border-[#e5e7eb] flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#1a1a1a]">Volume vs Qualité — funnel de conversion</h2>
              <p className="text-xs text-[#6b7280] mt-0.5">Quel {level === 'campaign' ? 'campagne' : 'ad'} amène du volume cheap vs des leads qui se présentent et ferment</p>
            </div>
            <select value={qualitySort} onChange={e => setQualitySort(e.target.value)}
              className="text-xs border border-[#e5e7eb] rounded-lg px-2 py-1.5 text-[#6b7280] focus:outline-none">
              <option value="reservations">Trier : Réservations</option>
              <option value="leads">Trier : Leads</option>
              <option value="bookRate">Trier : Taux résa</option>
              <option value="attended">Trier : RDV tenus</option>
              <option value="showRate">Trier : Show-rate</option>
              <option value="clients">Trier : Clients</option>
              <option value="closeRate">Trier : Close-rate</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f3f4f6] bg-[#f9fafb] text-[#6b7280]">
                  <th className="text-left px-5 py-2.5 text-xs font-bold uppercase tracking-wide">{level === 'campaign' ? 'Campagne' : 'Ad'}</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Leads</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Résa</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Taux résa</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">RDV tenus</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Show-rate</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Clients</th>
                  <th className="text-right px-5 py-2.5 text-xs font-bold uppercase tracking-wide">Close-rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {[...filteredRows].filter(r => r.reservations > 0 || r.leads > 0).sort((a, b) => Number(b[qualitySort] ?? 0) - Number(a[qualitySort] ?? 0)).map(r => (
                  <tr key={r.meta_id} className="hover:bg-[#f9fafb] transition-colors">
                    <td className="px-5 py-3 font-semibold text-[#1a1a1a] max-w-[220px] truncate">{r.name}</td>
                    <td className="px-3 py-3 text-right text-[#6b7280]">{fmt(r.leads)}</td>
                    <td className="px-3 py-3 text-right text-[#6b7280]">{fmt(r.reservations)}</td>
                    <td className="px-3 py-3 text-right font-semibold" style={{ color: rateColor(r.bookRate, 25, 12) }}>{r.leads > 0 ? `${fmt(r.bookRate, 0)}%` : '—'}</td>
                    <td className="px-3 py-3 text-right text-[#6b7280]">{fmt(r.attended)}</td>
                    <td className="px-3 py-3 text-right font-semibold" style={{ color: rateColor(r.showRate, 70, 50) }}>{r.reservations > 0 ? `${fmt(r.showRate, 0)}%` : '—'}</td>
                    <td className="px-3 py-3 text-right text-[#6b7280]">{fmt(r.clients)}</td>
                    <td className="px-5 py-3 text-right font-bold" style={{ color: rateColor(r.closeRate, 30, 15) }}>{r.attended > 0 ? `${fmt(r.closeRate, 0)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#e5e7eb] bg-[#f9fafb] font-black text-[#1a1a1a]">
                  <td className="px-5 py-3">Total / moyenne</td>
                  <td className="px-3 py-3 text-right">{fmt(totals.leads)}</td>
                  <td className="px-3 py-3 text-right">{fmt(totals.reservations)}</td>
                  <td className="px-3 py-3 text-right">{totals.leads > 0 ? `${fmt(totals.reservations / totals.leads * 100, 0)}%` : '—'}</td>
                  <td className="px-3 py-3 text-right">{fmt(totals.attended)}</td>
                  <td className="px-3 py-3 text-right">{totals.reservations > 0 ? `${fmt(totals.attended / totals.reservations * 100, 0)}%` : '—'}</td>
                  <td className="px-3 py-3 text-right">{fmt(totals.clients)}</td>
                  <td className="px-5 py-3 text-right">{totals.attended > 0 ? `${fmt(totals.clients / totals.attended * 100, 0)}%` : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-5 py-2.5 text-xs text-[#9ca3af] border-t border-[#f3f4f6]">
            <b>Taux résa</b> = réservations ÷ leads · <b>Show-rate</b> = RDV tenus ÷ réservations (se présentent-ils ?) · <b>Close-rate</b> = clients ÷ RDV tenus (capacité à fermer). 🟢 bon · 🟠 moyen · 🔴 faible.
          </p>
        </Card>
      )}

      {/* ── Modale détail ── */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetailModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1a1a1a]">
                  {detailModal.mode === 'clients' ? 'Clients payants' : detailModal.mode === 'reservations' ? 'Réservations (rencontres découvertes)' : 'Leads'}
                </h3>
                <p className="text-xs text-[#6b7280] mt-0.5 truncate max-w-[380px]">{detailModal.title}</p>
              </div>
              <button onClick={() => setDetailModal(null)} className="text-[#6b7280] hover:text-[#1a1a1a]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto">
              {detailModal.list.length === 0 ? <p className="p-6 text-center text-sm text-[#6b7280]">Aucun contact.</p> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#f3f4f6] bg-[#f9fafb]">
                      <th className="text-left px-5 py-2 text-xs font-semibold text-[#6b7280]">Nom</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-[#6b7280]">Email</th>
                      {detailModal.mode === 'reservations' && <th className="text-right px-5 py-2 text-xs font-semibold text-[#6b7280]">Rendez-vous</th>}
                      {detailModal.mode === 'clients' && <th className="text-right px-5 py-2 text-xs font-semibold text-[#6b7280]">Revenu</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f3f4f6]">
                    {detailModal.list.map((l, i) => (
                      <tr key={i} className="hover:bg-[#f9fafb]">
                        <td className="px-5 py-2.5 text-[#1a1a1a] font-medium">{l.name || '—'}</td>
                        <td className="px-3 py-2.5 text-[#6b7280] truncate max-w-[200px]">{l.email || '—'}</td>
                        {detailModal.mode === 'reservations' && <td className="px-5 py-2.5 text-right text-[#6b7280]">{l.reservationDate ? new Date(l.reservationDate).toLocaleDateString('fr-CA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>}
                        {detailModal.mode === 'clients' && <td className="px-5 py-2.5 text-right font-semibold text-[#10b981]">{fmtCAD(revModel === 'ltv' ? l.revenueLTV : l.revenuePeriod)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#e5e7eb] text-xs text-[#9ca3af]">
              {detailModal.list.length} contact{detailModal.list.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}

      {/* ── Simulateur de budget ── */}
      {simOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSimOpen(false)}>
          <div className="bg-[#f5f5f7] rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 bg-white rounded-t-2xl border-b border-[#e5e7eb] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-lg font-black text-[#1a1a1a]">Simulateur de budget</h3>
                <p className="text-xs text-[#6b7280] mt-0.5">Modifie les budgets pour projeter les résultats · basé sur {periodLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-start mr-1">
                  <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide mb-0.5">Hypothèse de scaling</span>
                  <div className="flex gap-1 bg-[#f3f4f6] rounded-lg p-0.5">
                    {[['Conservateur', 0.65], ['Réaliste', 0.8], ['Optimiste', 0.9]].map(([lbl, b]) => (
                      <button key={lbl} onClick={() => setSimBeta(b)}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${simBeta === b ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#6b7280]'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={optimizeBudget} className="flex items-center gap-2 px-4 py-2 bg-[#00bbb1] text-white text-sm font-bold rounded-xl hover:bg-[#009e94] transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Optimiser (auto)
                </button>
                <button onClick={resetSimulator} className="px-3 py-2 text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a]">Réinitialiser</button>
                <button onClick={() => setSimOpen(false)} className="text-[#6b7280] hover:text-[#1a1a1a]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Résumé actuel vs projeté */}
            <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Dépenses', fmtCAD(simTotals.cur.spend), fmtCAD(simTotals.proj.spend)],
                ['Clients', fmt(simTotals.cur.clients, 0), fmt(simTotals.proj.clients, 0)],
                ['Revenu', fmtCAD(simTotals.cur.revenue), fmtCAD(simTotals.proj.revenue)],
                ['ROAS', simTotals.cur.roas > 0 ? `${fmt(simTotals.cur.roas, 2)}x` : '—', simTotals.proj.roas > 0 ? `${fmt(simTotals.proj.roas, 2)}x` : '—'],
              ].map(([label, cur, proj]) => (
                <Card key={label} className="p-4">
                  <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-2">{label}</p>
                  <div className="flex items-end justify-between gap-2">
                    <div><p className="text-[10px] text-[#9ca3af]">Actuel</p><p className="text-sm font-semibold text-[#6b7280]">{cur}</p></div>
                    <svg className="w-4 h-4 text-[#d1d5db] mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    <div className="text-right"><p className="text-[10px] text-[#00bbb1]">Projeté</p><p className="text-lg font-black text-[#1a1a1a]">{proj}</p></div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Tableau éditable */}
            <div className="px-6 pb-2 overflow-y-auto flex-1">
              <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#f3f4f6] bg-[#f9fafb] text-[#6b7280]">
                      <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Ad</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">ROAS hist.</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Budget actuel</th>
                      <th className="text-center px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Nouveau budget</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Leads proj.</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Résa proj.</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">RDV tenus proj.</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Clients proj.</th>
                      <th className="text-right px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Revenu proj.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f3f4f6]">
                    {simBaseRows.map(r => {
                      const newSpend = Number(simSpend[r.meta_id] ?? r.spend)
                      const p = project(r, newSpend)
                      const delta = newSpend - r.spend
                      return (
                        <tr key={r.meta_id} className="hover:bg-[#f9fafb]">
                          <td className="px-4 py-2.5 font-semibold text-[#1a1a1a] max-w-[200px] truncate">{r.name}</td>
                          <td className="px-3 py-2.5 text-right font-bold" style={{ color: roasColor(r.roas) }}>{r.roas > 0 ? `${fmt(r.roas, 2)}x` : '—'}</td>
                          <td className="px-3 py-2.5 text-right text-[#6b7280]">{fmtCAD(r.spend)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-[#9ca3af]">$</span>
                              <input
                                type="number" min="0" step="50"
                                value={Math.round(newSpend)}
                                onChange={e => setSimSpend(s => ({ ...s, [r.meta_id]: Number(e.target.value) }))}
                                className="w-24 text-right border border-[#e5e7eb] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30"
                              />
                              {delta !== 0 && (
                                <span className={`text-xs font-semibold ${delta > 0 ? 'text-[#10b981]' : 'text-red-500'}`}>
                                  {delta > 0 ? '+' : ''}{Math.round(delta / r.spend * 100)}%
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-[#6b7280]">{fmt(p.leads, 0)}</td>
                          <td className="px-3 py-2.5 text-right text-[#6b7280]">{fmt(p.reservations, 0)}</td>
                          <td className="px-3 py-2.5 text-right text-[#6b7280]">{fmt(p.attended, 0)}</td>
                          <td className="px-3 py-2.5 text-right text-[#6b7280]">{fmt(p.clients, 1)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#10b981]">{fmtCAD(p.revenue)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-3 text-xs text-[#9ca3af]">
              📈 Modèle à <b>rendements décroissants</b> (β = {simBeta}) : doubler un budget donne ×{fmt(Math.pow(2, simBeta), 2)} les résultats, pas ×2. Le ROAS baisse quand tu scales, monte quand tu coupes — comme en réalité. L'optimiseur alloue vers les meilleurs ROAS (plafond 3×) et coupe les ads à ROAS &lt; 1.
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
