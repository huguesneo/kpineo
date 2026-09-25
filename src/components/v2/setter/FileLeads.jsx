import { useState } from 'react'
import { fmtAge, styleSource } from '../../../lib/v2/format'
import { verrouAutre } from '../../../hooks/v2/useLeadLocks'

const COLONNES = 'xl:grid-cols-[184px_96px_52px_78px_140px_80px_minmax(0,1fr)_286px]'
const LIMITE = { desktop: 10, mobile: 3 }

const IconeExterne = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
  </svg>
)

// Tentatives faites (0 à 4) : pastilles + « n/4 ». null hors pipeline de tentatives.
function tentativesFaites(lead, etat) {
  if (lead.tentative == null) return null
  const faites = Math.min(4, Math.max(0, lead.tentative - 1) + (etat === 'nr-attente' || etat === 'nr' ? 1 : 0))
  return faites
}

function Tentatives({ faites }) {
  if (faites == null) return <span className="text-xs text-[#9ca3af]">—</span>
  return (
    <div className="flex items-center gap-[3px]" aria-label={`${faites} tentatives sur 4`}>
      {[0, 1, 2, 3].map(i => (
        <span key={i} className="w-2.5 h-1.5 rounded-sm"
          style={{ background: i < faites ? (faites >= 4 ? '#ef4444' : '#6366f1') : '#e5e7eb' }} />
      ))}
      <span className="text-[11px] font-bold text-[#6b7280] ml-1">{faites}/4</span>
    </div>
  )
}

function PastilleSource({ source }) {
  if (!source) return <span className="text-xs text-[#9ca3af]">—</span>
  const s = styleSource(source)
  return (
    <span title={source} className="inline-block max-w-full truncate px-2 py-0.5 rounded-full text-[11px] font-semibold align-middle"
      style={{ background: s.bg, color: s.color }}>
      {source}
    </span>
  )
}

// Zone d'actions selon l'état de la ligne
function Actions({ lead, etat, erreur, pris, note, actions, mobile = false }) {
  const h = mobile ? 'h-11' : 'py-1.5'
  const fiche = (
    <button
      onClick={() => actions.ouvrirFiche(lead)}
      title="Fiche GHL"
      className={mobile
        ? 'h-11 flex items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#6b7280]'
        : 'inline-flex items-center gap-1 text-[13px] font-semibold text-[#6b7280] px-2 py-1.5 rounded-lg whitespace-nowrap hover:bg-[#f3f4f6] hover:text-[#1a1a1a]'}
    >
      {!mobile && 'Fiche GHL'}{IconeExterne}
    </button>
  )
  const annuler = (
    <button onClick={() => actions.annuler(lead)} className={`text-xs font-semibold text-[#6b7280] px-1 ${mobile ? 'min-h-[44px]' : 'py-1'}`}>
      Annuler
    </button>
  )
  const pastille = (texte, cls) => (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>{texte}</span>
  )

  if (pris) {
    return (
      <div className={`flex items-center ${mobile ? '' : 'justify-end'} gap-1.5`}>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4f46e5] bg-[#6366f1]/10 px-2.5 py-1 rounded-full whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1]" />Pris par {pris.prenom} depuis {pris.minutes} min
        </span>
        {!mobile && fiche}
      </div>
    )
  }

  if (etat) {
    const contenu = {
      'nr-attente': <>{pastille('Tentative notée, envoi à GHL…', 'text-[#4b5563] bg-[#f3f4f6]')}{annuler}</>,
      nr: pastille('Tentative envoyée à GHL', 'text-[#4b5563] bg-[#f3f4f6]'),
      booke: <>{pastille(mobile ? 'Booké' : 'Booké, en attente du RDV GHL', 'text-[#047857] bg-[#ecfdf5]')}{annuler}</>,
      erreur: <>{pastille(erreur ?? 'Erreur', 'text-[#b91c1c] bg-[#fef2f2]')}{annuler}</>,
    }[etat]
    return (
      <div className={`flex items-center ${mobile ? 'justify-between' : 'justify-end'} gap-1.5`}>
        <span className="flex items-center gap-1.5">{contenu}</span>
        {!mobile && fiche}
      </div>
    )
  }

  const boutons = (
    <>
      <button onClick={() => actions.pasDeReponse(lead, note)}
        className={`text-[13px] font-semibold px-2.5 ${h} rounded-lg bg-white text-[#374151] border border-[#e5e7eb] whitespace-nowrap hover:bg-[#f9fafb]`}>
        Pas de réponse
      </button>
      <button onClick={() => actions.booke(lead)}
        className={`text-[13px] font-semibold px-3 ${h} rounded-lg bg-[#00bbb1] text-white border border-[#00bbb1] hover:bg-[#009e95]`}>
        Booké
      </button>
    </>
  )
  if (mobile) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[1fr_1fr_44px] gap-2">{boutons}{fiche}</div>
        {erreur && <p className="text-xs font-semibold text-[#b91c1c]">{erreur}</p>}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-end gap-1.5">
      {erreur && <span className="text-xs font-semibold text-[#b91c1c] whitespace-nowrap">{erreur}</span>}
      {boutons}{fiche}
    </div>
  )
}

function LigneLead({ lead, file, userId, locks, actions, now }) {
  const [note, setNote] = useState('')
  const etat = actions.etats[lead.key]
  const erreur = actions.erreurs[lead.key]
  const pris = verrouAutre(locks, lead.contactId, userId, now)
  const faites = tentativesFaites(lead, etat)
  const rdv = file.rdv(lead, now)
  const fond = pris ? '#f9fafb' : etat === 'booke' ? '#f6fdf9' : '#fcfcfd'
  const couleurNom = pris ? '#9ca3af' : '#1a1a1a'

  return (
    <>
      {/* Grand écran : une ligne du tableau */}
      <div className={`hidden xl:grid ${COLONNES} gap-2.5 items-center px-3.5 py-2 border-t border-[#f3f4f6]`} style={{ background: fond }}>
        <span className="text-sm font-semibold truncate" style={{ color: couleurNom }} title={lead.nom}>{lead.nom}</span>
        <div className="min-w-0"><PastilleSource source={lead.source} /></div>
        <span className="text-[13px] text-[#6b7280]">{fmtAge(lead.ageHeures)}</span>
        <Tentatives faites={faites} />
        <span className="text-[13px] font-semibold whitespace-nowrap truncate" style={{ color: rdv.couleur }} title={rdv.texte}>{rdv.texte}</span>
        <span className="text-[13px] text-[#1a1a1a] truncate" title={lead.closeur ?? ''}>{lead.closeur ?? '—'}</span>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Note courte"
          aria-label={`Note pour ${lead.nom}`}
          disabled={!!etat || !!pris}
          className="w-full text-xs px-2 py-1.5 border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[#00bbb1] disabled:bg-[#f9fafb]"
        />
        <Actions lead={lead} etat={etat} erreur={erreur} pris={pris} note={note} actions={actions} />
      </div>

      {/* Mobile et tablette : carte sur trois lignes */}
      <div className="xl:hidden px-3.5 py-3 border-t border-[#f3f4f6] flex flex-col gap-2" style={{ background: fond }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[15px] font-bold flex-1 min-w-0 truncate" style={{ color: couleurNom }}>{lead.nom}</span>
          <span className="max-w-[45%] flex-shrink-0"><PastilleSource source={lead.source} /></span>
          {faites != null && <span className="text-[11px] font-bold text-[#6b7280]">{faites}/4</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-[#6b7280]">
          <span className="font-semibold" style={{ color: rdv.couleur }}>{rdv.texte}</span>
          <span>·</span><span>{lead.closeur ?? '—'}</span>
          <span>·</span><span>{fmtAge(lead.ageHeures)}</span>
        </div>
        <Actions lead={lead} etat={etat} erreur={erreur} pris={pris} note={note} actions={actions} mobile />
      </div>
    </>
  )
}

// Une file (section) : en-tête, en-têtes de colonnes, lignes, état vide
export default function FileLeads({ file, leads, userId, locks, actions, now }) {
  const [toutVoir, setToutVoir] = useState(false)
  const [replie, setReplie] = useState(false)
  const ouverts = leads.filter(l => !['nr-attente', 'nr', 'booke'].includes(actions.etats[l.key])).length
  const limiteDesktop = toutVoir ? Infinity : LIMITE.desktop
  const limiteMobile = toutVoir ? Infinity : LIMITE.mobile

  return (
    <section className="bg-[#fcfcfd] border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden" aria-label={file.titre}>
      <div className={`flex items-center gap-2.5 px-4 py-3.5 flex-wrap ${replie ? '' : 'border-b border-[#f0f0f0]'}`}>
        <span className="w-2 h-2 rounded-full" style={{ background: file.couleur }} />
        <h2 className="text-[15px] font-bold text-[#1a1a1a]">{file.titre}</h2>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={ouverts ? { background: file.compteurBg, color: file.compteurColor } : { background: '#f3f4f6', color: '#6b7280' }}>
          {ouverts}
        </span>
        <span className="text-xs text-[#6b7280] hidden sm:inline">{file.sousTitre}</span>
        {file.repliable && (
          <button onClick={() => setReplie(r => !r)} aria-expanded={!replie}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-[#6b7280] px-2 py-1 rounded-lg hover:bg-[#f3f4f6] hover:text-[#1a1a1a]">
            {replie ? 'Afficher' : 'Replier'}
            <svg className={`w-3.5 h-3.5 transition-transform ${replie ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {replie ? null : leads.length === 0 ? (
        <div className="py-7 px-4 flex flex-col items-center gap-1 text-center">
          <div className="w-9 h-9 rounded-full bg-[#ecfdf5] flex items-center justify-center mb-1.5">
            <svg className="w-[18px] h-[18px] text-[#10b981]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-sm font-bold text-[#1a1a1a]">{file.videTitre}</p>
          <p className="text-[13px] text-[#6b7280]">{file.videTexte}</p>
        </div>
      ) : (
        <>
          <div className={`hidden xl:grid ${COLONNES} gap-2.5 px-3.5 py-2 text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide`}>
            <span>Lead</span><span>Source</span><span>Âge</span><span>Tentatives</span><span>{file.rdvLabel}</span>
            <span>Closeur</span><span>Note</span><span className="text-right">Actions</span>
          </div>
          {leads.map((lead, i) => (
            // Mobile : les 3 premiers, grand écran : les 10 premiers (tout après « Voir »)
            <div key={lead.key} className={i >= limiteDesktop ? 'hidden' : i >= limiteMobile ? 'hidden xl:block' : ''}>
              <LigneLead lead={lead} file={file} userId={userId} locks={locks} actions={actions} now={now} />
            </div>
          ))}
          {!toutVoir && leads.length > LIMITE.mobile && (
            <button onClick={() => setToutVoir(true)}
              className={`w-full px-3.5 py-3 border-t border-[#f3f4f6] text-[13px] font-semibold text-[#00bbb1] hover:bg-[#f9fafb] ${leads.length > LIMITE.desktop ? '' : 'xl:hidden'}`}>
              <span className="xl:hidden">Voir les {leads.length - LIMITE.mobile} autres</span>
              <span className="hidden xl:inline">Voir les {leads.length - LIMITE.desktop} autres</span>
            </button>
          )}
        </>
      )}
    </section>
  )
}
