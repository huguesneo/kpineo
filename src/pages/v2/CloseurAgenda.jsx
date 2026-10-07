import { useState } from 'react'
import EnteteEspace from '../../components/v2/EnteteEspace'
import ProchainRdv from '../../components/v2/closer/ProchainRdv'
import ListeAujourdhui from '../../components/v2/closer/ListeAujourdhui'
import MesDecisions from '../../components/v2/closer/MesDecisions'
import CloserSemaine from '../../components/v2/closer/CloserSemaine'
import CloserDashboardView from '../../components/closer/CloserDashboardView'
import ObjectionsPanel from '../../components/closer/ObjectionsPanel'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../../hooks/usePayPeriod'

const ONGLETS = ["Aujourd'hui", 'Semaine', 'Mon mois']

// Onglet « Mon mois » : CloserDashboardView existant, tel quel, + objections
function MonMois({ profile, today }) {
  const monthStart = `${today.slice(0, 7)}-01`
  const [periodType, setPeriodType] = useState('month')
  const [customStart, setCustomStart] = useState(monthStart)
  const [customEnd, setCustomEnd] = useState(today)
  const { config: payConfig } = usePayPeriodConfig()
  const payPeriod = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null
  const startDate = periodType === 'paie' ? (payPeriod?.start || monthStart)
    : periodType === 'month' ? monthStart : (customStart || monthStart)
  const endDate = periodType === 'paie' ? (payPeriod?.end || today)
    : periodType === 'month' ? today : (customEnd || today)

  return (
    <div className="flex flex-col gap-6">
      <CloserDashboardView
        closerProfile={profile}
        isAdmin={false}
        startDate={startDate}
        endDate={endDate}
        periodType={periodType}
        onSetPeriod={setPeriodType}
        customStart={customStart}
        onCustomStart={setCustomStart}
        customEnd={customEnd}
        onCustomEnd={setCustomEnd}
        payPeriodLabel={null}
      />
      <ObjectionsPanel startDate={startDate} endDate={endDate} />
    </div>
  )
}

// Écran closeur « Mon agenda et mes deals » (maquette 02). Rendu dans MonEspace,
// qui fournit le Layout, le commutateur (`droite`) et les données (useCloserAgenda).
export default function CloseurAgenda({ profile, droite = null, agenda }) {
  const [onglet, setOnglet] = useState(0)

  return (
    <div>
      <EnteteEspace profile={profile} droite={droite} />

      <div role="tablist" className="flex gap-1 border-b border-[#e5e7eb] mb-6 overflow-x-auto">
        {ONGLETS.map((o, i) => (
          <button key={o} role="tab" aria-selected={onglet === i} onClick={() => setOnglet(i)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              onglet === i ? 'border-[#00bbb1] text-[#00bbb1]' : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'}`}>
            {o}
          </button>
        ))}
      </div>

      {onglet === 0 && (
        agenda.loading && agenda.appointments.length === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
            <div className="lg:col-span-7 h-72 bg-white border border-[#e5e7eb] rounded-xl animate-pulse" />
            <div className="lg:col-span-5 h-72 bg-white border border-[#e5e7eb] rounded-xl animate-pulse" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6 items-start">
              <div className="lg:col-span-7"><ProchainRdv appt={agenda.prochain} opps={agenda.opps} now={agenda.now} confirmations={agenda.confirmations} /></div>
              <div className="lg:col-span-5"><ListeAujourdhui jour={agenda.jour} now={agenda.now} onStatuer={agenda.statuer} confirmations={agenda.confirmations} /></div>
            </div>
            <MesDecisions decisions={agenda.decisions} profile={profile} now={agenda.now} />
          </>
        )
      )}
      {onglet === 1 && <CloserSemaine profile={profile} />}
      {onglet === 2 && <MonMois profile={profile} today={agenda.today} />}
    </div>
  )
}
