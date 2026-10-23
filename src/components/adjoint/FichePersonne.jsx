import { CANAUX, DECISIONS, formatDate, formatDateHeure } from '../../../supabase/functions/_shared/adjoint.js'
import { Champ, Pastille } from './ui'

const TON_STATUT = { client_actif: 'succes', prospect: 'info', ancien_client: 'neutre' }

export function EnteteFiche({ fiche, nomSecours }) {
  const nom = fiche?.nom || nomSecours || fiche?.courriel || 'Inconnu'
  const rdv = fiche?.prochainRdv
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <span className="w-[42px] h-[42px] rounded-full bg-[#e3f6f4] text-[#00665f] flex items-center justify-center font-extrabold text-base flex-shrink-0">
          {nom.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[15px] font-extrabold truncate">{nom}</p>
          <Pastille ton={TON_STATUT[fiche?.statut] ?? 'info'} className="mt-1 text-xs">{fiche?.statutLabel ?? 'Prospect'}</Pastille>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Champ label="Naturopathe" valeur={fiche?.naturopathe} />
        <Champ label="Programme" valeur={fiche?.programme} />
        <Champ label="Prochain rendez-vous" valeur={rdv ? `${formatDateHeure(rdv.start_time)}${rdv.title ? ` · ${rdv.title}` : ''}` : null} />
        <Champ label="Avec NEO depuis" valeur={fiche?.clientDepuis ? formatDate(fiche.clientDepuis) : null} />
        <Champ label="Courriel" valeur={fiche?.courriel} />
        <Champ label="Téléphone" valeur={fiche?.telephone} />
      </div>
    </div>
  )
}

// Ligne du temps : tous les dossiers de la personne, tous canaux, cliquables
export function LigneDuTemps({ dossiers, actif, onOuvrir }) {
  if (!dossiers?.length) return <p className="m-0 text-[13px] text-[#5b616e]">Aucun autre échange.</p>
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-1">
      {dossiers.map(t => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onOuvrir(t.id)}
            className={`w-full text-left flex gap-2.5 rounded-lg px-2 py-1.5 ${t.id === actif ? 'bg-[#f3fbfa]' : 'hover:bg-[#f7f8fa]'}`}
          >
            <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${t.decision === 'pending' ? 'bg-[#f79009]' : 'bg-[#00bbb1]'}`} />
            <span className="min-w-0">
              <span className="block text-xs text-[#5b616e]">
                {CANAUX[t.channel]?.label ?? t.channel} · {formatDate(t.created_at)} · {DECISIONS[t.decisionAffichee]?.label}
              </span>
              <span className="block mt-0.5 text-[13px] text-[#2b2f38] leading-snug">{t.sujet}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

export default function FichePersonne({ fiche, nomSecours, ligneDuTemps, actif, onOuvrir, onOuvrirPersonne }) {
  return (
    <>
      <div className="px-5 pt-5 pb-4 border-b border-[#eef0f3] flex flex-col gap-3">
        <EnteteFiche fiche={fiche} nomSecours={nomSecours} />
        {onOuvrirPersonne && (fiche?.courriel || fiche?.clientId) && (
          <button type="button" onClick={onOuvrirPersonne} className="self-start text-[13px] font-bold text-[#00857e] hover:text-[#00665f]">
            Ouvrir le dossier complet
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="m-0 mb-2 px-1 text-xs font-extrabold tracking-wider uppercase text-[#5b616e]">Tous les échanges</p>
        <LigneDuTemps dossiers={ligneDuTemps} actif={actif} onOuvrir={onOuvrir} />
      </div>
    </>
  )
}
