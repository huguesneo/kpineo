import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

function fmtCAD(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
}

const LEVELS = [
  { min: 0,   max: 49,       emoji: '🌱', label: 'Démarrage',        color: '#9ca3af' },
  { min: 50,  max: 79,       emoji: '📈', label: 'En progression',   color: '#f59e0b' },
  { min: 80,  max: 99,       emoji: '🔥', label: 'En feu !',         color: '#f97316' },
  { min: 100, max: 109,      emoji: '🏆', label: 'Objectif atteint', color: '#10b981' },
  { min: 110, max: Infinity, emoji: '🎉', label: 'WINNER WINNER !',  color: '#00bbb1' },
]

function getLevel(pct) {
  return LEVELS.find(l => pct >= l.min && pct <= l.max) || LEVELS[0]
}

// annualBonus: montant boni annuel (ex: 6000$), divisé par 4 pour le trimestre
export default function BonusTracker({ bonus, achievement, loading, quarterStart, quarterEnd, annualBonus, quarterlyRevenue = null, quarterlyUnpaid = null }) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3 p-6 bg-white rounded-2xl border border-[#e5e7eb]">
        <div className="h-5 bg-gray-100 rounded w-1/3" />
        <div className="h-8 bg-gray-100 rounded w-1/2" />
        <div className="h-4 bg-gray-100 rounded-full" />
      </div>
    )
  }

  if (!annualBonus) {
    return (
      <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl">
        <p className="text-sm font-semibold text-amber-700">Boni annuel non défini — configurez-le dans Plan de carrière.</p>
      </div>
    )
  }

  if (achievement === null) {
    return (
      <div className="p-5 bg-gray-50 border border-[#e5e7eb] rounded-2xl">
        <p className="text-sm text-[#6b7280]">Aucun objectif trimestriel défini pour cette période.</p>
      </div>
    )
  }

  const quarterly_bonus_base = Number(annualBonus) / 4
  const pct = achievement
  const level = getLevel(achievement)
  const barWidth = Math.min(100, (Math.min(pct, 110) / 110) * 100)
  const isWinner = achievement >= 110

  const pctRounded = Math.round(pct)
  const projectedBonus = Math.round(quarterly_bonus_base * Math.max(0, pctRounded) / 100)

  return (
    <div className={`p-6 rounded-2xl border transition-all ${isWinner ? 'border-[#00bbb1] bg-gradient-to-br from-[#00bbb1]/5 to-white' : 'border-[#e5e7eb] bg-white'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-1">Boni trimestriel</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#1a1a1a]">
              {projectedBonus.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
            </span>
            <span className="text-sm text-[#6b7280]">
              / {quarterly_bonus_base.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })} (100%)
            </span>
          </div>
          {achievement < 80 && (
            <p className="text-xs text-amber-600 mt-0.5">Projeté · paiement déclenché à 80 %</p>
          )}
          <p className="text-xs text-[#6b7280] mt-1">
            {format(parseISO(quarterStart), 'd MMM', { locale: fr })} → {format(parseISO(quarterEnd), 'd MMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl mb-1">{level.emoji}</div>
          <p className="text-4xl font-bold" style={{ color: level.color }}>{pct}%</p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: level.color }}>{level.label}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative mb-3">
        <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
          <div
            className="h-5 rounded-full transition-all duration-700"
            style={{
              width: `${barWidth}%`,
              background: isWinner
                ? 'linear-gradient(90deg, #00bbb1, #10b981)'
                : `linear-gradient(90deg, ${level.color}99, ${level.color})`,
            }}
          />
        </div>
        <div className="absolute top-0 left-0 w-full h-5 flex items-center pointer-events-none">
          <div className="absolute h-5 w-0.5 bg-white/80" style={{ left: `${(80 / 110) * 100}%` }} />
          <div className="absolute h-5 w-0.5 bg-white/80" style={{ left: `${(100 / 110) * 100}%` }} />
        </div>
      </div>

      <div className="flex justify-between text-xs text-[#6b7280] font-semibold mb-4">
        <span>0%</span>
        <span style={{ marginLeft: `${(80 / 110) * 100 - 10}%` }}>80%</span>
        <span>100%</span>
        <span className="text-[#00bbb1]">🎉 110%+</span>
      </div>

      {/* Levels */}
      <div className="flex gap-1.5 flex-wrap">
        {LEVELS.map(l => (
          <div
            key={l.emoji}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
              level.emoji === l.emoji ? 'text-white shadow-sm' : 'text-[#6b7280] bg-gray-100'
            }`}
            style={level.emoji === l.emoji ? { backgroundColor: l.color } : {}}
          >
            <span>{l.emoji}</span>
            <span className="hidden sm:inline">{l.label}</span>
          </div>
        ))}
      </div>

      {achievement < 80 && (
        <p className="mt-3 text-xs text-[#6b7280] bg-gray-50 rounded-lg px-3 py-2">
          💡 Plus que {(80 - achievement).toFixed(1)} % à aller avant d'atteindre le seuil de paiement !
        </p>
      )}

      {isWinner && (
        <div className="mt-3 text-center py-2 bg-[#00bbb1]/10 rounded-xl border border-[#00bbb1]/20">
          <p className="text-sm font-bold text-[#00bbb1]">🎉 WINNER WINNER ! Boni {achievement}% — {projectedBonus.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })} ! 🎉</p>
        </div>
      )}

      {/* Détail des revenus trimestriels */}
      {quarterlyRevenue != null && (
        <div className="mt-4 pt-4 border-t border-[#f5f5f7] grid grid-cols-3 gap-2">
          {[
            { label: 'Revenus facturés', value: quarterlyRevenue, color: 'text-[#1a1a1a]' },
            { label: 'Fact. impayées', value: quarterlyUnpaid ?? 0, color: 'text-amber-600' },
            { label: 'Déposés', value: Math.max(0, (quarterlyRevenue ?? 0) - (quarterlyUnpaid ?? 0)), color: 'text-emerald-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl px-2 py-2.5 text-center">
              <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-sm font-bold ${color}`}>{fmtCAD(value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
