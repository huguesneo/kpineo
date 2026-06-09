import { useMemo, useState } from 'react'
import Card from '../../shared/Card'
import {
  NATUROS, calcScenario, buildBaseFromMonths, calcProfitNEO, contribKey,
  formatCAD, formatPct, num,
} from '../../../lib/performanceCalc'

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function Slider({ label, value, min, max, step, onChange, format }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-[#6b7280]">{label}</label>
        <span className="text-sm font-bold text-[#00bbb1]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[#00bbb1]"
      />
    </div>
  )
}

function ResultRow({ label, value, accent }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[#f1f5f9] last:border-0">
      <span className="text-sm text-[#6b7280]">{label}</span>
      <span className={`text-sm font-bold ${accent ? 'text-[#00bbb1]' : 'text-[#1a1a1a]'}`}>{value}</span>
    </div>
  )
}

export default function ScenarioTab({ data }) {
  const { months, params, selectedMonth } = data

  const [baseType, setBaseType] = useState('last3')
  const [growthPct, setGrowthPct] = useState(20)
  const [plancher, setPlancher] = useState(num(params.reer_plancher))

  const sortedMonths = useMemo(
    () => [...months].sort((a, b) => b.year - a.year || b.month - a.month),
    [months],
  )

  const base = useMemo(() => {
    if (baseType === 'last3') return buildBaseFromMonths(sortedMonths.slice(0, 3), params)
    if (baseType === 'ytd') {
      const y = new Date().getFullYear()
      return buildBaseFromMonths(months.filter(m => m.year === y), params)
    }
    // mois spécifique : baseType = "YYYY-MM"
    const [y, mo] = baseType.split('-').map(Number)
    const found = months.find(m => m.year === y && m.month === mo)
    if (!found) return { revenue_total: 0, profit_neo: 0 }
    const neo = calcProfitNEO(found, params)
    const b = { revenue_total: neo.revenue_total, profit_neo: neo.profit_neo }
    NATUROS.forEach(n => {
      b[n.revenueKey] = num(found[n.revenueKey])
      b[contribKey(n.key)] = num(found[contribKey(n.key)])
    })
    return b
  }, [baseType, sortedMonths, months, params])

  const overrides = { reer_plancher: plancher }

  const M = 1 + growthPct / 100
  const scenario = useMemo(() => calcScenario(base, params, M, overrides), [base, params, M, plancher])

  // Tableau comparatif
  const comparisons = [
    { label: 'Statu quo', mult: 1 },
    { label: '+10 %', mult: 1.1 },
    { label: '+20 %', mult: 1.2 },
    { label: '+30 %', mult: 1.3 },
    { label: `Choisi (+${growthPct} %)`, mult: M },
  ].map(c => ({ ...c, calc: calcScenario(base, params, c.mult, overrides) }))

  const gainAddl = scenario.profit_apres_reer - scenario.profit_base

  return (
    <div className="space-y-6">
      {/* Base de projection */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">Base de projection</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs font-semibold text-[#6b7280]">Source</label>
            <select
              value={baseType}
              onChange={e => setBaseType(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            >
              <option value="last3">Moyenne 3 derniers mois</option>
              <option value="ytd">Moyenne YTD</option>
              {sortedMonths.map(m => (
                <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                  {MONTHS_FR[m.month - 1]} {m.year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#6b7280] uppercase">Revenu de base / mois</p>
            <p className="text-lg font-black text-[#1a1a1a]">{formatCAD(base.revenue_total)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#6b7280] uppercase">Profit de base / mois</p>
            <p className="text-lg font-black text-[#1a1a1a]">{formatCAD(base.profit_neo)}</p>
          </div>
        </div>
      </Card>

      {/* Sliders */}
      <Card className="p-5 space-y-4">
        <Slider label="Croissance des revenus" value={growthPct} min={0} max={100} step={5} onChange={setGrowthPct} format={v => `+${v} %`} />
        <Slider label="Plancher REER" value={plancher} min={0} max={50000} step={500} onChange={setPlancher} format={v => formatCAD(v)} />
      </Card>

      {/* Résultats temps réel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-bold text-[#1a1a1a] mb-2">Par mois</h3>
          <ResultRow label="Revenu projeté" value={formatCAD(scenario.revenue_projete)} />
          <ResultRow label="Profit projeté" value={formatCAD(scenario.profit_projete)} />
          <ResultRow label="REER pool" value={scenario.reer_active ? formatCAD(scenario.reer_pool) : '— $'} accent />
          <ResultRow label="Profit NEO après REER" value={formatCAD(scenario.profit_apres_reer)} />
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-bold text-[#1a1a1a] mb-2">Annualisé (× 12)</h3>
          <ResultRow label="Revenu annuel" value={formatCAD(scenario.annual.revenue)} />
          <ResultRow label="Profit annuel" value={formatCAD(scenario.annual.profit)} />
          <ResultRow label="REER pool annuel" value={formatCAD(scenario.annual.reer_pool)} accent />
          <ResultRow label="Profit après REER annuel" value={formatCAD(scenario.annual.profit_apres_reer)} />
        </Card>
      </div>

      {/* REER par naturo annualisé */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">REER par naturopathe (annualisé)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {NATUROS.map(n => (
            <div key={n.key} className="text-center p-3 rounded-lg bg-[#00bbb1]/5">
              <p className="text-xs font-semibold text-[#6b7280]">{n.label}</p>
              <p className="text-base font-black text-[#00bbb1]">{formatCAD(scenario.annual.reer_par_naturo[n.key])}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Tableau comparatif */}
      <Card className="p-4 overflow-x-auto">
        <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">Comparatif des scénarios (par mois)</h3>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[#9ca3af]">
              <th className="px-3 py-2 text-left"></th>
              {comparisons.map(c => <th key={c.label} className="px-3 py-2 text-right font-semibold">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="text-[#1a1a1a]">
            <tr>
              <td className="px-3 py-2 text-left text-[#6b7280]">Revenu</td>
              {comparisons.map(c => <td key={c.label} className="px-3 py-2 text-right">{formatCAD(c.calc.revenue_projete)}</td>)}
            </tr>
            <tr>
              <td className="px-3 py-2 text-left text-[#6b7280]">Profit</td>
              {comparisons.map(c => <td key={c.label} className="px-3 py-2 text-right">{formatCAD(c.calc.profit_projete)}</td>)}
            </tr>
            <tr>
              <td className="px-3 py-2 text-left text-[#6b7280]">REER pool</td>
              {comparisons.map(c => <td key={c.label} className="px-3 py-2 text-right text-[#00bbb1]">{c.calc.reer_active ? formatCAD(c.calc.reer_pool) : '— $'}</td>)}
            </tr>
            <tr className="font-bold bg-gray-50">
              <td className="px-3 py-2 text-left">Profit après REER</td>
              {comparisons.map(c => <td key={c.label} className="px-3 py-2 text-right">{formatCAD(c.calc.profit_apres_reer)}</td>)}
            </tr>
          </tbody>
        </table>
      </Card>

      {/* Message clé */}
      <div className="rounded-xl bg-[#0a1628] text-white p-5">
        <p className="text-sm leading-relaxed">
          À <span className="font-bold text-[#00bbb1]">+{growthPct} %</span> de croissance, NEO conserve{' '}
          <span className="font-bold text-[#00bbb1]">{formatCAD(gainAddl)}</span> de profit additionnel par mois après REER
          {' '}(<span className="font-bold">{formatCAD(gainAddl * 12)}</span> / an) — le REER ne gruge jamais le profit de base.
        </p>
      </div>
    </div>
  )
}
