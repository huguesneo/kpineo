import { useState, useMemo } from 'react'
import Card from '../../../components/shared/Card'
import CompetiteurDrawer from './CompetiteurDrawer'
import { useSocialCompetitors, indexTone, BREAKOUT_INDEX } from '../../../hooks/useSocialCompetitors'
import { fmtInt, fmtPct, fmtDate, platformMeta } from '../../../lib/socialFormat'

// ============================================================================
// Compétiteurs — ce qui marche chez les autres, et ce que ça disait
//
// Même grammaire que l'onglet Publications : un tableau trié par colonne, une
// ligne cliquable, un panneau de détail. Les colonnes diffèrent parce que les
// données diffèrent — Metricool ne donne ni vues, ni portée, ni sauvegardes
// pour les concurrents.
// ============================================================================

const COLUMNS = [
  { key: 'likes',          label: "J'aime" },
  { key: 'comments',       label: 'Comm.' },
  { key: 'shares',         label: 'Partages' },
  { key: 'interactions',   label: 'Interactions' },
  { key: 'engagementRate', label: 'Eng.' },
  { key: 'index',          label: 'Index' },
]

const MEDIA_FILTERS = [
  { key: 'all',  label: 'Tous' },
  { key: 'REEL', label: 'Reels' },
  { key: 'POST', label: 'Publications' },
]

// Les URL d'avatar viennent du CDN Meta et portent un jeton d'expiration :
// elles cassent au bout de quelques jours. L'initiale prend le relais sans
// que la carte ne se déforme.
function Avatar({ src, name, color, size = 40 }) {
  const [failed, setFailed] = useState(false)
  const initial = (name ?? '?').trim().charAt(0).toUpperCase()

  if (!src || failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full shrink-0 font-bold text-white"
        style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
      >
        {initial}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="rounded-full shrink-0 object-cover bg-[#f0f0f2]"
      style={{ width: size, height: size }}
    />
  )
}

function AccountCard({ account, active, onClick }) {
  const meta = platformMeta(account.network)
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-2xl border transition-colors ${
        active ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar src={account.pictureUrl} name={account.displayName} color={meta.color} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-[#1a1a1a] truncate" title={account.displayName}>
            {account.displayName}
          </div>
          <div className="text-[11px] text-[#9ca3af] flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: meta.color }} />
            <span className="truncate">{meta.label}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div>
          <div className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-bold">Abonnés</div>
          <div className="text-sm font-black text-[#1a1a1a] tabular-nums">{fmtInt(account.followers)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-bold">Par sem.</div>
          <div className="text-sm font-black text-[#1a1a1a] tabular-nums">
            {account.postCount ? account.perWeek.toFixed(1).replace('.', ',') : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-bold">Percées</div>
          <div className={`text-sm font-black tabular-nums ${account.breakouts ? 'text-emerald-600' : 'text-[#d1d5db]'}`}>
            {account.hasBaseline ? account.breakouts : '—'}
          </div>
        </div>
      </div>

      <div className="text-[11px] text-[#6b7280] mt-2">
        {account.postCount ? (
          <>
            {account.postCount} publication{account.postCount > 1 ? 's' : ''} · médiane{' '}
            {fmtInt(account.medianInteractions)} interactions
            {account.reelShare != null && (
              <span className="block mt-0.5 text-[#9ca3af]">
                {Math.round(account.reelShare * 100)} % de Reels
              </span>
            )}
          </>
        ) : (
          <span className="text-[#9ca3af] italic">aucune publication captée sur 90 jours</span>
        )}
      </div>
    </button>
  )
}

// Le connecteur Reels de Metricool n'expose aucune image, et les vignettes des
// posts viennent du CDN Meta avec un jeton qui expire. L'absence d'image est
// donc le cas courant, pas l'exception : le repli doit être un aplat assumé,
// pas un trou.
function Thumbnail({ src, color }) {
  const [failed, setFailed] = useState(false)
  const placeholder = (
    <span
      className="w-10 h-10 rounded-lg shrink-0 block"
      style={{ background: `linear-gradient(135deg,${color}25,${color}60)` }}
    />
  )
  if (!src || failed) return placeholder
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="w-10 h-10 rounded-lg shrink-0 object-cover"
      style={{ background: `${color}18` }}
    />
  )
}

function Th({ column, sort, onSort }) {
  const active = sort.key === column.key
  return (
    <th
      onClick={() => onSort(column.key)}
      className={`px-3 py-3 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none
        whitespace-nowrap text-right ${active ? 'text-[#1a1a1a]' : 'text-[#9ca3af]'}`}
    >
      {column.label}
      {active && <span className="ml-1">{sort.dir === -1 ? '↓' : '↑'}</span>}
    </th>
  )
}

export default function Competiteurs({ filters }) {
  const { loading, error, refetch, rows, accounts, lastSync, minBaseline, baselineDays } =
    useSocialCompetitors()
  const [selectedKey, setSelectedKey] = useState(null)
  const [sort, setSort] = useState({ key: 'index', dir: -1 })
  const [mediaFilter, setMediaFilter] = useState('all')
  const [breakoutsOnly, setBreakoutsOnly] = useState(false)
  const [openId, setOpenId] = useState(null)

  const platform = filters?.platform ?? 'all'
  const days = filters?.days ?? 90

  function toggleSort(key) {
    setSort(s => (s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }))
  }

  const visibleAccounts = useMemo(
    () => accounts.filter(a => platform === 'all' || a.network === platform),
    [accounts, platform],
  )

  const visibleRows = useMemo(() => {
    const cutoff = Date.now() - days * 864e5
    const kept = rows.filter(r => {
      if (platform !== 'all' && r.network !== platform) return false
      if (selectedKey && `${r.network}|${r.competitor}` !== selectedKey) return false
      if (mediaFilter !== 'all' && r.mediaType !== mediaFilter) return false
      if (!r.publishedAt || Date.parse(r.publishedAt) < cutoff) return false
      if (breakoutsOnly && !(r.index != null && r.index >= BREAKOUT_INDEX)) return false
      return true
    })

    const valueOf = sort.key === 'date'
      ? r => (r.publishedAt ? Date.parse(r.publishedAt) : null)
      : r => r[sort.key]

    return [...kept].sort((a, b) => {
      const av = valueOf(a)
      const bv = valueOf(b)
      // Une métrique non mesurée reste en bas quel que soit le sens du tri :
      // elle n'est pas « la plus petite », elle est absente.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return (av - bv) * sort.dir
    })
  }, [rows, platform, days, selectedKey, mediaFilter, breakoutsOnly, sort])

  const open = useMemo(() => rows.find(r => r.id === openId) ?? null, [rows, openId])

  if (loading) {
    return <Card className="p-10 text-center text-sm text-[#9ca3af]">Chargement des compétiteurs…</Card>
  }

  if (error) {
    return (
      <Card className="p-5 border-red-200 bg-red-50">
        <p className="text-sm text-red-700">Compétiteurs : {error}</p>
      </Card>
    )
  }

  if (!accounts.length) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-semibold text-[#1a1a1a]">Aucun compétiteur synchronisé pour l'instant.</p>
        <p className="text-xs text-[#6b7280] mt-2 max-w-lg mx-auto">
          Les comptes suivis se configurent dans Metricool, pas ici. La synchronisation quotidienne
          les récupère ensuite automatiquement, avec leurs publications des 90 derniers jours.
        </p>
      </Card>
    )
  }

  const breakoutCount = visibleRows.filter(r => r.index != null && r.index >= BREAKOUT_INDEX).length

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="text-sm text-[#1a1a1a]">
          <span className="font-semibold">Index 100</span> = une publication ordinaire pour ce compte.
          Une <span className="font-semibold text-emerald-700">percée</span> commence à {BREAKOUT_INDEX},
          soit son décile supérieur. C'est l'équivalent de ton score interne, transposé aux seules
          données que Metricool donne sur les concurrents : ni vues, ni portée, ni sauvegardes — donc
          un compteur brut ne dirait que la taille du compte.
        </p>
        <p className="text-xs text-[#9ca3af] mt-1.5">
          La médiane de référence se calcule sur {baselineDays} jours et ne bouge pas avec le filtre de
          période — sinon elle changerait de sens à chaque clic. Sous {minBaseline} publications, un compte
          n'a pas d'index. Les partages ne sont exposés que sur Facebook.
        </p>
      </Card>

      {/* Comptes suivis — cliquer pour filtrer le tableau */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {visibleAccounts.map(a => (
          <AccountCard
            key={a.key}
            account={a}
            active={selectedKey === a.key}
            onClick={() => setSelectedKey(k => (k === a.key ? null : a.key))}
          />
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-4 flex-wrap px-5 pt-5 pb-3">
          <div>
            <h3 className="text-base font-bold text-[#1a1a1a]">
              Leurs publications{' '}
              <span className="text-sm font-semibold text-[#9ca3af]">({visibleRows.length})</span>
            </h3>
            <p className="text-xs text-[#6b7280] mt-0.5">
              Clique sur une ligne pour lire le texte en entier ·{' '}
              {breakoutCount > 0
                ? `${breakoutCount} percée${breakoutCount > 1 ? 's' : ''} sur la période`
                : 'aucune percée sur la période'}
              {selectedKey && ' · filtré sur un compte'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* La synchronisation tourne la nuit : une page ouverte depuis la
                veille montre encore l'état d'hier sans le dire. */}
            <button
              onClick={refetch}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold border border-[#e5e7eb]
                text-[#6b7280] hover:text-[#1a1a1a] transition-colors"
            >
              Actualiser
            </button>
            <button
              onClick={() => setBreakoutsOnly(v => !v)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                breakoutsOnly
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-[#e5e7eb] text-[#6b7280] hover:text-[#1a1a1a]'
              }`}
            >
              Percées seulement
            </button>
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
                <th
                  onClick={() => toggleSort('date')}
                  className={`px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider
                    cursor-pointer select-none ${sort.key === 'date' ? 'text-[#1a1a1a]' : 'text-[#9ca3af]'}`}
                >
                  Publication
                  {sort.key === 'date' && <span className="ml-1">{sort.dir === -1 ? '↓' : '↑'}</span>}
                </th>
                {COLUMNS.map(c => (
                  <Th key={c.key} column={c} sort={sort} onSort={toggleSort} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f2]">
              {visibleRows.map(row => {
                const meta = platformMeta(row.network)
                const tone = indexTone(row.index)
                const name = row.profile?.display_name || row.competitor
                return (
                  <tr
                    key={row.id}
                    onClick={() => setOpenId(row.id)}
                    className="cursor-pointer hover:bg-[#fafafb] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Thumbnail src={row.picture} color={meta.color} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#1a1a1a] truncate max-w-[380px]">
                            {row.caption || `Publication du ${fmtDate(row.publishedAt)}`}
                          </div>
                          <div className="text-[11px] text-[#9ca3af] mt-0.5">
                            {name} · {meta.label} · {row.mediaType === 'REEL' ? 'Reel' : 'Publication'}
                            {' · '}{fmtDate(row.publishedAt)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums whitespace-nowrap text-[#6b7280]">{fmtInt(row.likes)}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums whitespace-nowrap text-[#6b7280]">{fmtInt(row.comments)}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums whitespace-nowrap text-[#6b7280]">{fmtInt(row.shares)}</td>
                    <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums whitespace-nowrap">{fmtInt(row.interactions)}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums whitespace-nowrap text-[#6b7280]">
                      {row.engagementRate != null ? fmtPct(row.engagementRate, 2) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {row.index != null ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black ${tone.bg} ${tone.text}`}
                          title={tone.label}
                        >
                          {Math.round(row.index)}
                        </span>
                      ) : (
                        <span className="text-xs text-[#9ca3af]" title={`Baseline de ${row.baselineN} publications — il en faut ${minBaseline}.`}>
                          insuffisant
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!visibleRows.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-[#9ca3af]">
                    Aucune publication de compétiteur avec ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {lastSync && (
        <p className="text-[11px] text-[#9ca3af] text-right">
          Dernier relevé des compétiteurs : {fmtDate(lastSync)}
        </p>
      )}

      {open && <CompetiteurDrawer row={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}
