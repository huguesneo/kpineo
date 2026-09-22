import { Link } from 'react-router-dom'
import { fmtHeure, fmtDuree, fmtRdvRelatif, prenom, styleSource } from '../../../lib/v2/format'
import { typeRdv, infosSetting } from '../../../lib/v2/closerAgenda'
import { lienFicheGHL } from '../../../lib/v2/salesConfig'

function dureeMinutes(a) {
  const d = a.end_time ? (new Date(a.end_time) - new Date(a.start_time)) / 60_000 : null
  return d && d > 0 ? Math.round(d) : null
}

// Grande carte « Prochain RDV » : heure, prospect, setter, Portrait Léo, liens
export default function ProchainRdv({ appt, opps, now }) {
  if (!appt) {
    return (
      <section className="bg-[#fcfcfd] border border-[#e5e7eb] rounded-xl shadow-sm p-6 flex flex-col gap-2">
        <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide">Prochain RDV</p>
        <p className="text-sm text-[#6b7280]">Aucun RDV à venir dans les 7 prochains jours.</p>
      </section>
    )
  }
  const debut = new Date(appt.start_time).getTime()
  const ecart = debut - now
  const pastille = ecart > 0
    ? (ecart < 24 * 3_600_000 ? `Dans ${fmtDuree(ecart)}` : fmtRdvRelatif(appt.start_time, now))
    : 'En cours'
  const { setter, source } = infosSetting(opps, appt.contact_id)
  const src = styleSource(source)
  const duree = dureeMinutes(appt)
  const confirme = appt.status === 'confirmed'

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
          <p className="text-[22px] font-extrabold truncate">{appt.contact_name || 'Sans nom'}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {source && <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: src.bg, color: src.color }}>{source}</span>}
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${confirme ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#f3f4f6] text-[#4b5563]'}`}>
              {confirme ? 'Confirmé' : 'Pas encore confirmé'}
            </span>
          </div>
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
