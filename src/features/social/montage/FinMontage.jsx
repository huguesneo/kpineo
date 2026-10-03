import ActionConfirmee from './ActionConfirmee'
import Card from '../../../components/shared/Card'
import {
  etatRestaurer, texteConfirmationRestaurer, etatTerminer, texteConfirmationTerminer, lienExport, infoDernierExport,
} from '../../../lib/montageFin'

// « Restaurer cette version » : sous la bande, seulement pour une ancienne
// version affichée (la version actuelle n'a pas ce bouton).
export function RestaurerVersion({ job, taches, version, onRestaurer, ouvertInitial }) {
  const etat = etatRestaurer({ job, taches, version })
  if (!etat.visible) return null
  return (
    <div className="mt-3 pt-3 border-t border-[#f0f0f2]">
      <ActionConfirmee
        libelle="Restaurer cette version"
        titre={`Restaurer la v${version.numero} ?`}
        texte={texteConfirmationRestaurer(version.numero, job.version_courante)}
        libelleConfirmer={`Restaurer la v${version.numero}`}
        etat={etat}
        onConfirmer={() => onRestaurer(version.numero)}
        ouvertInitial={ouvertInitial}
      />
    </div>
  )
}

// « Terminer et exporter » : rendu HD dans Drive, sans approbation. Reste
// après un export : désactivé tant que la version actuelle est déjà exportée.
export function BoutonTerminer({ job, taches, versions, onTerminer, ouvertInitial }) {
  const etat = etatTerminer({ job, taches, versions })
  if (!etat.visible) return null
  return (
    <div className="max-w-md">
      <ActionConfirmee
        libelle="Terminer et exporter"
        titre={`Terminer et exporter la v${job.version_courante} ?`}
        texte={texteConfirmationTerminer(job)}
        libelleConfirmer="Exporter en HD"
        variante="primary"
        etat={etat}
        onConfirmer={onTerminer}
        ouvertInitial={ouvertInitial}
      />
    </div>
  )
}

// Lien « Ouvrir dans Drive » vers l'export (recherche Drive sur le nom exact
// du fichier tant que l'agent n'écrit qu'un chemin).
export function LienExport({ job, compact = false }) {
  const lien = lienExport(job)
  if (!lien) return null
  return (
    <a
      href={lien.url}
      target="_blank"
      rel="noreferrer"
      title={lien.chemin || 'Vidéo finale dans Google Drive'}
      className={`${compact ? 'text-sm' : 'text-sm px-3 py-1.5 rounded-lg border border-emerald-300 bg-white'} font-semibold text-[#00bbb1] hover:underline`}
    >
      Ouvrir dans Drive
    </a>
  )
}

// « Dernier export » : tant qu'un export existe, même après de nouveaux
// changements (le montage n'est alors plus Terminé). Précise si c'est la
// version actuelle ou une plus ancienne.
export function BandeauExport({ job, versions, taches }) {
  const info = infoDernierExport({ job, versions, taches })
  if (!info && job?.statut !== 'termine') return null
  const vert = !info || info.actuelle
  return (
    <Card className={`p-4 mb-4 ${vert ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-[#f9fafb]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${vert ? 'text-emerald-800' : 'text-[#374151]'} break-all`}>
            {info ? `Dernier export : ${info.fichier || 'vidéo HD dans Google Drive'}` : 'Montage terminé'}
          </p>
          {info?.detail && <p className={`text-xs mt-0.5 ${vert ? 'text-emerald-700' : 'text-[#6b7280]'}`}>{info.detail}</p>}
          {info?.chemin && <p className={`text-xs mt-0.5 break-all ${vert ? 'text-emerald-700' : 'text-[#6b7280]'}`}>{info.chemin}</p>}
          {!info && <p className="text-xs text-emerald-700 mt-0.5">L&apos;agent n&apos;a pas indiqué où se trouve l&apos;export.</p>}
        </div>
        <LienExport job={job} />
      </div>
    </Card>
  )
}
