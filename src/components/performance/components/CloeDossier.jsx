import { useMemo } from 'react'
import Card from '../../shared/Card'
import Badge from '../../shared/Badge'
import CloeReerCard from './CloeReerCard'
import AccessCard from './AccessCard'
import { calcReerCloe, calcProfitNEO, formatCAD, hasMonthData, num } from '../../../lib/performanceCalc'

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export default function CloeDossier({ data }) {
  const { months, params } = data

  const rows = useMemo(() => {
    return [...months]
      .filter(hasMonthData)
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .map(m => {
        const neo = calcProfitNEO(m, params)
        const cloe = calcReerCloe(m, params, neo.profit_neo >= num(params.reer_plancher))
        return { year: m.year, month: m.month, cloe }
      })
  }, [months, params])

  const last = rows[0]
  const ytdNeo = rows.reduce((s, r) => s + num(r.cloe.montant), 0)
  const ytdElle = rows.reduce((s, r) => s + num(r.cloe.cotisation), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-black text-[#0a1628]">Dossier — Cloé</h3>
        <Badge variant="warning">Support &amp; réseaux sociaux</Badge>
      </div>

      {/* Réglages d'accès (admin) */}
      <AccessCard naturoKey="cloe" label="Cloé" data={data} />

      {!params.salaire_cloe || num(params.salaire_cloe) <= 0 ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-amber-600">Salaire de Cloé non configuré — REER désactivé.</p>
          <p className="text-xs text-[#9ca3af] mt-1">Règle son salaire annuel dans « Modifier les paramètres fixes » → Salaires annuels.</p>
        </Card>
      ) : null}

      {/* Statut du dernier mois */}
      {last && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CloeReerCard cloe={last.cloe} />
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-[11px] font-bold text-[#6b7280] uppercase mb-1">REER NEO (YTD)</p>
              <p className="text-xl font-black text-[#00bbb1]">{formatCAD(ytdNeo)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-bold text-[#6b7280] uppercase mb-1">Ses cotisations (YTD)</p>
              <p className="text-xl font-black text-[#1a1a1a]">{formatCAD(ytdElle)}</p>
            </Card>
          </div>
        </div>
      )}

      {/* Historique mensuel */}
      <Card className="p-4 overflow-x-auto">
        <h4 className="text-sm font-bold text-[#1a1a1a] mb-3">Historique mensuel</h4>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[#9ca3af] text-left">
              <th className="px-3 py-2">Mois</th>
              <th className="px-3 py-2 text-right">Reels</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Sa cotisation</th>
              <th className="px-3 py-2 text-center">Conditions</th>
              <th className="px-3 py-2 text-right">NEO verse</th>
            </tr>
          </thead>
          <tbody className="text-[#1a1a1a]">
            {rows.map(r => {
              const c = r.cloe
              return (
                <tr key={`${r.year}-${r.month}`} className="border-t border-[#f1f5f9]">
                  <td className="px-3 py-2 font-semibold">{MONTHS_FR[r.month - 1].slice(0, 3)} {r.year}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${c.reelsOK ? 'text-emerald-600' : 'text-red-600'}`}>{c.reels}/{c.seuilReels}</td>
                  <td className={`px-3 py-2 text-right ${c.leadsActive ? (c.leadsOK ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold') : 'text-[#9ca3af]'}`}>
                    {c.leadsActive ? `${c.leads}/${c.seuilLeads}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">{c.cotisation > 0 ? formatCAD(c.cotisation) : '— $'}</td>
                  <td className="px-3 py-2 text-center" title={c.raison}>{c.eligible ? '✅' : '❌'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#00bbb1]">{c.montant > 0 ? formatCAD(c.montant) : '— $'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-[#9ca3af] text-center py-4">Aucun mois enregistré.</p>}
      </Card>
    </div>
  )
}
