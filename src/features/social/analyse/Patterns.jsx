import { useMemo } from 'react'
import Card from '../../../components/shared/Card'
import { platformMeta, mediaLabel } from '../../../lib/socialFormat'

// ============================================================================
// Patterns — agrégats avec garde-fou statistique
//
// C'est la contrepartie rigoureuse du bandeau de recommandation : ici on ne
// conclut pas sous 6 publications, et chaque médiane vient avec sa bande de
// confiance. Le calcul est inchangé depuis la version précédente du module.
// ============================================================================

const MIN_N = 6
const BOOTSTRAP_ITER = 1000

function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Bootstrap par percentiles — 1000 rééchantillonnages avec remise.
// Le volume est petit (quelques dizaines de publications), ça tourne en ms.
function bootstrapMedianCI(values) {
  if (values.length < 2) return null
  const meds = new Array(BOOTSTRAP_ITER)
  const sample = new Array(values.length)
  for (let i = 0; i < BOOTSTRAP_ITER; i++) {
    for (let j = 0; j < values.length; j++) sample[j] = values[Math.floor(Math.random() * values.length)]
    meds[i] = median(sample)
  }
  meds.sort((a, b) => a - b)
  const at = q => meds[Math.min(meds.length - 1, Math.max(0, Math.round(q * (meds.length - 1))))]
  return [at(0.025), at(0.975)]
}

const DIMENSIONS = [
  { key: 'platformLabel', label: 'Par plateforme' },
  { key: 'mediaLabel',    label: 'Par type de contenu' },
  { key: 'sphere',        label: 'Par sphère' },
  { key: 'format',        label: 'Par format' },
  { key: 'hookType',      label: 'Par type de hook' },
  { key: 'audienceProblem', label: 'Par problème d\'audience' },
]

function groupRows(rows, key) {
  const groups = {}
  for (const r of rows) {
    const g = (r[key] ?? '').toString().trim() || 'Non renseigné'
    ;(groups[g] ??= []).push(Number(r.score.score))
  }
  return Object.entries(groups)
    .map(([label, values]) => {
      const enough = values.length >= MIN_N
      return {
        label,
        n: values.length,
        median: enough ? median(values) : null,
        ci: enough ? bootstrapMedianCI(values) : null,
      }
    })
    .sort((a, b) => (b.median ?? -Infinity) - (a.median ?? -Infinity) || b.n - a.n)
}

function PatternTable({ label, groups }) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-bold text-[#1a1a1a] mb-3">{label}</h3>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#e5e7eb]">
            <th className="text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide pb-2">Groupe</th>
            <th className="text-right text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide pb-2 w-12">n</th>
            <th className="text-right text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide pb-2 w-20">Médiane</th>
            <th className="text-right text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide pb-2 w-40">Bande de confiance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0f0f2]">
          {groups.map(g => {
            const weak = g.median == null
            return (
              <tr key={g.label} className={weak ? 'text-[#9ca3af]' : ''}>
                <td className="py-2 text-sm font-semibold max-w-[180px] truncate" title={g.label}>{g.label}</td>
                <td className="py-2 text-sm text-right font-semibold">{g.n}</td>
                {weak
                  ? <td className="py-2 text-xs text-right italic" colSpan={2}>échantillon insuffisant</td>
                  : (
                    <>
                      <td className="py-2 text-sm text-right font-black text-[#1a1a1a]">{Math.round(g.median)}</td>
                      <td className="py-2 text-xs text-right text-[#6b7280]">
                        {g.ci ? `${Math.round(g.ci[0])} – ${Math.round(g.ci[1])}` : '—'}
                      </td>
                    </>
                  )}
              </tr>
            )
          })}
          {!groups.length && (
            <tr><td colSpan={4} className="py-3 text-sm text-[#9ca3af]">Aucune publication scorée sur la fenêtre.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

export default function Patterns({ rows }) {
  const scored = useMemo(
    () => rows
      .filter(r => r.score?.score != null)
      .map(r => ({
        ...r,
        platformLabel: platformMeta(r.platform).label,
        mediaLabel: mediaLabel(r.mediaType),
      })),
    [rows],
  )

  const tables = useMemo(
    () => DIMENSIONS.map(d => ({ ...d, groups: groupRows(scored, d.key) })),
    [scored],
  )

  const taggedCount = scored.filter(r => r.post).length

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="text-sm text-[#1a1a1a]">
          <span className="font-semibold">{scored.length}</span> publication{scored.length > 1 ? 's' : ''} scorée{scored.length > 1 ? 's' : ''} sur
          la période. Bande de confiance à 95 % par bootstrap ({BOOTSTRAP_ITER} rééchantillonnages).
        </p>
        <p className="text-xs text-[#9ca3af] mt-1">
          Sous {MIN_N} publications, un groupe reste gris : c'est normal au début, pas une erreur —
          il n'y a simplement pas de quoi conclure.
        </p>
        {scored.length > 0 && taggedCount === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            Aucune publication scorée n'est reliée à un contenu du pipeline : sphère, hook et problème
            d'audience resteront « Non renseigné » tant que le matching n'aura pas lié
            <code className="mx-1">social_publications.post_id</code>. Plateforme et type de contenu,
            eux, viennent de la plateforme et sont toujours disponibles.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tables.map(t => <PatternTable key={t.key} label={t.label} groups={t.groups} />)}
      </div>
    </div>
  )
}
