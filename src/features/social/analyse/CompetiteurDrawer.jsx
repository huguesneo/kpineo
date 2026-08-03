import { useEffect } from 'react'
import { indexTone } from '../../../hooks/useSocialCompetitors'
import { fmtInt, fmtPct, fmtDateLong, platformMeta } from '../../../lib/socialFormat'

// ============================================================================
// Panneau de détail d'une publication de compétiteur
//
// Même forme que PublicationDrawer, mais l'accent est ailleurs : sur nos
// publications on vient lire des métriques, ici on vient lire le TEXTE. La
// légende occupe donc la place principale, pas une ligne de bas de page.
// ============================================================================

function Stat({ label, value, hint }) {
  return (
    <div className="bg-[#f7f7f9] rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">{label}</div>
      <div className="text-lg font-bold text-[#1a1a1a] mt-1 tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-[#9ca3af] mt-0.5">{hint}</div>}
    </div>
  )
}

export default function CompetiteurDrawer({ row, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!row) return null

  const meta = platformMeta(row.network)
  const tone = indexTone(row.index)
  const name = row.profile?.display_name || row.competitor

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[#14141a]/30" onClick={onClose} />
      <div
        className="absolute top-0 right-0 bottom-0 bg-white shadow-2xl overflow-y-auto"
        style={{ width: 'min(560px, 94vw)' }}
      >
        <div
          className="relative h-44"
          style={{ background: `linear-gradient(150deg,${meta.color}55,${meta.color}cc)` }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-[#1a1a1a] text-lg leading-none hover:bg-white"
            aria-label="Fermer"
          >
            ×
          </button>
          <span
            className="absolute top-4 left-5 text-[10px] font-bold uppercase tracking-wider bg-white px-3 py-1 rounded-full"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
          <div className="absolute bottom-5 left-6 right-6 text-white">
            <div className="text-lg font-bold leading-snug">{name}</div>
            <div className="text-xs opacity-90 mt-1.5">
              {row.mediaType === 'REEL' ? 'Reel' : 'Publication'} · {fmtDateLong(row.publishedAt)}
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center px-3 py-1 rounded-lg text-base font-black ${tone.bg} ${tone.text}`}>
              {row.index != null ? Math.round(row.index) : '—'}
            </span>
            <span className="text-sm font-semibold text-[#6b7280]">{tone.label}</span>
            {row.baselineMedian != null && (
              <span className="text-xs text-[#9ca3af]">
                médiane du compte : {fmtInt(row.baselineMedian)} sur {row.baselineN} publications
              </span>
            )}
          </div>

          {row.picture && (
            <img
              src={row.picture}
              alt=""
              onError={e => { e.currentTarget.style.display = 'none' }}
              className="w-full rounded-2xl object-cover max-h-72 bg-[#f0f0f2]"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Interactions" value={fmtInt(row.interactions)} />
            <Stat
              label="Engagement"
              value={row.engagementRate != null ? fmtPct(row.engagementRate, 2) : '—'}
              hint={row.engagementRate == null ? 'non calculé par Metricool' : 'pour 1 000 abonnés'}
            />
            <Stat label={row.network === 'facebook' ? 'Réactions' : "J'aime"} value={fmtInt(row.likes)} />
            <Stat label="Commentaires" value={fmtInt(row.comments)} />
            <Stat
              label="Partages"
              value={fmtInt(row.shares)}
              hint={row.network === 'instagram' ? 'non exposé par Instagram' : null}
            />
            <Stat label="Format" value={row.mediaType === 'REEL' ? 'Reel' : 'Publication'} />
          </div>

          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] mb-2">
              Le texte, mot pour mot
            </h4>
            {row.caption ? (
              <p className="text-sm text-[#1a1a1a] whitespace-pre-wrap leading-relaxed bg-[#fafafb] rounded-xl p-4 border border-[#f0f0f2]">
                {row.caption}
              </p>
            ) : (
              <p className="text-sm text-[#9ca3af] italic">Légende non fournie par Metricool.</p>
            )}
          </div>

          {row.url && (
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block text-center px-4 py-3 rounded-xl bg-[#1a1a1a] text-white text-sm font-semibold hover:bg-[#333]"
            >
              Ouvrir sur {meta.label} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
