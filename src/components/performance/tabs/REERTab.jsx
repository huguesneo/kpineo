import { useMemo, useState, useEffect } from 'react'
import Card from '../../shared/Card'
import Button from '../../shared/Button'
import Badge from '../../shared/Badge'
import MonthNavigator from '../../shared/MonthNavigator'
import MargeSeuilsModal from '../components/MargeSeuilsModal'
import NaturoDossier from '../components/NaturoDossier'
import AdminContribInbox from '../components/AdminContribInbox'
import CloeDossier from '../components/CloeDossier'
import { supabase } from '../../../lib/supabase'
import {
  NATUROS, calcREER, calcProfitNEO, contribKey,
  formatCAD, formatPct, hasMonthData, num,
} from '../../../lib/performanceCalc'

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

function ContribRow({ naturo, value, info, onChange }) {
  const { cap, match, eligible, marge, seuil, raison } = info
  let statut
  if (eligible) statut = <Badge variant="success">NEO verse</Badge>
  else statut = <Badge variant="danger">0 $</Badge>

  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b border-[#f1f5f9] last:border-0">
      <span className="col-span-2 text-sm font-semibold text-[#1a1a1a]">{naturo.label}</span>
      <div className="col-span-3 relative">
        <input
          type="number"
          value={value === 0 || value ? value : ''}
          onChange={e => onChange(e.target.value)}
          placeholder="0"
          className="w-full px-3 py-2 pr-7 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9ca3af]">$</span>
      </div>
      <span className="col-span-3 text-xs text-[#6b7280]">
        Marge{' '}
        <span className={marge != null && marge >= seuil ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>
          {marge != null ? formatPct(marge / 100, 1) : '—'}
        </span>
        {' '}/ seuil {num(seuil)} %
        <span className="block text-[10px] text-[#9ca3af]" title="Plafond = 3 % du salaire mensuel">plafond {formatCAD(cap)}</span>
      </span>
      <span className="col-span-2 text-right text-sm font-bold text-[#00bbb1]">{formatCAD(match)}</span>
      <span className="col-span-2 text-right" title={raison}>{statut}</span>
    </div>
  )
}

// Ligne de Cloé dans la carte « Cotisations du mois » (KPI au lieu de marge).
function CloeContribRow({ value, cloe, onChange }) {
  const statut = cloe.eligible
    ? <Badge variant="success">NEO verse</Badge>
    : <Badge variant="danger">0 $</Badge>
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-t-2 border-[#e5e7eb]">
      <span className="col-span-2 text-sm font-semibold text-[#1a1a1a]">
        Cloé <span className="block text-[10px] font-normal text-[#9ca3af]">réseaux</span>
      </span>
      <div className="col-span-3 relative">
        <input
          type="number"
          value={value === 0 || value ? value : ''}
          onChange={e => onChange(e.target.value)}
          placeholder="0"
          className="w-full px-3 py-2 pr-7 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9ca3af]">$</span>
      </div>
      <span className="col-span-3 text-xs text-[#6b7280]">
        Reels{' '}
        <span className={cloe.reelsOK ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>{cloe.reels}/{cloe.seuilReels}</span>
        {cloe.leadsActive && (
          <> · Leads <span className={cloe.leadsOK ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>{cloe.leads}/{cloe.seuilLeads}</span></>
        )}
        <span className="block text-[10px] text-[#9ca3af]" title="Plafond = 3 % du salaire mensuel">plafond {formatCAD(cloe.cap)}</span>
      </span>
      <span className="col-span-2 text-right text-sm font-bold text-[#00bbb1]">{formatCAD(cloe.montant)}</span>
      <span className="col-span-2 text-right" title={cloe.raison}>{statut}</span>
    </div>
  )
}

export default function REERTab({ data }) {
  const { months, params, selectedMonth, selectMonth, getMonthData, saveMonth } = data
  const { year, month } = selectedMonth

  // Sous-menu : 'overview' ou la clé d'un naturo (son dossier)
  const [view, setView] = useState('overview')
  const [seuilsOpen, setSeuilsOpen] = useState(false)

  // Notification temps réel : un naturo soumet une cotisation → rafraîchir la boîte admin
  useEffect(() => {
    if (!data.refetchSnapshots) return
    const ch = supabase
      .channel('reer-contrib')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'neo_naturo_monthly' }, () => {
        data.refetchSnapshots()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [data])

  // ----- Saisie des cotisations du mois sélectionné -----
  const monthRecord = getMonthData(year, month)
  const [contribs, setContribs] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const rec = getMonthData(year, month) || {}
    const init = {}
    NATUROS.forEach(n => { init[n.key] = rec[contribKey(n.key)] ?? '' })
    init.cloe = rec.cotisation_cloe ?? ''
    setContribs(init)
    setDirty(false)
  }, [year, month, getMonthData])

  // Métriques du mois (avec cotisations en cours d'édition) pour calculer le match
  const liveMetrics = useMemo(() => {
    const m = { ...(monthRecord || {}), year, month }
    NATUROS.forEach(n => { m[contribKey(n.key)] = num(contribs[n.key]) })
    m.cotisation_cloe = num(contribs.cloe)
    return m
  }, [monthRecord, contribs, year, month])

  const reer = calcREER(liveMetrics, params)
  const neo = calcProfitNEO(liveMetrics, params)
  const filled = hasMonthData(liveMetrics)

  function setContrib(key, val) {
    setContribs(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = { year, month }
    NATUROS.forEach(n => { payload[contribKey(n.key)] = num(contribs[n.key]) })
    payload.cotisation_cloe = num(contribs.cloe)
    await saveMonth(payload)
    setSaving(false)
    setDirty(false)
  }

  // ----- Totaux annuels -----
  const availableYears = useMemo(() => {
    const ys = [...new Set(months.map(m => m.year))].sort((a, b) => b - a)
    return ys.length ? ys : [new Date().getFullYear()]
  }, [months])
  const [tableYear, setTableYear] = useState(year)

  const yearMonths = useMemo(
    () => months.filter(m => m.year === tableYear).sort((a, b) => a.month - b.month),
    [months, tableYear],
  )
  const monthlyReer = useMemo(
    () => yearMonths.map(m => ({ month: m.month, reer: calcREER(m, params) })),
    [yearMonths, params],
  )

  const ytdMatch = {}
  const ytdContrib = {}
  NATUROS.forEach(n => {
    ytdMatch[n.key] = monthlyReer.reduce((s, mr) => s + num(mr.reer.parNaturo[n.key]), 0)
    ytdContrib[n.key] = monthlyReer.reduce((s, mr) => s + num(mr.reer.perNaturo[n.key].contrib), 0)
  })
  const totalNEO = monthlyReer.reduce((s, mr) => s + num(mr.reer.total_match), 0)
  const totalMembres = monthlyReer.reduce((s, mr) => s + num(mr.reer.total_contrib), 0)
  const ytdCloe = monthlyReer.reduce((s, mr) => s + num(mr.reer.cloe?.montant), 0)
  const ytdCloeContrib = monthlyReer.reduce((s, mr) => s + num(mr.reer.cloe?.cotisation), 0)

  return (
    <div className="space-y-6">
      {/* Sous-menu : vue d'ensemble + dossier par naturo */}
      <div className="flex gap-1 border-b border-[#e5e7eb] overflow-x-auto">
        <button
          onClick={() => setView('overview')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${view === 'overview' ? 'border-[#00bbb1] text-[#00bbb1]' : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'}`}
        >
          Vue d'ensemble
        </button>
        {NATUROS.map(n => (
          <button
            key={n.key}
            onClick={() => setView(n.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${view === n.key ? 'border-[#00bbb1] text-[#00bbb1]' : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'}`}
          >
            {n.label}
          </button>
        ))}
        <button
          onClick={() => setView('cloe')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${view === 'cloe' ? 'border-[#00bbb1] text-[#00bbb1]' : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'}`}
        >
          Cloé
        </button>
      </div>

      {view === 'cloe' ? (
        <CloeDossier data={data} />
      ) : view !== 'overview' ? (
        <NaturoDossier naturoKey={view} data={data} />
      ) : (
      <>
      {/* Rappel du modèle */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-sm font-bold text-[#1a1a1a]">Modèle REER — cotisation égalée</h3>
          <Button variant="secondary" size="sm" onClick={() => setSeuilsOpen(true)}>Modifier les seuils de marge</Button>
        </div>
        <p className="text-sm text-[#6b7280]">
          NEO verse pour un naturo ce mois si <span className="font-semibold">les 4 conditions</span> sont remplies :
          (1) le naturo a cotisé (preuve reçue), (2) Profit NEO ≥ <span className="font-semibold">{formatCAD(params.reer_plancher)}</span>,
          (3) marge individuelle du naturo ≥ son seuil personnel,
          (4) NEO égale la cotisation, plafonnée à <span className="font-semibold">{formatPct(params.reer_match_cap_pct ?? 0.03, 0)}</span> du salaire mensuel.
        </p>
      </Card>

      <AdminContribInbox
        snapshots={data.naturoSnapshots}
        params={params}
        onConfirm={data.confirmNeoContribution}
      />

      {/* Saisie des cotisations du mois */}
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="text-sm font-bold text-[#1a1a1a]">Cotisations du mois</h3>
          <div className="flex items-center gap-3">
            <MonthNavigator month={month} year={year} onChange={(m, y) => selectMonth(y, m)} />
            {dirty && <span className="text-xs font-semibold text-amber-600">Non sauvegardé</span>}
          </div>
        </div>

        {!filled ? (
          <p className="text-sm text-[#9ca3af]">Aucune donnée financière pour ce mois — saisis d'abord le mois (onglet Mensuel) pour connaître le profit.</p>
        ) : (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="text-[#6b7280]">Profit NEO du mois : <span className="font-bold text-[#1a1a1a]">{formatCAD(neo.profit_neo)}</span></span>
            {reer.plancherAtteint
              ? <Badge variant="success">▲ Plancher atteint</Badge>
              : <Badge variant="danger">▼ Sous le plancher — aucun versement NEO</Badge>}
          </div>
        )}

        <div className="grid grid-cols-12 gap-2 pb-1 text-[10px] font-bold text-[#9ca3af] uppercase">
          <span className="col-span-2">Naturo</span>
          <span className="col-span-3">A cotisé ($)</span>
          <span className="col-span-3">Marge / KPI</span>
          <span className="col-span-2 text-right">NEO verse</span>
          <span className="col-span-2 text-right">Statut</span>
        </div>
        {NATUROS.map(n => (
          <ContribRow
            key={n.key}
            naturo={n}
            value={contribs[n.key]}
            info={reer.perNaturo[n.key]}
            onChange={v => setContrib(n.key, v)}
          />
        ))}
        {reer.cloe && (
          <CloeContribRow value={contribs.cloe} cloe={reer.cloe} onChange={v => setContrib('cloe', v)} />
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#e5e7eb]">
          <div className="flex gap-6 text-sm">
            <span className="text-[#6b7280]">Membres : <span className="font-bold text-[#1a1a1a]">{formatCAD(reer.total_contrib)}</span></span>
            <span className="text-[#6b7280]">NEO : <span className="font-bold text-[#00bbb1]">{formatCAD(reer.total_match)}</span></span>
            <span className="text-[#6b7280]">Global : <span className="font-bold text-[#0a1628]">{formatCAD(reer.total_global)}</span></span>
          </div>
          <Button onClick={handleSave} loading={saving} size="sm">Sauvegarder les cotisations</Button>
        </div>
        <p className="text-[11px] text-[#9ca3af] mt-2">Les Reels et leads de Cloé se saisissent dans l'onglet « Mensuel » ; sa cotisation est modifiable ici comme les autres.</p>
      </Card>

      {/* Totaux annuels */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1a1a1a]">Versements REER par mois — {tableYear}</h3>
        <select
          value={tableYear}
          onChange={e => setTableYear(Number(e.target.value))}
          className="px-3 py-1.5 text-sm font-semibold border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
        >
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <Card className="p-4 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[#9ca3af]">
              <th className="px-3 py-2 text-left sticky left-0 bg-[#fcfcfd]">Versé par NEO</th>
              {monthlyReer.map(mr => <th key={mr.month} className="px-3 py-2 text-right font-semibold">{MONTHS_FR[mr.month - 1]}</th>)}
              <th className="px-3 py-2 text-right font-semibold">YTD</th>
            </tr>
          </thead>
          <tbody>
            {NATUROS.map(n => (
              <tr key={n.key}>
                <td className="px-3 py-2 text-left font-semibold text-[#1a1a1a] sticky left-0 bg-[#fcfcfd]">{n.label}</td>
                {monthlyReer.map(mr => {
                  const v = num(mr.reer.parNaturo[n.key])
                  return (
                    <td key={mr.month} className={`px-3 py-2 text-right ${mr.reer.plancherAtteint && v > 0 ? 'bg-emerald-50 text-emerald-700 font-medium' : 'bg-gray-50 text-[#9ca3af]'}`}>
                      {v > 0 ? formatCAD(v) : '— $'}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right font-bold text-[#00bbb1]">{formatCAD(ytdMatch[n.key])}</td>
              </tr>
            ))}
            {/* Cloé — support & réseaux (séparée des naturos) */}
            <tr className="border-t-2 border-[#e5e7eb]">
              <td className="px-3 py-2 text-left font-semibold text-[#1a1a1a] sticky left-0 bg-[#fcfcfd]">
                Cloé <span className="text-[10px] font-normal text-[#9ca3af]">(support &amp; réseaux)</span>
              </td>
              {monthlyReer.map(mr => {
                const c = mr.reer.cloe
                const v = num(c?.montant)
                return (
                  <td key={mr.month} className={`px-3 py-2 text-right ${c?.eligible && v > 0 ? 'bg-emerald-50 text-emerald-700 font-medium' : 'bg-gray-50 text-[#9ca3af]'}`}
                    title={c ? `Reels ${c.reels}/${c.seuilReels}${c.leadsActive ? ` · Leads ${c.leads}/${c.seuilLeads}` : ''}` : ''}>
                    {v > 0 ? formatCAD(v) : '— $'}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-right font-bold text-[#00bbb1]">{formatCAD(ytdCloe)}</td>
            </tr>
            <tr className="font-bold bg-gray-50">
              <td className="px-3 py-2 text-left sticky left-0 bg-gray-50">Total NEO</td>
              {monthlyReer.map(mr => (
                <td key={mr.month} className="px-3 py-2 text-right">{mr.reer.total_match > 0 ? formatCAD(mr.reer.total_match) : '— $'}</td>
              ))}
              <td className="px-3 py-2 text-right text-[#00bbb1]">{formatCAD(totalNEO)}</td>
            </tr>
          </tbody>
        </table>
        {yearMonths.length === 0 && <p className="text-sm text-[#9ca3af] text-center py-4">Aucun mois enregistré pour {tableYear}.</p>}
      </Card>

      {/* Détail par naturo : ce qu'il met vs ce que NEO met */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">Cumul YTD par naturopathe</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {NATUROS.map(n => (
            <div key={n.key} className="p-3 rounded-lg border border-[#e5e7eb]">
              <p className="text-sm font-bold text-[#1a1a1a] mb-1">{n.label}</p>
              <div className="flex justify-between text-xs"><span className="text-[#6b7280]">Lui</span><span className="font-semibold">{formatCAD(ytdContrib[n.key])}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6b7280]">NEO</span><span className="font-semibold text-[#00bbb1]">{formatCAD(ytdMatch[n.key])}</span></div>
              <div className="flex justify-between text-xs pt-1 border-t border-[#f1f5f9] mt-1"><span className="text-[#6b7280]">Total</span><span className="font-bold">{formatCAD(num(ytdContrib[n.key]) + num(ytdMatch[n.key]))}</span></div>
            </div>
          ))}
          <div className="p-3 rounded-lg border border-[#e5e7eb] bg-amber-50/30">
            <p className="text-sm font-bold text-[#1a1a1a] mb-1">Cloé <span className="text-[10px] font-normal text-[#9ca3af]">(réseaux)</span></p>
            <div className="flex justify-between text-xs"><span className="text-[#6b7280]">Elle</span><span className="font-semibold">{formatCAD(ytdCloeContrib)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-[#6b7280]">NEO</span><span className="font-semibold text-[#00bbb1]">{formatCAD(ytdCloe)}</span></div>
            <div className="flex justify-between text-xs pt-1 border-t border-[#f1f5f9] mt-1"><span className="text-[#6b7280]">Total</span><span className="font-bold">{formatCAD(ytdCloe + ytdCloeContrib)}</span></div>
          </div>
        </div>
      </Card>

      {/* Récap global */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">Total NEO verse (YTD)</p>
          <p className="text-xl font-black text-[#00bbb1]">{formatCAD(totalNEO)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">Total membres (YTD)</p>
          <p className="text-xl font-black text-[#1a1a1a]">{formatCAD(totalMembres)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">Total global (YTD)</p>
          <p className="text-xl font-black text-[#0a1628]">{formatCAD(totalNEO + totalMembres)}</p>
        </Card>
      </div>
      </>
      )}

      <MargeSeuilsModal
        isOpen={seuilsOpen}
        onClose={() => setSeuilsOpen(false)}
        params={params}
        months={months}
        margeHistorique={data.margeHistorique}
        onSave={data.saveMargeConfig}
      />
    </div>
  )
}
