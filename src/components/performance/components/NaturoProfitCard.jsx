import Card from '../../shared/Card'
import { formatCAD, formatPct, num } from '../../../lib/performanceCalc'

function colorFor(v) {
  if (num(v) > 0) return 'text-emerald-600'
  if (num(v) < 0) return 'text-red-600'
  return 'text-[#6b7280]'
}

// Carte profit individuel naturo. Détail de la formule au survol (title).
export default function NaturoProfitCard({ naturo, reerAmount, reerActive }) {
  if (!naturo) return null

  const detail =
    `Revenu ${formatCAD(naturo.revenu_naturo)}\n` +
    `− COGS attribué ${formatCAD(naturo.cogs_attribue)}\n` +
    `− Salaire (charges incl.) ${formatCAD(naturo.salaire_mensuel_charges)}\n` +
    `− Quote-part frais ${formatCAD(naturo.quote_part_frais)} (${formatPct(naturo.part_revenu)} des frais)\n` +
    `= Profit ${formatCAD(naturo.profit_naturo)}`

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-[#1a1a1a]">{naturo.label}</h4>
        <span className="text-xs text-[#9ca3af]">{formatPct(naturo.part_revenu)} du revenu</span>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-[#6b7280]">Revenu du mois</dt>
          <dd className="font-semibold text-[#1a1a1a]">{formatCAD(naturo.revenu_naturo)}</dd>
        </div>
        <div className="flex justify-between cursor-help" title={detail}>
          <dt className="text-[#6b7280] underline decoration-dotted decoration-[#cbd5e1]">Profit individuel</dt>
          <dd className={`font-bold ${colorFor(naturo.profit_naturo)}`}>{formatCAD(naturo.profit_naturo)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#6b7280]">REER du mois</dt>
          <dd className={`font-semibold ${reerActive ? 'text-[#00bbb1]' : 'text-[#9ca3af]'}`}>
            {reerActive ? formatCAD(reerAmount) : '— $'}
          </dd>
        </div>
        <div className="flex justify-between pt-1.5 border-t border-[#f1f5f9]">
          <dt className="text-[#6b7280]">Marge personnelle</dt>
          <dd className={`font-semibold ${colorFor(naturo.marge)}`}>{formatPct(naturo.marge)}</dd>
        </div>
      </dl>
    </Card>
  )
}
