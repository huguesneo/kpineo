import { useState, useMemo } from 'react'
import Card from '../../../components/shared/Card'
import VueEnsemble from './VueEnsemble'
import Publications from './Publications'
import RetentionHook from './RetentionHook'
import Audience from './Audience'
import Croissance from './Croissance'
import Patterns from './Patterns'
import RendezVous from './RendezVous'
import PublicationDrawer from './PublicationDrawer'
import { useSocialAnalytics, useSocialAiReport, useSocialAttribution, filterRows } from '../../../hooks/useSocialAnalytics'
import { platformMeta, PLATFORM_ORDER } from '../../../lib/socialFormat'

// ============================================================================
// Dashboard d'analyse — onglets, filtres globaux, chargement
// ============================================================================

const TABS = [
  { key: 'ensemble',  label: "Vue d'ensemble" },
  { key: 'pubs',      label: 'Publications' },
  { key: 'retention', label: 'Rétention & hook' },
  { key: 'audience',  label: 'Audience' },
  { key: 'croissance', label: 'Croissance' },
  { key: 'rdv',       label: 'Rendez-vous' },
  { key: 'patterns',  label: 'Patterns' },
]

const PERIODS = [
  { key: 7,  label: '7 j' },
  { key: 30, label: '30 j' },
  { key: 90, label: '90 j' },
]

export default function AnalyseView({ onEditPost }) {
  const { loading, error, rows, daily, audience, accounts, posts } = useSocialAnalytics()
  const { report } = useSocialAiReport(rows)
  const { attribution, loading: attrLoading } = useSocialAttribution()
  const [tab, setTab] = useState('ensemble')
  const [platform, setPlatform] = useState('all')
  const [days, setDays] = useState(30)
  const [selectedId, setSelectedId] = useState(null)

  const filters = { platform, days }
  const filtered = useMemo(() => filterRows(rows, filters), [rows, platform, days])
  const selected = useMemo(() => rows.find(r => r.id === selectedId) ?? null, [rows, selectedId])

  // Une plateforme n'apparaît dans les filtres que si elle a des publications :
  // afficher « Google » avec zéro donnée serait une promesse vide.
  const availablePlatforms = useMemo(() => {
    const present = new Set(rows.map(r => r.platform))
    return PLATFORM_ORDER.filter(p => present.has(p))
  }, [rows])

  const countsByPlatform = useMemo(() => {
    const counts = {}
    for (const r of filterRows(rows, { platform: 'all', days })) {
      counts[r.platform] = (counts[r.platform] ?? 0) + 1
    }
    return counts
  }, [rows, days])

  if (loading) {
    return <Card className="p-10 text-center text-sm text-[#9ca3af]">Chargement des données d'analyse…</Card>
  }

  if (error) {
    return (
      <Card className="p-5 border-red-200 bg-red-50">
        <p className="text-sm text-red-700">Données d'analyse : {error}</p>
      </Card>
    )
  }

  const lastSync = accounts
    .map(a => a.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1)

  return (
    <div className="flex flex-col gap-5">
      {/* Filtres globaux, valables pour tous les onglets */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setPlatform('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              platform === 'all'
                ? 'border-[#00bbb1] bg-[#00bbb1]/10 text-[#009e95]'
                : 'border-[#e5e7eb] text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
          >
            Toutes
            <span className="ml-1.5 opacity-60">
              {Object.values(countsByPlatform).reduce((a, b) => a + b, 0)}
            </span>
          </button>
          {availablePlatforms.map(p => {
            const meta = platformMeta(p)
            const active = platform === p
            return (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? 'border-[#00bbb1] bg-[#00bbb1]/10 text-[#009e95]'
                    : 'border-[#e5e7eb] text-[#6b7280] hover:text-[#1a1a1a]'
                }`}
              >
                <span className="w-2 h-2 rounded-sm" style={{ background: meta.color }} />
                {meta.label}
                <span className="opacity-60">{countsByPlatform[p] ?? 0}</span>
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        <div className="flex items-center bg-white rounded-xl border border-[#e5e7eb] p-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setDays(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                days === p.key ? 'bg-[#1a1a1a] text-white' : 'text-[#6b7280] hover:text-[#1a1a1a]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Onglets du dashboard */}
      <div className="flex gap-1 border-b border-[#e5e7eb] overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-[#00bbb1] text-[#1a1a1a] font-semibold'
                : 'border-transparent text-[#6b7280] font-medium hover:text-[#1a1a1a]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ensemble' && (
        <VueEnsemble
          rows={filtered} allRows={rows} daily={daily} audience={audience}
          filters={filters} report={report} onSelect={setSelectedId}
        />
      )}
      {tab === 'pubs' && <Publications rows={filtered} onSelect={setSelectedId} />}
      {tab === 'retention' && <RetentionHook rows={filtered} onSelect={setSelectedId} />}
      {tab === 'audience' && <Audience rows={filtered} audience={audience} />}
      {tab === 'croissance' && <Croissance daily={daily} filters={filters} />}
      {tab === 'rdv' && (
        <RendezVous
          posts={posts} attribution={attribution} loading={attrLoading}
          onPostClick={onEditPost ?? (() => {})}
        />
      )}
      {tab === 'patterns' && <Patterns rows={filtered} />}

      {lastSync && (
        <p className="text-[11px] text-[#9ca3af] text-right">
          Dernière synchronisation des comptes : {new Date(lastSync).toLocaleString('fr-CA')}
        </p>
      )}

      {selected && (
        <PublicationDrawer
          row={selected}
          onClose={() => setSelectedId(null)}
          onEditPost={onEditPost ? post => { setSelectedId(null); onEditPost(post) } : null}
        />
      )}
    </div>
  )
}
