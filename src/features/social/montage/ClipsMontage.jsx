import { useState } from 'react'
import { ROLES_CLIP, trierClips, formatDureeClip, remplacements } from '../../../lib/montageClips'
import AjoutClip from './AjoutClip'

const boutonLigne = 'text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] disabled:text-[#9ca3af] disabled:cursor-not-allowed'

// Clips du montage dans l'éditeur. Après la v1 (ajout = etatAjoutClip,
// onAjouter fourni) : « Ajouter un clip » et « Remplacer » sur chaque clip
// encore utilisé. Un clip remplacé reste affiché, grisé, jamais effacé.
// onPhrase reçoit la phrase à mettre dans la demande.
// versionsAjout : affiche « ajouté en vN » (pas pour une variante, dont les
// clips recopiés gardent les numéros de l'original).
export default function ClipsMontage({ clips, ajout, onAjouter, onPhrase, versionsAjout = true }) {
  const [panneau, setPanneau] = useState(null) // null | { remplace: clip | null }
  const tries = trierClips(clips)
  if (!tries.length) return null
  const remplacePar = remplacements(tries)
  const modifiable = !!(onAjouter && ajout?.visible)
  const bloque = !modifiable || ajout.desactive || !!panneau

  return (
    <div>
      <h2 className="text-sm font-bold text-[#1a1a1a] mb-2">Clips</h2>
      <ol className="space-y-1.5" aria-label="Clips du montage">
        {tries.map(c => {
          const duree = formatDureeClip(c.duree_s)
          const par = remplacePar[c.ordre]
          return (
            <li key={c.id ?? c.ordre} data-role={c.role} data-remplace={par ? 'oui' : undefined} className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm ${par ? 'opacity-60' : ''}`}>
              <span className="w-6 h-6 flex-shrink-0 rounded-full bg-gray-100 text-[#374151] text-xs font-bold flex items-center justify-center">{c.ordre}</span>
              <span className={`min-w-0 flex-1 truncate text-[#1a1a1a] ${par ? 'line-through' : ''}`} title={c.nom_source ? `Brut/${c.nom_source}` : undefined}>{c.nom}</span>
              {duree && <span className="text-xs text-[#6b7280] tabular-nums">{duree}</span>}
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                c.role === 'principal' ? 'bg-[#00bbb1]/10 text-[#00bbb1]' : 'bg-gray-100 text-[#6b7280]'
              }`}>
                {ROLES_CLIP[c.role] ?? c.role}
              </span>
              {modifiable && !par && (
                <button type="button" className={boutonLigne} disabled={bloque} onClick={() => setPanneau({ remplace: c })}>
                  Remplacer
                </button>
              )}
              {(par || c.remplace_ordre != null || (versionsAjout && c.ajoute_en_version)) && (
                <span className="basis-full pl-8 text-xs text-[#6b7280]">
                  {[
                    par && `Remplacé par le clip ${par.ordre}`,
                    c.remplace_ordre != null && `Remplace le clip ${c.remplace_ordre}`,
                    versionsAjout && c.ajoute_en_version && `ajouté après la v${c.ajoute_en_version}`,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {modifiable && (
        <div className="mt-3">
          {ajout.raison && <p className="text-xs text-[#6b7280] mb-2" role="status">{ajout.raison}</p>}
          {panneau ? (
            <AjoutClip
              key={panneau.remplace?.ordre ?? 'ajout'}
              remplace={panneau.remplace}
              clips={tries}
              avertissement={ajout.avertissement}
              onAjouter={onAjouter}
              onFini={(phrase) => { setPanneau(null); onPhrase?.(phrase) }}
              onAnnuler={() => setPanneau(null)}
            />
          ) : (
            <button type="button" className={boutonLigne} disabled={bloque} onClick={() => setPanneau({ remplace: null })}>
              + Ajouter un clip
            </button>
          )}
        </div>
      )}
    </div>
  )
}
