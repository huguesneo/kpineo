import { useMemo, useState } from 'react'
import { fmtAge, styleSource } from '../../../lib/v2/format'
import { verrouAutre } from '../../../hooks/v2/useLeadLocks'
import { trierLeads, triSuivant, TRI_DEFAUT } from '../../../lib/v2/setterFiles'

const COLONNES = 'xl:grid-cols-[minmax(0,1.4fr)_96px_52px_78px_minmax(0,1fr)_96px_300px]'
const LIMITE = { desktop: 10, mobile: 3 }

const IconeExterne = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
  </svg>
)

// Tentatives faites (0 à 4) : pastilles + « n/4 ». null hors pipeline de tentatives.
function tentativesFaites(lead) {
  if (lead.tentative == null) return null
  return Math.min(4, Math.max(0, lead.tentative - 1))
}

// Nom du lead : ouvre sa fiche GoHighLevel (et prend le lead 15 min), 🔥 si chaud
function NomLead({ lead, couleur, actions, grand = false }) {
  return (
    <button
      onClick={() => actions.ouvrirFiche(lead)}
      title={`Ouvrir la fiche de ${lead.nom} dans GoHighLevel`}
      className={`flex items-center gap-1 min-w-0 text-left hover:underline underline-offset-2 ${grand ? 'text-[15px] font-bold flex-1' : 'text-sm font-semibold'}`}
      style={{ color: couleur }}
    >
      {lead.chaud && <span aria-label="Lead chaud" title="Chaud à relancer" className="flex-shrink-0">🔥</span>}
      <span className="truncate">{lead.nom}</span>
    </button>
  )
}

// En-tête de colonne triable (Âge, Tentatives) avec flèche du sens actif
function EnteteTri({ libelle, cle, tri, onTri }) {
  const actif = tri?.cle === cle
  const fleche = !actif ? '↕' : (tri.sens === 'vieux' || tri.sens === 'plus') ? '↓' : '↑'
  const aide = cle === 'age'
    ? (actif && tri.sens === 'vieux' ? 'Plus vieux d’abord (cliquer : plus jeunes d’abord)' : 'Trier du plus vieux au plus jeune')
    : (actif && tri.sens === 'plus' ? 'Le plus de tentatives d’abord (cliquer : le moins d’abord)' : 'Trier par nombre de tentatives')
  return (
    <button onClick={() => onTri(cle)} title={aide}
      className={`flex items-center gap-1 uppercase tracking-wide text-left hover:text-[#1a1a1a] ${actif ? 'text-[#4f46e5]' : ''}`}>
      {libelle}<span aria-hidden="true">{fleche}</span>
    </button>
  )
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
function Actions({ lead, etat, pris, actions, file, mobile = false }) {
  const fiche = (
    <button
      onClick={() => actions.ouvrirFiche(lead)}
      title="Fiche GHL"
      className={mobile
        ? 'h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#6b7280]'
        : 'inline-flex items-center gap-1 text-[13px] font-semibold text-[#6b7280] px-2 py-1.5 rounded-lg whitespace-nowrap hover:bg-[#f3f4f6] hover:text-[#1a1a1a]'}
    >
      {!mobile && 'Fiche GHL'}{IconeExterne}
    </button>
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

  if (etat === 'reservation') {
    return (
      <div className={`flex items-center ${mobile ? 'justify-between' : 'justify-end'} gap-1.5`}>
        <button onClick={() => actions.prendreRdv(lead)} title="Rouvrir le calendrier de réservation"
          className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap text-[#047857] bg-[#ecfdf5] hover:bg-[#d1fae5]">
          {mobile ? 'Rouvrir le calendrier' : 'En attente du RDV GHL · rouvrir'}
        </button>
        <button onClick={() => actions.annuler(lead)} className={`text-xs font-semibold text-[#6b7280] px-1 ${mobile ? 'min-h-[44px]' : 'py-1'}`}>
          Annuler
        </button>
        {!mobile && fiche}
      </div>
    )
  }

  // « À confirmer » : le RDV existe déjà, pas de prise de rendez-vous
  if (file.sansReservation) {
    return <div className={`flex items-center ${mobile ? '' : 'justify-end'}`}>{fiche}</div>
  }

  const prendre = (
    <button onClick={() => actions.prendreRdv(lead)}
      title="Ouvre la rencontre découverte dans l’app, avec le lead et ton nom de setter préremplis"
      className={`text-[13px] font-semibold px-3 ${mobile ? 'h-11 flex-1' : 'py-1.5'} rounded-lg bg-[#00bbb1] text-white border border-[#00bbb1] whitespace-nowrap hover:bg-[#009e95]`}>
      Prendre un rendez-vous
    </button>
  )
  return (
    <div className={`flex items-center ${mobile ? '' : 'justify-end'} gap-2`}>
      {prendre}{fiche}
    </div>
  )
}

function LigneLead({ lead, file, userId, locks, actions, now }) {
  const etat = actions.etats[lead.key]
  const pris = verrouAutre(locks, lead.contactId, userId, now)
  const faites = tentativesFaites(lead)
  const rdv = file.rdv(lead, now)
  const fond = pris ? '#f9fafb' : etat === 'reservation' ? '#f6fdf9' : '#fcfcfd'
  const couleurNom = pris ? '#9ca3af' : '#1a1a1a'

  return (
    <>
      {/* Grand écran : une ligne du tableau */}
      <div className={`hidden xl:grid ${COLONNES} gap-2.5 items-center px-3.5 py-2 border-t border-[#f3f4f6]`} style={{ background: fond }}>
        <NomLead lead={lead} couleur={couleurNom} actions={actions} />
        <div className="min-w-0"><PastilleSource source={lead.source} /></div>
        <span className="text-[13px] text-[#6b7280]">{fmtAge(lead.ageHeures)}</span>
        <Tentatives faites={faites} />
        <span className="text-[13px] font-semibold whitespace-nowrap truncate" style={{ color: rdv.couleur }} title={rdv.texte}>{rdv.texte}</span>
        <span className="text-[13px] text-[#1a1a1a] truncate" title={lead.closeur ?? ''}>{lead.closeur ?? '—'}</span>
        <Actions lead={lead} etat={etat} pris={pris} actions={actions} file={file} />
      </div>

      {/* Mobile et tablette : carte sur trois lignes */}
      <div className="xl:hidden px-3.5 py-3 border-t border-[#f3f4f6] flex flex-col gap-2" style={{ background: fond }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <NomLead lead={lead} couleur={couleurNom} actions={actions} grand />
          <span className="max-w-[45%] flex-shrink-0"><PastilleSource source={lead.source} /></span>
          {faites != null && <span className="text-[11px] font-bold text-[#6b7280]">{faites}/4</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-[#6b7280]">
          <span className="font-semibold" style={{ color: rdv.couleur }}>{rdv.texte}</span>
          <span>·</span><span>{lead.closeur ?? '—'}</span>
          <span>·</span><span>{fmtAge(lead.ageHeures)}</span>
        </div>
        <Actions lead={lead} etat={etat} pris={pris} actions={actions} file={file} mobile />
      </div>
    </>
  )
}

// Une file (section) : en-tête, en-têtes de colonnes, lignes, état vide
export default function FileLeads({ file, leads, userId, locks, actions, now }) {
  const [toutVoir, setToutVoir] = useState(false)
  const [replie, setReplie] = useState(false)
  // Tri : âge (plus vieux d'abord) par défaut ; null = ordre de la file (ex. heure du RDV)
  const [tri, setTri] = useState(file.triInitial === undefined ? TRI_DEFAUT : file.triInitial)
  const changerTri = cle => setTri(t => triSuivant(t, cle))
  const tries = useMemo(() => (tri ? trierLeads(leads, tri) : leads), [leads, tri])
  const ouverts = leads.filter(l => actions.etats[l.key] !== 'reservation').length
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
        {/* Tri sur mobile et tablette (pas d'en-têtes de colonnes) */}
        {!replie && leads.length > 1 && (
          <span className="xl:hidden flex items-center gap-2 text-[11px] font-bold text-[#9ca3af] w-full sm:w-auto">
            Trier :
            <EnteteTri libelle="Âge" cle="age" tri={tri} onTri={changerTri} />
            <EnteteTri libelle="Tentatives" cle="tentatives" tri={tri} onTri={changerTri} />
          </span>
        )}
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
            <span>Lead</span><span>Source</span>
            <EnteteTri libelle="Âge" cle="age" tri={tri} onTri={changerTri} />
            <EnteteTri libelle="Tentatives" cle="tentatives" tri={tri} onTri={changerTri} />
            <span>{file.rdvLabel}</span>
            <span>Closeur</span><span className="text-right">Actions</span>
          </div>
          {tries.map((lead, i) => (
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
