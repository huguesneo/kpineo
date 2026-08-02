import { useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend,
} from 'recharts'
import { fmtInt, fmtDate } from '../../../../lib/socialFormat'

// ============================================================================
// Primitives graphiques du dashboard.
//
// Les séries temporelles passent par recharts, déjà utilisé ailleurs dans
// l'application. Les micro-graphiques (sparkline, barres, nuage) sont en SVG
// direct : recharts y coûterait plus en configuration qu'en code écrit.
// ============================================================================

const TEAL = '#00bbb1'
const GRID = '#e5e7eb'
const MUTED = '#9ca3af'

/** Courbe minuscule sans axes, pour l'intérieur d'une carte KPI. */
export function Sparkline({ values, color = TEAL, height = 34 }) {
  const points = useMemo(() => {
    const v = (values ?? []).filter(x => x != null)
    if (v.length < 2) return null
    const min = Math.min(...v)
    const max = Math.max(...v)
    const span = max - min || 1
    return v
      .map((x, i) => `${(i / (v.length - 1)) * 120},${30 - ((x - min) / span) * 28}`)
      .join(' ')
  }, [values])

  if (!points) return <div style={{ height }} />
  return (
    <svg viewBox="0 0 120 34" preserveAspectRatio="none" style={{ width: '100%', height }} className="block">
      <polyline
        points={points} fill="none" stroke={color} strokeWidth="2"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  )
}

/** Barre horizontale avec libellé et valeur — « ce qui marche par format ». */
export function BarRow({ label, value, max, display, color = TEAL, labelWidth = 130 }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] font-medium text-[#1a1a1a] shrink-0 truncate" style={{ width: labelWidth }} title={label}>
        {label}
      </span>
      <div className="flex-1 h-[22px] bg-[#f3f4f6] rounded-lg overflow-hidden">
        <div className="h-full rounded-lg" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className="text-[13px] font-semibold text-[#1a1a1a] text-right shrink-0 w-[70px] tabular-nums">
        {display}
      </span>
    </div>
  )
}

/** Barres verticales — répartition par tranche d'âge. */
export function ColumnBars({ items, height = 170 }) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {items.map(item => (
        <div key={item.label} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
          <span className="text-xs font-semibold text-[#1a1a1a]">{item.display}</span>
          <div
            className="w-full rounded-t-lg"
            style={{
              height: `${Math.max(3, (item.value / max) * 100)}%`,
              background: item.value === max ? TEAL : '#bfe9e6',
            }}
          />
          <span className="text-[11px] text-[#9ca3af]">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Aires empilables par plateforme — vues ou portée par jour. */
export function DailyAreaChart({ data, series, height = 250, valueLabel = 'Vues' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: MUTED }}
          axisLine={false} tickLine={false} minTickGap={28}
        />
        <YAxis
          tickFormatter={v => fmtInt(v)} tick={{ fontSize: 11, fill: MUTED }}
          axisLine={false} tickLine={false} width={54}
        />
        <Tooltip
          formatter={(v, name) => [fmtInt(v), name]}
          labelFormatter={d => fmtDate(d)}
          contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {series.map(s => (
          <Area
            key={s.key} type="monotone" dataKey={s.key} name={s.label}
            stroke={s.color} fill={s.color} fillOpacity={0.12} strokeWidth={2.2}
            connectNulls dot={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Lignes non empilées — abonnés cumulés, échelles très différentes. */
export function DailyLineChart({ data, series, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: MUTED }}
          axisLine={false} tickLine={false} minTickGap={28}
        />
        {series.map((s, i) => (
          <YAxis
            key={s.key} yAxisId={s.key} orientation={i === 0 ? 'left' : 'right'}
            domain={['dataMin - 40', 'dataMax + 40']} tickFormatter={v => fmtInt(v)}
            tick={{ fontSize: 11, fill: s.color }} axisLine={false} tickLine={false} width={58}
            hide={i > 1}
          />
        ))}
        <Tooltip
          formatter={(v, name) => [fmtInt(v), name]}
          labelFormatter={d => fmtDate(d)}
          contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {series.map(s => (
          <Line
            key={s.key} yAxisId={s.key} type="monotone" dataKey={s.key} name={s.label}
            stroke={s.color} strokeWidth={2.2} dot={false} connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

/**
 * Nuage durée × hook rate — ce qui remplace la courbe de rétention seconde par
 * seconde, qu'aucune API ne fournit. La question utile derrière la courbe est
 * « quelle durée retient le monde » ; ce nuage y répond avec des vraies mesures.
 */
export function DurationHookScatter({ points, onSelect, height = 280 }) {
  const usable = points.filter(p => p.duration != null && p.hook != null)
  if (usable.length < 2) {
    return (
      <p className="text-sm text-[#9ca3af] py-10 text-center">
        Il faut au moins deux vidéos avec une durée et un hook rate connus.
        {' '}Actuellement : {usable.length}.
      </p>
    )
  }

  const maxDur = Math.max(...usable.map(p => p.duration))
  const maxHook = Math.max(...usable.map(p => p.hook), 50)
  const W = 640, H = 260, PAD = 34

  const x = d => PAD + (d / maxDur) * (W - PAD - 10)
  const y = h => H - PAD - (h / maxHook) * (H - PAD - 10)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} className="block">
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD} x2={W - 10} y1={y(maxHook * f)} y2={y(maxHook * f)} stroke={GRID} strokeWidth="1" />
            <text x={4} y={y(maxHook * f) + 4} fontSize="10" fill={MUTED}>
              {Math.round(maxHook * f)} %
            </text>
          </g>
        ))}
        {usable.map(p => (
          <circle
            key={p.id} cx={x(p.duration)} cy={y(p.hook)} r={6}
            fill={p.color} fillOpacity={0.75} stroke="#fff" strokeWidth="1.5"
            className="cursor-pointer"
            onClick={() => onSelect?.(p.id)}
          >
            <title>{`${p.label} — ${Math.round(p.duration)} s, hook ${p.hook.toFixed(1).replace('.', ',')} %`}</title>
          </circle>
        ))}
        <text x={W / 2} y={H - 6} fontSize="11" fill={MUTED} textAnchor="middle">
          Durée de la vidéo (secondes)
        </text>
      </svg>
    </div>
  )
}

/** Grille jour × heure — recommandation de publication, pas mesure de présence. */
export function BestTimeHeatmap({ grid, days, hours }) {
  const max = Math.max(...grid.flat(), 1)
  return (
    <div className="flex flex-col gap-1">
      {days.map((day, di) => (
        <div key={day} className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-[11px] font-medium text-[#9ca3af]">{day}</span>
          <div className="flex gap-1 flex-1">
            {grid[di].map((value, hi) => (
              <div
                key={hi}
                className="flex-1 h-5 rounded"
                style={{ background: `rgba(0,187,177,${(value / max).toFixed(2)})` }}
                title={`${day} ${hours[hi]} — indice ${value}`}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-1">
        <span className="w-9 shrink-0" />
        <div className="flex gap-1 flex-1">
          {hours.map(h => (
            <span key={h} className="flex-1 text-[10px] text-[#c0c0c8] text-center">{h}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
