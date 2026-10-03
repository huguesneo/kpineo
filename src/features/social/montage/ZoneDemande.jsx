import { useState } from 'react'
import Button from '../../../components/shared/Button'
import { validerDemande, messageErreurEnvoi, LONGUEUR_MAX_DEMANDE } from '../../../lib/montageEditeur'

// Champ « Qu'est-ce que tu veux changer ? » et bouton Envoyer. Désactivés tant
// qu'une tâche du montage attend ou tourne (etat vient de etatEnvoi).
export default function ZoneDemande({ etat, enLigne, onEnvoyer }) {
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState({ enCours: false, erreur: null })
  const [tentative, setTentative] = useState(false)

  const erreurTexte = validerDemande(texte, etat.videPermis)
  const desactive = etat.desactive || envoi.enCours
  const relance = etat.videPermis && !texte.trim()

  async function envoyer(e) {
    e?.preventDefault()
    setTentative(true)
    if (desactive || erreurTexte) return
    setEnvoi({ enCours: true, erreur: null })
    try {
      await onEnvoyer(texte)
      setTexte('')
      setTentative(false)
      setEnvoi({ enCours: false, erreur: null })
    } catch (err) {
      setEnvoi({ enCours: false, erreur: messageErreurEnvoi(err) })
    }
  }

  function touche(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) envoyer(e)
  }

  return (
    <form onSubmit={envoyer} className="space-y-2">
      {etat.raison && <p className="text-xs text-[#6b7280]" role="status">{etat.raison}</p>}
      {!enLigne && !etat.desactive && (
        <p className="text-xs text-amber-700">Le Mac de montage est hors ligne, ta demande sera traitée à son retour.</p>
      )}
      <label htmlFor="demande-montage" className="sr-only">Qu'est-ce que tu veux changer ?</label>
      <textarea
        id="demande-montage"
        value={texte}
        onChange={e => setTexte(e.target.value)}
        onKeyDown={touche}
        disabled={desactive}
        rows={3}
        maxLength={LONGUEUR_MAX_DEMANDE + 100}
        placeholder="Qu'est-ce que tu veux changer ?"
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#00bbb1] disabled:bg-gray-50 disabled:text-[#9ca3af] resize-none"
      />
      {tentative && erreurTexte && !etat.desactive && <p className="text-xs text-red-600">{erreurTexte}</p>}
      {envoi.erreur && <p className="text-xs text-red-600">{envoi.erreur}</p>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[#9ca3af] hidden sm:inline">Ctrl + Entrée pour envoyer</span>
        <Button type="submit" disabled={desactive || (!texte.trim() && !etat.videPermis)} loading={envoi.enCours} className="ml-auto">
          {relance ? 'Relancer le montage' : 'Envoyer'}
        </Button>
      </div>
    </form>
  )
}
