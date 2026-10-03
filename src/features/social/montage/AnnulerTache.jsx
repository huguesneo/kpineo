import { useState } from 'react'
import Button from '../../../components/shared/Button'
import {
  etatAnnulation, confirmationAnnulation, texteAnnulationEnCours, annulationDemandee,
  messageResultatAnnulation, messageErreurAnnulation,
} from '../../../lib/montageAnnulation'

// Bouton « Annuler » d'une tâche qui attend ou tourne. En attente : un clic
// suffit (la base l'annule tout de suite). En cours : confirmation sur place,
// puis « Annulation en cours… » jusqu'à ce que l'agent s'arrête.
// onAnnuler(tache) renvoie la réponse de video_annuler_tache ;
// ouvertInitial sert aux tests (rendu côté serveur, sans clic).
export default function AnnulerTache({ tache, job = null, email, enLigne = true, onAnnuler, ouvertInitial = false }) {
  const [ouvert, setOuvert] = useState(ouvertInitial)
  const [envoi, setEnvoi] = useState({ enCours: false, message: null, erreur: null })
  const etat = etatAnnulation(tache, { email })
  if (!etat.visible || !onAnnuler) return null

  if (annulationDemandee(tache)) {
    return <p className="text-xs text-[#6b7280] mt-2" role="status" data-annulation="en-cours">{texteAnnulationEnCours(tache, { enLigne })}</p>
  }

  async function annuler() {
    setEnvoi({ enCours: true, message: null, erreur: null })
    try {
      const code = await onAnnuler(tache)
      setOuvert(false)
      setEnvoi({ enCours: false, message: messageResultatAnnulation(code), erreur: null })
    } catch (err) {
      setEnvoi({ enCours: false, message: null, erreur: messageErreurAnnulation(err) })
    }
  }

  const retour = (
    <>
      {envoi.message && <p className="text-xs text-[#6b7280] mt-1" role="status">{envoi.message}</p>}
      {envoi.erreur && <p className="text-xs text-red-600 mt-1">{envoi.erreur}</p>}
    </>
  )

  if (ouvert && etat.confirmer) {
    const c = confirmationAnnulation(tache, job)
    return (
      <div role="alertdialog" aria-label={c.titre} className="mt-2 rounded-lg border border-red-200 bg-white p-3 text-sm text-left">
        <p className="font-semibold text-[#1a1a1a]">{c.titre}</p>
        <p className="text-[#374151] mt-1">{c.texte}</p>
        {retour}
        <div className="flex flex-wrap justify-end gap-2 mt-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)} disabled={envoi.enCours}>Continuer</Button>
          <Button type="button" variant="danger" size="sm" onClick={annuler} loading={envoi.enCours}>{c.libelleConfirmer}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (etat.confirmer ? setOuvert(true) : annuler())}
        disabled={envoi.enCours}
        className="text-xs font-semibold text-red-600 hover:underline disabled:text-[#9ca3af] disabled:no-underline"
      >
        {envoi.enCours ? 'Annulation…' : 'Annuler'}
      </button>
      {retour}
    </div>
  )
}
