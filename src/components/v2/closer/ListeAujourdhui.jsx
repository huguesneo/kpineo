import { useState } from 'react'
import { fmtHeure, fmtDuree } from '../../../lib/v2/format'
import StatuerRdv from './StatuerRdv'

const ETATS = {
  aVenir:   { label: 'À venir',  bg: '#f3f4f6', color: '#4b5563' },
  prochain: { label: 'Prochain', bg: 'rgba(0,187,177,0.12)', color: '#00897f' },
  enCours:  { label: 'En cours', bg: 'rgba(0,187,177,0.12)', color: '#00897f' },
  show:     { label: 'Show',     bg: '#ecfdf5', color: '#047857' },
  noshow:   { label: 'No-show',  bg: '#fef2f2', color: '#b91c1c' },
  annule:   { label: 'Annulé',   bg: '#f3f4f6', color: '#9ca3af' },
}

// Liste du jour : RDV à statuer épinglés (fond ambre) puis les autres par heure.
// Une ligne sans statut peut être statuée en cliquant sur son badge.
export default function ListeAujourdhui({ jour, now, onStatuer }) {
  const [ouvert, setOuvert] = useState(null)
  const total = jour.epingles.length + jour.lignes.length

  return (
    <section className="bg-[#fcfcfd] border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[#f0f0f0]">
        <h2 className="text-[15px] font-bold">Aujourd'hui</h2>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#f3f4f6] text-[#4b5563]">{total} RDV</span>
      </div>

      {total === 0 && <p className="px-4 py-6 text-sm text-[#6b7280] text-center">Aucun RDV aujourd'hui.</p>}

      {jour.epingles.map(({ appt, depuisMs }) => (
        <div key={appt.ghl_id} className="px-4 py-3 bg-[#fffbeb] border-b border-[#fde68a] flex flex-col gap-2.5">
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="text-[13px] font-bold w-14 flex-shrink-0">{fmtHeure(appt.start_time)}</span>
            <span className="text-sm font-semibold flex-1 min-w-0 truncate">{appt.contact_name || 'Sans nom'}</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f59e0b] text-white whitespace-nowrap">À statuer, {fmtDuree(depuisMs)}</span>
          </div>
          <div className="sm:pl-[68px]"><StatuerRdv appt={appt} onStatuer={onStatuer} /></div>
        </div>
      ))}

      {jour.lignes.map(({ appt, etat }) => {
        const e = ETATS[etat] ?? ETATS.aVenir
        const muet = etat === 'annule'
        const statuable = ['aVenir', 'prochain', 'enCours'].includes(etat) && new Date(appt.start_time).getTime() <= now
        return (
          <div key={appt.ghl_id} className="border-b border-[#f3f4f6]" style={{ background: etat === 'prochain' ? 'rgba(0,187,177,0.05)' : '#fcfcfd' }}>
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[13px] font-bold w-14 flex-shrink-0" style={{ color: muet ? '#9ca3af' : '#1a1a1a' }}>{fmtHeure(appt.start_time)}</span>
              <span className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: muet ? '#9ca3af' : '#1a1a1a' }}>{appt.contact_name || 'Sans nom'}</span>
              <button
                disabled={!statuable}
                onClick={() => setOuvert(o => o === appt.ghl_id ? null : appt.ghl_id)}
                title={statuable ? 'Statuer ce RDV' : undefined}
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap disabled:cursor-default"
                style={{ background: e.bg, color: e.color }}>
                {e.label}
              </button>
            </div>
            {ouvert === appt.ghl_id && (
              <div className="px-4 pb-3 sm:pl-[84px]"><StatuerRdv appt={appt} onStatuer={onStatuer} /></div>
            )}
          </div>
        )
      })}
    </section>
  )
}
