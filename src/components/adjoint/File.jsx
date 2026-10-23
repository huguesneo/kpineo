import { CANAUX, DECISIONS, formatDateHeure } from '../../../supabase/functions/_shared/adjoint.js'
import { IconeCanal, Pastille, Vide } from './ui'

const TON_DECISION = { succes: 'succes', danger: 'danger', info: 'info', neutre: 'neutre' }

// Une ligne de la file (à traiter) ou d'une liste (déjà traité)
export function LigneDossier({ d, actif, onClick }) {
  const traite = d.decision !== 'pending'
  const dec = DECISIONS[d.decisionAffichee]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif ? 'true' : undefined}
      className={`w-full text-left border-0 border-b border-[#f1f2f5] border-l-[3px] px-3.5 py-3 flex gap-3 items-start cursor-pointer ${
        actif ? 'bg-[#f3fbfa] border-l-[#00bbb1]' : 'bg-white border-l-transparent hover:bg-[#fafbfc]'
      }`}
    >
      <IconeCanal canal={d.channel} />
      <span className="flex-1 min-w-0 flex flex-col gap-[3px]">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold flex-1 truncate text-[#16181d]">{d.nom}</span>
          {traite
            ? <span className="text-xs font-semibold text-[#5b616e] whitespace-nowrap">{formatDateHeure(d.decideur?.le || d.created_at)}</span>
            : <span className={`text-xs font-bold whitespace-nowrap ${d.retard ? 'text-[#b42318]' : 'text-[#5b616e]'}`}>{d.attente}</span>}
        </span>
        <span className="text-[13px] text-[#3d434f] truncate">{d.sujet}</span>
        <span className="flex gap-1.5 flex-wrap mt-0.5">
          {traite
            ? <>
                <Pastille ton={TON_DECISION[dec?.ton] ?? 'neutre'}>{dec?.label ?? d.decision}</Pastille>
                {d.decideur?.par && <span className="text-[11px] text-[#5b616e] self-center">par {d.decideur.par}</span>}
              </>
            : <>
                <Pastille>{d.badgeAction}</Pastille>
                {d.etiquettes.map(e => <Pastille key={e.label} ton={e.ton}>{e.label}</Pastille>)}
              </>}
        </span>
      </span>
    </button>
  )
}

export default function File({ dossiers, selection, onChoisir }) {
  if (!dossiers.length) return <Vide>Rien à approuver ici.</Vide>
  return (
    <div role="list" aria-label="Dossiers à traiter">
      {dossiers.map(d => (
        <div role="listitem" key={d.id}>
          <LigneDossier d={d} actif={d.id === selection} onClick={() => onChoisir(d.id)} />
        </div>
      ))}
    </div>
  )
}

export const libelleCanal = (canal) => CANAUX[canal]?.label ?? canal
