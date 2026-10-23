import { CANAUX, DECISIONS, formatDateHeure } from '../../../supabase/functions/_shared/adjoint.js'
import { IconeCanal, Pastille, Vide } from './ui'

const TON_DECISION = { succes: 'succes', danger: 'danger', info: 'info', neutre: 'neutre' }

// Une ligne de la file (à traiter) ou d'une liste (déjà traité)
export function LigneDossier({ d, actif, onClick, lisere = true, coche = false }) {
  const traite = d.decision !== 'pending'
  const dec = DECISIONS[d.decisionAffichee]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif ? 'true' : undefined}
      className={`w-full text-left border-0 border-b border-[#f1f2f5] ${lisere ? 'border-l-[3px]' : ''} px-3.5 py-3 flex gap-3 items-start cursor-pointer ${
        actif ? 'bg-[#f3fbfa] border-l-[#00bbb1]' : `${coche ? 'bg-[#f7fafa]' : 'bg-white'} border-l-transparent hover:bg-[#fafbfc]`
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

// coches : ids cochés (Set) ; les courriels pas encore traités par Léo ne se cochent pas
export default function File({ dossiers, selection, onChoisir, coches = new Set(), onCocher, onDeciderSelection }) {
  if (!dossiers.length) return <Vide>Rien à approuver ici.</Vide>
  const cochables = dossiers.filter(d => !d.inbox).map(d => d.id)
  const nb = cochables.filter(id => coches.has(id)).length
  const tout = nb > 0 && nb === cochables.length
  const basculer = (id) => onCocher?.(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <div>
      {onCocher && cochables.length > 0 && (
        <div className="sticky top-0 z-10 bg-white border-b border-[#e6e8ec] px-3.5 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-2 text-[12px] font-semibold text-[#5b616e] cursor-pointer">
            <input
              type="checkbox"
              checked={tout}
              ref={el => { if (el) el.indeterminate = nb > 0 && !tout }}
              onChange={() => onCocher(tout ? new Set() : new Set(cochables))}
              className="w-4 h-4 accent-[#00857e]"
            />
            {nb ? `${nb} sélectionné${nb > 1 ? 's' : ''}` : 'Tout sélectionner'}
          </label>
          {nb > 0 && (
            <span className="flex gap-1.5 ml-auto">
              <button type="button" onClick={() => onDeciderSelection('rejeter')} className="text-[12px] font-bold px-2.5 py-1 rounded-md bg-[#fef3f2] text-[#b42318] hover:bg-[#fee4e2]">Rejeter la sélection</button>
              <button type="button" onClick={() => onDeciderSelection('deja_traite')} className="text-[12px] font-bold px-2.5 py-1 rounded-md bg-[#f2f4f7] text-[#3d434f] hover:bg-[#e6e8ec]">Déjà traité (sélection)</button>
            </span>
          )}
        </div>
      )}
      <div role="list" aria-label="Dossiers à traiter">
        {dossiers.map(d => (
          <div role="listitem" key={d.id} className={`flex items-stretch ${!onCocher ? '' : d.id === selection ? 'border-l-[3px] bg-[#f3fbfa] border-l-[#00bbb1]' : `border-l-[3px] border-l-transparent ${coches.has(d.id) ? 'bg-[#f7fafa]' : 'bg-white'}`}`}>
            {onCocher && (
              <label className="flex items-start pt-3.5 pl-2.5 pr-0.5 border-b border-[#f1f2f5] cursor-pointer">
                {!d.inbox && (
                  <input type="checkbox" checked={coches.has(d.id)} onChange={() => basculer(d.id)} aria-label={`Sélectionner ${d.nom}`} className="w-4 h-4 accent-[#00857e]" />
                )}
                {d.inbox && <span className="w-4" aria-hidden="true" />}
              </label>
            )}
            <div className="flex-1 min-w-0">
              <LigneDossier d={d} actif={d.id === selection} coche={coches.has(d.id)} lisere={!onCocher} onClick={() => onChoisir(d.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const libelleCanal = (canal) => CANAUX[canal]?.label ?? canal
