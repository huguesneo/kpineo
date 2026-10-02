import { useEffect, useMemo, useState } from 'react'
import EnteteEspace from '../../components/v2/EnteteEspace'
import Replie from '../../components/v2/Replie'
import BandeauJour from '../../components/v2/setter/BandeauJour'
import FileLeads from '../../components/v2/setter/FileLeads'
import SetterDashboardView from '../../components/closer/SetterDashboardView'
import SetterEODForm from '../../components/eod/SetterEODForm'
import { useLeadLocks } from '../../hooks/v2/useLeadLocks'
import { useSetterDayStats } from '../../hooks/v2/useSetterDayStats'
import { useSetterActions } from '../../hooks/v2/useSetterActions'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../../hooks/usePayPeriod'
import { rdvBookesAujourdhui, jourMontreal } from '../../lib/v2/setterFiles'
import { fmtCAD, fmtRdvRelatif } from '../../lib/v2/format'

function sansEmoji(s) {
  return String(s ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim()
}

// Les files : nouveaux leads (🔥 chauds en tête), leads à rappeler, rebookings,
// confirmations, puis « Contact établi » (repliable). Tri par défaut : âge,
// du plus vieux au plus jeune ; Âge et Tentatives se cliquent.
const FILES = [
  {
    cle: 'nouveauxLeads', titre: 'Nouveaux leads', sousTitre: '🔥 Chauds à relancer en tête, puis les nouveaux leads',
    couleur: '#6366f1', compteurBg: 'rgba(99,102,241,0.1)', compteurColor: '#4f46e5', rdvLabel: 'Statut',
    videTitre: 'File vide', videTexte: 'Aucun nouveau lead pour le moment.',
    rdv: l => ({ texte: l.chaud ? 'Chaud à relancer' : 'Nouveau', couleur: l.chaud ? '#c2410c' : '#1a1a1a' }),
  },
  {
    cle: 'aRappeler', titre: 'Leads à rappeler', sousTitre: '1 à 4 tentatives faites',
    couleur: '#8b5cf6', compteurBg: '#f5f3ff', compteurColor: '#6d28d9', rdvLabel: 'Statut',
    videTitre: 'Aucun rappel', videTexte: 'Personne à rappeler pour le moment.',
    rdv: l => ({
      texte: l.tentative >= 5 ? 'Dernière tentative' : sansEmoji(l.etape) || '—',
      couleur: l.tentative >= 4 ? '#b45309' : '#1a1a1a',
    }),
  },
  {
    cle: 'aRebooker', titre: 'À rebooker', sousTitre: 'No-shows et annulations des 72 dernières heures',
    couleur: '#ef4444', compteurBg: '#fef2f2', compteurColor: '#b91c1c', rdvLabel: 'RDV manqué',
    videTitre: 'Aucun rebooking en attente', videTexte: 'Tous les no-shows des 72 dernières heures ont un nouveau RDV.',
    rdv: (l, now) => ({
      texte: `${l.rdvRef?.status === 'noshow' ? 'No-show' : 'Annulé'} ${fmtRdvRelatif(l.rdvRef?.start, now).replace(/^Auj\. /, 'auj. ').replace(/^Hier /, 'hier ')}`,
      couleur: '#dc2626',
    }),
  },
  {
    cle: 'aConfirmer', titre: 'À confirmer', sousTitre: 'RDV des prochaines 24 h, par heure',
    couleur: '#f59e0b', compteurBg: '#fffbeb', compteurColor: '#b45309', rdvLabel: 'RDV',
    videTitre: 'Tout est confirmé', videTexte: 'Les RDV des prochaines 24 h sont confirmés.',
    triInitial: null, // par heure du RDV ; Âge et Tentatives restent cliquables
    sansReservation: true, // le RDV existe déjà : seulement la fiche GHL
    rdv: (l, now) => ({ texte: fmtRdvRelatif(l.rdvRef?.start, now), couleur: '#1a1a1a' }),
  },
  {
    cle: 'contactEtabli', titre: 'Contact établi', sousTitre: 'Étape 💬 Contact établi',
    couleur: '#0ea5e9', compteurBg: '#f0f9ff', compteurColor: '#0369a1', rdvLabel: 'Dernier changement',
    videTitre: 'Aucun contact établi en attente', videTexte: 'Personne à relancer à cette étape.',
    repliable: true,
    rdv: (l, now) => ({ texte: l.changementEtape ? fmtRdvRelatif(l.changementEtape, now) : '—', couleur: '#1a1a1a' }),
  },
]

const IconeDollar = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconeRapport = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

// Écran setter « Ma journée » (maquette 01). Rendu dans MonEspace, qui fournit
// le Layout, le commutateur de mode (`droite`) et les files (useSetterFiles),
// chargées là-haut pour alimenter aussi le compteur du commutateur.
export default function SetterJournee({ profile, droite = null, setterFiles, onCompteur }) {
  const { files, raw, loading, error, refetch } = setterFiles
  const { locks, lock, unlock } = useLeadLocks(profile?.id)
  const stats = useSetterDayStats(profile)
  const actions = useSetterActions({ profile, lock, unlock })

  // Horloge : âges, « pris depuis X min »
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(iv)
  }, [])

  const rdvBookes = useMemo(
    () => rdvBookesAujourdhui({ appts: raw.appts, opps: raw.opps, setterName: profile?.full_name, now }),
    [raw, profile?.full_name, now],
  )

  const enAttente = FILES.reduce((n, f) => n + files[f.cle].filter(l => !actions.etats[l.key]).length, 0)
  useEffect(() => { onCompteur?.(enAttente) }, [enAttente, onCompteur])

  const today = jourMontreal(new Date(now))
  const monthStart = `${today.slice(0, 7)}-01`
  const [periodType, setPeriodType] = useState('month')
  const [customStart, setCustomStart] = useState(monthStart)
  const [customEnd, setCustomEnd] = useState(today)
  // Même logique de période que la page Setter existante
  const { config: payConfig } = usePayPeriodConfig()
  const payPeriod = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null
  const startDate = periodType === 'paie' ? (payPeriod?.start || monthStart)
    : periodType === 'month' ? monthStart : (customStart || monthStart)
  const endDate = periodType === 'paie' ? (payPeriod?.end || today)
    : periodType === 'month' ? today : (customEnd || today)

  return (
    <div>
      <EnteteEspace profile={profile} droite={droite} />

      <BandeauJour stats={stats} rdvBookes={rdvBookes} aConfirmer={files.aConfirmer.length} nouveaux={files.nouveauxLeads} />

      {!actions.cleSetter && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] text-sm text-[#92400e]">
          Ton prénom n'est pas dans la liste des setters du Centre de vente : un rendez-vous pris ici
          ne te serait pas attribué (pas de show-up payé). Demande à un admin de t'ajouter avant de booker.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] text-sm text-[#b91c1c]">
          Impossible de charger les files : {error}
          <button onClick={refetch} className="ml-3 font-semibold underline">Réessayer</button>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {loading
          ? FILES.map(f => <div key={f.cle} className="h-32 bg-white border border-[#e5e7eb] rounded-xl animate-pulse" />)
          : FILES.map(f => (
            <FileLeads key={f.cle} file={f} leads={files[f.cle]} userId={profile?.id}
              locks={locks} actions={actions} now={now} />
          ))}

        <div className="flex flex-col gap-2 mt-1">
          <Replie
            icone={IconeDollar}
            titre="Mes commissions du mois"
            extra={<span className="text-[13px] font-bold text-[#6366f1] ml-1">{stats.commissionLoading ? '…' : fmtCAD(stats.commission)}</span>}
          >
            <SetterDashboardView
              setterProfile={profile}
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
          </Replie>
          <Replie icone={IconeRapport} titre="Rapport End of Day">
            <SetterEODForm userId={profile?.id} />
          </Replie>
        </div>
      </div>
    </div>
  )
}
