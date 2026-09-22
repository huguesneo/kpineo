import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Card from '../shared/Card'
import { SkeletonCard } from '../shared/Skeleton'
import { supabase } from '../../lib/supabase'
import { usePayPeriodConfig, listPayPeriods } from '../../hooks/usePayPeriod'
import { loadSetterCommissionData } from '../../lib/commissions/loadSetterData'
import { computeSetterCommissions, computeSetterAnomalies, ANOMALIES } from '../../lib/commissions/setterCommissions'
import { BASCULE_DATE, RDV_NON_SHOWED } from '../../lib/commissions/config'

// Ce qui peut changer un montant de paie → à régler avant de payer.
// Le reste est informatif (contact test déjà exclu).
const INFO_SEULEMENT = new Set(['contact_test'])

const fmtDay = iso => iso
  ? new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  : '—'
const fmtDate = iso => iso
  ? new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'short' }).format(new Date(iso))
  : '—'
const fmtPeriod = p => `${format(parseISO(p.start), 'd MMM', { locale: fr })} → ${format(parseISO(p.end), 'd MMM yyyy', { locale: fr })}`
const fmtCAD = n => Number(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

export default function SetterAnomaliesReport({ setters }) {
  const { config: payConfig } = usePayPeriodConfig()
  const periods = useMemo(
    () => payConfig ? listPayPeriods(payConfig.reference_pay_date, payConfig.period_length_days, 12) : [],
    [payConfig]
  )
  const [periodIdx, setPeriodIdx] = useState(0)
  const period = periods[periodIdx] ?? null

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadSetterCommissionData(supabase, { force }))
    } catch (err) {
      console.error('Erreur rapport anomalies:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const report = useMemo(() => {
    if (!data || !period) return null
    const args = { ...data, start: period.start, end: period.end }
    const anomalies = computeSetterAnomalies(args)
    const totals = setters
      .map(s => ({ name: s.full_name, total: computeSetterCommissions({ ...args, setterName: s.full_name }).totalPay }))
      .filter(t => t.total > 0)
    const groups = Object.keys(ANOMALIES)
      .map(code => ({ code, libelle: ANOMALIES[code], rows: anomalies.filter(a => a.code === code) }))
      .filter(g => g.rows.length > 0)
    const bloquantes = anomalies.filter(a => !INFO_SEULEMENT.has(a.code)).length
    return { totals, groups, bloquantes, total: anomalies.length }
  }, [data, period, setters])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Période de paie :</p>
        <select
          value={periodIdx}
          onChange={e => setPeriodIdx(Number(e.target.value))}
          className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-[#e5e7eb] bg-white text-[#1a1a1a]"
        >
          {periods.map((p, i) => (
            <option key={p.start} value={i}>{fmtPeriod(p)}{i === 0 ? ' (en cours)' : ''}</option>
          ))}
        </select>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#6366f1]/40 disabled:opacity-50"
        >
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
        <p className="text-xs text-[#9ca3af]">
          Bascule des pipelines : {format(parseISO(BASCULE_DATE), 'd MMM yyyy', { locale: fr })} · RDV non « showed » : {RDV_NON_SHOWED === 'bloquer' ? 'non payé' : 'payé et signalé'}
        </p>
      </div>

      {error && <Card className="p-4 text-sm text-[#ef4444]">Erreur : {error}</Card>}

      {loading && !report ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : report && (
        <>
          <Card className={`p-4 border-l-4 ${report.bloquantes === 0 ? 'border-l-[#10b981]' : 'border-l-[#f59e0b]'}`}>
            <p className="text-sm font-bold text-[#1a1a1a]">
              {report.bloquantes === 0
                ? 'Aucune anomalie à régler : la période peut être payée.'
                : `${report.bloquantes} ligne${report.bloquantes > 1 ? 's' : ''} à expliquer avant de payer.`}
            </p>
            <p className="text-xs text-[#6b7280] mt-1">
              Règle de paie : on ne paie une période que si ce rapport est vide ou si chaque ligne est expliquée.
            </p>
            {report.totals.length > 0 && (
              <p className="text-xs text-[#6b7280] mt-2">
                Totaux calculés : {report.totals.map(t => `${t.name} ${fmtCAD(t.total)}`).join(' · ')}
              </p>
            )}
          </Card>

          {report.groups.map(g => (
            <div key={g.code}>
              <h3 className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-2">
                {g.libelle} — {g.rows.length}
                {INFO_SEULEMENT.has(g.code) && <span className="normal-case font-normal text-[#9ca3af]"> (information)</span>}
              </h3>
              <div className="overflow-x-auto rounded-xl border border-[#e5e7eb]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f9fafb] border-b border-[#e5e7eb] text-[10px] font-bold text-[#6b7280] uppercase tracking-wide text-left">
                      <th className="px-3 py-2">Contact</th>
                      <th className="px-3 py-2">Setter</th>
                      <th className="px-3 py-2">Pipeline</th>
                      <th className="px-3 py-2">Étape</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">RDV</th>
                      <th className="px-3 py-2">Statut RDV</th>
                      <th className="px-3 py-2">Close</th>
                      <th className="px-3 py-2 text-right">Payé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((a, i) => (
                      <tr key={`${a.opportunite}-${i}`} className={`border-b border-[#f0f0f0] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
                        <td className="px-3 py-2 font-semibold text-[#1a1a1a]">{a.contact || a.contact_id}</td>
                        <td className="px-3 py-2">{a.setter ?? <span className="text-[#ef4444]">aucun</span>}</td>
                        <td className="px-3 py-2 text-[#6b7280]">{a.pipeline}</td>
                        <td className="px-3 py-2 text-[#6b7280]">{a.etape}</td>
                        <td className="px-3 py-2">{a.type_booking ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDay(a.date_rdv)}</td>
                        <td className="px-3 py-2">{a.statut_rdv ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(a.date_de_close)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtCAD(a.montant_retenu)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
