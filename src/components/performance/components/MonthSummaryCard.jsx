import { formatCAD, formatPct, calcProfitNEO, calcREER, hasMonthData, num } from '../../../lib/performanceCalc'

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

// Rangée cliquable d'un mois dans l'historique.
export default function MonthSummaryCard({ metrics, params, isActive, onClick }) {
  const filled = hasMonthData(metrics)
  const neo = calcProfitNEO(metrics, params)
  const reer = calcREER(metrics, params)

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors ${
        isActive
          ? 'border-[#00bbb1] bg-[#00bbb1]/5'
          : 'border-[#e5e7eb] bg-white hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-bold text-[#1a1a1a] w-20">
          {MONTHS_FR[metrics.month - 1]} {metrics.year}
        </span>
        {filled ? (
          <span className={`w-2 h-2 rounded-full ${reer.active ? 'bg-emerald-500' : 'bg-amber-400'}`} />
        ) : (
          <span className="text-xs text-[#9ca3af]">Non saisi</span>
        )}
      </div>
      {filled && (
        <div className="flex items-center gap-5 text-sm">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-[#9ca3af] uppercase">Revenu</p>
            <p className="font-semibold text-[#1a1a1a]">{formatCAD(neo.revenue_total)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#9ca3af] uppercase">Profit</p>
            <p className={`font-semibold ${num(neo.profit_neo) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCAD(neo.profit_neo)}
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-[#9ca3af] uppercase">REER</p>
            <p className="font-semibold text-[#00bbb1]">{reer.active ? formatCAD(reer.reer_pool) : '— $'}</p>
          </div>
          <div className="text-right hidden md:block w-12">
            <p className="text-[10px] text-[#9ca3af] uppercase">Marge</p>
            <p className="font-semibold text-[#6b7280]">{formatPct(neo.marge, 0)}</p>
          </div>
        </div>
      )}
    </button>
  )
}
