import { useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmerRencontre, { PastilleConfirmation, COULEURS_NOM } from '../ConfirmerRencontre'
import { fmtHeure, fmtDuree, fmtRdvRelatif, prenom, styleSource } from '../../../lib/v2/format'
import { typeRdv, infosSetting, estAujourdhui } from '../../../lib/v2/closerAgenda'
import { lienFicheGHL } from '../../../lib/v2/salesConfig'

function dureeMinutes(a) {
  const d = a.end_time ? (new Date(a.end_time) - new Date(a.start_time)) / 60_000 : null
  return d && d > 0 ? Math.round(d) : null
}

// Nom du prospect : cliquable quand la rencontre se confirme (découverte à venir),
// vert si confirmée, ambre sinon ; le clic ouvre « Confirmer manuellement ».
function NomConfirmable({ appt, etat, ouvert, onBasculer, className }) {
  const nom = appt.contact_name || 'Sans nom'
  if (!etat) return <span className={className}>{nom}</span>
  return (
    <button onClick={onBasculer} aria-expanded={ouvert}
      title={etat === 'nonConfirme' ? 'Confirmer manuellement' : undefined}
      className={`${className} text-left hover:underline underline-offset-2`} style={{ color: COULEURS_NOM[etat] }}>
      {nom}
    </button>
  )
}

function PanneauConfirmation({ appt, etat, conf, now }) {
  return (
    <ConfirmerRencontre gauche libelle="Confirmer manuellement"
      nom={appt.contact_name} debut={appt.start_time} now={now} etat={etat}
      manuelle={conf.manuelles[appt.ghl_id] ?? null} enCours={conf.enCours[appt.ghl_id] ?? null}
      erreur={conf.erreurs[appt.ghl_id] ?? null}
      onConfirmer={() => conf.confirmer(appt.ghl_id)} onAnnuler={() => conf.annuler(appt.ghl_id)} />
  )
}

// Grande carte « Prochain RDV » : heure, prospect, setter, Portrait Léo, liens.
// Seulement pour un RDV d'aujourd'hui : un RDV de demain affiché en gros
// (« 9 h 30 ») se lisait comme un RDV du jour.
// Confirmé ou non : carte Vente du contact (confirmations), jamais le statut du RDV
// GHL, qui vaut « confirmed » dès la réservation.
export default function ProchainRdv({ appt, opps, now, confirmations = null }) {
  const [ouvert, setOuvert] = useState(false)
  if (!appt) {
    return (
      <section className="bg-[#fcfcfd] border border-[#e5e7eb] rounded-xl shadow-sm p-6 flex flex-col gap-2">
        <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide">Prochain RDV</p>
        <p className="text-sm text-[#6b7280]">Aucun RDV à venir dans les 7 prochains jours.</p>
      </section>
    )
  }
  const etat = confirmations?.etatDe(appt) ?? null
  const conf = confirmations?.confirmation
  const basculer = () => setOuvert(o => !o)

  if (!estAujourdhui(appt.start_time, now)) {
    return (
      <section className="bg-[#fcfcfd] border border-[#e5e7eb] rounded-xl shadow-sm p-6 flex flex-col gap-3">
        <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide">Prochain RDV</p>
        <p className="text-lg font-extrabold text-[#1a1a1a]">Aucun RDV aujourd'hui</p>
        <p className="text-sm text-[#6b7280]">
          Prochain : <span className="font-bold text-[#1a1a1a]">{fmtRdvRelatif(appt.start_time, now)}</span>
          {' '}avec <NomConfirmable appt={appt} etat={etat} ouvert={ouvert} onBasculer={basculer} className="font-semibold text-[#1a1a1a]" />
          {' '}· {typeRdv(appt)}
          {etat && <> <PastilleConfirmation etat={etat} className="ml-1 align-middle" /></>}
        </p>
        {etat && ouvert && conf && <PanneauConfirmation appt={appt} etat={etat} conf={conf} now={now} />}
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/sale-call-script/${appt.ghl_id}`}
            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white text-[#374151] border border-[#e5e7eb] text-[13px] font-semibold hover:bg-[#f9fafb] hover:text-[#374151]">
            Préparer : ouvrir le script
          </Link>
          {appt.contact_id && (
            <a href={lienFicheGHL(appt.contact_id)} target="_blank" rel="noreferrer"
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-[#4b5563] text-[13px] font-semibold hover:bg-[#f3f4f6] hover:text-[#1a1a1a]">
              Fiche GHL
            </a>
          )}
        </div>
      </section>
    )
  }

  const debut = new Date(appt.start_time).getTime()
  const ecart = debut - now
  // RDV d'aujourd'hui : « Dans 22 min », « Dans 3 h 10 » ou « En cours »
  const pastille = ecart > 0 ? `Dans ${fmtDuree(ecart)}` : 'En cours'
  const { setter, source } = infosSetting(opps, appt.contact_id)
  const src = styleSource(source)
  const duree = dureeMinutes(appt)

  return (
    <section className="bg-[#fcfcfd] border border-[#e5e7eb] rounded-xl shadow-sm p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide">Prochain RDV</p>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#00bbb1]/10 text-[#00897f]">{pastille}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
        <div className="flex-shrink-0">
          <p className="text-[44px] font-black leading-none tracking-tight">{fmtHeure(appt.start_time)}</p>
          <p className="mt-1.5 text-xs font-semibold text-[#6b7280]">{typeRdv(appt)}{duree ? `, ${duree} min` : ''}</p>
        </div>
        <div className="flex-1 min-w-0 sm:border-l sm:border-[#e5e7eb] sm:pl-6 flex flex-col gap-2">
          <NomConfirmable appt={appt} etat={etat} ouvert={ouvert} onBasculer={basculer} className="text-[22px] font-extrabold truncate block max-w-full" />
          <div className="flex items-center gap-2 flex-wrap">
            {source && <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: src.bg, color: src.color }}>{source}</span>}
            <PastilleConfirmation etat={etat} />
          </div>
          {etat && ouvert && conf && <PanneauConfirmation appt={appt} etat={etat} conf={conf} now={now} />}
          <p className="text-[13px] text-[#6b7280]">
            {setter
              ? <>Bookée par <span className="font-semibold text-[#6366f1]">{prenom(setter)}</span></>
              : 'Setter inconnu'}
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 flex flex-col gap-1.5">
        <p className="text-xs font-bold text-[#1a1a1a]">Portrait Léo</p>
        <p className="text-[13px] text-[#9ca3af]">Bientôt disponible</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {appt.meeting_url && (
          <a href={appt.meeting_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00bbb1] text-white text-sm font-semibold hover:bg-[#009e95] hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>
            Rejoindre Meet
          </a>
        )}
        <Link to={`/sale-call-script/${appt.ghl_id}`}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-white text-[#374151] border border-[#e5e7eb] text-sm font-semibold hover:bg-[#f9fafb] hover:text-[#374151]">
          Ouvrir le script
        </Link>
        {appt.contact_id && (
          <a href={lienFicheGHL(appt.contact_id)} target="_blank" rel="noreferrer"
            className="inline-flex items-center px-3 py-2 rounded-lg text-[#4b5563] text-sm font-semibold hover:bg-[#f3f4f6] hover:text-[#1a1a1a]">
            Fiche GHL
          </a>
        )}
      </div>
    </section>
  )
}
