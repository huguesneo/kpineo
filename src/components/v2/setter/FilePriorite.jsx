import { useState } from 'react'
import { styleSource, fmtRdvAvecHeure } from '../../../lib/v2/format'
import { fmtTentative, fmtDuree, fmtDureeAppel, prenom, tentativesAffichees, GROUPE_CONTACT, GROUPE_RAPPEL_PREVU } from '../../../lib/v2/settingV2'
import { verrouAutre } from '../../../hooks/v2/useLeadLocks'
import BoutonResultat from './BoutonResultat'
import { Tentatives } from './FileLeads'

const LIMITE = { desktop: 15, mobile: 5 }
const COLONNES = 'xl:grid-cols-[minmax(0,1.3fr)_104px_minmax(0,1.6fr)_minmax(0,0.9fr)_220px]'
// Avec la colonne Opt-in (liste Nouveaux leads)
const COLONNES_OPTIN = 'xl:grid-cols-[minmax(0,1.3fr)_104px_128px_minmax(0,1.4fr)_minmax(0,0.9fr)_220px]'

const GROUPES = {
  1: { libelle: 'Rappel dû', couleur: '#b91c1c', bg: '#fef2f2' },
  [GROUPE_CONTACT]: { libelle: '💬 Contact établi', couleur: '#0369a1', bg: '#f0f9ff' },
  [GROUPE_RAPPEL_PREVU]: { libelle: 'Rappel prévu', couleur: '#6d28d9', bg: '#f5f3ff' },
  2: { libelle: 'Nouveau', couleur: '#4f46e5', bg: 'rgba(99,102,241,0.08)' },
  3: { libelle: 'Prêt à rappeler', couleur: '#047857', bg: '#ecfdf5' },
  4: { libelle: 'En attente', couleur: '#6b7280', bg: '#f3f4f6' },
}

// Pas de pastille « Nouveau » : la liste Nouveaux leads le dit déjà
function Pastille({ groupe }) {
  if (groupe === 2) return null
  const g = GROUPES[groupe]
  return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ background: g.bg, color: g.couleur }}>{g.libelle}</span>
}

function Source({ source }) {
  if (!source) return <span className="text-xs text-[#9ca3af]">—</span>
  const s = styleSource(source)
  return <span title={source} className="inline-block max-w-full truncate px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: s.bg, color: s.color }}>{source}</span>
}

function statut(lead, now) {
  if (lead.groupe === 1) return { texte: `Rappel ${fmtRdvAvecHeure(lead.rappel.rappel_le, now)}${lead.rappel.note ? ` · ${lead.rappel.note}` : ''}`, couleur: '#b91c1c' }
  if (lead.groupe === GROUPE_CONTACT) {
    const c = lead.conversation
    const detail = c
      ? `Conversation ${fmtRdvAvecHeure(c.date, now)} · ${fmtDureeAppel(c.duree)}${c.par ? ` · ${prenom(c.par)}` : ''}`
      : 'Contact établi'
    return { texte: `${detail} : rappel ou résultat à mettre`, couleur: '#0369a1' }
  }
  if (lead.groupe === 4) return { texte: `Rappelable dans ${fmtDuree(lead.rappelableLe - now)}`, couleur: '#9ca3af' }
  if (lead.rappel) return { texte: `Rappel prévu ${fmtRdvAvecHeure(lead.rappel.rappel_le, now)}`, couleur: '#6d28d9' }
  return { texte: lead.chaud ? '🔥 Chaud à relancer' : '', couleur: '#c2410c' }
}

// Liste « Leads à rappeler » (Setting v2) : tri automatique en 4 groupes
// (rappels dus, nouveaux, prêts, en attente grisés avec le temps restant).
// leads : sortie de prioriserLeads.
export default function FilePriorite({
  titre, sousTitre, couleur, leads, now, userId, locks, nomsParId, montrerProprio = false,
  onOuvrir, onRdv, onResultat, onFicheGhl, videTexte, colonneOptin = false, tour,
}) {
  const colonnes = colonneOptin ? COLONNES_OPTIN : COLONNES
  // Date d'opt-in : création de la carte GHL (arrivée du lead)
  const optin = l => (l.creeLe ? fmtRdvAvecHeure(l.creeLe, now) : '—')
  const [toutVoir, setToutVoir] = useState(false)
  const actifs = leads.filter(l => l.groupe !== 4).length
  const limD = toutVoir ? Infinity : LIMITE.desktop
  const limM = toutVoir ? Infinity : LIMITE.mobile

  return (
    <section data-tour={tour} className="bg-[#fcfcfd] border border-[#e5e7eb] rounded-xl shadow-sm" aria-label={titre}>
      <div className="flex items-center gap-2.5 px-4 py-3.5 flex-wrap border-b border-[#f0f0f0]">
        <span className="w-2 h-2 rounded-full" style={{ background: couleur }} />
        <h2 className="text-[15px] font-bold text-[#1a1a1a]">{titre}</h2>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={actifs ? { background: '#f5f3ff', color: '#6d28d9' } : { background: '#f3f4f6', color: '#6b7280' }}>{actifs}</span>
        {leads.length > actifs && <span className="text-xs text-[#9ca3af]">+ {leads.length - actifs} en attente</span>}
        <span className="text-xs text-[#6b7280] hidden sm:inline">{sousTitre}</span>
      </div>

      {leads.length === 0 ? (
        <p className="py-7 px-4 text-center text-[13px] text-[#6b7280]">{videTexte}</p>
      ) : (
        <>
          <div className={`hidden xl:grid ${colonnes} gap-2.5 px-3.5 py-2 text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide`}>
            <span>Lead</span><span>Source</span>{colonneOptin && <span>Opt-in</span>}<span>Tentatives</span><span>Statut</span><span className="text-right">Actions</span>
          </div>
          {leads.map((lead, i) => {
            const s = statut(lead, now)
            const grise = lead.groupe === 4
            const pris = verrouAutre(locks, lead.contactId, userId, now)
            const nom = (
              <button onClick={() => onOuvrir(lead)} title={`Ouvrir la fiche de ${lead.nom}`} data-tour={i === 0 && tour ? `${tour}-nom` : undefined}
                className="text-left text-sm font-semibold truncate hover:underline underline-offset-2" style={{ color: grise ? '#9ca3af' : '#1a1a1a' }}>
                {lead.chaud && '🔥 '}{lead.nom}
              </button>
            )
            const proprio = montrerProprio && lead.proprietaire ? <span className="text-[11px] text-[#6d28d9] font-semibold">· {prenom(nomsParId[lead.proprietaire])}</span> : null
            const actions = mobile => (
              <div className={`flex items-center gap-1.5 ${mobile ? '' : 'justify-end'}`}>
                {pris && <span className="text-[11px] font-semibold text-[#4f46e5] whitespace-nowrap">Pris par {pris.prenom}</span>}
                <div className={mobile ? 'flex-1 flex' : 'flex'} data-tour={i === 0 && tour ? `${tour}-resultat` : undefined}>
                  <BoutonResultat lead={lead} onRdv={onRdv} onTermine={onResultat} mobile={mobile} />
                </div>
                <button onClick={() => onFicheGhl(lead)} title="Fiche GHL (nouvel onglet)"
                  className={mobile ? 'h-11 px-3 rounded-lg border border-[#e5e7eb] text-xs font-semibold text-[#6b7280]' : 'text-[13px] font-semibold text-[#6b7280] px-2 py-1.5 rounded-lg hover:bg-[#f3f4f6] whitespace-nowrap'}>
                  GHL ↗
                </button>
              </div>
            )
            return (
              <div key={lead.key} className={i >= limD ? 'hidden' : i >= limM ? 'hidden xl:block' : ''}>
                <div className={`hidden xl:grid ${colonnes} gap-2.5 items-center px-3.5 py-2 border-t border-[#f3f4f6] ${grise ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-1.5 min-w-0"><Pastille groupe={lead.groupe} />{nom}{proprio}</div>
                  <div className="min-w-0"><Source source={lead.source} /></div>
                  {colonneOptin && <span className="text-[13px] text-[#4b5563] whitespace-nowrap truncate" title={lead.creeLe ?? ''}>{optin(lead)}</span>}
                  <div className="flex items-center gap-2 min-w-0" data-tour={i === 0 && tour ? `${tour}-tentatives` : undefined}>
                    <Tentatives faites={tentativesAffichees(lead)} />
                    {lead.derniere && <span className="text-[12px] text-[#6b7280] truncate" title={fmtTentative(lead, now)}>{fmtTentative(lead, now).split(' · ').slice(1).join(' · ')}</span>}
                  </div>
                  <span className="text-[13px] font-semibold truncate" style={{ color: s.couleur }} title={s.texte}>{s.texte}</span>
                  {actions(false)}
                </div>
                <div className={`xl:hidden px-3.5 py-3 border-t border-[#f3f4f6] flex flex-col gap-2 ${grise ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-1.5 min-w-0"><Pastille groupe={lead.groupe} />{nom}{proprio}</div>
                  <div className="flex items-center gap-2 text-xs text-[#6b7280] flex-wrap">
                    {colonneOptin && <span>Opt-in {optin(lead)}</span>}
                    <Tentatives faites={tentativesAffichees(lead)} />
                    {lead.derniere && <span>{fmtTentative(lead, now).split(' · ').slice(1).join(' · ')}</span>}
                    {s.texte && <span style={{ color: s.couleur }}>{s.texte}</span>}
                  </div>
                  {actions(true)}
                </div>
              </div>
            )
          })}
          {!toutVoir && leads.length > LIMITE.mobile && (
            <button onClick={() => setToutVoir(true)}
              className={`w-full px-3.5 py-3 border-t border-[#f3f4f6] text-[13px] font-semibold text-[#00bbb1] hover:bg-[#f9fafb] ${leads.length > LIMITE.desktop ? '' : 'xl:hidden'}`}>
              Voir tout ({leads.length})
            </button>
          )}
        </>
      )}
    </section>
  )
}
