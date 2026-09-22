import { useState, useEffect, useCallback, useMemo } from 'react'
import Card from '../shared/Card'
import { SkeletonCard } from '../shared/Skeleton'
import { supabase } from '../../lib/supabase'
import { repartitionObjections, precisionsAutre, OBJECTIONS } from '../../lib/closers/objections'

// Répartition des objections principales sur la période choisie.
// Source : les rapports de fin de journée des closeurs (date du rapport),
// qui portent la même valeur que le champ GHL opportunity.objection_principale.
export default function ObjectionsPanel({ startDate, endDate }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!startDate || !endDate) return
    setLoading(true)
    const { data, error } = await supabase
      .from('end_of_day_reports')
      .select('report_date, user_id, data, profiles(full_name)')
      .eq('role', 'closer')
      .gte('report_date', startDate)
      .lte('report_date', endDate)
    if (error) console.error('Erreur objections:', error.message)
    setReports(data ?? [])
    setLoading(false)
  }, [startDate, endDate])
  useEffect(() => { load() }, [load])

  const stats = useMemo(() => repartitionObjections(reports), [reports])
  const precisions = useMemo(() => precisionsAutre(reports), [reports])

  if (loading) return <SkeletonCard />

  if (stats.total === 0 && stats.sansObjection === 0) {
    return (
      <Card className="p-5">
        <h2 className="font-bold text-[#1a1a1a] mb-1">Objections principales</h2>
        <p className="text-sm text-[#9ca3af]">Aucun rendez-vous sans vente sur cette période.</p>
      </Card>
    )
  }

  const pct = n => stats.total > 0 ? Math.round((n / stats.total) * 100) : 0

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e5e7eb]">
        <h2 className="font-bold text-[#1a1a1a]">Objections principales</h2>
        <p className="text-xs text-[#9ca3af] mt-0.5">
          {stats.total} rendez-vous sans vente
          {stats.sansObjection > 0 && ` · ${stats.sansObjection} sans objection saisie`}
        </p>
      </div>

      {/* Totaux de l'équipe */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-[#f0f0f0]">
        {OBJECTIONS.map(o => (
          <div key={o} className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wide">{o}</p>
            <p className="text-base font-bold mt-0.5 text-[#1a1a1a]">
              {stats.parObjection[o]}
              <span className="text-xs font-semibold text-[#6b7280]"> · {pct(stats.parObjection[o])} %</span>
            </p>
          </div>
        ))}
      </div>

      {/* Par closeur */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f9fafb] border-b border-[#e5e7eb] text-[10px] font-bold text-[#6b7280] uppercase tracking-wide text-left">
              <th className="px-4 py-2">Closeur</th>
              {OBJECTIONS.map(o => <th key={o} className="px-3 py-2">{o}</th>)}
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Principale</th>
            </tr>
          </thead>
          <tbody>
            {stats.parCloser.map((c, i) => (
              <tr key={c.closer} className={`border-b border-[#f0f0f0] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
                <td className="px-4 py-2.5 font-semibold text-[#1a1a1a]">
                  {c.closer}
                  {c.sansObjection > 0 && (
                    <span className="ml-2 text-[10px] font-normal text-[#9ca3af]">{c.sansObjection} sans objection</span>
                  )}
                </td>
                {OBJECTIONS.map(o => (
                  <td key={o} className="px-3 py-2.5 font-bold text-[#1a1a1a]">{c.parObjection[o] || '—'}</td>
                ))}
                <td className="px-3 py-2.5 font-bold text-[#1a1a1a]">{c.total}</td>
                <td className="px-3 py-2.5">
                  {c.principale
                    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#00bbb118] text-[#00bbb1]">{c.principale}</span>
                    : <span className="text-[#d1d5db]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {precisions.length > 0 && (
        <div className="px-5 py-4 border-t border-[#f0f0f0]">
          <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide mb-2">Précisions « Autre »</p>
          <ul className="space-y-1">
            {precisions.map((p, i) => (
              <li key={i} className="text-xs text-[#6b7280]">
                <span className="text-[#1a1a1a] font-semibold">{p.contact}</span> · {p.precision}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
