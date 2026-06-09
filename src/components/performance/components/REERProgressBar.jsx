import { formatCAD, num } from '../../../lib/performanceCalc'

// Barre de progression REER : cumulé YTD vs projection fin d'année vs scénario +20%.
export default function REERProgressBar({ label, ytd, projection, scenario20 }) {
  const max = Math.max(num(projection), num(scenario20), num(ytd), 1)
  const pct = (v) => `${Math.min(100, (num(v) / max) * 100)}%`

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-[#1a1a1a]">{label}</span>
        <span className="font-bold text-[#00bbb1]">{formatCAD(ytd)}</span>
      </div>
      <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
        {/* scénario +20% (fond le plus clair) */}
        <div className="absolute inset-y-0 left-0 bg-[#00bbb1]/15" style={{ width: pct(scenario20) }} />
        {/* projection fin d'année */}
        <div className="absolute inset-y-0 left-0 bg-[#00bbb1]/40" style={{ width: pct(projection) }} />
        {/* cumulé réel */}
        <div className="absolute inset-y-0 left-0 bg-[#00bbb1]" style={{ width: pct(ytd) }} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-[#9ca3af]">
        <span>Proj. fin d'année : <span className="font-semibold text-[#6b7280]">{formatCAD(projection)}</span></span>
        <span>Scénario +20 % : <span className="font-semibold text-[#6b7280]">{formatCAD(scenario20)}</span></span>
      </div>
    </div>
  )
}
