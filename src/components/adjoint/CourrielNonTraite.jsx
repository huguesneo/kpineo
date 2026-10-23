import { useState } from 'react'
import { formatDateHeure } from '../../../supabase/functions/_shared/adjoint.js'
import { BADGE_NON_TRAITE, BADGE_NOUVELLE_REPONSE, estLigneCommande } from '../../../supabase/functions/_shared/gmailSync.js'
import { appelAdjoint } from '../../lib/adjoint/api'
import { FilDepuisHistorique } from './Historique'
import { Bouton, Pastille } from './ui'

// Courriel arrivé dans info@ que Léo n'a pas encore traité. Chaque bouton crée d'abord
// la ligne du dossier (op creerDepuisCourriel), puis ouvre le dossier dans le bon mode :
// le reste (Make, classement Gmail, 6 secondes pour annuler) est le chemin habituel.
// suiteDe : nouvelle réponse dans un fil déjà traité ; le nouveau dossier y est lié, l'ancien
// n'est jamais rouvert.
export default function CourrielNonTraite({ m, onOuvrirDossier, suiteDe = null }) {
  const [etat, setEtat] = useState({ enCours: null, erreur: null })
  async function agir(mode) {
    setEtat({ enCours: mode, erreur: null })
    try {
      const r = await appelAdjoint('creerDepuisCourriel', { gmail_message_id: m.gmail_message_id })
      onOuvrirDossier(r.id, mode)
    } catch (e) {
      setEtat({ enCours: null, erreur: e.message })
    }
  }
  const occupe = !!etat.enCours
  const commande = estLigneCommande(m)
  return (
    <>
      <div className="flex-1 overflow-y-auto px-7 py-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-xs font-semibold text-[#5b616e]">{commande ? 'Commande' : 'Courriel'} · reçu {formatDateHeure(m.recu_le)} · {m.expediteur_nom ? `${m.expediteur_nom} <${m.expediteur}>` : m.expediteur}</p>
          <h2 className="m-0 text-xl font-extrabold break-words">{m.sujet}</h2>
          {commande && m.extrait && <p className="m-0 text-sm font-semibold text-[#2b2f38]">{m.extrait}</p>}
          <div className="flex flex-wrap gap-1.5 items-center">
            <Pastille ton="info">{suiteDe ? BADGE_NOUVELLE_REPONSE : BADGE_NON_TRAITE}</Pastille>
            {suiteDe && (
              <button type="button" onClick={() => onOuvrirDossier(suiteDe)} className="text-xs font-bold text-[#00857e] hover:underline">
                Voir le dossier précédent (fermé)
              </button>
            )}
          </div>
        </div>
        <FilDepuisHistorique threadId={m.gmail_thread_id} />
      </div>
      {commande ? (
        <div className="px-7 py-4 border-t border-[#eef0f3] flex flex-col gap-3">
          {etat.erreur && <p className="m-0 text-sm text-[#b42318]">{etat.erreur}</p>}
          <div className="flex flex-wrap gap-2.5 items-center">
            <Bouton variante="danger" disabled={occupe} onClick={() => agir('rejeter')}>Rejeter</Bouton>
            <Bouton variante="discret" disabled={occupe} onClick={() => agir('deja_traite')}>Déjà traité à la main</Bouton>
          </div>
          <p className="m-0 text-xs text-[#5b616e]">Avis de commande WooCommerce. « Créer le reçu » viendra quand Léo aura préparé les lignes QuickBooks. Rejeter ou Déjà traité crée le dossier de la commande et le ferme (6 secondes pour annuler).</p>
        </div>
      ) : (
        <div className="px-7 py-4 border-t border-[#eef0f3] flex flex-col gap-3">
          {etat.erreur && <p className="m-0 text-sm text-[#b42318]">{etat.erreur}</p>}
          <div className="flex flex-wrap gap-2.5 items-center">
            <Bouton variante="principal" disabled={occupe} onClick={() => agir('ecrire')}>{etat.enCours === 'ecrire' ? 'Ouverture…' : 'Écrire une réponse'}</Bouton>
            <Bouton disabled={occupe} onClick={() => agir('rediger')}>Demander à Léo de rédiger</Bouton>
            <Bouton variante="danger" disabled={occupe} onClick={() => agir('rejeter')}>Rejeter</Bouton>
            <Bouton variante="discret" disabled={occupe} onClick={() => agir('deja_traite')}>Déjà traité à la main</Bouton>
          </div>
          <p className="m-0 text-xs text-[#5b616e]">{suiteDe ? 'Nouvelle réponse dans un fil déjà traité : chaque bouton crée un nouveau dossier, lié au précédent, puis suit le chemin habituel.' : 'Chaque bouton crée le dossier de ce courriel, puis suit le chemin habituel. Léo verra qu’il est déjà traité.'}</p>
        </div>
      )}
    </>
  )
}
