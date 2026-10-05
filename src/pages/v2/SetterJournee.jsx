import { useEffect, useMemo, useState } from 'react'
import EnteteEspace from '../../components/v2/EnteteEspace'
import Replie from '../../components/v2/Replie'
import BandeauJour from '../../components/v2/setter/BandeauJour'
import FileLeads from '../../components/v2/setter/FileLeads'
import FiltresAConfirmer from '../../components/v2/setter/FiltresAConfirmer'
import ModalPriseRdv from '../../components/v2/setter/ModalPriseRdv'
import SetterDashboardView from '../../components/closer/SetterDashboardView'
import SetterEODForm from '../../components/eod/SetterEODForm'
import { useLeadLocks } from '../../hooks/v2/useLeadLocks'
import { useSetterDayStats } from '../../hooks/v2/useSetterDayStats'
import { useSetterActions } from '../../hooks/v2/useSetterActions'
import { useConfirmation } from '../../hooks/v2/useConfirmation'
import { useAppelsRecents } from '../../hooks/v2/useAppelsRecents'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../../hooks/usePayPeriod'
import { rdvBookesAujourdhui, jourMontreal, aConfirmerAFaire } from '../../lib/v2/setterFiles'
import { enrichirAConfirmer, filtrerAConfirmer, FILTRES_DEFAUT } from '../../lib/v2/confirmation'
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
    cle: 'aConfirmer', titre: 'À confirmer', sousTitre: 'Étape ✅ Lead rencontre book, par heure du RDV',
    couleur: '#f59e0b', compteurBg: '#fffbeb', compteurColor: '#b45309', rdvLabel: 'RDV',
    videTitre: 'Aucun lead booké', videTexte: 'Aucune carte à l’étape « ✅ Lead rencontre book ».',
    triInitial: null, // par heure du RDV
    confirmation: true, // colonnes Confirmation, Appel, Setter ; « Confirmer la rencontre »
    rdv: (l, now) => (l.rdvAVenir
      ? { texte: fmtRdvRelatif(l.rdvRef?.start, now), couleur: '#1a1a1a' }
      : { texte: l.rdvRef ? `Passé · ${fmtRdvRelatif(l.rdvRef.start, now)}` : 'Aucun RDV à venir', couleur: '#9ca3af' }),
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

  // File « À confirmer » : état affiché (clic récent), appels depuis la réservation, filtres
  const aConfirmerSource = files.aConfirmer
  const confirmation = useConfirmation({ appointmentIds: aConfirmerSource.map(l => l.rdvRef?.ghlId) })
  const depuisAppels = useMemo(() => {
    const dates = aConfirmerSource.map(l => l.rdvRef?.dateAjout ?? l.changementEtape).filter(Boolean).map(d => new Date(d).getTime())
    return dates.length ? new Date(Math.min(...dates)).toISOString() : null
  }, [aConfirmerSource])
  const { appels, erreur: appelsErreur } = useAppelsRecents({ contactIds: aConfirmerSource.map(l => l.contactId), depuis: depuisAppels })
  const [filtres, setFiltres] = useState(FILTRES_DEFAUT)
  const aConfirmer = useMemo(
    () => enrichirAConfirmer(aConfirmerSource, { locaux: confirmation.locaux, appels: appelsErreur ? null : appels, now }),
    [aConfirmerSource, confirmation.locaux, appels, appelsErreur, now],
  )
  const aConfirmerFiltres = useMemo(() => filtrerAConfirmer(aConfirmer, filtres), [aConfirmer, filtres])
  const filtresActifs = filtres.confirmation !== 'tous' || filtres.appel !== 'tous'
  const nbAConfirmer = aConfirmerAFaire(aConfirmer).length

  const enAttente = FILES.reduce((n, f) => n + (f.cle === 'aConfirmer'
    ? nbAConfirmer
    : files[f.cle].filter(l => !actions.etats[l.key]).length), 0)
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

      <BandeauJour stats={stats} rdvBookes={rdvBookes} aConfirmer={nbAConfirmer} nouveaux={files.nouveauxLeads} />

      <ModalPriseRdv lead={actions.rdvEnCours} cleSetter={actions.cleSetter} onClose={actions.fermerRdv} />

      {!actions.cleSetter && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] text-sm text-[#92400e]">
          Ton prénom n'est pas dans la liste des setters du Centre de vente : à la prise de rendez-vous,
          il faudra choisir à qui l'attribuer. Demande à un admin de t'ajouter à la liste.
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
          : FILES.map(f => (f.confirmation ? (
            <FileLeads key={f.cle}
              file={filtresActifs ? { ...f, videTitre: 'Aucun lead pour ces filtres', videTexte: 'Change les filtres pour voir les autres leads bookés.' } : f}
              leads={aConfirmerFiltres} userId={profile?.id} locks={locks} actions={actions} now={now}
              confirmation={{ ...confirmation, appelsErreur }} compteur={nbAConfirmer}
              barre={aConfirmer.length > 0 && (
                <FiltresAConfirmer filtres={filtres} onChange={setFiltres} appelsIndisponibles={appelsErreur} />
              )} />
          ) : (
            <FileLeads key={f.cle} file={f} leads={files[f.cle]} userId={profile?.id}
              locks={locks} actions={actions} now={now} />
          )))}

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
