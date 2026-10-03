import { MAX_CLIPS, ROLES_CLIP } from '../../../lib/montageClips'

function Fleche({ bas }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={bas ? 'M19.5 8.25l-7.5 7.5-7.5-7.5' : 'M4.5 15.75l7.5-7.5 7.5 7.5'} />
    </svg>
  )
}

const boutonIcone = 'w-8 h-8 flex items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#374151] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed'

// Clips de l'étape 1, dans l'ordre du montage : réordonner (flèches), renommer,
// Principal ou B-roll, supprimer. Désactivée pendant un envoi.
export default function ListeClips({ clips, onDeplacer, onRenommer, onRole, onSupprimer, desactive, erreur }) {
  if (!clips?.length) return null
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-sm font-semibold text-[#1a1a1a]">Clips du montage</p>
        <p className="text-xs text-[#6b7280] tabular-nums">{clips.length} sur {MAX_CLIPS}</p>
      </div>
      <ol className="space-y-2" aria-label="Clips du montage">
        {clips.map((c, i) => (
          <li key={c.cle} data-role={c.role} className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white p-2.5">
            <span className="w-7 h-7 flex-shrink-0 rounded-full bg-gray-100 text-[#374151] text-xs font-bold flex items-center justify-center">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={c.nom}
                onChange={(e) => onRenommer(c.cle, e.target.value)}
                maxLength={120}
                disabled={desactive}
                aria-label={`Nom du clip ${i + 1}`}
                className="w-full px-2 py-1.5 border border-transparent hover:border-[#e5e7eb] rounded-md text-sm font-semibold text-[#1a1a1a] bg-transparent focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30 focus:border-[#00bbb1]"
              />
              <p className="px-2 text-xs text-[#6b7280] truncate">Brut/{c.nomSource}</p>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="inline-flex rounded-lg border border-[#e5e7eb] overflow-hidden" role="group" aria-label={`Rôle du clip ${i + 1}`}>
                {Object.entries(ROLES_CLIP).map(([role, label]) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => onRole(c.cle, role)}
                    disabled={desactive}
                    aria-pressed={c.role === role}
                    className={`px-2.5 py-1.5 text-xs font-semibold ${
                      c.role === role ? 'bg-[#00bbb1] text-white' : 'bg-white text-[#6b7280] hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" className={boutonIcone} onClick={() => onDeplacer(c.cle, -1)} disabled={desactive || i === 0} title="Monter" aria-label={`Monter le clip ${i + 1}`}>
                <Fleche />
              </button>
              <button type="button" className={boutonIcone} onClick={() => onDeplacer(c.cle, 1)} disabled={desactive || i === clips.length - 1} title="Descendre" aria-label={`Descendre le clip ${i + 1}`}>
                <Fleche bas />
              </button>
              <button type="button" className={`${boutonIcone} hover:text-red-600`} onClick={() => onSupprimer(c.cle)} disabled={desactive} title="Retirer" aria-label={`Retirer le clip ${i + 1}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ol>
      {erreur
        ? <p className="mt-2 text-xs text-red-600">{erreur}</p>
        : <p className="mt-2 text-xs text-[#6b7280]">Principal : la vidéo parlée. B-roll : les images d&apos;appoint. Retirer un clip ne l&apos;efface pas de Google Drive.</p>}
    </div>
  )
}
