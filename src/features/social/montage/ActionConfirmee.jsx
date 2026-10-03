import { useState } from 'react'
import Button from '../../../components/shared/Button'
import { messageErreurEnvoi } from '../../../lib/montageEditeur'

// Bouton qui ouvre une confirmation sur place (ce que fait l'action, Annuler
// ou Confirmer) avant de créer la tâche. etat = { desactive, raison } ;
// ouvertInitial sert aux tests (rendu côté serveur, sans clic).
export default function ActionConfirmee({
  libelle, titre, texte, libelleConfirmer, etat, onConfirmer, variante = 'secondary', ouvertInitial = false,
}) {
  const [ouvert, setOuvert] = useState(ouvertInitial)
  const [envoi, setEnvoi] = useState({ enCours: false, erreur: null })
  const desactive = etat.desactive || envoi.enCours

  async function confirmer() {
    if (desactive) return
    setEnvoi({ enCours: true, erreur: null })
    try {
      await onConfirmer()
      setOuvert(false)
      setEnvoi({ enCours: false, erreur: null })
    } catch (err) {
      setEnvoi({ enCours: false, erreur: messageErreurEnvoi(err) })
    }
  }

  if (ouvert && !etat.desactive) {
    return (
      <div role="alertdialog" aria-label={titre} className="rounded-lg border border-[#00bbb1]/40 bg-[#00bbb1]/5 p-3 text-sm">
        <p className="font-semibold text-[#1a1a1a]">{titre}</p>
        <p className="text-[#374151] mt-1">{texte}</p>
        {envoi.erreur && <p className="text-xs text-red-600 mt-2">{envoi.erreur}</p>}
        <div className="flex flex-wrap justify-end gap-2 mt-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)} disabled={envoi.enCours}>Annuler</Button>
          <Button type="button" size="sm" onClick={confirmer} loading={envoi.enCours}>{libelleConfirmer}</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <Button type="button" variant={variante} size="sm" onClick={() => setOuvert(true)} disabled={desactive}>{libelle}</Button>
      {etat.desactive && etat.raison && <p className="text-xs text-[#6b7280]" role="status">{etat.raison}</p>}
    </div>
  )
}
