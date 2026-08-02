import { useState, useMemo } from 'react'
import Card from '../../../components/shared/Card'
import { ScoreCell, num } from './scoring'
import IndexExplainer from './IndexExplainer'
import {
  fmtInt, fmtPct, fmtSeconds, fmtDate, platformMeta, publicationTitle, mediaLabel, hookTone,
} from '../../../lib/socialFormat'

// ============================================================================
// Tableau de toutes les publications mesurées
// ============================================================================

// `value` sort la métrique de la ligne : le score vit sous row.score.score, et
// un verdict « insuffisant » n'a pas de valeur triable même si le score existe.
const COLUMNS = [
  { key: 'views',          label: 'Vues' },
  { key: 'reach',          label: 'Portée' },
  { key: 'hookRate',       label: 'Hook rate' },
  { key: 'avgWatch',       label: 'Écoute moy.' },
  { key: 'shares',         label: 'Partages' },
  { key: 'saves',          label: 'Sauveg.' },
  { key: 'engagementRate', label: 'Eng.' },
  {
    key: 'score',
    label: 'Score',
    value: row => (row.score?.verdict === 'insuffisant' ? null : num(row.score?.score)),
  },
]

const MEDIA_FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'VIDEO', label: 'Vidéos et Reels' },
  { key: 'CAROUSEL_ALBUM', label: 'Carrousels' },
  { key: 'IMAGE', label: 'Images' },
]

function Th({ column, sort, onSort, onExplain }) {
  const active = sort.key === column.key
  return (
    <th
      onClick={() => onSort(column.key)}
      className={`px-3 py-3 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap
        text-right ${active ? 'text-[#1a1a1a]' : 'text-[#9ca3af]'}`}
    >
      {column.label}
      {active && <span className="ml-1">{sort.dir === -1 ? '↓' : '↑'}</span>}
      {onExplain && (
        <button
          onClick={e => { e.stopPropagation(); onExplain() }}
          title="Comment lire le score et l'index"
          className="ml-1.5 w-4 h-4 rounded-full border border-current text-[9px] leading-none
            inline-flex items-center justify-center align-middle hover:bg-[#f3f4f6]"
        >
          ?
        </button>
      )}
    </th>
  )
}

export default function Publications({ rows, onSelect }) {
  // Le tableau s'ouvre sur les mieux scorées. Les non scorées tombent en bas,
  // là où le comparateur envoie déjà toute métrique absente.
  const [sort, setSort] = useState({ key: 'score', dir: -1 })
  const [mediaFilter, setMediaFilter] = useState('all')
  const [explainerOpen, setExplainerOpen] = useState(false)

  function toggleSort(key) {
    setSort(s => (s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }))
  }

  const filtered = useMemo(
    () => (mediaFilter === 'all' ? rows : rows.filter(r => r.mediaType === mediaFilter)),
    [rows, mediaFilter],
  )

  const sorted = useMemo(() => {
    const column = COLUMNS.find(c => c.key === sort.key)
    const valueOf = column?.value ?? (row => row[sort.key])
    return [...filtered].sort((a, b) => {
      const av = valueOf(a)
      const bv = valueOf(b)
      // Une métrique non mesurée reste en bas quel que soit le sens du tri :
      // elle n'est pas « la plus petite », elle est absente.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return (av - bv) * sort.dir
    })
  }, [filtered, sort])

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 flex-wrap px-5 pt-5 pb-3">
        <div>
          <h3 className="text-base font-bold text-[#1a1a1a]">
            Publications mesurées <span className="text-sm font-semibold text-[#9ca3af]">({sorted.length})</span>
          </h3>
          <p className="text-xs text-[#6b7280] mt-0.5">
            Clique sur une ligne pour le détail · 100 = ta médiane pour ce format sur cette plateforme
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {MEDIA_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setMediaFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                mediaFilter === f.key
                  ? 'border-[#00bbb1] bg-[#00bbb1]/10 text-[#009e95]'
                  : 'border-[#e5e7eb] text-[#6b7280] hover:text-[#1a1a1a]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-[#fafafb]">
            <tr>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                Publication
              </th>
              {COLUMNS.map(c => (
                <Th
                  key={c.key} column={c} sort={sort} onSort={toggleSort}
                  onExplain={c.key === 'score' ? () => setExplainerOpen(true) : null}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f2]">
            {sorted.map(row => {
              const meta = platformMeta(row.platform)
              const tone = hookTone(row.hookRate)
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelect(row.id)}
                  className="cursor-pointer hover:bg-[#fafafb] transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-10 h-10 rounded-lg shrink-0"
                        style={{ background: `linear-gradient(135deg,${meta.color}25,${meta.color}60)` }}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#1a1a1a] truncate max-w-[380px]">
                          {publicationTitle(row.publication, row.post)}
                        </div>
                        <div className="text-[11px] text-[#9ca3af] mt-0.5">
                          {meta.label} · {mediaLabel(row.mediaType)} · {fmtDate(row.publishedAt)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums whitespace-nowrap">{fmtInt(row.views)}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums whitespace-nowrap text-[#6b7280]">{fmtInt(row.reach)}</td>
                  <td className="px-3 py-3 text-right">
                    {row.hookRate != null ? (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${tone.bg} ${tone.text}`}>
                        {fmtPct(row.hookRate, 0)}
                      </span>
                    ) : <span className="text-xs text-[#d1d5db]">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums whitespace-nowrap text-[#6b7280]">
                    {row.avgWatch != null ? fmtSeconds(row.avgWatch) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums whitespace-nowrap text-[#6b7280]">{fmtInt(row.shares)}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums whitespace-nowrap text-[#6b7280]">{fmtInt(row.saves)}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums whitespace-nowrap text-[#6b7280]">
                    {row.engagementRate != null ? fmtPct(row.engagementRate) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap"><ScoreCell score={row.score} lateMeasure={row.lateMeasure} /></td>
                </tr>
              )
            })}
            {!sorted.length && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-sm text-[#9ca3af]">
                  Aucune publication sur cette période avec ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <IndexExplainer isOpen={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </Card>
  )
}
