import { useEffect, useState } from 'react'
import { CANAUX, DECISIONS, formatDateHeure, htmlVersTexte } from '../../../supabase/functions/_shared/adjoint.js'
import { appelAdjoint } from '../../lib/adjoint/api'
import { EnteteFiche } from './FichePersonne'
import { Carte, Chargement, Erreur, Icone, IconeCanal, Pastille, Vide } from './ui'

const TON_DECISION = { succes: 'succes', danger: 'danger', info: 'info', neutre: 'neutre' }

// Page Personne : la fiche complète et tous ses dossiers, du plus récent au plus ancien
export default function PagePersonne({ cible, onRetour, onOuvrirDossier }) {
  const [etat, setEtat] = useState({ chargement: true, erreur: null, fiche: null, dossiers: [] })
  const [essai, setEssai] = useState(0)

  useEffect(() => {
    let actif = true
    setEtat(e => ({ ...e, chargement: true, erreur: null }))
    appelAdjoint('personne', cible)
      .then(r => actif && setEtat({ chargement: false, erreur: null, ...r }))
      .catch(err => actif && setEtat({ chargement: false, erreur: err.message, fiche: null, dossiers: [] }))
    return () => { actif = false }
  }, [cible.email, cible.client_id, essai]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onRetour} className="self-start inline-flex items-center gap-2 text-[13px] font-bold text-[#00857e] hover:text-[#00665f]">
        <Icone nom="retour" taille={16} />Retour
      </button>
      {etat.chargement && <Chargement />}
      {etat.erreur && <Erreur onReessayer={() => setEssai(n => n + 1)}>{etat.erreur}</Erreur>}
      {!etat.chargement && !etat.erreur && (
        <div className="flex flex-wrap gap-4 items-start">
          <Carte className="flex-[1_1_280px] max-w-full lg:max-w-[320px] p-5">
            <EnteteFiche fiche={etat.fiche} nomSecours={etat.dossiers[0]?.resume?.nom} />
          </Carte>
          <div className="flex-[999_1_480px] min-w-0 flex flex-col gap-3">
            <p className="m-0 text-xs font-extrabold tracking-wider uppercase text-[#5b616e]">
              {etat.dossiers.length} dossier{etat.dossiers.length > 1 ? 's' : ''}, tous canaux
            </p>
            {etat.dossiers.length === 0 && <Carte><Vide>Aucun dossier de Léo pour cette personne.</Vide></Carte>}
            {etat.dossiers.map(d => {
              const dec = DECISIONS[d.resume.decisionAffichee]
              const envoye = d.final_reply || (d.payload?.html ? htmlVersTexte(d.payload.html) : '')
              return (
                <Carte key={d.id} className="p-5 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <IconeCanal canal={d.channel} />
                    <div className="flex-1 min-w-0">
                      <p className="m-0 text-xs text-[#5b616e]">{CANAUX[d.channel]?.label} · {formatDateHeure(d.created_at)}{d.category ? ` · ${d.category}` : ''}</p>
                      <button type="button" onClick={() => onOuvrirDossier(d.id)} className="text-left text-[15px] font-extrabold hover:text-[#00857e]">{d.resume.sujet}</button>
                    </div>
                    <Pastille ton={TON_DECISION[dec?.ton]}>{dec?.label}</Pastille>
                  </div>
                  {d.incoming_message && (
                    <div className="bg-[#f7f8fa] rounded-[10px] px-4 py-3 text-[13px] leading-relaxed whitespace-pre-line break-words max-h-48 overflow-y-auto">{d.incoming_message}</div>
                  )}
                  {envoye && (
                    <div className="border-l-[3px] border-[#00bbb1] pl-3 text-[13px] leading-relaxed whitespace-pre-line break-words text-[#2b2f38]">
                      <p className="m-0 mb-1 text-xs font-bold text-[#00665f]">{d.decision === 'pending' ? 'Proposé par Léo' : 'Réponse'}</p>
                      {envoye}
                    </div>
                  )}
                  {d.resume.decideur?.par && d.decision !== 'pending' && (
                    <p className="m-0 text-xs text-[#5b616e]">Décidé par {d.resume.decideur.par}{d.resume.decideur.le ? `, ${formatDateHeure(d.resume.decideur.le)}` : ''}</p>
                  )}
                </Carte>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
