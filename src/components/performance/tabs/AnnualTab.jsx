import { useMemo, useState } from 'react'
import Card from '../../shared/Card'
import {
  calcAnnualSummary, formatCAD, formatPct, num,
} from '../../../lib/performanceCalc'

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

function YearSelector({ year, years, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(year - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280]">‹</button>
      <select
        value={year}
        onChange={e => onChange(Number(e.target.value))}
        className="px-3 py-1.5 text-sm font-semibold border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <button onClick={() => onChange(year + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280]">›</button>
    </div>
  )
}

function StackedBars({ perMonth }) {
  const max = Math.max(1, ...perMonth.map(p => num(p.profit_neo) + num(p.reer_avec_charges)))
  return (
    <div className="flex items-end gap-2 h-48 mt-2">
      {Array.from({ length: 12 }, (_, i) => {
        const m = perMonth.find(p => p.month === i + 1)
        const profit = m ? Math.max(0, num(m.profit_neo)) : 0
        const reer = m ? num(m.reer_avec_charges) : 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={m ? `${MONTHS_FR[i]} — Profit ${formatCAD(m.profit_neo)} · REER ${formatCAD(m.reer_avec_charges)}` : ''}>
            <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
              <div className="w-full bg-[#00bbb1] rounded-t" style={{ height: `${(reer / max) * 100}%` }} />
              <div className="w-full bg-[#0a1628]" style={{ height: `${(profit / max) * 100}%` }} />
            </div>
            <span className="text-[10px] text-[#9ca3af]">{MONTHS_FR[i]}</span>
          </div>
        )
      })}
    </div>
  )
}

function Row({ label, values, render, bold }) {
  return (
    <tr className={bold ? 'font-bold bg-gray-50' : ''}>
      <td className="px-3 py-2 text-left text-[#6b7280] whitespace-nowrap sticky left-0 bg-inherit">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-3 py-2 text-right whitespace-nowrap">{render(v)}</td>
      ))}
    </tr>
  )
}

export default function AnnualTab({ data }) {
  const { months, params } = data
  const availableYears = useMemo(() => {
    const ys = [...new Set(months.map(m => m.year))].sort((a, b) => b - a)
    return ys.length ? ys : [new Date().getFullYear()]
  }, [months])
  const [year, setYear] = useState(availableYears[0])

  const yearMonths = useMemo(() => months.filter(m => m.year === year), [months, year])
  const prevYearMonths = useMemo(() => months.filter(m => m.year === year - 1), [months, year])
  const summary = useMemo(() => calcAnnualSummary(yearMonths, params), [yearMonths, params])
  const prevSummary = useMemo(() => calcAnnualSummary(prevYearMonths, params), [prevYearMonths, params])

  // Valeurs par mois (1-12) pour le tableau
  const byMonth = (key) => Array.from({ length: 12 }, (_, i) => {
    const m = summary.perMonth.find(p => p.month === i + 1)
    return m ? m[key] : null
  })

  const revVsPrev = prevSummary.revenue_total > 0
    ? (summary.revenue_total - prevSummary.revenue_total) / prevSummary.revenue_total
    : null

  return (
    <div className="space-y-6">
      <YearSelector year={year} years={availableYears} onChange={setYear} />

      {/* Tableau récapitulatif */}
      <Card className="p-4 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[#9ca3af]">
              <th className="px-3 py-2 text-left sticky left-0 bg-[#fcfcfd]"></th>
              {MONTHS_FR.map(m => <th key={m} className="px-3 py-2 text-right font-semibold">{m}</th>)}
            </tr>
          </thead>
          <tbody className="text-[#1a1a1a]">
            <Row label="Revenus totaux" values={byMonth('revenue_total')} render={v => v == null ? '—' : formatCAD(v)} />
            <Row label="Profit NEO" values={byMonth('profit_neo')} render={v => v == null ? '—' : formatCAD(v)} />
            <Row label="Marge nette" values={byMonth('marge')} render={v => v == null ? '—' : formatPct(v, 0)} />
            <Row label="REER versé" values={byMonth('reer_pool')} render={v => v == null ? '—' : formatCAD(v)} />
            <Row label="Profit après REER" values={byMonth('profit_apres_reer')} render={v => v == null ? '—' : formatCAD(v)} bold />
          </tbody>
        </table>
      </Card>

      {/* Graphique empilé */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-[#1a1a1a]">Profit NEO + REER par mois</h3>
          <div className="flex items-center gap-3 text-xs text-[#6b7280]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#0a1628]" /> Profit</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#00bbb1]" /> REER</span>
          </div>
        </div>
        <StackedBars perMonth={summary.perMonth} />
      </Card>

      {/* Cartes annuelles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">Revenu annuel</p>
          <p className="text-xl font-black text-[#1a1a1a]">{formatCAD(summary.revenue_total)}</p>
          {revVsPrev != null && (
            <p className={`text-xs font-semibold mt-0.5 ${revVsPrev >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {revVsPrev >= 0 ? '▲' : '▼'} {formatPct(Math.abs(revVsPrev), 1)} vs {year - 1}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">Profit annuel</p>
          <p className="text-xl font-black text-[#1a1a1a]">{formatCAD(summary.profit_neo)}</p>
          <p className="text-xs text-[#9ca3af] mt-0.5">Marge {formatPct(summary.marge, 1)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">REER versé par NEO</p>
          <p className="text-xl font-black text-[#00bbb1]">{formatCAD(summary.reer_match)}</p>
          <p className="text-xs text-[#9ca3af] mt-0.5">Cotisations membres : {formatCAD(summary.reer_contrib)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">Plancher atteint</p>
          <p className="text-xl font-black text-[#1a1a1a]">{summary.mois_plancher_atteint} / {summary.count || 0}</p>
          <p className="text-xs text-[#9ca3af] mt-0.5">mois saisis</p>
        </Card>
      </div>
    </div>
  )
}
