import ActionConfirmee from './ActionConfirmee'
import Card from '../../../components/shared/Card'
import {
  etatRestaurer, texteConfirmationRestaurer, etatTerminer, texteConfirmationTerminer, lienExport,
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

// « Terminer et exporter » : rendu HD dans Drive, sans approbation.
export function BoutonTerminer({ job, taches, onTerminer, ouvertInitial }) {
  const etat = etatTerminer({ job, taches })
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

// Bandeau d'un montage terminé : où se trouve l'export.
export function BandeauTermine({ job }) {
  if (job?.statut !== 'termine') return null
  const lien = lienExport(job)
  return (
    <Card className="p-4 mb-4 border-emerald-200 bg-emerald-50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-800">Montage terminé : la vidéo HD est dans Google Drive</p>
          {lien?.chemin && <p className="text-xs text-emerald-700 mt-0.5 break-all">{lien.chemin}</p>}
          {!lien && <p className="text-xs text-emerald-700 mt-0.5">L&apos;agent n&apos;a pas indiqué où se trouve l&apos;export.</p>}
          <p className="text-xs text-emerald-700 mt-1">Les demandes, les corrections de sous-titres et le retour à une version sont désactivés.</p>
        </div>
        <LienExport job={job} />
      </div>
    </Card>
  )
}
