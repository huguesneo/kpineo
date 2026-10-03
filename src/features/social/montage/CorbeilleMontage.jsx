import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../components/shared/Button'
import Card from '../../../components/shared/Card'
import ActionConfirmee from './ActionConfirmee'
import { dateFr } from './PastilleMac'
import { etatSuppression, confirmationSuppression, messageErreurCorbeille } from '../../../lib/montageCorbeille'

// Bouton « Supprimer » (liste et éditeur) : confirmation sur place, puis le
// montage passe dans la corbeille. Désactivé tant qu'une tâche attend ou tourne.
export function BoutonSupprimer({ job, taches, nbVariantes = 0, onSupprimer, ouvertInitial = false }) {
  const etat = etatSuppression({ job, taches })
  if (!etat.visible || !onSupprimer) return null
  const c = confirmationSuppression(job, nbVariantes)
  return (
    <ActionConfirmee
      libelle="Supprimer"
      titre={c.titre}
      texte={c.texte}
      libelleConfirmer={c.libelleConfirmer}
      etat={etat}
      onConfirmer={() => onSupprimer(job)}
      varianteConfirmer="danger"
      messageErreur={messageErreurCorbeille}
      ouvertInitial={ouvertInitial}
    />
  )
}

// Bouton « Restaurer » : un clic suffit, rien n'est perdu.
export function BoutonRestaurer({ job, onRestaurer }) {
  const [envoi, setEnvoi] = useState({ enCours: false, erreur: null })
  async function restaurer() {
    setEnvoi({ enCours: true, erreur: null })
    try {
      await onRestaurer(job)
      setEnvoi({ enCours: false, erreur: null })
    } catch (err) {
      setEnvoi({ enCours: false, erreur: messageErreurCorbeille(err) })
    }
  }
  return (
    <div className="space-y-1">
      <Button type="button" variant="secondary" size="sm" onClick={restaurer} loading={envoi.enCours}>Restaurer</Button>
      {envoi.erreur && <p className="text-xs text-red-600">{envoi.erreur}</p>}
    </div>
  )
}

// Éditeur d'un montage dans la corbeille : tout est en lecture seule.
export function BandeauCorbeille({ job, noms = {}, onRestaurer }) {
  return (
    <Card className="p-4 mb-4 border-amber-200 bg-amber-50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-800">Ce montage est dans la corbeille</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Supprimé le {dateFr(job.supprime_le)}{job.supprime_par ? ` par ${noms[job.supprime_par] || job.supprime_par}` : ''}.
            {' '}Restaure-le pour faire une demande, une variante ou ajouter un clip.
          </p>
        </div>
        <BoutonRestaurer job={job} onRestaurer={onRestaurer} />
      </div>
    </Card>
  )
}

// Vue « Corbeille » de la page Montage vidéo.
export function ListeCorbeille({ corbeille, noms = {}, onRestaurer }) {
  if (!corbeille?.length) {
    return <p className="text-sm text-[#6b7280] px-5 pb-5">La corbeille est vide.</p>
  }
  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-[#6b7280] px-5 pb-3">
        Rien n'est effacé : un montage restauré revient avec ses versions et ses clips. Les exports dans Google Drive ne sont jamais touchés.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#6b7280] border-b border-[#e5e7eb]">
            <th className="px-5 py-3">Titre</th>
            <th className="px-5 py-3">Supprimé le</th>
            <th className="px-5 py-3">Par</th>
            <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {corbeille.map(job => (
            <tr key={job.id} className="border-b border-[#f0f0f2] last:border-0 align-top">
              <td className="px-5 py-4">
                <Link to={`/reseaux-sociaux/montage/${job.id}`} className="font-semibold text-[#1a1a1a] hover:text-[#00bbb1] hover:underline">
                  {job.titre}
                </Link>
                {job.version_courante > 0 && <p className="text-xs text-[#6b7280] mt-0.5">v{job.version_courante}</p>}
              </td>
              <td className="px-5 py-4 text-[#6b7280] whitespace-nowrap">{dateFr(job.supprime_le)}</td>
              <td className="px-5 py-4 text-[#374151]">{noms[job.supprime_par] || job.supprime_par}</td>
              <td className="px-5 py-4"><BoutonRestaurer job={job} onRestaurer={onRestaurer} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
