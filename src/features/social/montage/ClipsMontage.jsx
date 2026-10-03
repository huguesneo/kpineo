import { ROLES_CLIP, trierClips, formatDureeClip } from '../../../lib/montageClips'

// Clips du montage dans l'éditeur, en lecture seule (choisis au lancement).
export default function ClipsMontage({ clips }) {
  const tries = trierClips(clips)
  if (!tries.length) return null
  return (
    <div>
      <h2 className="text-sm font-bold text-[#1a1a1a] mb-2">Clips</h2>
      <ol className="space-y-1.5" aria-label="Clips du montage">
        {tries.map(c => {
          const duree = formatDureeClip(c.duree_s)
          return (
            <li key={c.id ?? c.ordre} data-role={c.role} className="flex items-center gap-2 text-sm">
              <span className="w-6 h-6 flex-shrink-0 rounded-full bg-gray-100 text-[#374151] text-xs font-bold flex items-center justify-center">{c.ordre}</span>
              <span className="min-w-0 flex-1 truncate text-[#1a1a1a]" title={c.nom_source ? `Brut/${c.nom_source}` : undefined}>{c.nom}</span>
              {duree && <span className="text-xs text-[#6b7280] tabular-nums">{duree}</span>}
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                c.role === 'principal' ? 'bg-[#00bbb1]/10 text-[#00bbb1]' : 'bg-gray-100 text-[#6b7280]'
              }`}>
                {ROLES_CLIP[c.role] ?? c.role}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
